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
    GRANT SELECT, INSERT, UPDATE ON products, idempotency_records TO pos_lite_app;
    GRANT SELECT, INSERT ON financial_accounts, account_stores, account_openings, money_movements TO pos_lite_app;
    GRANT UPDATE (name,active) ON financial_accounts TO pos_lite_app;
    GRANT SELECT, INSERT ON business_days, day_openings TO pos_lite_app;
    GRANT UPDATE (revision) ON business_days TO pos_lite_app;
    GRANT SELECT, INSERT ON sales, sale_items, sale_payments TO pos_lite_app;
    GRANT SELECT, INSERT ON reconciliation_records, reconciliation_lines TO pos_lite_app;
    GRANT SELECT, INSERT ON expense_categories TO pos_lite_app;
    GRANT SELECT, INSERT ON expenses, expense_payments TO pos_lite_app;
    GRANT UPDATE (id) ON expenses TO pos_lite_app;
    GRANT SELECT, INSERT ON document_counters TO pos_lite_app;
    GRANT UPDATE (next_number) ON document_counters TO pos_lite_app;
  `);
}
