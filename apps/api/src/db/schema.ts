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
  accountOpeningId:uuid("account_opening_id").notNull(),delta:bigint("delta",{mode:"bigint"}).notNull(),
  createdAt:createdAt(),createdBy:uuid("created_by").notNull(),
},(t)=>[unique("money_movements_opening_uq").on(t.accountOpeningId),
  foreignKey({columns:[t.businessId,t.storeId,t.accountId,t.accountOpeningId],
    foreignColumns:[accountOpenings.businessId,accountOpenings.storeId,accountOpenings.accountId,accountOpenings.id],name:"money_movements_opening_scope_fk"}),
  foreignKey({columns:[t.businessId,t.createdBy],foreignColumns:[businessMemberships.businessId,businessMemberships.userId],name:"money_movements_actor_fk"}),
  check("money_movements_delta",sql`${t.delta} > 0 and ${t.delta} <= 9000000000000`),
  index("money_movements_balance_idx").on(t.businessId,t.accountId,t.createdAt,t.id)]);

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
