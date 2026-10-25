import type { Pool, PoolClient } from "pg";
import type { Expense, ExpensePayment } from "@pos-lite/shared";
import type { ExpenseRequest, ExpensePaymentRequest } from "@pos-lite/validation";
import { transaction } from "../../db/client.js";
import { claimIdempotency, completeIdempotency } from "../../db/idempotency.js";
import { AuthError, type Session } from "../auth/service.js";
import { BusinessDaysService } from "../business-days/service.js";

type Actor=Session & {user_id:string;business_id:string};
export type ExpenseQuery={from:string;to:string;status:"ALL" | "UNPAID" | "PAID";limit:number;cursor?:string};
export type ExpenseCursor={businessId:string;storeId:string;from:string;to:string;status:ExpenseQuery["status"];occurredAt:string;id:string};
type Row=Omit<Expense,"occurredAt" | "payment" | "status"> & {occurredAt:Date;payment:Omit<ExpensePayment,"occurredAt"> & {occurredAt:string} | null};
const projection=`e.id,e.category_id AS "categoryId",d.business_date::text AS "businessDate",e.occurred_at AS "occurredAt",
  e.amount::text,e.description,e.evidence_reference AS "evidenceReference",CASE WHEN p.id IS NULL THEN NULL ELSE jsonb_build_object(
  'id',p.id,'expenseId',p.expense_id,'accountId',p.account_id,'amount',p.amount::text,'businessDate',pd.business_date::text,'occurredAt',p.occurred_at) END AS payment`;
const joins=`FROM expenses e JOIN business_days d ON d.id=e.day_id LEFT JOIN expense_payments p ON p.expense_id=e.id
  LEFT JOIN business_days pd ON pd.id=p.day_id`;
const toExpense=(row:Row):Expense=>({...row,occurredAt:row.occurredAt.toISOString(),status:row.payment ? "PAID" : "UNPAID",
  payment:row.payment ? {...row.payment,occurredAt:new Date(row.payment.occurredAt).toISOString()} : null});
export class ExpensesService {
  private days:BusinessDaysService;
  constructor(private pool:Pool) {this.days=new BusinessDaysService(pool);}
  private async read(client:PoolClient,actor:Actor,storeId:string,id:string) {
    return toExpense((await client.query<Row>(`SELECT ${projection} ${joins} WHERE e.business_id=$1 AND e.store_id=$2 AND e.id=$3`,[actor.business_id,storeId,id])).rows[0]!);
  }
  async list(actor:Actor,storeId:string,query:ExpenseQuery,cursor?:ExpenseCursor) {
    await this.days.access(this.pool,actor,storeId,true);
    if(cursor && (cursor.businessId!==actor.business_id || cursor.storeId!==storeId || cursor.from!==query.from || cursor.to!==query.to || cursor.status!==query.status)) throw new AuthError(400,"INVALID_CURSOR");
    const rows=(await this.pool.query<Row & {cursorTime:string}>(`SELECT ${projection},to_char(e.occurred_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS "cursorTime" ${joins}
      WHERE e.business_id=$1 AND e.store_id=$2 AND d.business_date BETWEEN $3::date AND $4::date
      AND ($5='ALL' OR ($5='PAID')=(p.id IS NOT NULL))
      AND ($6::timestamptz IS NULL OR (e.occurred_at,e.id)<($6::timestamptz,$7::uuid))
      ORDER BY e.occurred_at DESC,e.id DESC LIMIT $8`,[actor.business_id,storeId,query.from,query.to,query.status,cursor?.occurredAt ?? null,cursor?.id ?? null,query.limit+1])).rows;
    const page=rows.slice(0,query.limit);const last=page.at(-1);
    return {data:page.map(({cursorTime,...row})=>{void cursorTime;return toExpense(row);}),page:{nextCursor:rows.length>query.limit && last ?
      Buffer.from(JSON.stringify({businessId:actor.business_id,storeId,from:query.from,to:query.to,status:query.status,occurredAt:last.cursorTime,id:last.id})).toString("base64url") : null}};
  }
  private async verifyTime(client:PoolClient,input:{businessDate:string;occurredAt:string}) {
    const clock=(await client.query<{today:string;instant:Date}>(`SELECT (clock_timestamp() AT TIME ZONE 'Asia/Bangkok')::date::text AS today,clock_timestamp() AS instant`)).rows[0]!;
    if(input.businessDate!==clock.today || new Date(input.occurredAt)>clock.instant ||
      (await client.query<{date:string}>("SELECT ($1::timestamptz AT TIME ZONE 'Asia/Bangkok')::date::text AS date",[input.occurredAt])).rows[0]!.date!==input.businessDate) throw new AuthError(422,"INVALID_BUSINESS_DATE");
  }
  private async audit(client:PoolClient,actor:Actor,storeId:string,requestId:string,action:string,type:string,data:Expense | ExpensePayment) {
    await client.query(`INSERT INTO audit_logs(business_id,store_id,actor_user_id,action,entity_type,entity_id,request_id,after_data)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,[actor.business_id,storeId,actor.user_id,action,type,data.id,requestId,data]);
  }
  private async postPayment(client:PoolClient,actor:Actor,storeId:string,dayId:string,expense:{id:string;amount:string;occurred_at:Date},input:ExpensePaymentRequest,requestId:string) {
    const account=(await client.query<{id:string;active:boolean;cutover_at:Date | null}>(`SELECT a.id,a.active,o.cutover_at
      FROM financial_accounts a JOIN account_stores m ON m.business_id=a.business_id AND m.account_id=a.id
      LEFT JOIN account_openings o ON o.business_id=a.business_id AND o.account_id=a.id
      WHERE a.business_id=$1 AND m.store_id=$2 AND a.id=$3 FOR UPDATE OF a`,[actor.business_id,storeId,input.accountId])).rows[0];
    if(!account) throw new AuthError(404,"RESOURCE_NOT_FOUND");
    if(!account.active || !account.cutover_at) throw new AuthError(422,"ACCOUNT_INACTIVE");
    if(new Date(input.occurredAt)<account.cutover_at || new Date(input.occurredAt)<expense.occurred_at) throw new AuthError(422,"INVALID_BUSINESS_DATE");
    await this.verifyTime(client,input);await this.days.access(client,actor,storeId,true);
    const balance=(await client.query<{balance:string}>("SELECT coalesce(sum(delta),0)::text AS balance FROM money_movements WHERE business_id=$1 AND account_id=$2",[actor.business_id,input.accountId])).rows[0]!.balance;
    if(BigInt(balance)<BigInt(expense.amount)) throw new AuthError(409,"INSUFFICIENT_FUNDS");
    const id=(await client.query<{id:string}>(`INSERT INTO expense_payments(business_id,store_id,day_id,expense_id,account_id,amount,occurred_at,created_by)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,[actor.business_id,storeId,dayId,expense.id,input.accountId,expense.amount,input.occurredAt,actor.user_id])).rows[0]!.id;
    await client.query(`INSERT INTO money_movements(business_id,store_id,day_id,account_id,expense_payment_id,delta,created_by)
      VALUES($1,$2,$3,$4,$5,$6,$7)`,[actor.business_id,storeId,dayId,input.accountId,id,String(-BigInt(expense.amount)),actor.user_id]);
    const data={id,expenseId:expense.id,accountId:input.accountId,amount:expense.amount,businessDate:input.businessDate,occurredAt:input.occurredAt};
    await this.audit(client,actor,storeId,requestId,"EXPENSE_PAID","expense_payment",data);return data;
  }
  create(actor:Actor,storeId:string,key:string,input:ExpenseRequest,requestId:string) {
    return transaction(this.pool,async(client)=>{
      await this.days.access(client,actor,storeId,true);
      const claim=await claimIdempotency<Expense>(client,actor,key,"POST",`/stores/${storeId}/expenses`,input);
      await this.days.access(client,actor,storeId,true);if(claim.replay) return claim.replay;
      const {data:day}=await this.days.ensureOpen(client,actor,storeId,input.businessDate,requestId);
      const data=await this.postToDay(client,actor,storeId,day.id,input,requestId);
      await client.query("UPDATE business_days SET revision=revision+1 WHERE id=$1",[day.id]);
      const result={status:201,body:{data}};await completeIdempotency(client,claim.id,result);return result;
    });
  }
  async postToDay(client:PoolClient,actor:Actor,storeId:string,dayId:string,input:ExpenseRequest,requestId:string) {
    if(!(await client.query("SELECT 1 FROM expense_categories WHERE business_id=$1 AND id=$2 AND active",[actor.business_id,input.categoryId])).rowCount) throw new AuthError(404,"RESOURCE_NOT_FOUND");
    await this.verifyTime(client,input);await this.days.access(client,actor,storeId,true);
    const expense=(await client.query<{id:string;amount:string;occurred_at:Date}>(`INSERT INTO expenses(business_id,store_id,day_id,category_id,amount,description,evidence_reference,occurred_at,created_by)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id,amount::text,occurred_at`,[actor.business_id,storeId,dayId,input.categoryId,input.amount,input.description,input.evidenceReference ?? null,input.occurredAt,actor.user_id])).rows[0]!;
    if(input.payment) await this.postPayment(client,actor,storeId,dayId,expense,{businessDate:input.businessDate,occurredAt:input.occurredAt,accountId:input.payment.accountId},requestId);
    const data=await this.read(client,actor,storeId,expense.id);await this.audit(client,actor,storeId,requestId,"EXPENSE_RECOGNIZED","expense",data);return data;
  }
  pay(actor:Actor,storeId:string,expenseId:string,key:string,input:ExpensePaymentRequest,requestId:string) {
    return transaction(this.pool,async(client)=>{
      await this.days.access(client,actor,storeId,true);
      const claim=await claimIdempotency<ExpensePayment>(client,actor,key,"POST",`/stores/${storeId}/expenses/${expenseId}/payments`,input);
      await this.days.access(client,actor,storeId,true);if(claim.replay) return claim.replay;
      const {data:day}=await this.days.ensureOpen(client,actor,storeId,input.businessDate,requestId);
      const expense=(await client.query<{id:string;amount:string;occurred_at:Date}>("SELECT id,amount::text,occurred_at FROM expenses WHERE business_id=$1 AND store_id=$2 AND id=$3 FOR UPDATE",[actor.business_id,storeId,expenseId])).rows[0];
      if(!expense) throw new AuthError(404,"RESOURCE_NOT_FOUND");
      // shortcut: D3 must replace this unique-payment rule and status query with reversal-aware active payments.
      if((await client.query("SELECT 1 FROM expense_payments WHERE expense_id=$1",[expenseId])).rowCount) throw new AuthError(409,"ALREADY_PAID");
      const data=await this.postPayment(client,actor,storeId,day.id,expense,input,requestId);
      await client.query("UPDATE business_days SET revision=revision+1 WHERE id=$1",[day.id]);
      const result={status:201,body:{data}};await completeIdempotency(client,claim.id,result);return result;
    });
  }
}
