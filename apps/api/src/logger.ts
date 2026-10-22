import { randomUUID } from "node:crypto";
import { pino, type DestinationStream, type Logger } from "pino";
import { pinoHttp } from "pino-http";
import type { AppConfig } from "./config.js";

export function createLogger(level: AppConfig["logLevel"], destination?: DestinationStream) {
  const options = {
    level,
    base: { service: "family-store-manager-api" },
    redact: {
      paths: ["password", "sessionToken", "csrfToken", "authorization", "cookie",
        "*.password", "*.sessionToken", "*.csrfToken", "req.headers", "res.headers"],
      censor: "[REDACTED]",
    },
  };
  return destination ? pino(options, destination) : pino(options);
}

export function createHttpLogger(logger: Logger) {
  return pinoHttp({
    logger,
    genReqId(_req, res) {
      const id = randomUUID();
      res.setHeader("X-Request-Id", id);
      return id;
    },
    // Deliberate allowlists: never log bodies, headers, query strings or exception text.
    serializers: {
      req(req) { return { id: req.id, method: req.method, path: String(req.url).split("?")[0] }; },
      res(res) { return { statusCode: res.statusCode }; },
      err() { return { type: "HttpError" }; },
    },
  });
}
