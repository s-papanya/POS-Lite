# D2b — รายจ่ายและชำระเต็ม

พัฒนาและตรวจ local วันที่ 25 ตุลาคม 2026; API backend เท่านั้น ยังไม่ปิด milestone M4

## พฤติกรรมที่ส่งมอบ

- OWNER/MANAGER ของร้านสร้างและอ่านรายจ่ายได้; STAFF403, ร้าน/ธุรกิจนอก scope404
- POST `/api/v1/stores/:storeId/expenses` รับหมวดในธุรกิจ, amount เป็นสตางค์ string บวก, description, evidenceReference?, businessDate/occurredAt
- ไม่มี payment: รับรู้รายจ่าย UNPAID ไม่มี movement; มี `{payment:{accountId}}`: จ่ายเต็มพร้อม recognition ใน transaction เดียว
- POST `/stores/:storeId/expenses/:id/payments`: รับวัน/เวลา/accountId; amount ใช้หนี้เดิมจาก server ไม่รับ partial/client amount; จ่ายแล้ว409 ALREADY_PAID
- GET `/stores/:storeId/expenses?from=...&to=...`: วันที่ recognition ไม่ใช่วันที่จ่าย; status ALL/UNPAID/PAID, limit1–100/default30, ช่วงไม่เกิน366วัน
- cursor descending `(occurred_at,id)` เก็บ microseconds และผูก business/store/from/to/status; list query เดียวให้ status/payment สอดคล้องกัน
- cookie/Origin/CSRF/key และ paired expected identity headers; replay ตรวจสิทธิ์ปัจจุบันและคืน original response แม้วันปิด/สถานะเปลี่ยนแล้ว
- new source ต้องวันปัจจุบัน Bangkok OPEN, occurredAt ไม่ future/ผิดวัน/ก่อน recognition หรือ account cutover; วันต้นทางปิดแล้วจ่ายได้หากมีวันปัจจุบัน OPEN
- revision เพิ่ม1ต่อ action ทั้ง recognition และการจ่ายภายหลัง; จ่ายทันทีเป็น action เดียว; ยอดขายไม่เปลี่ยน

## Atomicity และการป้องกันเงิน

ใช้ transaction/claim เดิม → lock วัน → lock expense ต้นทาง → lock account → ตรวจ balance จาก ledger ทั้งบัญชี
→ source/payment/movement/audit/response → commit; private postPayment ใช้ transaction ของ caller ไม่เปิด transaction หรือ key แยก
ยอดใช้ BigInt; movement เงินออกมี `expense_payment_id` และ delta ติดลบเท่าหนี้เต็มจำนวน; typed composite FK ไม่เปิด generic ledger POST
บัญชีธนาคารร่วมรวมยอดจาก account identity ทั้งสองร้านเพียงครั้งเดียว; เงินพอเหลือ0ได้ ห้าม overdraft

Migration `0008_expenses.sql` เพิ่ม2ตาราง/source slot, ขยาย CHECK ledger เฉพาะ expense debit โดยเก็บ opening/sale credit guards เดิม
deferred guards ตรวจวัน/เวลา/หมวด/ยอดเต็ม/account/cutover/movementหนึ่งแถว/actor; BEFORE INSERT ledger ล็อกบัญชีแล้วตรวจยอดสำหรับทุก writer
trigger functions ตรึง search_path; ไม่มี backfill หรือแก้ sources เก่า
runtime SELECT/INSERT sources; expenses ได้ UPDATE(id) เพื่อให้ PostgreSQL row lock ได้เท่านั้น และ unconditional immutable trigger ปฏิเสธทุก UPDATE/DELETE
ไม่มีสิทธิ์แก้ amount/ปิด trigger; expense_payments/movements ยังคงไม่มี UPDATE/DELETE

## หลักฐานและขอบเขต

PostgreSQL17.11 local Compose; harness สร้าง disposable DB ตรวจ host/admin/ownership nonce ก่อน cleanup ไม่ใช้ฐานปกติเป็น test fixture
ทดสอบ contract ก่อน implementation แล้วพบ schema ยังไม่มีตามคาด; หลังพัฒนาใช้ suite เดิมและเพิ่ม expense checks

ตรวจ HTTP+SQL จริง: H unpaid/paid, immediate payment, same-key replay/changed payload, same-expense competitors,
สองร้านแข่งขันใช้ bank100000 จ่าย70000ทั้งคู่ โดย lock graph ยืนยัน2คำขอรอก่อนปล่อย → 201/409 เหลือ30000,
direct SQL overdraft/partial/missing/wrong sign/wrong scope ปฏิเสธ, audit failure ที่ทั้ง payment/recognition และจ่ายภายหลัง rollback ทุก source/ledger/revision/key,
closed-day reject/replay, original closed recognition + current OPEN payment, pagination/status และ current-role/store/business/identity isolation
อัปเกรด fixture เดิมไป9 migrations และรันซ้ำ; ประวัติ/ledger/audit/key/identity เดิมไม่เปลี่ยน ยอด fixture ยัง15545สตางค์

ผลตรวจสุดท้าย: `npm test`39 tests/14 files ผ่าน, `npm run test:db` ผ่าน, `npm run typecheck`, `npm run lint`, `npm run build` ผ่าน
`npm run db:migrate` development local ผ่านพร้อม runtime grants; ไม่ได้ apply remote
OpenAPI generator27paths/93schemas; design check ผ่าน109links/592localrefs (structural เท่านั้น ไม่ใช่ full OpenAPI validator)
skill-creator quick_validate ผ่าน10skills, canonical/mirror48ไฟล์ตรงทุกbyte และลิงก์local74รายการผ่าน
case ข้ามวันสร้าง historical fixture ด้วย admin เฉพาะ disposable DB และเปิด guard คืนใน transaction เดียว;
ไม่ใช่หลักฐานว่า D4 เปิดวันถัดไปได้แล้ว — production gate เดิมยัง fail closed

unique(expense_id) และ paid status ยังไม่รู้จัก reversal; D3 ต้องอัปเดต constraint/query/service พร้อมกันก่อนให้ย้อน payment แล้วจ่ายใหม่
ยังไม่มี UI เงินออก, owner/transfer/fee, refund/reversal, Android จริงหรือ production/backup restore proof
การ apply local ใช้ guarded CLI เดิม; remote migration/deploy ไม่อยู่ในงานนี้
ตารางใหม่ว่าง แต่ ALTER ledger CHECK/FK/unique ต้องถือ lock และตรวจข้อมูลเดิม; runnerจำกัด lock5s/statement30s
ก่อนใช้ฐานขนาดใหญ่ต้องประเมินเวลา/lock/backup restore แยก; recovery ใช้ตรวจ journal และ forward repair ไม่ drop ประวัติเงิน
