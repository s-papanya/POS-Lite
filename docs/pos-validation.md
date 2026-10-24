# S3 หน้าขาย POS — 24 ตุลาคม 2026

เพิ่มหน้าขายบน React เดิม: ค้นเมนู ตะกร้า/จำนวน ส่วนลดบาทหรือเปอร์เซ็นต์ เงินสด/โอน/แบ่งชำระ
ตรวจร้าน/วัน/ยอด/บัญชี/เงินรับ/เงินทอนก่อนยืนยัน แล้วแสดงเลขบิลและประวัติจาก server เท่านั้น
เงินคำนวณด้วย BigInt สตางค์; server ตรวจราคาและสิทธิ์ตามเดิม ไม่มี migration ใหม่

## การรักษาบิลค้าง

- draft และ pending อยู่ใน sessionStorage แยก user/business/store ไม่มี token หรือรหัสผ่าน
- บันทึก key/request ก่อน POST; timeout/ผลไม่แน่ชัดล็อกแก้ไขและเปลี่ยนร้าน/ออกจากระบบ
  reload คืนบิลเดิม แต่ไม่ส่งเอง ผู้ใช้ต้องกดตรวจผลด้วย request/key เดิม
- ตรวจ `/me` ก่อนส่ง และส่ง X-Expected-User-Id/X-Expected-Business-Id ทั้งคู่
  backend ปฏิเสธ session ที่เปลี่ยนก่อน claim key; headers เป็น optional สำหรับ client เดิม
- PRICE_CHANGED แสดงราคาเดิม/ใหม่ ต้องรับราคาใหม่และตรวจชำระซ้ำก่อนสร้างคำขอใหม่
- เก็บ/ทิ้ง/อยู่ต่อก่อนเปลี่ยนร้านที่มี draft; วันเก่าต้องตรวจประวัติก่อนเริ่มใหม่
- ข้อมูลเก็บค้างอ่านไม่ได้จะไม่ล้างทิ้งเอง และปิดการส่งบิลเพื่อให้เจ้าของตรวจประวัติ/กู้ข้อมูล

## ผลตรวจจริง

| ตรวจ | ผล |
|---|---|
| npm run typecheck / lint / build | ผ่านทุก workspace |
| npm test | ผ่าน 29 tests / 8 files; รวม exact money/date/pending scope/corrupt storage |
| npm run test:db | ผ่าน 1 integration workflow บน PostgreSQL local; เพิ่ม identity-switch regression จาก S2 |
| docs/build-core-contract.py + docs/check-design.py | ผ่าน 23 paths / 73 schemas; structural checks เท่านั้น |
| Browser 360×800 / 1440×900 | เมนู/ตรวจบิลไม่มี horizontal overflow; คง 18px body/48px controls |

HTTP tests ต้องใช้ loopback; sandbox EACCES ผ่านเมื่อรันด้วยสิทธิ์ local network
ครั้งแรก PostgreSQL ปิดอยู่ทำให้ ECONNREFUSED; เปิด Compose volume เดิมแล้วรันใหม่ผ่าน
identity-switch fixture ครั้งแรกหา OWNER อีกคนที่ไม่มี แก้ให้สร้างเองแล้วรันผ่าน

Browser ใช้ `node apps/web/test/preview-server.mjs` ที่ 127.0.0.1:5180
เป็น API จำลองแยกจากฐานข้อมูล ไม่มีข้อมูลร้านจริงและไม่ใช่หลักฐานการลง ledger
fixture ไม่ถูก import เข้า production bundle:

- ขาย 105.00 ลด 5% เป็น 99.75; cash 40.00 รับ100.00 ทอน60.00 และโอน59.75
  แสดงใบยืนยัน ประวัติ และรายละเอียดบิลได้
- จำลอง commit แล้วตอบ503: reload ไม่ POST เอง; กดตรวจผลเป็น 2 requests/1 bill key+payload เดิม
- จำลอง commit แล้วรอตอบ10วินาที: client timeout8วินาที แสดงไม่ทราบผล/ล็อกแก้ไข
  reload ยัง 1request/1bill; กดตรวจผลแล้ว 2requests/1bill key+payload เดิมและเลขบิลเดิม
- ราคา35→40: รับราคาใหม่แล้วต้องแก้ยอดชำระ ตรวจซ้ำและใช้ key ใหม่ ได้เพียงบิลเดียว
- เปลี่ยนร้านเมื่อมี draft: controls ขายถูกล็อกขณะเลือกเก็บ/ทิ้ง/อยู่ต่อ
  เก็บแล้วไปร้านอื่นไม่ติดรายการเดิม กลับร้านเดิมได้จำนวน/ยอดเดิม

## Review และข้อจำกัด

ใช้ Impeccable finish reviewer แบบ fresh context; reviewer เดิมหายระหว่าง turn จึงเปิดใหม่
หลังแก้ reviewer ให้ checkout overlay และ mobile first viewport เป็น resolved
desktop checkout อยู่ใน flow; mobile สินค้าแถวแรก bottom698 อยู่เหนือแถบชำระ top701.2
review disposition ยังเป็น `fix` เฉพาะ protocol FORM: reviewer บังคับ seed reference
แต่ new-work.md ห้าม roll สำหรับ local extension จึงไม่สร้าง seed เทียม/เปลี่ยน visual world
ข้อค้างนี้เป็นความขัดกันของ skill instructions ไม่ใช่ finding ของ UI; ไม่อ้าง whole-surface ship
หลักฐาน design preservation แยกใน [pos-design-evidence.md](pos-design-evidence.md)

ยังไม่ได้ตรวจ Android เครื่องจริง/soft keyboard/ขยายข้อความ, ตัดอินเทอร์เน็ตจริง,
session หมดอายุแล้ว login คืนผ่าน browser และ empty/closed fixture ทุกสถานะ
ยังไม่มี browser automation regression suite; หน้าขายจริงกับ API/DB ตรวจแยกชั้น
sessionStorage ไม่ใช่ offline queue และไม่รับประกันกู้หลังปิดแท็บ/ล้าง browser data
วันถัดไปยัง fail closed จนมี D4 closing/settlement; M2 ยังไม่ปิดและยังไม่พร้อม production

งานถัดไป: Android acceptance และ D1 เพิ่มยอด/กระทบยอดตามแผน โดยคง gate วันถัดไปเดิม
