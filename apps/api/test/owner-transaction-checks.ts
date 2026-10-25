import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import type { Express } from "express";
import request from "supertest";
import { ownerTransactionResponseSchema } from "@pos-lite/validation";
import { transaction } from "../src/db/client.js";
import type { AuthService } from "../src/modules/auth/service.js";

export async function ownerTransactionChecks(db:Pool,runtime:Pool,auth:AuthService,app:Express,check:(label:string,work:()=>Promise<void>)=>Promise<void>) {
  const actor=(await db.query("SELECT user_id,business_id FROM business_memberships WHERE role='OWNER' LIMIT 1")).rows[0];
  const session=await auth.issue(runtime,actor.user_id,actor.business_id);
  const send=(path:string,input:object,key:string=randomUUID(),who=session)=>request(app).post(`/api/v1${path}`).set("Cookie",`pos_lite_session=${who.token}`)
    .set("Origin",auth.config.origin).set("X-CSRF-Token",who.csrfToken).set("Idempotency-Key",key).send(input);
  const stores=[randomUUID(),randomUUID()];const [store,second]=stores as [string,string];
  for(const id of stores) await db.query("INSERT INTO stores(id,business_id,name,code,created_by) VALUES($1::uuid,$2,'Owner fixture',$1::uuid::text,$3)",[id,actor.business_id,actor.user_id]);
  const cash=(await send("/accounts",{name:randomUUID(),type:"CASH",storeIds:[store]})).body.data.id as string;
  const bank=(await send("/accounts",{name:randomUUID(),type:"BANK",storeIds:stores})).body.data.id as string;
  for(const id of [cash,bank]) assert.equal((await send(`/accounts/${id}/opening`,{storeId:store,amount:"0",cutoverAt:"2000-01-01T00:00:00Z",reason:"Fixture"})).status,201);
  const date=(await db.query("SELECT (clock_timestamp() AT TIME ZONE 'Asia/Bangkok')::date::text AS date")).rows[0].date as string;
  const input=(kind:"CONTRIBUTION" | "WITHDRAWAL"="CONTRIBUTION",amount="100000",accountId=cash)=>({businessDate:date,occurredAt:new Date().toISOString(),accountId,kind,amount,note:"เงินเจ้าของ"});
  const path=`/stores/${store}/owner-transactions`;const key=randomUUID();const original=input();let committed:request.Response;
  const balance=async(id:string)=>(await db.query("SELECT coalesce(sum(delta),0)::text AS amount FROM money_movements WHERE business_id=$1 AND account_id=$2",[actor.business_id,id])).rows[0].amount;
  const state=async()=>Promise.all(["owner_transactions","expenses","expense_payments","sales","money_movements","business_days","day_openings","audit_logs","idempotency_records"]
    .map(async(table)=>(await db.query(`SELECT * FROM ${table} ORDER BY id`)).rows));
  await check("I: contribution1000 and withdrawal200 leave800 without changing sales or expenses",async()=>{
    const operating=await Promise.all(["sales","expenses","expense_payments"].map(async t=>(await db.query(`SELECT * FROM ${t} ORDER BY id`)).rows));
    committed=await send(path,original,key);assert.equal(committed.status,201);ownerTransactionResponseSchema.parse(committed.body);
    const withdrawal=await send(path,input("WITHDRAWAL","20000"));assert.equal(withdrawal.status,201);assert.equal(await balance(cash),"80000");
    assert.deepEqual(await Promise.all(["sales","expenses","expense_payments"].map(async t=>(await db.query(`SELECT * FROM ${t} ORDER BY id`)).rows)),operating);
    assert.deepEqual((await send(path,original,key)).body,committed.body);
    assert.equal((await send(path,{...original,kind:"WITHDRAWAL"},key)).body.error.code,"IDEMPOTENCY_CONFLICT");
    const payload=input("CONTRIBUTION","100");const concurrentKey=randomUUID();const pair=await Promise.all([send(path,payload,concurrentKey),send(path,payload,concurrentKey)]);
    assert.deepEqual(pair.map(r=>r.status),[201,201]);assert.deepEqual(pair[0]!.body,pair[1]!.body);
    assert.equal((await db.query("SELECT count(*)::int AS n FROM money_movements WHERE owner_transaction_id=$1",[pair[0]!.body.data.id])).rows[0].n,1);
    assert.equal((await db.query("SELECT count(*)::int AS n FROM audit_logs WHERE entity_id=$1",[pair[0]!.body.data.id])).rows[0].n,1);
  });
  await check("owner flow denies invalid date/account, missing auth/CSRF and closed-day new writes while replay remains stable",async()=>{
    const before=await state();
    assert.equal((await send(path,input("WITHDRAWAL","999999"))).body.error.code,"INSUFFICIENT_FUNDS");
    assert.equal((await send(path,{...input(),occurredAt:"2099-01-01T00:00:00Z"})).status,422);
    assert.equal((await send(path,{...input(),occurredAt:"2000-01-01T00:00:00Z"})).status,422);
    assert.equal((await send(path,input("CONTRIBUTION","1",randomUUID()))).status,404);
    assert.equal((await send(`/stores/${second}/owner-transactions`,input("CONTRIBUTION","1",cash))).status,404);
    assert.equal((await send(path,{...input(),amount:"-1"})).status,400);
    assert.equal((await request(app).post(`/api/v1${path}`).send(original)).status,401);
    assert.equal((await request(app).post(`/api/v1${path}`).set("Cookie",`pos_lite_session=${session.token}`).send(original)).body.error.code,"ORIGIN_INVALID");
    assert.equal((await request(app).post(`/api/v1${path}`).set("Cookie",`pos_lite_session=${session.token}`).set("Origin",auth.config.origin).send(original)).status,403);
    assert.equal((await send(path,original,"bad-key")).status,400);
    assert.equal((await send(path,original).set("X-Expected-User-Id",randomUUID()).set("X-Expected-Business-Id",actor.business_id)).body.error.code,"SESSION_CONTEXT_CHANGED");
    assert.deepEqual(await state(),before);
    const day=(await db.query("SELECT id FROM business_days WHERE store_id=$1 AND business_date=$2",[store,date])).rows[0].id;
    await db.query("UPDATE business_days SET state='CLOSED' WHERE id=$1",[day]);
    try {assert.equal((await send(path,input())).body.error.code,"DAY_CLOSED");assert.deepEqual((await send(path,original,key)).body,committed.body);}
    finally {await db.query("UPDATE business_days SET state='OPEN' WHERE id=$1",[day]);}
    assert.deepEqual(await state(),before);
  });
  await check("owner audit failure rolls back auto-opened day, source, movement, revision and key; same key retries once",async()=>{
    const target=randomUUID();await db.query("INSERT INTO stores(id,business_id,name,code,created_by) VALUES($1::uuid,$2,'Owner rollback',$1::uuid::text,$3)",[target,actor.business_id,actor.user_id]);
    const account=(await send("/accounts",{name:randomUUID(),type:"BANK",storeIds:[target]})).body.data.id as string;
    assert.equal((await send(`/accounts/${account}/opening`,{storeId:target,amount:"0",cutoverAt:"2000-01-01T00:00:00Z",reason:"Fixture"})).status,201);
    const endpoint=`/stores/${target}/owner-transactions`;const payload=input("CONTRIBUTION","100",account);const retryKey=randomUUID();const before=await state();
    await db.query(`CREATE FUNCTION fail_owner_test() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action='OWNER_TRANSACTION_CREATED' THEN RAISE EXCEPTION 'injected failure'; END IF; RETURN NEW; END $$`);
    await db.query("CREATE TRIGGER fail_owner_test BEFORE INSERT ON audit_logs FOR EACH ROW EXECUTE FUNCTION fail_owner_test()");
    try {assert.equal((await send(endpoint,payload,retryKey)).status,500);assert.deepEqual(await state(),before);}
    finally {await db.query("DROP TRIGGER fail_owner_test ON audit_logs");await db.query("DROP FUNCTION fail_owner_test()");}
    const result=await send(endpoint,payload,retryKey);assert.equal(result.status,201);assert.deepEqual((await send(endpoint,payload,retryKey)).body,result.body);assert.equal(await balance(account),"100");
  });
  await check("owner withdrawal competes with expense payment across stores on the same bank without overdraft",async()=>{
    assert.equal((await send(path,input("CONTRIBUTION","100000",bank))).status,201);
    const category=(await send("/expense-categories",{name:`Owner race ${randomUUID()}`})).body.data.id;
    const expense=await send(`/stores/${second}/expenses`,{businessDate:date,occurredAt:new Date().toISOString(),categoryId:category,amount:"70000",description:"Fixture"});assert.equal(expense.status,201);
    const blocker=await db.connect();let pending:Promise<request.Response>[]=[];
    try {
      await blocker.query("BEGIN");await blocker.query("SELECT id FROM financial_accounts WHERE id=$1 FOR UPDATE",[bank]);const pid=(await blocker.query("SELECT pg_backend_pid() AS pid")).rows[0].pid;
      pending=[send(path,input("WITHDRAWAL","70000",bank)).then(r=>r),send(`/stores/${second}/expenses/${expense.body.data.id}/payments`,{businessDate:date,occurredAt:new Date().toISOString(),accountId:bank}).then(r=>r)];
      const deadline=Date.now()+5000;let blocked=0;
      while(Date.now()<deadline) {blocked=Number((await db.query(`WITH RECURSIVE waiting(pid) AS (SELECT $1::int UNION
        SELECT a.pid FROM pg_stat_activity a JOIN waiting w ON w.pid=ANY(pg_blocking_pids(a.pid))) SELECT count(*)-1 AS n FROM waiting`,[pid])).rows[0].n);if(blocked>=2) break;}
      assert.equal(blocked,2);await blocker.query("COMMIT");const results=await Promise.all(pending);
      assert.deepEqual(results.map(r=>r.status).sort(),[201,409]);assert.equal(results.find(r=>r.status===409)!.body.error.code,"INSUFFICIENT_FUNDS");assert.equal(await balance(bank),"30000");
    } finally {await blocker.query("ROLLBACK");blocker.release();await Promise.all(pending);}
    assert.equal((await send(path,input("WITHDRAWAL","30000",bank))).status,201);assert.equal(await balance(bank),"0");
    const before=await state();assert.equal((await send(path,input("WITHDRAWAL","1",bank))).body.error.code,"INSUFFICIENT_FUNDS");assert.deepEqual(await state(),before);
  });
  await check("owner SQL guards reject missing/wrong signed/duplicate/foreign-account movements and immutable rewrites",async()=>{
    const day=(await db.query("SELECT id FROM business_days WHERE store_id=$1 AND business_date=$2",[store,date])).rows[0].id;
    const before=await state();
    const insert=async(client:import("pg").PoolClient)=>(await client.query(`INSERT INTO owner_transactions(business_id,store_id,day_id,account_id,kind,amount,note,occurred_at,created_by)
      VALUES($1,$2,$3,$4,'CONTRIBUTION',100,'Fixture',$5,$6) RETURNING id`,[actor.business_id,store,day,cash,new Date().toISOString(),actor.user_id])).rows[0].id;
    await assert.rejects(transaction(runtime,async client=>{await insert(client);}),{code:"23514"});
    await assert.rejects(transaction(runtime,async client=>{const id=await insert(client);await client.query("INSERT INTO money_movements(business_id,store_id,day_id,account_id,owner_transaction_id,delta,created_by) VALUES($1,$2,$3,$4,$5,-100,$6)",[actor.business_id,store,day,cash,id,actor.user_id]);}),{code:"23514"});
    await assert.rejects(transaction(runtime,async client=>{const id=await insert(client);await client.query("INSERT INTO money_movements(business_id,store_id,day_id,account_id,owner_transaction_id,delta,created_by) VALUES($1,$2,$3,$4,$5,100,$6)",[actor.business_id,store,day,bank,id,actor.user_id]);}),{code:"23503"});
    const movement=(await db.query("SELECT * FROM money_movements WHERE owner_transaction_id=$1",[committed.body.data.id])).rows[0];
    await assert.rejects(runtime.query("INSERT INTO money_movements(business_id,store_id,day_id,account_id,owner_transaction_id,delta,created_by) VALUES($1,$2,$3,$4,$5,$6,$7)",[movement.business_id,movement.store_id,movement.day_id,movement.account_id,movement.owner_transaction_id,movement.delta,movement.created_by]),{code:"23505"});
    await assert.rejects(runtime.query("UPDATE owner_transactions SET amount=1"),{code:"42501"});await assert.rejects(runtime.query("DELETE FROM owner_transactions"),{code:"42501"});assert.deepEqual(await state(),before);
  });
  await check("only current OWNER can write or replay; losing ownership while awaiting account lock aborts",async()=>{
    const user=(await db.query("INSERT INTO users(username,password_hash) VALUES($1,'fixture') RETURNING id",[randomUUID()])).rows[0].id;
    await db.query("INSERT INTO business_memberships(business_id,user_id,role,created_by) VALUES($1,$2,'OWNER',$3)",[actor.business_id,user,actor.user_id]);
    await db.query("INSERT INTO store_memberships(business_id,store_id,user_id,role,created_by) VALUES($1,$2,$3,'MANAGER',$4)",[actor.business_id,store,user,actor.user_id]);
    const otherOwner=await auth.issue(runtime,user,actor.business_id);const before=await state();const blocker=await db.connect();let pending:Promise<request.Response> | undefined;
    try {
      await blocker.query("BEGIN");await blocker.query("SELECT id FROM financial_accounts WHERE id=$1 FOR UPDATE",[cash]);const pid=(await blocker.query("SELECT pg_backend_pid() AS pid")).rows[0].pid;
      pending=send(path,input("CONTRIBUTION","10"),randomUUID(),otherOwner).then(r=>r);let blocked=false;const deadline=Date.now()+5000;
      while(Date.now()<deadline) {blocked=!!(await db.query("SELECT 1 FROM pg_stat_activity WHERE $1::int=ANY(pg_blocking_pids(pid))",[pid])).rowCount;if(blocked) break;}
      assert.ok(blocked);await db.query("UPDATE business_memberships SET role='MEMBER' WHERE business_id=$1 AND user_id=$2",[actor.business_id,user]);
      await blocker.query("COMMIT");assert.equal((await pending).status,403);
    } finally {await blocker.query("ROLLBACK");blocker.release();await pending;}
    assert.deepEqual(await state(),before);
    assert.equal((await send(path,input(),randomUUID(),otherOwner)).status,403);
    await db.query("UPDATE store_memberships SET role='STAFF' WHERE user_id=$1",[user]);assert.equal((await send(path,input(),randomUUID(),otherOwner)).status,403);
    await db.query("UPDATE business_memberships SET role='OWNER' WHERE business_id=$1 AND user_id=$2",[actor.business_id,user]);
    const replayInput=input("CONTRIBUTION","10");const replayKey=randomUUID();assert.equal((await send(path,replayInput,replayKey,otherOwner)).status,201);
    await db.query("UPDATE business_memberships SET role='MEMBER' WHERE business_id=$1 AND user_id=$2",[actor.business_id,user]);assert.equal((await send(path,replayInput,replayKey,otherOwner)).status,403);
    const foreign=randomUUID();await db.query("INSERT INTO businesses(id,name,created_by) VALUES($1,'Foreign owner fixture',$2)",[foreign,actor.user_id]);
    const foreignStore=randomUUID();await db.query("INSERT INTO stores(id,business_id,name,code,created_by) VALUES($1::uuid,$2,'Foreign',$1::uuid::text,$3)",[foreignStore,foreign,actor.user_id]);
    assert.equal((await send(`/stores/${foreignStore}/owner-transactions`,input())).status,404);
  });
}
