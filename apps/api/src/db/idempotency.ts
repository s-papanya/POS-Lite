import { createHash } from "node:crypto";
import type { PoolClient } from "pg";
import { AuthError } from "../modules/auth/service.js";

export type WriteResult<T extends {id:string}> = {status:number;body:{data:T}};
export async function claimIdempotency<T extends {id:string}>(client:PoolClient,
  actor:{business_id:string;user_id:string},key:string,method:string,path:string,payload:unknown)
  :Promise<{id:string;replay?:never} | {id?:never;replay:WriteResult<T>}> {
  const hash=createHash("sha256").update(JSON.stringify({method,path,payload})).digest();
  const inserted=await client.query<{id:string}>(`INSERT INTO idempotency_records(business_id,user_id,key,method,path,payload_hash,response_status,response_body)
    VALUES($1,$2,$3,$4,$5,$6,200,'{}') ON CONFLICT(business_id,user_id,key) DO NOTHING RETURNING id`,
  [actor.business_id,actor.user_id,key,method,path,hash]);
  if(inserted.rowCount) return {id:inserted.rows[0]!.id};
  const stored=(await client.query<{payload_hash:Buffer;response_status:number;response_body:WriteResult<T>["body"]}>(
    "SELECT payload_hash,response_status,response_body FROM idempotency_records WHERE business_id=$1 AND user_id=$2 AND key=$3",
    [actor.business_id,actor.user_id,key])).rows[0]!;
  if(!stored.payload_hash.equals(hash)) throw new AuthError(409,"IDEMPOTENCY_CONFLICT");
  return {replay:{status:stored.response_status,body:stored.response_body}};
}
export async function completeIdempotency<T extends {id:string}>(client:PoolClient,id:string,result:WriteResult<T>) {
  await client.query("UPDATE idempotency_records SET response_status=$1,response_body=$2,resource_id=$3 WHERE id=$4",
    [result.status,result.body,result.body.data.id,id]);
}
