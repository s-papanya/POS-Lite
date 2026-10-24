# D1c หน้ากรอกยอดเพิ่มเติม/ตรวจยอด — 25 ตุลาคม 2026

เริ่มจาก `e3e4af2`; เพิ่ม DailyWorkspace ในหน้าร้านเดิมสำหรับ OWNER/MANAGER โดยไม่เปลี่ยน API หรือ schema DB
แยก “เพิ่มยอดที่ยังไม่ได้บันทึก” จาก “ตรวจยอดขายรวมทั้งวัน” ด้วยคำอธิบายและขั้นตรวจรายการคนละแบบ
เพิ่มยอดต้องระบุเหตุผล/บัญชี/จำนวนเงินจริง รองรับเงินสด/โอน/แบ่งรับ และตรวจเงินทอนก่อนส่ง
ตรวจยอดรับ signed target รายบัญชี ไม่เติมบัญชี/ยอดแทนผู้ใช้ แสดง recorded/target/delta จาก server
ยอดต่ำกว่าที่บันทึกไม่เปิดให้ลดเงิน; ยอดเท่าเดิมแสดงผล NO_CHANGE พร้อมเลขผลตรวจจาก server

## Draft และผลรอยืนยัน

- sessionStorage แยก user/business/store; daily key ใช้ checkout prefix เดิมต่อท้าย `:daily`
  logout/discard ตรวจและล้างทั้ง POS/daily; corrupt storage ไม่ถูกล้างทิ้งเอง
- ใช้ Zod ตรวจข้อมูลค้าง รวม mode, request, preview revision และ target ให้สอดคล้องกัน
  ประกาศ Zod4.6.7 ที่มีอยู่แล้วเป็น dependency ของ web โดยตรง ไม่เพิ่ม framework/library ชนิดใหม่
- เก็บ key/request ก่อน POST; ตรวจ `/me` และส่ง expected identity headers ทั้งคู่
  pending ล็อกแก้ไข/เปลี่ยนร้าน/logout/เริ่มอีก flow แต่ยังตรวจประวัติและ retry request เดิมได้
- การสลับแท็บไม่ unmount daily workspace; ยืนยันผลจาก server ก่อนล้าง draft หรือแสดงสำเร็จ
- preview ไม่ถูกใช้ต่อหลังแก้ข้อมูล/reload/STALE_PREVIEW; ค่าเดิมยังอยู่ ต้องตรวจและยืนยันใหม่
  pending confirm เก็บ preview เดิมไว้เพื่ออ่านพร้อม key/request เดิม ไม่โหลดมาเปลี่ยน payload เงียบ ๆ

## ผลตรวจจริง

`npm test` ผ่าน36 tests/12 files รวม exact money, signed targets, identity/mode recovery,
preview/request consistency และ Receipt สอง instance มี aria title คนละID
typecheck/lint/build ผ่าน; แชร์ preparePayments กับ POS และตรวจขาย POS35บาทผ่าน browser อีกครั้ง
แก้ fixture timestamp ให้เป็น canonical ISO ตาม schema ก่อน exact-payload regression ผ่าน

Browser ใช้ preview-server.mjs บน loopback เป็นข้อมูลจำลองทั้งหมด ไม่ใช่หลักฐาน ledger/DB:

| กรณี | ผลที่สังเกต |
|---|---|
| เพิ่มยอด100 รับสด200 | ตรวจเงินทอน100ก่อนส่ง; ได้บิล SUP จาก fixture |
| ตรวจยอด500 หลังเพิ่ม100 | recorded100/target500/delta400 แล้วได้ REC400 |
| ตรวจ500ซ้ำ | delta0; แสดงไม่เพิ่มยอดขาย/เงินและเลขผลตรวจ |
| target400 เมื่อ recorded500 | แสดง-100/requires review; confirm disabled |
| revision เปลี่ยน | STALE_PREVIEW กลับกรอกโดยคงค่า; re-preview/ยืนยันใหม่ใช้ keyใหม่; 2mutation POST/1sale |
| commitแล้วตอบ503 | reload ยัง1mutation POST/1sale; retryเป็น2POST/1sale key+payloadเดิม |
| sessionหมดอายุก่อนcommit | กลับlogin; loginบัญชีจำลองเดิมยัง1POST/0sale; กดเองจึง2POST/1sale key+payloadเดิม |
| pendingข้ามflow | POSเพิ่มสินค้า/ชำระถูกล็อก; เปลี่ยนร้านถูกบล็อก; ดูประวัติ/กู้รายการเดิมได้ |
| keep/discard draft | ไปอีกร้านไม่ติดค่า; กลับร้านเดิมได้12.34; ทิ้งแล้วกลับมาเป็นฟอร์มว่าง |
| ไม่มีบัญชี/วันCLOSED | มีคำอธิบายและโหลดบัญชีใหม่; submit disabled; วันปิดยังเข้าประวัติได้ |

ตรวจ360×800และ1440×900: scrollWidth=clientWidth, ปุ่มที่มองเห็นสูงขั้นต่ำ51.3px
mobile POS แถวสินค้าแรก bottom695.1 อยู่เหนือ checkout top701.2 หลังปรับแถบงาน
desktop ขั้นตรวจใช้ความกว้าง720pxตาม review เดิม; ตรวจภาพ preview จริงทั้งสองขนาดแล้ว
ภาพที่จับทันทีหลังเปลี่ยน layout บางครั้งล้ากว่า DOM จึงตรวจด้วย getScreenshot ก่อนใช้ภาพส่งมอบ
console รอบตรวจสุดท้ายไม่พบ error/warn; ไม่ใช้ build เป็นหลักฐาน Android

ไม่มี migration/API change รอบนี้ จึงไม่รัน PostgreSQL integration ซ้ำ; หลักฐาน API/locks/rollback อยู่ใน
[D1a](supplemental-sales-validation.md) และ [D1b](reconciliation-validation.md)
ยังไม่ตรวจ Android เครื่องจริง/soft keyboard/ขยายตัวอักษร, ตัดเน็ตจริง หรือเงินจริงหลัง refund/reversal
STAFF gate ตรวจจากโค้ดและ API เดิม; ไม่ได้ทำ browser fixture STAFF ในรอบนี้
sessionStorage ไม่ใช่ offline queue และไม่รับประกันกู้หลังปิดแท็บ/ล้างข้อมูล browser
ยังไม่ปิด M2/M3 หรือ push/deploy; วันถัดไปยัง fail closed รอ D4 closing/settlement
