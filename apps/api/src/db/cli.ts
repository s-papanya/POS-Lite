import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import { Pool } from "pg";
import { assertLocalAdminIdentity, assertLocalAdminUrl, provisionLocalRuntimeRole } from "./local-target.js";
import { migrateDatabase } from "./migrate.js";
import { grantRuntimeAccess } from "./permissions.js";
import { seedDevelopment } from "./seed.js";

config({ path: fileURLToPath(new URL("../../../../.env", import.meta.url)), quiet: true });
async function main() {
  if (process.env.NODE_ENV !== "development") throw new Error("Local DB commands require NODE_ENV=development");
  const adminUrl = process.env.MIGRATION_DATABASE_URL ?? "";
  assertLocalAdminUrl(adminUrl);
  const pool = new Pool({ connectionString: adminUrl, connectionTimeoutMillis: 5000 });
  try {
    await assertLocalAdminIdentity(pool);
    switch (process.argv[2]) {
      case "migrate":
        await provisionLocalRuntimeRole(pool, process.env.DATABASE_URL ?? "");
        await migrateDatabase(pool);
        await grantRuntimeAccess(pool);
        break;
      case "seed":
        await seedDevelopment(pool, [
          { username: process.env.SEED_OWNER_USERNAME ?? "", password: process.env.SEED_OWNER_PASSWORD ?? "" },
          { username: process.env.SEED_MOTHER_USERNAME ?? "", password: process.env.SEED_MOTHER_PASSWORD ?? "" },
        ]);
        break;
      default: throw new Error("Use migrate or seed");
    }
    console.log("Local database command completed");
  } finally { await pool.end(); }
}
main().catch(() => { console.error("Local database command failed; verify target, configuration and migration state"); process.exitCode = 1; });
