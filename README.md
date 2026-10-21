# Family Store Manager

ระบบบริหารร้านก๋วยเตี๋ยวและเบเกอรี่สำหรับครอบครัว ออกแบบให้ใช้บน Android เป็นหลัก

สถานะ: Phase 0 ส่งมอบเอกสารแล้ว และมี React/Vite + Express starter ขั้นต้น
ยังไม่มีฐานข้อมูล migration, authentication หรือธุรกรรมจริง; Foundation ยังไม่ครบเกณฑ์
ตรวจ repository วันที่ 22 ตุลาคม 2026: โฟลเดอร์ว่าง ไม่มี Git และ AGENTS.md ก่อนเริ่มงาน

เริ่มอ่าน [ข้อกำหนด](docs/product-requirements.md), [กฎธุรกิจ](docs/domain-rules.md),
[สถาปัตยกรรม](docs/architecture.md), [ข้อมูลและ ERD](docs/data-model.md),
[API](docs/api-contracts.md), [แผนพัฒนา](docs/implementation-plan.md),
[ตัวอย่างธุรกรรม](docs/transaction-examples.md), [UX](docs/ux-flows.md),
[กรณีตรวจรับ](docs/acceptance-scenarios.md) และ [ผลตรวจเอกสาร](docs/design-review.md)

ติดตามช่วงส่งมอบและเกณฑ์ปิดงานที่ [Milestones](docs/milestones.md)

เก็บคำขอต้นฉบับใน [original-request.th.md](docs/original-request.th.md)
เมื่อเริ่ม session ใหม่ ให้อ่านกฎธุรกิจและรายการรอยืนยันก่อน implementation

ตรวจเอกสารซ้ำ: `python docs/build-core-contract.py` และ `python docs/check-design.py`
(ใช้ Python 3 ที่ติดตั้งไว้; ไม่ต้องติดตั้ง package เพิ่ม)
การตรวจนี้ครอบคลุมโครงสร้างเอกสารและตัวอย่างตัวเลข ยังไม่ใช่การทดสอบระบบจริง
