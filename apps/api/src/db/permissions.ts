import type { Pool } from "pg";

// Applied by the local migration command, never by the runtime role or HTTP startup.
export async function grantRuntimeAccess(pool: Pool) {
  await pool.query(`
    REVOKE CREATE ON SCHEMA public FROM PUBLIC;
    GRANT USAGE ON SCHEMA public TO pos_lite_app;
    GRANT SELECT ON users, businesses, stores, business_memberships, store_memberships TO pos_lite_app;
    GRANT UPDATE (password_hash) ON users TO pos_lite_app;
    GRANT SELECT, INSERT, UPDATE ON sessions, login_attempts TO pos_lite_app;
    GRANT SELECT, INSERT ON audit_logs TO pos_lite_app;
  `);
}
