import { Router } from "express";
import { parseCookie } from "cookie";
import { z } from "zod";
import { createExpenseCategorySchema } from "@pos-lite/validation";
import { AuthError, type AuthService } from "../auth/service.js";
import { ExpenseCategoriesService, type CategoryCursor } from "./categories.service.js";

const querySchema=z.strictObject({limit:z.string().regex(/^[1-9][0-9]*$/).default("30").transform(Number).pipe(z.number().int().min(1).max(100)),
  cursor:z.string().regex(/^[A-Za-z0-9_-]+$/).max(2048).optional()});
const cursorSchema=z.strictObject({businessId:z.uuid(),name:z.string().min(1).max(120),id:z.uuid()});
export function expenseCategoriesRouter(auth:AuthService) {
  const router=Router(); const service=new ExpenseCategoriesService(auth.pool);
  router.all("/expense-categories",async(req,res,next)=>{
    try {
      if (req.method!=="GET" && req.method!=="POST") {next();return;}
      const session=await auth.resolve(parseCookie(req.headers.cookie ?? "")[auth.config.production ? "__Host-session" : "pos_lite_session"]);
      if (!session?.user_id || !session.business_id) throw new AuthError(401,"AUTH_REQUIRED");
      await auth.touch(session);
      const actor={...session,user_id:session.user_id,business_id:session.business_id};
      if (req.method==="GET") {
        const query=querySchema.parse(req.query); let cursor:CategoryCursor | undefined;
        if (query.cursor) {
          try {cursor=cursorSchema.parse(JSON.parse(Buffer.from(query.cursor,"base64url").toString("utf8")));}
          catch {throw new AuthError(400,"INVALID_REQUEST");}
        }
        res.json(await service.list(actor,query.limit,cursor));return;
      }
      if (req.get("Origin")!==auth.config.origin) throw new AuthError(403,"ORIGIN_INVALID");
      auth.requireCsrf(session,req.get("X-CSRF-Token"));
      const result=await service.create(actor,z.uuid().parse(req.get("Idempotency-Key")),createExpenseCategorySchema.parse(req.body),String(res.getHeader("X-Request-Id")));
      res.status(result.status).json(result.body);
    } catch (error) {
      const failure=error instanceof z.ZodError ? new AuthError(400,"INVALID_REQUEST") : error;
      if (!(failure instanceof AuthError)) {next(failure);return;}
      res.status(failure.status).json({error:{code:failure.code,message:"ไม่สามารถจัดการหมวดรายจ่ายได้ กรุณาตรวจสอบข้อมูลและสิทธิ์อีกครั้ง",requestId:String(res.getHeader("X-Request-Id"))}});
    }
  });
  return router;
}
