import { expect, it } from "vitest";
import { createProductSchema, updateProductSchema } from "@pos-lite/validation";

it("accepts exact satang strings and rejects fractional, excessive and authority fields",() => {
  expect(createProductSchema.parse({name:" ก๋วยเตี๋ยว ",price:"4500"})).toEqual({name:"ก๋วยเตี๋ยว",price:"4500"});
  for (const price of ["0","1.5","-1","01","9000000000001",4500]) {
    expect(createProductSchema.safeParse({name:"เมนู",price}).success).toBe(false);
  }
  expect(createProductSchema.safeParse({name:"เมนู",price:"1",businessId:"override"}).success).toBe(false);
  expect(updateProductSchema.safeParse({expectedVersion:1}).success).toBe(false);
  expect(updateProductSchema.safeParse({price:"5000",expectedVersion:1}).success).toBe(true);
});
