import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { readMigrationFiles } from "drizzle-orm/migrator";
import type { Pool } from "pg";

const migrationsFolder = fileURLToPath(new URL("../../drizzle", import.meta.url));

export async function migrateDatabase(pool: Pool) {
  const client = await pool.connect();
  try {
    await client.query("SET lock_timeout = '5s'");
    await client.query("SET statement_timeout = '30s'");
    await client.query("SELECT pg_advisory_lock(hashtext('pos-lite-migrations'))");
    const recorded = await client.query<{ name: string | null }>("SELECT to_regclass('drizzle.__drizzle_migrations')::text AS name");
    if (recorded.rows[0]?.name) {
      const existing = await client.query<{ hash: string; created_at: string }>("SELECT hash, created_at FROM drizzle.__drizzle_migrations ORDER BY created_at");
      const files = readMigrationFiles({ migrationsFolder });
      for (const row of existing.rows) {
        const file = files.find((item) => item.folderMillis === Number(row.created_at));
        if (!file || file.hash !== row.hash) throw new Error("Applied migration checksum mismatch");
      }
    }
    await migrate(drizzle(client), { migrationsFolder });
  } finally {
    try {
      await client.query("RESET lock_timeout; RESET statement_timeout");
      await client.query("SELECT pg_advisory_unlock(hashtext('pos-lite-migrations'))");
      client.release();
    } catch {
      client.release(true);
    }
  }
}
