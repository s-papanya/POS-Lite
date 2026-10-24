import type { Pool, PoolClient } from "pg";
import type { Sale } from "@pos-lite/shared";
import type { ReconciliationPreviewRequest, ReconciliationRequest } from "@pos-lite/validation";
import { transaction } from "../../db/client.js";
import { claimIdempotency, completeIdempotency } from "../../db/idempotency.js";
import { AuthError, type Session } from "../auth/service.js";
import { BusinessDaysService } from "../business-days/service.js";
import { SalesService } from "../sales/service.js";
import { reconciliationPreview } from "./money.js";

type Actor=Session & {user_id:string;business_id:string};
type Result={id:string;createdSales:Sale[];dayRevision:string};
export class ReconciliationService {
  private days:BusinessDaysService;
  private sales:SalesService;
  constructor(private pool:Pool) {this.days=new BusinessDaysService(pool);this.sales=new SalesService(pool);}
  private async calculate(client:PoolClient,actor:Actor,storeId:string,input:ReconciliationPreviewRequest,dayId:string | null,revision:string,lock=false) {
    const accounts=(await client.query<{id:string;type:string}>(`SELECT a.id,a.type FROM financial_accounts a
      JOIN account_stores m ON m.business_id=a.business_id AND m.account_id=a.id
      WHERE a.business_id=$1 AND m.store_id=$2 AND a.id=ANY($3::uuid[]) ORDER BY a.id ${lock ? "FOR UPDATE OF a" : ""}`,
      [actor.business_id,storeId,input.targets.map(t=>t.accountId)])).rows;
    if(accounts.length!==input.targets.length) throw new AuthError(404,"RESOURCE_NOT_FOUND");
    for(const t of input.targets) if(accounts.find(a=>a.id===t.accountId)!.type!==(t.channel==="CASH" ? "CASH" : "BANK")) throw new AuthError(422,"ACCOUNT_CHANNEL_MISMATCH");
    // shortcut: D3 has no refund/reversal tables yet; extend this aggregate with their original-payment allocations when D3 lands.
    const recorded=(await client.query<{accountId:string;channel:"CASH" | "TRANSFER";amount:string}>(`SELECT account_id AS "accountId",channel,sum(amount)::text AS amount
      FROM sale_payments WHERE business_id=$1 AND store_id=$2 AND day_id=$3 GROUP BY account_id,channel`,[actor.business_id,storeId,dayId])).rows;
    return reconciliationPreview(revision,input.targets,recorded);
  }
  preview(actor:Actor,storeId:string,input:ReconciliationPreviewRequest) {
    return transaction(this.pool,async(client)=>{
      await client.query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY");
      await this.days.access(client,actor,storeId,true);
      const valid=(await client.query("SELECT $1::date<=(clock_timestamp() AT TIME ZONE 'Asia/Bangkok')::date AS valid",[input.businessDate])).rows[0].valid;
      if(!valid) throw new AuthError(422,"INVALID_BUSINESS_DATE");
      const day=(await client.query<{id:string;revision:string}>(`SELECT id,revision::text FROM business_days WHERE business_id=$1 AND store_id=$2 AND business_date=$3`,[actor.business_id,storeId,input.businessDate])).rows[0];
      return {data:await this.calculate(client,actor,storeId,input,day?.id ?? null,day?.revision ?? "0")};
    });
  }
  confirm(actor:Actor,storeId:string,key:string,input:ReconciliationRequest,requestId:string) {
    return transaction(this.pool,async(client)=>{
      await this.days.access(client,actor,storeId,true);
      const claim=await claimIdempotency<Result>(client,actor,key,"POST",`/stores/${storeId}/sales-reconciliations`,input);
      await this.days.access(client,actor,storeId,true);
      if(claim.replay) return claim.replay;
      const {data:day}=await this.days.ensureOpen(client,actor,storeId,input.businessDate,requestId);
      if(day.revision!==input.expectedRevision) throw new AuthError(409,"STALE_PREVIEW");
      const preview=await this.calculate(client,actor,storeId,input,day.id,day.revision,true);
      if(preview.lines.some(l=>l.requiresReview)) throw new AuthError(409,"RECONCILIATION_REQUIRES_REVIEW");
      if(preview.lines.some(l=>BigInt(l.delta)>9000000000000n)) throw new AuthError(422,"INVALID_SALE_TOTALS");
      const valid=(await client.query(`SELECT ($1::timestamptz AT TIME ZONE 'Asia/Bangkok')::date=$2::date AND $1::timestamptz<=clock_timestamp()
        AND (clock_timestamp() AT TIME ZONE 'Asia/Bangkok')::date=$2::date AS valid`,[input.occurredAt,input.businessDate])).rows[0].valid;
      if(!valid) throw new AuthError(422,"INVALID_OCCURRED_AT");
      const lines=[...preview.lines].sort((a,b)=>a.accountId.localeCompare(b.accountId));
      const count=lines.filter(l=>BigInt(l.delta)>0n).length;
      const revision=String(BigInt(day.revision)+BigInt(Math.max(1,count)));
      const id=(await client.query<{id:string}>(`INSERT INTO reconciliation_records(business_id,store_id,day_id,base_revision,day_revision,reason,occurred_at,created_by)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,[actor.business_id,storeId,day.id,day.revision,revision,input.reason,input.occurredAt,actor.user_id])).rows[0]!.id;
      const createdSales:Sale[]=[];
      for(const line of lines) {
        let saleId:string | null=null;
        if(BigInt(line.delta)>0n) {
          const payment=line.channel==="CASH" ? {accountId:line.accountId,channel:line.channel,amount:line.delta,tendered:line.delta}
            : {accountId:line.accountId,channel:line.channel,amount:line.delta};
          const sale=await this.sales.postToDay(client,actor,storeId,day.id,{businessDate:input.businessDate,occurredAt:input.occurredAt,
            amount:line.delta,reason:input.reason,payments:[payment]},requestId,"RECONCILIATION");
          createdSales.push(sale); saleId=sale.id;
        }
        await client.query(`INSERT INTO reconciliation_lines(business_id,store_id,day_id,reconciliation_id,account_id,channel,recorded,target,delta,resulting_sale_id)
          VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,[actor.business_id,storeId,day.id,id,line.accountId,line.channel,line.recorded,line.target,line.delta,saleId]);
      }
      if(!count) await client.query("UPDATE business_days SET revision=revision+1 WHERE id=$1",[day.id]);
      await this.days.access(client,actor,storeId,true);
      const data={id,createdSales,dayRevision:revision};
      await client.query(`INSERT INTO audit_logs(business_id,store_id,actor_user_id,action,entity_type,entity_id,request_id,after_data)
        VALUES($1,$2,$3,'RECONCILIATION_CONFIRMED','reconciliation',$4,$5,$6)`,[actor.business_id,storeId,actor.user_id,id,requestId,{...data,lines,outcome:count ? "APPLIED" : "NO_CHANGE"}]);
      const result={status:201,body:{data}}; await completeIdempotency(client,claim.id,result); return result;
    });
  }
}
