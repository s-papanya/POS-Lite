# S1b — บัญชีและยอดตั้งต้น

23 ตุลาคม 2026: ส่งมอบ API บัญชี/ยอดตั้งต้นและ ledger สำหรับ opening เท่านั้น
S1 ยังเหลือวันทำการ/day opening snapshots; หน้า UI จัดบัญชีและธุรกรรมขายยังไม่มี

## API และสิทธิ์

ใต้ `/api/v1`:

| Method/path | พฤติกรรม |
|---|---|
| POST /accounts | OWNER สร้าง name/type/storeIds; CASHหนึ่งร้าน, BANKหนึ่งหรือหลายร้าน |
| PATCH /accounts/:accountId | OWNER เปลี่ยน name/active; ไม่รับ type/storeIds หรือ scope fields |
| POST /accounts/:accountId/opening | OWNER ลง storeId/amount/cutoverAt/reason ครั้งเดียวต่อบัญชี |
| GET /stores/:storeId/accounts | O/M/S ที่เข้าถึงร้านได้ อ่านเฉพาะ id/name/type ของบัญชี active |

Mutation ต้อง cookie session, exact Origin, X-CSRF-Token และ Idempotency-Key UUID
ธุรกิจ/ผู้กระทำมาจาก session; ตรวจสิทธิ์ปัจจุบันทั้งก่อนและหลัง claim key ที่อาจรอ transaction อื่น
ร้าน/บัญชีนอกธุรกิจตอบ404; STAFF/MANAGER แก้บัญชีหรือลง opening ตอบ403
ชื่อซ้ำในธุรกิจตอบ409 ACCOUNT_NAME_TAKEN; openingซ้ำคนละkeyตอบ409 ACCOUNT_ALREADY_OPENED
บัญชี inactive ไม่รับ openingใหม่ (422 ACCOUNT_INACTIVE); cutover อนาคตตอบ422 INVALID_CUTOVER_DATE
timestamp ต้อง ISO พร้อม offset และ normalize UTC ก่อน hash; moneyเป็นสตางค์ string ไม่ใช้float

Account response มี id/name/type/active/storeIds; opening response มี id/accountId/storeId/amount/cutoverAt/reason
GET accounts ใช้ UUID keyset cursor, limit1–100/default30 และ page.nextCursor
cursor เป็นตำแหน่ง ID; ทุกหน้า query ภายใต้ business/store ที่ตรวจสิทธิ์ ไม่คืน balance/ยอดตั้งต้นให้ STAFF/MANAGER
ยังไม่มี owner balance/report endpoint; ยอดจริงตรวจจาก SUM(money_movements.delta) ไม่เก็บ mutable balance

## ความถูกต้องของยอดตั้งต้น

ยอดตั้งต้นเป็นเงินก่อนเริ่มระบบ ไม่ใช่ยอดขาย/เติมทุน และไม่มีผลต่อรายจ่าย
amount0–9000000000000; เหตุผลจำเป็น; cutoverAt ไม่เกินเวลา DB
transaction: claim key → lock financial account → ตรวจ mapping/active/ไม่เคยเปิด
→ opening source → movementเมื่อamount>0 → audit → response/key → COMMIT
ยอด0เก็บ source/audit/key แต่ไม่สร้าง movement; ไม่มีการแก้ opening หรือ movement ผ่าน API
keyเดิม/payloadเดิมคืน original status/body; เปลี่ยน payload/path ได้409 IDEMPOTENCY_CONFLICT
การเปลี่ยน metadata ภายหลังไม่เปลี่ยน response เดิมที่ใช้ replay

BANK ที่แชร์สองร้านมีบัญชีจริง/ยอดตั้งต้น/movement ชุดเดียว; storeId ใน opening เป็น attribution ที่ OWNER เลือก
opening ของบัญชีที่ inactive ไม่เปิดใหม่; ไม่มี endpoint เปลี่ยนยอดตั้งต้นที่ยืนยันแล้ว
runtime role อ่าน/เพิ่ม source/ledger ได้ แต่ UPDATE/DELETE ไม่ได้; accountแก้เฉพาะ name/active

## Migration 0002_accounts_opening

เพิ่ม financial_accounts, account_stores, account_openings, money_movements และ composite FKs
CHECK amount/เหตุผล/cutover≤created_at, UNIQUE openingต่อบัญชีและmovementต่อopening
deferred constraint triggers ตรวจว่า account มี mapping และ CASHหนึ่งร้านพอดี
ตรวจ source/ledger ตอน commit: amount0ไม่มีmovement; amountบวกมีหนึ่งmovementที่ deltaเท่ากันและ actorตรงกัน
ตรวจทั้ง parent/child events รวม sourceเดิม/ใหม่เมื่อย้าย reference; rollback ไม่เหลือ parentเปล่า
ไม่มี DROP/backfill/การเปลี่ยนข้อมูล S1a; manual triggers อยู่ใน SQL นอก Drizzle snapshot

Ledger ตอนนี้รับต้นทาง account_opening เท่านั้น จึงกำหนด source FK NOT NULL และ deltaบวก
ก่อนเพิ่ม sale/refund/debit ต้องเพิ่ม source FKs/day scope/slot checks และปรับ constraints ใน migration ใหม่
ห้ามเปิด API movement อิสระหรือคลาย constraints โดยไม่มี source invariant มาทดแทน
no-overdraft สำหรับการจ่าย/คืน/โอนยังไม่ implement เพราะยังไม่มี debit operations

Apply local ด้วย `npm run db:migrate`; ไม่ใช้ schema push/reset หรือแก้ไฟล์ที่ apply แล้ว
ถ้าล้มเหลวตรวจ journal/DB stateก่อน retry; แก้ด้วย forward migration ไม่ล้าง named volume
staging/production ต้องมี target authorization, backup/restore และ R2 deployment gates

## หลักฐาน

ทดสอบบน PostgreSQL17.11 จริงผ่าน disposable DB ที่ตรวจ ownership nonce ก่อน cleanup:

- Upgrade จาก0000/0001 พร้อม users/products/audit/idempotency fixtures; IDs, hashes และ replay rows ไม่เปลี่ยน
- BANKแชร์สองร้าน/CASHหนึ่งร้าน; unmapped account/cash mappingเกินหนึ่งถูก deferred trigger ปฏิเสธ
- opening concurrent keyเดียวได้ responseเดิม; คนละkeyสำเร็จหนึ่งครั้ง; ledger/auditไม่เพิ่มซ้ำ
- เปิดBANKยอด9000000000000สตางค์แล้ว SUM ตรงและมีmovementเดียว; openingศูนย์ไม่มีmovement
- wrong delta/missing posting/positive movementของzero source/cross-account FK/future cutover ถูก DBปฏิเสธ
- failure injection ที่ audit ทำให้ opening/ledger/key rollback ทั้งหมด
- บัญชีข้ามธุรกิจ404; STAFFเห็นเฉพาะ metadata ร้านตนและ replay opening หลังลดสิทธิ์ไม่ได้
- runtime แก้ ledger/ลบopening/ลบmapping/เปลี่ยนaccount typeไม่ได้
- Catalog regressions ผ่านหลังย้าย claim/complete idempotency เป็น helper ร่วม โดยยังตรวจสิทธิ์ใน service

`npm test`:24 tests/6ไฟล์; `npm run test:db`:1 workflow/18กลุ่มตรวจ
`npm run typecheck`, `npm run lint`, `npm run build` ผ่าน
OpenAPI20paths/64schemas; response validation ใช้ shared Zod ใน integration และ Python structural checks
ไม่ได้ใช้ full OpenAPI validator หรือทดสอบทุก deterministic lock interleaving/production load
