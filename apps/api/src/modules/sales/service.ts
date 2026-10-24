import type { Pool, PoolClient } from "pg";
import type { Product, Sale, SaleItem, SalePayment } from "@pos-lite/shared";
import type { SaleRequest, SupplementalSaleRequest } from "@pos-lite/validation";
import { transaction } from "../../db/client.js";
import { claimIdempotency, completeIdempotency } from "../../db/idempotency.js";
import { AuthError, type Session } from "../auth/service.js";
import { BusinessDaysService } from "../business-days/service.js";
import { CatalogError } from "../catalog/service.js";
import { calculateSale } from "./money.js";

type Actor=Session & {user_id:string;business_id:string};
export type HistoryQuery={from:string;to:string;limit:number;cursor?:string};
type Cursor={storeId:string;from:string;to:string;occurredAt:string;id:string};
export class SalesService {
  private days:BusinessDaysService;
  constructor(private pool:Pool) {this.days=new BusinessDaysService(pool);}
  private async read(client:Pool | PoolClient,actor:Actor,storeId:string,id:string):Promise<Sale> {
    const row=(await client.query<Omit<Sale,"items" | "payments" | "occurredAt" | "reason"> & {occurredAt:Date;reason:string | null}>(`SELECT s.id,s.reference,s.kind,s.reason,d.business_date::text AS "businessDate",
      s.occurred_at AS "occurredAt",s.gross::text,s.discount::text,s.net::text,s.day_revision::text AS "dayRevision"
      FROM sales s JOIN business_days d ON d.id=s.day_id WHERE s.business_id=$1 AND s.store_id=$2 AND s.id=$3`,[actor.business_id,storeId,id])).rows[0];
    if(!row) throw new AuthError(404,"RESOURCE_NOT_FOUND");
    const items=(await client.query<SaleItem>(`SELECT product_id AS "productId",name_snapshot AS "nameSnapshot",unit_price::text AS "unitPrice",
      product_version AS "productVersion",quantity,line_total::text AS "lineTotal" FROM sale_items WHERE sale_id=$1 ORDER BY position`,[id])).rows;
    const payments=(await client.query<SalePayment>(`SELECT id,account_id AS "accountId",channel,amount::text,tendered::text,change::text
      FROM sale_payments WHERE sale_id=$1 ORDER BY account_id`,[id])).rows;
    const {reason,...bill}=row;
    return {...bill,occurredAt:row.occurredAt.toISOString(),items,payments,...(reason===null ? {} : {reason})};
  }
  async get(actor:Actor,storeId:string,id:string) {
    await this.days.access(this.pool,actor,storeId);
    return {data:await this.read(this.pool,actor,storeId,id)};
  }
  async list(actor:Actor,storeId:string,query:HistoryQuery,cursor?:Cursor) {
    await this.days.access(this.pool,actor,storeId);
    if(cursor && (cursor.storeId!==storeId || cursor.from!==query.from || cursor.to!==query.to)) throw new AuthError(400,"INVALID_CURSOR");
    const rows=(await this.pool.query<{id:string;occurredAt:string}>(`SELECT id,to_char(occurred_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS "occurredAt" FROM sales
      WHERE business_id=$1 AND store_id=$2 AND occurred_at>=($3::date::timestamp AT TIME ZONE 'Asia/Bangkok')
      AND occurred_at<(($4::date+1)::timestamp AT TIME ZONE 'Asia/Bangkok')
      AND ($5::timestamptz IS NULL OR (occurred_at,id)<($5::timestamptz,$6::uuid)) ORDER BY occurred_at DESC,id DESC LIMIT $7`,
      [actor.business_id,storeId,query.from,query.to,cursor?.occurredAt ?? null,cursor?.id ?? null,query.limit+1])).rows;
    const page=rows.slice(0,query.limit); const last=page.at(-1);
    const data=await Promise.all(page.map((r)=>this.read(this.pool,actor,storeId,r.id)));
    return {data,page:{nextCursor:rows.length>query.limit && last ? Buffer.from(JSON.stringify({storeId,from:query.from,to:query.to,...last})).toString("base64url") : null}};
  }
  create(actor:Actor,storeId:string,key:string,input:SaleRequest | SupplementalSaleRequest,requestId:string) {
    const supplemental=!("items" in input);
    const kind=supplemental ? "SUPPLEMENTAL" : "POS";
    return transaction(this.pool,async(client)=>{
      await this.days.access(client,actor,storeId,supplemental);
      const claim=await claimIdempotency<Sale>(client,actor,key,"POST",`/stores/${storeId}/${supplemental ? "supplemental-sales" : "sales"}`,input);
      await this.days.access(client,actor,storeId,supplemental);
      if(claim.replay) return claim.replay;
      const {data:day}=await this.days.ensureOpen(client,actor,storeId,input.businessDate,requestId);
      const data=await this.postToDay(client,actor,storeId,day.id,input,requestId,kind);
      const result={status:201,body:{data}};
      await completeIdempotency(client,claim.id,result);
      return result;
    });
  }
  async postToDay(client:PoolClient,actor:Actor,storeId:string,dayId:string,input:SaleRequest | SupplementalSaleRequest,requestId:string,kind:Sale["kind"]) {
    const supplemental=kind!=="POS";
    const requestedItems="items" in input ? input.items : [];
    const products=requestedItems.length ? (await client.query<Product>(`SELECT id,name,price::text,version,active FROM products
      WHERE business_id=$1 AND store_id=$2 AND id=ANY($3::uuid[]) ORDER BY id FOR SHARE`,[actor.business_id,storeId,requestedItems.map((i)=>i.productId)])).rows : [];
    if(products.length!==requestedItems.length) throw new AuthError(404,"RESOURCE_NOT_FOUND");
    const items=requestedItems.map((item)=>{
      const product=products.find((p)=>p.id===item.productId)!;
      if(product.version!==item.expectedVersion) throw new CatalogError(409,"PRICE_CHANGED",{current:product});
      if(!product.active) throw new AuthError(422,"PRODUCT_INACTIVE");
      return {productId:product.id,nameSnapshot:product.name,unitPrice:product.price,productVersion:product.version,quantity:item.quantity};
    });
    const totals="items" in input ? calculateSale(items,input.discount,input.payments.map((p)=>p.amount))
      : input.payments.reduce((sum,p)=>sum+BigInt(p.amount),0n)===BigInt(input.amount)
        ? {gross:input.amount,discount:"0",net:input.amount,lineTotals:[]} : null;
    if(!totals) throw new AuthError(422,"INVALID_SALE_TOTALS");
    const accounts=(await client.query<{id:string;type:string;active:boolean;cutover_at:Date | null}>(`SELECT a.id,a.type,a.active,o.cutover_at
      FROM financial_accounts a JOIN account_stores m ON m.business_id=a.business_id AND m.account_id=a.id
      LEFT JOIN account_openings o ON o.business_id=a.business_id AND o.account_id=a.id
      WHERE a.business_id=$1 AND m.store_id=$2 AND a.id=ANY($3::uuid[]) ORDER BY a.id FOR UPDATE OF a`,[actor.business_id,storeId,input.payments.map((p)=>p.accountId)])).rows;
    if(accounts.length!==input.payments.length) throw new AuthError(404,"RESOURCE_NOT_FOUND");
    for(const payment of input.payments) {
      const account=accounts.find((a)=>a.id===payment.accountId)!;
      if(!account.active || !account.cutover_at) throw new AuthError(422,"ACCOUNT_INACTIVE");
      if((payment.channel==="CASH" ? "CASH" : "BANK")!==account.type) throw new AuthError(422,"ACCOUNT_CHANNEL_MISMATCH");
      if(payment.channel==="CASH" && BigInt(payment.tendered)<BigInt(payment.amount)) throw new AuthError(422,"INSUFFICIENT_TENDERED");
    }
    const valid=(await client.query<{valid:boolean}>(`SELECT (clock_timestamp() AT TIME ZONE 'Asia/Bangkok')::date=$1::date
      AND ($2::timestamptz AT TIME ZONE 'Asia/Bangkok')::date=$1::date AND $2::timestamptz<=clock_timestamp()
      AND NOT EXISTS(SELECT 1 FROM account_openings WHERE account_id=ANY($3::uuid[]) AND cutover_at>$2) AS valid`,[input.businessDate,input.occurredAt,input.payments.map((p)=>p.accountId)])).rows[0]!.valid;
    if(!valid) throw new AuthError(422,"INVALID_OCCURRED_AT");
    await this.days.access(client,actor,storeId,supplemental);
    const sequence=(await client.query<{number:string}>(`INSERT INTO document_counters(business_id,store_id,business_date,kind,next_number)
      VALUES($1,$2,$3,$4,2) ON CONFLICT(business_id,store_id,business_date,kind) DO UPDATE SET next_number=document_counters.next_number+1
      RETURNING (next_number-1)::text AS number`,[actor.business_id,storeId,input.businessDate,kind])).rows[0]!.number;
    const revision=(await client.query<{revision:string}>("UPDATE business_days SET revision=revision+1 WHERE id=$1 RETURNING revision::text",[dayId])).rows[0]!.revision;
    const reference=`${kind==="RECONCILIATION" ? "REC" : supplemental ? "SUP" : "POS"}-${input.businessDate.replaceAll("-","")}-${sequence.padStart(6,"0")}`;
    const id=(await client.query<{id:string}>(`INSERT INTO sales(business_id,store_id,day_id,reference,gross,discount,net,day_revision,occurred_at,created_by,kind,reason)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id`,[actor.business_id,storeId,dayId,reference,totals.gross,totals.discount,totals.net,revision,input.occurredAt,actor.user_id,kind,"reason" in input ? input.reason : null])).rows[0]!.id;
    for(const [position,item] of items.entries()) await client.query(`INSERT INTO sale_items(business_id,store_id,sale_id,position,product_id,name_snapshot,unit_price,product_version,quantity,line_total)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,[actor.business_id,storeId,id,position,item.productId,item.nameSnapshot,item.unitPrice,item.productVersion,item.quantity,totals.lineTotals[position]]);
    for(const payment of input.payments) {
      const tendered=payment.channel==="CASH" ? payment.tendered : null;
      const change=tendered===null ? null : String(BigInt(tendered)-BigInt(payment.amount));
      const paymentId=(await client.query<{id:string}>(`INSERT INTO sale_payments(business_id,store_id,day_id,sale_id,account_id,channel,amount,tendered,change)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,[actor.business_id,storeId,dayId,id,payment.accountId,payment.channel,payment.amount,tendered,change])).rows[0]!.id;
      await client.query(`INSERT INTO money_movements(business_id,store_id,day_id,account_id,sale_payment_id,delta,created_by)
        VALUES($1,$2,$3,$4,$5,$6,$7)`,[actor.business_id,storeId,dayId,payment.accountId,paymentId,payment.amount,actor.user_id]);
    }
    const data=await this.read(client,actor,storeId,id);
    await client.query(`INSERT INTO audit_logs(business_id,store_id,actor_user_id,action,entity_type,entity_id,request_id,after_data)
      VALUES($1,$2,$3,$7,'sale',$4,$5,$6)`,[actor.business_id,storeId,actor.user_id,id,requestId,data,kind==="RECONCILIATION" ? "RECONCILIATION_SALE_CREATED" : supplemental ? "SUPPLEMENTAL_SALE_CREATED" : "SALE_CREATED"]);
    return data;
  }
}
