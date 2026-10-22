import type { Pool } from "pg";
import { transaction } from "./client.js";
import { hashPassword } from "../modules/auth/password.js";

const businessId = "84b083a9-c62d-47cc-8506-fc24c78c0001";
const ownerIds = ["84b083a9-c62d-47cc-8506-fc24c78c0002", "84b083a9-c62d-47cc-8506-fc24c78c0003"];
const storeIds = ["84b083a9-c62d-47cc-8506-fc24c78c0004", "84b083a9-c62d-47cc-8506-fc24c78c0005"];

export async function seedDevelopment(pool: Pool, credentials: { username: string; password: string }[]) {
  if (credentials.length !== 2 || credentials.some((c) => !/^[a-z][a-z0-9-]{2,63}$/.test(c.username)
    || c.password.length < 12 || c.password.length > 128)
    || credentials[0]!.username === credentials[1]!.username) {
    throw new Error("Two distinct seed usernames and passwords of 12–128 characters are required");
  }
  const hashes = await Promise.all(credentials.map((c) => hashPassword(c.password)));
  await transaction(pool, async (client) => {
    await client.query("SELECT pg_advisory_xact_lock(hashtext('pos-lite-development-seed'))");
    for (const [index, credential] of credentials.entries()) {
      await client.query("INSERT INTO users (id, username, password_hash) VALUES ($1,$2,$3) ON CONFLICT (id) DO NOTHING",
        [ownerIds[index], credential.username, hashes[index]]);
      const existing = await client.query<{ username: string }>("SELECT username FROM users WHERE id=$1", [ownerIds[index]]);
      if (existing.rows[0]?.username !== credential.username) throw new Error("Seed identity differs from the existing account");
    }
    await client.query("INSERT INTO businesses (id,name,created_by) VALUES ($1,$2,$3) ON CONFLICT (id) DO NOTHING",
      [businessId, "ร้านครอบครัว (พัฒนา)", ownerIds[0]]);
    for (const userId of ownerIds) {
      await client.query("INSERT INTO business_memberships (business_id,user_id,role,created_by) VALUES ($1,$2,'OWNER',$3) ON CONFLICT (business_id,user_id) DO NOTHING",
        [businessId, userId, ownerIds[0]]);
    }
    for (const [index, name] of ["ร้านก๋วยเตี๋ยว", "ร้านเบเกอรี่"].entries()) {
      await client.query("INSERT INTO stores (id,business_id,name,code,created_by) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (id) DO NOTHING",
        [storeIds[index], businessId, name, index === 0 ? "NOODLE" : "BAKERY", ownerIds[0]]);
    }
  });
}
