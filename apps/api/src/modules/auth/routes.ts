import { Router } from "express";
import { parseCookie, stringifySetCookie } from "cookie";
import { z } from "zod";
import { loginRequestSchema } from "@pos-lite/validation";
import { AuthError, type AuthService } from "./service.js";

export function authRouter(service: AuthService) {
  const router = Router();
  const name = service.config.production ? "__Host-session" : "pos_lite_session";
  const cookie = (value: string, maxAge: number) => stringifySetCookie({ name,value,path:"/",httpOnly:true,
    secure:service.config.production,sameSite:"lax",maxAge });
  router.use(async (req,res,next) => {
    try {
      const path = req.path;
      const storeDetail = /^\/stores\/[^/]+$/.test(path);
      if (!["/auth/csrf","/auth/login","/auth/logout","/auth/password","/me","/stores"].includes(path) && !storeDetail) { next(); return; }
      const token = parseCookie(req.headers.cookie ?? "")[name];
      const session = await service.resolve(token);
      if (req.method === "POST") {
        if (req.get("Origin") !== service.config.origin) throw new AuthError(403,"ORIGIN_INVALID");
        service.requireCsrf(session,req.get("X-CSRF-Token"));
      }
      if (path === "/auth/csrf" && req.method === "GET") {
        if (session && token) { res.json({data:{csrfToken:service.csrf(token)}}); return; }
        await service.limit([{label:"csrf-ip",value:req.ip ?? "unknown",max:30}]);
        const issued = await service.issue(service.pool);
        res.setHeader("Set-Cookie",cookie(issued.token,900));
        res.json({data:{csrfToken:issued.csrfToken}}); return;
      }
      if (path === "/auth/login" && req.method === "POST") {
        const input = loginRequestSchema.safeParse(req.body);
        if (!input.success) throw new AuthError(400,"INVALID_REQUEST");
        const issued = await service.login(session!,input.data.username,input.data.password,input.data.businessId,
          req.ip ?? "unknown",String(res.getHeader("X-Request-Id")));
        res.setHeader("Set-Cookie",cookie(issued.token,604800));
        res.json({data:{csrfToken:issued.csrfToken}}); return;
      }
      if (path === "/auth/logout" && req.method === "POST") {
        await service.logout(session!,String(res.getHeader("X-Request-Id")));
        res.setHeader("Set-Cookie",cookie("",0)); res.json({data:{loggedOut:true}}); return;
      }
      if (!session?.user_id) throw new AuthError(401,"AUTH_REQUIRED");
      if (path === "/auth/password" && req.method === "POST") {
        const input = z.strictObject({currentPassword:z.string().min(1).max(128),newPassword:z.string().min(12).max(128)}).safeParse(req.body);
        if (!input.success) throw new AuthError(400,"INVALID_REQUEST");
        const issued = await service.changePassword(session,input.data.currentPassword,input.data.newPassword,String(res.getHeader("X-Request-Id")));
        res.setHeader("Set-Cookie",cookie(issued.token,604800)); res.json({data:{csrfToken:issued.csrfToken}}); return;
      }
      if (req.method !== "GET") { next(); return; }
      await service.touch(session);
      const stores = await service.stores(session);
      if (path === "/me") {
        res.json({data:{user:{id:session.user_id,username:session.username},business:{id:session.business_id,name:session.business_name},
          businessRole:session.role === "OWNER" ? "OWNER" : null,stores}}); return;
      }
      if (path === "/stores") { res.json({data:stores,page:{nextCursor:null}}); return; }
      if (storeDetail) {
        const id = path.slice("/stores/".length);
        if (!z.uuid().safeParse(id).success) throw new AuthError(400,"INVALID_REQUEST");
        const store = stores.find((s) => s.id === id);
        if (!store) throw new AuthError(404,"RESOURCE_NOT_FOUND");
        res.json({data:store}); return;
      }
      next();
    } catch (error) {
      if (!(error instanceof AuthError)) { next(error); return; }
      if (error.retryAfter) res.setHeader("Retry-After",error.retryAfter);
      req.log.warn({errorCode:error.code,requestId:res.getHeader("X-Request-Id")},"Access request rejected");
      res.status(error.status).json({error:{code:error.code,message:"ไม่สามารถดำเนินการได้ กรุณาตรวจสอบข้อมูลหรือเข้าสู่ระบบอีกครั้ง",requestId:String(res.getHeader("X-Request-Id"))}});
    }
  });
  return router;
}
