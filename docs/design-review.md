# ตรวจความสอดคล้อง Phase 0

วันที่ 22 ตุลาคม 2026 — ตรวจเอกสาร ไม่ใช่ code/security audit ของ implementation
repository เริ่มว่าง ไม่พบ AGENTS.md ใน workspace หรือ E:\ และไม่มี .git
อ่านคำขอต้นฉบับครบ โดยอ่านซ้ำส่วนกลางที่ output ครั้งแรกถูกตัด
ไม่มีโค้ดเดิมถูกเขียนทับ; ไม่ติดตั้ง dependency ของแอปหรือทำ deployment

## Traceability

| Requirement ต้นฉบับ | กฎ/ข้อมูล | API/UX | Acceptance/งาน |
|---|---|---|---|
| 1–5 สองร้าน/สิทธิ์/MVP | requirements, memberships/composite scopes | permission matrix/store selector | A,M; F1/F2 |
| 6 POS/เพิ่มยอด/ยอดจริง | sales/payment/reconciliation/snapshots | sales, supplemental, preview/confirm; แยกคำบนUI | B,C,D,G,P; S1–S3,D1 |
| 7 retry/concurrency | idempotency unique + day/source/account locks | key/hash/revision/error envelope | E,F,N; S2,D1,D4 |
| 8 เงิน/รายจ่าย/เจ้าของ/โอน | source FKs+ledger, expenses/payments, account mapping | expense/owner/transfer/reports | H,I,J; D2 |
| 9 วัน/เงินสด | days/openings/closings/settlements | close preview/confirm/reopen/reason | K,L; D4 |
| 10 คืน/ยกเลิก | refunds/allocations/payouts/reversals | OWNER refund/reversal; current day | O; D3 |
| 11–12 Android/network | identity-bound draft + confirmed-only status | ux-flows Thai states | Android tests; S3,R1 |
| 13 schema | data-model fields/FKs/checks/indexes/deletion/ERD | tenant IDs scoped server-side | direct SQL tests; F2–D4 |
| 14–15 contracts/architecture | monorepo/module/service tx | API inventory + core OpenAPI | contract suite perก้อน; F1 onward |
| 16 security/operations | session/CSRF/hash/rate-limit/restore plan | auth and permissions | F2,R2 |
| 17 อนาคต | migration paths ไม่มีตารางเผื่อทั้งหมด | ไม่มี UI/endpoint อนาคต | Phase5 deferred |
| 18 A–P | acceptance-scenarios.md | key examplesครบ | ทุกกรณีเป็น planned ยังไม่ run |
| 19–20 phase/เอกสาร | implementation-plan + README | เริ่ม F1 | ส่งมอบเอกสารรอบนี้ |

## จุดขัดแย้งที่ตรวจและแก้แล้ว

1. ธนาคารร่วม: account ID เดียว เงินรวมกิจการนับครั้งเดียว; store flow ไม่ใช้ชื่อ balance จริง
2. เงินทอน: ledger net payment เท่านั้น ไม่ลง tendered ทั้งก้อน
3. คืนข้ามวัน: original receiving account ใช้ลด bucket ขาย ส่วน payout account ใช้เงินจริง
4. ยอดสุทธิติดลบ: target/recorded signed; sale/payment source ยังเป็นจำนวนบวก; delta<0ไม่post
5. เงินเปิดวัน: snapshot ไม่ post ซ้ำกับ account opening/ยอดยกมา
6. ส่วนต่างเงินสด: closeเก็บข้อมูล; OWNER settlementแยก; snapshotปิดเดิมไม่เขียนทับ
7. ภายหลังreopen: reverse settlementเดิมexplicit; ห้ามแก้ก่อนวันที่ใหม่เปิดแล้วใน MVP
8. Previewไม่รับประกันconfirm: revision+recomputeภายใต้row lock; raceมีผลลัพธ์ชัดทั้งสองลำดับ
9. ไม่ใช้polymorphic ledger FK: nullable typed FK+exactly-one source+unique posting slots
10. expenseจ่ายแล้วreverse: derive active payment ไม่ใช้ UNIQUE(expense_id)ที่ทำให้จ่ายใหม่ไม่ได้

## การตรวจที่ทำได้รอบนี้

`build-core-contract.py` สร้าง OpenAPI 3.1 core 6 paths / 40 schemas ด้วย Pythonมาตรฐาน
`check-design.py` ตรวจ JSON parse/local refs/path parameters/operation IDs/security headers,
ลิงก์เอกสารในREADME/docs, เอกสารที่บังคับ และscenario A–P
การตรวจเลขตัวอย่างใช้integer arithmeticเทียบexpected1200/variance-50/settled1150,
reconciliation200และ100, split-discount9975สตางค์
ผลรันจริง: PASS — เอกสารบังคับ6ไฟล์, local links12รายการ, core paths6,
local schema references186รายการ, coverage A–P และเลขตัวอย่าง
รันซ้ำด้วย `python docs/build-core-contract.py` แล้ว `python docs/check-design.py`
ในเครื่องนี้ใช้ Python จาก bundled workspace runtime เพราะคำสั่ง `python` ปกติไม่มีruntimeพร้อมใช้
ไม่ได้ใช้ full OpenAPI validator หรือ Mermaid renderer เพราะไม่มีเครื่องมือเหล่านั้นติดตั้ง
ไม่ได้ทดสอบ PostgreSQL, Express, React, auth, concurrency หรือAndroidจริง เพราะยังไม่มีimplementation

## การตัดสินใจและงานคงเหลือ

ผู้ใช้ยืนยัน P1ยอดสุทธิ/คืนวันคืน, P2varianceอนุมัติแยกก่อนวันใหม่, P3แม่เป็นOWNER
P4no-overdraft/วันก่อนต้องปิด/ข้อจำกัดข้ามเที่ยงคืน และ P5ไม่มีภาษี/ค่าบริการ/ส่วนลดแบบง่าย
ยังเป็นข้อเสนอสำหรับยืนยันก่อนimplementationที่เกี่ยวข้อง; RPO/RTOยืนยันก่อนdeploy
OpenAPIเป็นcore subset ไม่อ้างว่าครบทุกendpoint; ต้องเพิ่มschema+contracttestsในแต่ละก้อน
full reversal/settlement เป็นส่วนที่เพิ่มเพื่อทำตามการแก้รายการอย่างมีaudit ไม่ใช่บัญชีเต็มระบบ
ถ้าขอบเขตก้อนD3ใหญ่ ให้แบ่งตามsourceชนิดละก้อนโดยห้ามปล่อยUIแก้ยอดconfirmedโดยตรงแทน

ก้อนถัดไป F1: monorepo+Express/React shell+PostgreSQL Compose+scripts/config/logging/error
ตรวจรับด้วย npm ci/typecheck/lint/test/build, dev web→API health และไม่มีsecretในlog
ยังไม่ต้องรอ P4/P5สำหรับfoundation
