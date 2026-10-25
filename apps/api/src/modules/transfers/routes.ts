import { Router } from "express";
import { parseCookie } from "cookie";
import { z } from "zod";
import { transferRequestSchema } from "@pos-lite/validation";
import { AuthError, type AuthService } from "../auth/service.js";
import { TransfersService } from "./service.js";

export function transfersRouter(auth:AuthService) {
  const router=Router();const service=new TransfersService(auth.pool);
  router.post("/account-transfers",async(req,res,next)=>{
    try {
      const session=await auth.resolve(parseCookie(req.headers.cookie ?? "")[auth.config.production ? "__Host-session" : "pos_lite_session"]);
      if(!session?.user_id || !session.business_id) throw new AuthError(401,"AUTH_REQUIRED");
      await auth.touch(session);const actor={...session,user_id:session.user_id,business_id:session.business_id};
      z.strictObject({}).parse(req.query);
      if(req.get("Origin")!==auth.config.origin) throw new AuthError(403,"ORIGIN_INVALID");
      auth.requireCsrf(session,req.get("X-CSRF-Token"));
      const expectedUser=req.get("X-Expected-User-Id");const expectedBusiness=req.get("X-Expected-Business-Id");
      if((expectedUser || expectedBusiness) && (expectedUser!==actor.user_id || expectedBusiness!==actor.business_id)) throw new AuthError(403,"SESSION_CONTEXT_CHANGED");
      const result=await service.create(actor,z.uuid().parse(req.get("Idempotency-Key")),transferRequestSchema.parse(req.body),String(res.getHeader("X-Request-Id")));
      res.status(result.status).json(result.body);
    } catch(error) {
      const failure=error instanceof z.ZodError ? new AuthError(400,"INVALID_REQUEST") : error;
      if(!(failure instanceof AuthError)) {next(failure);return;}
      res.status(failure.status).json({error:{code:failure.code,message:failure.code==="FEE_CATEGORY_REQUIRED" ? "ให้เจ้าของสร้างหมวดรายจ่ายชื่อ ค่าธรรมเนียม ก่อนบันทึกค่าธรรมเนียมโอน" : "ไม่สามารถโอนเงินได้ กรุณาตรวจสอบบัญชี สิทธิ์ วันทำการ และเงินคงเหลือ",requestId:String(res.getHeader("X-Request-Id"))}});
    }
  });return router;
}
