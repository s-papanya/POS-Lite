import { fileURLToPath } from "node:url";
import { config as loadEnvironment } from "dotenv";
import { createApp } from "./app.js";
import { readConfig } from "./config.js";
import { createLogger } from "./logger.js";

loadEnvironment({ path: fileURLToPath(new URL("../../../.env", import.meta.url)), quiet: true });

try {
  const config = readConfig(process.env);
  const logger = createLogger(config.logLevel);
  const app = createApp({ logger, config });
  const server = app.listen(config.port, config.host, () => {
    logger.info({ host: config.host, port: config.port }, "API listening");
  });
  server.on("error", () => {
    logger.fatal({ errorCode: "SERVER_START_FAILED" }, "API could not start");
    process.exitCode = 1;
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
    });
  }
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
} catch {
  // Validation errors deliberately omit environment values and stack traces.
  process.stderr.write("Invalid API environment configuration. Check NODE_ENV, HOST, PORT and LOG_LEVEL.\n");
  process.exitCode = 1;
}
