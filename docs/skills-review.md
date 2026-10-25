# Project skills และผล review

ส่วนต้นเป็นประวัติวันที่ 22 ตุลาคม 2026; การอัปเดตตามระบบปัจจุบันอยู่ท้ายเอกสาร

## Skills เฉพาะโปรเจกต์

ติดตั้ง canonical ที่ `.agents/skills` เพื่อใช้งานภายใน repository เปิด automatic discovery ตามค่าเริ่มต้น
มี [AGENTS.md ที่ root](../AGENTS.md) เป็น entry point และ skill index ไม่เพิ่ม router skill อีกชั้น
เพื่อให้เริ่มจากบริบทสั้น ๆ แล้วเลือกอ่านเฉพาะคำแนะนำที่ตรงงาน
ใช้เฉพาะ skill ที่ตรงงาน ตัวอย่าง `$pos-test-validation ตรวจเคสกระทบยอดพร้อมกัน`
หรือ `$pos-code-review review diff นี้` ไม่ต้องเรียกทุก skill พร้อมกัน

| Skill | หน้าที่ |
|---|---|
| [pos-test-validation](../.agents/skills/pos-test-validation/SKILL.md) | เลือก unit/API/DB integration, fixtures/mocks และหลักฐาน A–P |
| [pos-cicd](../.agents/skills/pos-cicd/SKILL.md) | build gates, env validation, staging/production/recovery |
| [pos-code-style](../.agents/skills/pos-code-style/SKILL.md) | naming, ESM imports, TypeScript และ lint ที่มีจริง |
| [pos-architecture](../.agents/skills/pos-architecture/SKILL.md) | modular monolith และ controller/service/repository/transaction boundaries |
| [pos-code-review](../.agents/skills/pos-code-review/SKILL.md) | review ความถูกต้อง เงิน สิทธิ์ regressions และคุณภาพหลักฐาน |
| [pos-db-migrations](../.agents/skills/pos-db-migrations/SKILL.md) | PostgreSQL/Drizzle, expand/backfill/contract, compatibility และ restore |
| [pos-api-design](../.agents/skills/pos-api-design/SKILL.md) | REST, error/list envelope, session/CSRF, scoped IDs, idempotency |
| [pos-frontend-design](../.agents/skills/pos-frontend-design/SKILL.md) | Thai mobile UX, semantic tokens และ component reuse โดยไม่ทำ dashboard ซ้ำสูตร |
| [pos-git-workflow](../.agents/skills/pos-git-workflow/SKILL.md) | branch/Conventional Commits/PR และการผูก milestone |

ใช้ [project-engineering.md](project-engineering.md) เป็น shared state/conventions; ไม่คัดลอก domain schema ทั้งชุดเข้าทุก skill
token สีและชื่อ components เป็น default/แผน ยังไม่ได้ลงใน UI; code style ใหม่เป็น convention ไม่ได้เพิ่ม lint rules
ไม่มี skill ใดอนุมัติ deploy/migrate remote/push/merge โดยอัตโนมัติ

## Review react-vite-best-practices

ต้นทางใน skills-lock.json คือ `asyrafhussin/agent-skills` v2.0.0 (MIT)
พบสำเนาที่ `.agents/skills` และ `.claude/skills` มี entrypoint เหมือนกันก่อนแก้
ปรับเป็น local adaptation `2.0.0-pos-lite.1` โดยรักษา author/license/ชื่อ skill เดิม
`.agents/skills` เป็น canonical; ปัจจุบัน `.claude/skills` มีสำเนาครบทั้ง 10 skills และต้องคงเนื้อหาให้ตรงกัน
ไม่แก้ computedHash ใน skills-lock.json ให้เป็นค่าที่เดา: ใช้เป็น provenance upstream
local patches ใน working tree อาจถูก installer เขียนทับ ต้องตรวจ diff อีกครั้งเมื่อ update/reinstall

| ระดับ | ปัญหาที่พบใน entry/rule เดิม | การแก้ใน skill |
|---|---|---|
| P1 | dev-hmr-config สอน localStorage token + Bearer ขัดกับ HttpOnly session/CSRF | เปลี่ยนเป็น cookie/CSRF และห้าม auto-submit เงินหลัง HMR |
| P1 | build-sourcemaps สื่อว่า hidden ไม่เปิดเผย source ทั้งที่ยังสร้างไฟล์ .map | ระบุ exclusion/deny-serving/private upload และให้ false เป็นค่าที่ยอมรับได้ |
| P2 | split-dynamic-imports สร้าง lazy component ใน render จนอาจ remount/reset state | ย้าย declaration ไป module scope |
| P2 | dev-hmr-config ใส่ react({fastRefresh:true}) และบังคับ ws/polling | ใช้ react() defaults และตรวจ installed types; config พิเศษเมื่อ diagnose แล้ว |
| P2 | build-minification วาง esbuild ใต้ build และสั่ง strip/mangle แบบเหมารวม | ลบ snippet ผิดและให้ตรวจ Vite8/Oxc types; ไม่ลบ logs/DTO properties โดยเดา |
| P2 | manual chunks/prebundling ถูกยกเป็นข้อบังคับ พร้อมตัวอย่าง deps ที่ยังไม่มี | วัดก่อนแก้ ใช้ bundler options ตาม version ไม่เพิ่ม dependency จากตัวอย่าง |
| P2 | esnext ถูกแนะนำโดยไม่รู้ Android/browser จริง และสับสน transpile กับ polyfill | รักษา default ก่อน เลือก target จาก supported devices |
| P2 | tree-shaking ตั้งค่าตัด side effects กว้างเกินไป | ห้ามตัด init/CSS/getter behavior โดยไม่ตรวจผล |
| P2 | env-modes priority ไม่รวม existing process env; env naming ถูกสื่อว่าเพียงพอ | แยก mode/NODE_ENV, public build/server runtime และตรวจเส้นทางรั่วผ่าน plugins/define |
| P3 | entry config ใช้ __dirname ใน ESM และตั้งเว็บ port3000 ชน Express | ตัด generic full-config template ให้ inspect current config/ports ก่อน |
| P3 | performance percentages ถูกระบุเหมือนเป็นผลจริงของทุกแอป | ระบุเป็น upstream estimates ต้องมี baseline/before-after ของโปรเจกต์ |
| P3 | โหลด compiled reference ใหญ่ทั้งเล่มซ้ำกับ rules | entrypoint สั้น อ่านเฉพาะ rule ที่เกี่ยวข้อง; compiled สร้างใหม่จาก source ปัจจุบัน |

เพิ่ม project constraints ครอบคลุม Thai glyphs, SVG img ที่ใช้ได้, PowerShell commands,
safe static caching และการไม่ cache private API/session; ไม่เพิ่ม SVGR/router/analyzer เพียงเพราะ example ใช้
rules ที่ยังคง upstream examples มีคำเตือนให้อ่าน project constraints และไม่ใช้เป็น mandatory configuration
นี่คือ review คำแนะนำ ไม่ใช่หลักฐานว่า examples ทุกตัว compile หรือแอปได้ performance ดีขึ้นแล้ว

## แหล่งตรวจข้อเท็จจริง

ตรวจ installed Vite8.3.5 และ plugin-react types ใน apps/web/node_modules ร่วมกับ official docs:
[Vite build](https://vite.dev/config/build-options), [server options](https://vite.dev/config/server-options),
[env/mode](https://vite.dev/guide/env-and-mode), [React lazy](https://react.dev/reference/react/lazy)
ไม่ได้อ้างค่าประหยัด bundle จาก upstream เป็นผล benchmark ของ POS-Lite

## Validation

ใช้ initializer/generator/quick_validate ของ skill-creator; PyYAML เป็น dependency ชั่วคราวของ validator
ไม่เพิ่มเข้า package.json/lockfile ของแอป และรัน Python UTF-8 บน Windows
ตรวจ local links/frontmatter/UI metadata ทั้งชุด และเทียบ skill เดิมสองสำเนา
ผลตรวจจริง:

- quick_validate ผ่าน 10 skills (9 ใหม่ + React/Vite เดิมที่ปรับ)
- ลิงก์ local ใน skills 74 รายการ, UI metadata และ default automatic invocation ตรวจผ่าน
- skill React/Vite สองสำเนามี 29 ไฟล์ตรงกันทุก byte หลังปรับ
- docs/check-design.py ผ่าน: 6 เอกสารบังคับ, 45 local links, 6 core paths, 186 refs และเลขตัวอย่าง A–P
- independent forward-test แบบ read-only ใช้โจทย์ 3 แบบ: สร้างหลักฐาน E/F/N/O,
  ประเมินพร้อม deploy staging จาก scaffold, และเพิ่ม required column บนข้อมูลธุรกรรมเดิม
  ผลเลือก unit/real-PostgreSQL integration ได้ถูก ไม่อ้าง test placeholder ว่าผ่าน,
  พบ API build/CI/env-validation gaps ก่อน deploy และไม่แต่ง migration commands หรือ apply remote
- แก้ข้อสังเกตจาก forward-test ให้ชัดว่า .env.example ยังไม่มี เป็นคำแนะนำเมื่อสร้างในอนาคต

ไม่พบ material issues ใน behavioral pass ของ 3 skills ที่ประเมิน แต่ไม่ได้ทดสอบความสามารถครบทุกโจทย์ของทุก skill
ไม่ได้รัน application/DB/Android tests หรือ deployment และไม่ได้ benchmark React/Vite ในงานนี้

## อัปเดตตามระบบจริง — 25 ตุลาคม 2026

เจ้าของให้ดูแล skills เมื่อเปลี่ยนโปรเจกต์ จึงเพิ่มขั้นตอน maintenance ใน root AGENTS.md
แก้ข้อความก่อนF1ที่ล้าสมัยใน test-validation, architecture, api-design, db-migrations, frontend-design,
cicd และ React/Vite project-constraints reference: runner/schema/migration/build/auth/POSมีจริงแล้ว
CI/production topology/Tailwind/React Testing Libraryยังไม่มี ไม่เปลี่ยนสิ่งเหล่านี้เป็นคำอ้างว่าimplementแล้ว

เพิ่มรูปแบบที่ต้องใช้ต่อ: caller-owned postToDay transaction, day/account lock order, preview read-only snapshot,
expected identity headers, revision/recompute/NO_CHANGE, signed/omitted buckets และD3 allocation aggregate gap
สถานะฟีเจอร์และผลรันอยู่ใน project docs; skillsไม่คัดลอกchangelogหรือจำนวนtestsที่เปลี่ยนทุกครั้ง
อัปเดตcanonical `.agents/skills` และสำเนาเดิม `.claude/skills` โดยไม่สร้างskill routerอีกชุด

ใช้ skill-creator quick_validate ผ่าน10 skills; canonical/mirror48ไฟล์ตรงกันทุกbyte และลิงก์local74รายการผ่าน
validatorต้องPyYAMLซึ่งติดตั้งชั่วคราวใต้ `.tmp/skill-validator` ที่ignoreแล้ว ไม่แก้app dependencies/lockfile
ไม่ได้ทำindependent behavioral forward-testซ้ำสำหรับการปรับคำแนะนำชุดนี้

D1c อัปเดต frontend-design/test-validation พร้อมสำเนาเดิม: parent WorkState สำหรับล็อกข้ามflow,
daily storage cleanup, คง component เมื่อซ่อนแท็บ, preview/pending consistency และแยกนับmutation POSTจากpreview/auth
คงผลรัน/สถานะเฉพาะรอบใน daily-ui-validation.md ไม่คัดลอกจำนวนtestsหรือประวัติฟีเจอร์เข้าskills

D2a อัปเดต api-design/db-migrations และสำเนา: business lookup ไม่ใช้ store สมมติ,
MANAGER ต้องมี assignment/store active, cursor ผูกธุรกิจ, normalize ก่อน hash/store และกันชื่อซ้ำใน PostgreSQL
พร้อมตรวจ rollback source/audit/key โดยไม่สร้าง money movement หรือเปิดวัน
quick_validate ผ่าน10 skills; สำเนา48ไฟล์ตรงกันและลิงก์74รายการผ่าน; ไม่มี independent behavioral forward-test เพิ่ม

D2b อัปเดต architecture/api-design/db-migrations/test-validation พร้อมสำเนาเดิม:
เงินออกใช้บัญชี identity เดียวทั้งสองร้านและ lock ก่อนอ่าน balance, payment ใช้ยอดหนี้จาก server,
caller-owned transaction, recognition/payment dates แยกกัน และ creation replay เป็น snapshot เดิม
เพิ่มข้อควรระวัง PostgreSQL row lock ต้องมี UPDATE บางคอลัมน์: ใช้ UPDATE(id) คู่ immutable trigger เท่านั้น
และตรวจ transitive lock graph เพราะผู้รอตัวที่สองอาจรอคนแรก ไม่ได้รอ blocker โดยตรง
บันทึก D3 active-payment/reversal gap และ fixture historical day ไม่ถือว่าผ่าน D4
quick_validate ผ่าน10skills, canonical/mirror48ไฟล์ตรงทุกbyte, ลิงก์74รายการผ่าน; ไม่มี independent skill forward-test เพิ่ม

## D2c1 — 26 ตุลาคม 2026

ปรับ api-design/db-migrations/test-validation และสำเนาเดิม: OWNER flows แยกจาก sales/operating expenses,
signed owner slot ต้องตรง kind/amount/actor, ใช้ PL/pgSQL IF ก่อนอ่าน NEW fields ของแต่ละตารางใน shared trigger
และทดสอบ debit source ใหม่แข่งกับ module เดิม ไม่ทดสอบแค่แข่งกับตัวเอง
quick_validate ผ่าน10skills; canonical/mirror48ไฟล์ตรงทุกbyteและลิงก์74รายการผ่าน
ไม่ได้ทำ independent skill forward-test; ผล feature/DB tests อยู่ใน owner-transactions-validation.md

D2c2 อัปเดต architecture/api-design/db-migrations/test-validation พร้อมสำเนาเดิม: prelock unionก่อนเปิดหลายวัน,
ExpensesService.postToDayใช้ caller transaction/revision, fee categoryเป็นOWNER configuration,
typed transfer legs/null checks/deferred fee matching และทดสอบopposite/auto-open/late incoming-leg failures
quick_validateผ่าน10skills, canonical/mirror48ไฟล์ตรงทุกbyteและlocal links74รายการผ่าน; ไม่คัดลอกchangelogลงSKILL.md
ไม่ได้ทำ independent skill forward-test; feature/DB evidenceอยู่ใน transfers-validation.md
