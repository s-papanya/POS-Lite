import assert from "node:assert/strict";
import { it } from "vitest";
import * as contracts from "@pos-lite/validation";

it("requires an explicit positive supplemental amount, reason and unique receiving accounts",()=>{
  const schema=contracts.supplementalSaleRequestSchema;
  const accountId="00000000-0000-4000-8000-000000000001";
  const input={businessDate:"2026-10-25",occurredAt:"2026-10-25T00:00:00Z",amount:"10000",reason:"ยอดขายที่ยังไม่ได้ลงบิล",
    payments:[{accountId,channel:"CASH",amount:"10000",tendered:"10000"}]};
  assert.equal(schema.safeParse(input).success,true);
  for(const bad of [{...input,amount:"0"},{...input,amount:"1.5"},{...input,amount:"9000000000001"},
    {...input,reason:" "},{...input,items:[]},{...input,discount:{kind:"FIXED",amount:"0"}},
    {...input,payments:[...input.payments,...input.payments]},{...input,payments:[]}]) assert.equal(schema.safeParse(bad).success,false);
});
