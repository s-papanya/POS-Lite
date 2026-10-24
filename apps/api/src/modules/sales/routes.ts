import { Router } from "express";
import { parseCookie } from "cookie";
import { z } from "zod";
import { businessDateSchema, saleRequestSchema, supplementalSaleRequestSchema, reconciliationPreviewRequestSchema, reconciliationRequestSchema } from "@pos-lite/validation";
import { AuthError, type AuthService } from "../auth/service.js";
import { CatalogError } from "../catalog/service.js";
import { SalesService } from "./service.js";
import { ReconciliationService } from "../reconciliation/service.js";

const id=z.uuid().transform((v)=>v.toLowerCase());
const history=z.strictObject({from:businessDateSchema,to:businessDateSchema,
  limit:z.string().regex(/^[0-9]{1,3}$/).default("30").transform(Number).pipe(z.number().int().min(1).max(100)),
  cursor:z.string().min(1).max(2048).regex(/^[A-Za-z0-9_-]+$/).optional()})
  .refine((v)=>v.from<=v.to && (Date.parse(v.to)-Date.parse(v.from))/86400000<366);
const cursorSchema=z.strictObject({storeId:id,from:businessDateSchema,to:businessDateSchema,
  occurredAt:z.iso.datetime({offset:true}),id});
export function salesRouter(auth:AuthService) {
  const router=Router(); const service=new SalesService(auth.pool); const reconciliation=new ReconciliationService(auth.pool);
  router.all(["/stores/:storeId/sales","/stores/:storeId/sales/:saleId","/stores/:storeId/supplemental-sales",
    "/stores/:storeId/sales-reconciliations","/stores/:storeId/sales-reconciliations/preview"],async(req,res,next)=>{
    try {
      const supplemental=req.path.endsWith("/supplemental-sales");
      const reconcile=req.path.includes("/sales-reconciliations");
      if((supplemental || reconcile) && req.method!=="POST") {next();return;}
      if(req.method!=="GET" && !(req.method==="POST" && !req.params.saleId)) {next();return;}
      const session=await auth.resolve(parseCookie(req.headers.cookie ?? "")[auth.config.production ? "__Host-session" : "pos_lite_session"]);
      if(!session?.user_id || !session.business_id) throw new AuthError(401,"AUTH_REQUIRED");
      const actor={...session,user_id:session.user_id,business_id:session.business_id}; const storeId=id.parse(req.params.storeId);
      await auth.touch(session);
      if(req.method==="GET") {
        if(req.params.saleId) {z.strictObject({}).parse(req.query);res.json(await service.get(actor,storeId,id.parse(req.params.saleId)));return;}
        const query=history.parse(req.query); let cursor;
        if(query.cursor) {
          try {cursor=cursorSchema.parse(JSON.parse(Buffer.from(query.cursor,"base64url").toString("utf8")));}
          catch {throw new AuthError(400,"INVALID_CURSOR");}
        }
        res.json(await service.list(actor,storeId,query,cursor));return;
      }
      z.strictObject({}).parse(req.query);
      if(req.get("Origin")!==auth.config.origin) throw new AuthError(403,"ORIGIN_INVALID");
      auth.requireCsrf(session,req.get("X-CSRF-Token"));
      const expectedUser=req.get("X-Expected-User-Id"); const expectedBusiness=req.get("X-Expected-Business-Id");
      if((expectedUser || expectedBusiness) && (expectedUser!==actor.user_id || expectedBusiness!==actor.business_id)) throw new AuthError(403,"SESSION_CONTEXT_CHANGED");
      if(reconcile) {
        if(req.path.endsWith("/preview")) {res.json(await reconciliation.preview(actor,storeId,reconciliationPreviewRequestSchema.parse(req.body)));return;}
        const result=await reconciliation.confirm(actor,storeId,id.parse(req.get("Idempotency-Key")),reconciliationRequestSchema.parse(req.body),String(res.getHeader("X-Request-Id")));
        res.status(result.status).json(result.body);return;
      }
      const input=supplemental ? supplementalSaleRequestSchema.parse(req.body) : saleRequestSchema.parse(req.body);
      const result=await service.create(actor,storeId,id.parse(req.get("Idempotency-Key")),input,String(res.getHeader("X-Request-Id")));
      res.status(result.status).json(result.body);
    } catch(error) {
      const failure=error instanceof z.ZodError ? new AuthError(400,"INVALID_REQUEST") : error;
      if(!(failure instanceof AuthError || failure instanceof CatalogError)) {next(failure);return;}
      res.status(failure.status).json({error:{code:failure.code,message:"ไม่สามารถบันทึกหรืออ่านบิลได้ กรุณาตรวจสอบรายการ ราคา และการชำระเงิน",
        requestId:String(res.getHeader("X-Request-Id")),...(failure instanceof CatalogError && failure.details ? {details:failure.details} : {})}});
    }
  });
  return router;
}
