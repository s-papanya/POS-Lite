import { it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { readConfig } from "../src/config.js";
import { createLogger } from "../src/logger.js";
import { AuthService } from "../src/modules/auth/service.js";
import { csrfResponseSchema, meResponseSchema, storeListResponseSchema, storeResponseSchema, logoutResponseSchema } from "@pos-lite/validation";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import { Pool } from "pg";
import { assertLocalAdminIdentity, assertLocalAdminUrl, provisionLocalRuntimeRole } from "../src/db/local-target.js";
import { migrateDatabase } from "../src/db/migrate.js";
import { grantRuntimeAccess } from "../src/db/permissions.js";
import { seedDevelopment } from "../src/db/seed.js";
import { transaction } from "../src/db/client.js";

it("verifies migrations, seed, tenant constraints and runtime privileges on disposable PostgreSQL", async () => {
  config({ path: fileURLToPath(new URL("../../../.env", import.meta.url)), quiet: true });
  const adminUrl = process.env.MIGRATION_DATABASE_URL ?? "";
  assertLocalAdminUrl(adminUrl);
  const admin = new Pool({ connectionString: adminUrl, connectionTimeoutMillis: 5000 });
  const name = `pos_lite_test_${randomUUID().replaceAll("-", "")}`;
  const ownership = randomBytes(32).toString("hex");
  let db: Pool | undefined;
  let runtime: Pool | undefined;
  let created = false;
  let marked = false;
  let checks = 0;
  async function check(label: string, work: () => Promise<void>) {
    await work(); checks++; console.log(`PASS ${label}`);
  }
  async function verifyOwnership() {
    const result = await db!.query("SELECT current_database() AS name, current_user AS username, token FROM test_ownership");
    assert.deepEqual(result.rows, [{ name, username: "pos_lite_local", token: ownership }]);
  }
  try {
    await assertLocalAdminIdentity(admin);
    await provisionLocalRuntimeRole(admin, process.env.DATABASE_URL ?? "");
    // Name is generated here, constrained to an identifier alphabet, never supplied by an environment variable.
    assert.match(name, /^pos_lite_test_[a-f0-9]{32}$/);
    await admin.query(`CREATE DATABASE "${name}"`); created = true;
    const target = new URL(adminUrl); target.pathname = `/${name}`;
    db = new Pool({ connectionString: target.toString() });
    await db.query("CREATE TABLE test_ownership (token text NOT NULL)");
    await db.query("INSERT INTO test_ownership VALUES ($1)", [ownership]); marked = true;
    await verifyOwnership();
    await check("fresh migrations and repeat application", async () => {
      await migrateDatabase(db!); await migrateDatabase(db!);
      assert.equal((await db!.query("SELECT count(*)::int AS n FROM drizzle.__drizzle_migrations")).rows[0].n, 1);
    });
    await grantRuntimeAccess(db);
    const runtimeTarget = new URL(process.env.DATABASE_URL!); runtimeTarget.pathname = `/${name}`;
    runtime = new Pool({ connectionString: runtimeTarget.toString() });
    const credentials = [{ username: "test-owner", password: randomBytes(20).toString("hex") },
      { username: "test-mother", password: randomBytes(20).toString("hex") }];
    await check("seed repeats without resetting existing hashes", async () => {
      await seedDevelopment(db!, credentials);
      const before = (await db!.query("SELECT id,password_hash FROM users ORDER BY id")).rows;
      await seedDevelopment(db!, credentials.map((c) => ({ ...c, password: randomBytes(20).toString("hex") })));
      assert.deepEqual((await db!.query("SELECT id,password_hash FROM users ORDER BY id")).rows, before);
      assert.equal((await db!.query("SELECT count(*)::int AS n FROM stores")).rows[0].n, 2);
      assert.equal((await db!.query("SELECT count(*)::int AS n FROM business_memberships WHERE role='OWNER'")).rows[0].n, 2);
      await migrateDatabase(db!);
      assert.deepEqual((await db!.query("SELECT id,password_hash FROM users ORDER BY id")).rows, before);
    });
    const user = (await db.query("SELECT id FROM users LIMIT 1")).rows[0].id;
    const business = (await db.query("SELECT id FROM businesses LIMIT 1")).rows[0].id;
    const otherBusiness = randomUUID();
    await db.query("INSERT INTO businesses(id,name,created_by) VALUES ($1,'Other',$2)", [otherBusiness,user]);
    await check("case insensitive username uniqueness", async () => {
      await assert.rejects(db!.query("INSERT INTO users(username,password_hash) VALUES ('TEST-OWNER','x')"), { code: "23505" });
    });
    await check("cross business membership and session references rejected", async () => {
      const store = (await db!.query("SELECT id FROM stores LIMIT 1")).rows[0].id;
      await assert.rejects(db!.query("INSERT INTO store_memberships(business_id,store_id,user_id,role,created_by) VALUES ($1,$2,$3,'STAFF',$3)",
        [otherBusiness,store,user]), { code: "23503" });
      await assert.rejects(db!.query("INSERT INTO sessions(business_id,user_id,token_hash,csrf_hash,expires_at,absolute_expires_at) VALUES ($1,$2,$3,$4,now()+interval '1 hour',now()+interval '1 day')",
        [otherBusiness,user,randomBytes(32),randomBytes(32)]), { code: "23503" });
    });
    await check("runtime role cannot create schema, mutate masters or rewrite audit", async () => {
      const role = (await runtime!.query("SELECT rolsuper,rolcreatedb,rolcreaterole FROM pg_roles WHERE rolname=current_user")).rows[0];
      assert.deepEqual(role, { rolsuper: false, rolcreatedb: false, rolcreaterole: false });
      await assert.rejects(runtime!.query("CREATE TABLE forbidden(id int)"), { code: "42501" });
      await assert.rejects(runtime!.query("UPDATE users SET active=false"), { code: "42501" });
      await assert.rejects(runtime!.query("DELETE FROM audit_logs"), { code: "42501" });
      await assert.rejects(runtime!.query("UPDATE audit_logs SET reason='changed'"), { code: "42501" });
      const row = await runtime!.query("INSERT INTO audit_logs(business_id,actor_user_id,action,entity_type,entity_id,request_id) VALUES($1,$2,'TEST','user',$2,$3) RETURNING id", [business,user,randomUUID()]);
      assert.equal(row.rowCount,1);
    });
    await check("transaction rolls back all writes on failure", async () => {
      await assert.rejects(transaction(db!,async (client) => {
        await client.query("INSERT INTO users(username,password_hash) VALUES('rollback-user','x')");
        throw new Error("injected failure");
      }));
      assert.equal((await db!.query("SELECT count(*)::int AS n FROM users WHERE username='rollback-user'")).rows[0].n,0);
    });
    const authConfig = {databaseUrl:runtimeTarget.toString(),secret:randomBytes(32).toString("hex"),origin:"http://localhost:5173",production:false};
    const auth = new AuthService(runtime,authConfig);
    const app = createApp({config:readConfig({NODE_ENV:"test"}),logger:createLogger("silent"),auth});
    async function anonymous() {
      const result = await request(app).get("/api/v1/auth/csrf");
      assert.equal(result.status,200);
      csrfResponseSchema.parse(result.body);
      return {cookie:result.headers["set-cookie"][0].split(";")[0],csrf:result.body.data.csrfToken as string};
    }
    async function login(username=credentials[0]!.username,password=credentials[0]!.password) {
      const anon = await anonymous();
      const result = await request(app).post("/api/v1/auth/login").set("Cookie",anon.cookie)
        .set("Origin",authConfig.origin).set("X-CSRF-Token",anon.csrf).send({username,password});
      assert.equal(result.status,200);
      return {cookie:result.headers["set-cookie"][0].split(";")[0],csrf:result.body.data.csrfToken as string,anon};
    }
    await check("login rotates session and stores only token digests",async () => {
      const logged = await login();
      assert.notEqual(logged.cookie,logged.anon.cookie);
      assert.equal((await request(app).get("/api/v1/me").set("Cookie",logged.anon.cookie)).status,401);
      const me = await request(app).get("/api/v1/me").set("Cookie",logged.cookie);
      assert.equal(me.status,200); assert.equal(me.body.data.businessRole,"OWNER"); assert.equal(me.body.data.stores.length,2);
      meResponseSchema.parse(me.body);
      assert.ok(!JSON.stringify(me.body).includes("password"));
      const hashes = (await db!.query("SELECT octet_length(token_hash) AS token,octet_length(csrf_hash) AS csrf FROM sessions")).rows;
      assert.ok(hashes.every((h) => h.token === 32 && h.csrf === 32));
      const csrfAgain = await request(app).get("/api/v1/auth/csrf").set("Cookie",logged.cookie);
      assert.equal(csrfAgain.body.data.csrfToken,logged.csrf);
      const invalidOrigin = await request(app).post("/api/v1/auth/logout").set("Cookie",logged.cookie).set("Origin","https://evil.example").set("X-CSRF-Token",logged.csrf);
      assert.equal(invalidOrigin.status,403);
      assert.equal((await request(app).post("/api/v1/auth/logout").set("Cookie",logged.cookie).set("Origin",authConfig.origin)).status,403);
      assert.equal((await request(app).post("/api/v1/auth/logout").set("Cookie",logged.cookie).set("Origin",authConfig.origin).set("X-CSRF-Token",logged.anon.csrf)).status,403);
      const logout = await request(app).post("/api/v1/auth/logout").set("Cookie",logged.cookie).set("Origin",authConfig.origin).set("X-CSRF-Token",logged.csrf);
      assert.equal(logout.status,200); logoutResponseSchema.parse(logout.body); assert.match(logout.headers["set-cookie"][0],/HttpOnly/);
      assert.match(logout.headers["set-cookie"][0],/SameSite=Lax/); assert.match(logout.headers["set-cookie"][0],/Max-Age=0/);
      assert.equal((await request(app).get("/api/v1/me").set("Cookie",logged.cookie)).status,401);
    });
    await check("expiry and disabled user invalidate persisted sessions",async () => {
      const logged = await login();
      const userId = (await db!.query("SELECT id FROM users WHERE username=$1",[credentials[0]!.username])).rows[0].id;
      await db!.query("UPDATE users SET active=false WHERE id=$1",[userId]);
      assert.equal((await request(app).get("/api/v1/me").set("Cookie",logged.cookie)).status,401);
      await db!.query("UPDATE users SET active=true WHERE id=$1",[userId]);
      await db!.query("UPDATE sessions SET expires_at=now()-interval '1 second' WHERE user_id=$1",[userId]);
      assert.equal((await request(app).get("/api/v1/me").set("Cookie",logged.cookie)).status,401);
    });
    await check("staff sees assigned store only and owner cannot cross businesses",async () => {
      const staffId = randomUUID(); const store = (await db!.query("SELECT id FROM stores WHERE business_id=$1 LIMIT 1",[business])).rows[0].id;
      const foreignStore = randomUUID();
      await db!.query("INSERT INTO stores(id,business_id,name,code,created_by) VALUES($1,$2,'Foreign','FOREIGN',$3)",[foreignStore,otherBusiness,user]);
      await db!.query("INSERT INTO users(id,username,password_hash) SELECT $1,'test-staff',password_hash FROM users WHERE username=$2",[staffId,credentials[0]!.username]);
      await db!.query("INSERT INTO business_memberships(business_id,user_id,role,created_by) VALUES($1,$2,'MEMBER',$3)",[business,staffId,user]);
      await db!.query("INSERT INTO store_memberships(business_id,store_id,user_id,role,created_by) VALUES($1,$2,$3,'STAFF',$4)",[business,store,staffId,user]);
      const staff = await login("test-staff");
      const list = await request(app).get("/api/v1/stores").set("Cookie",staff.cookie);
      assert.equal(list.status,200); assert.equal(list.body.data.length,1); assert.equal(list.body.data[0].role,"STAFF");
      storeListResponseSchema.parse(list.body);
      const detail = await request(app).get(`/api/v1/stores/${store}`).set("Cookie",staff.cookie);
      assert.equal(detail.status,200); storeResponseSchema.parse(detail.body);
      await db!.query("UPDATE store_memberships SET role='MANAGER' WHERE user_id=$1",[staffId]);
      assert.equal((await request(app).get("/api/v1/stores").set("Cookie",staff.cookie)).body.data[0].role,"MANAGER");
      const otherStore = (await db!.query("SELECT id FROM stores WHERE business_id=$1 AND id<>$2",[business,store])).rows[0].id;
      assert.equal((await request(app).get(`/api/v1/stores/${otherStore}`).set("Cookie",staff.cookie)).status,404);
      const owner = await login();
      assert.equal((await request(app).get(`/api/v1/stores/${foreignStore}`).set("Cookie",owner.cookie)).status,404);
      await assert.rejects(db!.query("INSERT INTO audit_logs(business_id,store_id,actor_user_id,action,entity_type,entity_id,request_id) VALUES($1,$2,$3,'TEST','store',$2,$4)",
        [business,foreignStore,user,randomUUID()]),{code:"23503",constraint:"audit_logs_store_scope_fk"});
      await db!.query("UPDATE businesses SET active=false WHERE id=$1",[business]);
      assert.equal((await request(app).get("/api/v1/me").set("Cookie",owner.cookie)).status,401);
      await db!.query("UPDATE businesses SET active=true WHERE id=$1",[business]);
      await db!.query("UPDATE store_memberships SET active=false WHERE user_id=$1",[staffId]);
      assert.equal((await request(app).get("/api/v1/stores").set("Cookie",staff.cookie)).body.data.length,0);
      await db!.query("UPDATE business_memberships SET active=false WHERE user_id=$1",[staffId]);
      assert.equal((await request(app).get("/api/v1/me").set("Cookie",staff.cookie)).status,401);
    });
    await db.query("DELETE FROM login_attempts");
    await check("password change revokes every previous device session",async () => {
      const first = await login(); const second = await login();
      const changed = await request(app).post("/api/v1/auth/password").set("Cookie",first.cookie).set("Origin",authConfig.origin)
        .set("X-CSRF-Token",first.csrf).send({currentPassword:credentials[0]!.password,newPassword:"new-test-password-123"});
      assert.equal(changed.status,200);
      csrfResponseSchema.parse(changed.body);
      assert.equal((await request(app).get("/api/v1/me").set("Cookie",first.cookie)).status,401);
      assert.equal((await request(app).get("/api/v1/me").set("Cookie",second.cookie)).status,401);
      const fresh = changed.headers["set-cookie"][0].split(";")[0];
      assert.equal((await request(app).get("/api/v1/me").set("Cookie",fresh)).status,200);
      const relogged = await login(credentials[0]!.username,"new-test-password-123");
      assert.equal((await request(app).get("/api/v1/me").set("Cookie",relogged.cookie)).status,200);
    });
    await check("persistent limiter shared by independent service instances",async () => {
      const second = new AuthService(runtime!,authConfig);
      for (let n=0;n<5;n++) await auth.limit([{label:"shared-test",value:"bucket",max:5}]);
      await assert.rejects(second.limit([{label:"shared-test",value:"bucket",max:5}]),{status:429});
      const rows = (await db!.query("SELECT bucket_key FROM login_attempts")).rows;
      assert.ok(rows.every((row) => /^[a-f0-9]{64}$/.test(row.bucket_key)));
    });
    await db.query("DELETE FROM login_attempts");
    await check("concurrent reuse of anonymous session creates one authenticated session",async () => {
      const anon = await anonymous();
      const results = await Promise.all([1,2].map(() => request(app).post("/api/v1/auth/login")
        .set("Cookie",anon.cookie).set("Origin",authConfig.origin).set("X-CSRF-Token",anon.csrf)
        .send({username:credentials[0]!.username,password:"new-test-password-123"})));
      assert.equal(results.filter((r) => r.status === 200).length,1);
      assert.ok(results.every((r) => [200,401,403].includes(r.status)));
    });
    await check("absolute expiry is enforced and idle renewal cannot exceed it",async () => {
      const logged = await login(credentials[0]!.username,"new-test-password-123");
      const userId = (await db!.query("SELECT id FROM users WHERE username=$1",[credentials[0]!.username])).rows[0].id;
      await db!.query("UPDATE sessions SET expires_at=now()+interval '1 minute',absolute_expires_at=now()+interval '1 minute' WHERE user_id=$1 AND revoked_at IS NULL",[userId]);
      assert.equal((await request(app).get("/api/v1/me").set("Cookie",logged.cookie)).status,200);
      assert.equal((await db!.query("SELECT count(*)::int AS n FROM sessions WHERE expires_at>absolute_expires_at")).rows[0].n,0);
      await db!.query("UPDATE sessions SET created_at=now()-interval '1 day',expires_at=now()-interval '1 second',absolute_expires_at=now()-interval '1 second' WHERE user_id=$1",[userId]);
      assert.equal((await request(app).get("/api/v1/me").set("Cookie",logged.cookie)).status,401);
    });
    await check("unknown and incorrect credentials are generic; HTTP rate limit returns Retry-After",async () => {
      await db!.query("DELETE FROM login_attempts");
      const codes: string[] = [];
      for (let n=0;n<6;n++) {
        const anon = await anonymous();
        const result = await request(app).post("/api/v1/auth/login").set("Cookie",anon.cookie).set("Origin",authConfig.origin)
          .set("X-CSRF-Token",anon.csrf).send({username:credentials[0]!.username,password:"incorrect"});
        codes.push(result.body.error.code);
        assert.equal(result.status,n<5 ? 401 : 429);
        if(n===5) assert.ok(Number(result.headers["retry-after"])>0);
      }
      assert.deepEqual(codes.slice(0,5),Array(5).fill("INVALID_CREDENTIALS"));
      const anon = await anonymous();
      const result = await request(app).post("/api/v1/auth/login").set("Cookie",anon.cookie).set("Origin",authConfig.origin)
        .set("X-CSRF-Token",anon.csrf).send({username:"unknown-user",password:"incorrect"});
      assert.equal(result.status,401); assert.equal(result.body.error.code,"INVALID_CREDENTIALS");
    });
    await check("production cookie uses Secure host prefix without Domain",async () => {
      const production = createApp({config:readConfig({NODE_ENV:"test"}),logger:createLogger("silent"),
        auth:new AuthService(runtime!,{...authConfig,production:true,origin:"https://store.example"})});
      const result = await request(production).get("/api/v1/auth/csrf");
      assert.equal(result.status,200);
      const header = result.headers["set-cookie"][0];
      assert.match(header,/^__Host-session=/); assert.match(header,/Secure/); assert.match(header,/HttpOnly/);
      assert.match(header,/Path=\//); assert.match(header,/SameSite=Lax/); assert.ok(!header.includes("Domain="));
    });
    await check("tampered migration journal fails closed", async () => {
      const original = (await db!.query("SELECT hash FROM drizzle.__drizzle_migrations")).rows[0].hash;
      await db!.query("UPDATE drizzle.__drizzle_migrations SET hash='tampered'");
      await assert.rejects(migrateDatabase(db!), /checksum mismatch/);
      await db!.query("UPDATE drizzle.__drizzle_migrations SET hash=$1", [original]);
    });
    console.log(`${checks} database integration checks passed`);
  } finally {
    await runtime?.end();
    if (created && marked) {
      await verifyOwnership();
      await db!.end();
      await admin.query(`DROP DATABASE "${name}"`);
    } else { await db?.end(); }
    await admin.end();
  }

}, 60000);
