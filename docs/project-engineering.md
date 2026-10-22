# Engineering conventions สำหรับ project skills

ข้อตกลงสำหรับพัฒนาต่อและสถานะล่าสุดหลัง F2; ผลตรวจ local อยู่ใน [access-validation.md](access-validation.md)
skills อยู่ใน `.agents/skills` ใช้เฉพาะประเภทงานที่เกี่ยวข้อง ไม่โหลดทุก skill ทุกครั้ง
ตรวจ package/config และผลรันใหม่ก่อนอ้างสถานะ หากโค้ดต่างจากกฎธุรกิจที่ตกลงให้รายงาน gap ไม่แก้กฎตาม bug

## หลักฐานปัจจุบัน — 22 ตุลาคม 2026

| เรื่อง | มีจริง | แผนที่ยังไม่ implement |
|---|---|---|
| Runtime | React/Vite/TypeScript, Express, Zod, Pino, pg/Drizzle, Argon2id; local migrations/seed และ cookie auth | ธุรกรรมเงิน/catalog/day/ledger |
| Tests | Vitest5/Supertest; config/HTTP/password และ PostgreSQL auth/constraints/rollback integration | financial transactions/concurrency A–P |
| CI/CD | ยังไม่มี workflows หรือ deployment manifests | CI, staging/production pipeline, backup/restore |
| Lint | Root ESLint สำหรับ API/tests/packages; เว็บ Hooks/Fast Refresh; root build/typecheck/lint/test | CI quality gates |
| Style | API double quotes/semicolons; เว็บ single quotes/no semicolons เป็นหลัก | formatter/import sorting ที่ enforce ร่วมกัน |
| UI | Thai shell/CSS navy tokens, health/login/logout และเลือกร้านตามสิทธิ์ | password-change UI, Tailwind/transaction components |
| Git | GitHub origin, main, Conventional Commit ตัวอย่างใน history | protection/required checks/hooks ยังไม่ถือว่าตั้งแล้ว |

คำสั่งที่มีตอนนี้จาก root (ตรวจ scripts อีกครั้งก่อนใช้):

```sh
npm ci
npm run typecheck
npm run lint
npm test
npm run test:db
npm run build
```

F1 ใช้ root lockfile เดียวและ build explicit ทุก workspace; API start ต้องมี dist จาก build ก่อน
shared packages มี consumer จริง: API ใช้ DTOs และเว็บ/API tests ใช้ Zod contracts
ไม่รัน npm ci ซ้ำเพื่อแก้ docs/skills และห้าม noop เพื่อให้ checks เขียว
บาง skills บันทึกสถานะก่อน F1 ว่า runner/Compose ยังไม่มี ให้ถือเป็น historical snapshot
สถานะจริงในเอกสารนี้และโค้ด/config ล่าสุดมีลำดับก่อนข้อความ snapshot เหล่านั้น
Python design checks ไม่ใช่ application tests; [ผลตรวจ F1](foundation-validation.md) แยกจาก business A–P ที่ยังไม่รัน

## การอ้างอิงและ conventions ใหม่

คำสั่งล่าสุดของเจ้าของมีลำดับเหนือ conventions; สถานะจริงตรวจจากโค้ด/config
กฎที่ตกลงอยู่ใน [requirements](product-requirements.md) และ [domain rules](domain-rules.md)
P1–P3 ยืนยันแล้ว; P4/P5 ยังรอยืนยัน skill ไม่ใช่การอนุมัติแทนเจ้าของ

- Code/identifiers เป็นอังกฤษ; UI และคำอธิบายเจ้าของเป็นไทย
- camelCase variables/functions; PascalCase components/types; UPPER_SNAKE_CASE module constants
- DB snake_case; API JSON camelCase; error codes UPPER_SNAKE_CASE
- New domain files kebab-case เช่น sales.service.ts; React component files PascalCase; hooks useX.ts
- เคารพ style เดิม ไม่ reformat ทั้ง repo; type-only imports ใช้ import type
- Import convention: Node built-ins → third party → workspace → relative → styles; รักษาลำดับ side effects
  เช่น dotenv/config และ CSS; ยังไม่มี import-sort lint rule
- API NodeNext ESM ใช้ `.js` relative imports ที่ emit; เว็บใช้ resolution ตาม Vite tsconfig
- ยังไม่มี Prettier/Tailwind config ห้ามอ้างว่ากฎใหม่ถูก enforce แล้ว

## Source of truth ที่อ่านตามงาน

| งาน | เอกสาร |
|---|---|
| Transaction/test/review | [domain-rules](domain-rules.md), [acceptance A–P](acceptance-scenarios.md) |
| API/auth | [api-contracts](api-contracts.md), [OpenAPI core](openapi.json) |
| DB/migration | [data-model](data-model.md), [architecture](architecture.md) |
| UI | [ux-flows](ux-flows.md), [requirements](product-requirements.md) |
| Delivery | [implementation-plan](implementation-plan.md), [milestones](milestones.md) |

ไม่มี skill ใดให้สิทธิ์ deploy/push/merge หรือเข้าถึงข้อมูลจริงเพิ่มโดยตัวมันเอง
เตรียม diff/แผน/ผลตรวจตามงานที่สั่ง; remote mutations ต้องอยู่ในขอบเขตที่เจ้าของอนุญาต
