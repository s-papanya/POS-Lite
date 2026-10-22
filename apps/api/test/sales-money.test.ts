import { describe, expect, it } from "vitest";
import { calculateSale } from "../src/modules/sales/money.js";

describe("sale totals",()=>{
  it("rounds percent half up once and accepts exact split payments",()=>{
    expect(calculateSale([{unitPrice:"3500",quantity:3}],{kind:"PERCENT",basisPoints:500},["4000","5975"]))
      .toEqual({gross:"10500",discount:"525",net:"9975",lineTotals:["10500"]});
    expect(calculateSale([{unitPrice:"1",quantity:1}],{kind:"PERCENT",basisPoints:5000},["1"])).toBeUndefined();
  });
  it("rejects zero totals, excess discounts, payment mismatch and monetary overflow",()=>{
    expect(calculateSale([{unitPrice:"100",quantity:1}],{kind:"FIXED",amount:"25"},["75"])?.net).toBe("75");
    for(const discount of ["100","101"]) expect(calculateSale([{unitPrice:"100",quantity:1}],{kind:"FIXED",amount:discount},["1"])).toBeUndefined();
    expect(calculateSale([{unitPrice:"100",quantity:1}],{kind:"FIXED",amount:"0"},["99"])).toBeUndefined();
    expect(calculateSale([{unitPrice:"9000000000000",quantity:2}],{kind:"FIXED",amount:"0"},["9000000000000"])).toBeUndefined();
    expect(calculateSale([{unitPrice:"3",quantity:1}],{kind:"PERCENT",basisPoints:5000},["1"])?.discount).toBe("2");
  });
});
