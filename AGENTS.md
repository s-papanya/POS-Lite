# POS-Lite agent entry point

Family Store Manager สำหรับร้านก๋วยเตี๋ยวและเบเกอรี่ ใช้มือถือ Android เป็นหลัก
สื่อสารกับเจ้าของและเขียน UI เป็นภาษาไทย; code/identifiers เป็นภาษาอังกฤษ
ใช้ React + TypeScript + Vite, Express + TypeScript, PostgreSQL และ modular monolith

## เริ่มงาน

1. ตรวจ working tree และโค้ด/config ที่เกี่ยวข้องก่อนแก้ รักษางานที่ผู้อื่นทำค้างไว้
2. อ่าน [สถานะและ conventions](docs/project-engineering.md) เพื่อแยก tooling ที่มีจริงกับแผน
3. เลือก skill ที่ตรงงานจากตารางด้านล่าง อ่านเฉพาะ SKILL.md และ references ที่จำเป็น
   งานเอกสารเล็กน้อยไม่จำเป็นต้องโหลด skills ทั้งชุดหรือรันทุก test
4. หากเปลี่ยนความหมายยอดขาย เงิน สิทธิ์ หรือวันทำการ ให้อ่าน
   [requirements](docs/product-requirements.md) และ [domain rules](docs/domain-rules.md) ส่วนที่เกี่ยวข้อง
   ตรวจสถานะ decision ล่าสุดก่อนทำ ไม่ถือว่าข้อเสนอที่รอยืนยันได้รับอนุมัติแล้ว

คำสั่งล่าสุดของเจ้าของมาก่อน conventions ของโปรเจกต์ เมื่อเอกสารกับโค้ดขัดกันให้ระบุ gap
ไม่แก้กฎธุรกิจที่ยืนยันแล้วให้เข้ากับ bug และไม่อ้าง planned feature ว่าพัฒนาแล้ว

## เลือก skill ตามงาน

| งาน | Skill ที่อ่าน |
|---|---|
| เขียน/ตรวจ tests, เลือก mocks, พิสูจน์ transaction หรือ race | [pos-test-validation](.agents/skills/pos-test-validation/SKILL.md) |
| CI, build artifacts, env validation, staging/production readiness | [pos-cicd](.agents/skills/pos-cicd/SKILL.md) |
| Naming, imports, TypeScript style, lint conventions | [pos-code-style](.agents/skills/pos-code-style/SKILL.md) |
| แบ่ง module/folder, controller/service/repository, transaction boundary | [pos-architecture](.agents/skills/pos-architecture/SKILL.md) |
| Review diff, regressions, ความถูกต้องของเงิน/สิทธิ์/หลักฐาน | [pos-code-review](.agents/skills/pos-code-review/SKILL.md) |
| Schema, migration, indexes, constraints, backfill | [pos-db-migrations](.agents/skills/pos-db-migrations/SKILL.md) |
| REST API, validation, auth, pagination, error/idempotency contracts | [pos-api-design](.agents/skills/pos-api-design/SKILL.md) |
| หน้าจอภาษาไทย, mobile UX, tokens และ reusable components | [pos-frontend-design](.agents/skills/pos-frontend-design/SKILL.md) |
| Branch, commit, PR และ milestone mapping | [pos-git-workflow](.agents/skills/pos-git-workflow/SKILL.md) |
| วัด/แก้ React/Vite performance, chunks, HMR, build/assets/env | [react-vite-best-practices](.agents/skills/react-vite-best-practices/SKILL.md) |

งานหนึ่งเลือกมากกว่าหนึ่ง skill ได้เมื่อมีความรับผิดชอบต่างกันจริง เช่น API การขายใช้ api-design
และ architecture; เพิ่ม test-validation เมื่อเขียนหรือพิสูจน์ tests ไม่ต้องเปิดทุก skill เผื่อไว้
React/Vite performance skill ไม่จำเป็นกับทุก React edit และ code-review ไม่บังคับ full audit ทุก wording change

## เอกสารหลักและข้อจำกัด

- [API contracts](docs/api-contracts.md), [data model/ERD](docs/data-model.md),
  [UX flows](docs/ux-flows.md), [acceptance A–P](docs/acceptance-scenarios.md)
- [Implementation plan](docs/implementation-plan.md), [milestones](docs/milestones.md)
- [Skill review และการใช้งาน](docs/skills-review.md)

เงินใช้ integer สตางค์/BigInt และ API money strings ไม่ใช้ float; backend ตรวจ scope/สิทธิ์ทุกคำขอ
source/payment/movement/audit/idempotency ต้อง atomic ตาม domain rules ไม่ลดมาตรการเพราะ client ป้องกันแล้ว
tests ที่อ้าง constraint/rollback/concurrency ต้องใช้ PostgreSQL จริงตาม test skill
รายงานเฉพาะสิ่งที่ทำและตรวจจริง build ผ่านไม่เท่ากับพร้อม production

ทักษะและ entry point นี้ไม่เพิ่มสิทธิ์ deploy, remote migration, push หรือ merge นอกขอบเขตที่เจ้าของอนุญาต
ใช้ขอบเขตคำสั่งที่มีอยู่โดยไม่ถามอนุมัติซ้ำสำหรับงานที่อนุญาตแล้ว

## ไฟล์ที่ควรเก็บใน Git

เก็บ AGENTS.md, `.agents/skills`, skills-lock.json และ project docs เพื่อใช้ต่อข้าม session
`.agents/skills` เป็น canonical; `.claude/skills` มีสำเนาชุดเดียวกันสำหรับ agent อื่น
หากแก้สำเนาเดิมให้ตรวจความสอดคล้อง ไม่สร้างชุด skills ใหม่ซ้ำสองที่โดยไม่จำเป็น
ไม่ commit secrets, machine-local settings, dependencies, build/test reports หรือ temporary skill drafts
