import { describe, expect, it } from "vitest";
import { readConfig } from "../src/config.js";

describe("environment configuration", () => {
  it("defaults to local development without requiring future database/auth secrets", () => {
    expect(readConfig({})).toMatchObject({
      nodeEnv: "development", host: "127.0.0.1", port: 3000, logLevel: "info",
    });
  });

  it.each(["", "0", "65536", "1.5", "3000x", "NaN", " 3000 "])("rejects invalid PORT %j", (port) => {
    expect(() => readConfig({ PORT: port })).toThrow("PORT");
  });

  it("accepts a valid configured port", () => {
    expect(readConfig({ PORT: "4000" }).port).toBe(4000);
  });

  it("rejects an unsupported bind host", () => {
    expect(() => readConfig({ HOST: "arbitrary-public-host" })).toThrow("HOST");
  });

  it("rejects unknown environment and log level", () => {
    expect(() => readConfig({ NODE_ENV: "staging" })).toThrow("NODE_ENV");
    expect(() => readConfig({ LOG_LEVEL: "everything" })).toThrow("LOG_LEVEL");
  });

  it("reports invalid variable names without leaking their values", () => {
    const secret = "sensitive-config-value";
    try {
      readConfig({ PORT: secret });
      expect.fail("Expected invalid configuration to be rejected");
    } catch (error) {
      expect(String(error)).toContain("PORT");
      expect(String(error)).not.toContain(secret);
    }
  });
});
