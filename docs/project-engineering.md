# Engineering conventions สำหรับ project skills

ข้อตกลงเริ่มต้นสำหรับพัฒนาต่อ ไม่ได้ติดตั้ง tooling หรือทำให้ Foundation เสร็จ
skills อยู่ใน `.agents/skills` ใช้เฉพาะประเภทงานที่เกี่ยวข้อง ไม่โหลดทุก skill ทุกครั้ง
ตรวจ package/config และผลรันใหม่ก่อนอ้างสถานะ หากโค้ดต่างจากกฎธุรกิจที่ตกลงให้รายงาน gap ไม่แก้กฎตาม bug

## หลักฐานปัจจุบัน — 22 ตุลาคม 2026

| เรื่อง | มีจริง | แผนที่ยังไม่ implement |
|---|---|---|
| Runtime | React/Vite/TypeScript, Express/TypeScript, npm workspaces | PostgreSQL, Drizzle, Zod, session auth |
| Tests | API test เป็น failing placeholder; ไม่มี runner/config | Vitest + Supertest; PostgreSQL จริงสำหรับ transaction/constraint/concurrency |
| CI/CD | ยังไม่มี workflows หรือ deployment manifests | CI, staging/production pipeline, backup/restore |
| Lint | เว็บ ESLint flat config: JS/TS recommended, Hooks, Fast Refresh | API lint และ root lint/typecheck/test |
| Style | API double quotes/semicolons; เว็บ single quotes/no semicolons เป็นหลัก | formatter/import sorting ที่ enforce ร่วมกัน |
| UI | Vite starter/CSS ไม่มี Tailwind หรือ product components | Thai mobile UX/tokens/reusable components |
| Git | GitHub origin, main, Conventional Commit ตัวอย่างใน history | protection/required checks/hooks ยังไม่ถือว่าตั้งแล้ว |

คำสั่งที่มีตอนนี้จาก root (ตรวจ scripts อีกครั้งก่อนใช้):

```sh
npm ci
npm run typecheck -w apps/api
npm run lint -w apps/web
npm run build -w apps/web
```

root build ใช้ `--if-present` จึงข้าม API ที่ยังไม่มี build script; API start ต้องมี dist ก่อน
API test ยังล้มเหลวโดยตั้งใจ ห้ามเปลี่ยนเป็น noop เพื่อให้ CI เขียว
ไม่รัน npm ci ซ้ำเพื่อแก้ docs/skills; เป้าหมายคือ root lockfile เดียว แต่ nested web lockfile เป็นหนี้ F1
ไม่ลบทิ้งอัตโนมัติในงานอื่น Python design scripts เป็นการตรวจเอกสาร ไม่ใช่ application tests

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
