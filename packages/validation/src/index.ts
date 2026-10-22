import type { ApiErrorResponse, HealthResponse } from "@pos-lite/shared";
import { z } from "zod";

export const healthResponseSchema: z.ZodType<HealthResponse> = z.strictObject({
  data: z.strictObject({
    status: z.literal("ok"),
    service: z.literal("family-store-manager-api"),
  }),
});

export const apiErrorResponseSchema: z.ZodType<ApiErrorResponse> = z.strictObject({
  error: z.strictObject({
    code: z.string().min(1),
    message: z.string().min(1),
    requestId: z.uuid(),
  }),
});
