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
    "Revision": {"type": "integer", "minimum": 0, "maximum": 2147483647},
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

document = {"openapi": "3.1.0", "info": {"title": "Family Store Manager core design contract", "version": "0.4.0",
    "description": "F1 health, F2 auth/store and S1a product endpoints implemented. Six financial paths remain design only. See api-contracts.md."},
    "servers": [{"url": "/api/v1"}], "security": [{"sessionCookie": []}], "paths": paths,
    "components": {"securitySchemes": {"sessionCookie": {"type": "apiKey", "in": "cookie", "name": "__Host-session"}}, "schemas": SCHEMAS}}
if __name__ == "__main__":
    (ROOT / "openapi.json").write_text(json.dumps(document, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Generated {len(paths)} core paths / {len(SCHEMAS)} schemas")
