# Family Store Manager · POS-Lite

ระบบบริหารร้านก๋วยเตี๋ยวและร้านเบเกอรี่ของครอบครัว ให้เจ้าของดูข้อมูลแยกร้านและภาพรวมกิจการได้
ออกแบบให้แม่ใช้งานบนมือถือ Android เป็นหลัก ด้วยหน้าจอภาษาไทยที่อ่านง่ายและบันทึกข้อมูลได้ไม่กี่ขั้นตอน

เน้นบันทึกยอดขายและเงินเข้าออกให้ถูกต้อง ตรวจนับเงินสดและปิดวันได้ โดยไม่ต้องมีเครื่องสแกนหรืออุปกรณ์ POS เพิ่มเติม

[เอกสารข้อกำหนด](docs/product-requirements.md) · [แผนพัฒนา](docs/implementation-plan.md) · [GitHub Milestones](https://github.com/s-papanya/POS-Lite/milestones)

## สถานะปัจจุบัน

**อยู่ระหว่างออกแบบและวาง Foundation — ยังไม่พร้อมใช้บันทึกธุรกรรมร้านจริง**

| ส่วน | สิ่งที่มีตอนนี้ |
|---|---|
| การออกแบบ | Requirements, กฎธุรกิจ, ERD, สิทธิ์, API contracts, UX flows และกรณีตรวจรับ A–P |
| Frontend | React + TypeScript + Vite starter; ยังเป็นหน้าตัวอย่างของ Vite |
| Backend | Express + TypeScript และ `GET /api/v1/health` |
| ฐานข้อมูล | ออกแบบ PostgreSQL แล้ว; ยังไม่มี Compose, migrations หรือ seed |
| ระบบใช้งานจริง | ยังไม่มี authentication, POS, ledger, ปิดวัน หรือรายงาน |

M0 ส่งมอบเอกสารแล้วและรอยืนยันนโยบาย P4/P5 ส่วน M1 มีโครงเริ่มต้นแต่ยังไม่ครบเกณฑ์
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

ใช้ Node.js และ npm โดยเครื่องที่ตรวจโครงปัจจุบันใช้ Node.js `24.20.0` / npm `12.2.0`
Python 3 ใช้เฉพาะตรวจเอกสาร ไม่จำเป็นสำหรับการเปิด web/API starter
ยังไม่ต้องเตรียม PostgreSQL เพื่อรันโครงปัจจุบัน

รันจากโฟลเดอร์หลักของ repository:

```powershell
npm ci
npm run dev
```

ใช้คำสั่งเดียวกันได้บน macOS / Linux

เปิดหน้าเว็บตาม URL ที่ Vite แสดงใน terminal โดยปกติเป็น [localhost:5173](http://localhost:5173)
ตรวจ API ได้ที่ [127.0.0.1:3000/api/v1/health](http://127.0.0.1:3000/api/v1/health):

```json
{"status":"ok"}
```

API และ Vite proxy ปัจจุบันใช้พอร์ต `3000` ตรงกัน
หากตั้ง environment variable `PORT` เป็นค่าอื่น ต้องปรับ proxy ใน `apps/web/vite.config.ts` ให้ตรงกัน
API bind ที่ `127.0.0.1` การเปิดจากมือถือผ่านเครือข่ายยังต้องตั้งค่า dev เพิ่ม

## คำสั่งที่มีอยู่

| คำสั่งจาก root | หน้าที่ |
|---|---|
| `npm run dev` | เปิด API และเว็บพร้อมกัน |
| `npm run dev:api` | เปิด API พร้อม reload เมื่อแก้ไฟล์ |
| `npm run dev:web` | เปิด Vite dev server |
| `npm run typecheck -w apps/api` | ตรวจ TypeScript ของ API |
| `npm run lint -w apps/web` | ตรวจ ESLint ของเว็บ |
| `npm run build -w apps/web` | ตรวจ TypeScript และ build เว็บ |
| `npm run build` | เรียก build ของ workspace ที่มี script |

**ข้อจำกัดของ scripts:** root build ยังข้าม API เพราะ API ไม่มี build script
และ API `start` ต้องมี `dist/server.js` ก่อน จึงยังไม่ใช่ขั้นตอน production ที่พร้อมใช้
API `test` ยังเป็น placeholder ที่จบด้วย error; ยังไม่มี automated business test suite
ต้องเติม scripts และจัด lockfile ให้เหลือ root เดียวในก้อน F1

## โครงสร้าง repository

```text
apps/
  api/                  Express API starter
  web/                  React/Vite starter
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
ใช้ PostgreSQL เป็นฐานข้อมูล ส่วน Drizzle, Zod, server-side sessions และชุดทดสอบ
เป็นแผน Foundation ที่ยังต้องนำมาพัฒนา ดูรายละเอียดใน [architecture.md](docs/architecture.md)

## เอกสารสำหรับพัฒนาต่อ

| เอกสาร | เนื้อหา |
|---|---|
| [Product requirements](docs/product-requirements.md) | เป้าหมาย ขอบเขต สมมติฐาน และนโยบายที่รอยืนยัน |
| [Domain rules](docs/domain-rules.md) | นิยามยอดขาย/เงิน วันทำการ การคืนเงิน locks และ idempotency |
| [Architecture](docs/architecture.md) | โครงสร้างระบบ security และแนวทางดูแลระบบ |
| [Data model & ERD](docs/data-model.md) | ตาราง ความสัมพันธ์ constraints indexes และ deletion policy |
| [API contracts](docs/api-contracts.md) | Endpoint inventory, permissions, requests และ errors |
| [OpenAPI core](docs/openapi.json) | สัญญาที่อ่านด้วยเครื่องได้สำหรับ 6 paths สำคัญ; ยังไม่ครบทุก endpoint |
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
skills เป็นคำแนะนำสำหรับพัฒนาต่อ ไม่ได้แปลว่า test runner, CI หรือฐานข้อมูลถูก implement แล้ว

เริ่ม **F1 — Foundation skeleton**: เติม workspace/scripts/config/logging/error handling และ local PostgreSQL
จากนั้นทำ **F2 — Database & Secure Access** ก่อนเริ่ม POS

ก่อนเปลี่ยนกฎที่มีผลต่อยอดขาย เงิน หรือสิทธิ์ ให้อ่าน domain rules และสถานะนโยบายใน requirements
ทุกก้อนต้องอัปเดตเอกสารและเก็บผลตรวจรับตามจริง ไม่ปิด milestone จาก build ผ่านเพียงอย่างเดียว
