import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import type { Express } from "express";
import request from "supertest";
import { reconciliationPreviewResponseSchema, reconciliationResponseSchema, saleListResponseSchema } from "@pos-lite/validation";
import type { AuthService } from "../src/modules/auth/service.js";
import { transaction } from "../src/db/client.js";
import { SalesService } from "../src/modules/sales/service.js";

export async function reconciliationChecks(db:Pool,runtime:Pool,auth:AuthService,app:Express,check:(label:string,work:()=>Promise<void>)=>Promise<void>) {
  const actor=(await db.query("SELECT user_id,business_id FROM business_memberships WHERE role='OWNER' LIMIT 1")).rows[0];
  const session=await auth.issue(runtime,actor.user_id,actor.business_id);
  const send=(path:string,input:object,key=randomUUID(),who=session)=>request(app).post(`/api/v1${path}`).set("Cookie",`pos_lite_session=${who.token}`)
    .set("Origin",auth.config.origin).set("X-CSRF-Token",who.csrfToken).set("Idempotency-Key",key).send(input);
  const storeId=randomUUID();
  await db.query("INSERT INTO stores(id,business_id,name,code,created_by) VALUES($1::uuid,$2,'Reconciliation fixture',$1::uuid::text,$3)",[storeId,actor.business_id,actor.user_id]);
  const cash=(await send("/accounts",{name:randomUUID(),type:"CASH",storeIds:[storeId]})).body.data.id as string;
  const bank=(await send("/accounts",{name:randomUUID(),type:"BANK",storeIds:[storeId]})).body.data.id as string;
  for(const id of [cash,bank]) assert.equal((await send(`/accounts/${id}/opening`,{storeId,amount:"0",cutoverAt:"2000-01-01T00:00:00Z",reason:"Opening"})).status,201);
  const date=(await db.query("SELECT (clock_timestamp() AT TIME ZONE 'Asia/Bangkok')::date::text AS date")).rows[0].date as string;
  const occurredAt=new Date().toISOString(); const path=`/stores/${storeId}/sales-reconciliations`;
  const targets=(amount:string)=>[{accountId:cash,channel:"CASH" as const,amount}];
  const preview=async(amount:string)=>send(path+"/preview",{businessDate:date,targets:targets(amount)});
  const confirm=(amount:string,revision:string)=>({businessDate:date,occurredAt,expectedRevision:revision,targets:targets(amount),reason:"ตรวจยอดรวมทั้งวัน"});
  const state=async()=>Promise.all(["sales","sale_items","sale_payments","money_movements","business_days","day_openings","document_counters","reconciliation_records","reconciliation_lines","audit_logs","idempotency_records"]
    .map(async(table)=>(await db.query(`SELECT * FROM ${table} ORDER BY id`)).rows));
  let committed:request.Response; let originalInput:ReturnType<typeof confirm>; const originalKey=randomUUID();
  await check("reconciliation preview is read-only on unopened day; B/D include POS and supplemental once",async()=>{
    const before=await state(); const empty=await preview("0"); assert.equal(empty.status,200); assert.equal(empty.body.data.revision,"0"); assert.deepEqual(await state(),before);
    const product=(await send(`/stores/${storeId}/products`,{name:"Noodle",price:"30000"})).body.data.id;
    assert.equal((await send(`/stores/${storeId}/sales`,{businessDate:date,occurredAt,items:[{productId:product,expectedVersion:1,quantity:1}],discount:{kind:"FIXED",amount:"0"},
      payments:[{accountId:cash,channel:"CASH",amount:"30000",tendered:"30000"}]})).status,201);
    assert.equal((await send(`/stores/${storeId}/supplemental-sales`,{businessDate:date,occurredAt,amount:"10000",reason:"Unrecorded sales",payments:[{accountId:cash,channel:"CASH",amount:"10000",tendered:"10000"}]})).status,201);
    const beforePreview=await state(); const result=await preview("50000"); assert.equal(result.status,200); reconciliationPreviewResponseSchema.parse(result.body);
    assert.equal(result.body.data.lines[0].recorded,"40000"); assert.equal(result.body.data.lines[0].delta,"10000"); assert.equal(result.body.data.netSales,"50000"); assert.deepEqual(await state(),beforePreview);
    originalInput=confirm("50000",result.body.data.revision); committed=await send(path,originalInput,originalKey);
    assert.equal(committed.status,201); reconciliationResponseSchema.parse(committed.body);
    assert.equal(committed.body.data.createdSales[0].kind,"RECONCILIATION"); assert.equal(committed.body.data.createdSales[0].net,"10000");
    assert.equal((await db.query("SELECT sum(delta)::text AS total FROM money_movements WHERE account_id=$1",[cash])).rows[0].total,"50000");
    assert.deepEqual((await send(path,originalInput,originalKey)).body,committed.body);
  });
  await check("C no-change stores audited result and revision without sales or movements; G never reduces money",async()=>{
    const before=(await db.query("SELECT count(*)::int AS n FROM money_movements")).rows[0].n;
    const p=await preview("50000"); const result=await send(path,confirm("50000",p.body.data.revision)); assert.equal(result.status,201); assert.deepEqual(result.body.data.createdSales,[]);
    assert.equal(result.body.data.dayRevision,String(BigInt(p.body.data.revision)+1n));
    assert.equal((await db.query("SELECT after_data->>'outcome' AS outcome FROM audit_logs WHERE entity_id=$1",[result.body.data.id])).rows[0].outcome,"NO_CHANGE");
    assert.equal((await db.query("SELECT count(*)::int AS n FROM money_movements")).rows[0].n,before);
    const baseline=await state(); const lower=await preview("40000"); assert.equal(lower.body.data.lines[0].delta,"-10000"); assert.equal(lower.body.data.lines[0].requiresReview,true); assert.deepEqual(lower.body.data.accountEffects,[]);
    assert.equal((await send(path,confirm("40000",lower.body.data.revision))).body.error.code,"RECONCILIATION_REQUIRES_REVIEW"); assert.deepEqual(await state(),baseline);
  });
  await check("F two blocked confirm connections yield one posting and one stale preview",async()=>{
    const p=await preview("70000"); const input=confirm("70000",p.body.data.revision);
    const blocker=await db.connect(); let first:Promise<request.Response> | undefined; let second:Promise<request.Response> | undefined;
    try {
      await blocker.query("BEGIN"); const pid=(await blocker.query("SELECT pg_backend_pid() AS id")).rows[0].id;
      await blocker.query("SELECT id FROM business_days WHERE store_id=$1 FOR UPDATE",[storeId]);
      first=send(path,input).then(r=>r);
      const deadline=Date.now()+5000; let blocked=false;
      while(Date.now()<deadline) {blocked=!!(await db.query("SELECT 1 FROM pg_stat_activity WHERE $1::int=ANY(pg_blocking_pids(pid))",[pid])).rowCount;if(blocked) break;}
      assert.ok(blocked); second=send(path,input).then(r=>r);
      let competitors=false;
      while(Date.now()<deadline) {competitors=Number((await db.query("SELECT count(*) AS n FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock'")).rows[0].n)>=2;if(competitors) break;}
      assert.ok(competitors,"both requests must be waiting before release"); await blocker.query("COMMIT");
      const results=await Promise.all([first,second]); assert.deepEqual(results.map(r=>r.status).sort(),[201,409]);
      assert.equal(results.find(r=>r.status===409)!.body.error.code,"STALE_PREVIEW");
      assert.equal((await preview("70000")).body.data.lines[0].delta,"0");
      assert.equal((await db.query("SELECT sum(delta)::text AS total FROM money_movements WHERE account_id=$1",[cash])).rows[0].total,"70000");
    } finally {await blocker.query("ROLLBACK");blocker.release();await Promise.all([first,second]);}
  });
  await check("multi-bucket reconciliation is atomic at audit failure and retries once with original key",async()=>{
    const p=await preview("90000"); const input={...confirm("90000",p.body.data.revision),targets:[...targets("90000"),{accountId:bank,channel:"TRANSFER",amount:"10000"}]};
    const key=randomUUID(); const baseline=await state();
    await db.query(`CREATE FUNCTION fail_reconciliation_test() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action='RECONCILIATION_CONFIRMED' THEN RAISE EXCEPTION 'injected failure'; END IF; RETURN NEW; END $$`);
    await db.query("CREATE TRIGGER fail_reconciliation_test BEFORE INSERT ON audit_logs FOR EACH ROW EXECUTE FUNCTION fail_reconciliation_test()");
    try {assert.equal((await send(path,input,key)).status,500);assert.deepEqual(await state(),baseline);}
    finally {await db.query("DROP TRIGGER fail_reconciliation_test ON audit_logs");await db.query("DROP FUNCTION fail_reconciliation_test()");}
    const results=await Promise.all([send(path,input,key),send(path,input,key)]); assert.equal(results[0]!.status,201);assert.deepEqual(results[0]!.body,results[1]!.body);
    assert.equal(results[0]!.body.data.createdSales.length,2);assert.equal((await send(path,{...input,reason:"changed"},key)).body.error.code,"IDEMPOTENCY_CONFLICT");
    const omitted=await preview("90000"); assert.equal(omitted.body.data.netSales,"100000");assert.equal(omitted.body.data.lines.length,1);
    const history=await request(app).get(`/api/v1/stores/${storeId}/sales?from=${date}&to=${date}`).set("Cookie",`pos_lite_session=${session.token}`); assert.equal(history.status,200);saleListResponseSchema.parse(history.body);
  });
  await check("reconciliation denies staff, foreign accounts and bad time; CLOSED preview reads but confirm rejects",async()=>{
    const staffId=randomUUID();await db.query("INSERT INTO users(id,username,password_hash) SELECT $1,$2,password_hash FROM users WHERE id=$3",[staffId,randomUUID(),actor.user_id]);
    await db.query("INSERT INTO business_memberships(business_id,user_id,role,created_by) VALUES($1,$2,'MEMBER',$3)",[actor.business_id,staffId,actor.user_id]);
    await db.query("INSERT INTO store_memberships(business_id,store_id,user_id,role,created_by) VALUES($1,$2,$3,'STAFF',$4)",[actor.business_id,storeId,staffId,actor.user_id]);
    const staff=await auth.issue(runtime,staffId,actor.business_id); let p=await preview("90000");
    assert.equal((await send(path+"/preview",{businessDate:date,targets:targets("90000")},randomUUID(),staff)).status,403);
    assert.equal((await send(path,originalInput,originalKey,staff)).status,403);
    await db.query("UPDATE store_memberships SET role='MANAGER' WHERE store_id=$1 AND user_id=$2",[storeId,staffId]);
    const managerKey=randomUUID(); const managerInput=confirm("90000",p.body.data.revision);
    assert.equal((await send(path,managerInput,managerKey,staff)).status,201);
    await db.query("UPDATE store_memberships SET role='STAFF' WHERE store_id=$1 AND user_id=$2",[storeId,staffId]);
    assert.equal((await send(path,managerInput,managerKey,staff)).status,403);
    p=await preview("90000");
    const baseline=await state();
    assert.equal((await send(path+"/preview",{businessDate:date,targets:[{accountId:randomUUID(),channel:"CASH",amount:"0"}]})).status,404);
    assert.equal((await send(path,{...confirm("90000",p.body.data.revision),occurredAt:new Date(Date.now()+60000).toISOString()})).status,422);
    assert.deepEqual(await state(),baseline);
    await db.query("UPDATE business_days SET state='CLOSED' WHERE store_id=$1",[storeId]);
    assert.equal((await preview("90000")).status,200);assert.equal((await send(path,confirm("90000",p.body.data.revision))).body.error.code,"DAY_CLOSED");
    assert.deepEqual((await send(path,originalInput,originalKey)).body,committed.body);
    await db.query("UPDATE business_days SET state='OPEN' WHERE store_id=$1",[storeId]);
  });
  await check("deferred reconciliation guard rejects empty headers and orphan reconciliation sales",async()=>{
    await assert.rejects(transaction(db,async client=>{
      await client.query("UPDATE business_days SET revision=revision+1 WHERE store_id=$1",[storeId]);
      await client.query(`INSERT INTO reconciliation_records(business_id,store_id,day_id,base_revision,day_revision,reason,occurred_at,created_by)
        SELECT business_id,store_id,id,revision-1,revision,'Invalid empty record',$2,$3 FROM business_days WHERE store_id=$1`,[storeId,occurredAt,actor.user_id]);
    }),{code:"23514"});
    await assert.rejects(transaction(db,async client=>{
      const day=(await client.query("UPDATE business_days SET revision=revision+1 WHERE store_id=$1 RETURNING id,revision::text",[storeId])).rows[0];
      const record=(await client.query(`INSERT INTO reconciliation_records(business_id,store_id,day_id,base_revision,day_revision,reason,occurred_at,created_by)
        VALUES($1,$2,$3,$4,$5,'Forged recorded amount',$6,$7) RETURNING id`,[actor.business_id,storeId,day.id,String(BigInt(day.revision)-1n),day.revision,occurredAt,actor.user_id])).rows[0];
      await client.query(`INSERT INTO reconciliation_lines(business_id,store_id,day_id,reconciliation_id,account_id,channel,recorded,target,delta)
        VALUES($1,$2,$3,$4,$5,'CASH',0,0,0)`,[actor.business_id,storeId,day.id,record.id,cash]);
    }), (error:unknown)=>error instanceof Error && "code" in error && error.code==="23514" && error.message.includes("line mismatch"));
    const resolved=await auth.resolve(session.token); assert.ok(resolved);
    await assert.rejects(transaction(runtime,async client=>{
      const day=(await client.query("SELECT id FROM business_days WHERE store_id=$1 FOR UPDATE",[storeId])).rows[0];
      await new SalesService(runtime).postToDay(client,{...resolved,user_id:actor.user_id,business_id:actor.business_id},storeId,day.id,
        {businessDate:date,occurredAt,amount:"100",reason:"Missing reconciliation line",payments:[{accountId:cash,channel:"CASH",amount:"100",tendered:"100"}]},randomUUID(),"RECONCILIATION");
    }), (error:unknown)=>error instanceof Error && "code" in error && error.code==="23514" && error.message.includes("needs a source line"));
    await assert.rejects(runtime.query("UPDATE reconciliation_records SET reason='changed'"),{code:"42501"});
  });
}
