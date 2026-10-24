# D1a API เพิ่มยอดที่ยังไม่ได้บันทึก — 25 ตุลาคม 2026

`POST /api/v1/stores/:storeId/supplemental-sales` สำหรับ OWNER/MANAGER
เพิ่มยอดขายเป็นจำนวนเงินบวกพร้อมเหตุผลและบัญชีรับเงินที่ระบุเอง ไม่มีสินค้า/ส่วนลด
ยังไม่ใช่การตั้งยอดขายรวมทั้งวัน และยังไม่มีหน้ากรอกเพิ่มยอด
ใช้ SalesService transaction เดียวกับ POS: day gate → accounts → counter → source/payment/ledger/audit/key
source kind SUPPLEMENTAL, reference SUP-YYYYMMDD-NNNNNN, revision เพิ่มครั้งเดียว
history/detail อ่านชนิดใหม่ได้และแสดงคำไทย/เหตุผลแทนจำนวนสินค้า0ชิ้น

## หลักฐาน

- เริ่มจาก working tree สะอาดที่ `8b41dd6`
- contract regression เริ่มแดงเพราะ schema ยังไม่มี แล้วผ่านหลังเพิ่ม strict schema
- `npm test`: 31 tests / 10 files ผ่าน รวมเงิน/identity recovery/POS เดิม,
  supplemental request และ server-rendered receipt ที่แยกประเภท/เหตุผลและไม่แสดงส่วนลด
- `npm run test:db`: 1 workflow ผ่านบน PostgreSQL local จริง เพิ่ม7 check groups สำหรับ D1a
  fixture แยกธุรกิจ/ร้าน, HTTP Supertest ใช้ runtime role และ cookie/CSRF จริง
- ทดสอบ split100.00: cash40.00 รับ100.00 ทอน60.00 + transfer60.00
  ledger เพิ่มเฉพาะ40.00/60.00; auto-open snapshot0; ไม่มี item; audit เก็บเหตุผล
- same-key replay หลัง response หาย/พร้อมกันได้ ID/reference/body เดิม; เปลี่ยน path ไป POS หรือเปลี่ยนเหตุผล409
- malformed/zero/unknown authority fields ปฏิเสธ; sumผิด/เงินสดไม่พอ/channelผิด/accountนอกร้าน/future/CSRFผิดไม่มี posting
- STAFF403, MANAGER201, role ลดเป็น STAFF แล้ว replay403, ธุรกิจอื่น404
- inject audit failure500 ตรวจทั้งตาราง: source/items/payments/movements/revision/counter/audit/key/openings ไม่เปลี่ยน; key เดิมลองใหม่201
- direct SQL ปฏิเสธ item บน supplemental, source ไม่มี payment และ reason หาย; POS ยังต้องมี item
- สอง connections ใช้ held day lock + pg_blocking_pids ยืนยันคำขอรอ close; close commit ก่อนแล้วเพิ่มยอด409
  committed key ยัง replay ได้เมื่อ CLOSED โดยไม่สร้างรายการใหม่
- `npm run typecheck`, `npm run lint`, `npm run build` ผ่าน
- `docs/build-core-contract.py` + `docs/check-design.py` ผ่าน24 paths/78 schemas; ไม่ใช่ full OpenAPI validation

รอบแรก integration ล้มจาก UUID parameter ใน fixture ที่ใช้เป็น text พร้อมกัน แก้ explicit uuid cast แล้วรันใหม่ผ่าน
ไม่มีการลด assertions หรือ mock DB locks เพื่อให้ผ่าน
ตรวจ diff ด้านเงิน/สิทธิ์/atomicity/migration ด้วย pos-code-review; ไม่พบ finding เพิ่มหลังแก้ fixture

## Migration 0005

เพิ่ม nullable reason ให้บิลเก่าเป็น NULL ตามความหมายเดิม ไม่ backfill เหตุผลสมมติ
ขยาย kind/counter checks และแทน deferred validate_sale_posting โดยคง day/account/payment/ledger checks เดิม
POS ต้องมี1–100items/grossตรง; SUPPLEMENTAL ต้องไม่มีitems/discount และ reason1–1000ตัวอักษร
ไม่แก้ migration0000–0004 และไม่เพิ่มสิทธิ์ UPDATE/DELETE แหล่งเงิน

ทดสอบเริ่ม disposable DB ว่าง migrate0000–0004 แล้วสร้าง POS/เงินทอน/snapshot/counter/audit/idempotency fixture
ก่อน migrate0005 ซ้ำสองครั้ง: IDs/references/item snapshots/ledger/sources/counters และ records เดิมตรงกัน
ยอด opening123.45 + sale12.00 ยัง135.45; POS เก่ามี reasonNULL
`npm run db:migrate` บน development local ผ่านด้วย CLI ที่ตรวจ host/DB/user; ไม่ reset/seed ทับข้อมูล

DDL ต้อง lock sales/document_counters ชั่วคราวและ validate CHECKs; runner มี lock_timeout5s/statement_timeout30s
remote ต้องประเมินปริมาณข้อมูล/ช่วงหยุดเขียนและใช้แผนที่อนุมัติแยกต่างหาก
API เก่าขาย POS ต่อบน schema ใหม่ได้ แต่เว็บเก่าที่รับเฉพาะ POS อาจอ่าน history ที่มี supplemental ไม่ได้
ต้องอัปเดต web/API ให้รองรับชนิดใหม่ก่อนเปิดใช้; หากมี supplemental แล้วห้ามย้อน constraints ไปPOSอย่างเดียว
recovery ใช้ forward repair/rollback application ที่รองรับข้อมูลใหม่ ไม่ลบประวัติหรือแก้ checksum

ยังไม่ตรวจ browser/Android ของข้อความประวัติใหม่หรือ backup/restore rehearsal และไม่ deploy/push
M2 ยังรอ Android; M3 ยังไม่ครบ B/C/D/F/G จนมี D1b กระทบยอดและ D1c UI
วันถัดไปยัง fail closed รอ D4 closing/settlement; ไม่พร้อมขายจริง
