import type { Pool, PoolClient } from "pg";
import type { AccountTransfer, BusinessDay, Expense } from "@pos-lite/shared";
import type { TransferRequest } from "@pos-lite/validation";
import { transaction } from "../../db/client.js";
import { claimIdempotency, completeIdempotency } from "../../db/idempotency.js";
import { lockStoreConfiguration } from "../../db/store-locks.js";
import { AuthError, type Session } from "../auth/service.js";
import { BusinessDaysService } from "../business-days/service.js";
import { ExpensesService } from "../expenses/service.js";

type Actor=Session & {user_id:string;business_id:string};
export class TransfersService {
  private days:BusinessDaysService;private expenses:ExpensesService;
  constructor(private pool:Pool) {this.days=new BusinessDaysService(pool);this.expenses=new ExpensesService(pool);}
  private async access(client:PoolClient,actor:Actor,input:TransferRequest) {
    const roles:string[]=[];
    for(const storeId of [...new Set([input.sourceStoreId,input.destinationStoreId])].sort()) {
      roles.push(await this.days.access(client,actor,storeId,true));
    }
    if(input.sourceStoreId!==input.destinationStoreId && roles.some(role=>role!=="OWNER")) throw new AuthError(403,"FORBIDDEN");
  }
  create(actor:Actor,key:string,input:TransferRequest,requestId:string) {
    return transaction(this.pool,async client=>{
      await this.access(client,actor,input);
      const claim=await claimIdempotency<AccountTransfer>(client,actor,key,"POST","/account-transfers",input);
      await this.access(client,actor,input);if(claim.replay) return claim.replay;
      const storeIds=[...new Set([input.sourceStoreId,input.destinationStoreId])].sort();
      await lockStoreConfiguration(client,storeIds);
      const existing=(await client.query<{store_id:string}>(`SELECT store_id FROM business_days WHERE business_id=$1 AND store_id=ANY($2::uuid[]) AND business_date=$3 ORDER BY store_id FOR UPDATE`,[actor.business_id,storeIds,input.businessDate])).rows;
      const missing=storeIds.filter(id=>!existing.some(day=>day.store_id===id));
      // Auto-opening may lock every active account: lock their union once before calling either day opener.
      const accounts=(await client.query<{id:string;active:boolean;cutover_at:Date | null}>(`SELECT a.id,a.active,o.cutover_at FROM financial_accounts a
        LEFT JOIN account_openings o ON o.business_id=a.business_id AND o.account_id=a.id WHERE a.business_id=$1 AND
        (a.id=ANY($2::uuid[]) OR (a.active AND EXISTS(SELECT 1 FROM account_stores m WHERE m.business_id=a.business_id AND m.account_id=a.id AND m.store_id=ANY($3::uuid[]))))
        ORDER BY a.id FOR UPDATE OF a`,[actor.business_id,[input.sourceAccountId,input.destinationAccountId],missing])).rows;
      if(!(accounts.some(a=>a.id===input.sourceAccountId) && accounts.some(a=>a.id===input.destinationAccountId)) ||
        (await client.query(`SELECT 1 FROM account_stores WHERE business_id=$1 AND ((store_id=$2 AND account_id=$3) OR (store_id=$4 AND account_id=$5))`,
        [actor.business_id,input.sourceStoreId,input.sourceAccountId,input.destinationStoreId,input.destinationAccountId])).rowCount!==2) throw new AuthError(404,"RESOURCE_NOT_FOUND");
      const days=new Map<string,BusinessDay>();
      for(const storeId of storeIds) days.set(storeId,(await this.days.ensureOpen(client,actor,storeId,input.businessDate,requestId)).data);
      const targets=accounts.filter(a=>a.id===input.sourceAccountId || a.id===input.destinationAccountId);
      if(targets.some(a=>!a.active || !a.cutover_at)) throw new AuthError(422,"ACCOUNT_INACTIVE");
      const clock=(await client.query<{today:string;date:string;instant:Date}>(`SELECT (clock_timestamp() AT TIME ZONE 'Asia/Bangkok')::date::text AS today,
        ($1::timestamptz AT TIME ZONE 'Asia/Bangkok')::date::text AS date,clock_timestamp() AS instant`,[input.occurredAt])).rows[0]!;
      if(input.businessDate!==clock.today || input.businessDate!==clock.date || new Date(input.occurredAt)>clock.instant || targets.some(a=>new Date(input.occurredAt)<a.cutover_at!)) throw new AuthError(422,"INVALID_BUSINESS_DATE");
      await this.access(client,actor,input);
      const balance=(await client.query<{amount:string}>("SELECT coalesce(sum(delta),0)::text AS amount FROM money_movements WHERE business_id=$1 AND account_id=$2",[actor.business_id,input.sourceAccountId])).rows[0]!.amount;
      if(BigInt(balance)<BigInt(input.amount)+BigInt(input.feeAmount)) throw new AuthError(409,"INSUFFICIENT_FUNDS");
      const sourceDay=days.get(input.sourceStoreId)!;const destinationDay=days.get(input.destinationStoreId)!;
      let feeExpense:Expense | null=null;
      if(input.feeAmount!=="0") {
        const category=(await client.query<{id:string}>("SELECT id FROM expense_categories WHERE business_id=$1 AND name='ค่าธรรมเนียม' AND active",[actor.business_id])).rows[0];
        if(!category) throw new AuthError(409,"FEE_CATEGORY_REQUIRED");
        feeExpense=await this.expenses.postToDay(client,actor,input.sourceStoreId,sourceDay.id,{businessDate:input.businessDate,occurredAt:input.occurredAt,
          categoryId:category.id,amount:input.feeAmount,description:input.reason,payment:{accountId:input.sourceAccountId}},requestId);
      }
      const id=(await client.query<{id:string}>(`INSERT INTO account_transfers(business_id,source_store_id,destination_store_id,source_day_id,destination_day_id,
        source_account_id,destination_account_id,amount,fee_amount,fee_expense_id,reason,occurred_at,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING id`,
      [actor.business_id,input.sourceStoreId,input.destinationStoreId,sourceDay.id,destinationDay.id,input.sourceAccountId,input.destinationAccountId,input.amount,input.feeAmount,feeExpense?.id ?? null,input.reason,input.occurredAt,actor.user_id])).rows[0]!.id;
      for(const [leg,storeId,dayId,accountId,delta] of [["OUT",input.sourceStoreId,sourceDay.id,input.sourceAccountId,String(-BigInt(input.amount))],
        ["IN",input.destinationStoreId,destinationDay.id,input.destinationAccountId,input.amount]]) {
        await client.query(`INSERT INTO money_movements(business_id,store_id,day_id,account_id,transfer_id,leg,delta,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,[actor.business_id,storeId,dayId,accountId,id,leg,delta,actor.user_id]);
      }
      await client.query("UPDATE business_days SET revision=revision+1 WHERE id=ANY($1::uuid[])",[[...days.values()].map(d=>d.id)]);
      const data:AccountTransfer={id,...input,feeExpense};
      await client.query(`INSERT INTO audit_logs(business_id,store_id,actor_user_id,action,entity_type,entity_id,request_id,after_data) VALUES($1,$2,$3,'ACCOUNT_TRANSFER_CREATED','account_transfer',$4,$5,$6)`,
        [actor.business_id,input.sourceStoreId,actor.user_id,id,requestId,data]);
      const result={status:201,body:{data}};await completeIdempotency(client,claim.id,result);return result;
    });
  }
}
