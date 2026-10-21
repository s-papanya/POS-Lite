# ตัวอย่างครบวงจร

ตัวเลขในหน้านี้เป็นบาทเพื่อให้อ่านง่าย ใน DB/API ต้องคูณ 100 และใช้ integer string
ใช้ข้อมูล fixture เท่านั้น ไม่ใช่ยอดร้านจริง

## ขาย ปิดเงินสด และยกวัน

ร้านก๋วยเตี๋ยว N มี cash C และ bank B; ร้านเบเกอรี่ K แยก cash K-C
ก่อน cutover OWNER ตั้ง account_opening C=500 หนึ่งครั้ง: movement +500 type opening ไม่ใช่ยอดขาย
สร้างวัน N/2026-10-22: day OPEN revision=0, day_opening(C)=500 ไม่มี movement เพิ่ม

| ขั้น | แถวที่เกิดใน transaction | ยอดขายสุทธิ N | Ledger C | ผลอื่น |
|---|---|---:|---:|---|
| ขายก๋วยเตี๋ยว 2×50 รับ 200 ทอน 100 | sale S1 gross/net=100, 1 item snapshot qty2, payment cash100/tender200/change100, movement +100, audit, idempotency response | 100 | 600 | day revision1; ออก ref ND-20261022-S-000001 |
| ขายเพิ่มอีก 900 ผ่าน POS | sale S2/items/payment900/movement+900/audit/key | 1,000 | 1,500 | revision2; bakery ยังคง0 |
| รายจ่าย 200 จ่ายทันที | expense200/payment200/movement-200/audit/key | 1,000 | 1,300 | expense recognized200/paid200; revision3 |
| ถอนส่วนตัว 100 | owner WITHDRAWAL100/movement-100/audit/key | 1,000 | 1,200 | รายจ่ายยัง200; revision4 |
| preview ปิดวัน | read only: opening500 + sales1000 - paid200 - withdrawal100 | 1,000 | 1,200 | expected1200, revision4 |
| นับได้ 1,150 และปิด | closing v1, line expected1200/counted1150/variance-50/reason, day CLOSED revision5, audit/key | 1,000 | 1,200 | ไม่มี movement; ยังมีส่วนต่างรอเคลียร์ |
| OWNER ยืนยันปรับส่วนต่าง | settlement -50/movement-50/audit/key, day revision6 | 1,000 | 1,150 | cash shortage แยกจาก operating expense |
| เปิดวันถัดไป | day ใหม่ OPEN, opening snapshot1150 | 0 ของวันใหม่ | 1,150 | ไม่มี movement เปิดวันซ้ำ; วันเก่าเก็บ closing v1 |

ทุกขั้นที่สำเร็จมี server ID/ref; ถ้า payment insert ล้มเหลวที่ขั้นแรก sale/item/key/audit/movement
ต้องหายทั้งชุด rollback; ถ้า commit แล้ว response หาย retry key เดิมได้ sale เดิม reference เดิม
ยอดบัญชีธนาคาร B และ cash K-C ไม่เปลี่ยนจากเหตุการณ์ชุดนี้

## POS ร่วมยอดสรุปและ concurrency

วัน/บัญชีเงินสดอีก fixture: POS300 → supplemental100 → recorded400
preview target500 คืน revision2, delta100, projected net500 และ cash effect+100
confirm expectedRevision2 สร้าง reconciliation_record/line + sale kind RECONCILIATION100
+payment100+movement100+audit/key; recorded รวมเป็น500 revision3
ส่ง key เดิมคืน result เดิม; key ใหม่ preview target500 ที่ revision3 → delta0
confirm บันทึก NO_CHANGE record และ increment revision4 ไม่มี sale/payment/movement
สองเครื่อง preview revision2 เหมือนกัน เครื่องแรก commit อีกเครื่องได้ STALE_PREVIEW
หลัง preview ใหม่ target500 delta0; ไม่มีทางเพิ่ม100สองครั้ง
target400 ขณะ recorded500: preview requiresReview; confirm 409 ไม่มี mutation

## แบ่งชำระ ส่วนลด และราคาเปลี่ยน

gross105, ส่วนลด5%=5.25 net99.75; cash40 รับ50 ทอน10 + bank59.75
ledger cash+40/bank+59.75 ไม่ใช่ cash+50; API net="9975"
เปลี่ยนราคา product version1→2 หลังโหลด: POST expectedVersion1 ได้409 PRICE_CHANGED
ไม่สร้าง sale/payment/ledger ผู้ใช้ตรวจยอดและยืนยันใหม่ด้วย expectedVersion2/keyใหม่
sale เก่า snapshot105 ไม่เปลี่ยนหลัง update เมนู

## คืนข้ามวันและข้ามบัญชี

วันแรกขาย100 รับ bank B; วันแรกปิดแล้ว วันที่สองคืนเต็ม100 จาก cash C
refund อ้าง sale วันแรก, allocations offset original payment B100, payout C100,
movement C-100 อยู่วันสอง; วันแรกยอดขายยัง100, วันสอง net sales=-100 ถ้าไม่มีขายอื่น
reconciliation วันสอง bucket BANK/B recorded=-100 ไม่ใช่ cash/C -100
กรอก target BANK/B=-100 ได้เพราะเป็นยอดสุทธิ: delta0 ไม่สร้าง sale/movement
UI แสดงยอดติดลบพร้อมรายละเอียดคืนเงิน ห้ามกรอก0อัตโนมัติ เพราะจะเพิ่มขาย100ผิดความหมาย
หากวันที่สองขาย bank150 หลังคืน100 bucket recorded50; targetสุทธิ50 delta0
preview ต้องอธิบายผลต่อยอดขาย bucket B และเงินจ่ายจริง C แยกกัน
refund ซ้ำ/เกิน/จาก sale reverse แล้วถูกปฏิเสธ ไม่มี ledger ซ้ำ

## ธนาคารร่วมและโอนต่างร้าน

บัญชี B เดียว map N และ K: N รับ300 K รับ200 → balance B500 ทั้งกิจการไม่ใช่1000
ร้านเห็น attributed cash flow300/200 ซึ่งไม่ใช่เงินฝากจริงคนละบัญชี
OWNER โอน C ของ N ไป K-C ของ K 100: transfer OUT -100/IN +100 atomically
ยอดกิจการรวมไม่เปลี่ยน; fee10 สร้าง expense/payment แยกทำให้รวมลด10
expense recognition fee อยู่ร้านต้นทาง ไม่ทำให้ยอดขายลด
