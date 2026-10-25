# UX1b — หน้าขายและชำระเงิน

ต่อจาก UX1a ตามคำสั่งทำต่อ: minimal สำหรับแม่ ใช้ white/navy เดิม เป็น refinement ไม่เปลี่ยน visual world

THESIS: เลือกเมนู อ่านยอด ชำระและตรวจเงินทอนได้โดยไม่สับสนกับการบันทึกจริง
OWN-WORLD: ขาว/navy ตัวอักษรหลัก18px controls48px ไม่มี dependencies หรือภาพตกแต่งใหม่
STORY: เมนู → รายการและยอด → บัญชีรับเงินจริง/เงินสด → ตรวจบิล → ผลจาก server
FIRST VIEWPORT: มือถือเมนูเต็มแถวอ่านชื่อยาวได้; แถบยอดมีทางดูรายการและชำระ; payment แสดงยอดก่อนส่วนลดซึ่งเปิดเมื่อใช้
FORM: targeted extension ภายใน incumbent; จอใหญ่แยกเมนู/บิล มือถือหนึ่งคอลัมน์และ focus ตามขั้น
FINISH: finish review และเอกสาร evidence ใน scope; ไม่มี comp/new world หรือ DESIGN ใหม่สำหรับ ordinary refinement

ไม่เปลี่ยน pricing/validation/API/key/payload/identity/retry หรือ default account ไม่เดาบัญชีให้แม่
ทดสอบ preview fixture แยกจากฐานข้อมูลจริง และไม่ถือ desktop browser เป็น Android acceptance
