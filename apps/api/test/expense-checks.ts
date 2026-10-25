import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import type { Express } from "express";
import request from "supertest";
import { expenseResponseSchema, expensePaymentResponseSchema, expenseListResponseSchema } from "@pos-lite/validation";
import { transaction } from "../src/db/client.js";
import type { AuthService } from "../src/modules/auth/service.js";

export async function expenseChecks(db:Pool,runtime:Pool,auth:AuthService,app:Express,check:(label:string,work:()=>Promise<void>)=>Promise<void>) {
  const actor=(await db.query("SELECT user_id,business_id FROM business_memberships WHERE role='OWNER' LIMIT 1")).rows[0];
  const session=await auth.issue(runtime,actor.user_id,actor.business_id);
  const send=(path:string,input:object,key:string=randomUUID(),who=session)=>request(app).post(`/api/v1${path}`).set("Cookie",`pos_lite_session=${who.token}`)
    .set("Origin",auth.config.origin).set("X-CSRF-Token",who.csrfToken).set("Idempotency-Key",key).send(input);
  const stores=[randomUUID(),randomUUID()];const [store,second]=stores as [string,string];
  for(const id of stores) await db.query("INSERT INTO stores(id,business_id,name,code,created_by) VALUES($1::uuid,$2,'Expense fixture',$1::uuid::text,$3)",[id,actor.business_id,actor.user_id]);
  const category=(await send("/expense-categories",{name:`Expense ${randomUUID()}`})).body.data.id as string;
  const cash=(await send("/accounts",{name:randomUUID(),type:"CASH",storeIds:[store]})).body.data.id as string;
  const bank=(await send("/accounts",{name:randomUUID(),type:"BANK",storeIds:stores})).body.data.id as string;
  for(const [id,amount] of [[cash,"200000"],[bank,"100000"]]) assert.equal((await send(`/accounts/${id}/opening`,{storeId:store,amount,cutoverAt:"2000-01-01T00:00:00Z",reason:"Fixture"})).status,201);
  const date=(await db.query("SELECT (clock_timestamp() AT TIME ZONE 'Asia/Bangkok')::date::text AS date")).rows[0].date as string;
  const occurredAt=new Date().toISOString();const path=`/stores/${store}/expenses`;
  const input=(amount="60000")=>({businessDate:date,occurredAt,categoryId:category,amount,description:"วัตถุดิบ",evidenceReference:"Fixture receipt"});
  const payment=(accountId=cash)=>({businessDate:date,occurredAt:new Date().toISOString(),accountId});
  const balance=async(id:string)=>(await db.query("SELECT coalesce(sum(delta),0)::text AS amount FROM money_movements WHERE business_id=$1 AND account_id=$2",[actor.business_id,id])).rows[0].amount;
  const list=(query:object={},who=session,target=store)=>request(app).get(`/api/v1/stores/${target}/expenses`).set("Cookie",`pos_lite_session=${who.token}`).query({from:date,to:date,...query});
  const state=async()=>Promise.all(["expenses","expense_payments","money_movements","business_days","day_openings","audit_logs","idempotency_records"]
    .map(async(table)=>(await db.query(`SELECT * FROM ${table} ORDER BY id`)).rows));
  let expenseId:string;const createKey=randomUUID();const payKey=randomUUID();let posted:request.Response;let paidInput:ReturnType<typeof payment>;
  await check("H: unpaid expense recognizes600 without money; full payment posts once and preserves recognition",async()=>{
    const salesBefore=(await db.query("SELECT id,net::text FROM sales ORDER BY id")).rows;
    const result=await send(path,input(),createKey);assert.equal(result.status,201);expenseResponseSchema.parse(result.body);
    expenseId=result.body.data.id;assert.equal(result.body.data.status,"UNPAID");assert.equal(result.body.data.payment,null);assert.equal(await balance(cash),"200000");
    assert.deepEqual((await send(path,input(),createKey)).body,result.body);
    assert.equal((await send(path,input("1"),createKey)).body.error.code,"IDEMPOTENCY_CONFLICT");
    paidInput=payment();posted=await send(`${path}/${expenseId}/payments`,paidInput,payKey);assert.equal(posted.status,201);expensePaymentResponseSchema.parse(posted.body);
    assert.equal(posted.body.data.amount,"60000");assert.equal(await balance(cash),"140000");
    assert.deepEqual((await send(`${path}/${expenseId}/payments`,paidInput,payKey)).body,posted.body);
    assert.equal((await send(path,input(),createKey)).body.data.status,"UNPAID");
    const before=await state();assert.equal((await send(`${path}/${expenseId}/payments`,payment())).body.error.code,"ALREADY_PAID");assert.deepEqual(await state(),before);
    const page=await list({status:"PAID"});assert.equal(page.status,200);expenseListResponseSchema.parse(page.body);
    assert.equal(page.body.data.find((e:{id:string})=>e.id===expenseId).payment.id,posted.body.data.id);
    assert.equal((await db.query("SELECT count(*)::int AS n FROM expenses WHERE id=$1",[expenseId])).rows[0].n,1);
    assert.deepEqual((await db.query("SELECT id,net::text FROM sales ORDER BY id")).rows,salesBefore);
  });
  await check("immediate expense pays atomically and invalid amount/account/category/closed day leaves no partial writes",async()=>{
    const result=await send(path,{...input("20000"),payment:{accountId:cash}});assert.equal(result.status,201);expenseResponseSchema.parse(result.body);
    assert.equal(result.body.data.status,"PAID");assert.equal(await balance(cash),"120000");
    const before=await state();
    assert.equal((await send(path,{...input("999999"),payment:{accountId:cash}})).body.error.code,"INSUFFICIENT_FUNDS");
    assert.equal((await send(path,{...input(),payment:{accountId:randomUUID()}})).status,404);
    assert.equal((await send(path,{...input(),categoryId:randomUUID()})).status,404);
    const foreign=(await db.query("SELECT id FROM expense_categories WHERE business_id<>$1 LIMIT 1",[actor.business_id])).rows[0].id;
    assert.equal((await send(path,{...input(),categoryId:foreign})).status,404);
    assert.equal((await send(path,{...input(),payment:{accountId:cash,amount:"1"}})).status,400);
    assert.equal((await send(path,{...input(),occurredAt:"2099-01-01T00:00:00Z"})).status,422);
    assert.equal((await send(path,{...input(),occurredAt:"2000-01-01T00:00:00Z"})).status,422);
    assert.deepEqual(await state(),before);
    const day=(await db.query("SELECT id FROM business_days WHERE store_id=$1 AND business_date=$2",[store,date])).rows[0].id;
    await db.query("UPDATE business_days SET state='CLOSED' WHERE id=$1",[day]);
    try {assert.equal((await send(path,input())).body.error.code,"DAY_CLOSED");assert.equal((await send(`${path}/${expenseId}/payments`,payment())).body.error.code,"DAY_CLOSED");
      assert.deepEqual((await send(`${path}/${expenseId}/payments`,paidInput,payKey)).body,posted.body);
    } finally {await db.query("UPDATE business_days SET state='OPEN' WHERE id=$1",[day]);}
    assert.deepEqual(await state(),before);
  });
  await check("expense and payment audit failure roll back all sources, ledger, revision and key; retry same key succeeds",async()=>{
    await db.query(`CREATE FUNCTION fail_expense_test() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action=TG_ARGV[0] THEN RAISE EXCEPTION 'injected failure'; END IF; RETURN NEW; END $$`);
    const key=randomUUID();const immediate={...input("30000"),payment:{accountId:cash}};const before=await state();
    try {
      for(const action of ["EXPENSE_PAID","EXPENSE_RECOGNIZED"]) {
        await db.query(`CREATE TRIGGER fail_expense_test BEFORE INSERT ON audit_logs FOR EACH ROW EXECUTE FUNCTION fail_expense_test('${action}')`);
        try {assert.equal((await send(path,immediate,key)).status,500);assert.deepEqual(await state(),before);}
        finally {await db.query("DROP TRIGGER fail_expense_test ON audit_logs");}
      }
    } finally {await db.query("DROP FUNCTION fail_expense_test()");}
    const result=await send(path,immediate,key);assert.equal(result.status,201);assert.deepEqual((await send(path,immediate,key)).body,result.body);assert.equal(await balance(cash),"90000");
  });
  await check("two stores competing on shared bank cannot overdraw; account lock barrier proves both wait",async()=>{
    const ids:string[]=[];
    for(const target of stores) {const r=await send(`/stores/${target}/expenses`,input("70000"));assert.equal(r.status,201);ids.push(r.body.data.id);}
    const blocker=await db.connect();let pending:Promise<request.Response>[]=[];
    try {
      await blocker.query("BEGIN");await blocker.query("SELECT id FROM financial_accounts WHERE id=$1 FOR UPDATE",[bank]);
      const pid=(await blocker.query("SELECT pg_backend_pid() AS pid")).rows[0].pid;
      pending=stores.map((target,i)=>send(`/stores/${target}/expenses/${ids[i]}/payments`,payment(bank)).then(r=>r));
      const deadline=Date.now()+5000;let blocked=0;
      while(Date.now()<deadline) {blocked=Number((await db.query(`WITH RECURSIVE waiting(pid) AS (
        SELECT $1::int UNION SELECT a.pid FROM pg_stat_activity a JOIN waiting w ON w.pid=ANY(pg_blocking_pids(a.pid)))
        SELECT count(*)-1 AS n FROM waiting`,[pid])).rows[0].n);if(blocked>=2) break;}
      assert.equal(blocked,2);await blocker.query("COMMIT");const results=await Promise.all(pending);
      assert.deepEqual(results.map(r=>r.status).sort(),[201,409]);assert.equal(results.find(r=>r.status===409)!.body.error.code,"INSUFFICIENT_FUNDS");
      assert.equal(await balance(bank),"30000");
      assert.equal((await db.query("SELECT count(*)::int AS n FROM expense_payments WHERE expense_id=ANY($1::uuid[])",[ids])).rows[0].n,1);
      assert.equal((await db.query("SELECT sum(amount)::text AS amount FROM expenses WHERE id=ANY($1::uuid[])",[ids])).rows[0].amount,"140000");
    } finally {await blocker.query("ROLLBACK");blocker.release();await Promise.all(pending);}
  });
  await check("same expense competitors and same-key requests create one payment",async()=>{
    const result=await send(path,input("1000"));assert.equal(result.status,201);const endpoint=`${path}/${result.body.data.id}/payments`;const payload=payment();const key=randomUUID();
    const pair=await Promise.all([send(endpoint,payload,key),send(endpoint,payload,key)]);assert.deepEqual(pair.map(r=>r.status),[201,201]);assert.deepEqual(pair[0]!.body,pair[1]!.body);
    const unpaid=await send(path,input("1000"));const race=await Promise.all([send(`${path}/${unpaid.body.data.id}/payments`,payment()),send(`${path}/${unpaid.body.data.id}/payments`,payment())]);
    assert.deepEqual(race.map(r=>r.status).sort(),[201,409]);assert.equal(race.find(r=>r.status===409)!.body.error.code,"ALREADY_PAID");assert.equal(await balance(cash),"88000");
  });
  await check("database guards reject partial/missing/mismatched postings, cross-scope and immutable rewrites",async()=>{
    const unpaid=await send(path,input("1000"));const id=unpaid.body.data.id;
    const day=(await db.query("SELECT day_id FROM expenses WHERE id=$1",[id])).rows[0].day_id;
    const insert=async(client:import("pg").PoolClient,amount:string,accountId=cash)=> (await client.query(`INSERT INTO expense_payments(business_id,store_id,day_id,expense_id,account_id,amount,occurred_at,created_by)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,[actor.business_id,store,day,id,accountId,amount,new Date().toISOString(),actor.user_id])).rows[0].id;
    const before=await state();
    await assert.rejects(transaction(runtime,async client=>{await insert(client,"1000");}),{code:"23514"});
    await assert.rejects(transaction(runtime,async client=>{const p=await insert(client,"1");await client.query("INSERT INTO money_movements(business_id,store_id,day_id,account_id,expense_payment_id,delta,created_by) VALUES($1,$2,$3,$4,$5,-1,$6)",[actor.business_id,store,day,cash,p,actor.user_id]);}),{code:"23514"});
    await assert.rejects(transaction(runtime,async client=>{const p=await insert(client,"1000");await client.query("INSERT INTO money_movements(business_id,store_id,day_id,account_id,expense_payment_id,delta,created_by) VALUES($1,$2,$3,$4,$5,1000,$6)",[actor.business_id,store,day,cash,p,actor.user_id]);}),{code:"23514"});
    await assert.rejects(runtime.query("UPDATE expenses SET amount=1"),{code:"42501"});await assert.rejects(runtime.query("DELETE FROM expense_payments"),{code:"42501"});
    await assert.rejects(runtime.query("UPDATE expenses SET id=id WHERE id=$1",[id]),{code:"23514"});
    await assert.rejects(transaction(runtime,async client=>{const p=await insert(client,"1000");await client.query("INSERT INTO money_movements(business_id,store_id,day_id,account_id,expense_payment_id,delta,created_by) VALUES($1,$2,$3,$4,$5,-1000,$6)",[actor.business_id,second,day,cash,p,actor.user_id]);}),{code:"23503"});
    assert.deepEqual(await state(),before);
    const excessive=await send(path,input("999999"));assert.equal(excessive.status,201);const debt=excessive.body.data.id;
    const beforeOverdraft=await state();
    await assert.rejects(transaction(runtime,async client=>{
      const p=(await client.query(`INSERT INTO expense_payments(business_id,store_id,day_id,expense_id,account_id,amount,occurred_at,created_by)
        VALUES($1,$2,$3,$4,$5,999999,$6,$7) RETURNING id`,[actor.business_id,store,day,debt,cash,new Date().toISOString(),actor.user_id])).rows[0].id;
      await client.query("INSERT INTO money_movements(business_id,store_id,day_id,account_id,expense_payment_id,delta,created_by) VALUES($1,$2,$3,$4,$5,-999999,$6)",[actor.business_id,store,day,cash,p,actor.user_id]);
    }),{code:"23514",message:"insufficient account funds"});
    assert.deepEqual(await state(),beforeOverdraft);
  });
  await check("later payment audit failure preserves unpaid recognition and rolls back payment/movement/key",async()=>{
    const recognized=await send(path,input("1000"));assert.equal(recognized.status,201);const endpoint=`${path}/${recognized.body.data.id}/payments`;
    const payload=payment();const key=randomUUID();const before=await state();
    await db.query(`CREATE FUNCTION fail_later_payment_test() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action='EXPENSE_PAID' THEN RAISE EXCEPTION 'injected failure'; END IF; RETURN NEW; END $$`);
    await db.query("CREATE TRIGGER fail_later_payment_test BEFORE INSERT ON audit_logs FOR EACH ROW EXECUTE FUNCTION fail_later_payment_test()");
    try {assert.equal((await send(endpoint,payload,key)).status,500);assert.deepEqual(await state(),before);}
    finally {await db.query("DROP TRIGGER fail_later_payment_test ON audit_logs");await db.query("DROP FUNCTION fail_later_payment_test()");}
    const result=await send(endpoint,payload,key);assert.equal(result.status,201);assert.deepEqual((await send(endpoint,payload,key)).body,result.body);
  });
  await check("closed recognition day may be paid on current open day without rewriting original date",async()=>{
    const target=randomUUID();await db.query("INSERT INTO stores(id,business_id,name,code,created_by) VALUES($1::uuid,$2,'Historical expense fixture',$1::uuid::text,$3)",[target,actor.business_id,actor.user_id]);
    const historicalBank=(await send("/accounts",{name:randomUUID(),type:"BANK",storeIds:[target]})).body.data.id as string;
    assert.equal((await send(`/accounts/${historicalBank}/opening`,{storeId:target,amount:"10000",cutoverAt:"2000-01-01T00:00:00Z",reason:"Fixture"})).status,201);
    const recognized=await send(`/stores/${target}/expenses`,input("1000"));assert.equal(recognized.status,201);const id=recognized.body.data.id;
    // Fixture-only historical closed day plus already-open current day; the D4 opening gate stays unchanged.
    await transaction(db,async client=>{
      await client.query("ALTER TABLE expenses DISABLE TRIGGER expenses_immutable_guard");
      await client.query("UPDATE expenses SET occurred_at=occurred_at-interval '1 day' WHERE id=$1",[id]);
      await client.query("ALTER TABLE expenses ENABLE TRIGGER expenses_immutable_guard");
      await client.query("UPDATE business_days SET state='CLOSED',business_date=business_date-1,opened_at=opened_at-interval '1 day' WHERE id=(SELECT day_id FROM expenses WHERE id=$1)",[id]);
      await client.query("INSERT INTO business_days(business_id,store_id,business_date,created_by) VALUES($1,$2,$3,$4)",[actor.business_id,target,date,actor.user_id]);
    });
    const paid=await send(`/stores/${target}/expenses/${id}/payments`,payment(historicalBank));assert.equal(paid.status,201);assert.equal(paid.body.data.businessDate,date);
    const rows=await list({from:"2000-01-01",to:"2000-01-01"},session,target);assert.equal(rows.body.data.length,0);
    const original=(await db.query("SELECT d.business_date::text AS date FROM expenses e JOIN business_days d ON d.id=e.day_id WHERE e.id=$1",[id])).rows[0].date;
    assert.notEqual(original,date);assert.equal((await list({from:original,to:date},session,target)).body.data[0].businessDate,original);
  });
  await check("expense list/status cursor and financial permissions enforce current actor/store/business",async()=>{
    const beforeScope=await state();
    assert.equal((await send(`/stores/${second}/expenses/${expenseId}/payments`,payment(bank))).status,404);
    assert.equal((await send(`/stores/${second}/expenses`,{...input("1"),payment:{accountId:cash}})).status,404);
    assert.deepEqual(await state(),beforeScope);
    const owner=(await list({limit:"1"}));assert.equal(owner.status,200);expenseListResponseSchema.parse(owner.body);assert.ok(owner.body.page.nextCursor);
    const next=await list({limit:"1",cursor:owner.body.page.nextCursor});assert.equal(next.status,200);assert.notEqual(next.body.data[0].id,owner.body.data[0].id);
    assert.equal((await list({status:"UNPAID",cursor:owner.body.page.nextCursor})).status,400);
    assert.equal((await list({cursor:owner.body.page.nextCursor},session,second)).status,400);
    assert.equal((await list({from:"2020-01-01",to:date})).status,400);
    const user=(await db.query("INSERT INTO users(username,password_hash) VALUES($1,'fixture') RETURNING id",[randomUUID()])).rows[0].id;
    await db.query("INSERT INTO business_memberships(business_id,user_id,role,created_by) VALUES($1,$2,'MEMBER',$3)",[actor.business_id,user,actor.user_id]);
    await db.query("INSERT INTO store_memberships(business_id,store_id,user_id,role,created_by) VALUES($1,$2,$3,'MANAGER',$4)",[actor.business_id,store,user,actor.user_id]);
    const manager=await auth.issue(runtime,user,actor.business_id);assert.equal((await list({},manager)).status,200);
    const created=await send(path,input("100"),randomUUID(),manager);assert.equal(created.status,201);
    assert.equal((await send(`${path}/${created.body.data.id}/payments`,payment(),randomUUID(),manager)).status,201);
    assert.equal((await list({},manager,second)).status,404);
    await db.query("UPDATE store_memberships SET role='STAFF' WHERE user_id=$1",[user]);
    const before=await state();assert.equal((await list({},manager)).status,403);assert.equal((await send(path,input(),randomUUID(),manager)).status,403);
    await db.query("UPDATE business_memberships SET role='MEMBER' WHERE business_id=$1 AND user_id=$2",[actor.business_id,actor.user_id]);
    try {assert.equal((await send(path,input(),createKey)).status,404);} finally {await db.query("UPDATE business_memberships SET role='OWNER' WHERE business_id=$1 AND user_id=$2",[actor.business_id,actor.user_id]);}
    assert.deepEqual(await state(),before);
    assert.equal((await request(app).get(`/api/v1${path}`).query({from:date,to:date})).status,401);
    assert.equal((await request(app).post(`/api/v1${path}`).set("Cookie",`pos_lite_session=${session.token}`).send(input())).body.error.code,"ORIGIN_INVALID");
    assert.equal((await send(path,input()).set("X-Expected-User-Id",randomUUID()).set("X-Expected-Business-Id",actor.business_id)).body.error.code,"SESSION_CONTEXT_CHANGED");
  });
}
