# แผน implementation ที่ตรวจรับได้

Phase 0 เสร็จในระดับเอกสาร; P1–P5 ยืนยันแล้ว; ผู้ใช้ยืนยัน P4/P5 ใน session วันที่ 22 ตุลาคม 2026
ตอนส่งมอบ Phase 0 ครั้งแรกยังไม่มี Git/lockfile ปัจจุบันมี Git และ npm workspace starter เพิ่มแล้ว
F1 implement แล้วและมีผลตรวจใน [foundation-validation.md](foundation-validation.md)
F2 implement และผ่าน local validation แล้ว ดู [access-validation.md](access-validation.md)
S1a API เมนู/ราคา/version/audit/idempotency implement แล้ว ดู [catalog-validation.md](catalog-validation.md)
S1b บัญชี/ledger opening implement แล้ว ดู [accounts-validation.md](accounts-validation.md)
S1c เปิดวันแรก/day opening snapshots implement แล้ว ดู [business-days-validation.md](business-days-validation.md)
S2 API ธุรกรรม POS/ประวัติ implement แล้ว ดู [sales-validation.md](sales-validation.md)
S3 หน้าขาย implement และตรวจ browser fixture แล้ว ดู [pos-validation.md](pos-validation.md)
ยังรอตรวจ Android เครื่องจริงก่อนปิด M2
D1a API เพิ่มยอด implement แล้ว ดู [supplemental-sales-validation.md](supplemental-sales-validation.md)
D1b preview/confirm กระทบยอด implement แล้ว ดู [reconciliation-validation.md](reconciliation-validation.md)
D1c หน้ากรอกสอง flow implement และตรวจ browser fixture แล้ว ดู [daily-ui-validation.md](daily-ui-validation.md)
D2a API หมวดรายจ่าย implement แล้ว ดู [expense-categories-validation.md](expense-categories-validation.md)
D2b API รายจ่ายค้างจ่าย/จ่ายทันที/ชำระเต็ม implement แล้ว ดู [expenses-validation.md](expenses-validation.md)
งานพัฒนาถัดไป D2c เงินเจ้าของ/โอนและ fee จากนั้น UI เงินออก; ยังรอ Android จริงและตรวจหลังคืนเงินเมื่อมี D3
วันถัดไปยัง fail closed จนมีหลักฐานปิดวัน/settlement ใน D4
ติดตามสถานะและเกณฑ์ปิดช่วงงานใน [milestones.md](milestones.md)

| ก้อน | งาน/ขอบเขต | เกณฑ์ตรวจรับ |
|---|---|---|
| F1 Foundation skeleton | npm workspaces web/api/shared/validation, pin dependencies, lockfile, Express health + React Thai shell, config validation, Pino/error envelope, Compose PostgreSQL | npm ci, dev, build, typecheck, lint, test ผ่าน; /api/v1/health ไม่เผย secrets; webเรียกsame-origin APIได้; ไม่มี mock financial dashboard |
| F2 Database/access | migrations identity/stores/memberships/sessions, secure auth+CSRF+rate limit, seed env-driven | migrate DBว่าง/upgradefixture; login/logout/revoke/expired; M isolation; direct composite FK; seedไม่ฝังpassword; OpenAPI auth/store tests |
| S1 Catalog/accounts/day | products/version, account mapping/opening, days/opening snapshot, ledger foundations | cashหนึ่งร้าน/bankแชร์; no double opening; priceaudit; daydate Bangkok; P4/P5ยืนยันก่อนล็อกกฎ |
| S2 POS transaction | sale/item/payment/ledger/audit/key, split/tender/change/discount, counters, history | A,E,M,N,P และconstraint tests; concurrent idempotency; ไม่มีpartial commit; keyหลังtimeoutrefเดิม |
| S3 POS Android | เลือกเมนู/ชำระ/ยืนยัน/ประวัติ, error states, bound draft | Android360pxใช้งานจริง; PRICE_CHANGED; networktimeoutretry; sessionเปลี่ยนผู้ใช้ไม่ส่งdraftเอง |
| D1 เพิ่มยอด/กระทบยอด | supplemental + previews/revision/confirm + UIแยกคำ | B,C,D,F,G; zero/no-change; signed net target; no account guessing |
| D2 เงินออก/เงินเจ้าของ/โอน | expense unpaid/full payment, owner, atomic transfer+fee, reporting primitives | H,I,J, rollback feeทั้งชุด, concurrent no-overdraft, shared bank aggregateครั้งเดียว |
| D3 Refund/reversal | full refund, allocations/payouts, generic full reversal allowlist, UI reason | O, closed-original/current-open, refund race/overrefund, reverse fee/payment cycles; permissions OWNER |
| D4 Closing | cash previews/snapshots/revision, settle, reopen/history | K,L; close/sale race; settlementonce; later day gate; no silent cash correction |
| R1 Reports/usability | store/business reports/history/audit, real dataเท่านั้น, Androidทดลองกับแม่ | ยอดจากSQLตรงledger; expense≠cash paid; no net-profit claim; staff scope; workflowจบครบ |
| R2 Operations | deployment proposal/env/cookie/proxy config, backup/restore scripts/runbook | restore DBแยกจริง; security/Android checklist evidence; ownerอนุมัติdeploymentเมื่อผลตรวจครบ |

Foundation ก้อนแรกคือ F1 ไม่ใส่ business implementation ทั้งระบบในก้อนเดียว
F1 ไม่จำเป็นต้องรอ P4/P5; ไม่สร้าง schema เงินก่อน domain decisions พร้อม
แต่ละก้อนเพิ่ม machine-readable OpenAPI และ contract tests ให้ครบ endpoint ที่ส่งมอบ
ทุก migration มี constraint tests และแผน rollback/recovery ที่ไม่ลบประวัติเงิน

## Definition of done ต่อก้อน

diffและเอกสารตรงกัน, typecheck/lint/buildและtestsที่สัมพันธ์ผ่าน, หลักฐานตาม acceptance-scenarios.md,
ไม่มีsecret/ข้อมูลจริงในfixtures, security backendตรวจสิทธิ์, ไม่อ้างสิ่งที่ยังไม่ทดสอบ
เมื่อมีGitให้เก็บcommitที่reviewได้; lockfileใช้npmเท่านั้น; ไม่deployจากแค่buildผ่าน
production readiness เป็นgateต่างหาก ต้องครบ online workflow, concurrency, restore และAndroidจริง

## สิ่งที่ไม่ทำตอนนี้และ migration path

inventory/costing/production เริ่ม Phase5 หลัง MVPเชื่อถือได้ เพิ่ม tablesเฉพาะเมื่อมีuse caseที่ยืนยัน
partial refunds ต้องเปลี่ยน unique(sale_id) เป็น cumulative allocation guards
พร้อมitem discount allocation; ไม่ลบfull refund history
credit/partial expense payments เปลี่ยน active-one-payment constraint เป็นยอดสะสม locked
PWA/offline เพิ่ม identity-bound queue+conflict policy ไม่ใช้cacheเป็นหลักฐานว่าcommit
