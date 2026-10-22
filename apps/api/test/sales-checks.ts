import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { Express } from "express";
import type { Pool } from "pg";
import request from "supertest";
import { saleResponseSchema, saleListResponseSchema, type SaleRequest } from "@pos-lite/validation";
import type { AuthService } from "../src/modules/auth/service.js";
import { transaction } from "../src/db/client.js";

export async function salesChecks(db:Pool,runtime:Pool,auth:AuthService,app:Express,
  check:(label:string,work:()=>Promise<void>)=>Promise<void>) {
  const owner=(await db.query("SELECT user_id,business_id FROM business_memberships WHERE role='OWNER' LIMIT 1")).rows[0];
  const issued=await auth.issue(runtime,owner.user_id,owner.business_id);
  const send=(path:string,body:object,key:string=randomUUID(),session=issued,method:"post" | "patch"="post")=>request(app)[method](`/api/v1${path}`)
    .set("Cookie",`pos_lite_session=${session.token}`).set("Origin",auth.config.origin).set("X-CSRF-Token",session.csrfToken).set("Idempotency-Key",key).send(body);
  const fixture=async()=>{
    const storeId=randomUUID();
    await db.query("INSERT INTO stores(id,business_id,name,code,created_by) VALUES($1::uuid,$2,'Sale fixture',$1::uuid::text,$3)",[storeId,owner.business_id,owner.user_id]);
    const cash=(await send("/accounts",{name:randomUUID(),type:"CASH",storeIds:[storeId]})).body.data.id as string;
    assert.equal((await send(`/accounts/${cash}/opening`,{storeId,amount:"50000",cutoverAt:"2000-01-01T00:00:00Z",reason:"Opening"})).status,201);
    const product=await send(`/stores/${storeId}/products`,{name:"Noodle",price:"3500"}); assert.equal(product.status,201);
    return {storeId,cash,product:product.body.data.id as string};
  };
  const first=await fixture(); const second=await fixture();
  const bank=(await send("/accounts",{name:randomUUID(),type:"BANK",storeIds:[first.storeId,second.storeId]})).body.data.id as string;
  assert.equal((await send(`/accounts/${bank}/opening`,{storeId:first.storeId,amount:"10000",cutoverAt:"2000-01-01T00:00:00Z",reason:"Shared bank"})).status,201);
  const today=(await db.query("SELECT (clock_timestamp() AT TIME ZONE 'Asia/Bangkok')::date::text AS date")).rows[0].date as string;
  const body=(f=first):SaleRequest=>({businessDate:today,occurredAt:new Date().toISOString(),items:[{productId:f.product,expectedVersion:1,quantity:3}],
    discount:{kind:"PERCENT",basisPoints:500},payments:[{accountId:f.cash,channel:"CASH",amount:"4000",tendered:"10000"},{accountId:bank,channel:"TRANSFER",amount:"5975"}]});
  const path=`/stores/${first.storeId}/sales`;
  const read=(url:string,session=issued)=>request(app).get(`/api/v1${url}`).set("Cookie",`pos_lite_session=${session.token}`);
  let original:request.Response; const originalKey=randomUUID(); const originalBody=body();
  await check("sale atomically auto-opens day, snapshots initial cash and posts split net payments",async()=>{
    original=await send(path,originalBody,originalKey); assert.equal(original.status,201); saleResponseSchema.parse(original.body);
    const sale=original.body.data;
    assert.equal(sale.gross,"10500"); assert.equal(sale.discount,"525"); assert.equal(sale.net,"9975"); assert.equal(sale.dayRevision,"1");
    assert.match(sale.reference,new RegExp(`^POS-${today.replaceAll("-","")}-000001$`));
    assert.equal(sale.items[0].nameSnapshot,"Noodle"); assert.equal(sale.items[0].unitPrice,"3500");
    assert.equal(sale.payments.find((p:{channel:string})=>p.channel==="CASH").change,"6000");
    assert.equal((await db.query("SELECT amount::text FROM day_openings WHERE store_id=$1",[first.storeId])).rows[0].amount,"50000");
    assert.equal((await db.query("SELECT sum(delta)::text AS n FROM money_movements WHERE account_id=$1",[first.cash])).rows[0].n,"54000");
    assert.equal((await db.query("SELECT sum(delta)::text AS n FROM money_movements WHERE account_id=$1",[bank])).rows[0].n,"15975");
    assert.equal((await db.query("SELECT count(*)::int AS n FROM money_movements WHERE store_id=$1 AND sale_payment_id IS NOT NULL",[second.storeId])).rows[0].n,0);
    assert.deepEqual((await read(`${path}/${sale.id}`)).body,original.body);
  });
  await check("sale concurrent idempotency, retry and document counters never duplicate postings",async()=>{
    assert.deepEqual((await send(path,originalBody,originalKey)).body,original.body);
    assert.equal((await send(path,{...originalBody,discount:{kind:"FIXED",amount:"525"}},originalKey)).body.error.code,"IDEMPOTENCY_CONFLICT");
    assert.equal((await send(`/stores/${second.storeId}/sales`,originalBody,originalKey)).body.error.code,"IDEMPOTENCY_CONFLICT");
    const key=randomUUID(); const input=body();
    const results=await Promise.all([send(path,input,key),send(path,input,key),send(path,input)]);
    assert.ok(results.every((r)=>r.status===201)); assert.deepEqual(results[0]!.body,results[1]!.body);
    assert.notEqual(results[0]!.body.data.id,results[2]!.body.data.id);
    assert.deepEqual(results.map((r)=>r.body.data.reference).filter((v,i,a)=>a.indexOf(v)===i).sort(),
      [`POS-${today.replaceAll("-","")}-000002`,`POS-${today.replaceAll("-","")}-000003`]);
    assert.equal((await db.query("SELECT count(*)::int AS n FROM sales WHERE store_id=$1",[first.storeId])).rows[0].n,3);
    assert.equal((await db.query("SELECT revision::text FROM business_days WHERE store_id=$1",[first.storeId])).rows[0].revision,"3");
    assert.equal((await db.query("SELECT count(*)::int AS n FROM money_movements WHERE store_id=$1 AND sale_payment_id IS NOT NULL",[first.storeId])).rows[0].n,6);
  });
  await check("sale rejects forged totals, bad money, wrong channel, incomplete payment and invalid dates",async()=>{
    assert.equal((await send(path,{...body(),net:"1"})).status,400);
    assert.equal((await send(path,{...body(),businessDate:"0000-01-01"})).status,400);
    assert.equal((await send(path,{...body(),occurredAt:"0000-01-01T00:00:00Z"})).status,400);
    assert.equal((await send(path,{...body(),items:[{...body().items[0],unitPrice:"1"}]})).status,400);
    const variants=[{...body(),payments:[{accountId:first.cash,channel:"CASH",amount:"9975",tendered:"9000"}]},
      {...body(),payments:[{accountId:first.cash,channel:"TRANSFER",amount:"9975"}]},
      {...body(),payments:[{accountId:bank,channel:"CASH",amount:"9975",tendered:"10000"}]},
      {...body(),payments:[{accountId:first.cash,channel:"CASH",amount:"1",tendered:"10000"}]},
      {...body(),discount:{kind:"FIXED",amount:"10500"}},
      {...body(),occurredAt:"2999-01-01T00:00:00Z"}, {...body(),occurredAt:"2000-01-01T00:00:00Z"}];
    for(const input of variants) assert.equal((await send(path,input)).status,422);
    assert.equal((await send(path,{...body(),payments:[{accountId:first.cash,channel:"CASH",amount:"99.75",tendered:"10000"}]})).status,400);
    assert.equal((await send(path,{...body(),items:[...body().items,...body().items]})).status,400);
    assert.equal((await send(path,{...body(),payments:[...body().payments,...body().payments]})).status,400);
    assert.equal((await send(path,{...body(),items:[{productId:second.product,expectedVersion:1,quantity:3}]})).status,404);
    assert.equal((await send(path,{...body(),payments:[{accountId:second.cash,channel:"CASH",amount:"9975",tendered:"10000"}]})).status,404);
    assert.equal((await request(app).post(`/api/v1${path}`).send(body())).status,401);
    assert.equal((await request(app).post(`/api/v1${path}`).set("Cookie",`pos_lite_session=${issued.token}`).send(body())).status,403);
  });
  await check("sale rollback removes auto-day, children, movements, counter, audit and key at each write stage",async()=>{
    for(const table of ["sale_items","sale_payments","money_movements","audit_logs"]) {
      const f=await fixture(); const input={...body(f),payments:[{accountId:f.cash,channel:"CASH" as const,amount:"9975",tendered:"10000"}]};
      const key=randomUUID();
      await db.query(`CREATE FUNCTION fail_sale_test() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
        IF TG_TABLE_NAME='audit_logs' THEN IF NEW.action<>'SALE_CREATED' THEN RETURN NEW; END IF; END IF;
        RAISE EXCEPTION 'Injected sale failure'; END $$;
        CREATE TRIGGER fail_sale_test BEFORE INSERT ON ${table} FOR EACH ROW EXECUTE FUNCTION fail_sale_test()`);
      try {
        assert.equal((await send(`/stores/${f.storeId}/sales`,input,key)).status,500);
        for(const name of ["business_days","day_openings","sales","sale_items","sale_payments","document_counters"])
          assert.equal((await db.query(`SELECT count(*)::int AS n FROM ${name} WHERE store_id=$1`,[f.storeId])).rows[0].n,0);
        assert.equal((await db.query("SELECT count(*)::int AS n FROM money_movements WHERE store_id=$1 AND sale_payment_id IS NOT NULL",[f.storeId])).rows[0].n,0);
        assert.equal((await db.query("SELECT count(*)::int AS n FROM audit_logs WHERE store_id=$1 AND action IN ('SALE_CREATED','BUSINESS_DAY_OPENED')",[f.storeId])).rows[0].n,0);
        assert.equal((await db.query("SELECT count(*)::int AS n FROM idempotency_records WHERE key=$1",[key])).rows[0].n,0);
      } finally {await db.query(`DROP TRIGGER fail_sale_test ON ${table}; DROP FUNCTION fail_sale_test()`);}
      const retry=await send(`/stores/${f.storeId}/sales`,input,key); assert.equal(retry.status,201); assert.ok(retry.body.data.reference.endsWith("000001"));
    }
  });
  await check("staff sales preserve store scope and replay cannot bypass revoked membership",async()=>{
    const id=randomUUID();
    await db.query("INSERT INTO users(id,username,password_hash) SELECT $1,$2,password_hash FROM users WHERE id=$3",[id,randomUUID(),owner.user_id]);
    await db.query("INSERT INTO business_memberships(business_id,user_id,role,created_by) VALUES($1,$2,'MEMBER',$3)",[owner.business_id,id,owner.user_id]);
    await db.query("INSERT INTO store_memberships(business_id,store_id,user_id,role,created_by) VALUES($1,$2,$3,'STAFF',$4)",[owner.business_id,second.storeId,id,owner.user_id]);
    const staff=await auth.issue(runtime,id,owner.business_id); const key=randomUUID(); const input=body(second);
    const response=await send(`/stores/${second.storeId}/sales`,input,key,staff); assert.equal(response.status,201); saleResponseSchema.parse(response.body);
    assert.equal((await send(path,body(),randomUUID(),staff)).status,404);
    assert.equal((await read(`${path}/${original.body.data.id}`,staff)).status,404);
    assert.equal((await read(`/stores/${second.storeId}/sales/${original.body.data.id}`,staff)).status,404);
    const foreign=(await db.query("SELECT id FROM stores WHERE business_id<>$1 LIMIT 1",[owner.business_id])).rows[0].id;
    assert.equal((await send(`/stores/${foreign}/sales`,body())).status,404);
    await db.query("UPDATE store_memberships SET active=false WHERE user_id=$1",[id]);
    assert.equal((await send(`/stores/${second.storeId}/sales`,input,key,staff)).status,404);
    assert.equal((await db.query("SELECT sum(delta)::text AS n FROM money_movements WHERE account_id=$1",[bank])).rows[0].n,"33900");
  });
  await check("closed day rejects new sales while original committed response replays",async()=>{
    await db.query("UPDATE business_days SET state='CLOSED' WHERE store_id=$1",[first.storeId]);
    assert.equal((await send(path,body())).body.error.code,"DAY_CLOSED");
    assert.deepEqual((await send(path,originalBody,originalKey)).body,original.body);
    await db.query("UPDATE business_days SET state='OPEN' WHERE store_id=$1",[first.storeId]);
  });
  await check("parallel sales in two stores credit a shared bank identity exactly once per payment",async()=>{
    const before=BigInt((await db.query("SELECT sum(delta)::text AS n FROM money_movements WHERE account_id=$1",[bank])).rows[0].n);
    const fixed={...body(),discount:{kind:"FIXED" as const,amount:"525"}};
    const results=await Promise.all([send(path,fixed),send(`/stores/${second.storeId}/sales`,body(second))]);
    assert.ok(results.every((r)=>r.status===201));
    assert.equal(results[0]!.body.data.discount,"525");
    const after=BigInt((await db.query("SELECT sum(delta)::text AS n FROM money_movements WHERE account_id=$1",[bank])).rows[0].n);
    assert.equal(after-before,11950n);
    assert.equal((await db.query("SELECT count(*)::int AS n FROM financial_accounts WHERE id=$1",[bank])).rows[0].n,1);
  });
  await check("sale waits on day lock and observes close committed first",async()=>{
    const blocker=await db.connect(); let pending:Promise<request.Response> | undefined;
    try {
      await blocker.query("BEGIN"); const pid=(await blocker.query("SELECT pg_backend_pid() AS id")).rows[0].id;
      await blocker.query("SELECT id FROM business_days WHERE store_id=$1 FOR UPDATE",[first.storeId]);
      pending=send(path,body()).then((r)=>r);
      const deadline=Date.now()+5000; let waiting=false;
      while(Date.now()<deadline) {
        waiting=!!(await db.query("SELECT 1 FROM pg_stat_activity WHERE $1::int=ANY(pg_blocking_pids(pid))",[pid])).rowCount;
        if(waiting) break;
      }
      assert.ok(waiting,"sale must wait on held day row");
      await blocker.query("UPDATE business_days SET state='CLOSED' WHERE store_id=$1",[first.storeId]); await blocker.query("COMMIT");
      assert.equal((await pending).body.error.code,"DAY_CLOSED");
    } finally {
      await blocker.query("ROLLBACK"); blocker.release(); await pending;
      await db.query("UPDATE business_days SET state='OPEN' WHERE store_id=$1",[first.storeId]);
    }
  });
  await check("database rejects incomplete or mismatched sale posting and runtime cannot rewrite bills",async()=>{
    const day=(await db.query("SELECT id FROM business_days WHERE store_id=$1",[first.storeId])).rows[0].id;
    const invalid=(withItem:boolean,withPayment:boolean,delta?:string,movementAccount=first.cash)=>transaction(runtime,async(client)=>{
      const revision=(await client.query("UPDATE business_days SET revision=revision+1 WHERE id=$1 RETURNING revision::text",[day])).rows[0].revision;
      const id=(await client.query(`INSERT INTO sales(business_id,store_id,day_id,reference,gross,discount,net,day_revision,occurred_at,created_by)
        VALUES($1,$2,$3,$4,3500,0,3500,$5,clock_timestamp(),$6) RETURNING id`,[owner.business_id,first.storeId,day,randomUUID(),revision,owner.user_id])).rows[0].id;
      if(withItem) await client.query("INSERT INTO sale_items(business_id,store_id,sale_id,position,product_id,name_snapshot,unit_price,product_version,quantity,line_total) VALUES($1,$2,$3,0,$4,'Noodle',3500,1,1,3500)",[owner.business_id,first.storeId,id,first.product]);
      if(withPayment) {
        const p=(await client.query("INSERT INTO sale_payments(business_id,store_id,day_id,sale_id,account_id,channel,amount,tendered,change) VALUES($1,$2,$3,$4,$5,'CASH',3500,4000,500) RETURNING id",[owner.business_id,first.storeId,day,id,first.cash])).rows[0].id;
        if(delta) await client.query("INSERT INTO money_movements(business_id,store_id,day_id,account_id,sale_payment_id,delta,created_by) VALUES($1,$2,$3,$4,$5,$6,$7)",[owner.business_id,first.storeId,day,movementAccount,p,delta,owner.user_id]);
      }
    });
    await assert.rejects(invalid(false,false),{code:"23514"}); await assert.rejects(invalid(true,false),{code:"23514"});
    await assert.rejects(invalid(true,true),{code:"23514"}); await assert.rejects(invalid(true,true,"3499"),{code:"23514"});
    await assert.rejects(invalid(true,true,"3500",bank),{code:"23503"});
    await assert.rejects(runtime.query(`INSERT INTO money_movements(business_id,store_id,day_id,account_id,sale_payment_id,delta,created_by)
      SELECT business_id,store_id,day_id,account_id,sale_payment_id,delta,created_by FROM money_movements WHERE sale_payment_id IS NOT NULL LIMIT 1`),{code:"23505"});
    await assert.rejects(runtime.query("UPDATE sales SET net=1"),{code:"42501"}); await assert.rejects(runtime.query("DELETE FROM sale_items"),{code:"42501"});
    await assert.rejects(runtime.query("UPDATE sale_payments SET amount=1"),{code:"42501"});
    await assert.rejects(runtime.query("INSERT INTO money_movements(business_id,store_id,account_id,delta,created_by) VALUES($1,$2,$3,1,$4)",[owner.business_id,first.storeId,first.cash,owner.user_id]),{code:"23514"});
  });
  await check("history pagination is scoped and old bill snapshots survive product edits",async()=>{
    const query=`?from=${today}&to=${today}&limit=1`;
    const firstPage=await read(path+query); saleListResponseSchema.parse(firstPage.body); assert.equal(firstPage.body.data.length,1);
    const cursor=firstPage.body.page.nextCursor; assert.ok(cursor);
    const next=await read(path+query+`&cursor=${cursor}`); saleListResponseSchema.parse(next.body); assert.notEqual(next.body.data[0].id,firstPage.body.data[0].id);
    const ids=[firstPage.body.data[0].id as string]; let page=next;
    while(true) {
      ids.push(...page.body.data.map((s:{id:string})=>s.id)); assert.ok(ids.length<=100);
      if(!page.body.page.nextCursor) break;
      page=await read(path+query+`&cursor=${page.body.page.nextCursor}`); assert.equal(page.status,200);
    }
    assert.deepEqual(ids.sort(),(await db.query<{id:string}>("SELECT id FROM sales WHERE store_id=$1 ORDER BY id",[first.storeId])).rows.map((r)=>r.id));
    assert.equal((await read(`/stores/${second.storeId}/sales`+query+`&cursor=${cursor}`)).status,400);
    assert.equal((await read(path+`?from=2000-01-01&to=${today}`)).status,400);
    assert.equal((await read(path+query+"&cursor=bad")).status,400);
    const changed=await send(`/stores/${first.storeId}/products/${first.product}`,{name:"New noodle",price:"4000",expectedVersion:1},randomUUID(),issued,"patch"); assert.equal(changed.status,200);
    const stale=await send(path,body()); assert.equal(stale.status,409); assert.equal(stale.body.error.code,"PRICE_CHANGED"); assert.equal(stale.body.error.details.current.price,"4000");
    assert.deepEqual((await read(`${path}/${original.body.data.id}`)).body,original.body);
    await send(`/stores/${first.storeId}/products/${first.product}`,{active:false,expectedVersion:2},randomUUID(),issued,"patch");
    const inactive=body(); inactive.items[0]!.expectedVersion=3;
    assert.equal((await send(path,inactive)).body.error.code,"PRODUCT_INACTIVE");
  });
  await check("catalog edit committed before sale price lock causes PRICE_CHANGED and rolls back automatic day",async()=>{
    const f=await fixture(); const key=randomUUID(); const input={...body(f),payments:[{accountId:f.cash,channel:"CASH" as const,amount:"9975",tendered:"10000"}]};
    const blocker=await db.connect(); let pending:Promise<request.Response> | undefined;
    try {
      await blocker.query("BEGIN"); const pid=(await blocker.query("SELECT pg_backend_pid() AS id")).rows[0].id;
      await blocker.query("UPDATE products SET price=4000,version=2 WHERE id=$1",[f.product]);
      pending=send(`/stores/${f.storeId}/sales`,input,key).then((r)=>r);
      const deadline=Date.now()+5000; let waiting=false;
      while(Date.now()<deadline) {
        waiting=!!(await db.query("SELECT 1 FROM pg_stat_activity WHERE $1::int=ANY(pg_blocking_pids(pid))",[pid])).rowCount;
        if(waiting) break;
      }
      assert.ok(waiting,"sale must wait for the edited product"); await blocker.query("COMMIT");
      assert.equal((await pending).body.error.code,"PRICE_CHANGED");
      assert.equal((await db.query("SELECT count(*)::int AS n FROM business_days WHERE store_id=$1",[f.storeId])).rows[0].n,0);
      assert.equal((await db.query("SELECT count(*)::int AS n FROM idempotency_records WHERE key=$1",[key])).rows[0].n,0);
    } finally {await blocker.query("ROLLBACK");blocker.release();await pending;}
    input.items[0]!.expectedVersion=2; input.payments[0]!.amount="11400"; input.payments[0]!.tendered="20000";
    const retry=await send(`/stores/${f.storeId}/sales`,input,key);
    assert.equal(retry.status,201); assert.equal(retry.body.data.items[0].unitPrice,"4000");
  });
}
