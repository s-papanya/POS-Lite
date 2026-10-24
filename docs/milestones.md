# Milestones

สร้างวันที่ 22 ตุลาคม 2026; ยังไม่กำหนดวันครบกำหนดเพราะยังไม่มีประมาณการจาก implementation
สร้าง GitHub milestones แล้วใน origin `https://github.com/s-papanya/POS-Lite.git`
ตรวจผ่านหน้า GitHub แล้วว่าครบ 8 รายการ Open และ 0 Closed ไม่มี due date
ดู [รายการ milestones บน GitHub](https://github.com/s-papanya/POS-Lite/milestones)
งานย่อยและรายละเอียดตรวจรับอยู่ใน [implementation-plan.md](implementation-plan.md)
สถานะ complete ต้องมีหลักฐานตาม [acceptance-scenarios.md](acceptance-scenarios.md)

| Milestone | สถานะเริ่มต้น | งานย่อย | ขึ้นกับ | เกณฑ์ปิด |
|---|---|---|---|---|
| M0 — Product & Domain Design | เอกสารส่งมอบแล้ว; P1–P5 ยืนยันแล้ว | Requirement, rules, ERD, permissions, contracts, UX, acceptance | — | เจ้าของยืนยัน P4/P5; เอกสารไม่ขัดกัน; แผนครบ A–P; บันทึกข้อจำกัด OpenAPI core subset |
| M1 — Foundation & Secure Access | F1/F2 implement และผ่าน local validation; GitHub ยัง Open | F1, F2 | M0 เฉพาะข้อออกแบบที่เกี่ยวข้อง; F1 เริ่มได้ก่อน P4/P5 | monorepo/scripts/config/Compose พร้อม; migrations DB จริง; login/CSRF/session/rate limit/store isolation ผ่าน; ไม่มี secret ใน log |
| M2 — Catalog, Accounts & POS | S1a–c/S2/S3 implement และตรวจ local; ยังรอ Android เครื่องจริง ดู pos-validation.md | S1, S2, S3 | M1 และ P4/P5 ยืนยันแล้ว | ขาย/แบ่งชำระ/เงินทอน/ส่วนลด/ราคา snapshot/history; idempotency/rollback; A,E,M,N,P ผ่านและ Android flow ใช้ได้ |
| M3 — Supplemental Sales & Reconciliation | D1a API เพิ่มยอดตรวจ local แล้ว; preview/confirm/UI ยังไม่เริ่ม | D1 | M2 | B,C,D,F,G ผ่าน PostgreSQL จริง; signed net target; preview revision/recompute; สองอุปกรณ์ไม่เพิ่มยอดซ้ำ |
| M4 — Expenses & Money Operations | ยังไม่เริ่ม | D2 | M2; ทำขนาน M3 ได้เมื่อมีผู้รับผิดชอบ | H,I,J ผ่าน; unpaid ไม่ลดเงิน; owner flows แยกจากยอดขาย; transfer/fee atomic; shared bank ไม่รวมซ้ำ |
| M5 — Refunds & Audited Corrections | ยังไม่เริ่ม | D3 | M3, M4 | O ผ่าน; full refund ไม่เกิน/ไม่ซ้ำ; คืนวันปัจจุบันไม่แก้วันเก่า; reversal ตามชนิด source ครบ; OWNER-only พร้อม audit |
| M6 — Cash Closing & Reopening | ยังไม่เริ่ม | D4 | M5 | K,L ผ่าน; sale/close race ถูกต้อง; immutable closing snapshots; settlement แยกและครั้งเดียว; reopen มีเหตุผลและ reverse settlement |
| M7 — Reports & Operational Readiness | ยังไม่เริ่ม | R1, R2 | M6 | รายงานจริงแยกร้าน/รวมถูก; A–P ผ่านทั้งหมดพร้อมหลักฐาน; แม่ทดลอง Android; backup/restore rehearsal สำเร็จ; deployment config review และเจ้าของอนุมัติก่อนเผยแพร่ |

MVP ถือว่าครบเมื่อ M1–M7 ผ่านเกณฑ์ ไม่ถือว่าเสร็จจาก build ผ่านอย่างเดียว
Recipe, Inventory และ Production เป็นงาน Phase 5 ภายหลัง MVP จึงยังไม่สร้าง milestone ส่งมอบที่มีวันกำหนด

## สภาพจริงก่อน initial commit

ส่วนนี้เป็นประวัติก่อน F1; สถานะล่าสุดและผลรันอยู่ใน [foundation-validation.md](foundation-validation.md)

มี npm workspace, root lockfile, React/Vite starter และ Express `/api/v1/health` ขั้นต้น
ยังไม่มี PostgreSQL/Compose/migrations/auth/ธุรกรรม และ frontend ยังเป็นหน้า starter
root build ใช้ `--if-present` และ API ยังไม่มี build script จึงห้ามใช้ root build ผ่านเป็นหลักฐานว่า API build แล้ว
API test script ยังเป็น placeholder ที่จบด้วย failure; ยังไม่ถือว่ามี test suite
มี lockfile ซ้อนที่ apps/web จาก scaffold; F1 ต้องจัดให้ใช้ root lockfile เดียวหลังตรวจ dependency/install
ไม่แก้ business implementation ในงาน commit/milestone ครั้งนี้

ผลตรวจ initial commit (22 ตุลาคม 2026): API `typecheck`, web `build` และ web `lint` ผ่าน
ตรวจเอกสารผ่าน: 6 เอกสารบังคับ, 16 local links, 6 core paths, 186 schema refs และเลขตัวอย่าง
ยังไม่ได้รัน business tests/PostgreSQL/Android; ผลนี้ยังไม่ทำให้ M1 ปิดได้

## GitHub milestones ที่สร้างแล้ว

| แผน | หมายเลข GitHub | ลิงก์ |
|---|---|---|
| M0 | 1 | [Product & Domain Design](https://github.com/s-papanya/POS-Lite/milestone/1) |
| M1 | 2 | [Foundation & Secure Access](https://github.com/s-papanya/POS-Lite/milestone/2) |
| M2 | 3 | [Catalog, Accounts & POS](https://github.com/s-papanya/POS-Lite/milestone/3) |
| M3 | 4 | [Supplemental Sales & Reconciliation](https://github.com/s-papanya/POS-Lite/milestone/4) |
| M4 | 5 | [Expenses & Money Operations](https://github.com/s-papanya/POS-Lite/milestone/5) |
| M5 | 6 | [Refunds & Audited Corrections](https://github.com/s-papanya/POS-Lite/milestone/6) |
| M6 | 7 | [Cash Closing & Reopening](https://github.com/s-papanya/POS-Lite/milestone/7) |
| M7 | 8 | [Reports & Operational Readiness](https://github.com/s-papanya/POS-Lite/milestone/8) |

ทุกรายการมี scope/dependencies ที่เกี่ยวข้องและเกณฑ์ปิดตามแผน ไม่ได้สร้าง issues เพิ่มในรอบนี้

## การดูแลต่อบน GitHub

อ่าน milestones ที่มีอยู่ก่อน สร้างเฉพาะชื่อที่ยังไม่มี พร้อม scope/เกณฑ์ปิดตามตาราง
M0 ยังไม่ควร close จน P4/P5 ยืนยัน; milestone อื่นเป็น OPEN
สร้าง issue แยกตาม F1–R2 เมื่อตกลงเริ่ม implementation; ไม่สร้าง issue จำนวนมากโดยอัตโนมัติในรอบนี้
ไม่ใส่ due date หรือ assignee โดยเดา และบันทึก URL/หมายเลข milestone กลับในเอกสารนี้หลังสร้างจริง
