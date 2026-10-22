import { describe, expect, it } from "vitest";
import { readAuthConfig } from "../src/modules/auth/config.js";

const environment = {DATABASE_URL:"postgresql://pos_lite_app:test@127.0.0.1:5433/pos_lite_dev",
  SESSION_SECRET:"a".repeat(64),APP_ORIGIN:"http://localhost:5173"};
describe("auth configuration",() => {
  it("requires runtime identity, strong secret and exact origin",() => {
    expect(readAuthConfig(environment,false).origin).toBe(environment.APP_ORIGIN);
    expect(() => readAuthConfig({...environment,DATABASE_URL:environment.DATABASE_URL.replace("pos_lite_app","pos_lite_local")},false)).toThrow("DATABASE_URL");
    expect(() => readAuthConfig({...environment,SESSION_SECRET:"private-value"},false)).toThrow("SESSION_SECRET");
    expect(() => readAuthConfig({...environment,APP_ORIGIN:"http://localhost:5173/path"},false)).toThrow("APP_ORIGIN");
    expect(() => readAuthConfig(environment,true)).toThrow("APP_ORIGIN");
    expect(readAuthConfig({...environment,APP_ORIGIN:"https://store.example"},true).production).toBe(true);
  });
  it("does not disclose invalid configuration values",() => {
    try { readAuthConfig({...environment,SESSION_SECRET:"private-value"},false); }
    catch (error) { expect(String(error)).not.toContain("private-value"); return; }
    throw new Error("Expected validation failure");
  });
});
