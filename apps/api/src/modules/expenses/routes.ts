import { Router } from "express";
import { parseCookie } from "cookie";
import { z } from "zod";
import { businessDateSchema, expenseRequestSchema, expensePaymentRequestSchema } from "@pos-lite/validation";
import { AuthError, type AuthService } from "../auth/service.js";
import { ExpensesService } from "./service.js";

const id=z.uuid().transform(v=>v.toLowerCase());
const filters={from:businessDateSchema,to:businessDateSchema,status:z.enum(["ALL","PAID","UNPAID"]).default("ALL")};
const querySchema=z.strictObject({...filters,limit:z.string().regex(/^[0-9]{1,3}$/).default("30").transform(Number).pipe(z.number().int().min(1).max(100)),
  cursor:z.string().min(1).max(2048).regex(/^[A-Za-z0-9_-]+$/).optional()}).refine(v=>v.from<=v.to && (Date.parse(v.to)-Date.parse(v.from))/86400000<366);
const cursorSchema=z.strictObject({...filters,businessId:id,storeId:id,id,occurredAt:z.iso.datetime({offset:true})});
export function expensesRouter(auth:AuthService) {
  const router=Router();const service=new ExpensesService(auth.pool);
  router.all(["/stores/:storeId/expenses","/stores/:storeId/expenses/:expenseId/payments"],async(req,res,next)=>{
    try {
      if(!(req.method==="POST" || (req.method==="GET" && !req.params.expenseId))) {next();return;}
      const session=await auth.resolve(parseCookie(req.headers.cookie ?? "")[auth.config.production ? "__Host-session" : "pos_lite_session"]);
      if(!session?.user_id || !session.business_id) throw new AuthError(401,"AUTH_REQUIRED");
      await auth.touch(session);const actor={...session,user_id:session.user_id,business_id:session.business_id};const storeId=id.parse(req.params.storeId);
      if(req.method==="GET") {
        const query=querySchema.parse(req.query);let cursor;
        if(query.cursor) {try {cursor=cursorSchema.parse(JSON.parse(Buffer.from(query.cursor,"base64url").toString("utf8")));} catch {throw new AuthError(400,"INVALID_CURSOR");}}
        res.json(await service.list(actor,storeId,query,cursor));return;
      }
      z.strictObject({}).parse(req.query);
      if(req.get("Origin")!==auth.config.origin) throw new AuthError(403,"ORIGIN_INVALID");
      auth.requireCsrf(session,req.get("X-CSRF-Token"));
      const expectedUser=req.get("X-Expected-User-Id");const expectedBusiness=req.get("X-Expected-Business-Id");
      if((expectedUser || expectedBusiness) && (expectedUser!==actor.user_id || expectedBusiness!==actor.business_id)) throw new AuthError(403,"SESSION_CONTEXT_CHANGED");
      const key=id.parse(req.get("Idempotency-Key"));const requestId=String(res.getHeader("X-Request-Id"));
      const result=req.params.expenseId ? await service.pay(actor,storeId,id.parse(req.params.expenseId),key,expensePaymentRequestSchema.parse(req.body),requestId)
        : await service.create(actor,storeId,key,expenseRequestSchema.parse(req.body),requestId);
      res.status(result.status).json(result.body);
    } catch(error) {
      const failure=error instanceof z.ZodError ? new AuthError(400,"INVALID_REQUEST") : error;
      if(!(failure instanceof AuthError)) {next(failure);return;}
      res.status(failure.status).json({error:{code:failure.code,message:"ไม่สามารถบันทึกหรืออ่านรายจ่ายได้ กรุณาตรวจสอบข้อมูล สิทธิ์ และเงินคงเหลือ",requestId:String(res.getHeader("X-Request-Id"))}});
    }
  });return router;
}
