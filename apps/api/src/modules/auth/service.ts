import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import { transaction } from "../../db/client.js";
import { hashPassword, verifyPassword } from "./password.js";
import type { AuthConfig } from "./config.js";

export class AuthError extends Error {
  constructor(public status: number, public code: string, public retryAfter?: number) { super(code); }
}
export interface Session {
  id: string; user_id: string | null; business_id: string | null; csrf_hash: Buffer;
  username: string | null; business_name: string | null; role: "OWNER" | "MEMBER" | null;
}
const digest = (value: string) => createHash("sha256").update(value).digest();
const tokenFormat = /^[a-f0-9]{64}$/;
const sessionQuery = `SELECT s.id,s.user_id,s.business_id,s.csrf_hash,u.username,b.name AS business_name,m.role
  FROM sessions s LEFT JOIN users u ON u.id=s.user_id
  LEFT JOIN business_memberships m ON m.user_id=s.user_id AND m.business_id=s.business_id
  LEFT JOIN businesses b ON b.id=s.business_id
  WHERE s.token_hash=$1 AND s.revoked_at IS NULL AND s.expires_at>now() AND s.absolute_expires_at>now()
  AND (s.user_id IS NULL OR (u.active AND m.active AND b.active))`;

export class AuthService {
  private dummyHash = hashPassword(randomBytes(32).toString("hex"));
  constructor(public pool: Pool, public config: AuthConfig) {}
  csrf(token: string) { return createHmac("sha256", this.config.secret).update(`csrf:${token}`).digest("hex"); }
  async resolve(token: string | undefined): Promise<Session | undefined> {
    if (!token || !tokenFormat.test(token)) return undefined;
    return (await this.pool.query<Session>(sessionQuery, [digest(token)])).rows[0];
  }
  requireCsrf(session: Session | undefined, token: string | undefined) {
    if (!session || !token || !tokenFormat.test(token) || !timingSafeEqual(session.csrf_hash, digest(token))) {
      throw new AuthError(403, "CSRF_INVALID");
    }
  }
  async issue(client: Pool | PoolClient, userId: string | null = null, businessId: string | null = null) {
    const token = randomBytes(32).toString("hex");
    const absolute = userId ? "7 days" : "15 minutes";
    const idle = userId ? "12 hours" : "15 minutes";
    await client.query(`INSERT INTO sessions(user_id,business_id,token_hash,csrf_hash,expires_at,absolute_expires_at)
      VALUES($1,$2,$3,$4,now()+$5::interval,now()+$6::interval)`,
    [userId,businessId,digest(token),digest(this.csrf(token)),idle,absolute]);
    return { token, csrfToken: this.csrf(token) };
  }
  async limit(keys: { label: string; value: string; max: number }[]) {
    const results = await transaction(this.pool, async (client) => {
      const counts: { attempts: number; max: number; remaining: number }[] = [];
      for (const key of [...keys].sort((a,b) => a.label.localeCompare(b.label))) {
        const bucket = createHmac("sha256", this.config.secret).update(`${key.label}:${key.value}`).digest("hex");
        const row = await client.query<{ attempts: number; remaining: number }>(`INSERT INTO login_attempts(bucket_key,window_start,attempts,expires_at)
          VALUES($1,date_bin(interval '15 minutes',now(),timestamptz '2000-01-01'),1,
            date_bin(interval '15 minutes',now(),timestamptz '2000-01-01')+interval '15 minutes')
          ON CONFLICT(bucket_key,window_start) DO UPDATE SET attempts=login_attempts.attempts+1
          RETURNING attempts,greatest(1,ceil(extract(epoch FROM expires_at-now())))::int AS remaining`, [bucket]);
        counts.push({ ...row.rows[0]!, max: key.max });
      }
      return counts;
    });
    const exceeded = results.find((row) => row.attempts > row.max);
    if (exceeded) throw new AuthError(429, "RATE_LIMITED", exceeded.remaining);
  }
  async login(session: Session, username: string, password: string, businessId: string | undefined, ip: string, requestId: string) {
    await this.limit([{ label: "login-ip", value: ip, max: 20 }, { label: "login-user", value: username.toLowerCase(), max: 5 }]);
    const user = (await this.pool.query<{ id: string; password_hash: string; active: boolean }>(
      "SELECT id,password_hash,active FROM users WHERE lower(username)=lower($1)", [username])).rows[0];
    const valid = await verifyPassword(user?.password_hash ?? await this.dummyHash, password);
    if (!valid || !user?.active) throw new AuthError(401, "INVALID_CREDENTIALS");
    return transaction(this.pool, async (client) => {
      // Lock user before session so password changes and new logins share a lock order.
      const current = (await client.query<{ password_hash: string; active: boolean }>("SELECT password_hash,active FROM users WHERE id=$1 FOR UPDATE", [user.id])).rows[0];
      if (!current?.active || current.password_hash !== user.password_hash) throw new AuthError(401, "INVALID_CREDENTIALS");
      const locked = await client.query("SELECT id FROM sessions WHERE id=$1 AND revoked_at IS NULL AND expires_at>now() AND absolute_expires_at>now() FOR UPDATE", [session.id]);
      if (!locked.rowCount) throw new AuthError(401, "SESSION_EXPIRED");
      const memberships = (await client.query<{ business_id: string }>(`SELECT m.business_id FROM business_memberships m
        JOIN businesses b ON b.id=m.business_id WHERE m.user_id=$1 AND m.active AND b.active`, [user.id])).rows;
      if (!memberships.length || (businessId && !memberships.some((m) => m.business_id === businessId))) throw new AuthError(401, "INVALID_CREDENTIALS");
      if (!businessId && memberships.length !== 1) throw new AuthError(409, "BUSINESS_SELECTION_REQUIRED");
      const selected = businessId ?? memberships[0]!.business_id;
      await client.query("UPDATE sessions SET revoked_at=now() WHERE id=$1", [session.id]);
      const issued = await this.issue(client,user.id,selected);
      await this.audit(client,selected,user.id,"LOGIN",requestId);
      return issued;
    });
  }
  private async audit(client: PoolClient, businessId: string, userId: string, action: string, requestId: string) {
    await client.query(`INSERT INTO audit_logs(business_id,actor_user_id,action,entity_type,entity_id,request_id)
      VALUES($1,$2,$3,'user',$2,$4)`, [businessId,userId,action,requestId]);
  }
  async logout(session: Session, requestId: string) {
    await transaction(this.pool, async (client) => {
      if (session.user_id) await client.query("SELECT id FROM users WHERE id=$1 FOR UPDATE",[session.user_id]);
      const changed = await client.query("UPDATE sessions SET revoked_at=now() WHERE id=$1 AND revoked_at IS NULL RETURNING id", [session.id]);
      if (changed.rowCount && session.user_id && session.business_id) await this.audit(client,session.business_id,session.user_id,"LOGOUT",requestId);
    });
  }
  async changePassword(session: Session, currentPassword: string, newPassword: string, requestId: string) {
    await this.limit([{ label:"password-user",value:session.user_id!,max:5 }]);
    const previous = (await this.pool.query<{password_hash:string}>("SELECT password_hash FROM users WHERE id=$1",[session.user_id])).rows[0];
    if (!previous || !await verifyPassword(previous.password_hash,currentPassword)) throw new AuthError(401,"INVALID_CREDENTIALS");
    const nextHash = await hashPassword(newPassword);
    return transaction(this.pool,async (client) => {
      const user = (await client.query<{password_hash:string;active:boolean}>("SELECT password_hash,active FROM users WHERE id=$1 FOR UPDATE",[session.user_id])).rows[0];
      if (!user?.active || user.password_hash !== previous.password_hash) throw new AuthError(401,"SESSION_EXPIRED");
      const current = await client.query(`SELECT s.id FROM sessions s JOIN business_memberships m
        ON m.business_id=s.business_id AND m.user_id=s.user_id JOIN businesses b ON b.id=s.business_id
        WHERE s.id=$1 AND s.revoked_at IS NULL AND s.expires_at>now() AND s.absolute_expires_at>now()
        AND m.active AND b.active FOR UPDATE OF s`,[session.id]);
      if (!current.rowCount) throw new AuthError(401,"SESSION_EXPIRED");
      await client.query("UPDATE users SET password_hash=$1 WHERE id=$2",[nextHash,session.user_id]);
      await client.query("UPDATE sessions SET revoked_at=now() WHERE user_id=$1 AND revoked_at IS NULL",[session.user_id]);
      const issued = await this.issue(client,session.user_id,session.business_id);
      await this.audit(client,session.business_id!,session.user_id!,"PASSWORD_CHANGED",requestId);
      return issued;
    });
  }
  async stores(session: Session) {
    return (await this.pool.query<{ id: string; name: string; code: string; role: "OWNER" | "MANAGER" | "STAFF" }>(`SELECT s.id,s.name,s.code,
      CASE WHEN b.role='OWNER' THEN 'OWNER' ELSE m.role END AS role
      FROM stores s JOIN business_memberships b ON b.business_id=s.business_id AND b.user_id=$2 AND b.active
      JOIN users u ON u.id=b.user_id AND u.active JOIN businesses business ON business.id=b.business_id AND business.active
      LEFT JOIN store_memberships m ON m.business_id=s.business_id AND m.store_id=s.id AND m.user_id=$2 AND m.active
      WHERE s.business_id=$1 AND s.active AND (b.role='OWNER' OR m.role IS NOT NULL) ORDER BY s.code,s.id`, [session.business_id,session.user_id])).rows;
  }
  async touch(session: Session) {
    await this.pool.query("UPDATE sessions SET last_seen_at=now(),expires_at=least(absolute_expires_at,now()+interval '12 hours') WHERE id=$1 AND revoked_at IS NULL AND expires_at>now()", [session.id]);
  }
}
