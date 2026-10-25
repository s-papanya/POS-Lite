import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import type { Express } from "express";
import request from "supertest";
import { transferResponseSchema } from "@pos-lite/validation";
import { transaction } from "../src/db/client.js";
import type { AuthService } from "../src/modules/auth/service.js";

export async function transferChecks(db:Pool,runtime:Pool,auth:AuthService,app:Express,check:(label:string,work:()=>Promise<void>)=>Promise<void>) {
  const actor=(await db.query("SELECT user_id,business_id FROM business_memberships WHERE role='OWNER' LIMIT 1")).rows[0];
  const session=await auth.issue(runtime,actor.user_id,actor.business_id);
  const send=(path:string,input:object,key:string=randomUUID(),who=session)=>request(app).post(`/api/v1${path}`).set("Cookie",`pos_lite_session=${who.token}`)
    .set("Origin",auth.config.origin).set("X-CSRF-Token",who.csrfToken).set("Idempotency-Key",key).send(input);
  const makeStore=async()=>{const id=randomUUID();await db.query("INSERT INTO stores(id,business_id,name,code,created_by) VALUES($1::uuid,$2,'Transfer fixture',$1::uuid::text,$3)",[id,actor.business_id,actor.user_id]);return id;};
  const stores=[await makeStore(),await makeStore()];const [store,second]=stores as [string,string];
  const makeAccount=async(type:"CASH" | "BANK",storeIds:string[],amount:string)=>{
    const result=await send("/accounts",{name:randomUUID(),type,storeIds});assert.equal(result.status,201);const id=result.body.data.id as string;
    assert.equal((await send(`/accounts/${id}/opening`,{storeId:storeIds[0],amount,cutoverAt:"2000-01-01T00:00:00Z",reason:"Fixture"})).status,201);return id;
  };
  const cash=await makeAccount("CASH",[store],"300000");const bank=await makeAccount("BANK",stores,"0");
  const date=(await db.query("SELECT (clock_timestamp() AT TIME ZONE 'Asia/Bangkok')::date::text AS date")).rows[0].date as string;
  const input=(amount="100000",feeAmount="0")=>({sourceStoreId:store,destinationStoreId:second,sourceAccountId:cash,destinationAccountId:bank,businessDate:date,occurredAt:new Date().toISOString(),amount,feeAmount,reason:"ฝากเงิน"});
  const balance=async(id:string)=>(await db.query("SELECT coalesce(sum(delta),0)::text AS amount FROM money_movements WHERE business_id=$1 AND account_id=$2",[actor.business_id,id])).rows[0].amount as string;
  const state=async()=>Promise.all(["account_transfers","expenses","expense_payments","sales","money_movements","business_days","day_openings","audit_logs","idempotency_records"]
    .map(async(table)=>(await db.query(`SELECT * FROM ${table} ORDER BY id`)).rows));
  const waiters=async(pid:number,n:number)=>{const deadline=Date.now()+5000;let count=0;
    while(Date.now()<deadline) {count=Number((await db.query(`WITH RECURSIVE waiting(pid) AS (SELECT $1::int UNION SELECT a.pid FROM pg_stat_activity a
      JOIN waiting w ON w.pid=ANY(pg_blocking_pids(a.pid))) SELECT count(*)-1 AS n FROM waiting`,[pid])).rows[0].n);if(count>=n) break;}assert.equal(count,n);};
  let original:ReturnType<typeof input>;let committed:request.Response;const originalKey=randomUUID();
  await check("J: transfer1000 posts two scoped legs summing0; fee10 is one paid operating expense",async()=>{
    const sales=(await db.query("SELECT * FROM sales ORDER BY id")).rows;const expenseCount=Number((await db.query("SELECT count(*) AS n FROM expenses")).rows[0].n);
    const noFee=await send("/account-transfers",input());assert.equal(noFee.status,201);transferResponseSchema.parse(noFee.body);assert.equal(noFee.body.data.feeExpense,null);
    assert.equal(await balance(cash),"200000");assert.equal(await balance(bank),"100000");assert.equal(Number((await db.query("SELECT count(*) AS n FROM expenses")).rows[0].n),expenseCount);
    const before=await state();assert.equal((await send("/account-transfers",input("1000","10"))).body.error.code,"FEE_CATEGORY_REQUIRED");assert.deepEqual(await state(),before);
    assert.equal((await send("/expense-categories",{name:"ค่าธรรมเนียม"})).status,201);
    original=input("100000","1000");committed=await send("/account-transfers",original,originalKey);assert.equal(committed.status,201);transferResponseSchema.parse(committed.body);
    assert.equal(committed.body.data.feeExpense.status,"PAID");assert.equal(committed.body.data.feeExpense.amount,"1000");assert.equal(committed.body.data.feeExpense.payment.accountId,cash);
    assert.equal(await balance(cash),"99000");assert.equal(await balance(bank),"200000");
    assert.deepEqual((await db.query("SELECT leg,delta::text FROM money_movements WHERE transfer_id=$1 ORDER BY leg",[committed.body.data.id])).rows,[{leg:"IN",delta:"100000"},{leg:"OUT",delta:"-100000"}]);
    assert.deepEqual((await db.query("SELECT * FROM sales ORDER BY id")).rows,sales);
    assert.deepEqual((await send("/account-transfers",original,originalKey)).body,committed.body);
    assert.equal((await send("/account-transfers",{...original,amount:"1"},originalKey)).body.error.code,"IDEMPOTENCY_CONFLICT");
    const payload=input("1000","10");const key=randomUUID();const pair=await Promise.all([send("/account-transfers",payload,key),send("/account-transfers",payload,key)]);
    assert.deepEqual(pair.map(r=>r.status),[201,201]);assert.deepEqual(pair[0]!.body,pair[1]!.body);
  });
  await check("transfer rolls back fee/payment/both legs/revisions/key at fee audit, final audit or incoming leg failure",async()=>{
    const payload=input("1000","10");const key=randomUUID();const before=await state();
    await db.query(`CREATE FUNCTION fail_transfer_audit_test() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action=TG_ARGV[0] THEN RAISE EXCEPTION 'injected failure'; END IF; RETURN NEW; END $$`);
    try {for(const action of ["EXPENSE_PAID","EXPENSE_RECOGNIZED","ACCOUNT_TRANSFER_CREATED"]) {
      await db.query(`CREATE TRIGGER fail_transfer_audit_test BEFORE INSERT ON audit_logs FOR EACH ROW EXECUTE FUNCTION fail_transfer_audit_test('${action}')`);
      try {assert.equal((await send("/account-transfers",payload,key)).status,500);assert.deepEqual(await state(),before);} finally {await db.query("DROP TRIGGER fail_transfer_audit_test ON audit_logs");}
    }} finally {await db.query("DROP FUNCTION fail_transfer_audit_test()");}
    await db.query(`CREATE FUNCTION fail_transfer_in_test() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.leg='IN' THEN RAISE EXCEPTION 'injected failure'; END IF; RETURN NEW; END $$`);
    await db.query("CREATE TRIGGER fail_transfer_in_test BEFORE INSERT ON money_movements FOR EACH ROW EXECUTE FUNCTION fail_transfer_in_test()");
    try {assert.equal((await send("/account-transfers",payload,key)).status,500);assert.deepEqual(await state(),before);}
    finally {await db.query("DROP TRIGGER fail_transfer_in_test ON money_movements");await db.query("DROP FUNCTION fail_transfer_in_test()");}
    const result=await send("/account-transfers",payload,key);assert.equal(result.status,201);assert.deepEqual((await send("/account-transfers",payload,key)).body,result.body);
  });
  await check("opposite transfers auto-open two days once under sorted configuration/day/account locks",async()=>{
    const pairStores=[await makeStore(),await makeStore()].sort();const a=await makeAccount("BANK",pairStores,"100000");const b=await makeAccount("BANK",pairStores,"100000");
    const first={...input("5000"),sourceStoreId:pairStores[0]!,destinationStoreId:pairStores[1]!,sourceAccountId:a,destinationAccountId:b};
    const secondInput={...first,sourceStoreId:first.destinationStoreId,destinationStoreId:first.sourceStoreId,sourceAccountId:b,destinationAccountId:a};
    const retryKey=randomUUID();const before=await state();
    await db.query(`CREATE FUNCTION fail_transfer_day_test() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action='ACCOUNT_TRANSFER_CREATED' THEN RAISE EXCEPTION 'injected failure'; END IF; RETURN NEW; END $$`);
    await db.query("CREATE TRIGGER fail_transfer_day_test BEFORE INSERT ON audit_logs FOR EACH ROW EXECUTE FUNCTION fail_transfer_day_test()");
    try {assert.equal((await send("/account-transfers",first,retryKey)).status,500);assert.deepEqual(await state(),before);}
    finally {await db.query("DROP TRIGGER fail_transfer_day_test ON audit_logs");await db.query("DROP FUNCTION fail_transfer_day_test()");}
    const blocker=await db.connect();let pending:Promise<request.Response>[]=[];
    try {await blocker.query("BEGIN");await blocker.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",[`pos-lite-config:${pairStores[0]}`]);
      const pid=(await blocker.query("SELECT pg_backend_pid() AS pid")).rows[0].pid;
      pending=[send("/account-transfers",first,retryKey).then(r=>r),send("/account-transfers",secondInput).then(r=>r)];await waiters(pid,2);
      await blocker.query("COMMIT");assert.deepEqual((await Promise.all(pending)).map(r=>r.status),[201,201]);
      assert.equal(await balance(a),"100000");assert.equal(await balance(b),"100000");
      assert.equal((await db.query("SELECT count(*)::int AS n FROM business_days WHERE store_id=ANY($1::uuid[])",[pairStores])).rows[0].n,2);
    } finally {await blocker.query("ROLLBACK");blocker.release();await Promise.all(pending);}
  });
  await check("transfer checks amount plus fee and competes safely with owner withdrawal on a shared bank",async()=>{
    const before=await state();assert.equal((await send("/account-transfers",input(await balance(cash),"1"))).body.error.code,"INSUFFICIENT_FUNDS");assert.deepEqual(await state(),before);
    const spend=String(BigInt(await balance(bank))-1000n);const payload={...input(spend),sourceStoreId:second,destinationStoreId:store,sourceAccountId:bank,destinationAccountId:cash};
    const blocker=await db.connect();let pending:Promise<request.Response>[]=[];
    try {await blocker.query("BEGIN");await blocker.query("SELECT id FROM financial_accounts WHERE id=$1 FOR UPDATE",[bank]);const pid=(await blocker.query("SELECT pg_backend_pid() AS pid")).rows[0].pid;
      pending=[send("/account-transfers",payload).then(r=>r),send(`/stores/${second}/owner-transactions`,{businessDate:date,occurredAt:new Date().toISOString(),accountId:bank,kind:"WITHDRAWAL",amount:spend,note:"Fixture"}).then(r=>r)];
      await waiters(pid,2);await blocker.query("COMMIT");const results=await Promise.all(pending);
      assert.deepEqual(results.map(r=>r.status).sort(),[201,409]);assert.equal(results.find(r=>r.status===409)!.body.error.code,"INSUFFICIENT_FUNDS");assert.equal(await balance(bank),"1000");
    } finally {await blocker.query("ROLLBACK");blocker.release();await Promise.all(pending);}
  });
  await check("both days must be open; invalid/self/foreign account and authentication do not leave financial state",async()=>{
    const before=await state();assert.equal((await send("/account-transfers",{...input("1"),destinationAccountId:cash})).status,400);
    assert.equal((await send("/account-transfers",{...input("1"),sourceAccountId:randomUUID()})).status,404);
    assert.equal((await send("/account-transfers",{...input("1"),destinationStoreId:randomUUID()})).status,404);
    assert.equal((await send("/account-transfers",{...input("1"),occurredAt:"2099-01-01T00:00:00Z"})).status,422);
    assert.equal((await request(app).post("/api/v1/account-transfers").send(input())).status,401);
    assert.equal((await request(app).post("/api/v1/account-transfers").set("Cookie",`pos_lite_session=${session.token}`).send(input())).body.error.code,"ORIGIN_INVALID");
    assert.equal((await send("/account-transfers",input("1")).set("X-Expected-User-Id",randomUUID()).set("X-Expected-Business-Id",actor.business_id)).body.error.code,"SESSION_CONTEXT_CHANGED");
    for(const target of stores) {const day=(await db.query("SELECT id FROM business_days WHERE store_id=$1 AND business_date=$2",[target,date])).rows[0].id;
      await db.query("UPDATE business_days SET state='CLOSED' WHERE id=$1",[day]);try {assert.equal((await send("/account-transfers",input("1"))).body.error.code,"DAY_CLOSED");assert.deepEqual((await send("/account-transfers",original,originalKey)).body,committed.body);}
      finally {await db.query("UPDATE business_days SET state='OPEN' WHERE id=$1",[day]);}
    }assert.deepEqual(await state(),before);
  });
  await check("SQL transfer guards reject missing/unbalanced/wrong-scope legs, unpaid fees and immutable rewrites",async()=>{
    const sourceDay=(await db.query("SELECT id FROM business_days WHERE store_id=$1 AND business_date=$2",[store,date])).rows[0].id;
    const destinationDay=(await db.query("SELECT id FROM business_days WHERE store_id=$1 AND business_date=$2",[second,date])).rows[0].id;
    const before=await state();
    const insert=async(c:PoolClient,feeId:string | null=null)=>(await c.query(`INSERT INTO account_transfers(business_id,source_store_id,destination_store_id,source_day_id,destination_day_id,source_account_id,destination_account_id,amount,fee_amount,fee_expense_id,reason,occurred_at,created_by)
      VALUES($1,$2,$3,$4,$5,$6,$7,100,$8,$9,'Fixture',$10,$11) RETURNING id`,[actor.business_id,store,second,sourceDay,destinationDay,cash,bank,feeId ? "1" : "0",feeId,new Date().toISOString(),actor.user_id])).rows[0].id;
    const leg=(c:PoolClient,id:string,kind:string,delta:string,accountId=kind==="OUT" ? cash : bank)=>c.query(`INSERT INTO money_movements(business_id,store_id,day_id,account_id,transfer_id,leg,delta,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,
      [actor.business_id,kind==="OUT" ? store : second,kind==="OUT" ? sourceDay : destinationDay,accountId,id,kind,delta,actor.user_id]);
    await assert.rejects(transaction(runtime,async c=>{await insert(c);}),{code:"23514"});
    await assert.rejects(transaction(runtime,async c=>{const id=await insert(c);await leg(c,id,"OUT","-100");await leg(c,id,"IN","99");}),{code:"23514"});
    await assert.rejects(transaction(runtime,async c=>{const id=await insert(c);await leg(c,id,"OUT","-100",bank);await leg(c,id,"IN","100");}),{code:"23514"});
    await assert.rejects(transaction(runtime,async c=>{const id=await insert(c);await leg(c,id,"OUT","-100");await leg(c,id,"OUT","-100");}),{code:"23505"});
    await assert.rejects(transaction(runtime,async c=>{
      const category=(await c.query("SELECT id FROM expense_categories WHERE business_id=$1 AND name='ค่าธรรมเนียม'",[actor.business_id])).rows[0].id;
      const fee=(await c.query("INSERT INTO expenses(business_id,store_id,day_id,category_id,amount,description,occurred_at,created_by) VALUES($1,$2,$3,$4,1,'Fixture',$5,$6) RETURNING id",[actor.business_id,store,sourceDay,category,new Date().toISOString(),actor.user_id])).rows[0].id;
      const id=await insert(c,fee);await leg(c,id,"OUT","-100");await leg(c,id,"IN","100");}),{code:"23514"});
    await assert.rejects(runtime.query("UPDATE account_transfers SET amount=1"),{code:"42501"});await assert.rejects(runtime.query("DELETE FROM account_transfers"),{code:"42501"});assert.deepEqual(await state(),before);
  });
  await check("manager may transfer inside assigned store only; cross-store needs current owner including replay and lock waits",async()=>{
    const user=(await db.query("INSERT INTO users(username,password_hash) VALUES($1,'fixture') RETURNING id",[randomUUID()])).rows[0].id;
    await db.query("INSERT INTO business_memberships(business_id,user_id,role,created_by) VALUES($1,$2,'MEMBER',$3)",[actor.business_id,user,actor.user_id]);
    await db.query("INSERT INTO store_memberships(business_id,store_id,user_id,role,created_by) VALUES($1,$2,$3,'MANAGER',$4)",[actor.business_id,store,user,actor.user_id]);const who=await auth.issue(runtime,user,actor.business_id);
    assert.equal((await send("/account-transfers",input("1"),randomUUID(),who)).status,404);
    const local={...input("1","1"),destinationStoreId:store};
    const revision=(await db.query("SELECT revision::text FROM business_days WHERE store_id=$1 AND business_date=$2",[store,date])).rows[0].revision;
    assert.equal((await send("/account-transfers",local,randomUUID(),who)).status,201);
    assert.equal((await db.query("SELECT revision::text FROM business_days WHERE store_id=$1 AND business_date=$2",[store,date])).rows[0].revision,String(BigInt(revision)+1n));
    await db.query("INSERT INTO store_memberships(business_id,store_id,user_id,role,created_by) VALUES($1,$2,$3,'MANAGER',$4)",[actor.business_id,second,user,actor.user_id]);
    assert.equal((await send("/account-transfers",input("1"),randomUUID(),who)).status,403);
    await db.query("UPDATE store_memberships SET role='STAFF' WHERE user_id=$1",[user]);assert.equal((await send("/account-transfers",local,randomUUID(),who)).status,403);
    await db.query("UPDATE store_memberships SET role='MANAGER' WHERE user_id=$1",[user]);await db.query("UPDATE business_memberships SET role='OWNER' WHERE business_id=$1 AND user_id=$2",[actor.business_id,user]);
    const key=randomUUID();const payload=input("1");assert.equal((await send("/account-transfers",payload,key,who)).status,201);
    const before=await state();const blocker=await db.connect();let pending:Promise<request.Response> | undefined;
    try {await blocker.query("BEGIN");await blocker.query("SELECT id FROM financial_accounts WHERE id=$1 FOR UPDATE",[[cash,bank].sort()[0]]);const pid=(await blocker.query("SELECT pg_backend_pid() AS pid")).rows[0].pid;
      pending=send("/account-transfers",input("1"),randomUUID(),who).then(r=>r);await waiters(pid,1);
      await db.query("UPDATE business_memberships SET role='MEMBER' WHERE business_id=$1 AND user_id=$2",[actor.business_id,user]);await blocker.query("COMMIT");assert.equal((await pending).status,403);
    }finally {await blocker.query("ROLLBACK");blocker.release();await pending;}
    assert.deepEqual(await state(),before);assert.equal((await send("/account-transfers",payload,key,who)).status,403);
  });
}
