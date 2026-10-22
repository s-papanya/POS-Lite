import express from "express";
import type { Logger } from "pino";
import type { HealthResponse } from "@pos-lite/shared";
import type { AppConfig } from "./config.js";
import { errorHandler, notFoundHandler } from "./errors.js";
import { createHttpLogger } from "./logger.js";

export function createApp({ logger, config }: { logger: Logger; config: AppConfig }) {
  const app = express();
  app.set("env", config.nodeEnv);
  app.set("trust proxy", false);
  app.disable("x-powered-by");
  app.use(createHttpLogger(logger));
  app.use((_req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    next();
  });
  app.use(express.json({ limit: "16kb" }));

  app.get("/api/v1/health", (_req, res) => {
    const body: HealthResponse = { data: { status: "ok", service: "family-store-manager-api" } };
    res.json(body);
  });
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
