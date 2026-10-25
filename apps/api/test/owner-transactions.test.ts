import { expect, it } from "vitest";
import { ownerTransactionRequestSchema } from "@pos-lite/validation";

it("requires a positive satang amount and explicit owner flow without accepting authority or delta",()=>{
  const input={businessDate:"2026-10-26",occurredAt:"2026-10-26T01:00:00Z",accountId:"11111111-1111-4111-8111-111111111111",kind:"CONTRIBUTION",amount:"100000",note:" เติมทุน "};
  expect(ownerTransactionRequestSchema.parse(input).note).toBe("เติมทุน");
  expect(ownerTransactionRequestSchema.parse({...input,kind:"WITHDRAWAL"}).amount).toBe("100000");
  for(const invalid of [{...input,amount:"-1"},{...input,amount:"0"},{...input,amount:"1.5"},{...input,kind:"SALE"},{...input,note:" "},{...input,delta:"1"},{...input,businessId:input.accountId}])
    expect(ownerTransactionRequestSchema.safeParse(invalid).success).toBe(false);
});
