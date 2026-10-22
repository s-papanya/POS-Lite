import type { Pool, PoolClient } from "pg";
import type { AccountOpening, FinancialAccount } from "@pos-lite/shared";
import { transaction } from "../../db/client.js";
import { claimIdempotency, completeIdempotency, type WriteResult } from "../../db/idempotency.js";
import { AuthError, type Session } from "../auth/service.js";

type Actor = Session & {user_id:string;business_id:string};
const accountColumns="id,name,type,active";
export class AccountsService {
  constructor(private pool:Pool) {}
  private async owner(client:PoolClient,actor:Actor) {
    const access=await client.query(`SELECT 1 FROM business_memberships m JOIN users u ON u.id=m.user_id AND u.active
      JOIN businesses b ON b.id=m.business_id AND b.active
      WHERE m.business_id=$1 AND m.user_id=$2 AND m.role='OWNER' AND m.active`,[actor.business_id,actor.user_id]);
    if(!access.rowCount) throw new AuthError(403,"FORBIDDEN");
  }
  private write<T extends {id:string}>(actor:Actor,key:string,method:string,path:string,input:unknown,
    work:(client:PoolClient)=>Promise<WriteResult<T>>) {
    return transaction(this.pool,async(client)=>{
      await this.owner(client,actor);
      const claim=await claimIdempotency<T>(client,actor,key,method,path,input);
      await this.owner(client,actor);
      if(claim.replay) return claim.replay;
      const result=await work(client);
      await completeIdempotency(client,claim.id,result);
      return result;
    });
  }
  private async audit(client:PoolClient,actor:Actor,requestId:string,action:string,data:{id:string},before:unknown=null,storeId:string | null=null,reason:string | null=null) {
    await client.query(`INSERT INTO audit_logs(business_id,store_id,actor_user_id,action,entity_type,entity_id,request_id,before_data,after_data,reason)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,[actor.business_id,storeId,actor.user_id,action,
      action==="ACCOUNT_OPENED" ? "account_opening" : "financial_account",data.id,requestId,before,data,reason]);
  }
  async list(actor:Actor,storeId:string,limit:number,cursor?:string) {
    const rows=(await this.pool.query<Pick<FinancialAccount,"id" | "name" | "type">>(`SELECT a.id,a.name,a.type FROM financial_accounts a
      JOIN account_stores s ON s.business_id=a.business_id AND s.account_id=a.id
      WHERE a.business_id=$1 AND s.store_id=$2 AND a.active AND ($3::uuid IS NULL OR a.id>$3::uuid) ORDER BY a.id LIMIT $4`,
      [actor.business_id,storeId,cursor ?? null,limit+1])).rows;
    const data=rows.slice(0,limit);
    return {data,page:{nextCursor:rows.length>limit ? data.at(-1)!.id : null}};
  }
  create(actor:Actor,key:string,input:{name:string;type:"CASH" | "BANK";storeIds:string[]},requestId:string) {
    return this.write<FinancialAccount>(actor,key,"POST","/accounts",input,async(client)=>{
      const stores=await client.query("SELECT id FROM stores WHERE business_id=$1 AND id=ANY($2::uuid[]) AND active ORDER BY id",[actor.business_id,input.storeIds]);
      if(stores.rowCount!==input.storeIds.length) throw new AuthError(404,"RESOURCE_NOT_FOUND");
      const account=(await client.query<Omit<FinancialAccount,"storeIds">>(`INSERT INTO financial_accounts(business_id,name,type,created_by)
        VALUES($1,$2,$3,$4) RETURNING ${accountColumns}`,[actor.business_id,input.name,input.type,actor.user_id])).rows[0]!;
      for(const storeId of input.storeIds) await client.query("INSERT INTO account_stores(business_id,store_id,account_id,created_by) VALUES($1,$2,$3,$4)",
        [actor.business_id,storeId,account.id,actor.user_id]);
      const data={...account,storeIds:input.storeIds};
      await this.audit(client,actor,requestId,"ACCOUNT_CREATED",data);
      return {status:201,body:{data}};
    });
  }
  private async lockAccount(client:PoolClient,actor:Actor,accountId:string) {
    const account=(await client.query<Omit<FinancialAccount,"storeIds">>(`SELECT ${accountColumns} FROM financial_accounts WHERE business_id=$1 AND id=$2 FOR UPDATE`,
      [actor.business_id,accountId])).rows[0];
    if(!account) throw new AuthError(404,"RESOURCE_NOT_FOUND");
    return account;
  }
  update(actor:Actor,accountId:string,key:string,input:{name?:string;active?:boolean},requestId:string) {
    return this.write<FinancialAccount>(actor,key,"PATCH",`/accounts/${accountId}`,input,async(client)=>{
      const previous=await this.lockAccount(client,actor,accountId);
      const mapping=(await client.query<{store_id:string}>("SELECT store_id FROM account_stores WHERE business_id=$1 AND account_id=$2 ORDER BY store_id",[actor.business_id,accountId])).rows;
      const account=(await client.query<Omit<FinancialAccount,"storeIds">>(`UPDATE financial_accounts SET name=$1,active=$2 WHERE business_id=$3 AND id=$4 RETURNING ${accountColumns}`,
        [input.name ?? previous.name,input.active ?? previous.active,actor.business_id,accountId])).rows[0]!;
      const storeIds=mapping.map((row)=>row.store_id); const data={...account,storeIds};
      await this.audit(client,actor,requestId,"ACCOUNT_UPDATED",data,{...previous,storeIds});
      return {status:200,body:{data}};
    });
  }
  opening(actor:Actor,accountId:string,key:string,input:Omit<AccountOpening,"id" | "accountId">,requestId:string) {
    return this.write<AccountOpening>(actor,key,"POST",`/accounts/${accountId}/opening`,input,async(client)=>{
      const account=await this.lockAccount(client,actor,accountId);
      await this.owner(client,actor);
      if(!account.active) throw new AuthError(422,"ACCOUNT_INACTIVE");
      const mapping=await client.query(`SELECT 1 FROM account_stores m JOIN stores s ON s.business_id=m.business_id AND s.id=m.store_id AND s.active
        WHERE m.business_id=$1 AND m.store_id=$2 AND m.account_id=$3`,[actor.business_id,input.storeId,accountId]);
      if(!mapping.rowCount) throw new AuthError(404,"RESOURCE_NOT_FOUND");
      if((await client.query("SELECT 1 FROM account_openings WHERE business_id=$1 AND account_id=$2",[actor.business_id,accountId])).rowCount) throw new AuthError(409,"ACCOUNT_ALREADY_OPENED");
      if(!(await client.query<{valid:boolean}>("SELECT $1::timestamptz<=now() AS valid",[input.cutoverAt])).rows[0]!.valid) throw new AuthError(422,"INVALID_CUTOVER_DATE");
      const row=(await client.query<{id:string}>(`INSERT INTO account_openings(business_id,store_id,account_id,amount,cutover_at,reason,created_by)
        VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id`,[actor.business_id,input.storeId,accountId,input.amount,input.cutoverAt,input.reason,actor.user_id])).rows[0]!;
      if(input.amount!=="0") await client.query(`INSERT INTO money_movements(business_id,store_id,account_id,account_opening_id,delta,created_by)
        VALUES($1,$2,$3,$4,$5,$6)`,[actor.business_id,input.storeId,accountId,row.id,input.amount,actor.user_id]);
      const data={id:row.id,accountId,...input};
      await this.audit(client,actor,requestId,"ACCOUNT_OPENED",data,null,input.storeId,input.reason);
      return {status:201,body:{data}};
    });
  }
}
