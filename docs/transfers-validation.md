# D2c2 — โอนบัญชีพร้อมค่าธรรมเนียม

ตรวจ local วันที่ 26 ตุลาคม 2026; backend slice ยังไม่มี UI เงินออก/โอน ไม่ปิด M4 จาก API checks อย่างเดียว

## Contract และ setup

POST `/api/v1/account-transfers` รับ sourceStoreId/destinationStoreId/sourceAccountId/destinationAccountId,
businessDate/occurredAt, amount บวกสตางค์ string, feeAmount? nonnegative/default0, reason1–1000
บัญชีต้องต่างกันและอยู่ business เดียวกัน; OWNER โอนข้ามร้าน, MANAGER ภายในร้านที่ assigned เท่านั้น, STAFF403
response201 `{data:{id,...request,feeAmount,feeExpense:null|Expense}}`; cookie/Origin/CSRF/UUID key และ paired expected identity headers ตามระบบเดิม
ทั้งสองวันต้อง current Bangkok OPEN, account mapped/active/opening/cutover พร้อม; new write วันปิดปฏิเสธ แต่ original key replay ได้ภายใต้สิทธิ์ปัจจุบัน

fee>0 ใช้หมวดชื่อ `ค่าธรรมเนียม` ที่ OWNER สร้างผ่าน POST `/expense-categories` ไว้ก่อน
หากไม่มีหรือ inactive409 FEE_CATEGORY_REQUIRED; ไม่มี auto-create category แทน MANAGER และไม่มี feeCategoryId จาก client
fee สร้าง expense recognition+full payment จากบัญชีต้นทาง; description ใช้ reason และเวลาเดียวกับ transfer
zero feeไม่มี expense/payment; principalสองฝั่งรวม0, operating expense/เงินรวมลดเฉพาะ fee; salesไม่เปลี่ยน
revision+1ต่อ distinct day รวมfeeในactionเดียว; same-storeเพิ่มครั้งเดียว

## Transaction และ schema

claim key → current access ทั้งสองร้าน → configuration gates เรียง store ID → existing days เรียง store ID
→ union ของสองบัญชีเป้าหมายและ active accounts ของร้านที่ยังไม่มีวัน เรียง account ID → ensureOpen ทั้งสองร้าน
→ ตรวจเวลา/access/ยอดต้นทาง >= amount+fee → fee source/payment → transfer header → OUT/IN → revision/audit/response → commit

การ prelock union จำเป็นเพราะ ensureOpen ล็อกทุก active account เพื่อ snapshot; เรียก day opener สองครั้งโดยไม่ prelock อาจซ่อน account lock นอกลำดับ
ใช้ ExpensesService.postToDay แบบ caller-owned transaction; ไม่ claim key/เปิด transaction/เพิ่ม revision ย่อยซ้ำ
standalone expense create ยังเป็นเจ้าของ key/day/revision เดิม; fee helper re-lock เฉพาะ source account ที่ caller ถือแล้ว

Migration `0010_account_transfers.sql` เพิ่มตาราง/source slot/leg; `0011_transfer_posting_guards.sql` เพิ่ม deferred guards
composite day/account/fee/actor FKs และ unique feeExpenseId
ledger unique(transfer_id,leg), leg OUT/IN ต้องไม่ nullสำหรับtransfer และต้องnullสำหรับsourceอื่น
deferred guard ตรวจสองขาเท่ากัน/ตรงstore/day/account/actor, current days/accounts และ fee ที่จ่ายเต็มจากsourceจริง
signed transfer slot ไม่ผ่อน opening/sale/expense/owner guards; ใช้ no-overdraft INSERT guard ตัวเดิม
runtime SELECT/INSERT transfer sources เท่านั้น; ไม่มี UPDATE/DELETE

ไม่มี backfill หรือแก้ประวัติเดิม; ledger ALTER CHECK/FK/unique มี lock/scan ใช้ runner identity/checksum/serialize กับ lock5s/statement30s
ก่อน remote ต้องประเมินขนาด/เวลา/backup restore; recovery ตรวจ journalแล้ว forward repair ไม่ drop financial history
พบว่า local development ใช้0010ส่วนgenerated schemaไปแล้วระหว่างพัฒนา จึงคืน0010ให้ตรง checksumที่บันทึกไว้
และแยก guards ที่ยังไม่ใช้เป็น0011ผ่าน Drizzle custom migration; guarded CLI apply0011พร้อม runtime grants ผ่านแล้ว
ไม่ rewrite journal/checksum, ไม่ reset DB, ไม่ apply remote/deploy

## หลักฐาน

PostgreSQL17.11 local ผ่าน harness disposable/ownership nonce; ไม่ mock persistence หรือ locks
contract testเริ่มจากschemaยังไม่มีแล้วเพิ่มimplementation; source mutationทั้งหมดตรวจ HTTP+SQLจริง
เพิ่ม7กลุ่มตรวจ:

- J: โอน1000ไม่มีfee principalรวม0; fee10เป็นpaid expenseหนึ่งชุดจากต้นทาง; salesคงเดิม; same-key concurrent/replayไม่มีคู่ขาหรือfeeซ้ำ
- inject failureที่ fee payment audit, fee recognition audit, transfer audit และ incoming leg → fee/สองฝั่ง/day revision/key rollbackทั้งชุด; retrykeyเดิมได้
- inject failureเมื่อauto-openสองวันแล้วไม่มีวันค้าง; โอนสวนทางสองคำขอรอconfiguration lockจริงก่อนปล่อย เปิดวันครั้งเดียว ไม่ deadlockหรือเพิ่มเงินรวม
- feeทำให้ยอดไม่พอปฏิเสธทั้งชุด; transferกับowner withdrawalใช้bankร่วมแข่งกัน โดยlock graphยืนยัน2คำขอรอ →201/409 เงินไม่ติดลบ
- new sourceวันใดวันหนึ่งCLOSEDปฏิเสธ, replayเดิมยังได้; invalid/self/missing account/store/future/auth/Origin/expected identity ไม่ทิ้งstate
- direct SQL missing/unbalanced/wrong-account/duplicate legs และunpaid feeปฏิเสธ; runtimeแก้/ลบsourceไม่ได้
- MANAGERภายในร้านได้และrevisionเพิ่มครั้งเดียวรวมfee; ไม่มีassignment404, cross-store403แม้assignedสองร้าน; STAFF403
  เพิกถอนOWNERขณะรอaccount lockแล้ว403/rollback และ replayไม่ข้ามสิทธิ์

อัปเกรดfixtureเดิมไป12migrationsและรันซ้ำ; IDs/history/ledger/audit/keys/identityเดิมคงเดิม ยอด15545สตางค์
`npm test`41tests/16files, `npm run typecheck`, `npm run lint`, `npm run build` ผ่าน; `npm run test:db` หลังแยก0010/0011ผ่าน
skill-creator quick_validateผ่าน10skills; canonical/mirror48ไฟล์ตรงทุกbyteและlocal links74รายการผ่าน
OpenAPI29paths/99schemas; design checkเป็นstructuralเท่านั้นไม่ใช่fullOpenAPI validator
ยังไม่พิสูจน์Androidจริง, UIเงินออก, reversal(D3), next-day settlement(D4), history/reportรวม(R1), backup restoreหรือproduction
