"""Generate core design contract plus implemented F1/F2 endpoints; stdlib only."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent
SCHEMAS = {}


def ref(name):
    return {"$ref": "#/components/schemas/" + name}


def obj(fields, optional=()):
    return {"type": "object", "additionalProperties": False,
            "properties": fields, "required": [k for k in fields if k not in optional]}


def array(name, minimum=0):
    return {"type": "array", "items": ref(name), "minItems": minimum, "maxItems": 100}


def record(name, fields, optional=()):
    SCHEMAS[name] = obj({k: ref(v) for k, v in fields.items()}, optional)


SCHEMAS.update({
    "Money": {"type": "string", "pattern": r"^(0|[1-9][0-9]{0,12})$",
              "description": "THB satang. Exact maximum 9000000000000 checked by service."},
    "SignedMoney": {"type": "string", "pattern": r"^(0|-?[1-9][0-9]{0,12})$",
                    "description": "Signed net THB satang; absolute maximum 9000000000000."},
    "Id": {"type": "string", "format": "uuid"},
    "Date": {"type": "string", "format": "date"},
    "Time": {"type": "string", "format": "date-time"},
    "Text": {"type": "string", "minLength": 1, "maxLength": 1000},
    "Revision": {"type": "string", "pattern": "^(0|[1-9][0-9]*)$"},
    "Version": {"type": "integer", "minimum": 1},
    "Quantity": {"type": "integer", "minimum": 1, "maximum": 999},
    "Channel": {"type": "string", "enum": ["CASH", "TRANSFER"]},
    "Boolean": {"type": "boolean"},
    "NullableMoney": {"oneOf": [ref("Money"), {"type": "null"}]},
    "NullableText": {"oneOf": [ref("Text"), {"type": "null"}]},
})
record("SaleItemInput", {"productId": "Id", "expectedVersion": "Version", "quantity": "Quantity"})
SCHEMAS["Discount"] = {"oneOf": [
    obj({"kind": {"type": "string", "const": "FIXED"}, "amount": ref("Money")}),
    obj({"kind": {"type": "string", "const": "PERCENT"},
         "basisPoints": {"type": "integer", "minimum": 0, "maximum": 10000}})]}
SCHEMAS["PaymentInput"] = {"oneOf": [
    obj({"accountId": ref("Id"), "channel": {"type": "string", "const": "CASH"},
         "amount": ref("Money"), "tendered": ref("Money")}),
    obj({"accountId": ref("Id"), "channel": {"type": "string", "const": "TRANSFER"},
         "amount": ref("Money")})]}
SCHEMAS["SaleRequest"] = obj({"businessDate": ref("Date"), "occurredAt": ref("Time"),
    "items": array("SaleItemInput", 1), "discount": ref("Discount"), "payments": array("PaymentInput", 1)})
record("SaleItem", {"productId": "Id", "nameSnapshot": "Text", "unitPrice": "Money",
    "productVersion": "Version", "quantity": "Quantity", "lineTotal": "Money"})
record("Payment", {"id": "Id", "accountId": "Id", "channel": "Channel", "amount": "Money",
    "tendered": "NullableMoney", "change": "NullableMoney"})
SCHEMAS["Sale"] = obj({"id": ref("Id"), "reference": ref("Text"),
    "kind": {"type": "string", "enum": ["POS", "SUPPLEMENTAL", "RECONCILIATION"]},
    "gross": ref("Money"), "discount": ref("Money"), "net": ref("Money"),
    "items": array("SaleItem"), "payments": array("Payment", 1), "dayRevision": ref("Revision")})
record("Target", {"accountId": "Id", "channel": "Channel", "amount": "SignedMoney"})
SCHEMAS["ReconciliationPreviewRequest"] = obj({"businessDate": ref("Date"), "targets": array("Target", 1)})
SCHEMAS["ReconciliationRequest"] = obj({"businessDate": ref("Date"), "occurredAt": ref("Time"),
    "expectedRevision": ref("Revision"), "targets": array("Target", 1), "reason": ref("Text")})
record("ReconciliationLine", {"accountId": "Id", "channel": "Channel", "recorded": "SignedMoney",
    "target": "SignedMoney", "delta": "SignedMoney", "requiresReview": "Boolean"})
record("AccountEffect", {"accountId": "Id", "delta": "SignedMoney"})
SCHEMAS["ReconciliationPreview"] = obj({"revision": ref("Revision"),
    "lines": array("ReconciliationLine", 1), "netSales": ref("SignedMoney"),
    "accountEffects": array("AccountEffect")})
SCHEMAS["ReconciliationResult"] = obj({"id": ref("Id"), "createdSales": array("Sale"), "dayRevision": ref("Revision")})
record("Payout", {"accountId": "Id", "amount": "Money"})
SCHEMAS["RefundRequest"] = obj({"businessDate": ref("Date"), "occurredAt": ref("Time"),
    "reason": ref("Text"), "payouts": array("Payout", 1)})
record("RefundAllocation", {"salePaymentId": "Id", "amount": "Money"})
SCHEMAS["RefundResult"] = obj({"id": ref("Id"), "reference": ref("Text"), "amount": ref("Money"),
    "allocations": array("RefundAllocation", 1), "movements": array("AccountEffect", 1), "dayRevision": ref("Revision")})
record("ClosingPreviewRequest", {"businessDate": "Date"})
record("CashAccount", {"accountId": "Id", "opening": "Money", "expected": "Money"})
record("SalesBucket", {"accountId": "Id", "channel": "Channel", "netSales": "SignedMoney"})
SCHEMAS["ClosingPreview"] = obj({"revision": ref("Revision"), "salesByBucket": array("SalesBucket"), "cashAccounts": array("CashAccount", 1)})
record("CashCount", {"accountId": "Id", "counted": "Money", "reason": "Text"}, ("reason",))
SCHEMAS["ClosingRequest"] = obj({"businessDate": ref("Date"), "expectedRevision": ref("Revision"), "counts": array("CashCount", 1)})
record("ClosingLine", {"accountId": "Id", "expected": "Money", "counted": "Money", "variance": "SignedMoney", "reason": "NullableText"})
SCHEMAS["ClosingResult"] = obj({"id": ref("Id"), "version": ref("Version"),
    "state": {"type": "string", "const": "CLOSED"}, "lines": array("ClosingLine", 1), "dayRevision": ref("Revision")})
SCHEMAS["Error"] = obj({"error": obj({"code": ref("Text"), "message": ref("Text"),
    "requestId": ref("Id"), "details": {"type": "object", "additionalProperties": True}}, ("details",))})

OPERATIONS = [
    ("sales", "createSale", "SaleRequest", "Sale", True, ["OWNER", "MANAGER", "STAFF"]),
    ("sales-reconciliations/preview", "previewReconciliation", "ReconciliationPreviewRequest", "ReconciliationPreview", False, ["OWNER", "MANAGER"]),
    ("sales-reconciliations", "confirmReconciliation", "ReconciliationRequest", "ReconciliationResult", True, ["OWNER", "MANAGER"]),
    ("sales/{saleId}/refunds", "createRefund", "RefundRequest", "RefundResult", True, ["OWNER"]),
    ("cash-closings/preview", "previewClosing", "ClosingPreviewRequest", "ClosingPreview", False, ["OWNER", "MANAGER"]),
    ("cash-closings", "closeDay", "ClosingRequest", "ClosingResult", True, ["OWNER", "MANAGER"]),
]
SCHEMAS["HealthResponse"] = obj({"data": obj({
    "status": {"type": "string", "const": "ok"},
    "service": {"type": "string", "const": "family-store-manager-api"},
})})
paths = {"/health": {"get": {
    "operationId": "getHealth",
    "summary": "Process liveness only; does not verify DB, authentication or sales readiness",
    "security": [],
    "parameters": [],
    "responses": {"200": {"description": "API process is running; Cache-Control: no-store; server-generated X-Request-Id",
        "content": {"application/json": {"schema": ref("HealthResponse")}}}},
}}}
for suffix, operation, request, response, mutation, roles in OPERATIONS:
    params = [{"name": "storeId", "in": "path", "required": True, "schema": ref("Id")},
              {"name": "X-CSRF-Token", "in": "header", "required": True, "schema": ref("Text")}]
    if "{saleId}" in suffix:
        params.append({"name": "saleId", "in": "path", "required": True, "schema": ref("Id")})
    if mutation:
        params.append({"name": "Idempotency-Key", "in": "header", "required": True, "schema": ref("Id")})
    responses = {"201" if mutation else "200": {"description": "Committed result / original replay" if mutation else "Read-only snapshot",
        "content": {"application/json": {"schema": obj({"data": ref(response)})}}}}
    for code in ("400", "401", "403", "404", "409", "413", "422", "429", "500", "503"):
        responses[code] = {"description": "Standard error; action codes in api-contracts.md",
                           "content": {"application/json": {"schema": ref("Error")}}}
    paths["/stores/{storeId}/" + suffix] = {"post": {"operationId": operation,
        "x-permissions": roles, "x-transaction": "Atomic source/ledger/audit/idempotency with row locks" if mutation else "Consistent read snapshot",
        "parameters": params, "requestBody": {"required": True, "content": {"application/json": {"schema": ref(request)}}}, "responses": responses}}

SCHEMAS["CsrfResponse"] = obj({"data": obj({"csrfToken": {"type": "string", "pattern": "^[a-f0-9]{64}$"}})})
SCHEMAS["LoginRequest"] = obj({"username": {"type": "string", "minLength": 3, "maxLength": 64},
    "password": {"type": "string", "minLength": 1, "maxLength": 128}, "businessId": ref("Id")}, ("businessId",))
SCHEMAS["PasswordRequest"] = obj({"currentPassword": {"type": "string", "minLength": 1, "maxLength": 128},
    "newPassword": {"type": "string", "minLength": 12, "maxLength": 128}})
SCHEMAS["LogoutResponse"] = obj({"data": obj({"loggedOut": {"type": "boolean", "const": True}})})
SCHEMAS["AccessibleStore"] = obj({"id": ref("Id"), "name": ref("Text"), "code": ref("Text"),
    "role": {"type": "string", "enum": ["OWNER", "MANAGER", "STAFF"]}})
SCHEMAS["StoreResponse"] = obj({"data": ref("AccessibleStore")})
SCHEMAS["StoreListResponse"] = obj({"data": {"type": "array", "items": ref("AccessibleStore")},
    "page": obj({"nextCursor": {"type": "null"}})})
SCHEMAS["MeResponse"] = obj({"data": obj({"user": obj({"id": ref("Id"), "username": ref("Text")}),
    "business": obj({"id": ref("Id"), "name": ref("Text")}),
    "businessRole": {"type": ["string", "null"], "enum": ["OWNER", None]},
    "stores": {"type": "array", "items": ref("AccessibleStore")}})})
for path, method, operation, request, response in [
    ("/auth/csrf", "get", "getCsrf", None, "CsrfResponse"),
    ("/auth/login", "post", "login", "LoginRequest", "CsrfResponse"),
    ("/auth/logout", "post", "logout", None, "LogoutResponse"),
    ("/auth/password", "post", "changePassword", "PasswordRequest", "CsrfResponse"),
    ("/me", "get", "getMe", None, "MeResponse"),
    ("/stores", "get", "listAccessibleStores", None, "StoreListResponse"),
    ("/stores/{storeId}", "get", "getAccessibleStore", None, "StoreResponse"),
]:
    params = []
    if "{storeId}" in path:
        params.append({"name": "storeId", "in": "path", "required": True, "schema": ref("Id")})
    if method == "post":
        params += [{"name": "X-CSRF-Token", "in": "header", "required": True, "schema": ref("Text")},
                   {"name": "Origin", "in": "header", "required": True, "schema": {"type": "string", "format": "uri"}}]
    responses = {"200": {"description": "Success; no-store; session cookies HttpOnly, SameSite=Lax, Secure in production",
        "content": {"application/json": {"schema": ref(response)}}}}
    for code in ("400", "401", "403", "404", "409", "413", "429", "500"):
        responses[code] = {"description": "Standard error; RATE_LIMITED includes Retry-After seconds",
            "content": {"application/json": {"schema": ref("Error")}}}
    op = {"operationId": operation, "x-implemented": True, "parameters": params, "responses": responses}
    if path == "/auth/csrf":
        op["security"] = []
    if request:
        op["requestBody"] = {"required": True, "content": {"application/json": {"schema": ref(request)}}}
    paths[path] = {method: op}

SCHEMAS["ProductPrice"] = {"type": "string", "pattern": r"^([1-8][0-9]{0,12}|9[0-9]{0,11}|9000000000000)$", "description": "Positive THB satang, maximum 9000000000000"}
SCHEMAS["ProductName"] = {"type": "string", "minLength": 1, "maxLength": 120}
SCHEMAS["Product"] = obj({"id": ref("Id"), "name": ref("ProductName"), "price": ref("ProductPrice"), "version": ref("Version"), "active": ref("Boolean")})
SCHEMAS["ProductCreateRequest"] = obj({"name": ref("ProductName"), "price": ref("ProductPrice")})
SCHEMAS["ProductUpdateRequest"] = obj({"name": ref("ProductName"), "price": ref("ProductPrice"), "active": ref("Boolean"),
    "expectedVersion": {"type": "integer", "minimum": 1, "maximum": 2147483646}}, ("name", "price", "active"))
SCHEMAS["ProductUpdateRequest"]["anyOf"] = [{"required": [field]} for field in ("name", "price", "active")]
SCHEMAS["ProductResponse"] = obj({"data": ref("Product")})
SCHEMAS["ProductListResponse"] = obj({"data": {"type": "array", "items": ref("Product")}, "page": obj({"nextCursor": {"type": ["string", "null"]}})})
for path, method, operation, request, response in [
    ("/stores/{storeId}/products", "get", "listProducts", None, "ProductListResponse"),
    ("/stores/{storeId}/products", "post", "createProduct", "ProductCreateRequest", "ProductResponse"),
    ("/stores/{storeId}/products/{productId}", "patch", "updateProduct", "ProductUpdateRequest", "ProductResponse"),
]:
    params = [{"name": "storeId", "in": "path", "required": True, "schema": ref("Id")}]
    if "{productId}" in path:
        params.append({"name": "productId", "in": "path", "required": True, "schema": ref("Id")})
    if method == "get":
        params += [{"name": "limit", "in": "query", "schema": {"type": "integer", "minimum": 1, "maximum": 100, "default": 30}},
                   {"name": "active", "in": "query", "schema": {"type": "boolean", "default": True}, "description": "false requires OWNER"},
                   {"name": "cursor", "in": "query", "schema": {"type": "string", "maxLength": 1024}}]
    else:
        params += [{"name": "X-CSRF-Token", "in": "header", "required": True, "schema": ref("Text")},
                   {"name": "Origin", "in": "header", "required": True, "schema": {"type": "string", "format": "uri"}},
                   {"name": "Idempotency-Key", "in": "header", "required": True, "schema": ref("Id")}]
    responses = {"201" if method == "post" else "200": {"description": "Committed product / original replay" if request else "Name/id keyset page",
        "content": {"application/json": {"schema": ref(response)}}}}
    for code in ("400", "401", "403", "404", "409", "413", "500"):
        responses[code] = {"description": "Standard error; PRICE_CHANGED includes details.product; IDEMPOTENCY_CONFLICT on changed payload/path",
            "content": {"application/json": {"schema": ref("Error")}}}
    op = {"operationId": operation, "x-implemented": True, "parameters": params, "responses": responses,
          "x-permissions": ["OWNER"] if request else ["OWNER", "MANAGER", "STAFF"]}
    if request:
        op["requestBody"] = {"required": True, "content": {"application/json": {"schema": ref(request)}}}
    paths.setdefault(path, {})[method] = op

account_name = {"type": "string", "minLength": 1, "maxLength": 120}
account_type = {"type": "string", "enum": ["CASH", "BANK"]}
store_ids = {"type": "array", "items": ref("Id"), "minItems": 1, "maxItems": 100, "uniqueItems": True}
SCHEMAS["Account"] = obj({"id": ref("Id"), "name": account_name, "type": account_type, "active": ref("Boolean"), "storeIds": store_ids})
SCHEMAS["AccountCreateRequest"] = obj({"name": account_name, "type": account_type, "storeIds": store_ids})
SCHEMAS["AccountCreateRequest"].update({"if": {"properties": {"type": {"const": "CASH"}}},
    "then": {"properties": {"storeIds": {"maxItems": 1}}}})
SCHEMAS["AccountUpdateRequest"] = obj({"name": account_name, "active": ref("Boolean")}, ("name", "active"))
SCHEMAS["AccountUpdateRequest"]["anyOf"] = [{"required": [field]} for field in ("name", "active")]
SCHEMAS["AccountOpeningRequest"] = obj({"storeId": ref("Id"), "amount": ref("Money"), "cutoverAt": ref("Time"), "reason": ref("Text")})
SCHEMAS["AccountOpening"] = obj({"id": ref("Id"), "accountId": ref("Id"), "storeId": ref("Id"), "amount": ref("Money"), "cutoverAt": ref("Time"), "reason": ref("Text")})
SCHEMAS["AccountResponse"] = obj({"data": ref("Account")})
SCHEMAS["AccountOpeningResponse"] = obj({"data": ref("AccountOpening")})
SCHEMAS["AccountListResponse"] = obj({"data": {"type": "array", "items": obj({"id": ref("Id"), "name": account_name, "type": account_type})},
    "page": obj({"nextCursor": {"type": ["string", "null"], "format": "uuid"}})})
for path, method, operation, request, response in [
    ("/accounts", "post", "createAccount", "AccountCreateRequest", "AccountResponse"),
    ("/accounts/{accountId}", "patch", "updateAccount", "AccountUpdateRequest", "AccountResponse"),
    ("/accounts/{accountId}/opening", "post", "openAccount", "AccountOpeningRequest", "AccountOpeningResponse"),
    ("/stores/{storeId}/accounts", "get", "listStoreAccounts", None, "AccountListResponse"),
]:
    params = [{"name": field, "in": "path", "required": True, "schema": ref("Id")}
              for field in ("accountId", "storeId") if "{" + field + "}" in path]
    if method == "get":
        params += [{"name": "limit", "in": "query", "schema": {"type": "integer", "minimum": 1, "maximum": 100, "default": 30}},
                   {"name": "cursor", "in": "query", "schema": ref("Id")}]
    else:
        params += [{"name": "X-CSRF-Token", "in": "header", "required": True, "schema": ref("Text")},
                   {"name": "Origin", "in": "header", "required": True, "schema": {"type": "string", "format": "uri"}},
                   {"name": "Idempotency-Key", "in": "header", "required": True, "schema": ref("Id")}]
    responses = {"201" if method == "post" else "200": {"description": "Committed / original replay; lists expose no balance",
        "content": {"application/json": {"schema": ref(response)}}}}
    for code in ("400", "401", "403", "404", "409", "413", "422", "500"):
        responses[code] = {"description": "Standard error; ACCOUNT_NAME_TAKEN, ACCOUNT_ALREADY_OPENED, ACCOUNT_INACTIVE, ACCOUNT_CONFIGURATION_LOCKED, INVALID_CUTOVER_DATE or IDEMPOTENCY_CONFLICT",
            "content": {"application/json": {"schema": ref("Error")}}}
    op = {"operationId": operation, "x-implemented": True, "parameters": params, "responses": responses,
          "x-permissions": ["OWNER"] if request else ["OWNER", "MANAGER", "STAFF"]}
    if request:
        op["requestBody"] = {"required": True, "content": {"application/json": {"schema": ref(request)}}}
    paths[path] = {method: op}

SCHEMAS["BusinessDayOpenRequest"] = obj({"businessDate": {"type": "string", "format": "date"}})
SCHEMAS["BusinessDayRead"] = obj({"id": ref("Id"), "businessDate": {"type": "string", "format": "date"},
    "state": {"type": "string", "enum": ["OPEN", "CLOSED"]}, "revision": ref("Revision"),
    "openingSnapshots": {"type": "array", "items": obj({"accountId": ref("Id"), "amount": ref("Money")})}}, ("openingSnapshots",))
SCHEMAS["BusinessDayReadResponse"] = obj({"data": ref("BusinessDayRead")})
SCHEMAS["BusinessDayOpened"] = {**SCHEMAS["BusinessDayRead"], "required": list(SCHEMAS["BusinessDayRead"]["properties"])}
SCHEMAS["BusinessDayOpenResponse"] = obj({"data": ref("BusinessDayOpened")})
for method, path in [("post", "/stores/{storeId}/business-days"), ("get", "/stores/{storeId}/business-days/{date}")]:
    params = [{"name": "storeId", "in": "path", "required": True, "schema": ref("Id")}]
    if method == "get":
        params += [{"name": "date", "in": "path", "required": True, "schema": {"type": "string", "format": "date"}}]
    else:
        params += [{"name": name, "in": "header", "required": True, "schema": ref("Id" if name == "Idempotency-Key" else "Text")}
                   for name in ["X-CSRF-Token", "Origin", "Idempotency-Key"]]
    response = "BusinessDayReadResponse" if method == "get" else "BusinessDayOpenResponse"
    responses = {"200": {"description": "Read / already OPEN; STAFF reads omit openingSnapshots",
        "content": {"application/json": {"schema": ref(response)}}}}
    if method == "post":
        responses["201"] = {"description": "New day committed / original replay; no ledger movement",
            "content": {"application/json": {"schema": ref(response)}}}
    for code in ["400", "401", "403", "404", "409", "413", "422", "500"]:
        responses[code] = {"description": "Standard error; INITIAL_BALANCES_REQUIRED, PREVIOUS_DAY_UNSETTLED, DAY_CLOSED, INVALID_BUSINESS_DATE or IDEMPOTENCY_CONFLICT",
            "content": {"application/json": {"schema": ref("Error")}}}
    operation = {"operationId": "openBusinessDay" if method == "post" else "getBusinessDay", "x-implemented": True,
        "x-permissions": ["OWNER", "MANAGER"] if method == "post" else ["OWNER", "MANAGER", "STAFF"],
        "parameters": params, "responses": responses}
    if method == "post":
        operation["requestBody"] = {"required": True, "content": {"application/json": {"schema": ref("BusinessDayOpenRequest")}}}
    paths[path] = {method: operation}

SCHEMAS["PosSale"] = {**SCHEMAS["Sale"], "properties": {**SCHEMAS["Sale"]["properties"],
    "kind": {"type": "string", "const": "POS"}, "businessDate": ref("Date"), "occurredAt": ref("Time")},
    "required": [*SCHEMAS["Sale"]["required"], "businessDate", "occurredAt"]}
SCHEMAS["PositiveMoney"] = {"type": "string", "pattern": "^[1-9][0-9]{0,12}$", "description": "Positive satang, maximum 9000000000000"}
for option in SCHEMAS["PaymentInput"]["oneOf"]:
    option["properties"]["amount"] = ref("PositiveMoney")
    if "tendered" in option["properties"]:
        option["properties"]["tendered"] = ref("PositiveMoney")
SCHEMAS["SaleRequest"]["description"] = "Unique product IDs and payment account IDs. Server prices, exact payment sum, today Bangkok and no future occurredAt."
SCHEMAS["SupplementalSaleRequest"] = obj({"businessDate": ref("Date"), "occurredAt": ref("Time"),
    "amount": ref("PositiveMoney"), "reason": {"type": "string", "minLength": 1, "maxLength": 1000}, "payments": array("PaymentInput", 1)})
SCHEMAS["SupplementalSaleRequest"]["description"] = "Positive amount equals sum of unique explicit payment accounts. No items or discount; today Bangkok only."
SCHEMAS["SupplementalSale"] = obj({**SCHEMAS["PosSale"]["properties"], "kind": {"type": "string", "const": "SUPPLEMENTAL"},
    "reason": {"type": "string", "minLength": 1, "maxLength": 1000}, "items": {"type": "array", "maxItems": 0}, "discount": {"const": "0"}})
SCHEMAS["ReconciliationSale"] = obj({**SCHEMAS["SupplementalSale"]["properties"], "kind": {"const": "RECONCILIATION", "type": "string"}})
SCHEMAS["SaleRead"] = {"oneOf": [ref("PosSale"), ref("SupplementalSale"), ref("ReconciliationSale")]}
SCHEMAS["SaleResponse"] = obj({"data": ref("SaleRead")})
SCHEMAS["PosSaleResponse"] = obj({"data": ref("PosSale")})
SCHEMAS["SupplementalSaleResponse"] = obj({"data": ref("SupplementalSale")})
SCHEMAS["SaleListResponse"] = obj({"data": {"type": "array", "items": ref("SaleRead")},
    "page": obj({"nextCursor": {"type": ["string", "null"]}})})
sale_path = "/stores/{storeId}/sales"
post = paths[sale_path]["post"]
post["x-implemented"] = True
for header in ["X-Expected-User-Id", "X-Expected-Business-Id"]:
    post["parameters"].append({"name": header, "in": "header", "required": False, "schema": ref("Id"),
        "description": "Send both expected identity headers together. Mismatch rejects with 403 SESSION_CONTEXT_CHANGED before idempotency claim."})
post["parameters"].append({"name": "Origin", "in": "header", "required": True, "schema": {"type": "string", "format": "uri"}})
post["responses"]["201"]["content"]["application/json"]["schema"] = ref("PosSaleResponse")
paths["/stores/{storeId}/supplemental-sales"] = {"post": {"operationId": "createSupplementalSale", "x-implemented": True,
    "x-permissions": ["OWNER", "MANAGER"], "parameters": post["parameters"],
    "requestBody": {"required": True, "content": {"application/json": {"schema": ref("SupplementalSaleRequest")}}},
    "responses": {**{code: {"description": "Standard error; DAY_CLOSED, INVALID_SALE_TOTALS, ACCOUNT_CHANNEL_MISMATCH, INVALID_OCCURRED_AT, IDEMPOTENCY_CONFLICT or SESSION_CONTEXT_CHANGED",
        "content": {"application/json": {"schema": ref("Error")}}} for code in ["400", "401", "403", "404", "409", "413", "422", "500"]},
        "201": {"description": "Supplemental sale committed / original replay; atomic payments, ledger, audit and key",
            "content": {"application/json": {"schema": ref("SupplementalSaleResponse")}}}}}}
for path in [sale_path, sale_path + "/{saleId}"]:
    params = [{"name": "storeId", "in": "path", "required": True, "schema": ref("Id")}]
    if path.endswith("{saleId}"):
        params.append({"name": "saleId", "in": "path", "required": True, "schema": ref("Id")})
        response = "SaleResponse"
    else:
        params += [{"name": name, "in": "query", "required": True, "schema": ref("Date")} for name in ["from", "to"]]
        params += [{"name": "limit", "in": "query", "schema": {"type": "integer", "minimum": 1, "maximum": 100, "default": 30}},
                   {"name": "cursor", "in": "query", "schema": {"type": "string", "maxLength": 2048}}]
        response = "SaleListResponse"
    responses = {"200": {"description": "Immutable POS and supplemental bills; date range inclusive Asia/Bangkok, maximum 366 days",
        "content": {"application/json": {"schema": ref(response)}}}}
    for code in ["400", "401", "403", "404", "500"]:
        responses[code] = {"description": "Standard error", "content": {"application/json": {"schema": ref("Error")}}}
    paths.setdefault(path, {})["get"] = {"operationId": "getSale" if path.endswith("{saleId}") else "listSales",
        "x-implemented": True, "x-permissions": ["OWNER", "MANAGER", "STAFF"], "parameters": params, "responses": responses}

SCHEMAS["AggregateMoney"] = {"type": "string", "pattern": "^(0|-?[1-9][0-9]*)$", "description": "Exact aggregate satang; source and target bounds apply separately."}
for field in ["recorded", "delta"]:
    SCHEMAS["ReconciliationLine"]["properties"][field] = ref("AggregateMoney")
SCHEMAS["ReconciliationPreview"]["properties"]["netSales"] = ref("AggregateMoney")
SCHEMAS["ReconciliationPreview"]["properties"]["accountEffects"] = {"type": "array", "items": obj({"accountId": ref("Id"), "delta": ref("AggregateMoney")})}
SCHEMAS["ReconciliationResult"]["properties"]["createdSales"] = array("ReconciliationSale")
SCHEMAS["ReconciliationPreviewRequest"]["description"] = "Explicit unique account targets; signed satang bounded to +/-9000000000000. Omitted buckets stay unchanged."
SCHEMAS["ReconciliationRequest"]["description"] = "Same targets plus canonical expectedRevision, today Bangkok occurredAt and trimmed reason1-1000. Recompute under day lock; negative delta409, stale409."
for suffix in ["sales-reconciliations", "sales-reconciliations/preview"]:
    operation = paths["/stores/{storeId}/" + suffix]["post"]
    operation["x-implemented"] = True
    operation["parameters"] += [p for p in post["parameters"] if p["name"] in ["Origin", "X-Expected-User-Id", "X-Expected-Business-Id"]]
    operation["description"] = "O/M only. Preview uses repeatable-read read-only snapshot, missing day revision0, CLOSED readable. Confirm atomically records zero-only NO_CHANGE or one REC sale per positive line; increments revision per sale or once for NO_CHANGE."

document = {"openapi": "3.1.0", "info": {"title": "Family Store Manager core design contract", "version": "0.9.0",
    "description": "F1/F2, S1a-c, S2, D1a supplemental and D1b reconciliation implemented. Refund/closing paths remain design only. See api-contracts.md."},
    "servers": [{"url": "/api/v1"}], "security": [{"sessionCookie": []}], "paths": paths,
    "components": {"securitySchemes": {"sessionCookie": {"type": "apiKey", "in": "cookie", "name": "__Host-session"}}, "schemas": SCHEMAS}}
if __name__ == "__main__":
    (ROOT / "openapi.json").write_text(json.dumps(document, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Generated {len(paths)} core paths / {len(SCHEMAS)} schemas")
