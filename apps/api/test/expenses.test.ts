import { expect, it } from "vitest";
import { expenseRequestSchema, expensePaymentRequestSchema } from "@pos-lite/validation";

it("accepts unpaid or full account payment without trusting client payment amounts",()=>{
  const input={businessDate:"2026-10-25",occurredAt:"2026-10-25T01:00:00Z",categoryId:"11111111-1111-4111-8111-111111111111",amount:"60000",description:" วัตถุดิบ "};
  expect(expenseRequestSchema.parse(input).description).toBe("วัตถุดิบ");
  expect(expenseRequestSchema.parse({...input,payment:{accountId:input.categoryId}}).amount).toBe("60000");
  for(const invalid of [{...input,amount:"0"},{...input,amount:"1.5"},{...input,payment:{accountId:input.categoryId,amount:"1"}},{...input,businessId:input.categoryId}])
    expect(expenseRequestSchema.safeParse(invalid).success).toBe(false);
  expect(expensePaymentRequestSchema.safeParse({businessDate:input.businessDate,occurredAt:input.occurredAt,accountId:input.categoryId,amount:"1"}).success).toBe(false);
});
