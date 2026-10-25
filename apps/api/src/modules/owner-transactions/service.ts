import type { Pool, PoolClient } from "pg";
import type { OwnerTransaction } from "@pos-lite/shared";
import type { OwnerTransactionRequest } from "@pos-lite/validation";
import { transaction } from "../../db/client.js";
import { claimIdempotency, completeIdempotency } from "../../db/idempotency.js";
import { AuthError, type Session } from "../auth/service.js";
import { BusinessDaysService } from "../business-days/service.js";

type Actor=Session & {user_id:string;business_id:string};
export class OwnerTransactionsService {
  private days:BusinessDaysService;
  constructor(private pool:Pool) {this.days=new BusinessDaysService(pool);}
  private async access(client:PoolClient,actor:Actor,storeId:string) {
    if(await this.days.access(client,actor,storeId,true)!=="OWNER") throw new AuthError(403,"FORBIDDEN");
  }
  create(actor:Actor,storeId:string,key:string,input:OwnerTransactionRequest,requestId:string) {
    return transaction(this.pool,async client=>{
      await this.access(client,actor,storeId);
      const claim=await claimIdempotency<OwnerTransaction>(client,actor,key,"POST",`/stores/${storeId}/owner-transactions`,input);
      await this.access(client,actor,storeId);if(claim.replay) return claim.replay;
      const {data:day}=await this.days.ensureOpen(client,actor,storeId,input.businessDate,requestId);
      const account=(await client.query<{active:boolean;cutover_at:Date | null}>(`SELECT a.active,o.cutover_at FROM financial_accounts a
        JOIN account_stores m ON m.business_id=a.business_id AND m.account_id=a.id
        LEFT JOIN account_openings o ON o.business_id=a.business_id AND o.account_id=a.id
        WHERE a.business_id=$1 AND m.store_id=$2 AND a.id=$3 FOR UPDATE OF a`,[actor.business_id,storeId,input.accountId])).rows[0];
      if(!account) throw new AuthError(404,"RESOURCE_NOT_FOUND");
      if(!account.active || !account.cutover_at) throw new AuthError(422,"ACCOUNT_INACTIVE");
      const clock=(await client.query<{today:string;date:string;instant:Date}>(`SELECT (clock_timestamp() AT TIME ZONE 'Asia/Bangkok')::date::text AS today,
        ($1::timestamptz AT TIME ZONE 'Asia/Bangkok')::date::text AS date,clock_timestamp() AS instant`,[input.occurredAt])).rows[0]!;
      if(input.businessDate!==clock.today || input.businessDate!==clock.date || new Date(input.occurredAt)>clock.instant || new Date(input.occurredAt)<account.cutover_at) throw new AuthError(422,"INVALID_BUSINESS_DATE");
      await this.access(client,actor,storeId);
      const delta=input.kind==="CONTRIBUTION" ? BigInt(input.amount) : -BigInt(input.amount);
      if(delta<0n) {
        const balance=(await client.query<{amount:string}>("SELECT coalesce(sum(delta),0)::text AS amount FROM money_movements WHERE business_id=$1 AND account_id=$2",[actor.business_id,input.accountId])).rows[0]!.amount;
        if(BigInt(balance)+delta<0n) throw new AuthError(409,"INSUFFICIENT_FUNDS");
      }
      const id=(await client.query<{id:string}>(`INSERT INTO owner_transactions(business_id,store_id,day_id,account_id,kind,amount,note,occurred_at,created_by)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,[actor.business_id,storeId,day.id,input.accountId,input.kind,input.amount,input.note,input.occurredAt,actor.user_id])).rows[0]!.id;
      await client.query(`INSERT INTO money_movements(business_id,store_id,day_id,account_id,owner_transaction_id,delta,created_by)
        VALUES($1,$2,$3,$4,$5,$6,$7)`,[actor.business_id,storeId,day.id,input.accountId,id,String(delta),actor.user_id]);
      await client.query("UPDATE business_days SET revision=revision+1 WHERE id=$1",[day.id]);
      const data:OwnerTransaction={id,...input};
      await client.query(`INSERT INTO audit_logs(business_id,store_id,actor_user_id,action,entity_type,entity_id,request_id,after_data)
        VALUES($1,$2,$3,'OWNER_TRANSACTION_CREATED','owner_transaction',$4,$5,$6)`,[actor.business_id,storeId,actor.user_id,id,requestId,data]);
      const result={status:201,body:{data}};await completeIdempotency(client,claim.id,result);return result;
    });
  }
}
