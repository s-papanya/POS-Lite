import assert from "node:assert/strict";
import { it } from "vitest";
import { reconciliationPreviewRequestSchema } from "@pos-lite/validation";
import { reconciliationPreview } from "../src/modules/reconciliation/money.js";

it("reconciles exact signed buckets, leaves omitted accounts alone and never clamps negative deltas",()=>{
  const targets=[{accountId:"a",channel:"CASH" as const,amount:"50000"}];
  const recorded=[{accountId:"a",channel:"CASH" as const,amount:"40000"},{accountId:"b",channel:"TRANSFER" as const,amount:"10000"}];
  const preview=reconciliationPreview("2",targets,recorded);
  assert.equal(preview.lines[0]!.delta,"10000"); assert.equal(preview.netSales,"60000"); assert.deepEqual(preview.accountEffects,[{accountId:"a",delta:"10000"}]);
  assert.equal(reconciliationPreview("2",targets,[{...recorded[0]!,amount:"50000"}]).lines[0]!.delta,"0");
  const negative=reconciliationPreview("2",[{...targets[0]!,amount:"-10000"}],[{...recorded[0]!,amount:"-20000"}]);
  assert.equal(negative.lines[0]!.delta,"10000"); assert.equal(negative.netSales,"-10000");
  const review=reconciliationPreview("2",[{...targets[0]!,amount:"30000"}],recorded);
  assert.equal(review.lines[0]!.delta,"-10000"); assert.equal(review.lines[0]!.requiresReview,true); assert.deepEqual(review.accountEffects,[]);
});

it("requires explicit unique accounts and bounded signed targets",()=>{
  const target={accountId:"00000000-0000-4000-8000-000000000001",channel:"CASH",amount:"-1"};
  const input={businessDate:"2026-10-25",targets:[target]};
  assert.ok(reconciliationPreviewRequestSchema.safeParse(input).success);
  for(const targets of [[],[target,target],[{...target,amount:"-0"}],[{...target,amount:"9000000000001"}]]) assert.equal(reconciliationPreviewRequestSchema.safeParse({...input,targets}).success,false);
});
