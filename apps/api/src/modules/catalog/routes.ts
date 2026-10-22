import { Router } from "express";
import { parseCookie } from "cookie";
import { z } from "zod";
import { createProductSchema, updateProductSchema } from "@pos-lite/validation";
import { AuthError, type AuthService } from "../auth/service.js";
import { CatalogError, CatalogService } from "./service.js";

const cursorSchema=z.strictObject({id:z.uuid(),name:z.string().min(1).max(120),storeId:z.uuid(),active:z.boolean()});
const querySchema=z.strictObject({limit:z.string().regex(/^[1-9][0-9]?0?$/).default("30").transform(Number).pipe(z.number().int().min(1).max(100)),
  active:z.enum(["true","false"]).default("true").transform((v)=>v==="true"),cursor:z.string().regex(/^[A-Za-z0-9_-]+$/).max(1024).optional()});
export function catalogRouter(auth:AuthService) {
  const router=Router(); const service=new CatalogService(auth.pool);
  router.all(["/stores/:storeId/products","/stores/:storeId/products/:productId"],async(req,res,next) => {
    try {
      const storeId=z.uuid().parse(req.params.storeId);
      const session=await auth.resolve(parseCookie(req.headers.cookie ?? "")[auth.config.production ? "__Host-session" : "pos_lite_session"]);
      if (!session?.user_id || !session.business_id) throw new AuthError(401,"AUTH_REQUIRED");
      await auth.touch(session);
      const context={...session,user_id:session.user_id,business_id:session.business_id};
      if (req.method === "GET" && !req.params.productId) {
        const query=querySchema.parse(req.query);
        let cursor:z.infer<typeof cursorSchema> | undefined;
        if(query.cursor) {
          try { cursor=cursorSchema.parse(JSON.parse(Buffer.from(query.cursor,"base64url").toString("utf8"))); }
          catch { throw new CatalogError(400,"INVALID_REQUEST"); }
        }
        res.json(await service.list(context,storeId,query.limit,query.active,cursor)); return;
      }
      if (!((req.method === "POST" && !req.params.productId) || (req.method === "PATCH" && req.params.productId))) { next(); return; }
      if (req.get("Origin") !== auth.config.origin) throw new AuthError(403,"ORIGIN_INVALID");
      auth.requireCsrf(session,req.get("X-CSRF-Token"));
      const key=z.uuid().parse(req.get("Idempotency-Key")); const requestId=String(res.getHeader("X-Request-Id"));
      const result=req.method === "POST" ? await service.create(context,storeId,key,createProductSchema.parse(req.body),requestId)
        : await service.update(context,storeId,z.uuid().parse(req.params.productId),key,updateProductSchema.parse(req.body),requestId);
      res.status(result.status).json(result.body);
    } catch (error) {
      const failure=error instanceof z.ZodError ? new CatalogError(400,"INVALID_REQUEST") : error;
      if (!(failure instanceof CatalogError) && !(failure instanceof AuthError)) { next(failure); return; }
      res.status(failure.status).json({error:{code:failure.code,message:"ไม่สามารถจัดการเมนูได้ กรุณาตรวจสอบข้อมูลและสิทธิ์อีกครั้ง",
        requestId:String(res.getHeader("X-Request-Id")),...(failure instanceof CatalogError && failure.details ? {details:failure.details} : {})}});
    }
  });
  return router;
}
