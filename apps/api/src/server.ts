import { fileURLToPath } from "node:url";
import { config as loadEnvironment } from "dotenv";
import { createApp } from "./app.js";
import { readConfig } from "./config.js";
import { createLogger } from "./logger.js";
import { readAuthConfig } from "./modules/auth/config.js";
import { AuthService } from "./modules/auth/service.js";
import { createDatabase } from "./db/client.js";

loadEnvironment({ path: fileURLToPath(new URL("../../../.env", import.meta.url)), quiet: true });

try {
  const config = readConfig(process.env);
  const logger = createLogger(config.logLevel);
  const authConfig = readAuthConfig(process.env, config.nodeEnv === "production");
  const { pool } = createDatabase(authConfig.databaseUrl);
  pool.on("error", () => logger.error({ errorCode: "DATABASE_CONNECTION_FAILED" }, "Database connection failed"));
  const app = createApp({ logger, config, auth: new AuthService(pool,authConfig) });
  const server = app.listen(config.port, config.host, () => {
    logger.info({ host: config.host, port: config.port }, "API listening");
  });
  server.on("error", () => {
    logger.fatal({ errorCode: "SERVER_START_FAILED" }, "API could not start");
    process.exitCode = 1;
    void pool.end();
  });
  let stopping = false;
  function shutdown() {
    if (stopping) return;
    stopping = true;
    logger.info("API shutting down");
    const timer = setTimeout(() => { server.closeAllConnections(); process.exitCode = 1; }, 10000);
    timer.unref();
    server.close((error) => {
      clearTimeout(timer);
      if (error) process.exitCode = 1;
      void pool.end();
    });
  }
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
} catch {
  // Validation errors deliberately omit environment values and stack traces.
  process.stderr.write("Invalid API environment configuration. Check API and auth variables in .env.example.\n");
  process.exitCode = 1;
}
