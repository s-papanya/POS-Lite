import { Router } from "express";
import { parseCookie } from "cookie";
import { z } from "zod";
import { ownerTransactionRequestSchema } from "@pos-lite/validation";
import { AuthError, type AuthService } from "../auth/service.js";
import { OwnerTransactionsService } from "./service.js";

const id=z.uuid().transform(v=>v.toLowerCase());
export function ownerTransactionsRouter(auth:AuthService) {
  const router=Router();const service=new OwnerTransactionsService(auth.pool);
  router.post("/stores/:storeId/owner-transactions",async(req,res,next)=>{
    try {
      const session=await auth.resolve(parseCookie(req.headers.cookie ?? "")[auth.config.production ? "__Host-session" : "pos_lite_session"]);
      if(!session?.user_id || !session.business_id) throw new AuthError(401,"AUTH_REQUIRED");
      await auth.touch(session);const actor={...session,user_id:session.user_id,business_id:session.business_id};
      z.strictObject({}).parse(req.query);
      if(req.get("Origin")!==auth.config.origin) throw new AuthError(403,"ORIGIN_INVALID");
      auth.requireCsrf(session,req.get("X-CSRF-Token"));
      const expectedUser=req.get("X-Expected-User-Id");const expectedBusiness=req.get("X-Expected-Business-Id");
      if((expectedUser || expectedBusiness) && (expectedUser!==actor.user_id || expectedBusiness!==actor.business_id)) throw new AuthError(403,"SESSION_CONTEXT_CHANGED");
      const result=await service.create(actor,id.parse(req.params.storeId),id.parse(req.get("Idempotency-Key")),ownerTransactionRequestSchema.parse(req.body),String(res.getHeader("X-Request-Id")));
      res.status(result.status).json(result.body);
    } catch(error) {
      const failure=error instanceof z.ZodError ? new AuthError(400,"INVALID_REQUEST") : error;
      if(!(failure instanceof AuthError)) {next(failure);return;}
      res.status(failure.status).json({error:{code:failure.code,message:"ไม่สามารถบันทึกเงินเจ้าของได้ กรุณาตรวจสอบข้อมูล สิทธิ์ และเงินคงเหลือ",requestId:String(res.getHeader("X-Request-Id"))}});
    }
  });return router;
}
