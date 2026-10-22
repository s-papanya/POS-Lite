# S1c — วันทำการและฐานเงินสดเปิดวัน

ตรวจใน development local วันที่ 23 ตุลาคม 2026 ต่อจาก S1b; ขั้นถัดไป S2 ธุรกรรม POS
บันทึกนี้เป็นหลักฐานตอนส่ง S1c; ต่อมา S2 เพิ่ม auto-create+sale และ day-attributed ledger แล้ว ดู [sales-validation.md](sales-validation.md)

## พฤติกรรมที่เพิ่ม

- POST `/api/v1/stores/:storeId/business-days` สำหรับ OWNER/MANAGER ที่เข้าร้านได้ รับ `{businessDate:"YYYY-MM-DD"}`
  พร้อม cookie, Origin, CSRF และ UUID Idempotency-Key; วันที่ต้องเป็นวันนี้ตาม Asia/Bangkok
- ใหม่ตอบ201; วันเดิม OPEN ตอบ200โดยไม่สร้าง snapshot/audit เพิ่ม; keyเดิมได้ status/bodyเดิม
  พร้อมตรวจสิทธิ์ปัจจุบัน; keyเดิมเปลี่ยน payload ตอบ409 IDEMPOTENCY_CONFLICT
- ทุกบัญชี active ที่ผูกร้านต้องมี initial opening ถึงเวลาที่เปิดวัน; ไม่มีบัญชีหรือยอดตั้งต้นไม่ครบตอบ409 INITIAL_BALANCES_REQUIRED
  BANK-only เปิดได้โดยไม่มี cash snapshot; BANKร่วมไม่ถูกนำยอดทั้งบัญชีมาปนเงินสดร้าน
- เงินเปิดวันมาจาก SUM ledger ของ CASH เท่านั้น เป็น money string; revision เป็น BIGINT string
  การเปิดวันสร้าง day/snapshots/audit/key ใน transaction เดียว ไม่มี money movement เพิ่ม
- GET `/api/v1/stores/:storeId/business-days/:date` ให้ OWNER/MANAGER เห็น snapshot;
  STAFF เห็น id/businessDate/state/revision โดยไม่มี field openingSnapshots; ต่างร้าน/ธุรกิจ404
- CLOSED ตอบ409 DAY_CLOSED สำหรับ keyใหม่; original replay ไม่เปลี่ยนสถานะวัน

ยังไม่มีหลักฐานปิดวันและ settlement ใน D4 จึงปฏิเสธการเปิดวันใหม่ถ้ามีวันอื่นอยู่ด้วย409 PREVIOUS_DAY_UNSETTLED
รวมถึงกรณีมีแค่ state CLOSED; ไม่อนุมานว่าเคลียร์เงินแล้วจากสถานะอย่างเดียว

## Locks และความถูกต้องของข้อมูล

เพิ่ม migration `0003_business_days.sql` แบบ additive สองตาราง ไม่แก้0000–0002 และไม่ backfill เงินเดิม
composite day/store/account/actor FKs ป้องกัน scope ผิด; unique วันต่อร้านและ partial unique OPEN ต่อร้าน;
วันต้องตรง opened_at ตาม Bangkok และ revision/closing_version ไม่ติดลบ

การสร้างวันใช้ transaction advisory gate ของร้านก่อนล็อก day/account rows; การสร้างบัญชี เปิดยอดตั้งต้น
และเปลี่ยน active ใช้ gate ของทุกร้านที่ mapping เรียง UUID ก่อนล็อก account เพื่อป้องกัน snapshot แข่งกับ configuration
มีวัน OPEN แล้วตอบ409 ACCOUNT_CONFIGURATION_LOCKED; เปลี่ยนชื่อบัญชีได้; owner ถูกลดสิทธิ์ระหว่างรอ lock แล้ว commit บัญชีไม่ได้
วันถูกตรวจซ้ำหลังรอ account locks เผื่อข้ามเที่ยงคืน

Deferred triggers ตรวจ cash snapshot ครบ ไม่รับ BANK/ยอดผิด/เวลาไม่ตรง/actor ไม่ตรง และตรวจ initial balances ก่อน commit
runtime ไม่มี UPDATE/DELETE snapshot หรือสิทธิ์เปลี่ยน state/closing_version; ให้ UPDATE revision เพื่อ lock day row เท่านั้น
ยอดตั้งต้นและ ledger เดิมยัง immutable ตาม S1b

## Migration และ recovery

ใช้ `npm run db:migrate` ผ่าน local guard ตรวจ development/loopback5433/database/admin identity แล้ว;
runner serialize migration, ตรวจ checksum และมี lock_timeout5s/statement_timeout30s
เพิ่มตารางใหม่และ FK/index เท่านั้น แต่ DDL ยังต้องได้ lock ของตารางที่อ้างอิง จึงไม่รับรองการ apply ระหว่าง production traffic

หาก apply timeout ให้ตรวจ journal/schema ก่อน retry; ห้ามลบตารางหรือ snapshot ที่มีข้อมูลเพื่อ rollback
หากต้องหยุด feature ให้หยุด writer แล้ว forward-fix โดยเก็บ ledger/day/audit/key ไว้
ห้ามสลับกลับ writer S1b ระหว่างมีวัน OPEN เพราะรุ่นนั้นยังไม่รู้ configuration gate
ไม่ได้ทำ remote migration, backup restore หรือ deployment; production ต้องผ่าน R2 และอนุมัติ target แยก

## หลักฐานที่รัน

PostgreSQL17.11 จริงใน disposable DB ที่ตรวจ ownership ก่อน cleanup:

- ติดตั้ง0000–0002 พร้อม users/products/audit/key และ account/mapping/opening/movement fixtures ก่อน upgrade0003
  ตรวจทุกแถวและ ledger SUM12345สตางค์ยังเหมือนเดิม; migrateซ้ำ/checksum guard และ seed regressions ผ่าน
- Bangkok boundary16:59:59/17:00:00UTC; invalid/past/future dates, body/query เกินสัญญา และ session/Origin/CSRF/key guards
- เปิดพร้อมกันทั้ง keyเดียวและต่างkey เหลือวัน/snapshot/auditชุดเดียว ไม่มี ledger เพิ่ม; replay หลังเปลี่ยน CLOSED ไม่ reopen
- CASH50000/BANK9000000000000แยกกัน, zero cash, BANK-only, missing initial opening และ revision9007199254740993ไม่เสีย precision
- STAFF/manager/foreign-store scopes, runtime privileges, missing/wrong cash/BANK snapshot, composite FK, unique snapshot และ unique OPEN
- ฉีด error ที่ audit แล้ว day/snapshot/key rollback; retry keyเดิมสำเร็จ
- ใช้คนละ connection ถือ advisory lock และตรวจ pg_locks/pg_blocking_pids เป็น barrier ทั้ง day-first/config-first
  รวม owner-revocation ระหว่างรอ; ไม่ใช้ sleep เพื่อสรุป race

`npm test`:24 tests/6ไฟล์; `npm run test:db`:1 workflow/27กลุ่มตรวจ
`npm run typecheck`, `npm run lint`, `npm run build` และ Python structural design checks ผ่าน
OpenAPI22paths/69schemas; response tests ใช้ shared Zod; ยังไม่มี full OpenAPI validator

ครอบคลุมส่วนพื้นฐานของ E2/M/N และ prerequisite K/L เท่านั้น ไม่อ้าง acceptance A–P ของ POS/closing ว่าผ่านครบ
ยังไม่ทำ auto-create วันพร้อม sale, debit sources, ปิดวัน/reopen/settlement, หน้าจอวันทำการ หรือ Android จริง
เมื่อ S2 เพิ่ม posting ต้องขยาย ledger source/day attribution และ snapshot commit guard ให้รองรับ opening+sale ใน transaction เดียว
ก่อนเปิดใช้ auto-create; S1c ปัจจุบันมีเฉพาะ initial-opening movements
