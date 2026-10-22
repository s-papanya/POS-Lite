import type { Pool, PoolClient } from "pg";
import type { BusinessDay } from "@pos-lite/shared";
import { transaction } from "../../db/client.js";
import { claimIdempotency, completeIdempotency } from "../../db/idempotency.js";
import { lockStoreConfiguration } from "../../db/store-locks.js";
import { AuthError, type Session } from "../auth/service.js";

type Actor = Session & {user_id:string;business_id:string};
const columns='id,business_date::text AS "businessDate",state,revision::text AS revision';
export class BusinessDaysService {
  constructor(private pool:Pool) {}
  async access(client:Pool | PoolClient,actor:Actor,storeId:string,write=false) {
    const role=(await client.query<{role:string}>(`SELECT CASE WHEN b.role='OWNER' THEN 'OWNER' ELSE m.role END AS role
      FROM stores s JOIN businesses business ON business.id=s.business_id AND business.active
      JOIN business_memberships b ON b.business_id=s.business_id AND b.user_id=$2 AND b.active
      JOIN users u ON u.id=b.user_id AND u.active
      LEFT JOIN store_memberships m ON m.business_id=s.business_id AND m.store_id=s.id AND m.user_id=$2 AND m.active
      WHERE s.business_id=$1 AND s.id=$3 AND s.active AND (b.role='OWNER' OR m.role IS NOT NULL)`,[actor.business_id,actor.user_id,storeId])).rows[0]?.role;
    if(!role) throw new AuthError(404,"RESOURCE_NOT_FOUND");
    if(write && role==="STAFF") throw new AuthError(403,"FORBIDDEN");
    return role;
  }
  private async snapshots(client:Pool | PoolClient,day:BusinessDay) {
    day.openingSnapshots=(await client.query<{accountId:string;amount:string}>(
      'SELECT account_id AS "accountId",amount::text FROM day_openings WHERE day_id=$1 ORDER BY account_id',[day.id])).rows;
    return day;
  }
  async get(actor:Actor,storeId:string,date:string) {
    const role=await this.access(this.pool,actor,storeId);
    const day=(await this.pool.query<BusinessDay>(`SELECT ${columns} FROM business_days WHERE business_id=$1 AND store_id=$2 AND business_date=$3`,[actor.business_id,storeId,date])).rows[0];
    if(!day) throw new AuthError(404,"RESOURCE_NOT_FOUND");
    return {data:role==="STAFF" ? day : await this.snapshots(this.pool,day)};
  }
  open(actor:Actor,storeId:string,key:string,input:{businessDate:string},requestId:string) {
    return transaction(this.pool,async(client)=>{
      await this.access(client,actor,storeId,true);
      const claim=await claimIdempotency<BusinessDay>(client,actor,key,"POST",`/stores/${storeId}/business-days`,input);
      await this.access(client,actor,storeId,true);
      if(claim.replay) return claim.replay;
      const {status,data}=await this.ensureOpen(client,actor,storeId,input.businessDate,requestId);
      await this.access(client,actor,storeId,true);
      const result={status,body:{data}};
      await completeIdempotency(client,claim.id,result);
      return result;
    });
  }
  async ensureOpen(client:PoolClient,actor:Actor,storeId:string,date:string,requestId:string) {
    await lockStoreConfiguration(client,[storeId]);
    await this.access(client,actor,storeId);
    const existing=(await client.query<BusinessDay>(`SELECT ${columns} FROM business_days WHERE business_id=$1 AND store_id=$2 AND business_date=$3 FOR UPDATE`,[actor.business_id,storeId,date])).rows[0];
    let clock=(await client.query<{instant:Date;today:string}>(`SELECT instant,(instant AT TIME ZONE 'Asia/Bangkok')::date::text AS today FROM (SELECT clock_timestamp() AS instant)t`)).rows[0]!;
    if(date!==clock.today) throw new AuthError(422,"INVALID_BUSINESS_DATE");
    let data:BusinessDay; let status:number;
    if(existing) {
      if(existing.state!=="OPEN") throw new AuthError(409,"DAY_CLOSED");
      data=await this.snapshots(client,existing); status=200;
    } else {
      // shortcut: verified closing/settlement arrives in D4; reject earlier days until that proof exists.
      if((await client.query("SELECT 1 FROM business_days WHERE business_id=$1 AND store_id=$2",[actor.business_id,storeId])).rowCount) throw new AuthError(409,"PREVIOUS_DAY_UNSETTLED");
      const accounts=(await client.query<{id:string;type:string;ready:boolean}>(`SELECT a.id,a.type,EXISTS(SELECT 1 FROM account_openings o WHERE o.business_id=a.business_id AND o.account_id=a.id AND o.cutover_at<=$3) AS ready
        FROM financial_accounts a JOIN account_stores m ON m.business_id=a.business_id AND m.account_id=a.id
        WHERE a.business_id=$1 AND m.store_id=$2 AND a.active ORDER BY a.id FOR UPDATE OF a`,[actor.business_id,storeId,clock.instant])).rows;
      if(!accounts.length || accounts.some((a)=>!a.ready)) throw new AuthError(409,"INITIAL_BALANCES_REQUIRED");
      // Shared account locks may wait across midnight; validate the date again after acquiring them.
      clock=(await client.query<{instant:Date;today:string}>(`SELECT instant,(instant AT TIME ZONE 'Asia/Bangkok')::date::text AS today FROM (SELECT clock_timestamp() AS instant)t`)).rows[0]!;
      if(date!==clock.today) throw new AuthError(422,"INVALID_BUSINESS_DATE");
      data=(await client.query<BusinessDay>(`INSERT INTO business_days(business_id,store_id,business_date,opened_at,created_by) VALUES($1,$2,$3,$4,$5) RETURNING ${columns}`,[actor.business_id,storeId,date,clock.instant,actor.user_id])).rows[0]!;
      for(const account of accounts.filter((a)=>a.type==="CASH")) {
        await client.query(`INSERT INTO day_openings(business_id,store_id,day_id,account_id,amount,recorded_at,created_by)
          SELECT $1,$2,$3,$4,coalesce(sum(delta),0),$5,$6 FROM money_movements WHERE business_id=$1 AND account_id=$4 AND day_id IS DISTINCT FROM $3::uuid`,[actor.business_id,storeId,data.id,account.id,clock.instant,actor.user_id]);
      }
      await this.snapshots(client,data);
      await client.query(`INSERT INTO audit_logs(business_id,store_id,actor_user_id,action,entity_type,entity_id,request_id,after_data)
        VALUES($1,$2,$3,'BUSINESS_DAY_OPENED','business_day',$4,$5,$6)`,[actor.business_id,storeId,actor.user_id,data.id,requestId,data]);
      status=201;
    }
    return {status,data};
  }
}
