import { sql } from "drizzle-orm";
import { bigint, boolean, check, customType, foreignKey, index, integer, jsonb, pgTable,
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
