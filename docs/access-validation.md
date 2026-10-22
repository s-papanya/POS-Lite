# F2 — Database และ secure access

ตรวจ local วันที่ 22 ตุลาคม 2026 บน Node24.20.0/npm12.2.0 และ PostgreSQL17.11
F2 ครอบคลุม identity/store access; ยังไม่มี schema หรือ API ธุรกรรมเงิน

## สิ่งที่ส่งมอบ

- Drizzle schema/migration 8 ตาราง: users, businesses, stores, business_memberships,
  store_memberships, sessions, login_attempts, audit_logs พร้อม checks/unique/composite FKs
- บัญชี runtime `pos_lite_app` แยกจาก migration admin; อ่าน master data และแก้เฉพาะ password hash,
  sessions/counters ได้; audit INSERT/SELECT ได้ แต่ UPDATE/DELETE ไม่ได้
- Cookie opaque token32 bytes; DB เก็บ SHA-256 token/CSRF hashes เท่านั้น
  CSRF token คำนวณด้วย HMAC secret ผูกกับ session; GET ซ้ำไม่ทำให้แท็บเดิมเสีย token
- Anonymous15นาที; authenticated idle12ชั่วโมง/absolute7วัน; login rotate/revoke แบบ atomic
  logout revoke; เปลี่ยนรหัสผ่าน revoke ทุกอุปกรณ์แล้วสร้าง session ปัจจุบันใหม่ พร้อม audit ใน transaction เดียว
- Password ใช้ Argon2id memory64MiB/time3/parallelism1 พร้อม random salt
- Mutation ตรวจ exact Origin และ X-CSRF-Token; production cookie เป็น `__Host-session`,
  Secure/HttpOnly/SameSite=Lax/Path=/ และไม่มี Domain; dev ใช้ `pos_lite_session`
- ทุก request ตรวจ session, user, business, business membership ที่ active จาก DB
  OWNER เห็นทุกร้านในธุรกิจตน; MANAGER/STAFF เฉพาะ store membership ที่ active
  `MEMBER` เป็นฐาน identity/FK ภายใน ไม่มีสิทธิ์ business เพิ่ม
- Login generic error; DB-backed fixed15นาที buckets: IP20/username5, anonymous CSRF creation IP30,
  password change user5; counts รวมครั้งที่สำเร็จ ไม่ reset และมี Retry-After
  buckets ใช้ HMAC ไม่เก็บชื่อ/IP ตรงๆ; DB ล้มเหลวไม่ fallback ไป in-memory sessions
- Thai login/logout และเลือกร้านจริง; shared Zod validation สำหรับ login/CSRF/identity
  การเลือกร้านตอนนี้แสดงบริบทในหน้า ยังไม่มีแบบฟอร์มขายหรือการส่งธุรกรรม

API ที่มีจริง: GET `/health`, GET `/auth/csrf`, POST `/auth/login`, POST `/auth/logout`,
POST `/auth/password`, GET `/me`, GET `/stores`, GET `/stores/:storeId` ใต้ `/api/v1`
ดู [OpenAPI](openapi.json) และ [API contracts](api-contracts.md)
login คืน csrfToken ใหม่; อ่าน identity ผ่าน /me; optional businessId เลือกจาก active memberships เท่านั้น
หากมีหลายธุรกิจและไม่ระบุ จะตอบ409 BUSINESS_SELECTION_REQUIRED; UI รอบนี้รองรับธุรกิจเดียวตาม seed
store list เป็นรายการร้านทั้งหมดที่เข้าถึงได้ พร้อม page.nextCursor=null ไม่ใช่ transaction pagination

## เปิดฐานข้อมูลและ seed

1. สร้าง `.env` จาก `.env.example` เฉพาะเมื่อยังไม่มี รักษาค่าเดิมหาก volume initialize แล้ว
2. ตั้ง POSTGRES_PASSWORD และ MIGRATION_DATABASE_URL ให้ตรงกัน ใช้ loopback5433/pos_lite_dev/pos_lite_local
3. สร้างรหัส hex อย่างน้อย48ตัวสำหรับ DATABASE_URL ของ pos_lite_app และ SESSION_SECRET hexอย่างน้อย64ตัว
   ตั้ง APP_ORIGIN ให้ตรงเว็บจริง เช่น http://localhost:5173 ไม่มี slash ท้าย
4. ตั้ง seed usernames สองชื่อที่ต่างกันและ passwords12–128ตัว; ไม่ commit หรือส่งค่าเหล่านี้ลง log
5. รัน `npm run db:up`, `npm run db:migrate`, `npm run db:seed`, `npm run dev`

คำสั่ง migrate/seed ต้อง NODE_ENV=development และตรวจทั้ง URL กับ current_database/current_user
ไม่เปิดรับ staging/production target; HTTP startup ไม่รัน migrations และไม่ใช้ admin URL
seed สร้าง OWNER สองบัญชี (ผู้ใช้/แม่), ธุรกิจหนึ่งแห่ง และสองร้าน ด้วย IDs คงที่
รันซ้ำไม่เปลี่ยนชื่อ/hash/role/ข้อมูลร้านเดิม; เปลี่ยน seed password ใน env ไม่ใช่การ reset password
username ที่ขัดแย้งทำให้ transaction rollback แทนการยึดบัญชีเดิม

## Migration และ recovery

แก้ schema แล้วรัน `npm run db:generate`; review SQL/snapshot/journal ก่อน `db:migrate`
migration มี advisory lock, lock timeout5วินาที, statement timeout30วินาที และตรวจ checksum ของไฟล์ที่ apply แล้ว
ห้ามแก้ migration ที่ใช้ไปแล้ว; สร้าง forward migration ใหม่เพื่อแก้ปัญหา
SQL ชุดแรกเป็น CREATE/ADD constraints/indexes ไม่มี DROP/TRUNCATE ข้อมูลเดิม
Drizzle ใช้ transaction เมื่อ apply; runtime grants ทำโดย local CLI หลัง migration สำเร็จ
หาก grant ล้มเหลวแก้เหตุแล้วรัน migrate ซ้ำ; ไม่ล้าง volume และไม่ใช้ `down -v`
ชุดนี้ยังไม่มี production migration/restore runbook; ต้องทำ R2 ก่อนใช้กับข้อมูลจริง

## หลักฐานทดสอบ

`npm test` ผ่าน21 tests ใน4ไฟล์ (config, HTTP/error/logging, password และ auth config)
`npm run test:db` ผ่าน1 integration workflow ซึ่งมี16กลุ่มตรวจสอบย่อยบน PostgreSQL จริง:

- migrate DB ว่าง/รันซ้ำ, seed รันซ้ำไม่ reset hash และ reapply รักษา fixture
- case-insensitive username unique, cross-business store/session FK
- runtime privileges และ audit append-only, transaction rollback, checksum mismatch fail closed
- login rotate/old-cookie reject, shared DTO validation, hashes32 bytes, stable CSRF
- wrong/missing Origin/CSRF และ token ข้าม session ถูกปฏิเสธ; logout revoke
- disabled user, inactive business/store membership, idle/absolute expiry และ bounded renewal
- STAFF เห็นร้านเดียว, OWNER ข้ามธุรกิจไม่ได้
- password change revoke ทุก device, fresh session/new password ใช้ได้
- rate limit แชร์ข้าม service instances, HTTP429/Retry-After และ generic invalid credentials
- concurrent anonymous-session reuse ได้ authenticated session หนึ่งชุด
- production cookie flags ไม่มี Domain

Harness สร้าง DB ชื่อสุ่มเองบน instance local ที่ตรวจแล้ว ใส่ ownership nonce และตรวจ DB/user/nonce
ก่อนทดสอบ/ก่อน DROP เฉพาะ DB ที่สร้างเอง ไม่รับ TEST_DATABASE_URL ภายนอกและไม่ TRUNCATE dev DB
`test:db` build shared packages ก่อนเช่นเดียวกับ `npm test`; ยังใช้ Vitest runner ชุดเดิม แยก config สำหรับ DB
ใช้ runtime role จริงสำหรับ API; fixture/admin assertions ใช้ admin เฉพาะ disposable DB
ยังไม่ได้พิสูจน์ deterministic lock interleavings ทุกแบบ หรือจำลอง upgrade จาก release schema เก่าซึ่งยังไม่มี

`npm run build`, `npm run typecheck`, `npm run lint` และ Python design checks ผ่าน
OpenAPI14 paths/49schemas (6 financial paths ยัง design-only); shared response schemas ใช้ใน tests และเว็บ
Browser local ตรวจ login→เลือกสองร้าน→logout และ360×800 ไม่มี horizontal overflow,
ปุ่มที่วัดสูงอย่างน้อย48px; ภาพชั่วคราวอยู่ `.tmp/access-review` (ไม่ commit)
ยังไม่ได้ทดลอง Android จริง, keyboard/large-text ครบทุกแบบ หรือ HTTPS/reverse proxy production

## Dependencies และขอบเขตที่เหลือ

`npm audit --omit=dev` พบ0 vulnerabilities ณวันที่ตรวจ; full audit พบ4 moderate จากสาย
drizzle-kit → @esbuild-kit/esm-loader/core-utils → esbuild ตาม
[GHSA-67mh-4wv8-2f99](https://github.com/advisories/GHSA-67mh-4wv8-2f99)
เกี่ยวกับ esbuild development server; ไม่เรียก Drizzle Studio/esbuild serve ใน workflow นี้
ยังไม่ใช้ force fix ที่เสนอ downgrade Drizzle Kit; ต้องติดตาม upstream ก่อนเปิด dev tooling ออกเครือข่าย

ก่อน staging/production ต้องกำหนด trusted proxy/IP rate-limit strategy, secret rotation,
session/counter retention/cleanup, TLS, backup/restore และ deployment pipeline ตาม R2
เมื่อ rotate SESSION_SECRET ต้อง revoke sessions เดิมด้วย เพราะ CSRF HMAC/hash ผูกกับ secret เดิม
user/store administration, last-owner guard และ password-change UI ยังไม่มี endpoint/UI จัดการทั่วไป
ผล local นี้ไม่เท่ากับพร้อม deploy หรือผ่าน business acceptance A–P ด้านเงิน

อ้างอิงวิธี migration: [Drizzle migrations](https://orm.drizzle.team/docs/migrations),
password API: [NAPI-RS Argon2](https://github.com/napi-rs/node-rs/tree/main/packages/argon2)
