import type { Pool, PoolClient } from "pg";
import type { ExpenseCategory } from "@pos-lite/shared";
import { transaction } from "../../db/client.js";
import { claimIdempotency, completeIdempotency } from "../../db/idempotency.js";
import { AuthError, type Session } from "../auth/service.js";

type Actor = Session & {user_id:string;business_id:string};
export type CategoryCursor = {businessId:string;name:string;id:string};
export class ExpenseCategoriesService {
  constructor(private pool:Pool) {}
  private async access(client:Pool | PoolClient,actor:Actor,write=false) {
    const membership=(await client.query<{role:string;manager:boolean}>(`SELECT m.role,EXISTS(
      SELECT 1 FROM store_memberships sm JOIN stores s ON s.business_id=sm.business_id AND s.id=sm.store_id AND s.active
      WHERE sm.business_id=m.business_id AND sm.user_id=m.user_id AND sm.active AND sm.role='MANAGER') AS manager
      FROM business_memberships m JOIN users u ON u.id=m.user_id AND u.active
      JOIN businesses b ON b.id=m.business_id AND b.active
      WHERE m.business_id=$1 AND m.user_id=$2 AND m.active`,[actor.business_id,actor.user_id])).rows[0];
    if (!membership) throw new AuthError(404,"RESOURCE_NOT_FOUND");
    if (membership.role!=="OWNER" && (write || !membership.manager)) throw new AuthError(403,"FORBIDDEN");
  }
  async list(actor:Actor,limit:number,cursor?:CategoryCursor) {
    await this.access(this.pool,actor);
    if (cursor && cursor.businessId!==actor.business_id) throw new AuthError(400,"INVALID_REQUEST");
    const rows=(await this.pool.query<ExpenseCategory>(`SELECT id,name,active FROM expense_categories
      WHERE business_id=$1 AND active AND ($2::text IS NULL OR (name,id)>($2,$3::uuid))
      ORDER BY name,id LIMIT $4`,[actor.business_id,cursor?.name ?? null,cursor?.id ?? null,limit+1])).rows;
    const data=rows.slice(0,limit); const last=data.at(-1);
    return {data,page:{nextCursor:rows.length>limit && last ? Buffer.from(JSON.stringify({businessId:actor.business_id,name:last.name,id:last.id})).toString("base64url") : null}};
  }
  create(actor:Actor,key:string,input:{name:string},requestId:string) {
    return transaction(this.pool,async(client)=>{
      await this.access(client,actor,true);
      const claim=await claimIdempotency<ExpenseCategory>(client,actor,key,"POST","/expense-categories",input);
      await this.access(client,actor,true);
      if (claim.replay) return claim.replay;
      const category=(await client.query<ExpenseCategory>(`INSERT INTO expense_categories(business_id,name,created_by)
        VALUES($1,$2,$3) ON CONFLICT (business_id,lower(name)) DO NOTHING RETURNING id,name,active`,
      [actor.business_id,input.name,actor.user_id])).rows[0];
      if (!category) throw new AuthError(409,"CATEGORY_NAME_EXISTS");
      await client.query(`INSERT INTO audit_logs(business_id,actor_user_id,action,entity_type,entity_id,request_id,after_data)
        VALUES($1,$2,'EXPENSE_CATEGORY_CREATED','expense_category',$3,$4,$5)`,[actor.business_id,actor.user_id,category.id,requestId,category]);
      const result={status:201,body:{data:category}};
      await completeIdempotency(client,claim.id,result);
      return result;
    });
  }
}
