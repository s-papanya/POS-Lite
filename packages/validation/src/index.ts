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
export const positiveMoneySchema = z.string().regex(/^[1-9][0-9]{0,12}$/)
  .pipe(z.string().refine((value) => BigInt(value) <= 9000000000000n));
export const nonnegativeMoneySchema = z.union([z.literal("0"),positiveMoneySchema]);
export const createAccountSchema = z.strictObject({name:z.string().trim().min(1).max(120),type:z.enum(["CASH","BANK"]),
  storeIds:z.array(z.uuid().transform((id)=>id.toLowerCase())).min(1).max(100).transform((ids)=>ids.sort())})
  .refine((v)=>new Set(v.storeIds).size===v.storeIds.length && (v.type!=="CASH" || v.storeIds.length===1));
export const updateAccountSchema = z.strictObject({name:z.string().trim().min(1).max(120).optional(),active:z.boolean().optional()})
  .refine((v)=>v.name!==undefined || v.active!==undefined);
export const accountOpeningSchema = z.strictObject({storeId:z.uuid().transform((id)=>id.toLowerCase()),amount:nonnegativeMoneySchema,
  cutoverAt:z.iso.datetime({offset:true}).transform((v)=>new Date(v).toISOString()),reason:z.string().trim().min(1).max(1000)});
export const accountSchema = z.strictObject({id:z.uuid(),name:z.string(),type:z.enum(["CASH","BANK"]),active:z.boolean(),storeIds:z.array(z.uuid())});
export const accountResponseSchema = z.strictObject({data:accountSchema});
export const accountOpeningResponseSchema = z.strictObject({data:z.strictObject({id:z.uuid(),accountId:z.uuid(),storeId:z.uuid(),
  amount:nonnegativeMoneySchema,cutoverAt:z.iso.datetime({offset:true}),reason:z.string()})});
export const accountListResponseSchema = z.strictObject({data:z.array(z.strictObject({id:z.uuid(),name:z.string(),type:z.enum(["CASH","BANK"])})),
  page:z.strictObject({nextCursor:z.string().nullable()})});
export const createProductSchema = z.strictObject({name:z.string().trim().min(1).max(120),price:positiveMoneySchema});
export const updateProductSchema = z.strictObject({name:z.string().trim().min(1).max(120).optional(),
  price:positiveMoneySchema.optional(),active:z.boolean().optional(),expectedVersion:z.number().int().min(1).max(2147483646)})
  .refine((value) => value.name !== undefined || value.price !== undefined || value.active !== undefined);
export const productSchema = z.strictObject({id:z.uuid(),name:z.string().min(1).max(120),price:positiveMoneySchema,
  version:z.number().int().positive(),active:z.boolean()});
export const productResponseSchema = z.strictObject({data:productSchema});
export const productListResponseSchema = z.strictObject({data:z.array(productSchema),page:z.strictObject({nextCursor:z.string().nullable()})});

export const apiErrorResponseSchema: z.ZodType<ApiErrorResponse> = z.strictObject({
  error: z.strictObject({
    code: z.string().min(1),
    message: z.string().min(1),
    requestId: z.uuid(),
    details: z.record(z.string(),z.unknown()).optional(),
  }),
});
export const businessDateSchema = z.iso.date().refine((v)=>v>="0001-01-01");
const resourceIdSchema=z.uuid().transform((v)=>v.toLowerCase());
export const saleRequestSchema=z.strictObject({businessDate:businessDateSchema,
  occurredAt:z.iso.datetime({offset:true}).refine((v)=>new Date(v).getUTCFullYear()>=1 && new Date(v).getUTCFullYear()<=9999).transform((v)=>new Date(v).toISOString()),
  items:z.array(z.strictObject({productId:resourceIdSchema,expectedVersion:z.number().int().min(1).max(2147483647),quantity:z.number().int().min(1).max(999)})).min(1).max(100),
  discount:z.discriminatedUnion("kind",[z.strictObject({kind:z.literal("FIXED"),amount:nonnegativeMoneySchema}),
    z.strictObject({kind:z.literal("PERCENT"),basisPoints:z.number().int().min(0).max(10000)})]),
  payments:z.array(z.discriminatedUnion("channel",[
    z.strictObject({accountId:resourceIdSchema,channel:z.literal("CASH"),amount:positiveMoneySchema,tendered:positiveMoneySchema}),
    z.strictObject({accountId:resourceIdSchema,channel:z.literal("TRANSFER"),amount:positiveMoneySchema})])).min(1).max(100)})
  .refine((v)=>new Set(v.items.map((i)=>i.productId)).size===v.items.length && new Set(v.payments.map((p)=>p.accountId)).size===v.payments.length);
export type SaleRequest = z.infer<typeof saleRequestSchema>;
export const saleSchema=z.strictObject({id:z.uuid(),reference:z.string(),kind:z.literal("POS"),businessDate:businessDateSchema,
  occurredAt:z.iso.datetime({offset:true}),gross:positiveMoneySchema,discount:nonnegativeMoneySchema,net:positiveMoneySchema,
  dayRevision:z.string().regex(/^[0-9]+$/),items:z.array(z.strictObject({productId:z.uuid(),nameSnapshot:z.string(),unitPrice:positiveMoneySchema,
    productVersion:z.number().int().positive(),quantity:z.number().int().min(1).max(999),lineTotal:positiveMoneySchema})),
  payments:z.array(z.strictObject({id:z.uuid(),accountId:z.uuid(),channel:z.enum(["CASH","TRANSFER"]),amount:positiveMoneySchema,
    tendered:nonnegativeMoneySchema.nullable(),change:nonnegativeMoneySchema.nullable()}))});
export const saleResponseSchema=z.strictObject({data:saleSchema});
export const saleListResponseSchema=z.strictObject({data:z.array(saleSchema),page:z.strictObject({nextCursor:z.string().nullable()})});
export const openBusinessDaySchema = z.strictObject({businessDate:businessDateSchema});
export const businessDayResponseSchema = z.strictObject({data:z.strictObject({id:z.uuid(),businessDate:businessDateSchema,
  state:z.enum(["OPEN","CLOSED"]),revision:z.string().regex(/^[0-9]+$/),
  openingSnapshots:z.array(z.strictObject({accountId:z.uuid(),amount:nonnegativeMoneySchema})).optional()})});
