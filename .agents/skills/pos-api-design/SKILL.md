---
name: pos-api-design
description: Design or implement POS-Lite REST contracts, validation, authorization, pagination and error handling for Express APIs. Use for API changes while preserving REST and cookie-session choices.
---

# POS-Lite API design

Read affected [API contracts](../../../docs/api-contracts.md), [domain rules](../../../docs/domain-rules.md)
and [project state](../../../docs/project-engineering.md). REST /api/v1 on Express is chosen;
don't switch to GraphQL/JWT to follow a template.
OpenAPI core covers six specified financial paths, not six implemented endpoints.
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
- Strict bounded schemas and response DTOs; business/actor from session, not body.
  Reject unexpected authority fields, verify account/channel and every nested resource scope.

## Auth and money writes

Planned auth: server-side session, HttpOnly cookie, production Secure/SameSite=Lax,
X-CSRF-Token synchronizer plus Origin checks. No Bearer/localStorage session token by default.
Use same-origin /api/v1 with appropriate cookie/CSRF handling.
Check permissions on every request, including idempotent replay after role change.

Financial mutations require Idempotency-Key UUID and scoped/hash semantics from domain rules.
Same key/payload/path returns original committed status/body; changed input409.
Do not confirm before commit or generate a fresh key to hide unknown timeout status.
Preview reads a consistent snapshot; confirm checks expectedRevision/recomputes under day lock.
Use trusted catalog/version; PRICE_CHANGED409 must allow explicit user re-confirmation.
One service transaction writes source/payment/movement/audit/idempotency.
Specify CLOSED-day policy and explicit settlement/reopen/current-day refund exceptions.

For each changed operation specify permission/request/response/constraints/errors/idempotency,
transaction boundary, sales/money effects and closed-day behavior.
Update machine contract/examples with implementation. Use installed Zod/OpenAPI tooling if present;
first setup is a scoped task. Contract shape validation doesn't prove DB locks or tenant isolation.
