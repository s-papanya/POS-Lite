import { createHash } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import type { Product } from "@pos-lite/shared";
import { transaction } from "../../db/client.js";
import type { Session } from "../auth/service.js";

export class CatalogError extends Error {
  constructor(public status:number,public code:string,public details?:Record<string,unknown>) { super(code); }
}
type Context = Session & { user_id:string; business_id:string };
type Result = {status:number;body:{data:Product}};
type Update = {name?:string;price?:string;active?:boolean;expectedVersion:number};
type Scope = {businessId:string;storeId:string;userId:string};
const projection = "id,name,price::text AS price,version,active";

export class CatalogService {
  constructor(private pool:Pool) {}
  private async scope(client:Pool | PoolClient,session:Context,storeId:string,owner=false):Promise<Scope> {
    const access = await client.query<{role:string}>(`SELECT b.role FROM stores s JOIN businesses business ON business.id=s.business_id AND business.active
      JOIN business_memberships b ON b.business_id=s.business_id AND b.user_id=$2 AND b.active
      JOIN users u ON u.id=b.user_id AND u.active
      LEFT JOIN store_memberships m ON m.business_id=s.business_id AND m.store_id=s.id AND m.user_id=$2 AND m.active
      WHERE s.business_id=$1 AND s.id=$3 AND s.active AND (b.role='OWNER' OR m.role IS NOT NULL)`,[session.business_id,session.user_id,storeId]);
    if (!access.rowCount) throw new CatalogError(404,"RESOURCE_NOT_FOUND");
    if (owner && access.rows[0]!.role !== "OWNER") throw new CatalogError(403,"FORBIDDEN");
    return {businessId:session.business_id,storeId,userId:session.user_id};
  }
  async list(session:Context,storeId:string,limit:number,active:boolean,cursor?:{id:string;name:string;storeId:string;active:boolean}) {
    await this.scope(this.pool,session,storeId,!active);
    if (cursor && (cursor.storeId !== storeId || cursor.active !== active)) throw new CatalogError(400,"INVALID_REQUEST");
    const rows = (await this.pool.query<Product>(`SELECT ${projection} FROM products
      WHERE business_id=$1 AND store_id=$2 AND active=$3 AND ($4::text IS NULL OR (name,id)>($4,$5::uuid))
      ORDER BY name,id LIMIT $6`,[session.business_id,storeId,active,cursor?.name ?? null,cursor?.id ?? null,limit+1])).rows;
    const data=rows.slice(0,limit); const last=data.at(-1);
    return {data,page:{nextCursor:rows.length>limit && last ? Buffer.from(JSON.stringify({id:last.id,name:last.name,storeId,active})).toString("base64url") : null}};
  }
  private async mutate(session:Context,storeId:string,key:string,method:string,path:string,payload:unknown,
    work:(client:PoolClient,scope:Scope)=>Promise<Result>):Promise<Result> {
    return transaction(this.pool,async (client) => {
      // Current permission is checked before claiming/replaying a key.
      const scope = await this.scope(client,session,storeId,true);
      const hash=createHash("sha256").update(JSON.stringify({method,path,payload})).digest();
      const inserted=await client.query<{id:string}>(`INSERT INTO idempotency_records(business_id,user_id,key,method,path,payload_hash,response_status,response_body)
        VALUES($1,$2,$3,$4,$5,$6,200,'{}') ON CONFLICT(business_id,user_id,key) DO NOTHING RETURNING id`,
      [scope.businessId,scope.userId,key,method,path,hash]);
      // The unique insert can wait for another transaction; recheck access after that wait.
      await this.scope(client,session,storeId,true);
      if (!inserted.rowCount) {
        const stored=(await client.query<{payload_hash:Buffer;response_status:number;response_body:Result["body"]}>(
          "SELECT payload_hash,response_status,response_body FROM idempotency_records WHERE business_id=$1 AND user_id=$2 AND key=$3",
          [scope.businessId,scope.userId,key])).rows[0]!;
        if (!stored.payload_hash.equals(hash)) throw new CatalogError(409,"IDEMPOTENCY_CONFLICT");
        return {status:stored.response_status,body:stored.response_body};
      }
      const result=await work(client,scope);
      await client.query("UPDATE idempotency_records SET response_status=$1,response_body=$2,resource_id=$3 WHERE id=$4",
        [result.status,result.body,result.body.data.id,inserted.rows[0]!.id]);
      return result;
    });
  }
  private async audit(client:PoolClient,scope:Scope,requestId:string,action:string,before:Product | null,after:Product) {
    await client.query(`INSERT INTO audit_logs(business_id,store_id,actor_user_id,action,entity_type,entity_id,request_id,before_data,after_data)
      VALUES($1,$2,$3,$4,'product',$5,$6,$7,$8)`,[scope.businessId,scope.storeId,scope.userId,action,after.id,requestId,before,after]);
  }
  create(session:Context,storeId:string,key:string,input:{name:string;price:string},requestId:string) {
    return this.mutate(session,storeId,key,"POST",`/stores/${storeId}/products`,input,async (client,scope) => {
      const product=(await client.query<Product>(`INSERT INTO products(business_id,store_id,name,price,created_by) VALUES($1,$2,$3,$4,$5) RETURNING ${projection}`,
        [scope.businessId,scope.storeId,input.name,input.price,scope.userId])).rows[0]!;
      await this.audit(client,scope,requestId,"PRODUCT_CREATED",null,product);
      return {status:201,body:{data:product}};
    });
  }
  update(session:Context,storeId:string,productId:string,key:string,input:Update,requestId:string) {
    return this.mutate(session,storeId,key,"PATCH",`/stores/${storeId}/products/${productId}`,input,async (client,scope) => {
      const previous=(await client.query<Product>(`SELECT ${projection} FROM products WHERE business_id=$1 AND store_id=$2 AND id=$3 FOR UPDATE`,
        [scope.businessId,scope.storeId,productId])).rows[0];
      if (!previous) throw new CatalogError(404,"RESOURCE_NOT_FOUND");
      if (previous.version !== input.expectedVersion) throw new CatalogError(409,"PRICE_CHANGED",{product:previous});
      const updated=(await client.query<Product>(`UPDATE products SET name=$1,price=$2,active=$3,version=version+1
        WHERE business_id=$4 AND store_id=$5 AND id=$6 RETURNING ${projection}`,
      [input.name ?? previous.name,input.price ?? previous.price,input.active ?? previous.active,scope.businessId,scope.storeId,productId])).rows[0]!;
      await this.audit(client,scope,requestId,"PRODUCT_UPDATED",previous,updated);
      return {status:200,body:{data:updated}};
    });
  }
}
