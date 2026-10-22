# Family Store Manager · POS-Lite

ระบบบริหารร้านก๋วยเตี๋ยวและร้านเบเกอรี่ของครอบครัว ให้เจ้าของดูข้อมูลแยกร้านและภาพรวมกิจการได้
ออกแบบให้แม่ใช้งานบนมือถือ Android เป็นหลัก ด้วยหน้าจอภาษาไทยที่อ่านง่ายและบันทึกข้อมูลได้ไม่กี่ขั้นตอน

เน้นบันทึกยอดขายและเงินเข้าออกให้ถูกต้อง ตรวจนับเงินสดและปิดวันได้ โดยไม่ต้องมีเครื่องสแกนหรืออุปกรณ์ POS เพิ่มเติม

[เอกสารข้อกำหนด](docs/product-requirements.md) · [แผนพัฒนา](docs/implementation-plan.md) · [GitHub Milestones](https://github.com/s-papanya/POS-Lite/milestones)

## สถานะปัจจุบัน

**F1 และ F2 authentication/store access implement แล้ว — ยังไม่เปิดบันทึกธุรกรรมร้านจริง**

| ส่วน | สิ่งที่มีตอนนี้ |
|---|---|
| การออกแบบ | Requirements, กฎธุรกิจ, ERD, สิทธิ์, API contracts, UX flows และกรณีตรวจรับ A–P |
| Frontend | หน้าเข้าสู่ระบบภาษาไทย เลือกร้านตามสิทธิ์ ออกจากระบบ และตรวจการเชื่อมต่อ |
| Backend | Cookie sessions, CSRF/Origin, DB-backed rate limit, revoke/expiry และ store isolation |
| ฐานข้อมูล | PostgreSQL + Drizzle migrations 8 ตาราง, runtime role แยกจาก admin, seed OWNER สองบัญชี/สองร้าน |
| Tooling | npm workspaces/lockfile เดียว, shared contracts, Vitest/Supertest, build/typecheck/lint/test |
| ระบบใช้งานจริง | ยังไม่มี POS, ledger, ปิดวัน หรือรายงาน |

M0 ยังรอยืนยันนโยบาย P4/P5; F2 ผ่าน local validation แล้ว ยังไม่ได้ปิด milestone บน GitHub
ดู [ผลตรวจ F1](docs/foundation-validation.md) และ [F2/วิธีใช้ฐานข้อมูล](docs/access-validation.md)
ดูสถานะและเงื่อนไขปิดงานใน [milestones.md](docs/milestones.md)

## ขอบเขต MVP ที่จะพัฒนา

- เข้าสู่ระบบ เลือกร้าน และตรวจสิทธิ์ OWNER / MANAGER / STAFF ที่ backend
- จัดเมนูและราคา ขายรายบิล รับเงินสด/โอน และแบ่งชำระในบิลเดียว
- เพิ่มยอดขายที่ยังไม่ได้บันทึก และตรวจยอดขายรวมทั้งวันโดยไม่เพิ่มยอดซ้ำ
- บันทึกรายจ่ายแยกจากการจ่ายเงินจริง เติมทุน ถอนส่วนตัว และโอนระหว่างบัญชี
- คืนเงินเต็มบิล ตรวจเงินสด ปิดวัน และเก็บประวัติการแก้ไขพร้อมเหตุผล
- ดูยอดขายสุทธิ รายจ่าย และกระแสเงินสด ทั้งรายร้านและภาพรวม

MVP ใช้งานออนไลน์เป็นหลัก ส่วนสูตรอาหาร สต็อก ต้นทุนขาย การผลิตเบเกอรี่ และ offline sync อยู่ในระยะถัดไป
รายงานช่วง MVP ยังไม่ใช่กำไรสุทธิ เพราะยังไม่มีข้อมูลต้นทุนและสต็อกครบ

## เริ่มรันบนเครื่อง

ใช้ Node.js 24.x และ npm 12.x; เครื่องที่ตรวจใช้ `24.20.0` / `12.2.0`
Python 3 ใช้เฉพาะตรวจเอกสาร ไม่จำเป็นสำหรับการเปิด web/API starter
ใช้ Docker Desktop สำหรับ PostgreSQL local; authentication ต้องเชื่อมฐานข้อมูลจริง

รันจากโฟลเดอร์หลักของ repository:

```powershell
npm ci
Copy-Item .env.example .env
# ตั้งรหัสผ่าน/URLs/SESSION_SECRET/seed credentials ตาม .env.example ก่อน
npm run db:up
npm run db:migrate
npm run db:seed
npm run dev
```

บน macOS / Linux ใช้ `cp .env.example .env` แทน Copy-Item; ขั้นอื่นเหมือนกัน
หากมี .env แล้วให้รักษาค่าเดิม ไม่คัดลอกทับ และไม่ commit รหัสผ่าน

เปิดหน้าเว็บตาม URL ที่ Vite แสดงใน terminal โดยปกติเป็น [localhost:5173](http://localhost:5173)
ตั้ง `APP_ORIGIN` ให้ตรง origin นี้แบบไม่มี slash ท้าย; หาก Vite เปลี่ยนพอร์ตให้ปรับค่าแล้ว restart API
เข้าสู่ระบบด้วย `SEED_OWNER_*` หรือ `SEED_MOTHER_*` จาก `.env`; ไม่มีรหัสผ่านเริ่มต้นฝังในโค้ด
ตรวจ API ได้ที่ [127.0.0.1:3000/api/v1/health](http://127.0.0.1:3000/api/v1/health):

```json
{"data":{"status":"ok","service":"family-store-manager-api"}}
```

API และ Vite proxy ปัจจุบันใช้พอร์ต `3000` ตรงกัน
หากตั้ง environment variable `PORT` เป็นค่าอื่น ต้องปรับ proxy ใน `apps/web/vite.config.ts` ให้ตรงกัน
API bind ที่ `127.0.0.1` การเปิดจากมือถือผ่านเครือข่ายยังต้องตั้งค่า dev เพิ่ม
API โหลด .env ที่ root; ค่าจาก shell มีลำดับสูงกว่าไฟล์
health หมายถึง process ทำงาน ไม่ได้ยืนยันฐานข้อมูล/login/POS

## คำสั่งที่มีอยู่

| คำสั่งจาก root | หน้าที่ |
|---|---|
| `npm run dev` | เปิด API และเว็บพร้อมกัน |
| `npm run dev:api` | เปิด API พร้อม reload เมื่อแก้ไฟล์ |
| `npm run dev:web` | เปิด Vite dev server |
| `npm run typecheck` | ตรวจ TypeScript ของ API/tests และเว็บ โดย build shared packages ก่อน |
| `npm run lint` | ตรวจ API/tests/shared packages และเว็บ |
| `npm test` | รัน Vitest/Supertest ของ Foundation |
| `npm run test:db` | Vitest integration บน PostgreSQL ชั่วคราวที่สร้างและตรวจ ownership เอง |
| `npm run build` | build shared/validation → API → เว็บ แบบไม่ข้าม workspace |
| `npm run start -w api` | รัน API จาก dist หลัง build |
| `npm run db:up` | เปิด PostgreSQL local และรอ healthcheck |
| `npm run db:status` | ดูสถานะ container |
| `npm run db:generate` | สร้าง Drizzle migration จาก schema; review SQL ก่อน apply |
| `npm run db:migrate` | Apply migrations/checksums และ runtime grants เฉพาะ local dev |
| `npm run db:seed` | สร้าง OWNER สองบัญชีและสองร้าน; รันซ้ำไม่ reset รหัสผ่าน |
| `npm run db:down` | หยุด container โดยเก็บ named volume ไว้ |

API tests ตรวจ config/HTTP และ auth/store isolation บน PostgreSQL จริง ยังไม่ใช่ acceptance A–P ด้านธุรกรรมเงิน
หากแก้ shared/validation ระหว่าง dev ให้ restart `npm run dev` เพื่อ build packages ใหม่
CI/deployment pipeline ยังไม่มี; คำสั่ง DB ปัจจุบันปฏิเสธ target ที่ไม่ใช่ local dev
PostgreSQL local ฟังที่ `127.0.0.1:5433`, DB `pos_lite_dev`; migration ใช้ `pos_lite_local`, API ใช้ `pos_lite_app`
อย่าใช้ `down -v` หากต้องการเก็บข้อมูล; เปลี่ยน password ใน .env ไม่เปลี่ยนรหัสของ volume ที่ initialize แล้ว

## โครงสร้าง repository

```text
apps/
  api/                  Express config/logging/error boundary และ tests
  web/                  React/Vite หน้าเริ่มต้นภาษาไทย
packages/
  shared/               DTO types ที่ API ใช้
  validation/           Zod health/error contracts ที่ API tests และเว็บใช้
infra/compose.yaml      PostgreSQL สำหรับ local development
docs/
  product-requirements.md
  domain-rules.md
  architecture.md
  data-model.md
  api-contracts.md
  implementation-plan.md
  milestones.md
package.json            npm workspace scripts
package-lock.json       Root dependency lockfile
```

สถาปัตยกรรมเป้าหมายเป็น Modular Monolith และ REST ภายใต้ `/api/v1`
มี Zod และชุดทดสอบ Foundation แล้ว ส่วน Drizzle/DB driver, migrations และ server-side sessions
อยู่ใน F2 ดูรายละเอียดเป้าหมายใน [architecture.md](docs/architecture.md)

## เอกสารสำหรับพัฒนาต่อ

| เอกสาร | เนื้อหา |
|---|---|
| [Product requirements](docs/product-requirements.md) | เป้าหมาย ขอบเขต สมมติฐาน และนโยบายที่รอยืนยัน |
| [Domain rules](docs/domain-rules.md) | นิยามยอดขาย/เงิน วันทำการ การคืนเงิน locks และ idempotency |
| [Architecture](docs/architecture.md) | โครงสร้างระบบ security และแนวทางดูแลระบบ |
| [Data model & ERD](docs/data-model.md) | ตาราง ความสัมพันธ์ constraints indexes และ deletion policy |
| [API contracts](docs/api-contracts.md) | Endpoint inventory, permissions, requests และ errors |
| [OpenAPI core](docs/openapi.json) | health ที่ implement แล้ว + 6 financial design paths; ยังไม่ครบทุก endpoint |
| [UX flows](docs/ux-flows.md) | ลำดับใช้งานบน Android และสถานะผิดพลาด/เครือข่าย |
| [Transaction examples](docs/transaction-examples.md) | ตัวอย่างขาย กระทบยอด คืนเงิน และปิดวันพร้อมผลต่อข้อมูล |
| [Acceptance scenarios](docs/acceptance-scenarios.md) | กรณี A–P และหลักฐานที่ต้องเก็บเมื่อทดสอบจริง |
| [Implementation plan](docs/implementation-plan.md) | งานย่อย F1–R2 และเกณฑ์ตรวจรับ |
| [Milestones](docs/milestones.md) | M0–M7 พร้อมลิงก์ GitHub และเงื่อนไขปิดแต่ละช่วง |
| [Design review](docs/design-review.md) | ผลตรวจความสอดคล้องและข้อจำกัดของการตรวจรอบออกแบบ |
| [คำขอต้นฉบับ](docs/original-request.th.md) | บริบทและข้อกำหนดตั้งต้นของเจ้าของโปรเจกต์ |

## ตรวจเอกสาร

ใช้ Python 3 และ standard library โดยไม่ต้องติดตั้ง package เพิ่ม:

```sh
python docs/build-core-contract.py
python docs/check-design.py
```

คำสั่งแรกสร้าง `docs/openapi.json` ใหม่จากสัญญา core คำสั่งที่สองตรวจไฟล์ที่บังคับ
ลิงก์ภายใน schema references และเลขตัวอย่าง การตรวจนี้ไม่แทน full OpenAPI validation
หรือ integration tests กับ PostgreSQL และไม่ใช่หลักฐานว่าระบบธุรกรรมพร้อมใช้

## งานถัดไป

### Project skills

มี skills เฉพาะโปรเจกต์ใน `.agents/skills` สำหรับ tests, CI/CD, code style, architecture,
code review, DB migrations, API design, frontend design และ Git workflow
สำหรับ agent ให้เริ่มที่ [AGENTS.md](AGENTS.md) ซึ่งเป็น index เลือก skills ตามงาน
ดู [วิธีเลือกใช้และผล review React/Vite skill](docs/skills-review.md)
พร้อม [สถานะ tooling และ conventions](docs/project-engineering.md)
ตัวอย่าง: `$pos-code-review review diff นี้` หรือ `$pos-test-validation วาง integration tests สำหรับกระทบยอด`
skills อาจมีข้อความ snapshot ก่อน F1 ให้ตรวจโค้ดและสถานะ tooling ล่าสุดก่อนใช้คำสั่งเสมอ

ถัดไป **F2 — Database & Secure Access**: Drizzle migrations, users/memberships/sessions,
authentication/CSRF/rate limiting และ store access ก่อนเริ่ม POS

ก่อนเปลี่ยนกฎที่มีผลต่อยอดขาย เงิน หรือสิทธิ์ ให้อ่าน domain rules และสถานะนโยบายใน requirements
ทุกก้อนต้องอัปเดตเอกสารและเก็บผลตรวจรับตามจริง ไม่ปิด milestone จาก build ผ่านเพียงอย่างเดียว
