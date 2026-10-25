# UX1a — ตรวจยอดและประวัติสำหรับแม่

เจ้าของยืนยัน26ตุลาคม2026: เริ่มที่หน้าตรวจยอด/ประวัติ, minimal, ไม่มีแอปตัวอย่าง ต้องเหมาะกับแม่และใช้ง่าย
ขอบเขตรอบนี้เป็น refinement ภายใน white/navy เดิม ไม่ใช่การเปลี่ยน visual world ทั้งแอป
การสำรวจ world ก่อนคำตอบถูก supersede โดย scope ที่เจ้าของระบุ; ไม่มี comp ที่อนุมัติและไม่มี raster ใหม่

## ปัญหาที่เห็นจาก incumbent

- ที่360×800 ส่วนหัวหลายชั้นกินพื้นที่จนช่องยอดยังไม่อยู่ในจอแรก และเหตุผลอยู่ก่อนบัญชี/จำนวนเงิน
- เข้าแท็บงานยอดขายเริ่มที่เพิ่มยอดตกหล่น ทั้งที่งานแม่คือการตรวจยอดรวม เสี่ยงเลือกความหมายผิด
- ประวัติมี date fieldsสองช่องเต็มหน้ามือถือ ไม่มีทางลัดวันนี้/เมื่อวาน และไม่มีโครง master/detail บนจอใหญ่
- วันที่แสดงแบบ ISO/รูปแบบbrowser และชื่อบิลยาวต้องจัดใหม่ ไม่ใช้ยอดรวมจากหน้าที่โหลดบางส่วนเป็นรายงานทั้งวัน

## Direction contract

THESIS: ให้แม่ตอบได้ทันทีว่ากำลังตรวจวันไหน บัญชีไหน และส่วนต่างจะเปลี่ยนยอดอย่างไร โดยแยกงานอ่านประวัติจากงานเขียนยอด
OWN-WORLD: คงสีขาว/navyและ controls มาตรฐาน; ชั้นพื้นอ่อนแยกงาน ตัวอักษรหลัก18pxขึ้นไป ปุ่มอย่างน้อย48px ไม่มี gradients/การ์ดตกแต่ง/animationประดับ
STORY: ประวัติดูวันนี้หรือเมื่อวานได้หนึ่งแตะ เลือกบิลแล้วดูรายละเอียด; ตรวจยอดเริ่มที่ยอดรวม เลือกบัญชี กรอกยอด เหตุผล แล้วเทียบก่อนยืนยัน
FIRST VIEWPORT: headerสุขภาพระบบ compact; store/date/taskนำ; มือถือหนึ่งคอลัมน์เห็นตัวเลือกวันหรือบัญชีแรกเร็ว จอใหญ่ประวัติเป็น list/detail และ reviewเน้นส่วนต่าง; ตัวเลขเต็มไม่ตัดทิ้ง
FORM: targeted code-led refinement ตามคำตอบเจ้าของ คง incumbent world; ไม่มี world/comp assignment ที่ต้องเลือกใหม่ บัญชี/ยอดไม่ถูกเดาให้
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## ขอบเขตที่รักษา

API/auth/scope/เงินสตางค์/idempotency/pending payload/retry/keep-discard ไม่เปลี่ยน
DailyWorkspaceยัง mounted ตอนซ่อนแท็บ; reviewเก็บ original revision/targets เมื่อ pending; zero/negative/staleไม่ post อัตโนมัติ
ไม่มี UIรายจ่าย/โอนใหม่ใน sliceนี้; งานS3อื่นยังไม่รับรองใหม่จากผลเฉพาะสองหน้าจอนี้
ตรวจ browser320/360/768/1440, long values/labels, loading/empty/error/detail, reconciliationpreview/unknown/stale; Androidจริงแยกต่างหาก
