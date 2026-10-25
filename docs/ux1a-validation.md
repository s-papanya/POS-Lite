# ผลตรวจ UX1a — ตรวจยอดและประวัติ

วันที่ 26 ตุลาคม 2026: ปรับหน้าตรวจยอดและประวัติให้เหมาะกับแม่ตาม [brief](ux1-daily-history-brief.md) โดยรักษาหน้าตาสีขาว/navy เดิม ผล finish review ให้ส่งมอบขอบเขต UX1a หลังแก้ focus; ไม่ใช่การปิด UX1 ทั้งหมดหรือการรับรอง Android เครื่องจริง

## ขอบเขตที่ส่งมอบ

- ตรวจยอดเริ่มที่ “ตรวจยอดทั้งวัน” แยกจาก “เพิ่มยอดตกหล่น” และอธิบายว่ายอดที่กรอกคือยอดขายสุทธิรวมบิลที่ลงแล้ว ไม่ใช่เงินคงเหลือในบัญชี
- เลือกบัญชีและกรอกยอดก่อนเหตุผล ไม่เลือกบัญชีหรือเดาจำนวนเงินแทนผู้ใช้ ก่อนบันทึกต้องเทียบยอดที่บันทึกแล้ว ยอดที่กรอก และส่วนต่าง พร้อมร้าน วัน และเหตุผล
- ประวัติมีวันนี้/เมื่อวานหนึ่งแตะ เก็บช่วงวันที่ไว้ในส่วนที่เปิดเพิ่มได้ แสดงวันที่ไทยและเวลา Bangkok; จำนวน “โหลดแล้ว” เป็นจำนวนบิลที่โหลด ไม่ใช่รายงานรวมทั้งวัน
- จอใหญ่แสดงรายการและรายละเอียดคู่กัน; ต่ำกว่า 960px เลือกบิลแล้วเปลี่ยนไปแสดงรายละเอียดและมีปุ่มกลับรายการ บิลและยอดยาวขึ้นบรรทัดได้
- ย่อส่วนหัวสถานะระบบและข้อมูลบัญชีเพื่อให้ถึงงานหลักเร็วขึ้น ยังคงเปิดอ่านสถานะและตรวจการเชื่อมต่อได้
- เข้า review แล้ว focus ไปหัวข้อ review; กลับแก้ไขและหลังยืนยันสำเร็จ focus ไปหัวข้องาน ตรวจจาก browser หลังแก้ไขแล้ว ประวัติมีการย้าย focus เข้ารายละเอียดและคืนไปบิลที่เลือกใน source

## หลักฐานจาก build

ตรวจ source: `apps/web/src/App.tsx`, `index.css`, `App.css`, `pos/pos.css`, `pos/workflows.css`, `History.tsx`, `DailyWorkspace.tsx`, `Receipt.tsx`, `PosWorkspace.tsx`, `display.ts` และ tests ที่เกี่ยวข้อง อ้างบริบทผลิตภัณฑ์จาก [PRODUCT.md](../apps/web/PRODUCT.md)

ลักษณะภาพที่ใช้จริงในขอบเขตนี้:

1. สีหลัก navy (`#1e3a5f`) บนขาว ข้อความหลัก (`#172b4d`) ข้อความรอง (`#475569`) เส้นแบ่ง (`#cbd5e1`); พื้นอ่อน (`#f4f7fa`, `#edf2f8`) แยกตัวกรอง รายละเอียด และส่วนต่าง
2. Tahoma, Noto Sans Thai, sans-serif ตาม stack เดิม; body 18px/1.65 ข้อความรองบางส่วน 16px หัวข้องาน 26px ลดเป็น 24px บนมือถือ ยอดในรายการ 22px/20px และส่วนต่างใน review 26px
3. **กฎงานก่อนส่วนหัว:** header กระชับ ข้อมูลร้าน/วันอยู่ก่อนแท็บ แล้วจึงเข้าสู่งานตรวจยอดหรือประวัติ
4. **กฎอ่านยอดเต็ม:** ตัวเลขไม่ย่อเป็นหน่วยพัน/ล้าน ใช้การขึ้นบรรทัดกับพื้นที่ยืดหยุ่น; ปุ่มหลักและช่องกรอกสูงอย่างน้อย 48px โหมดตรวจยอดสูงอย่างน้อย 56px
5. **กฎตรวจส่วนต่างก่อนยืนยัน:** พื้นอ่อนและตัวเลขน้ำหนักเข้มเน้นส่วนต่าง ใช้ระยะห่างและเส้นแบ่ง ไม่มีเงาหรือภาพตกแต่งใหม่ใน slice นี้

รายการนี้บันทึกสิ่งที่พบใน build ไม่ใช่การประกาศ design system ใหม่ ไม่มี `DESIGN.md` เดิมให้ปรับ และไม่ได้เปลี่ยน visual world จึงไม่สร้าง `DESIGN.md` หรือ `.impeccable/design.json` ใน ordinary refinement นี้ ข้อความ FINISH ใน brief ที่กล่าวถึง DESIGN.md ใช้โดยมีขอบเขตยกเว้นดังกล่าว

## หลักฐาน browser และภาพ

ใช้ preview server และข้อมูลจำลองทั้งหมด ไม่ใช่การยืนยันยอดหรือ ledger จริง ภาพอยู่ใน `.impeccable/review/ux1a/` ภายในเครื่อง (ignored ไม่รวมใน Git)

| เรื่อง | ผลที่ตรวจได้ |
|---|---|
| ประวัติวันนี้ | โหลด 30 บิล แล้วกดอ่านเพิ่มเติมเป็น 31 บิล |
| เมื่อวาน | แสดง 3 บิลจากข้อมูลจำลอง |
| ค่ายาว | ยอด `90,000,000,000.00` บาทและชื่อยาวแสดงโดยไม่ตัดเลขทิ้ง |
| ตรวจยอดจำลอง | ยืนยัน 500.50 บาท ได้เลขอ้างอิง `REC-20261026-000001` จาก preview server |
| ตรวจซ้ำ | preview ถัดมาแสดงบันทึกแล้ว 500.50 บาท เป้าหมาย 600.50 บาท ส่วนต่าง 100.00 บาท |
| ความกว้าง | หลังแก้ body min-width: viewport 320px ได้ client/scroll 305/305; 360px ได้ 345/345; 768px ได้ 753/753 ไม่มี horizontal overflow ในหน้าที่ตรวจ |
| จอใหญ่ | มีภาพที่ viewport 1440px สำหรับประวัติและ review |
| Focus | ยืนยันหัวข้อ review และหัวข้องานหลังกลับแก้ไขจาก browser |

ภาพรอบยืนยัน: [ตรวจยอดมือถือ](../.impeccable/review/ux1a/daily-mobile.png), [320px](../.impeccable/review/ux1a/daily-320.png), [tablet](../.impeccable/review/ux1a/daily-tablet.png), [review มือถือ](../.impeccable/review/ux1a/daily-review-mobile.png), [review จอใหญ่](../.impeccable/review/ux1a/daily-review-desktop.png), [ประวัติมือถือ](../.impeccable/review/ux1a/history-mobile.png), [ประวัติจอใหญ่](../.impeccable/review/ux1a/history-desktop.png), [รายละเอียดมือถือ](../.impeccable/review/ux1a/detail-mobile.png) ภาพเหล่านี้เป็น browser captures ของ UI ใน repository กับข้อมูลจำลอง ไม่มี raster ที่สร้างใหม่ด้วย image generation

## Checks และข้อจำกัด

ก่อนแก้ focus จุดสุดท้าย `npm test` ผ่าน 42 tests ใน 17 files และ root typecheck/lint/build ผ่าน หลังแก้ focus รัน web build, web typecheck และ web lint ผ่าน พร้อมตรวจ focus review/back ใน browser อีกครั้ง

`display.test.ts` ตรวจวันก่อนหน้าข้ามปี/ปีอธิกสุรทิน เวลา Bangkok และปี พ.ศ. `daily-state.test.ts` ตรวจ default เป็น reconcile, ไม่เดาบัญชี และผูก pending กับ identity/revision/targets เดิม Source ยัง mount งานตรวจยอดไว้เมื่อเปลี่ยนแท็บและเก็บ request/key เดิมสำหรับผลที่ยังไม่ทราบ

ไม่ได้รัน PostgreSQL ซ้ำใน UI slice นี้ ผล browser จำลองไม่พิสูจน์ atomicity, rollback หรือ concurrency ของ backend ผล PostgreSQL เดิมของ D2c2 อยู่ใน [transfers-validation.md](transfers-validation.md)

ยังไม่อ้างว่ารัน browser ซ้ำใน slice นี้ครบทุกกรณีช่วงวันที่กำหนดเอง, loading/empty/error, unknown result, stale preview หรือ session/permission ทั้งหมด แม้ source และ tests เดิมยังมีการจัดการสถานะเหล่านั้น ไม่ได้ทดสอบ screen reader, ขนาดตัวอักษรใหญ่, Android เครื่องจริง หรือให้แม่ทดลองใช้งาน จึงยังเปิด acceptance เหล่านี้และ UX1 ส่วนที่เหลือไว้

ความคลาดเคลื่อนที่ไม่ยกเป็นกฎใหม่: brief กล่าวว่าตัวอักษรหลัก 18px ขึ้นไป แต่ build มีข้อความรอง 16px; stack ฟอนต์ระบบเป็น incumbent ที่รักษาไว้ในงานแคบนี้ ไม่ยกเป็น display-face rule สำหรับหน้าต่อไป ไม่ซ่อมหน้าขายหรือขยายเป็น visual-system redesign นอกขอบเขต
