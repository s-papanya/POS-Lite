import { Router } from "express";
import { parseCookie } from "cookie";
import { z } from "zod";
import { accountOpeningSchema, createAccountSchema, updateAccountSchema } from "@pos-lite/validation";
import { AuthError, type AuthService } from "../auth/service.js";
import { AccountsService } from "./service.js";

const idSchema=z.uuid().transform((id)=>id.toLowerCase());
const listSchema=z.strictObject({limit:z.string().regex(/^[0-9]{1,3}$/).default("30").transform(Number).pipe(z.number().int().min(1).max(100)),cursor:idSchema.optional()});
export function accountsRouter(auth:AuthService) {
  const router=Router(); const service=new AccountsService(auth.pool);
  router.all(["/accounts","/accounts/:accountId","/accounts/:accountId/opening","/stores/:storeId/accounts"],async(req,res,next)=>{
    try {
      const session=await auth.resolve(parseCookie(req.headers.cookie ?? "")[auth.config.production ? "__Host-session" : "pos_lite_session"]);
      if(!session?.user_id || !session.business_id) throw new AuthError(401,"AUTH_REQUIRED");
      const actor={...session,user_id:session.user_id,business_id:session.business_id};
      await auth.touch(session);
      if(req.method==="GET" && req.params.storeId) {
        const storeId=idSchema.parse(req.params.storeId); const query=listSchema.parse(req.query);
        if(!(await auth.stores(session)).some((s)=>s.id===storeId)) throw new AuthError(404,"RESOURCE_NOT_FOUND");
        res.json(await service.list(actor,storeId,query.limit,query.cursor)); return;
      }
      const opening=req.path.endsWith("/opening");
      const createsAccount=req.method==="POST" && !req.params.accountId;
      const opensAccount=req.method==="POST" && !!req.params.accountId && opening;
      const updatesAccount=req.method==="PATCH" && !!req.params.accountId && !opening;
      if(req.params.storeId || !(createsAccount || opensAccount || updatesAccount)) {next();return;}
      if(req.get("Origin")!==auth.config.origin) throw new AuthError(403,"ORIGIN_INVALID");
      auth.requireCsrf(session,req.get("X-CSRF-Token"));
      const key=idSchema.parse(req.get("Idempotency-Key")); const requestId=String(res.getHeader("X-Request-Id"));
      const result=createsAccount ? await service.create(actor,key,createAccountSchema.parse(req.body),requestId)
        : opensAccount ? await service.opening(actor,idSchema.parse(req.params.accountId),key,accountOpeningSchema.parse(req.body),requestId)
        : await service.update(actor,idSchema.parse(req.params.accountId),key,updateAccountSchema.parse(req.body),requestId);
      res.status(result.status).json(result.body);
    } catch(error) {
      let failure:unknown=error;
      if(error instanceof z.ZodError) failure=new AuthError(400,"INVALID_REQUEST");
      if(typeof error==="object" && error!==null && "constraint" in error && error.constraint==="financial_accounts_name_uq") failure=new AuthError(409,"ACCOUNT_NAME_TAKEN");
      if(!(failure instanceof AuthError)) {next(failure);return;}
      res.status(failure.status).json({error:{code:failure.code,message:"ไม่สามารถจัดการบัญชีได้ กรุณาตรวจสอบข้อมูลและสิทธิ์อีกครั้ง",requestId:String(res.getHeader("X-Request-Id"))}});
    }
  });
  return router;
}
