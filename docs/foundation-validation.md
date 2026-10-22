# F1 — Foundation implementation และหลักฐาน

วันที่ 22 ตุลาคม 2026; ไม่ใช่การรับรอง production readiness หรือ business acceptance A–P

## สิ่งที่ implement

- npm workspaces apps/web, apps/api, packages/shared และ packages/validation พร้อม root lockfile เดียว
- Direct package versions pin ตาม lock; Node24/npm12; shared packages มี consumers จริง ไม่ใช่โฟลเดอร์เผื่อ
- Zod ตรวจ NODE_ENV/HOST/PORT/LOG_LEVEL ก่อน listen; โหลด .env ที่ root โดยไม่เปิดเผยค่าผิดใน errors
- Express factory แยก startup, request UUID จาก server, no-store, bounded16kb JSON และ safe400/404/413/500 envelope
- Pino HTTP logs ใช้ allowlist method/path/status/id ไม่เก็บ body/headers/query หรือ exception text
- Vitest/Supertest config/HTTP tests แทน placeholder; root build emit API จริง และมี root typecheck/lint/test
- หน้าเริ่มต้นภาษาไทยเช็ค `/api/v1/health` จริงผ่าน Vite proxy, timeout/retry และข้อความยังไม่เปิดบันทึกธุรกรรม
- Docker Compose PostgreSQL bind127.0.0.1:5433, healthcheck และ named volume; image pin digest ที่ตรวจจริง
- OpenAPI เพิ่ม health และแยกว่าหก financial paths ยังเป็น design contracts

## ผลตรวจจริง

| Check | หลักฐาน |
|---|---|
| npm ci | ติดตั้งจาก root lockfile ได้จริง; ไม่มี nested web lockfile |
| Tests | 18 tests / 2 files ผ่าน ผ่านทั้ง root suite และ API workspace entrypoint; config validation และ Supertest HTTP boundary |
| Typecheck/lint/build | ทุกคำสั่งผ่าน ตรวจ API/tests/packages/web; API dist สร้างและรันด้วย start ได้ |
| Browser dev/proxy | หน้าเว็บแสดงเชื่อมต่อสำเร็จจาก API จริง; กด retry ได้ |
| Recovery | หยุดเฉพาะ dev API ที่งานนี้เปิด → เว็บแสดงเชื่อมต่อไม่ได้ → เปิด built API กลับ → retry สำเร็จ |
| Responsive | Desktop1280px และ mobile viewport360px; mobile scrollWidth345<=360 และ button height49.7px |
| Design detector | mechanical scan ไม่พบ deterministic issues; ไม่แทน human usability review |
| PostgreSQL | Container healthy; SELECT current_database/current_user/version ได้ pos_lite_dev/pos_lite_local/PostgreSQL17.11 |
| เอกสาร | 6 เอกสารบังคับ, 53 links, 7 core paths, 193 local refs และเลขตัวอย่างผ่าน structural checker |

ภาพตรวจ local เก็บใน `.tmp/foundation-review/desktop.png` และ mobile.png (gitignored ไม่ใช่ snapshot test suite)
ตรวจ mobile ผ่าน Chromium viewport ไม่ใช่อุปกรณ์ Android จริง; ยังไม่ทดสอบ Android keyboard/large text/offline toggle จริง
tests HTTP ต้องเปิด loopback ชั่วคราว บน sandbox นี้ต้องรันโดยได้รับสิทธิ์เพิ่ม ไม่เปลี่ยน tests เป็น mock เพื่อหลบข้อจำกัด
npm มีคำเตือน blocked esbuild install script; ไม่อนุมัติ script เพิ่มแบบเหมารวม และ build/dev/test ที่ใช้จริงรันผ่านได้

## ขอบเขตข้อมูลและ local environment

สร้าง .env แบบ gitignored พร้อม random local DB password โดยไม่ overwrite ไฟล์เดิมหรือบันทึกรหัสใน log
ไม่มี secret จริงใน .env.example; ไม่มี migration/seed/schema push/reset หรือลบ volume ในงานนี้
DB มีเพียงฐาน local ที่ PostgreSQL initialize; API health ตรวจ liveness เท่านั้น ยังไม่เชื่อม DB/auth
`npm run db:down` เก็บ volume ไว้; ห้ามใช้ down -v เพื่อแก้ปัญหา password mismatch โดยไม่เข้าใจข้อมูลใน volume
Compose image: postgres17 digest b8faeff7712663c2773a190181e1246e37e364b887611c04658c28b44e2408fe

## งานถัดไปและข้อจำกัด

F2: Drizzle/DB driver, identity/store memberships/sessions migrations, seed development ที่ไม่ฝังรหัสผ่าน,
session/CSRF/rate limit/store isolation และ PostgreSQL integration tests ก่อนธุรกรรมขาย
ยังไม่มี CI/deploy, broker/payment integration, store selection จริง, login หรือการบันทึกยอดขาย/เงิน
P4/P5 ยังรอยืนยันก่อนบริการที่ผูกนโยบายนั้น; F1 ไม่เปลี่ยนความหมายเงิน/สิทธิ์
M1 ต้องคง OPEN จน F2 ผ่านเกณฑ์ ไม่ปิดเพราะ Foundation build ผ่าน

ตรวจตาม [pos-code-review](../.agents/skills/pos-code-review/SKILL.md) แบบ static และ targeted runtime:
request scopes ยังไม่มี business endpoints จึงไม่อ้าง tenant isolation ผ่านแล้ว;
body/query/header/exception redaction, safe defaults, root lockfile และ build artifact ตรวจตามข้างต้น
เอกสารเทคโนโลยีอ้างอิง: [Express errors](https://expressjs.com/en/guide/error-handling/),
[Pino HTTP](https://github.com/pinojs/pino-http), [Zod](https://zod.dev/api),
[Vitest](https://vitest.dev/guide/), [Compose env](https://docs.docker.com/compose/how-tos/environment-variables/variable-interpolation/)
