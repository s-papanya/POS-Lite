import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { Express } from "express";
import type { Pool } from "pg";
import request from "supertest";
import { saleListResponseSchema, supplementalSaleSchema } from "@pos-lite/validation";
import { transaction } from "../src/db/client.js";
import type { AuthService } from "../src/modules/auth/service.js";

export async function supplementalChecks(db:Pool,runtime:Pool,auth:AuthService,app:Express,
  check:(label:string,work:()=>Promise<void>)=>Promise<void>) {
  const owner=(await db.query("SELECT user_id,business_id FROM business_memberships WHERE role='OWNER' LIMIT 1")).rows[0];
  const session=await auth.issue(runtime,owner.user_id,owner.business_id);
  const send=(path:string,input:object,key=randomUUID(),who=session)=>request(app).post(`/api/v1${path}`)
    .set("Cookie",`pos_lite_session=${who.token}`).set("Origin",auth.config.origin).set("X-CSRF-Token",who.csrfToken).set("Idempotency-Key",key).send(input);
  const storeId=randomUUID();
  await db.query("INSERT INTO stores(id,business_id,name,code,created_by) VALUES($1::uuid,$2,'Supplemental fixture',$1::uuid::text,$3)",[storeId,owner.business_id,owner.user_id]);
  const cash=(await send("/accounts",{name:randomUUID(),type:"CASH",storeIds:[storeId]})).body.data.id as string;
  const bank=(await send("/accounts",{name:randomUUID(),type:"BANK",storeIds:[storeId]})).body.data.id as string;
  for(const account of [cash,bank]) assert.equal((await send(`/accounts/${account}/opening`,{storeId,amount:"0",cutoverAt:"2000-01-01T00:00:00Z",reason:"Opening"})).status,201);
  const today=(await db.query("SELECT (clock_timestamp() AT TIME ZONE 'Asia/Bangkok')::date::text AS date")).rows[0].date as string;
  const input={businessDate:today,occurredAt:new Date().toISOString(),amount:"10000",reason:"ยอดขายที่ยังไม่ได้บันทึก",
    payments:[{accountId:cash,channel:"CASH",amount:"4000",tendered:"10000"},{accountId:bank,channel:"TRANSFER",amount:"6000"}]};
  const path=`/stores/${storeId}/supplemental-sales`; const key=randomUUID();
  let original:request.Response;
  const snapshot=async()=>Promise.all(["sales","sale_items","sale_payments","money_movements","audit_logs","idempotency_records","document_counters","business_days","day_openings"]
    .map(async(table)=>(await db.query(`SELECT * FROM ${table} ORDER BY id`)).rows));
  await check("supplemental sale atomically auto-opens, posts exact split net and appears in history without items",async()=>{
    original=await send(path,input,key); assert.equal(original.status,201); supplementalSaleSchema.parse(original.body.data);
    const sale=original.body.data;
    assert.equal(sale.kind,"SUPPLEMENTAL"); assert.equal(sale.reason,input.reason); assert.deepEqual(sale.items,[]);
    assert.equal(sale.gross,"10000"); assert.equal(sale.net,"10000"); assert.equal(sale.discount,"0"); assert.equal(sale.dayRevision,"1");
    assert.equal(sale.reference,`SUP-${today.replaceAll("-","")}-000001`);
    assert.equal(sale.payments.find((p:{channel:string})=>p.channel==="CASH").change,"6000");
    const balances=(await db.query("SELECT account_id,sum(delta)::text AS amount FROM money_movements WHERE account_id=ANY($1::uuid[]) GROUP BY account_id ORDER BY account_id",[[cash,bank]])).rows;
    assert.equal(balances.find(b=>b.account_id===cash).amount,"4000"); assert.equal(balances.find(b=>b.account_id===bank).amount,"6000");
    assert.equal((await db.query("SELECT amount::text FROM day_openings WHERE store_id=$1",[storeId])).rows[0].amount,"0");
    assert.equal((await db.query("SELECT action,after_data FROM audit_logs WHERE entity_id=$1",[sale.id])).rows[0].action,"SUPPLEMENTAL_SALE_CREATED");
    const history=await request(app).get(`/api/v1/stores/${storeId}/sales?from=${today}&to=${today}`).set("Cookie",`pos_lite_session=${session.token}`);
    assert.equal(history.status,200); saleListResponseSchema.parse(history.body); assert.deepEqual(history.body.data,[sale]);
  });
  await check("supplemental replay and simultaneous keys never duplicate payments and changed path or payload conflicts",async()=>{
    assert.deepEqual((await send(path,input,key)).body,original.body);
    const results=await Promise.all([send(path,input),send(path,input,key),send(path,input,key)]);
    assert.ok(results.every(r=>r.status===201)); assert.deepEqual(results[1]!.body,original.body);
    const concurrentKey=randomUUID(); const same=await Promise.all([send(path,input,concurrentKey),send(path,input,concurrentKey)]);
    assert.equal(same[0]!.status,201); assert.deepEqual(same[0]!.body,same[1]!.body);
    const before=await snapshot();
    assert.equal((await send(path,{...input,reason:"changed"},key)).body.error.code,"IDEMPOTENCY_CONFLICT");
    const product=(await db.query("INSERT INTO products(business_id,store_id,name,price,created_by) VALUES($1,$2,'Noodle',10000,$3) RETURNING id",[owner.business_id,storeId,owner.user_id])).rows[0].id;
    const pos={businessDate:today,occurredAt:input.occurredAt,items:[{productId:product,expectedVersion:1,quantity:1}],discount:{kind:"FIXED",amount:"0"},payments:input.payments};
    assert.equal((await send(`/stores/${storeId}/sales`,pos,key)).body.error.code,"IDEMPOTENCY_CONFLICT");
    assert.deepEqual(await snapshot(),before);
    assert.equal((await db.query("SELECT count(*)::int AS n,sum(net)::text AS total FROM sales WHERE store_id=$1",[storeId])).rows[0].n,3);
    assert.equal((await db.query("SELECT count(*)::int AS n FROM sale_payments WHERE store_id=$1",[storeId])).rows[0].n,6);
  });
  await check("supplemental denies malformed totals, missing account scope, future time and CSRF without posting",async()=>{
    const before=await snapshot();
    for(const bad of [{...input,amount:"0"},{...input,reason:" "},{...input,items:[]},{...input,kind:"POS"}]) assert.equal((await send(path,bad)).status,400);
    assert.equal((await send(path,{...input,amount:"9999"})).body.error.code,"INVALID_SALE_TOTALS");
    assert.equal((await send(path,{...input,payments:[{accountId:cash,channel:"CASH",amount:"10000",tendered:"1"}]})).body.error.code,"INSUFFICIENT_TENDERED");
    assert.equal((await send(path,{...input,payments:[{accountId:bank,channel:"CASH",amount:"10000",tendered:"10000"}]})).body.error.code,"ACCOUNT_CHANNEL_MISMATCH");
    assert.equal((await send(path,{...input,payments:[{accountId:randomUUID(),channel:"TRANSFER",amount:"10000"}]})).status,404);
    assert.equal((await send(path,{...input,occurredAt:new Date(Date.now()+60000).toISOString()})).body.error.code,"INVALID_OCCURRED_AT");
    assert.equal((await request(app).post(`/api/v1${path}`).set("Cookie",`pos_lite_session=${session.token}`).set("Origin",auth.config.origin).set("Idempotency-Key",randomUUID()).send(input)).status,403);
    assert.deepEqual(await snapshot(),before);
  });
  await check("supplemental permits managers, denies staff and rechecks revoked role before replay",async()=>{
    const userId=randomUUID();
    await db.query("INSERT INTO users(id,username,password_hash) SELECT $1,$2,password_hash FROM users WHERE id=$3",[userId,randomUUID(),owner.user_id]);
    await db.query("INSERT INTO business_memberships(business_id,user_id,role,created_by) VALUES($1,$2,'MEMBER',$3)",[owner.business_id,userId,owner.user_id]);
    await db.query("INSERT INTO store_memberships(business_id,store_id,user_id,role,created_by) VALUES($1,$2,$3,'STAFF',$4)",[owner.business_id,storeId,userId,owner.user_id]);
    const staff=await auth.issue(runtime,userId,owner.business_id); const staffKey=randomUUID();
    assert.equal((await send(path,input,staffKey,staff)).status,403);
    await db.query("UPDATE store_memberships SET role='MANAGER' WHERE store_id=$1 AND user_id=$2",[storeId,userId]);
    const manager=await send(path,input,staffKey,staff); assert.equal(manager.status,201);
    await db.query("UPDATE store_memberships SET role='STAFF' WHERE store_id=$1 AND user_id=$2",[storeId,userId]);
    assert.equal((await send(path,input,staffKey,staff)).status,403);
    const foreignStore=(await db.query("SELECT id FROM stores WHERE business_id<>$1 LIMIT 1",[owner.business_id])).rows[0].id;
    assert.equal((await send(`/stores/${foreignStore}/supplemental-sales`,input)).status,404);
  });
  await check("supplemental audit failure rolls back source, payments, movements, revision, counter and key",async()=>{
    const before=await snapshot(); const failedKey=randomUUID();
    await db.query(`CREATE FUNCTION fail_supplemental_test() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
      IF NEW.action='SUPPLEMENTAL_SALE_CREATED' THEN RAISE EXCEPTION 'injected failure'; END IF; RETURN NEW; END $$`);
    await db.query("CREATE TRIGGER fail_supplemental_test BEFORE INSERT ON audit_logs FOR EACH ROW EXECUTE FUNCTION fail_supplemental_test()");
    try { assert.equal((await send(path,input,failedKey)).status,500); assert.deepEqual(await snapshot(),before); }
    finally { await db.query("DROP TRIGGER fail_supplemental_test ON audit_logs"); await db.query("DROP FUNCTION fail_supplemental_test()"); }
    assert.equal((await send(path,input,failedKey)).status,201);
  });
  await check("supplemental SQL guards reject items, missing posting and missing reason without weakening POS",async()=>{
    const sale=original.body.data; const product=(await db.query("SELECT id FROM products WHERE store_id=$1 LIMIT 1",[storeId])).rows[0].id;
    await assert.rejects(transaction(db,async(client)=>{
      await client.query(`INSERT INTO sale_items(business_id,store_id,sale_id,position,product_id,name_snapshot,unit_price,product_version,quantity,line_total)
        VALUES($1,$2,$3,0,$4,'Invalid item',1,1,1,1)`,[owner.business_id,storeId,sale.id,product]);
    }),{code:"23514"});
    for(const [kind,reason] of [["SUPPLEMENTAL",null],["SUPPLEMENTAL","valid reason"],["POS",null]]) {
      await assert.rejects(transaction(db,async(client)=>{
        await client.query("UPDATE business_days SET revision=revision+1 WHERE store_id=$1",[storeId]);
        await client.query(`INSERT INTO sales(business_id,store_id,day_id,kind,reason,reference,gross,discount,net,day_revision,occurred_at,created_by)
          SELECT business_id,store_id,id,$2,$3,$4,100,0,100,revision,$5,$6 FROM business_days WHERE store_id=$1`,[storeId,kind,reason,randomUUID(),input.occurredAt,owner.user_id]);
      }),{code:"23514"});
    }
  });
  await check("supplemental waits for close and rejects new keys while committed keys replay on CLOSED day",async()=>{
    const blocker=await db.connect(); let pending:Promise<request.Response> | undefined;
    try {
      await blocker.query("BEGIN"); const pid=(await blocker.query("SELECT pg_backend_pid() AS id")).rows[0].id;
      await blocker.query("SELECT id FROM business_days WHERE store_id=$1 FOR UPDATE",[storeId]);
      pending=send(path,input).then(r=>r);
      const deadline=Date.now()+5000; let waiting=false;
      while(Date.now()<deadline) {
        waiting=!!(await db.query("SELECT 1 FROM pg_stat_activity WHERE $1::int=ANY(pg_blocking_pids(pid))",[pid])).rowCount;
        if(waiting) break;
      }
      assert.ok(waiting,"supplemental must wait on day lock");
      await blocker.query("UPDATE business_days SET state='CLOSED' WHERE store_id=$1",[storeId]); await blocker.query("COMMIT");
      const result=await pending; assert.equal(result.status,409); assert.equal(result.body.error.code,"DAY_CLOSED");
      assert.deepEqual((await send(path,input,key)).body,original.body);
    } finally { await blocker.query("ROLLBACK"); blocker.release(); await pending; }
  });
}
