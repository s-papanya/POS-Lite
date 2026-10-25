---
name: pos-api-design
description: Design or implement POS-Lite REST contracts, validation, authorization, pagination and error handling for Express APIs. Use for API changes while preserving REST and cookie-session choices.
---

# POS-Lite API design

Read affected [API contracts](../../../docs/api-contracts.md), [domain rules](../../../docs/domain-rules.md)
and [project state](../../../docs/project-engineering.md). REST /api/v1 on Express is chosen;
don't switch to GraphQL/JWT to follow a template.
OpenAPI contains implemented and design-only operations. Read x-implemented and current API contracts;
do not infer implementation from a path appearing in OpenAPI.
Health is the current scaffold exception to the business envelope; don't rewrite it during unrelated work.

## Contract

- Resource-oriented paths; store-owned resources under /stores/:storeId/...
  Query using authenticated business/store scope, not standalone UUID plus client assertions.
- Money is decimal integer string in satang, e.g. "10000"; compute BigInt, never JSON raw BigInt or floats.
  Reconciliation net targets may be signed after refunds; source amounts follow positive-amount rules.
- Success {data: ...}; lists {data: [...], page: {nextCursor: null|string}}.
  Keyset pagination on (occurred_at,id), validate cursor/filter scope; limit1–100/default30.
  Bangkok date ranges inclusive with max366 days.
- Error {error:{code,message,requestId,details?}}: safe Thai message, optional field errors, no stack/SQL/secrets.
  Follow contract codes/statuses, including409 conflicts vs422 invalid business amounts.
  Inaccessible cross-store/business resource404; accessible store with insufficient action permission403.
- Business-wide lookup resources (such as expense categories) derive business from session, not a fabricated store ID.
  Manager access requires an active MANAGER assignment in an active store; STAFF is denied.
  Bind listing cursors to business and sort keys. Normalize names before idempotency hashing/storage,
  preserve display case, and map the database uniqueness conflict to a documented409.
- Strict bounded schemas and response DTOs; business/actor from session, not body.
  Reject unexpected authority fields, verify account/channel and every nested resource scope.

## Auth and money writes

Implemented auth: PostgreSQL session, HttpOnly cookie, production Secure/SameSite=Lax,
X-CSRF-Token synchronizer plus Origin checks. No Bearer/localStorage session token by default.
Use same-origin /api/v1 with appropriate cookie/CSRF handling.
Check permissions on every request, including idempotent replay after role change.

Financial mutations require Idempotency-Key UUID and scoped/hash semantics from domain rules.
Same key/payload/path returns original committed status/body; changed input409.
Do not confirm before commit or generate a fresh key to hide unknown timeout status.
Preview reads a consistent snapshot; confirm checks expectedRevision/recomputes under day lock.
Use trusted catalog/version; PRICE_CHANGED409 must allow explicit user re-confirmation.
One service transaction writes source/payment/movement/audit/idempotency.
Expense recognition date and actual payment date differ; list filters use recognition dates. Payment requests
carry account/date/time, not a client amount. Unpaid creates no movement; immediate payment is atomic.
Stored creation replay remains its original snapshot after later payment; use GET for current status.
Before D3, one full payment is allowed; adding reversal requires updating derived status and uniqueness together.
Owner contribution/withdrawal requires business OWNER, not an assigned MANAGER. Accept positive amount
and derive signed delta from kind on the server. Never represent capital as a supplemental sale or
personal withdrawal as an operating expense; both would corrupt reporting categories.
Transfers require access to both stores before replay; cross-store needs OWNER, intra-store permits MANAGER.
Canonicalize omitted feeAmount to0. A positive fee uses the existing active category named ค่าธรรมเนียม;
missing/inactive returns FEE_CATEGORY_REQUIRED409. Only OWNER creates categories via the existing endpoint;
do not silently create configuration for a MANAGER or accept a guessed fee category from the client.
Specify CLOSED-day policy and explicit settlement/reopen/current-day refund exceptions.
Sales/reconciliation accept paired X-Expected-User-Id/X-Expected-Business-Id headers; mismatch403
SESSION_CONTEXT_CHANGED before key claim. They supplement cookie auth, never replace it.
Reconciliation targets are explicit unique accounts and signed satang strings. Omitted buckets stay untouched;
negative delta previews carry requiresReview and no accountEffects, then confirm409. A missing day previews
as revision0 without opening it; CLOSED previews are readable but confirm rejects. Positive lines create
separate REC bills; dayRevision advances per generated sale, or once for zero-only NO_CHANGE.

For each changed operation specify permission/request/response/constraints/errors/idempotency,
transaction boundary, sales/money effects and closed-day behavior.
Update machine contract/examples with implementation. Use installed Zod/OpenAPI tooling if present;
first setup is a scoped task. Contract shape validation doesn't prove DB locks or tenant isolation.
