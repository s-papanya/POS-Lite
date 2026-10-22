import { expect, it } from "vitest";
import { accountOpeningSchema, createAccountSchema, updateAccountSchema } from "@pos-lite/validation";

const one="12345678-1234-4234-8234-123456789001";
const two="12345678-1234-4234-8234-123456789002";
it("requires one cash store, allows shared bank and rejects duplicate or missing mappings",()=>{
  expect(createAccountSchema.safeParse({name:"cash",type:"CASH",storeIds:[one,two]}).success).toBe(false);
  expect(createAccountSchema.safeParse({name:"bank",type:"BANK",storeIds:[two,one]}).success).toBe(true);
  for(const storeIds of [[],[one,one]]) expect(createAccountSchema.safeParse({name:"bank",type:"BANK",storeIds}).success).toBe(false);
  expect(updateAccountSchema.safeParse({type:"BANK"}).success).toBe(false);
  expect(updateAccountSchema.safeParse({}).success).toBe(false);
});
it("accepts zero opening and normalizes cutover offsets without converting money to floats",()=>{
  const input={storeId:one,amount:"0",cutoverAt:"2026-01-01T07:00:00+07:00",reason:"เริ่มระบบ"};
  expect(accountOpeningSchema.parse(input).cutoverAt).toBe("2026-01-01T00:00:00.000Z");
  for(const amount of ["-1","1.5",1,"9000000000001"]) expect(accountOpeningSchema.safeParse({...input,amount}).success).toBe(false);
  expect(accountOpeningSchema.safeParse({...input,reason:" "}).success).toBe(false);
  for(const cutoverAt of ["2026-02-31T00:00:00Z","2026-01-01T00:00:00+99:99"]) {
    expect(accountOpeningSchema.safeParse({...input,cutoverAt}).success).toBe(false);
  }
});
