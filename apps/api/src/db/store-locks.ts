import type { PoolClient } from "pg";
import { AuthError } from "../modules/auth/service.js";

export async function lockStoreConfiguration(client:PoolClient,storeIds:string[]) {
  for(const id of [...new Set(storeIds)].sort()) {
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",[`pos-lite-config:${id}`]);
  }
}
export async function requireEditableAccounts(client:PoolClient,businessId:string,storeIds:string[]) {
  await lockStoreConfiguration(client,storeIds);
  if((await client.query("SELECT 1 FROM business_days WHERE business_id=$1 AND store_id=ANY($2::uuid[]) AND state='OPEN'",[businessId,storeIds])).rowCount) {
    throw new AuthError(409,"ACCOUNT_CONFIGURATION_LOCKED");
  }
}
