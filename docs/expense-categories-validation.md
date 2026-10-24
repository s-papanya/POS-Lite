# D2a — หมวดรายจ่าย

ตรวจ local วันที่ 25 ตุลาคม 2026; เป็นข้อมูลตั้งต้นของ D2 ยังไม่ใช่การรับรู้รายจ่ายหรือจ่ายเงินจริง

## ขอบเขตที่ส่งมอบ

- GET `/api/v1/expense-categories`: OWNER หรือ MANAGER ที่มี assignment และร้าน active ในธุรกิจของ session อ่านหมวด active ได้; STAFF อ่านไม่ได้
- หน้าแบ่งด้วย `(name,id)`; limit 1–100/default30; cursor ผูก business/name/id และปฏิเสธ cursor ต่างธุรกิจ
- POST path เดียวกัน: OWNER เท่านั้น; strict `{name}` ตัด whitespace หัวท้ายและ normalize NFC ก่อน hash/store; ชื่อ 1–120 ไม่มี control characters
- เก็บตัวพิมพ์สำหรับแสดงผล; PostgreSQL unique `(business_id,lower(name))` กันชื่อซ้ำ; ตอบ409 `CATEGORY_NAME_EXISTS`
- Cookie/Origin/CSRF/UUID key ตามระบบเดิม; ตรวจสิทธิ์ปัจจุบันก่อน key และหลังรอ claim ก่อน replay
- category + audit `EXPENSE_CATEGORY_CREATED` ที่ระดับ business (`store_id=NULL`) + idempotency response commit ใน transaction เดียว
- ไม่เปิดวัน ไม่เพิ่ม revision ไม่สร้าง movement; ไม่มี PATCH/archive endpoint หรือหน้าจอหมวดในก้อนนี้

## Schema และการอัปเกรด

Migration `0007_expense_categories.sql` เพิ่มตารางและ indexes ใหม่เท่านั้น ไม่แก้ประวัติเดิม;
composite actor FK กันผู้สร้างข้ามธุรกิจ และ `(business_id,id)` เตรียมอ้างอิงแบบ scoped สำหรับ expenses
runtime role มี SELECT/INSERT; UPDATE/DELETE ปฏิเสธ ไม่มี default categories ที่เดาชื่อให้ร้าน

ใช้ runner เดิมที่ตรวจ local identity/checksums/advisory lock และจำกัด lock5s/statement30s
ตารางใหม่ว่าง ไม่มี backfill; FK/index DDL มี lock บนตารางอ้างอิงระยะสั้น จึงยังต้องตรวจขนาด/เวลารันก่อน remote rollout
หาก deployment ล้มเหลวให้ตรวจ migration journal และ forward repair; ไม่ drop ตารางที่อาจมีข้อมูลใหม่
ฐานข้อมูลทดสอบเป็น DB disposable ที่ harness สร้างเอง; local development ใช้ CLI ตรวจ identity แยกจาก runtime role
`npm run db:migrate` บน development local ผ่านแล้ว รวม runtime grants; ไม่มี remote migration/push/deploy

## หลักฐานที่รัน

- ทดสอบสัญญาใหม่ก่อน implementation: 2 tests ล้มเหลวเพราะ schema ยังไม่มี แล้วผ่านหลังเพิ่ม implementation
- `npm test`: 38 tests/13 files ผ่าน รวม trim/NFC, invalid names/authority fields และ list envelope
- `npm run test:db`: ผ่านบน PostgreSQL local จริง ผ่าน runtime role/HTTP ไม่ mock DB
  เพิ่ม 6 กลุ่มตรวจ category: audit/replay/no money effects, constraints/failed-key rollback,
  OWNER/MANAGER/STAFF/ธุรกิจแยก/pagination, injected audit failure+retry, parallel same-key/normalized-name และ auth/Origin/CSRF/key
- อัปเกรด fixture เดิมที่มี POS/SUPPLEMENTAL พร้อม identity/source/ledger/audit/key ไป latest 8 migrations และรันซ้ำ;
  rows เดิมไม่เปลี่ยน ยอด ledger ยังคง `15545` สตางค์
- `npm run typecheck`, `npm run lint`, `npm run build`: ผ่าน
- OpenAPI generator เพิ่ม category GET/POST ที่ `x-implemented=true`; expense/payment/owner/transfer ยังไม่อ้างว่าพัฒนาแล้ว

การทดสอบ parallel ตรวจ unique/idempotency responses และ source/audit counts; ไม่ใช่หลักฐาน no-overdraft หรือ debit ledger
ยังไม่ปิด acceptance H/I/J หรือ milestone M4 ต้องต่อ D2b รับรู้รายจ่ายค้างจ่าย/ชำระเต็มและทดสอบเงินออกจริง
ไม่ได้ตรวจ Android เพิ่มในก้อน backend นี้ และยังไม่มีหลักฐาน staging/production/backup restore
