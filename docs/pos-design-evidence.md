# หลักฐานการคงระบบภาพเดิม — S3 POS

ตรวจวันที่ 24 ตุลาคม 2026 สำหรับ ordinary extension ของ StoreAccess ตาม [surface brief](pos-surface-brief.md) และ [PRODUCT.md](../apps/web/PRODUCT.md) โดยยึดโค้ดที่ส่งมอบเป็นหลัก ไม่มีการอนุมัติเปลี่ยนระบบภาพถาวร

## หลักฐานที่ตรวจ

- อ่าน `apps/web/src/App.css`, `apps/web/src/index.css`, `apps/web/src/pos/pos.css` และสุ่มตรวจส่วนเลือกเมนู ตะกร้า ชำระเงิน ตรวจบิล และสถานะรอยืนยันใน `PosWorkspace.tsx` รวมถึงการครอบ workspace ใน `StoreAccess.tsx`
- `git diff --numstat -- apps/web/src/App.css apps/web/src/index.css` ไม่มีรายการเปลี่ยนแปลง: stylesheet เดิมยังคงอยู่ ส่วนขยายใช้กฎเพิ่มเติมใน `pos.css`
- เปิดภาพ `.impeccable/review/mobile-menu.png`, `desktop-menu.png`, `mobile.png`, `desktop.png`, `mobile-unknown.png` ครบ ภาพเมนูแสดงตะกร้าว่าง ภาพ mobile/desktop แสดงขั้นตรวจบิล และภาพ unknown แสดงบิลรอยืนยันพร้อมปิดการกลับแก้ไข ภาพเป็นหลักฐาน browser fixture จำลอง ไม่ใช่ข้อมูลขายจริงหรือหลักฐาน PostgreSQL
- อ่าน `impeccable/reference/document.md` และข้อ ordinary extension ใน `new-work.md`: คงระบบเดิมและรายงานหลักฐาน จึงไม่สร้าง `DESIGN.md` หรือ `.impeccable/design.json` เพียงเพราะไฟล์ยังไม่มี

## สิ่งที่ส่วนขยายคงไว้

| เรื่อง | หลักฐานจากโค้ดและภาพ |
|---|---|
| สี | พื้นขาว ตัวอักษร `#172b4d`, primary `--color-primary: #1e3a5f`, muted `#475569`, border `#cbd5e1`; POS ใช้ custom properties เดิมกับปุ่ม แท็บ และเส้นแบ่ง |
| ตัวอักษร | `Tahoma, 'Noto Sans Thai', sans-serif`; body 18px / line-height 1.65 เดิม หัวร้าน POS 28px และ 26px บน mobile, หัวส่วน 24px, ยอดหลัก 24px และ 22px บน mobile เป็นลำดับชั้นที่ใช้อยู่จริงในส่วนขยาย |
| ปุ่มและช่องกรอก | กฎเดิมของ StoreAccess ให้ปุ่ม primary navy/ขาว ปุ่ม secondary ขาว/navy มุม 8px และความสูงขั้นต่ำ 48px; POS ใช้กฎเดิมและเพิ่ม select ให้เข้ากัน รวม focus outline เดิม 3px offset 4px |
| พื้นผิวและระยะ | ใช้เส้นแบ่ง 1px และพื้นอ่อน `#f8fafc` กับเมนู ไม่มี box-shadow ใน CSS ที่ตรวจ; ไม่เพิ่มภาพตกแต่งหรือ raster asset สำหรับส่งมอบ |
| Responsive | breakpoint 720px เดิม; desktop จับคู่เมนูกับตะกร้า mobile เรียงลง แถบยอดใช้ sticky bottom พร้อม safe-area และ focus scroll-margin; รายการเงินจัดชิดขวาและใช้ tabular-nums |

ตารางนี้บันทึกค่าที่สังเกตได้ ไม่ได้สร้าง token ใหม่ กฎห้ามใหม่ หรือรับรองค่าทุกรายการเป็นระบบภาพถาวร

## ขอบเขตและสิ่งที่ยังไม่รับรอง

รายละเอียด browser disclosure ที่เห็นเป็นสามเหลี่ยมมาจาก `<details>/<summary>` จริง ไม่ใช่ glyph icon ที่เขียนแทนไอคอน การลดความสูง header และซ่อน tagline บน mobile เป็นการจัดพื้นที่ของ POS โดยยังใช้ภาษาและรูปแบบเดิม

FORM ใน brief ระบุว่าเป็นส่วนขยายที่กำหนด UX แล้ว จึงไม่ใช้ concept tournament; reviewer คง disposition `fix` เฉพาะข้อขัดกันของ protocol ที่บังคับ seed แม้ new-work ห้าม roll สำหรับ local extension ไม่สร้าง seed เทียมหรืออ้าง ship แทน verdict ภาพกับ CSS ที่ตรวจไม่พบการเปลี่ยน palette/typeface/radius เดิมที่ต้องแก้ระบบภาพในรอบเอกสารนี้

ไม่ได้รัน application tests หรือเก็บ computed styles/browser capture ใหม่ในรอบเอกสาร การใช้จริงบน Android และการยอมรับจากครอบครัวยังต้องตรวจแยกตาม PRODUCT.md
