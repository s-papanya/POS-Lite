import { sql } from "drizzle-orm";
import { bigint, boolean, check, customType, date, foreignKey, index, integer, jsonb, pgTable,
  text, timestamp, unique, uniqueIndex, uuid } from "drizzle-orm/pg-core";

const bytea = customType<{ data: Buffer }>({ dataType: () => "bytea" });
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const id = () => uuid("id").primaryKey().defaultRandom();

export const users = pgTable("users", {
  id: id(), username: text("username").notNull(), passwordHash: text("password_hash").notNull(),
  active: boolean("active").notNull().default(true), createdAt: createdAt(),
}, (t) => [uniqueIndex("users_username_lower_uq").on(sql`lower(${t.username})`),
  check("users_username_length", sql`length(${t.username}) between 3 and 64`)]);

export const businesses = pgTable("businesses", {
  id: id(), name: text("name").notNull(), active: boolean("active").notNull().default(true),
  timezone: text("timezone").notNull().default("Asia/Bangkok"), currency: text("currency").notNull().default("THB"),
  createdAt: createdAt(), createdBy: uuid("created_by").notNull().references(() => users.id),
}, (t) => [check("businesses_locale", sql`${t.timezone} = 'Asia/Bangkok' and ${t.currency} = 'THB'`)]);

export const stores = pgTable("stores", {
  id: id(), businessId: uuid("business_id").notNull().references(() => businesses.id),
  name: text("name").notNull(), code: text("code").notNull(), active: boolean("active").notNull().default(true),
  createdAt: createdAt(), createdBy: uuid("created_by").notNull().references(() => users.id),
}, (t) => [unique("stores_business_id_uq").on(t.businessId, t.id),
  unique("stores_business_code_uq").on(t.businessId, t.code)]);

export const businessMemberships = pgTable("business_memberships", {
  id: id(), businessId: uuid("business_id").notNull().references(() => businesses.id),
  userId: uuid("user_id").notNull().references(() => users.id), role: text("role").notNull(),
  active: boolean("active").notNull().default(true), createdAt: createdAt(),
  createdBy: uuid("created_by").notNull().references(() => users.id),
}, (t) => [unique("business_memberships_user_uq").on(t.businessId, t.userId),
  check("business_memberships_role", sql`${t.role} in ('OWNER', 'MEMBER')`), index("business_memberships_user_idx").on(t.userId, t.active)]);

export const storeMemberships = pgTable("store_memberships", {
  id: id(), businessId: uuid("business_id").notNull().references(() => businesses.id),
  storeId: uuid("store_id").notNull(), userId: uuid("user_id").notNull().references(() => users.id),
  role: text("role").notNull(), active: boolean("active").notNull().default(true), createdAt: createdAt(),
  createdBy: uuid("created_by").notNull().references(() => users.id),
}, (t) => [foreignKey({ columns: [t.businessId, t.userId], foreignColumns: [businessMemberships.businessId, businessMemberships.userId],
  name: "store_memberships_user_scope_fk" }), foreignKey({ columns: [t.businessId, t.storeId], foreignColumns: [stores.businessId, stores.id],
  name: "store_memberships_store_scope_fk" }), unique("store_memberships_user_uq").on(t.businessId, t.storeId, t.userId),
  check("store_memberships_role", sql`${t.role} in ('MANAGER', 'STAFF')`), index("store_memberships_user_idx").on(t.userId, t.active)]);

export const sessions = pgTable("sessions", {
  id: id(), userId: uuid("user_id").references(() => users.id),
  businessId: uuid("business_id").references(() => businesses.id),
  tokenHash: bytea("token_hash").notNull(), csrfHash: bytea("csrf_hash").notNull(),
  createdAt: createdAt(), lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  absoluteExpiresAt: timestamp("absolute_expires_at", { withTimezone: true }).notNull(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
}, (t) => [foreignKey({ columns: [t.businessId, t.userId], foreignColumns: [businessMemberships.businessId, businessMemberships.userId],
  name: "sessions_user_scope_fk" }), unique("sessions_token_hash_uq").on(t.tokenHash), index("sessions_user_idx").on(t.userId),
  index("sessions_expiry_idx").on(t.expiresAt),
  check("sessions_identity_pair", sql`(${t.userId} is null) = (${t.businessId} is null)`),
  check("sessions_hash_length", sql`octet_length(${t.tokenHash}) = 32 and octet_length(${t.csrfHash}) = 32`),
  check("sessions_expiry_order", sql`${t.expiresAt} <= ${t.absoluteExpiresAt} and ${t.createdAt} <= ${t.absoluteExpiresAt}`)]);

export const loginAttempts = pgTable("login_attempts", {
  id: id(), bucketKey: text("bucket_key").notNull(),
  windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
  attempts: integer("attempts").notNull(), expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
}, (t) => [unique("login_attempts_bucket_uq").on(t.bucketKey, t.windowStart),
  check("login_attempts_positive", sql`${t.attempts} > 0`), index("login_attempts_expiry_idx").on(t.expiresAt)]);

export const auditLogs = pgTable("audit_logs", {
  id: id(), businessId: uuid("business_id").notNull().references(() => businesses.id),
  storeId: uuid("store_id"), actorUserId: uuid("actor_user_id").notNull().references(() => users.id),
  action: text("action").notNull(), entityType: text("entity_type").notNull(), entityId: uuid("entity_id").notNull(),
  requestId: uuid("request_id").notNull(), reason: text("reason"),
  beforeData: jsonb("before_data"), afterData: jsonb("after_data"), createdAt: createdAt(),
}, (t) => [foreignKey({ columns: [t.businessId, t.actorUserId], foreignColumns: [businessMemberships.businessId, businessMemberships.userId],
  name: "audit_logs_actor_scope_fk" }), foreignKey({ columns: [t.businessId, t.storeId], foreignColumns: [stores.businessId, stores.id],
  name: "audit_logs_store_scope_fk" }), index("audit_logs_store_time_idx").on(t.businessId, t.storeId, t.createdAt),
  index("audit_logs_entity_idx").on(t.businessId, t.entityType, t.entityId, t.createdAt)]);

export const expenseCategories = pgTable("expense_categories", {
  id:id(),businessId:uuid("business_id").notNull().references(()=>businesses.id),
  name:text("name").notNull(),active:boolean("active").notNull().default(true),
  createdAt:createdAt(),createdBy:uuid("created_by").notNull(),
},(t)=>[unique("expense_categories_scope_uq").on(t.businessId,t.id),
  foreignKey({columns:[t.businessId,t.createdBy],foreignColumns:[businessMemberships.businessId,businessMemberships.userId],name:"expense_categories_actor_scope_fk"}),
  uniqueIndex("expense_categories_name_uq").on(t.businessId,sql`lower(${t.name})`),
  check("expense_categories_name",sql`length(${t.name}) between 1 and 120 and ${t.name}=normalize(btrim(${t.name}),NFC) and ${t.name} !~ '[[:cntrl:]]'`),
  index("expense_categories_listing_idx").on(t.businessId,t.active,t.name,t.id)]);

export const products = pgTable("products", {
  id:id(),businessId:uuid("business_id").notNull(),storeId:uuid("store_id").notNull(),
  name:text("name").notNull(),price:bigint("price",{mode:"bigint"}).notNull(),
  version:integer("version").notNull().default(1),active:boolean("active").notNull().default(true),
  createdAt:createdAt(),createdBy:uuid("created_by").notNull(),
},(t) => [unique("products_scope_uq").on(t.businessId,t.storeId,t.id),
  foreignKey({columns:[t.businessId,t.storeId],foreignColumns:[stores.businessId,stores.id],name:"products_store_scope_fk"}),
  foreignKey({columns:[t.businessId,t.createdBy],foreignColumns:[businessMemberships.businessId,businessMemberships.userId],name:"products_actor_scope_fk"}),
  check("products_price",sql`${t.price} > 0 and ${t.price} <= 9000000000000`),
  check("products_name",sql`length(trim(${t.name})) between 1 and 120`),
  check("products_version",sql`${t.version} > 0`),index("products_listing_idx").on(t.businessId,t.storeId,t.active,t.name,t.id)]);

export const idempotencyRecords = pgTable("idempotency_records", {
  id:id(),businessId:uuid("business_id").notNull(),userId:uuid("user_id").notNull(),key:uuid("key").notNull(),
  method:text("method").notNull(),path:text("path").notNull(),payloadHash:bytea("payload_hash").notNull(),
  responseStatus:integer("response_status").notNull(),responseBody:jsonb("response_body").notNull(),
  resourceId:uuid("resource_id"),createdAt:createdAt(),
},(t) => [unique("idempotency_records_key_uq").on(t.businessId,t.userId,t.key),
  foreignKey({columns:[t.businessId,t.userId],foreignColumns:[businessMemberships.businessId,businessMemberships.userId],name:"idempotency_records_user_scope_fk"}),
  check("idempotency_records_hash",sql`octet_length(${t.payloadHash}) = 32`),
  check("idempotency_records_status",sql`${t.responseStatus} between 200 and 299`),index("idempotency_records_time_idx").on(t.businessId,t.createdAt)]);

export const financialAccounts = pgTable("financial_accounts",{
  id:id(),businessId:uuid("business_id").notNull().references(()=>businesses.id),name:text("name").notNull(),
  type:text("type").notNull(),active:boolean("active").notNull().default(true),createdAt:createdAt(),createdBy:uuid("created_by").notNull(),
},(t)=>[unique("financial_accounts_scope_uq").on(t.businessId,t.id),unique("financial_accounts_name_uq").on(t.businessId,t.name),
  foreignKey({columns:[t.businessId,t.createdBy],foreignColumns:[businessMemberships.businessId,businessMemberships.userId],name:"financial_accounts_actor_fk"}),
  check("financial_accounts_type",sql`${t.type} in ('CASH','BANK')`),check("financial_accounts_name",sql`length(trim(${t.name})) between 1 and 120`)]);
export const accountStores = pgTable("account_stores",{
  id:id(),businessId:uuid("business_id").notNull(),storeId:uuid("store_id").notNull(),accountId:uuid("account_id").notNull(),
  createdAt:createdAt(),createdBy:uuid("created_by").notNull(),
},(t)=>[unique("account_stores_scope_uq").on(t.businessId,t.storeId,t.accountId),
  foreignKey({columns:[t.businessId,t.storeId],foreignColumns:[stores.businessId,stores.id],name:"account_stores_store_fk"}),
  foreignKey({columns:[t.businessId,t.accountId],foreignColumns:[financialAccounts.businessId,financialAccounts.id],name:"account_stores_account_fk"}),
  foreignKey({columns:[t.businessId,t.createdBy],foreignColumns:[businessMemberships.businessId,businessMemberships.userId],name:"account_stores_actor_fk"}),
  index("account_stores_account_idx").on(t.businessId,t.accountId)]);
export const accountOpenings = pgTable("account_openings",{
  id:id(),businessId:uuid("business_id").notNull(),storeId:uuid("store_id").notNull(),accountId:uuid("account_id").notNull(),
  amount:bigint("amount",{mode:"bigint"}).notNull(),cutoverAt:timestamp("cutover_at",{withTimezone:true}).notNull(),
  reason:text("reason").notNull(),createdAt:createdAt(),createdBy:uuid("created_by").notNull(),
},(t)=>[unique("account_openings_account_uq").on(t.businessId,t.accountId),
  unique("account_openings_source_uq").on(t.businessId,t.storeId,t.accountId,t.id),
  foreignKey({columns:[t.businessId,t.storeId,t.accountId],foreignColumns:[accountStores.businessId,accountStores.storeId,accountStores.accountId],name:"account_openings_mapping_fk"}),
  foreignKey({columns:[t.businessId,t.createdBy],foreignColumns:[businessMemberships.businessId,businessMemberships.userId],name:"account_openings_actor_fk"}),
  check("account_openings_amount",sql`${t.amount} between 0 and 9000000000000`),
  check("account_openings_cutover",sql`${t.cutoverAt} <= ${t.createdAt}`),
  check("account_openings_reason",sql`length(trim(${t.reason})) between 1 and 1000`)]);
export const moneyMovements = pgTable("money_movements",{
  id:id(),businessId:uuid("business_id").notNull(),storeId:uuid("store_id").notNull(),accountId:uuid("account_id").notNull(),
  accountOpeningId:uuid("account_opening_id"),salePaymentId:uuid("sale_payment_id"),expensePaymentId:uuid("expense_payment_id"),ownerTransactionId:uuid("owner_transaction_id"),dayId:uuid("day_id"),delta:bigint("delta",{mode:"bigint"}).notNull(),
  createdAt:createdAt(),createdBy:uuid("created_by").notNull(),
},(t)=>[unique("money_movements_opening_uq").on(t.accountOpeningId),
  unique("money_movements_payment_uq").on(t.salePaymentId),
  foreignKey({columns:[t.businessId,t.storeId,t.dayId,t.accountId,t.salePaymentId],foreignColumns:[salePayments.businessId,salePayments.storeId,salePayments.dayId,salePayments.accountId,salePayments.id],name:"money_movements_payment_fk"}),
  unique("money_movements_expense_uq").on(t.expensePaymentId),
  foreignKey({columns:[t.businessId,t.storeId,t.dayId,t.accountId,t.expensePaymentId],foreignColumns:[expensePayments.businessId,expensePayments.storeId,expensePayments.dayId,expensePayments.accountId,expensePayments.id],name:"money_movements_expense_fk"}),
  unique("money_movements_owner_uq").on(t.ownerTransactionId),
  foreignKey({columns:[t.businessId,t.storeId,t.dayId,t.accountId,t.ownerTransactionId],foreignColumns:[ownerTransactions.businessId,ownerTransactions.storeId,ownerTransactions.dayId,ownerTransactions.accountId,ownerTransactions.id],name:"money_movements_owner_fk"}),
  check("money_movements_source",sql`num_nonnulls(${t.accountOpeningId},${t.salePaymentId},${t.expensePaymentId},${t.ownerTransactionId})=1 and ((${t.accountOpeningId} is not null and ${t.dayId} is null) or (${t.accountOpeningId} is null and ${t.dayId} is not null))`),
  foreignKey({columns:[t.businessId,t.storeId,t.accountId,t.accountOpeningId],
    foreignColumns:[accountOpenings.businessId,accountOpenings.storeId,accountOpenings.accountId,accountOpenings.id],name:"money_movements_opening_scope_fk"}),
  foreignKey({columns:[t.businessId,t.createdBy],foreignColumns:[businessMemberships.businessId,businessMemberships.userId],name:"money_movements_actor_fk"}),
  check("money_movements_delta",sql`(${t.expensePaymentId} is not null and ${t.delta} between -9000000000000 and -1) or (${t.ownerTransactionId} is not null and ${t.delta} between -9000000000000 and 9000000000000 and ${t.delta}<>0) or (${t.expensePaymentId} is null and ${t.ownerTransactionId} is null and ${t.delta} between 1 and 9000000000000)`),
  index("money_movements_balance_idx").on(t.businessId,t.accountId,t.createdAt,t.id)]);

export const ownerTransactions = pgTable("owner_transactions",{
  id:id(),businessId:uuid("business_id").notNull(),storeId:uuid("store_id").notNull(),dayId:uuid("day_id").notNull(),accountId:uuid("account_id").notNull(),
  kind:text("kind").notNull(),amount:bigint("amount",{mode:"bigint"}).notNull(),note:text("note").notNull(),
  occurredAt:timestamp("occurred_at",{withTimezone:true}).notNull(),createdAt:createdAt(),createdBy:uuid("created_by").notNull(),
},(t)=>[unique("owner_transactions_scope_uq").on(t.businessId,t.storeId,t.dayId,t.accountId,t.id),
  foreignKey({columns:[t.businessId,t.storeId,t.dayId],foreignColumns:[businessDays.businessId,businessDays.storeId,businessDays.id],name:"owner_transactions_day_fk"}),
  foreignKey({columns:[t.businessId,t.storeId,t.accountId],foreignColumns:[accountStores.businessId,accountStores.storeId,accountStores.accountId],name:"owner_transactions_account_fk"}),
  foreignKey({columns:[t.businessId,t.createdBy],foreignColumns:[businessMemberships.businessId,businessMemberships.userId],name:"owner_transactions_actor_fk"}),
  check("owner_transactions_kind",sql`${t.kind} in ('CONTRIBUTION','WITHDRAWAL')`),check("owner_transactions_amount",sql`${t.amount} between 1 and 9000000000000`),
  check("owner_transactions_note",sql`length(trim(${t.note})) between 1 and 1000`),index("owner_transactions_day_idx").on(t.businessId,t.storeId,t.dayId)]);

export const expenses = pgTable("expenses",{
  id:id(),businessId:uuid("business_id").notNull(),storeId:uuid("store_id").notNull(),dayId:uuid("day_id").notNull(),
  categoryId:uuid("category_id").notNull(),amount:bigint("amount",{mode:"bigint"}).notNull(),description:text("description").notNull(),evidenceReference:text("evidence_reference"),
  occurredAt:timestamp("occurred_at",{withTimezone:true}).notNull(),createdAt:createdAt(),createdBy:uuid("created_by").notNull(),
},(t)=>[unique("expenses_scope_uq").on(t.businessId,t.storeId,t.id),
  foreignKey({columns:[t.businessId,t.storeId,t.dayId],foreignColumns:[businessDays.businessId,businessDays.storeId,businessDays.id],name:"expenses_day_fk"}),
  foreignKey({columns:[t.businessId,t.categoryId],foreignColumns:[expenseCategories.businessId,expenseCategories.id],name:"expenses_category_fk"}),
  foreignKey({columns:[t.businessId,t.createdBy],foreignColumns:[businessMemberships.businessId,businessMemberships.userId],name:"expenses_actor_fk"}),
  check("expenses_amount",sql`${t.amount} between 1 and 9000000000000`),
  check("expenses_description",sql`length(trim(${t.description})) between 1 and 1000`),
  check("expenses_evidence",sql`${t.evidenceReference} is null or length(trim(${t.evidenceReference})) between 1 and 1000`),
  index("expenses_listing_idx").on(t.businessId,t.storeId,t.occurredAt,t.id),index("expenses_category_idx").on(t.businessId,t.categoryId)]);

export const expensePayments = pgTable("expense_payments",{
  id:id(),businessId:uuid("business_id").notNull(),storeId:uuid("store_id").notNull(),dayId:uuid("day_id").notNull(),
  expenseId:uuid("expense_id").notNull(),accountId:uuid("account_id").notNull(),amount:bigint("amount",{mode:"bigint"}).notNull(),
  occurredAt:timestamp("occurred_at",{withTimezone:true}).notNull(),createdAt:createdAt(),createdBy:uuid("created_by").notNull(),
},(t)=>[unique("expense_payments_scope_uq").on(t.businessId,t.storeId,t.dayId,t.accountId,t.id),
  unique("expense_payments_expense_uq").on(t.expenseId),
  foreignKey({columns:[t.businessId,t.storeId,t.expenseId],foreignColumns:[expenses.businessId,expenses.storeId,expenses.id],name:"expense_payments_expense_fk"}),
  foreignKey({columns:[t.businessId,t.storeId,t.dayId],foreignColumns:[businessDays.businessId,businessDays.storeId,businessDays.id],name:"expense_payments_day_fk"}),
  foreignKey({columns:[t.businessId,t.storeId,t.accountId],foreignColumns:[accountStores.businessId,accountStores.storeId,accountStores.accountId],name:"expense_payments_account_fk"}),
  foreignKey({columns:[t.businessId,t.createdBy],foreignColumns:[businessMemberships.businessId,businessMemberships.userId],name:"expense_payments_actor_fk"}),
  check("expense_payments_amount",sql`${t.amount} between 1 and 9000000000000`)]);

export const businessDays = pgTable("business_days",{
  id:id(),businessId:uuid("business_id").notNull(),storeId:uuid("store_id").notNull(),businessDate:date("business_date").notNull(),
  state:text("state").notNull().default("OPEN"),revision:bigint("revision",{mode:"bigint"}).notNull().default(sql`0`),
  closingVersion:integer("closing_version").notNull().default(0),
  openedAt:timestamp("opened_at",{withTimezone:true}).notNull().default(sql`clock_timestamp()`),createdAt:createdAt(),createdBy:uuid("created_by").notNull(),
},(t)=>[unique("business_days_date_uq").on(t.businessId,t.storeId,t.businessDate),unique("business_days_scope_uq").on(t.businessId,t.storeId,t.id),
  uniqueIndex("business_days_open_uq").on(t.businessId,t.storeId).where(sql`${t.state} = 'OPEN'`),
  foreignKey({columns:[t.businessId,t.storeId],foreignColumns:[stores.businessId,stores.id],name:"business_days_store_fk"}),
  foreignKey({columns:[t.businessId,t.createdBy],foreignColumns:[businessMemberships.businessId,businessMemberships.userId],name:"business_days_actor_fk"}),
  check("business_days_state",sql`${t.state} in ('OPEN','CLOSED')`),check("business_days_revision",sql`${t.revision} >= 0 and ${t.closingVersion} >= 0`),
  check("business_days_date",sql`${t.businessDate} = (${t.openedAt} AT TIME ZONE 'Asia/Bangkok')::date`)]);
export const dayOpenings = pgTable("day_openings",{
  id:id(),businessId:uuid("business_id").notNull(),storeId:uuid("store_id").notNull(),dayId:uuid("day_id").notNull(),accountId:uuid("account_id").notNull(),
  amount:bigint("amount",{mode:"bigint"}).notNull(),recordedAt:timestamp("recorded_at",{withTimezone:true}).notNull(),createdAt:createdAt(),createdBy:uuid("created_by").notNull(),
},(t)=>[unique("day_openings_account_uq").on(t.dayId,t.accountId),
  foreignKey({columns:[t.businessId,t.storeId,t.dayId],foreignColumns:[businessDays.businessId,businessDays.storeId,businessDays.id],name:"day_openings_day_fk"}),
  foreignKey({columns:[t.businessId,t.storeId,t.accountId],foreignColumns:[accountStores.businessId,accountStores.storeId,accountStores.accountId],name:"day_openings_mapping_fk"}),
  foreignKey({columns:[t.businessId,t.createdBy],foreignColumns:[businessMemberships.businessId,businessMemberships.userId],name:"day_openings_actor_fk"}),
  check("day_openings_amount",sql`${t.amount} between 0 and 9000000000000`)]);

export const documentCounters = pgTable("document_counters",{
  id:id(),businessId:uuid("business_id").notNull(),storeId:uuid("store_id").notNull(),businessDate:date("business_date").notNull(),
  kind:text("kind").notNull(),nextNumber:bigint("next_number",{mode:"bigint"}).notNull(),
},(t)=>[unique("document_counters_scope_uq").on(t.businessId,t.storeId,t.businessDate,t.kind),
  foreignKey({columns:[t.businessId,t.storeId],foreignColumns:[stores.businessId,stores.id],name:"document_counters_store_fk"}),
  check("document_counters_number",sql`${t.nextNumber} > 0`),check("document_counters_kind",sql`${t.kind} in ('POS','SUPPLEMENTAL','RECONCILIATION')`)]);
export const sales = pgTable("sales",{
  id:id(),businessId:uuid("business_id").notNull(),storeId:uuid("store_id").notNull(),dayId:uuid("day_id").notNull(),
  kind:text("kind").notNull().default("POS"),reason:text("reason"),reference:text("reference").notNull(),gross:bigint("gross",{mode:"bigint"}).notNull(),
  discount:bigint("discount",{mode:"bigint"}).notNull(),net:bigint("net",{mode:"bigint"}).notNull(),dayRevision:bigint("day_revision",{mode:"bigint"}).notNull(),
  occurredAt:timestamp("occurred_at",{withTimezone:true}).notNull(),createdAt:createdAt(),createdBy:uuid("created_by").notNull(),
},(t)=>[unique("sales_scope_uq").on(t.businessId,t.storeId,t.id),unique("sales_day_scope_uq").on(t.businessId,t.storeId,t.dayId,t.id),
  unique("sales_reference_uq").on(t.businessId,t.storeId,t.reference),unique("sales_revision_uq").on(t.dayId,t.dayRevision),
  foreignKey({columns:[t.businessId,t.storeId,t.dayId],foreignColumns:[businessDays.businessId,businessDays.storeId,businessDays.id],name:"sales_day_fk"}),
  foreignKey({columns:[t.businessId,t.createdBy],foreignColumns:[businessMemberships.businessId,businessMemberships.userId],name:"sales_actor_fk"}),
  check("sales_amounts",sql`${t.gross} > 0 and ${t.gross} <= 9000000000000 and ${t.discount} between 0 and ${t.gross} and ${t.net} = ${t.gross} - ${t.discount} and ${t.net} > 0`),
  check("sales_kind",sql`${t.kind} in ('POS','SUPPLEMENTAL','RECONCILIATION')`),check("sales_revision",sql`${t.dayRevision} > 0`),
  check("sales_kind_details",sql`(${t.kind} = 'POS' and ${t.reason} is null) or (${t.kind} in ('SUPPLEMENTAL','RECONCILIATION') and ${t.reason} is not null and length(trim(${t.reason})) between 1 and 1000 and ${t.discount} = 0)`),
  index("sales_history_idx").on(t.businessId,t.storeId,t.occurredAt,t.id)]);
export const saleItems = pgTable("sale_items",{
  id:id(),businessId:uuid("business_id").notNull(),storeId:uuid("store_id").notNull(),saleId:uuid("sale_id").notNull(),
  position:integer("position").notNull(),productId:uuid("product_id").notNull(),nameSnapshot:text("name_snapshot").notNull(),
  unitPrice:bigint("unit_price",{mode:"bigint"}).notNull(),productVersion:integer("product_version").notNull(),
  quantity:integer("quantity").notNull(),lineTotal:bigint("line_total",{mode:"bigint"}).notNull(),
},(t)=>[unique("sale_items_position_uq").on(t.saleId,t.position),unique("sale_items_product_uq").on(t.saleId,t.productId),
  foreignKey({columns:[t.businessId,t.storeId,t.saleId],foreignColumns:[sales.businessId,sales.storeId,sales.id],name:"sale_items_sale_fk"}),
  foreignKey({columns:[t.businessId,t.storeId,t.productId],foreignColumns:[products.businessId,products.storeId,products.id],name:"sale_items_product_fk"}),
  check("sale_items_values",sql`${t.position} between 0 and 99 and ${t.quantity} between 1 and 999 and ${t.productVersion} > 0 and length(trim(${t.nameSnapshot})) between 1 and 120 and ${t.unitPrice} > 0 and ${t.lineTotal} = ${t.unitPrice}::numeric * ${t.quantity} and ${t.lineTotal} <= 9000000000000`)]);
export const salePayments = pgTable("sale_payments",{
  id:id(),businessId:uuid("business_id").notNull(),storeId:uuid("store_id").notNull(),dayId:uuid("day_id").notNull(),saleId:uuid("sale_id").notNull(),
  accountId:uuid("account_id").notNull(),channel:text("channel").notNull(),amount:bigint("amount",{mode:"bigint"}).notNull(),
  tendered:bigint("tendered",{mode:"bigint"}),change:bigint("change",{mode:"bigint"}),
},(t)=>[unique("sale_payments_scope_uq").on(t.businessId,t.storeId,t.dayId,t.accountId,t.id),unique("sale_payments_account_uq").on(t.saleId,t.accountId),
  foreignKey({columns:[t.businessId,t.storeId,t.dayId,t.saleId],foreignColumns:[sales.businessId,sales.storeId,sales.dayId,sales.id],name:"sale_payments_sale_fk"}),
  foreignKey({columns:[t.businessId,t.storeId,t.accountId],foreignColumns:[accountStores.businessId,accountStores.storeId,accountStores.accountId],name:"sale_payments_mapping_fk"}),
  check("sale_payments_amount",sql`${t.amount} > 0 and ${t.amount} <= 9000000000000`),
  check("sale_payments_channel",sql`(${t.channel} = 'CASH' and ${t.tendered} is not null and ${t.change} is not null and ${t.tendered} between ${t.amount} and 9000000000000 and ${t.change} = ${t.tendered} - ${t.amount}) or (${t.channel} = 'TRANSFER' and ${t.tendered} is null and ${t.change} is null)`)]);

export const reconciliationRecords = pgTable("reconciliation_records",{
  id:id(),businessId:uuid("business_id").notNull(),storeId:uuid("store_id").notNull(),dayId:uuid("day_id").notNull(),
  baseRevision:bigint("base_revision",{mode:"bigint"}).notNull(),dayRevision:bigint("day_revision",{mode:"bigint"}).notNull(),
  reason:text("reason").notNull(),occurredAt:timestamp("occurred_at",{withTimezone:true}).notNull(),createdAt:createdAt(),createdBy:uuid("created_by").notNull(),
},t=>[unique("reconciliation_records_scope_uq").on(t.businessId,t.storeId,t.dayId,t.id),
  foreignKey({columns:[t.businessId,t.storeId,t.dayId],foreignColumns:[businessDays.businessId,businessDays.storeId,businessDays.id],name:"reconciliation_records_day_fk"}),
  foreignKey({columns:[t.businessId,t.createdBy],foreignColumns:[businessMemberships.businessId,businessMemberships.userId],name:"reconciliation_records_actor_fk"}),
  check("reconciliation_records_values",sql`${t.baseRevision} >= 0 and ${t.dayRevision} > ${t.baseRevision} and length(trim(${t.reason})) between 1 and 1000`),
  index("reconciliation_records_history_idx").on(t.dayId,t.occurredAt)]);
export const reconciliationLines = pgTable("reconciliation_lines",{
  id:id(),businessId:uuid("business_id").notNull(),storeId:uuid("store_id").notNull(),dayId:uuid("day_id").notNull(),
  reconciliationId:uuid("reconciliation_id").notNull(),accountId:uuid("account_id").notNull(),channel:text("channel").notNull(),
  recorded:bigint("recorded",{mode:"bigint"}).notNull(),target:bigint("target",{mode:"bigint"}).notNull(),delta:bigint("delta",{mode:"bigint"}).notNull(),resultingSaleId:uuid("resulting_sale_id"),
},t=>[unique("reconciliation_lines_bucket_uq").on(t.reconciliationId,t.accountId,t.channel),unique("reconciliation_lines_sale_uq").on(t.resultingSaleId),
  foreignKey({columns:[t.businessId,t.storeId,t.dayId,t.reconciliationId],foreignColumns:[reconciliationRecords.businessId,reconciliationRecords.storeId,reconciliationRecords.dayId,reconciliationRecords.id],name:"reconciliation_lines_record_fk"}),
  foreignKey({columns:[t.businessId,t.storeId,t.accountId],foreignColumns:[accountStores.businessId,accountStores.storeId,accountStores.accountId],name:"reconciliation_lines_account_fk"}),
  foreignKey({columns:[t.businessId,t.storeId,t.dayId,t.resultingSaleId],foreignColumns:[sales.businessId,sales.storeId,sales.dayId,sales.id],name:"reconciliation_lines_sale_fk"}),
  check("reconciliation_lines_values",sql`${t.channel} in ('CASH','TRANSFER') and ${t.target} between -9000000000000 and 9000000000000 and ${t.delta} = ${t.target}::numeric - ${t.recorded} and ${t.delta} between 0 and 9000000000000 and ((${t.delta} = 0 and ${t.resultingSaleId} is null) or (${t.delta} > 0 and ${t.resultingSaleId} is not null))`)]);
