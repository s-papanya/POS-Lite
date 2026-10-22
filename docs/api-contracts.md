# REST API contracts

Base `/api/v1`; JSON UTF-8; UUID identifiers; amount เป็น integer string หน่วยสตางค์
day revision/expectedRevision เป็น nonnegative integer string รองรับ PostgreSQL BIGINT โดยไม่เสีย precision; product version ยังเป็น integer
F1 health และ F2 `/auth/*`, `/me`, GET `/stores`, GET `/stores/:storeId` implement แล้ว
endpoints ธุรกรรม/ปิดวัน/จัดการผู้ใช้ด้านล่างยังเป็นสัญญาออกแบบ
S1c implement POST /stores/:storeId/business-days และ GET /stores/:storeId/business-days/:date แล้ว
ดู [business-days-validation.md](business-days-validation.md): เปิดวันแรกเท่านั้น; ยังไม่มี D4 settlement gate สำหรับวันถัดไป
S1b implement POST /accounts, PATCH /accounts/:accountId, POST /accounts/:accountId/opening และ GET /stores/:storeId/accounts แล้ว
ดู [accounts-validation.md](accounts-validation.md) สำหรับ ledger invariants/idempotency และขอบเขตที่ยังไม่ทำ
S1a implement GET/POST `/stores/:storeId/products` และ PATCH `/stores/:storeId/products/:id` แล้ว
ดู [catalog-validation.md](catalog-validation.md) สำหรับ version/idempotency/filter/cursor และข้อจำกัด
Health public response `{data:{status:"ok",service:"family-store-manager-api"}}`, HTTP200,
`X-Request-Id` UUID สร้างจาก server, `Cache-Control: no-store`; ไม่แปลว่า DB/auth/POS พร้อม
JSON body limit16kb; เกินตอบ413 PAYLOAD_TOO_LARGE; malformed JSON ตอบ400 INVALID_REQUEST
error envelope ใช้ shared schema; request logs ไม่เก็บ body/headers/query/exception text
ดู machine-readable core contract ใน [openapi.json](openapi.json) สำหรับ schema สำคัญ
เอกสารนี้กำหนด resource ทั้ง MVP; contract tests ต้องเติม OpenAPI ให้ครบทุก endpoint ของแต่ละก้อนก่อนส่งมอบ

## ข้อกำหนดร่วม

cookie session + CSRF บน mutation; strict input; ไม่รับ business_id จาก body ใช้ authenticated context
ข้อยกเว้น auth/login รับ businessId เพื่อเลือกได้เฉพาะ active membership ของผู้ใช้ที่ตรวจรหัสผ่านแล้ว
storeId ต้องอยู่ business ที่ active; nested IDs ต้องอยู่ร้านเดียวกับ path; query filter ไม่ขยายสิทธิ์
ทุก mutation ใช้ `Idempotency-Key: UUID` ยกเว้น auth ที่ rotate/revoke session
mutation เงินรับ `occurredAt` ISO timestamp; server ตรวจ businessDate/day OPEN;
preview read-only ไม่ต้อง key ใช้ POST เพื่อส่ง target และป้องกัน URL log ข้อมูลเงิน
ทุก tx เงินมี source + children + money_movements + audit + idempotency response atomic
response success `{data: ...}`; creation 201; no-change/replay คืน original status
list `{data:[...],page:{nextCursor:null|string}}`; limit 1–100 default 30 keyset (occurred_at,id)
GET /stores ใน F2 คืนร้านที่เข้าถึงได้ทั้งหมดและ nextCursor=null; ยังไม่ใช่ transaction pagination
ทุก query ช่วงรายงานรับ from/to เป็น Bangkok dates inclusive จำกัด 366 วัน

error `{error:{code,message,requestId,details?}}`; message ภาษาไทยปลอดภัย ไม่มี stack/SQL/secrets
400 INVALID_REQUEST; 401 AUTH_REQUIRED/INVALID_CREDENTIALS/SESSION_EXPIRED; 403 FORBIDDEN/CSRF_INVALID/ORIGIN_INVALID;
404 RESOURCE_NOT_FOUND; 409 BUSINESS_SELECTION_REQUIRED/PRICE_CHANGED/DAY_CLOSED/STALE_PREVIEW/IDEMPOTENCY_CONFLICT/
RECONCILIATION_REQUIRES_REVIEW/ALREADY_REFUNDED/ALREADY_REVERSED/PREVIOUS_DAY_UNSETTLED;
422 PAYMENT_MISMATCH/INSUFFICIENT_FUNDS/OVER_REFUND/ACCOUNT_NOT_ALLOWED;
429 RATE_LIMITED (Retry-After); 503 TEMPORARILY_UNAVAILABLE; 500 INTERNAL_ERROR
timeout/503 ไม่พิสูจน์ว่าไม่ commit ให้ retry key เดิม; validation errors ใช้ details.fields
client ไม่มีผลยืนยันต้องแสดง “ยังไม่ทราบผลการบันทึก” ไม่แสดงสำเร็จ

## Permission matrix

O=OWNER ใน business; M=MANAGER เฉพาะร้านที่มี membership; S=STAFF เฉพาะร้านที่มี membership
ไม่มี role override จาก client; owner มีทุก store โดย business membership

| Action | O | M | S | ขอบเขต |
|---|---|---|---|---|
| อ่านร้าน/เมนู/บัญชีรับที่อนุญาต | ✓ | ✓ | ✓ | S ไม่ได้ bank balance หรือรายการทั้งกิจการ |
| จัดการผู้ใช้/สิทธิ์/ร้าน/บัญชี/ราคา | ✓ | — | — | business admin; menu ผูก store |
| ขาย/ดูบิล | ✓ | ✓ | ✓ | S อ่านบิลเฉพาะร้าน ไม่ได้ financial report |
| เพิ่มยอด/กระทบยอด | ✓ | ✓ | — | store financial |
| รายจ่าย/จ่ายเงิน/ตรวจเงินสด/ปิดวัน | ✓ | ✓ | — | store financial |
| เติมทุน/ถอนใช้ส่วนตัว | ✓ | — | — | store action โดย owner |
| โอนบัญชีในร้าน | ✓ | ✓ | — | ต้องมี access ทั้งสองบัญชี |
| โอนระหว่างร้าน | ✓ | — | — | business action; ทั้งสองร้านอยู่ business เดียวกัน |
| คืนเงิน/reversal/reopen/settlement | ✓ | — | — | แก้รายการยืนยันพร้อมเหตุผล |
| รายงานร้าน | ✓ | ✓ | — | M เห็น attributed flow; ไม่มี shared bank total |
| รายงานรวม/ยอดบัญชีจริง/audit | ✓ | — | — | business-level |

## Identity และ master data

| Method/path | สิทธิ์ | Request → Response | Validation/transaction |
|---|---|---|---|
| GET /auth/csrf | anonymous/session | — → csrfToken | anonymous session อายุ 15 นาที; Cache-Control:no-store |
| POST /auth/login | anonymous + CSRF | username,password,businessId? → csrfToken (ใช้ GET /me อ่าน identity) | generic invalid credentials, rate limit; rotate session tx |
| POST /auth/logout | session + CSRF | {} → loggedOut:true | revoke session tx; session ที่ revoked/หมดอายุแล้วตอบ403 CSRF_INVALID; GET /me ตอบ401 |
| GET /me | session | — → user,business,businessRole,stores | 401 เมื่อหมดอายุ |
| GET /stores | session | — → accessible stores | ไม่รับ arbitrary business |
| GET /stores/:storeId | session | — → accessible store | ร้านนอก scope ตอบ404 |
| POST /auth/password | session + CSRF | currentPassword,newPassword → csrfToken | new12–128 characters; hashนอกtx; revokeทุกdeviceและออกsessionใหม่ในtxเดียวพร้อมaudit |
| POST /users | O | username,temporaryPassword → user | hash outside tx; user+membership+audit tx; ไม่คืน password |
| PATCH /users/:id | O | active → user | revoke sessions เมื่อ disable; ห้าม disable owner สุดท้าย |
| PUT /users/:id/memberships | O | businessRole?,storeRoles[] → memberships | lock business ก่อนนับ active owner; OWNER หรือ store roles; audit/revoke access ทันที |
| GET /stores/:storeId/products | O/M/S | cursor,active → products | ส่ง version/price string |
| POST /stores/:storeId/products | O | name,price → product | price>0; audit |
| PATCH /stores/:storeId/products/:id | O | name?,price?,active?,expectedVersion → product | optimistic version + PRICE_CHANGED; เก็บ audit old/new |
| GET /stores/:storeId/accounts | O/M/S | — → allowed id,name,type | S ไม่มี balance; M shared bank ไม่มี total |
| POST /accounts | O | name,type,storeIds[] → account | CASH หนึ่งร้าน; BANK หลายร้าน; audit tx |
| PATCH /accounts/:id | O | name?,active? → account | ไม่เปลี่ยน type/store mapping ที่ใช้แล้ว |
| POST /accounts/:id/opening | O | storeId,amount,cutoverAt,reason → opening | ครั้งเดียว; source+ledger+audit tx; amount=0 ไม่มี movement |
| GET /expense-categories | O/M | — → categories | scope business |
| POST /expense-categories | O | name → category | unique normalized name; audit |

master data เปลี่ยนได้แม้บางวัน CLOSED เพราะไม่มี posting; snapshots เก่าไม่เปลี่ยน
การตั้ง business/stores ครั้งแรกทำผ่าน development seed; UI เพิ่มร้านนอกสองร้านยังไม่อยู่ MVP
เปลี่ยนรหัสผ่าน `POST /auth/change-password {currentPassword,newPassword}` session+CSRF;
verify hash, rotate current session/revoke sessions อื่น tx; ไม่ใช้ idempotency record เก็บ secret

## วัน ขาย คืนเงิน และกระทบยอด

| Method/path | สิทธิ์ | Request → Response | ผล/transaction และวันปิด |
|---|---|---|---|
| GET /stores/:storeId/business-days/:date | O/M/S | — → data:{id,businessDate,state,revision,openingSnapshots?} | implement; STAFF ไม่ได้รับ openingSnapshots; revision เป็น string |
| POST /stores/:storeId/business-days | O/M | {businessDate} → data:{id,businessDate,state,revision,openingSnapshots} | implement; วันนี้ Bangkok เท่านั้น; ใหม่201/OPENเดิม200/replaystatusเดิม; CLOSED409; วันก่อนมีอยู่ปฏิเสธจน D4; auto-create sale รอ S2 |
| POST /stores/:storeId/sales | O/M/S | ตัวอย่างด้านล่าง → sale/ref/payments/dayRevision | คำนวณราคาเอง; source+items+payments+ledger; CLOSED ปฏิเสธ |
| GET /stores/:storeId/sales | O/M/S | from,to,cursor → sales | รวม kind,refund/reversal status |
| GET /stores/:storeId/sales/:saleId | O/M/S | — → snapshots,payments,refund refs | cross-store lookup 404 |
| POST /stores/:storeId/supplemental-sales | O/M | businessDate,occurredAt,amount,payments,reason → sale kind SUPPLEMENTAL | amount>0; sum payments=amount; ledger เพิ่ม; CLOSED ปฏิเสธ |
| POST /stores/:storeId/sales-reconciliations/preview | O/M | businessDate,targets[] → revision,lines,netSales,accountEffects | read snapshot เดียว; ไม่ post; CLOSED อ่านได้เพื่อแสดงผลแต่ confirm ไม่ได้ |
| POST /stores/:storeId/sales-reconciliations | O/M | businessDate,occurredAt,expectedRevision,targets[],reason → record,createdSales,dayRevision | lock day/recompute; delta>=0 ทุก bucket; all-or-nothing; CLOSED ปฏิเสธ |
| POST /stores/:storeId/sales/:saleId/refunds | O | businessDate,occurredAt,reason,payouts[] → refund,allocations,movements | lock current day+sale+accounts; full remaining only; คืนวัน OPEN แม้ sale เก่าปิดแล้ว; ไม่มีแก้ sale เดิม |
| POST /stores/:storeId/reversals | O | businessDate,occurredAt,sourceKind,sourceId,reason → reversal | allowlist source kinds; server เลือก delta; lock affected days/sources/accounts; CLOSED ปฏิเสธ |
| POST /stores/:storeId/cash-closings/preview | O/M | businessDate → revision,salesByBucket,cashAccounts,expected | snapshot เดียว; ไม่เปลี่ยนยอด |
| POST /stores/:storeId/cash-closings | O/M | businessDate,expectedRevision,counts[] → closing,version,state:CLOSED | lock day; count ทุกบัญชี; reason ถ้า variance; source snapshot+audit ไม่ post เงิน; CLOSED 409 เว้น replay key เดิม |
| POST /stores/:storeId/cash-closings/:id/settlements | O | reason → settlements,movements | lock day/latest closing/accounts; CLOSED เท่านั้น; amount server จาก variance; unique line; ห้ามแก้เก่า |
| POST /stores/:storeId/business-days/:date/reopen | O | reason,expectedRevision → OPEN,revision | lock day/accounts; no later day opened; reverse previous settlement explicit + audit; CLOSED เท่านั้น |

sale request (ตัวเลขตัวอย่างนี้เป็นสัญญาทดสอบ ไม่ใช่ข้อมูล production):

```json
{
  "businessDate":"2026-10-22",
  "occurredAt":"2026-10-22T10:00:00+07:00",
  "items":[{"productId":"00000000-0000-4000-8000-000000000001","expectedVersion":1,"quantity":2}],
  "discount":{"kind":"FIXED","amount":"0"},
  "payments":[{"accountId":"00000000-0000-4000-8000-000000000002","channel":"CASH","amount":"10000","tendered":"20000"}]
}
```

discount อีกแบบ `{kind:"PERCENT",basisPoints:500}`; ไม่มี client unitPrice/gross/net ที่ถือเป็นจริง
response sale `{id,reference,kind,gross,discount,net,items,payments,dayRevision}`
payments response เพิ่ม change จาก server; ไม่รับ change ใน request
target `{channel:"CASH"|"TRANSFER",accountId,amount}` unique(channel,accountId), amount signed เป็นยอดสุทธิ
อนุญาต target ติดลบเพื่อบันทึกผลตรวจหลังคืนเงิน; delta ที่สร้าง sale ต้อง >=0 เสมอ
preview line `{accountId,channel,recorded,target,delta,requiresReview}`;
negative delta preview ยัง 200 แสดงเหตุผล confirm จึง 409; ไม่มีการ clamp เป็น zero
refund request ไม่รับ allocations ที่เชื่อถือเอง: server derive จาก sale_payments;
payout `{accountId,amount}` ไม่จำเป็นต้องบัญชีรับเดิม แต่ต้องอยู่ร้าน/ธุรกิจและ sum เต็มยอด
closing count `{accountId,counted,reason?}`; expected/variance server คำนวณ ไม่รับเป็นข้อเท็จจริง

## รายจ่าย เงินเจ้าของ โอน และรายงาน

| Method/path | สิทธิ์ | Request → Response | ผล/transaction/วันปิด |
|---|---|---|---|
| POST /stores/:storeId/expenses | O/M | businessDate,occurredAt,categoryId,amount,description,evidenceReference?,payment? → expense,status | payment?={accountId}; ถ้ามีจ่ายเต็ม tx เดียว; ไม่มีเงินไม่ลด; CLOSED ปฏิเสธ |
| GET /stores/:storeId/expenses | O/M | from,to,status,cursor → expenses | paid status derive payment/reversal |
| POST /stores/:storeId/expenses/:id/payments | O/M | businessDate,occurredAt,accountId → payment | amount server จาก expense; lock expense; ALREADY_PAID 409; วัน expense ปิดได้แต่วัน payment ต้อง OPEN |
| POST /stores/:storeId/owner-transactions | O | businessDate,occurredAt,accountId,kind,amount,note → transaction | source+movement; kind contribution/withdrawal; CLOSED ปฏิเสธ |
| POST /account-transfers | O หรือ M ตาม matrix | sourceStoreId,destinationStoreId,businessDate,occurredAt,sourceAccountId,destinationAccountId,amount,feeAmount?,reason → transfer,feeExpense? | tx ล็อกสองวัน+บัญชี; วันทั้งสอง OPEN; fee>=0 แยกหมวดค่าธรรมเนียม; ห้ามบัญชีเดิม |
| GET /stores/:storeId/history | O/M | from,to,kind,cursor → transactions | รวม sales/expenses/owner/transfer/refund/close/reversal; S ใช้ sale history |
| GET /stores/:storeId/reports/daily | O/M | from,to → sales,refunds,expensesRecognized,expensePaid,ownerFlows,transferFlows,variance | แยก actual cash flows/attributed sales; วันปิดอ่านได้ |
| GET /reports/business | O | from,to → consolidated metrics,accountBalances | เงินบัญชีจริงรวม unique accounts ครั้งเดียว; eliminate internal transfers; fees เป็นรายจ่าย |
| GET /audit-logs | O | storeId?,from,to,cursor → audit | redact private credentials; append only |

ไม่มี endpoint POST money-movements หรือ direct update sale totals
การแก้รายจ่าย/ธุรกรรมยืนยันแล้วเป็น reversal + รายการใหม่ ไม่ใช้ PATCH ยอดเงิน

## ตรวจสัญญากับ implementation

OpenAPI core ครอบคลุม health ที่ implement แล้ว และสัญญา sales, reconciliation preview/confirm, refund และ closing preview/confirm
foundation ต้องเชื่อม Zod→OpenAPI และเพิ่ม endpoints ตามตารางนี้ก่อน implement แต่ละ module
contract tests ตรวจ request/response/error schema, money string และ no additional properties;
integration tests ตรวจผล DB/permission/race ไม่ใช้ OpenAPI validation แทน business tests
