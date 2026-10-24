import { describe, expect, it } from "vitest";
import { createExpenseCategorySchema, expenseCategoryListResponseSchema } from "@pos-lite/validation";

describe("expense category contracts", () => {
  it("normalizes display names and rejects empty, oversized or authority fields", () => {
    expect(createExpenseCategorySchema.parse({name:"  Cafe\u0301  "})).toEqual({name:"Café"});
    for (const value of [{name:"   "},{name:"x".repeat(121)},{name:"food\nsecret"},{name:"food\u0085secret"},{name:"Food",businessId:"other"}]) {
      expect(createExpenseCategorySchema.safeParse(value).success).toBe(false);
    }
  });
  it("requires the bounded list envelope", () => {
    expect(expenseCategoryListResponseSchema.safeParse({data:[],page:{nextCursor:null}}).success).toBe(true);
    expect(expenseCategoryListResponseSchema.safeParse({data:[]}).success).toBe(false);
  });
});
