import type { Pool } from "pg";

export function assertLocalAdminUrl(value: string) {
  const url = new URL(value);
  if (!(["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)) || url.port !== "5433"
    || url.username !== "pos_lite_local" || url.pathname !== "/pos_lite_dev"
    || !["postgres:", "postgresql:"].includes(url.protocol) || url.search !== "" || url.hash !== "") {
    throw new Error("Local DB commands require the project's loopback development admin target");
  }
}

export async function assertLocalAdminIdentity(pool: Pool) {
  const result = await pool.query<{ name: string; username: string }>("SELECT current_database() AS name, current_user AS username");
  if (result.rows[0]?.name !== "pos_lite_dev" || result.rows[0]?.username !== "pos_lite_local") {
    throw new Error("Database identity does not match the development target");
  }
}

export async function provisionLocalRuntimeRole(pool: Pool, runtimeUrl: string) {
  const url = new URL(runtimeUrl);
  if (url.username !== "pos_lite_app" || url.pathname !== "/pos_lite_dev" || url.port !== "5433"
    || !["postgres:", "postgresql:"].includes(url.protocol) || url.search !== "" || url.hash !== ""
    || !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) || !/^[a-f0-9]{48,}$/.test(url.password)) {
    throw new Error("Runtime URL must use the distinct local app role and a generated hex password");
  }
  const exists = await pool.query("SELECT 1 FROM pg_roles WHERE rolname='pos_lite_app'");
  // DDL cannot bind a password directly. PostgreSQL's %L safely quotes a bound value; never log the result.
  const command = await pool.query<{ statement: string }>(
    `SELECT format('${exists.rowCount ? "ALTER" : "CREATE"} ROLE pos_lite_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT PASSWORD %L', $1::text) AS statement`,
    [url.password],
  );
  await pool.query(command.rows[0]!.statement);
}
