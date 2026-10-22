# S2 — POS sale และประวัติบิล

ตรวจ development local วันที่ 23 ตุลาคม 2026 ต่อจาก S1c; งานถัดไป S3 หน้าจอขายบน Android

## ขอบเขตที่ implement

- POST `/api/v1/stores/:storeId/sales` สำหรับ OWNER/MANAGER/STAFF ที่เข้าร้านได้
  cookie + Origin + CSRF + UUID Idempotency-Key; ใช้ business/user จาก session และ strict request schema
- รับ businessDate/occurredAt, itemsพร้อม productId/expectedVersion/quantity, discount และ payments
  1–100สินค้า/1–100payments, product/account IDs ไม่ซ้ำ, quantity1–999, global JSON limit16kb ยังบังคับใช้
  ไม่รับ client price/gross/net/change/actor; เงินเป็น integer strings ไม่เกิน9000000000000สตางค์ต่อ field
- คำนวณ BigInt: fixed discount หรือ percent basis points0–10000, half-up ครั้งเดียวที่ยอดบิล
  netต้องบวกและเท่าผลรวมpayments; CASHต้องบัญชี CASH/tenderedพอ และเข้าบัญชีเฉพาะamountสุทธิ
  TRANSFERต้อง BANKและไม่มีtendered; ไม่มีภาษี/ค่าบริการ
- snapshot ชื่อ/ราคา/version/quantity/line total; PRICE_CHANGED409พร้อม details.current ให้ยืนยันใหม่
  เมนู inactiveใช้ไม่ได้ และแก้เมนูภายหลังไม่เปลี่ยนบิลเดิม
- วันแรก auto-create ผ่าน BusinessDaysService ด้วย client transaction เดียวกับ sale
  สร้าง cash opening snapshotจาก ledgerที่ไม่ใช่ movementของวันนั้น; ความล้มเหลวไม่ทิ้งวัน/audit/keyค้าง
  วันต้องเป็นวันนี้ Bangkok; occurredAtต้องอยู่วันนั้น/ไม่เกินเวลาฐานข้อมูล/ไม่ก่อนaccount cutover
- reference `POS-YYYYMMDD-000001` แยก counterร้าน/วัน; revisionเพิ่มครั้งเดียวต่อsale
  API dayRevisionเป็นstring และเก็บ revisionตอนขายเพื่อให้ original response/historyคงเดิม
- GET `/stores/:storeId/sales/:saleId` และ GET `/stores/:storeId/sales?from=...&to=...`
  คืน immutable bill/items/payments; from/to inclusive Bangkokไม่เกิน366วัน, limit1–100/default30
  keyset `(occurred_at,id)` DESC, cursorผูกstore/from/toและเก็บmicrosecond timestamp
  STAFFเห็นบิลร้านตน ไม่มี whole-business bank balance; foreign store/business/sale404

ยังไม่รองรับ SUPPLEMENTAL/RECONCILIATION/refund/reversal ใน sales module; status/refsเหล่านี้รอ D1/D3
ปิดวัน/reopen/settlementรอ D4; CLOSEDปฏิเสธบิลใหม่409 DAY_CLOSED แต่ original replayไม่เปิดวันใหม่
ถ้ามีวันอื่นอยู่แล้วจะปฏิเสธวันใหม่409 PREVIOUS_DAY_UNSETTLED จนมีหลักฐาน settlement ตาม D4

## Transaction และ schema

claim idempotency → store configuration gate → day lock → productsเรียง ID FOR SHARE → accountsเรียง ID FOR UPDATE
→ counter → revision/source/items/payments/movements/audit/stored response → COMMIT
auto-createวันล็อกบัญชีactiveทั้งหมดเพื่อทำsnapshotก่อนล็อกสินค้า; บัญชีระหว่างร้านเรียง IDเสมอ
ตรวจสิทธิ์ซ้ำหลังรอ claim/day/account locks; replayตรวจสิทธิ์ปัจจุบันก่อนคืนผลเดิม
ไม่มี independent ledger POST และไม่มี movementจากเงินทอน

Migration `0004_pos_sales.sql` เพิ่ม sales/sale_items/sale_payments/document_counters รวม20ตาราง domain
เพิ่ม nullable sale_payment_id/day_id ในledgerและทำ account_opening_id nullableเพื่อรองรับสองsourceจริง
CHECKบังคับsourceเดียว: initial openingต้องไม่มีday; sale paymentต้องมีday
composite FKผูกpaymentกับ business/store/day/account ของsource และ unique payment posting slot
ข้อมูลopeningเดิมไม่ถูก rewrite; sourceใหม่ของแถวเก่าเป็นNULL

Deferred triggers ตรวจ1–100items/payments, SUM(items)=gross, SUM(payments)=net, movementหนึ่งแถวต่อpayment
delta/actorตรงsource, account/channel/cutoverและวันOPENตรงกันก่อนcommit
ปรับ snapshot guard โดย exclude movementของdayเดียวกัน จึงรองรับวันใหม่+saleในtransactionเดียว
ไม่ใช้เวลา created_at เป็นเส้นแบ่งเพราะ PostgreSQL now() เป็นเวลาเริ่มtransaction
runtimeไม่มีUPDATE/DELETE bills/items/payments/movements/snapshots; counterแก้ได้เฉพาะnext_number

## Migration/recovery

ทดสอบupgradeจาก0000–0003พร้อม users/product/audit/key/account/opening/movement/closed-day/snapshot fixtures
เทียบทุกคอลัมน์เดิมและ SUM12345สตางค์เดิมหลังupgradeและmigrateซ้ำ; เพิ่ม source columnsที่NULLโดยไม่แต่งประวัติ
นำ migration ไปใช้development localผ่าน guardและrunnerเดิมแล้ว; ไม่แตะremote environment
ALTER ledger/เพิ่มCHECK/FK/unique indexยังอาจlockหรือscan ledgerบนข้อมูลจำนวนมาก
runnerมีlock_timeout5s/statement_timeout30sและchecksum/advisory migration serialization;
ยังไม่ได้พิสูจน์online upgrade/production data volume/backup restore

เมื่อtimeoutให้ตรวจjournal/schemaก่อนretry; หากต้องหยุดfeatureให้หยุดwriterและforward-fix
ห้ามdrop source columns/billsหรือบังคับaccount_opening_id NOT NULLกลับหลังมีsale movements
การrollback binaryไม่ใช่rollbackข้อมูล; เก็บledger/audit/idempotencyไว้ และประเมินwriter compatibilityก่อนเปิดรับรายการ

## ผลตรวจ

- `npm test`:26 tests/7ไฟล์ รวมBigInt discount/rounding/overflow/zero net/payment mismatch
- `npm run test:db`:1 workflow/38กลุ่มตรวจ บน PostgreSQLจริงในdisposable databaseที่ตรวจownershipก่อนcleanup
- split cash4000/transfer5975 จากgross10500/discount525/net9975; tendered10000/change6000
  snapshotยัง50000, cashเป็น54000, bankเป็น15975 ไม่มีเงินทอนหรือยอดตั้งต้นเพิ่มซ้ำ
- retryหลังcommit/same-key concurrentคืนresponseเดิม; changed payload409;
  ต่างkeyได้บิล/counter/revisionต่างกันครบ; shared bankสองร้านถูกcreditครั้งเดียวต่อpayment
- error injectionที่items/payment/movement/auditทำให้day/snapshot/sale/children/ledger/counter/audit/key rollback
  retry keyเดิมได้บิล000001; ไม่มีpartial commit
- STAFFขายร้านตนได้/อ่านข้ามร้านไม่ได้/ถูกถอนmembershipแล้วreplayไม่ได้; OWNERข้ามธุรกิจไม่ได้
- price editเก็บbill snapshotเดิม; stale/inactive productsถูกปฏิเสธ;
  ถือproduct lockจริงแล้วให้saleรอ ก่อนcommitราคาใหม่ → PRICE_CHANGEDพร้อมrollbackauto-day
- ถือday row lockจริงแล้วให้saleรอ ก่อนcommitCLOSED → DAY_CLOSED;
  barrierใช้pg_blocking_pids ไม่ใช้sleepหรือmocktransaction
- direct SQL missing items/payments/posting/wrong delta/source mismatch/duplicate postingถูกDBปฏิเสธ
  runtimeแก้ประวัติบิลไม่ได้; historyเดินcursorครบทุกIDรวมtimestampซ้ำและปฏิเสธcursorต่างscope
- typecheck/lint/buildผ่าน; OpenAPI23paths/73schemasและPython structural checksผ่าน
  response contractsใช้shared Zod; ยังไม่ใช้full OpenAPI validator

ครอบคลุมinvariantsด้าน A/E/M/N/P สำหรับ POS; ไม่อ้างacceptance A–Pครบทั้งระบบ
close-firstเป็นSQL fixtureเพื่อพิสูจน์day lock ไม่ใช่ผลตรวจD4 closing endpointที่ยังไม่มี
ยังไม่ได้ทดสอบAndroid UI/network timeoutจริง/production load/restore/deploy; ยังไม่พร้อมขายจริง
