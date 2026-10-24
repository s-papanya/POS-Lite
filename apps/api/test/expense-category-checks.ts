import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import type { Express } from "express";
import request from "supertest";
import { expenseCategoryResponseSchema, expenseCategoryListResponseSchema } from "@pos-lite/validation";
import type { AuthService } from "../src/modules/auth/service.js";

export async function expenseCategoryChecks(db:Pool,runtime:Pool,auth:AuthService,app:Express,check:(label:string,work:()=>Promise<void>)=>Promise<void>) {
  const actor=(await db.query("SELECT user_id,business_id FROM business_memberships WHERE role='OWNER' LIMIT 1")).rows[0];
  const session=await auth.issue(runtime,actor.user_id,actor.business_id);
  const send=(input:object,key:string=randomUUID(),who=session)=>request(app).post("/api/v1/expense-categories").set("Cookie",`pos_lite_session=${who.token}`)
    .set("Origin",auth.config.origin).set("X-CSRF-Token",who.csrfToken).set("Idempotency-Key",key).send(input);
  const list=(query:object={},who=session)=>request(app).get("/api/v1/expense-categories").set("Cookie",`pos_lite_session=${who.token}`).query(query);
  const state=async()=>Promise.all(["expense_categories","audit_logs","idempotency_records","money_movements","business_days"]
    .map(async(table)=>(await db.query(`SELECT * FROM ${table} ORDER BY id`)).rows));
  const user=(await db.query("INSERT INTO users(username,password_hash) VALUES($1,'fixture') RETURNING id",[randomUUID()])).rows[0].id;
  await db.query("INSERT INTO business_memberships(business_id,user_id,role,created_by) VALUES($1,$2,'MEMBER',$3)",[actor.business_id,user,actor.user_id]);
  const store=(await db.query("SELECT id FROM stores WHERE business_id=$1 AND active LIMIT 1",[actor.business_id])).rows[0].id;
  await db.query("INSERT INTO store_memberships(business_id,store_id,user_id,role,created_by) VALUES($1,$2,$3,'MANAGER',$4)",[actor.business_id,store,user,actor.user_id]);
  const manager=await auth.issue(runtime,user,actor.business_id);
  const name="Café"; const key=randomUUID(); let original:request.Response;
  await check("category create normalizes, audits, replays and never opens a day or moves money",async()=>{
    const balances=(await db.query("SELECT * FROM money_movements ORDER BY id")).rows;
    const days=(await db.query("SELECT * FROM business_days ORDER BY id")).rows;
    original=await send({name:"  Cafe\u0301  "},key); assert.equal(original.status,201); expenseCategoryResponseSchema.parse(original.body);
    assert.equal(original.body.data.name,name); assert.equal(original.body.data.active,true);
    const replay=await send({name},key); assert.equal(replay.status,201); assert.deepEqual(replay.body,original.body);
    assert.equal((await send({name:"Changed"},key)).body.error.code,"IDEMPOTENCY_CONFLICT");
    assert.equal((await db.query("SELECT count(*)::int AS n FROM audit_logs WHERE entity_id=$1 AND action='EXPENSE_CATEGORY_CREATED' AND store_id IS NULL",[original.body.data.id])).rows[0].n,1);
    assert.deepEqual((await db.query("SELECT * FROM money_movements ORDER BY id")).rows,balances);
    assert.deepEqual((await db.query("SELECT * FROM business_days ORDER BY id")).rows,days);
  });
  await check("category normalization and unique constraints reject direct invalid SQL without consuming failed keys",async()=>{
    const before=await state();
    const duplicate=await send({name:"CAFÉ"}); assert.equal(duplicate.status,409); assert.equal(duplicate.body.error.code,"CATEGORY_NAME_EXISTS");
    for(const invalid of [{name:""},{name:"x".repeat(121)},{name:"one\ntwo"},{name:"A",businessId:actor.business_id}]) assert.equal((await send(invalid)).status,400);
    for(const invalid of [" "," Cafe ","Cafe\u0301","one\ntwo","x".repeat(121)]) {
      await assert.rejects(db.query("INSERT INTO expense_categories(business_id,name,created_by) VALUES($1,$2,$3)",[actor.business_id,invalid,actor.user_id]),{code:"23514"});
    }
    await assert.rejects(db.query("INSERT INTO expense_categories(business_id,name,created_by) VALUES($1,'CAFÉ',$2)",[actor.business_id,actor.user_id]),{code:"23505"});
    await assert.rejects(runtime.query("UPDATE expense_categories SET name='changed'"),{code:"42501"});
    await assert.rejects(runtime.query("DELETE FROM expense_categories"),{code:"42501"});
    assert.deepEqual(await state(),before);
  });
  await check("category pages are scoped to business, bounded and manager-readable; staff cannot read or create",async()=>{
    assert.equal((await send({name:"Apple"})).status,201);
    const page=await list({limit:"1"},manager); assert.equal(page.status,200); expenseCategoryListResponseSchema.parse(page.body);
    assert.equal(page.body.data.length,1); assert.ok(page.body.page.nextCursor);
    const next=await list({limit:"1",cursor:page.body.page.nextCursor},manager); assert.equal(next.status,200);
    assert.notEqual(next.body.data[0].id,page.body.data[0].id); assert.equal(next.body.page.nextCursor,null);
    for(const query of [{limit:"0"},{limit:"101"},{cursor:"garbage"},{active:"false"}]) assert.equal((await list(query)).status,400);
    assert.equal((await send({name:"Denied"},randomUUID(),manager)).status,403);
    await db.query("UPDATE store_memberships SET role='STAFF' WHERE business_id=$1 AND user_id=$2",[actor.business_id,user]);
    assert.equal((await list({},manager)).status,403); assert.equal((await send({name:"Denied"},randomUUID(),manager)).status,403);
    await db.query("UPDATE store_memberships SET role='MANAGER',active=false WHERE business_id=$1 AND user_id=$2",[actor.business_id,user]);
    assert.equal((await list({},manager)).status,403);
    const otherBusiness=(await db.query("INSERT INTO businesses(name,created_by) VALUES('Other category fixture',$1) RETURNING id",[user])).rows[0].id;
    await db.query("INSERT INTO business_memberships(business_id,user_id,role,created_by) VALUES($1,$2,'OWNER',$2)",[otherBusiness,user]);
    const other=await auth.issue(runtime,user,otherBusiness);
    assert.deepEqual((await list({},other)).body.data,[]);
    assert.equal((await list({cursor:page.body.page.nextCursor},other)).status,400);
    assert.equal((await send({name},randomUUID(),other)).status,201);
    await assert.rejects(db.query("INSERT INTO expense_categories(business_id,name,created_by) VALUES($1,'Wrong actor',$2)",[otherBusiness,actor.user_id]),{code:"23503"});
    const before=await state();
    await db.query("UPDATE business_memberships SET role='MEMBER' WHERE business_id=$1 AND user_id=$2",[actor.business_id,actor.user_id]);
    try {assert.equal((await send({name},key)).status,403);} finally {await db.query("UPDATE business_memberships SET role='OWNER' WHERE business_id=$1 AND user_id=$2",[actor.business_id,actor.user_id]);}
    assert.deepEqual(await state(),before);
  });
  await check("category audit failure rolls back category/key; same key retry creates one complete result",async()=>{
    const input={name:"Rollback"}; const retryKey=randomUUID(); const before=await state();
    await db.query(`CREATE FUNCTION fail_category_test() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action='EXPENSE_CATEGORY_CREATED' THEN RAISE EXCEPTION 'injected failure'; END IF; RETURN NEW; END $$`);
    await db.query("CREATE TRIGGER fail_category_test BEFORE INSERT ON audit_logs FOR EACH ROW EXECUTE FUNCTION fail_category_test()");
    try {assert.equal((await send(input,retryKey)).status,500);assert.deepEqual(await state(),before);}
    finally {await db.query("DROP TRIGGER fail_category_test ON audit_logs");await db.query("DROP FUNCTION fail_category_test()");}
    const result=await send(input,retryKey); assert.equal(result.status,201);
    assert.deepEqual((await send(input,retryKey)).body,result.body);
  });
  await check("parallel category creates deduplicate same keys and normalized names in PostgreSQL",async()=>{
    const replayKey=randomUUID(); const same=await Promise.all([send({name:"Parallel"},replayKey),send({name:"Parallel"},replayKey)]);
    assert.deepEqual(same.map(r=>r.status),[201,201]);assert.deepEqual(same[0]!.body,same[1]!.body);
    assert.equal((await db.query("SELECT count(*)::int AS n FROM audit_logs WHERE entity_id=$1",[same[0]!.body.data.id])).rows[0].n,1);
    const names=await Promise.all([send({name:"Unique"}),send({name:"UNIQUE"})]);
    assert.deepEqual(names.map(r=>r.status).sort(),[201,409]);
    assert.equal(names.find(r=>r.status===409)!.body.error.code,"CATEGORY_NAME_EXISTS");
  });
  await check("category endpoints require authenticated session, origin, CSRF and UUID key",async()=>{
    assert.equal((await request(app).get("/api/v1/expense-categories")).status,401);
    const base=()=>request(app).post("/api/v1/expense-categories").set("Cookie",`pos_lite_session=${session.token}`).set("Idempotency-Key",randomUUID());
    assert.equal((await base().send({name:"Denied"})).body.error.code,"ORIGIN_INVALID");
    assert.equal((await base().set("Origin",auth.config.origin).send({name:"Denied"})).status,403);
    assert.equal((await send({name:"Denied"},"bad-key")).status,400);
  });
}
