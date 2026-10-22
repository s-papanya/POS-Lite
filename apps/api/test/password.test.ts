import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "../src/modules/auth/password.js";

describe("password storage", () => {
  it("uses salted Argon2id and verifies exact passwords", async () => {
    const password = "temporary-test-password-123";
    const first = await hashPassword(password);
    const second = await hashPassword(password);
    expect(first).toContain("$argon2id$");
    expect(first).not.toContain(password);
    expect(first).not.toBe(second);
    expect(await verifyPassword(first, password)).toBe(true);
    expect(await verifyPassword(first, "wrong-password")).toBe(false);
  });
});
