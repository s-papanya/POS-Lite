import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { Express } from "express";
import type { Pool } from "pg";
import request from "supertest";
import { businessDayResponseSchema } from "@pos-lite/validation";
import { AuthService } from "../src/modules/auth/service.js";
import { transaction } from "../src/db/client.js";
import { lockStoreConfiguration } from "../src/db/store-locks.js";

export async function businessDaysChecks(db:Pool,runtime:Pool,auth:AuthService,app:Express,
  check:(label:string,work:()=>Promise<void>)=>Promise<void>) {
  const owner=(await db.query("SELECT user_id,business_id FROM business_memberships WHERE role='OWNER' LIMIT 1")).rows[0];
  const issued=await auth.issue(runtime,owner.user_id,owner.business_id);
  const cookie=`pos_lite_session=${issued.token}`;
  const today=(await db.query("SELECT (clock_timestamp() AT TIME ZONE 'Asia/Bangkok')::date::text AS date")).rows[0].date as string;
  const post=(path:string,body:object,key:string=randomUUID(),session=issued)=>request(app).post(`/api/v1${path}`)
    .set("Cookie",`pos_lite_session=${session.token}`).set("Origin",auth.config.origin).set("X-CSRF-Token",session.csrfToken).set("Idempotency-Key",key).send(body);
  const store=async()=>{
    const id=randomUUID();
    await db.query("INSERT INTO stores(id,business_id,name,code,created_by) VALUES($1,$2,'Day fixture',$3,$4)",[id,owner.business_id,id,owner.user_id]);
    return id;
  };
  const make=async(storeId:string,type:"CASH" | "BANK"="CASH",amount:string | null="50000")=>{
    const response=await post("/accounts",{name:randomUUID(),type,storeIds:[storeId]}); assert.equal(response.status,201);
    const account=response.body.data.id as string;
    if(amount!==null) assert.equal((await post(`/accounts/${account}/opening`,{storeId,amount,cutoverAt:"2000-01-01T00:00:00Z",reason:"Test opening"})).status,201);
    return account;
  };
  const ready=await store(); const cash=await make(ready); const bank=await make(ready,"BANK","9000000000000");
  const path=`/stores/${ready}/business-days`;
  const waitBlocked=async(pid:number)=>{
    const deadline=Date.now()+5000;
    while(Date.now()<deadline) {
      if((await db.query(`SELECT 1 FROM pg_locks l WHERE l.locktype='advisory' AND NOT l.granted
        AND $1::int=ANY(pg_blocking_pids(l.pid))`,[pid])).rowCount) return;
    }
    assert.fail("request must wait for the configuration lock");
  };
  await check("Bangkok calendar changes at 17:00 UTC",async()=>{
    assert.deepEqual((await db.query(`SELECT (t AT TIME ZONE 'Asia/Bangkok')::date::text AS date FROM
      (VALUES ('2026-10-22T16:59:59Z'::timestamptz),('2026-10-22T17:00:00Z'::timestamptz))v(t)`)).rows,
      [{date:"2026-10-22"},{date:"2026-10-23"}]);
  });
  await check("day opening validates date, session, origin, CSRF, key and initial balances",async()=>{
    assert.equal((await request(app).post(`/api/v1${path}`).send({businessDate:today})).status,401);
    assert.equal((await request(app).post(`/api/v1${path}`).set("Cookie",cookie).send({businessDate:today})).status,403);
    assert.equal((await request(app).post(`/api/v1${path}`).set("Cookie",cookie).set("Origin",auth.config.origin).set("X-CSRF-Token","bad").send({businessDate:today})).status,403);
    assert.equal((await post(path,{businessDate:today},"bad")).status,400);
    for(const businessDate of ["2026-02-30","2000-01-01","2999-01-01"]) {
      assert.equal((await post(path,{businessDate})).status,businessDate==="2026-02-30" ? 400 : 422);
    }
    assert.equal((await post(path,{businessDate:today,amount:"1"})).status,400);
    assert.equal((await post(`${path}?amount=1`,{businessDate:today})).status,400);
    const empty=await store();
    assert.equal((await post(`/stores/${empty}/business-days`,{businessDate:today})).body.error.code,"INITIAL_BALANCES_REQUIRED");
    const pending=await make(empty,"BANK",null);
    assert.equal((await post(`/stores/${empty}/business-days`,{businessDate:today})).status,409);
    assert.equal((await post(`/accounts/${pending}/opening`,{storeId:empty,amount:"0",cutoverAt:"2000-01-01T00:00:00Z",reason:"Zero"})).status,201);
    const bankOnly=await post(`/stores/${empty}/business-days`,{businessDate:today});
    assert.equal(bankOnly.status,201); assert.deepEqual(bankOnly.body.data.openingSnapshots,[]);
    assert.equal((await post(`/stores/${randomUUID()}/business-days`,{businessDate:today})).status,404);
  });
  await check("concurrent days replay once, snapshot cash only and never add ledger money",async()=>{
    const before=(await db.query("SELECT count(*)::int AS n,sum(delta)::text AS total FROM money_movements")).rows;
    const key=randomUUID();
    const responses=await Promise.all([post(path,{businessDate:today},key),post(path,{businessDate:today},key),post(path,{businessDate:today})]);
    assert.deepEqual(responses.map((r)=>r.status).sort(),[200,201,201]);
    const first=responses[0]!; businessDayResponseSchema.parse(first.body);
    assert.deepEqual(first.body,responses[1]!.body); assert.deepEqual(first.body,responses[2]!.body);
    assert.deepEqual(first.body.data.openingSnapshots,[{accountId:cash,amount:"50000"}]);
    assert.equal(first.body.data.revision,"0");
    assert.deepEqual((await db.query("SELECT count(*)::int AS n,sum(delta)::text AS total FROM money_movements")).rows,before);
    assert.equal((await db.query("SELECT count(*)::int AS n FROM audit_logs WHERE store_id=$1 AND action='BUSINESS_DAY_OPENED'",[ready])).rows[0].n,1);
    assert.equal((await post(path,{businessDate:"2000-01-01"},key)).body.error.code,"IDEMPOTENCY_CONFLICT");
    const read=await request(app).get(`/api/v1${path}/${today}`).set("Cookie",cookie);
    assert.equal(read.status,200); assert.deepEqual(read.body,first.body);
    assert.equal((await post("/accounts",{name:randomUUID(),type:"BANK",storeIds:[ready]})).body.error.code,"ACCOUNT_CONFIGURATION_LOCKED");
    const patch=(body:object)=>request(app).patch(`/api/v1/accounts/${cash}`).set("Cookie",cookie).set("Origin",auth.config.origin).set("X-CSRF-Token",issued.csrfToken).set("Idempotency-Key",randomUUID()).send(body);
    assert.equal((await patch({active:false})).status,409);
    assert.equal((await patch({name:randomUUID()})).status,200);
    await assert.rejects(runtime.query("UPDATE day_openings SET amount=1"),{code:"42501"});
    await assert.rejects(runtime.query("UPDATE business_days SET state='CLOSED'"),{code:"42501"});
    const dayId=first.body.data.id as string;
    const extra=(accountId:string)=>runtime.query(`INSERT INTO day_openings(business_id,store_id,day_id,account_id,amount,recorded_at,created_by)
      SELECT business_id,store_id,id,$2,0,opened_at,created_by FROM business_days WHERE id=$1`,[dayId,accountId]);
    await assert.rejects(extra(cash),{code:"23505"});
    await assert.rejects(extra(bank),{code:"23514"});
    await assert.rejects(runtime.query(`INSERT INTO day_openings(business_id,store_id,day_id,account_id,amount,recorded_at,created_by)
      SELECT business_id,$2,id,$3,0,opened_at,created_by FROM business_days WHERE id=$1`,[dayId,await store(),bank]),{code:"23503"});
    await assert.rejects(runtime.query(`INSERT INTO business_days(business_id,store_id,business_date,opened_at,created_by)
      SELECT business_id,store_id,business_date+1,opened_at+interval '1 day',created_by FROM business_days WHERE id=$1`,[dayId]),{code:"23505"});
    await runtime.query("UPDATE business_days SET revision=9007199254740993 WHERE id=$1",[dayId]);
    const large=await request(app).get(`/api/v1${path}/${today}`).set("Cookie",cookie);
    businessDayResponseSchema.parse(large.body); assert.equal(large.body.data.revision,"9007199254740993");
    await db.query("UPDATE business_days SET state='CLOSED' WHERE id=$1",[dayId]);
    assert.deepEqual((await post(path,{businessDate:today},key)).body,first.body);
    assert.equal((await db.query("SELECT state FROM business_days WHERE id=$1",[dayId])).rows[0].state,"CLOSED");
    await db.query("UPDATE business_days SET state='OPEN' WHERE id=$1",[dayId]);
  });
  await check("staff cannot see cash or open days; assigned manager can open",async()=>{
    const userId=randomUUID();
    await db.query("INSERT INTO users(id,username,password_hash) SELECT $1,$2,password_hash FROM users WHERE id=$3",[userId,randomUUID(),owner.user_id]);
    await db.query("INSERT INTO business_memberships(business_id,user_id,role,created_by) VALUES($1,$2,'MEMBER',$3)",[owner.business_id,userId,owner.user_id]);
    await db.query("INSERT INTO store_memberships(business_id,store_id,user_id,role,created_by) VALUES($1,$2,$3,'STAFF',$4)",[owner.business_id,ready,userId,owner.user_id]);
    const staff=await auth.issue(runtime,userId,owner.business_id);
    const read=await request(app).get(`/api/v1${path}/${today}`).set("Cookie",`pos_lite_session=${staff.token}`);
    assert.equal(read.status,200); businessDayResponseSchema.parse(read.body); assert.ok(!("openingSnapshots" in read.body.data));
    assert.equal((await post(path,{businessDate:today},randomUUID(),staff)).status,403);
    const managed=await store(); await make(managed,"CASH","0");
    assert.equal((await post(`/stores/${managed}/business-days`,{businessDate:today},randomUUID(),staff)).status,404);
    await db.query("INSERT INTO store_memberships(business_id,store_id,user_id,role,created_by) VALUES($1,$2,$3,'MANAGER',$4)",[owner.business_id,managed,userId,owner.user_id]);
    const opened=await post(`/stores/${managed}/business-days`,{businessDate:today},randomUUID(),staff);
    assert.equal(opened.status,201); assert.equal(opened.body.data.openingSnapshots[0].amount,"0");
    const foreign=(await db.query("SELECT id FROM stores WHERE business_id<>$1 LIMIT 1",[owner.business_id])).rows[0];
    if(foreign) assert.equal((await post(`/stores/${foreign.id}/business-days`,{businessDate:today})).status,404);
  });
  await check("audit failure rolls back day, snapshots and replay record",async()=>{
    const target=await store(); await make(target); const key=randomUUID();
    await db.query(`CREATE FUNCTION reject_day_test_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
      IF NEW.action='BUSINESS_DAY_OPENED' THEN RAISE EXCEPTION 'Injected audit failure'; END IF; RETURN NEW; END $$;
      CREATE TRIGGER reject_day_test_audit BEFORE INSERT ON audit_logs FOR EACH ROW EXECUTE FUNCTION reject_day_test_audit()`);
    try {
      assert.equal((await post(`/stores/${target}/business-days`,{businessDate:today},key)).status,500);
      assert.equal((await db.query("SELECT count(*)::int AS n FROM business_days WHERE store_id=$1",[target])).rows[0].n,0);
      assert.equal((await db.query("SELECT count(*)::int AS n FROM day_openings WHERE store_id=$1",[target])).rows[0].n,0);
      assert.equal((await db.query("SELECT count(*)::int AS n FROM idempotency_records WHERE key=$1",[key])).rows[0].n,0);
    } finally {await db.query("DROP TRIGGER reject_day_test_audit ON audit_logs; DROP FUNCTION reject_day_test_audit()");}
    assert.equal((await post(`/stores/${target}/business-days`,{businessDate:today},key)).status,201);
  });
  await check("incomplete or incorrect cash snapshots fail at real commit; previous days fail closed",async()=>{
    const target=await store(); const account=await make(target);
    const insert=async(amount?:string)=>transaction(db,async(client)=>{
      const day=(await client.query(`INSERT INTO business_days(business_id,store_id,business_date,created_by)
        VALUES($1,$2,$3,$4) RETURNING id,opened_at`,[owner.business_id,target,today,owner.user_id])).rows[0];
      if(amount!==undefined) await client.query("INSERT INTO day_openings(business_id,store_id,day_id,account_id,amount,recorded_at,created_by) SELECT business_id,store_id,id,$2,$3,opened_at,created_by FROM business_days WHERE id=$1",[day.id,account,amount]);
    });
    await assert.rejects(insert(),{code:"23514"}); await assert.rejects(insert("49999"),{code:"23514"});
    await insert("50000");
    await db.query("UPDATE business_days SET business_date=business_date-1,opened_at=opened_at-interval '1 day' WHERE store_id=$1",[target]);
    assert.equal((await post(`/stores/${target}/business-days`,{businessDate:today})).body.error.code,"PREVIOUS_DAY_UNSETTLED");
    await db.query("UPDATE business_days SET state='CLOSED' WHERE store_id=$1",[target]);
    assert.equal((await post(`/stores/${target}/business-days`,{businessDate:today})).body.error.code,"PREVIOUS_DAY_UNSETTLED");
    await db.query("UPDATE business_days SET business_date=business_date+1,opened_at=opened_at+interval '1 day' WHERE store_id=$1",[target]);
    assert.equal((await post(`/stores/${target}/business-days`,{businessDate:today})).body.error.code,"DAY_CLOSED");
  });
  await check("account activation waits for the same configuration gate as day opening",async()=>{
    const target=await store(); await make(target); const pending=await make(target,"BANK",null);
    await db.query("UPDATE financial_accounts SET active=false WHERE id=$1",[pending]);
    const blocker=await db.connect();
    let response:Promise<request.Response> | undefined;
    try {
      await blocker.query("BEGIN"); await lockStoreConfiguration(blocker,[target]);
      const pid=(await blocker.query("SELECT pg_backend_pid() AS pid")).rows[0].pid as number;
      response=request(app).patch(`/api/v1/accounts/${pending}`).set("Cookie",cookie).set("Origin",auth.config.origin)
        .set("X-CSRF-Token",issued.csrfToken).set("Idempotency-Key",randomUUID()).send({active:true}).then((r)=>r);
      await waitBlocked(pid);
      // The lock holder opens the day before allowing the queued activation to continue.
      await blocker.query(`INSERT INTO business_days(business_id,store_id,business_date,created_by)
        VALUES($1,$2,$3,$4)`,[owner.business_id,target,today,owner.user_id]);
      await blocker.query(`INSERT INTO day_openings(business_id,store_id,day_id,account_id,amount,recorded_at,created_by)
        SELECT d.business_id,d.store_id,d.id,a.id,50000,d.opened_at,d.created_by FROM business_days d
        JOIN account_stores m ON m.business_id=d.business_id AND m.store_id=d.store_id
        JOIN financial_accounts a ON a.id=m.account_id AND a.active AND a.type='CASH' WHERE d.store_id=$1`,[target]);
      await blocker.query("COMMIT");
      assert.equal((await response).body.error.code,"ACCOUNT_CONFIGURATION_LOCKED");
      assert.equal((await db.query("SELECT active FROM financial_accounts WHERE id=$1",[pending])).rows[0].active,false);
    } finally {await blocker.query("ROLLBACK"); blocker.release(); await response;}
  });
  await check("day opening waits for configuration then observes an activated unopened bank",async()=>{
    const target=await store(); await make(target); const pending=await make(target,"BANK",null);
    await db.query("UPDATE financial_accounts SET active=false WHERE id=$1",[pending]);
    const blocker=await db.connect(); let response:Promise<request.Response> | undefined;
    try {
      await blocker.query("BEGIN"); await lockStoreConfiguration(blocker,[target]);
      const pid=(await blocker.query("SELECT pg_backend_pid() AS pid")).rows[0].pid as number;
      await blocker.query("UPDATE financial_accounts SET active=true WHERE id=$1",[pending]);
      response=post(`/stores/${target}/business-days`,{businessDate:today}).then((r)=>r);
      await waitBlocked(pid); await blocker.query("COMMIT");
      assert.equal((await response).body.error.code,"INITIAL_BALANCES_REQUIRED");
      assert.equal((await db.query("SELECT count(*)::int AS n FROM business_days WHERE store_id=$1",[target])).rows[0].n,0);
    } finally {await blocker.query("ROLLBACK"); blocker.release(); await response;}
  });
  await check("owner revoked while awaiting configuration lock cannot commit account creation",async()=>{
    const target=await store(); const name=randomUUID(); const key=randomUUID();
    const blocker=await db.connect(); let response:Promise<request.Response> | undefined;
    try {
      await blocker.query("BEGIN"); await lockStoreConfiguration(blocker,[target]);
      const pid=(await blocker.query("SELECT pg_backend_pid() AS pid")).rows[0].pid as number;
      response=post("/accounts",{name,type:"BANK",storeIds:[target]},key).then((r)=>r);
      await waitBlocked(pid);
      await db.query("UPDATE business_memberships SET role='MEMBER' WHERE business_id=$1 AND user_id=$2",[owner.business_id,owner.user_id]);
      await blocker.query("COMMIT"); assert.equal((await response).status,403);
      assert.equal((await db.query("SELECT count(*)::int AS n FROM financial_accounts WHERE name=$1",[name])).rows[0].n,0);
      assert.equal((await db.query("SELECT count(*)::int AS n FROM idempotency_records WHERE key=$1",[key])).rows[0].n,0);
    } finally {
      await blocker.query("ROLLBACK"); blocker.release(); await response;
      await db.query("UPDATE business_memberships SET role='OWNER' WHERE business_id=$1 AND user_id=$2",[owner.business_id,owner.user_id]);
    }
  });
}
