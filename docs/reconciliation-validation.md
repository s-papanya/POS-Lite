# D1b API กระทบยอด — 25 ตุลาคม 2026

เริ่มจาก `d1303d5`; เพิ่ม preview/confirm สำหรับ OWNER/MANAGER ตาม API contracts
preview อ่าน REPEATABLE READ READ ONLY transaction เดียว ไม่เปิดวันหรือสร้าง key
ไม่มีวันคืนrevision0; วัน CLOSED อ่านได้; target แยกบัญชี/channel และบัญชีที่ไม่ระบุไม่เปลี่ยน
confirm claim key → ensure/lock day → check expectedRevision → lockบัญชีเรียงID → recompute
deltaติดลบ409; deltaบวกสร้าง REC sale ต่อบัญชีพร้อม payment/ledger/reason; delta0ไม่สร้างsale
ทั้งชุดและ record/lines/audit/stored response อยู่ transaction เดียว
revision เพิ่มต่อsaleที่สร้าง หรือ1สำหรับzero-only NO_CHANGE; replayคืนผลเดิมแม้วันปิดแล้วแต่ตรวจสิทธิ์ก่อน

## สิ่งที่ตรวจจริง

- `npm test`: 33 tests / 11 files ผ่าน รวม signed target, omitted bucket, negative delta ไม่ clamp และ receipt แยก RECONCILIATION
- `npm run test:db`: 1 integration workflow บน PostgreSQL local จริง เพิ่ม6 check groups
- B/D: POS300 + เพิ่มยอด100 → target500 สร้างส่วนต่าง100, ledger500 ไม่เพิ่มซ้ำ
- C: target500อีกครั้ง เก็บ NO_CHANGE/audit/revision โดยจำนวนsales/movementsคงเดิม
- G: target400 แสดงdelta-100/requiresReview; confirm409 และทุกตารางเดิมไม่เปลี่ยน
- F: hold day row lock แล้วรอให้สองHTTP connectionsติดlockจริงด้วย pg_blocking_pids/pg_stat_activity
  ปล่อยแล้วหนึ่ง201 อีกหนึ่ง409 STALE_PREVIEW; re-preview delta0 และยอดเงินจริงไม่ซ้ำ
- หลายบัญชี: inject error ที่ RECONCILIATION_CONFIRMED audit หลังสร้างsales/lines
  ตรวจ source/payment/ledger/day/counter/record/audit/key rollback ทั้งชุด; retry keyเดิมพร้อมกันได้ผลเดียว
- replayเดิมได้id/reference/bodyเดิม; เปลี่ยนreason keyเดิม409
- STAFF403; MANAGERconfirmได้; ลดroleแล้วreplay keyตัวเอง403; foreign account404; future timestamp422
- CLOSED preview200/confirm409 แต่ committed keyเดิม replay201
- direct SQL: headerเปล่า, recordedปลอม และ REC saleที่มีpayment/ledgerครบแต่ไม่มีsource line ถูกdeferred guardปฏิเสธ
  runtimeแก้recordเก่าไม่ได้; history responseรวมชนิดRECผ่านZod
- `npm run typecheck`, `npm run lint`, `npm run build` ผ่าน
- OpenAPI generator + design structural checks: 24paths/80schemas ผ่าน; ไม่ใช่ full OpenAPI validation

รอบแรกพบalias `old` ชนกับตัวแปร OLD ของ PostgreSQL trigger ทำให้commit500
แก้เป็น prior_sale โดยคง validation ทั้งหมด แล้วรัน integration ใหม่ผ่าน

## Migration และขอบเขต

0006 เพิ่ม reconciliation_records/lines, composite tenant/store/day/account/sale FKs และ INSERT-only runtime grants
checksบังคับdelta>=0, delta=target-recorded, delta0ไม่มีsale/บวกต้องมีsale; linked saleใช้ได้ครั้งเดียว
deferred guardsตรวจ header/line/account type/recordedยอดเดิม, revision, REC kind/amount/reason/time/actor และpayment
เปิดชนิดRECONCILIATIONในsales/counter โดยไม่แก้migration0000–0005หรือเปลี่ยนบิลเก่า
`npm run db:migrate` ผ่านกับdevelopment localที่CLIตรวจidentity; ไม่reset/seedทับและไม่applyremote

upgrade fixture เริ่มDBว่าง migrate0000–0005 สร้างPOS+SUPPLEMENTAL พร้อม snapshot/payments/ledger/references
แล้วmigrate0006ซ้ำสองครั้ง ตรวจข้อมูลเดิมตรงกัน รวมopening123.45+POS12.00+SUP20.00=155.45
DDLต้องlock sales/counterและสร้างตารางใหม่; runner bounds lock5s/statement30s พร้อมchecksum/advisory lock
ห้ามdown migrationไปkindเก่าหลังมีREC; recoveryใช้forward repair/แอปที่อ่านข้อมูลใหม่ได้
ต้องอัปเดตweb/APIก่อนเปิดใช้ชนิดใหม่เพื่อไม่ให้clientเก่าปฏิเสธhistory

แหล่งข้อมูลปัจจุบันมีเฉพาะsale payments จึงรวมPOS/SUPPLEMENTAL/RECONCILIATION
เมื่อD3มีrefund/reversal ต้องเพิ่มoriginal-payment allocationsทั้งservice aggregateและDB guardในงานเดียวกัน
signed arithmeticตรวจด้วยunit testsแล้ว แต่ยังไม่มีหลักฐานnegative netหลังrefundจริงในPostgreSQL
ไม่มีหน้ากรอกกระทบยอดจน D1c; ยังไม่ตรวจbrowser/Androidของข้อความประวัติใหม่หรือbackup/restore
ไม่push/deployหรือปิดM3; วันถัดไปยังfail closedจนมีD4 closing/settlement
