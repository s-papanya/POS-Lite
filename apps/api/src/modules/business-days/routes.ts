import { Router } from "express";
import { parseCookie } from "cookie";
import { z } from "zod";
import { businessDateSchema, openBusinessDaySchema } from "@pos-lite/validation";
import { AuthError, type AuthService } from "../auth/service.js";
import { BusinessDaysService } from "./service.js";

const id=z.uuid().transform((value)=>value.toLowerCase());
export function businessDaysRouter(auth:AuthService) {
  const router=Router(); const service=new BusinessDaysService(auth.pool);
  router.all(["/stores/:storeId/business-days","/stores/:storeId/business-days/:date"],async(req,res,next)=>{
    try {
      if(!((req.method==="GET" && req.params.date) || (req.method==="POST" && !req.params.date))) {next();return;}
      const session=await auth.resolve(parseCookie(req.headers.cookie ?? "")[auth.config.production ? "__Host-session" : "pos_lite_session"]);
      if(!session?.user_id || !session.business_id) throw new AuthError(401,"AUTH_REQUIRED");
      const actor={...session,user_id:session.user_id,business_id:session.business_id};
      const storeId=id.parse(req.params.storeId);
      z.strictObject({}).parse(req.query);
      await auth.touch(session);
      if(req.method==="GET") {res.json(await service.get(actor,storeId,businessDateSchema.parse(req.params.date)));return;}
      if(req.get("Origin")!==auth.config.origin) throw new AuthError(403,"ORIGIN_INVALID");
      auth.requireCsrf(session,req.get("X-CSRF-Token"));
      const result=await service.open(actor,storeId,id.parse(req.get("Idempotency-Key")),openBusinessDaySchema.parse(req.body),String(res.getHeader("X-Request-Id")));
      res.status(result.status).json(result.body);
    } catch(error) {
      const failure=error instanceof z.ZodError ? new AuthError(400,"INVALID_REQUEST") : error;
      if(!(failure instanceof AuthError)) {next(failure);return;}
      res.status(failure.status).json({error:{code:failure.code,message:"ไม่สามารถเปิดหรืออ่านวันทำการได้ กรุณาตรวจสอบวันที่ บัญชี และสิทธิ์",requestId:String(res.getHeader("X-Request-Id"))}});
    }
  });
  return router;
}
