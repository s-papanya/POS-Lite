import { Writable } from "node:stream";
import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { apiErrorResponseSchema, healthResponseSchema } from "@pos-lite/validation";
import { createApp } from "../src/app.js";
import { readConfig } from "../src/config.js";
import { errorHandler } from "../src/errors.js";
import { createHttpLogger, createLogger } from "../src/logger.js";

function setup() {
  const lines: string[] = [];
  const sink = new Writable({
    write(chunk, _encoding, done) { lines.push(String(chunk)); done(); },
  });
  const logger = createLogger("info", sink);
  return { app: createApp({ logger, config: readConfig({ NODE_ENV: "test" }) }), logger, lines };
}

describe("foundation HTTP boundary", () => {
  it("returns the shared health contract with a server-generated request ID", async () => {
    const { app } = setup();
    const result = await request(app).get("/api/v1/health").set("X-Request-Id", "untrusted-id");
    expect(result.status).toBe(200);
    expect(healthResponseSchema.parse(result.body).data.status).toBe("ok");
    expect(result.headers["x-request-id"]).toMatch(/^[0-9a-f-]{36}$/);
    expect(result.headers["x-request-id"]).not.toBe("untrusted-id");
    expect(result.headers["x-powered-by"]).toBeUndefined();
    expect(result.headers["cache-control"]).toContain("no-store");
  });

  it("uses the safe error envelope for missing routes", async () => {
    const { app } = setup();
    const result = await request(app).get("/api/v1/missing");
    expect(result.status).toBe(404);
    const body = apiErrorResponseSchema.parse(result.body);
    expect(body.error.code).toBe("RESOURCE_NOT_FOUND");
    expect(body.error.requestId).toBe(result.headers["x-request-id"]);
  });

  it("rejects malformed JSON without reflecting the submitted body", async () => {
    const { app, lines } = setup();
    const result = await request(app).post("/api/v1/missing")
      .set("Content-Type", "application/json").send('{"password":"private-password",');
    expect(result.status).toBe(400);
    expect(apiErrorResponseSchema.parse(result.body).error.code).toBe("INVALID_REQUEST");
    expect(JSON.stringify(result.body) + lines.join("")).not.toContain("private-password");
  });

  it("bounds request size", async () => {
    const { app } = setup();
    const result = await request(app).post("/api/v1/missing").send({ data: "x".repeat(20000) });
    expect(result.status).toBe(413);
    expect(apiErrorResponseSchema.parse(result.body).error.code).toBe("PAYLOAD_TOO_LARGE");
  });

  it("omits request cookies, authorization, query secrets and response cookies from HTTP logs", async () => {
    const { app, lines } = setup();
    await request(app).get("/api/v1/health?token=private-query")
      .set("Authorization", "Bearer private-auth").set("Cookie", "session=private-session");
    const logged = lines.join("");
    expect(logged).toContain("/api/v1/health");
    for (const secret of ["private-query", "private-auth", "private-session"]) {
      expect(logged).not.toContain(secret);
    }
  });

  it("handles unexpected errors without returning or logging exception secrets", async () => {
    const { logger, lines } = setup();
    const app = express();
    app.use(createHttpLogger(logger));
    app.get("/failure", (_req, res) => {
      res.cookie("session", "private-cookie");
      throw new Error("private-exception");
    });
    app.use(errorHandler);
    const result = await request(app).get("/failure");
    expect(result.status).toBe(500);
    expect(apiErrorResponseSchema.parse(result.body).error.code).toBe("INTERNAL_ERROR");
    const observed = JSON.stringify(result.body) + lines.join("");
    expect(observed).not.toContain("private-exception");
    expect(observed).not.toContain("private-cookie");
    expect(lines.join("")).toContain("INTERNAL_ERROR");
  });
});
