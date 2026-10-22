# กฎธุรกิจและ transaction boundaries

นโยบาย P1–P5 ยืนยันแล้วตาม product-requirements.md (P4/P5 ยืนยันวันที่ 22 ตุลาคม 2026)

## เงิน เวลา และยอดขาย

เงินเก็บ BIGINT หน่วยสตางค์ API ส่ง decimal integer string เช่น `"10000"` = 100 บาท
คำนวณ TypeScript BigInt ไม่แปลงเป็น Number; จำกัดจำนวนเงินต่อ field ไม่เกิน 9,000,000,000,000 สตางค์
quantity เป็น integer 1–999; ไม่ขายหน่วยเศษใน MVP; THB เท่านั้น
ส่วนลด fixed ต้องไม่เกิน gross; percent เป็น basis points 0–10000
ปัดส่วนลด half-up ครั้งเดียว: `(gross * bps + 5000) / 10000` แบบ integer division
net = gross - discount; ไม่รับบิล net = 0 ใน MVP
เก็บชื่อ/ราคา/version เป็น snapshot; client ส่ง expected product version หากต่างตอบ PRICE_CHANGED
พร้อมราคาใหม่ ห้าม server เปลี่ยนยอดแล้วรับชำระเอง

ยอดขายขั้นต้น = sale net ก่อนคืน (หลังส่วนลด) รวม POS และ supplemental ที่ไม่ถูก reverse
ยอดขายสุทธิ = ยอดขายขั้นต้น - refunds ที่เกิดในวันนั้น - sale reversals ที่เกิดในวันนั้น
รายจ่ายรับรู้ในวันที่เกิด expense; เงินจ่ายเกิดวันที่ payment จริง ทั้งสองอาจต่างวัน
owner/transfer/opening/cash adjustment ไม่มีผลต่อยอดขายหรือรายจ่ายดำเนินงาน
report แสดง gross, discount, sales before refunds, refunds, net sales แยกชื่อ ไม่ซ่อนการคืน

occurred_at และ created_at เป็น timestamptz; business_date เป็น date ของ Asia/Bangkok
server ตรวจ occurred_at ตรงวันใน MVP ไม่อนุมานจาก timezone host ไม่อนุญาต future date
บิลเก่าอยู่วันเดิม refund อยู่วันคืนที่ OPEN; แสดง original sale reference

## Payment และ reconciliation

POS ต้องจ่ายเต็ม; sum(payment.amount) = sale.net; payment เป็นยอดรับสุทธิ
cash tendered >= cash payment; change = tendered - payment; บัญชีรับเฉพาะ net
TRANSFER ไม่มี tendered/change; CASH ต้องบัญชี CASH ที่ร้านได้รับอนุญาต
supplemental เป็น sale kind SUPPLEMENTAL ไม่มี items มี amount, reason และ payment allocation เต็มจำนวน
reconciliation target แยก (store, day, channel, original receiving account)
recorded = payments ของ sales ที่ยืนยันทั้งหมด รวม supplemental/reconciliation - refund allocations
- reversal allocations ในวันปัจจุบัน; allocations อ้าง payment เดิม แม้จ่ายคืนอีกบัญชี
preview ต้องคืน recorded, target, delta, projected net sales และ actual account movement
recorded/target เป็น signed net amounts ติดลบได้เฉพาะมุมยอดสุทธิหลัง refund/reversal;
จำนวนเงิน source sale/payment ยังต้องบวก delta ที่จะสร้างต้องไม่ติดลบ
delta > 0 สร้าง supplemental kind RECONCILIATION; delta = 0 บันทึก record ผล NO_CHANGE ไม่สร้าง sale
delta < 0 ตอบ RECONCILIATION_REQUIRES_REVIEW ไม่แก้รายการ
ไม่ทราบบัญชีให้หยุดเป็น draft ต้องเลือกระบุเอง ไม่มี unallocated posting ใน MVP

## Ledger และ opening

ยอดบัญชีจริง = sum(money_movements.delta) ตลอดอายุบัญชี ไม่มี mutable balance เป็นแหล่งความจริง
store attribution เป็นมุมกระแสเงิน ไม่ใช่ยอดธนาคารทั้งบัญชี บัญชีธนาคารร่วมแสดงยอดจริงเฉพาะ OWNER
เริ่มระบบใช้ OWNER opening transaction ต่อบัญชีหนึ่งครั้งพร้อมเหตุผล/วันที่ cutover;
เป็นเงินเดิมก่อนเริ่มใช้ ไม่ใช่รายได้หรือเติมทุน ห้าม post ก่อน cutover
เงินเปิดวันเป็น snapshot ledger ไม่ใช่ movement เงินใส่เพิ่มต้อง contribution หรือ transfer
ledger ของการขายมี day_id และ sale_payment_id จริง; คำนวณฐานเปิดวันโดยไม่นับ movement ของวันนั้น
ไม่ใช้ created_at แยกฐานเพราะ now() ของ transaction อาจมาก่อน opened_at ของวันอัตโนมัติ
cash account เป็นของร้านเดียว; bank account อาจแชร์ผ่าน account_stores
ห้าม movement อิสระ: ทุก movement ต้องมี FK ต้นทางจริงและ unique posting slot
ห้ามแก้/ลบ movement ผ่าน runtime role; rollback ล้างทั้งชุดที่ยังไม่ commit

## วันทำการ

UNIQUE(store, business_date); OPEN → CLOSED → OPEN ได้เฉพาะ OWNER พร้อมเหตุผลและ audit
revision เพิ่มทุก mutation ของวัน; closing_version เพิ่มทุกครั้งที่ปิดและเก็บ snapshot ใหม่เสมอ
สร้างวันอัตโนมัติก่อนขายครั้งแรกเมื่อมี initial balance และวันก่อนเคลียร์แล้ว
opening cash snapshot มีหนึ่งรายการต่อ cash account ต่อวัน ไม่สร้างซ้ำเมื่อ reopen
close ต้องระบุ count ทุก cash account ที่ active ในวันนั้น และตรวจ revision
expected = opening snapshot + cash movements หลังเริ่มวัน (opening cutover อยู่ก่อน snapshot)
counted - expected = variance; reason บังคับเมื่อไม่ศูนย์
close เก็บ snapshot และ CLOSED ใน transaction เดียว ไม่มี movement จาก variance
OWNER ยืนยัน settlement ของ closing ล่าสุดได้หนึ่งครั้งต่อ account เมื่อ CLOSED;
สร้าง cash adjustment เท่า variance พร้อมเหตุผล และ mark settlement; ศูนย์ mark settled ได้
reopen หลัง settlement ต้อง reverse adjustment เดิมแบบ explicit ใน transaction ที่ audit
แล้วทำรายการ/ปิดใหม่; ห้ามแก้วันเก่าหากมีวันถัดไปเปิดแล้วใน MVP

## รายจ่าย เงินเจ้าของ โอน คืนและย้อนรายการ

expense UNPAID ไม่มี movement; จ่ายเต็มครั้งเดียว มี expense_payment หนึ่งรายการเท่าจำนวนหนี้
expense และ payment แบบจ่ายทันทีต้อง commit พร้อมกัน; จ่ายภายหลังลงวันที่จ่ายจริง
owner contribution/withdrawal เป็น amount บวก kind เป็นตัวกำหนด delta
transfer ต้องต้นทางต่างปลายทาง ทั้งคู่อยู่ business เดียวกัน; primary amount เท่ากันสองฝั่ง
fee แยก expense และ payment จากบัญชีต้นทางใน transaction เดียว; รับ sourceStoreId/destinationStoreId
ตรวจสิทธิ์ทั้งสองร้านและล็อกทั้งวัน; cross-store transfer เป็น OWNER เท่านั้น
ไม่มี overdraft ทุกบัญชี; lock บัญชีก่อนตรวจยอด; initial balances ต้องครบก่อนเริ่มจริง

refund MVP คืนทั้งยอดคงเหลือเต็มบิลเพียงครั้งเดียว OWNER ระบุเหตุผลและบัญชีจ่ายจริง
refund_allocations แจกคืนเต็มจำนวนแต่ละ sale_payment เดิม ใช้จัดกลุ่มยอดขาย
refund_payouts ระบุบัญชีจ่ายจริง sum = refund amount; ห้าม refund sale ที่ reverse แล้ว
lock sale ก่อนตรวจยอดสะสม; full refund UNIQUE(sale_id); เก็บทางขยายเป็น partial ใน migration ภายหลัง
รายการผิดที่ยืนยันแล้วใช้ reversal ที่ OWNER ทำพร้อมเหตุผล อ้างต้นทาง ไม่แก้ต้นฉบับ
MVP reverse เต็มรายการเท่านั้น: sale/supplemental, expense payment, expense recognition,
owner transaction, transfer; sale ที่คืนแล้วห้าม reverse; expense ต้อง reverse payment ก่อน recognition
reverse recognition ได้เมื่อยังไม่จ่าย; reverse payment ทำให้หนี้ UNPAID และจ่ายใหม่ได้
transfer reverse สองฝั่งพร้อมกันและ reverse fee expense/payment ถ้ามี
refund ไม่ reverse ใน MVP หากลงผิดให้ OWNER ตรวจสอบและแก้ผ่านกระบวนการ support ที่ audit
reversal ลงวัน OPEN ปัจจุบันและเก็บ allocation ยอดขายตามบัญชีรับเดิม; original ไม่เปลี่ยนวัน

## Idempotency และ concurrency

scope UNIQUE(business_id, user_id, key) ทุก mutation รวม admin/config; key UUID จาก client
hash canonical JSON + method + normalized path (รวม store ID); ไม่รวม session/CSRF token
key เดิม/hash ต่าง → IDEMPOTENCY_CONFLICT; key เดิม/hash เดิม → original status/body/reference
ทุกครั้งต้องตรวจ current session/permissions ก่อน replay ไม่ข้ามสิทธิ์เพราะมี key
ไม่ลบ key ที่สำเร็จระหว่าง MVP; ห้าม recycle; validation failure ก่อน transaction ไม่ถือว่า commit key
client timeout เก็บ key/payload/user/store; retry ชุดเดิมเท่านั้น; ห้ามส่งหลังเปลี่ยนผู้ใช้/ร้านอัตโนมัติ

transaction ใช้ READ COMMITTED + explicit row locks ลำดับเดียวกันทุก service:
claim idempotency row → business_days เรียง store/date → sales/expenses ต้นทางเรียง ID
→ financial_accounts เรียง ID → document counter → เขียน source/ledger/audit/response → COMMIT
S2 ล็อก products เรียง ID แบบ FOR SHARE หลังวันและก่อนบัญชี เพื่อให้ snapshot/version ไม่แข่งกับการแก้ราคา
การสร้างวันใช้ store configuration advisory transaction lock ก่อน SELECT/INSERT day เพื่อ serialize กรณีที่ยังไม่มีแถววัน
การสร้าง/เปิดยอดตั้งต้น/เปลี่ยน active บัญชีใช้ gate เดียวกัน เรียง store IDs ก่อน lock account IDs;
ห้ามเปลี่ยนชุดบัญชีระหว่างวัน OPEN (เปลี่ยนชื่อได้) และไม่กระทบลำดับ day/account locks ของธุรกรรมเงิน
S1c ใช้ gate + unique date/partial unique OPEN; การเปิดวันถัดไปปฏิเสธจนมีหลักฐานปิดและ settlement ใน D4
same key concurrent ให้ UNIQUE insert รอ commit แล้วอ่าน response ด้วย statement ถัดไป
ถ้า original rollback คู่แข่งจึง claim ต่อได้; ไม่คง PENDING หลัง crash เพราะ row อยู่ transaction เดียว
ทุก mutation ของวันล็อกวันก่อนตรวจ OPEN และ increment revision รวม refund และ payment
reconciliation confirm ต้อง expectedRevision ตรง แล้วคำนวณใหม่ภายใต้ lock;
stale → 409 STALE_PREVIEW ให้ preview ใหม่แม้ delta อาจเท่าเดิม
close แข่งกับ sale: ผู้ได้ lock ก่อนจบก่อน; close ก่อนแล้ว sale ถูก DAY_CLOSED;
sale ก่อนแล้ว close revision เก่าถูก STALE_PREVIEW ไม่มี sale แทรกหลัง snapshot
โอนต่างร้านล็อกวันทั้งคู่; บัญชีร่วม lock row เดียวทำให้ debit/check balance ต่อเนื่องกัน
deadlock/serialization retry เฉพาะ server transaction ที่ rollback ไม่เกิน 3 ครั้งด้วย key เดิม
