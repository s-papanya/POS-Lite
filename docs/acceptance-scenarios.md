# Acceptance scenarios และหลักฐานที่ต้องเก็บ

สถานะ A–P: **ยังไม่ผ่านครบทุก module**; S2 มี local PostgreSQL หลักฐานด้าน A/E/M/N/P ของ POS แล้ว
ดู [sales-validation.md](sales-validation.md); reconciliation มี [ผลตรวจ D1b](reconciliation-validation.md)
และ H รายจ่ายมี [ผลตรวจ D2b](expenses-validation.md); Closing/refund และ Android จริงยังรอ
I เติมทุน/ถอนมี [ผลตรวจ D2c1](owner-transactions-validation.md); J transfer/fee ยังรอ
F1 มี runtime config/HTTP tests แยกแล้ว ดู [หลักฐาน Foundation](foundation-validation.md)
จำนวนเงินในคำอธิบายเป็นบาท; fixtures แปลงเป็นสตางค์
integration ต้องใช้ PostgreSQL จริงคนละ connection สำหรับ concurrency ไม่ mock locks
แต่ละกรณีตรวจ HTTP + source rows + money_movements + audit + idempotency records

| ID | Given / When | Then | ชนิด/ก้อน |
|---|---|---|---|
| A | N/K แยกร้าน; ขาย N100 | N sales100 K0; ไม่มี cross-store movement | integration Sales |
| B | POS cash300; target500 | delta200; net500; cashเพิ่ม200ครั้งเดียว | integration Daily |
| C | recorded500; target500 keyใหม่ | NO_CHANGE record; ไม่มี sale/movement เพิ่ม | integration Daily |
| D | POS300 + additional100; target500 | delta100 ไม่ใช่200 | integration Daily |
| E1 | response หายหลัง commit ส่ง key/payloadเดิม | row count/ID/ref/status/bodyเดิม | integration Sales/Daily |
| E2 | keyเดิม payload/path ต่าง | 409 IDEMPOTENCY_CONFLICT; ไม่เปลี่ยนเงิน | integration ทุก mutation |
| F | สอง connection confirm revisionเดียวกัน | หนึ่ง commit หนึ่ง stale; re-preview delta0; ไม่มี double posting | PostgreSQL concurrency Daily |
| G | recorded500 target400 | preview review flag; confirm409; บิล/ledgerเดิมครบ | integration Daily |
| H | expense100 unpaid แล้วจ่ายเต็ม | recognition100 เงินคงเดิม; paymentลด100 ยอดขายไม่เปลี่ยน | integration Daily |
| I | contribution1000 withdrawal200 | เงิน+800 ยอดขาย/operating expenseไม่เปลี่ยน | integration Daily |
| J | transfer1000 | -1000/+1000 txเดียว รวม0; fee10 แยก expense/เงิน-10 | integration Daily |
| K | opening500 sale1000 paid200 withdrawal100 count1150 | expected1200 variance-50; sale1000; closeไม่ post; OWNER settlement-50ครั้งเดียว | integration Daily |
| L | วัน CLOSED แล้ว post; OWNER reopen reason | post409; STAFF403; OWNER audit+old snapshotอยู่ครบ; later day gate | integration Daily |
| M | STAFF N เรียก K โดยตรง หรือใส่ saleId K ใน path N | 404; ไม่เห็น body/balance; managerไม่มี whole business access | integration Foundation/Sales |
| N | inject error ตอน payment/movement/audit ก่อน commit | sale/items/payments/ledger/keyทั้งหมด rollback; retryทำได้หนึ่งรายการ | PostgreSQL rollback Sales |
| O | full refund แล้ว retry/คืนอีก/คืนเกิน | net/actual payoutถูก; keyเดิม replay; keyใหม่409; excess422; foreign store404 | integration Daily |
| P | เปลี่ยนราคาแล้วอ่านบิลเก่า/ส่งversionเก่า | snapshotเดิม; staleราคา409ไม่มีposting | integration Sales |

## กรณีเพิ่มเพื่อปิดช่องโหว่

- CASH tender200/net100/change100 ledger+100; split payment sumผิด reject; discount half-up boundary 1 สตางค์
- SQL direct INSERT ข้าม tenant/store FK ต้อง fail; source FK หาย/duplicate posting slot ต้อง fail
- deferred triggers ต้อง reject parent ที่ไม่มี children หรือ child sumผิด และ transfer leg ขาด
- account cash mapสองร้าน fail; shared bankยอดจริงครั้งเดียว; M/Sไม่เห็น shared total
- กด close ซ้ำ keyเดิม replay; คนละkey409; sale/closeแข่ง ตรวจทั้งสองลำดับด้วย barrier
- refund concurrent คนละkey หนึ่งสำเร็จ; expense payment concurrentหนึ่งสำเร็จ; withdrawalsจาก shared bank
  แข่งกันต้องไม่ทำบัญชีติดลบ; initial openingซ้ำถูก unique reject
- refundข้ามวันเก่าปิด: old day immutable, current netติดลบได้; allocation original account≠payout account
- negative net bucketรับtargetติดลบและไม่ auto target0; target omittedไม่สร้าง sale; new salesทำ bucketกลับบวกคำนวณถูก
- reversalเต็มและretry, saleที่refundแล้วห้ามreverse, payment reversedแล้วจ่ายใหม่ได้,
  transfer reversalครบทั้งสองร้านรวมfee; shortage settlement reversedในreopenก่อนปิดใหม่
- Bangkok 23:59:59/00:00:00, server timezoneอื่น, future date, unopened previous day ตาม P4 เมื่อยืนยัน
- CSRFinvalid403, cookie flags, auth rate limitข้ามสองprocess, sessionrevoke/expiry,
  roleเปลี่ยนแล้วidempotencyreplayต้องไม่เปิดข้อมูลที่เสียสิทธิ์
- API serialization เงินเกิน Number.MAX_SAFE_INTEGER ต้องยังเป็น string แบบไม่สูญเสียprecision
- username uniqueness case-insensitive, ownerสุดท้ายห้ามถอดสิทธิ์/disable
- Android360px, offline/timeout/sessionเปลี่ยนผู้ใช้/สลับร้าน, no false success และอ่านบิลจากserver
- restore rehearsal DBแยก: migration version/row count/ledger totals/ธุรกรรมอ้างอิง/ไม่มีsessionเก่าที่ยังใช้ได้

## เกณฑ์หลักฐาน

บันทึก command, git revision เมื่อเริ่มใช้ Git, PostgreSQL version, fixture, ผล pass/fail,
และผล query invariants จริง; concurrency ใช้ deterministic barriers ไม่อาศัย sleep ให้ชนกันเอง
Vitest unit ใช้คำนวณเงิน/validation; Supertest ผ่าน HTTP ใช้ DBจริง; Android manual เป็น evidence แยก
buildผ่านไม่เท่ากับผ่าน acceptance และยังไม่เท่ากับพร้อม production
