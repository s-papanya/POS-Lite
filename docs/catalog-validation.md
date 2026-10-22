# S1a — API เมนูและราคา

วันที่ 22 ตุลาคม 2026; เป็นส่วนแรกของ S1 ไม่ใช่การปิด S1 ทั้งหมด
เจ้าของยืนยัน P4/P5 แล้วใน session นี้; บัญชี/ledger/วันทำการและหน้า UI จัดเมนูยังเป็นงานถัดไป

## ขอบเขตที่ใช้ได้

ใต้ `/api/v1` มี GET/POST `/stores/:storeId/products` และ PATCH `/stores/:storeId/products/:productId`
OWNER เพิ่ม/แก้ชื่อ ราคา เปิดหรือปิดใช้งานได้; MANAGER/STAFF อ่านเมนู active เฉพาะร้านตน
ร้านที่ไม่มีสิทธิ์ตอบ404; มีสิทธิ์อ่านแต่ไม่มีสิทธิ์แก้ตอบ403
GET active=false เฉพาะ OWNER; default active=true; ยังไม่มีการลบเมนู

ราคาส่งเป็น string หน่วยสตางค์ เช่น `"4500"` =45บาท ต้องบวกและไม่เกิน9000000000000
ไม่รับเลข float/JSON number/ศูนย์/leading zero/authority fields ใน body
DB ใช้ BIGINT; input ตรวจด้วย regex ก่อน BigInt เพื่อตอบ400กับทศนิยมแทนการ throw500
ชื่อ trim และยาว1–120ตัว; product response มี id/name/price/version/active

PATCH ต้อง expectedVersion และอย่างน้อยหนึ่งค่าที่เปลี่ยน; ล็อก product row และเพิ่ม version ทุกครั้งที่สำเร็จ
version เก่าตอบ409 PRICE_CHANGED พร้อม details.product ล่าสุดเพื่อให้ตรวจและยืนยันใหม่
ราคา/ชื่อเดิมในบิลจะใช้ snapshots เมื่อทำ S2; รอบนี้ยังไม่มีบิลให้แก้ย้อนหลัง
Catalog ไม่สร้างยอดขาย/เงินเข้าออกและไม่เปลี่ยน day revision

GET ใช้ keyset `(name,id)`, limit1–100/default30; cursor ผูก store และ active filter
cursor ไม่เพิ่มสิทธิ์และไม่ใช่ snapshot ของ catalog หากมีการแก้ชื่อระหว่างอ่านหลายหน้า

## Transaction และ idempotency

POST/PATCH ต้อง Origin, X-CSRF-Token และ Idempotency-Key(UUID)
ตรวจ session/active memberships, scope และ OWNER ก่อน claim/replay; ตรวจสิทธิ์ซ้ำหลัง unique insert ที่อาจรอคู่แข่ง
payload hash ครอบ method/path/store และ validated payload ที่เรียง fields ตาม Zod schema
key scope `(business,user,key)`; keyเดิม/body/pathต่างตอบ409 IDEMPOTENCY_CONFLICT
keyเดิม/bodyเดิมคืน original status/body แม้ product ถูกแก้ภายหลัง

transaction เดียว reserve key → lock/update product → audit before/after → stored response → commit
ไม่มี response ก่อน commit และไม่มี key ค้างเมื่อ rollback
SQL deferred constraint trigger ตรวจ response สมบูรณ์ตอน commit; reserve `{}` อยู่ได้เฉพาะใน transaction ที่ยังไม่ commit
SQL trigger ห้ามแก้ key metadata และห้าม rewrite response ที่สำเร็จ; runtime ไม่มี DELETE บน products/idempotency
auth/financial histories เดิมไม่ถูกแก้โดย migration นี้

## Migration และหลักฐาน

`0001_catalog.sql` เพิ่ม products/idempotency_records, composite store/actor FKs, bounds/indexes
และ idempotency completion/immutability triggers ที่เขียน SQL เพิ่มหลัง generate
Drizzle snapshot เก็บ tables/indexes ส่วน trigger ต้องดูใน SQL ด้วย
ไม่มี DROP/backfill บนข้อมูล F2; apply ด้วย runner/lock/timeout/checksum เดิม
แก้ปัญหาหลัง apply ด้วย forward migration; ไม่แก้ไฟล์0000/0001หรือ reset volume
ใช้กับ local development แล้ว; staging/production ยังต้องผ่าน R2/backup/restore gate

ผลตรวจบน PostgreSQL17.11:

- สร้าง schema F2 ด้วย migration0000/Drizzle จริง, seed identity fixture แล้ว upgrade0001
  IDs/usernames/password hashes เท่าเดิม และ reapply ผ่าน
- Create/replay คืน id/body เดิม; same key concurrent ได้ผลเดียว; changed payload409
- Two concurrent patches expectedVersion เดียวกันได้200หนึ่งและ409หนึ่ง พร้อม version/ราคาล่าสุด
- Audit เก็บ before/after; stale write ไม่เพิ่ม audit/key
- Failure injection ที่ audit ทำให้ product และ key rollback; DB ไม่ยอม commit response ว่างหรือ rewrite keyสำเร็จ
- ราคา0/cross-business product FK ถูก DB ปฏิเสธ; strict validation, scoped cursor และ pagination ผ่าน
- Deactivate เพิ่ม version; OWNER อ่าน inactive ได้; STAFF แก้/replayหลังลดสิทธิ์ไม่ได้ และไม่เห็นร้านอื่น
- Auth regression suite เดิมผ่าน; ไม่มี mock transaction/row locks/DB

`npm test`:22 tests/5ไฟล์; `npm run test:db`:1 workflow/17กลุ่มตรวจ (รวม F2 และ catalog)
`npm run typecheck`, `npm run lint`, `npm run build` ผ่าน; OpenAPI16paths/56schemas
OpenAPI/shared Zod ตรวจรูปแบบและใช้ response schemas ใน integration; ไม่ใช่ full OpenAPI validator
ยังไม่ได้พิสูจน์ทุก deterministic lock interleaving, production load หรือ Android UI สำหรับเมนู

ส่วน S1 ที่เหลือ: financial_accounts/account_stores, account_openings/money_movements,
business_days/day_openings และกฎ cashหนึ่งร้าน/bankร่วม/no-overdraft/วันก่อนปิดและเคลียร์
จากนั้น S2/S3 จึงเพิ่มการขายและหน้า POS โดยใช้ catalog versions นี้
