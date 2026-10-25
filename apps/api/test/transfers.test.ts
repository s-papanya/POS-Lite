import { expect, it } from "vitest";
import { transferRequestSchema } from "@pos-lite/validation";

it("normalizes zero fee and forbids self transfers, signed amounts and authority fields",()=>{
  const input={sourceStoreId:"11111111-1111-4111-8111-111111111111",destinationStoreId:"11111111-1111-4111-8111-111111111111",
    sourceAccountId:"22222222-2222-4222-8222-222222222222",destinationAccountId:"33333333-3333-4333-8333-333333333333",
    businessDate:"2026-10-26",occurredAt:"2026-10-26T01:00:00Z",amount:"100000",reason:" ฝากธนาคาร "};
  expect(transferRequestSchema.parse(input)).toMatchObject({feeAmount:"0",reason:"ฝากธนาคาร"});
  for(const invalid of [{...input,destinationAccountId:input.sourceAccountId.toUpperCase()},{...input,amount:"0"},{...input,amount:"-1"},
    {...input,feeAmount:"-1"},{...input,feeAmount:"1.5"},{...input,feeCategoryId:input.sourceStoreId}]) expect(transferRequestSchema.safeParse(invalid).success).toBe(false);
});
