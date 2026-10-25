# D2c1 — เติมทุนและถอนเงินเจ้าของ

พัฒนาและตรวจ local วันที่ 26 ตุลาคม 2026; เป็น backend slice ของ D2 ไม่รวมการโอน/fee/UI หรือการปิด M4

## ขอบเขต

POST `/api/v1/stores/:storeId/owner-transactions` รับ `{businessDate,occurredAt,accountId,kind,amount,note}`
kind เป็น CONTRIBUTION/WITHDRAWAL, amount เป็นสตางค์ string บวกไม่เกิน9000000000000, note ตัดช่องว่าง1–1000
server กำหนด signed delta จาก kind; ไม่รับ delta/actor/business จาก client
response201 `{data:{id,...request}}`; source/movement/audit/key commit พร้อมกัน; revision+1ต่อรายการ

OWNER เท่านั้น; MANAGER/STAFF403 แม้ใช้บัญชีร้านได้; store/business ที่เข้าไม่ได้404
cookie/Origin/CSRF/UUID key และ paired expected identity headers ตามระบบเดิม
ตรวจสิทธิ์ก่อน claim หลังรอ claim และหลัง account lock; replay ใช้สิทธิ์ปัจจุบันและคืน original response แม้วันปิดแล้ว
วันปัจจุบัน Bangkok OPEN, account active/อยู่ mapping/opening พร้อม/cutover ไม่เกิน occurredAt; ห้าม future/ผิดวัน
withdrawal ตรวจ ledger ทั้ง account หลัง lock รวม bank ที่แชร์หลายร้าน; เหลือ0ได้ แต่เงินไม่พอ409 INSUFFICIENT_FUNDS
contribution ไม่สร้าง sale; withdrawal ส่วนตัวไม่สร้าง operating expense

## Schema / migration

`0009_owner_transactions.sql` เพิ่มตารางและ typed source slot เท่านั้น; ไม่แก้ source เก่า
composite FK ผูก business/store/day/account/actor, movement unique(owner_transaction_id), exactly-one-source CHECK
owner slot รับได้สองเครื่องหมาย แต่ deferred guard ตรวจ kind/amount/actor ตรงกับ movementหนึ่งแถว, วัน/เวลา/account/cutover ถูกต้อง
opening/sale credit และ expense debit checks เดิมยังคงอยู่; ใช้ account-lock no-overdraft INSERT guard เดิม ไม่สร้าง balance cache
runtime role SELECT/INSERT owner sources; UPDATE/DELETE ปฏิเสธ ไม่มีสิทธิ์ rewrite ประวัติ
trigger ที่ใช้สองตารางแยก IF ตาม TG_TABLE_NAME ก่อนอ่าน NEW fields; SQL CASE อาจ resolve field ของอีกตารางจน error

ไม่มี backfill; ALTER ledger/FK/CHECK/unique มี lock และตรวจ rows เดิม ใช้ runner ที่ตรวจ identity/checksum/serialize และ lock5s/statement30s
ก่อน remote ต้องประเมินขนาด/lock/backup restore แยก; recovery ตรวจ journal แล้ว forward repair ไม่ drop ประวัติ
`npm run db:migrate` development local ผ่านพร้อม runtime grants; ไม่ได้ apply remote หรือ deploy

## หลักฐาน

เริ่มจาก contract test ที่ล้มเหลวเพราะ schema ยังไม่มี แล้วเพิ่ม implementation
PostgreSQL17.11 local ผ่าน harness disposable DB ที่ตรวจ admin/host/ownership nonce ก่อน cleanup
เพิ่ม6กลุ่ม HTTP+SQL จริง ไม่ mock ledger/locks:

- I: เติม1000/ถอน200 เหลือ800, sales/expenses/payments ไม่เปลี่ยน; same-key concurrent ได้ id/body/audit/movement เดิม
- invalid date/account/amount/auth/Origin/CSRF/key/expected identity และ CLOSED-day new key ปฏิเสธ; committed key replay ได้
- ฉีด audit failure แล้ว source/movement/day/revision/key rollback รวม auto-open; retry key เดิมได้ครั้งเดียว
- owner withdrawal กับ expense payment คนละร้านใช้ bank100000 แข่งขันจ่าย70000: lock graph ยืนยัน2คำขอรอก่อนปล่อย → 201/409 เหลือ30000
  ถอนอีก30000เหลือ0ได้ จากนั้นถอน1ปฏิเสธและไม่เปลี่ยน state
- direct SQL missing/wrong sign/duplicate/wrong-account posting และ UPDATE/DELETE sources ปฏิเสธ
- เพิกถอน OWNER ขณะรอ account lock →403/rollback; MANAGER/STAFF/new write/replay/foreign store ไม่ข้ามสิทธิ์

อัปเกรด fixture เดิมไป10migrationsและรันซ้ำ; IDs/history/ledger/audit/keys/identity เดิมไม่เปลี่ยน ยอด fixture15545สตางค์
`npm test`40tests/15files ผ่าน; `npm run test:db`, `npm run typecheck`, `npm run lint`, `npm run build` ผ่าน
OpenAPI generator28paths/96schemas; design checker ผ่าน114links/619localrefs (structural เท่านั้น ไม่ใช่ full OpenAPI validator)
skill-creator quick_validate ผ่าน10skills; canonical/mirror48ไฟล์ตรงทุกbyteและลิงก์local74รายการผ่าน

ยังไม่มี transfer/fee (D2c2), UI เงินออก, history/report รวม (R1), reversal (D3), next-day settlement gate (D4) หรือ Android จริง
ไม่อ้าง production-ready จาก local checks; owner flows ยังแก้ผ่าน reversal API ไม่ได้จน D3 จึงควรใช้เฉพาะ development
