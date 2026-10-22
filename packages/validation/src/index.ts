import type { ApiErrorResponse, HealthResponse, MeResponse, CsrfResponse } from "@pos-lite/shared";
import { z } from "zod";

export const healthResponseSchema: z.ZodType<HealthResponse> = z.strictObject({
  data: z.strictObject({
    status: z.literal("ok"),
    service: z.literal("family-store-manager-api"),
  }),
});

export const csrfResponseSchema: z.ZodType<CsrfResponse> = z.strictObject({
  data: z.strictObject({ csrfToken: z.string().regex(/^[a-f0-9]{64}$/) }),
});
export const accessibleStoreSchema = z.strictObject({ id:z.uuid(),name:z.string(),code:z.string(),role:z.enum(["OWNER","MANAGER","STAFF"]) });
export const storeResponseSchema = z.strictObject({data:accessibleStoreSchema});
export const storeListResponseSchema = z.strictObject({data:z.array(accessibleStoreSchema),page:z.strictObject({nextCursor:z.null()})});
export const logoutResponseSchema = z.strictObject({data:z.strictObject({loggedOut:z.literal(true)})});
export const meResponseSchema: z.ZodType<MeResponse> = z.strictObject({data:z.strictObject({
  user:z.strictObject({id:z.uuid(),username:z.string()}),business:z.strictObject({id:z.uuid(),name:z.string()}),
  businessRole:z.literal("OWNER").nullable(),stores:z.array(accessibleStoreSchema),
})});
export const loginRequestSchema = z.strictObject({username:z.string().min(3).max(64),password:z.string().min(1).max(128),businessId:z.uuid().optional()});

export const apiErrorResponseSchema: z.ZodType<ApiErrorResponse> = z.strictObject({
  error: z.strictObject({
    code: z.string().min(1),
    message: z.string().min(1),
    requestId: z.uuid(),
  }),
});
