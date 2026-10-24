---
name: pos-architecture
description: Design or implement POS-Lite domain modules, folder boundaries and Express controller/service/repository flows within the modular monolith. Use for structural changes or architectural review.
---

# POS-Lite architecture patterns

Read [architecture](../../../docs/architecture.md), [project state](../../../docs/project-engineering.md)
and affected [domain rules](../../../docs/domain-rules.md).
Preserve React/Vite, Express, PostgreSQL, REST /api/v1 and the modular monolith.
Don't substitute frameworks or add microservices/queues/Redis implicitly.

## Boundaries

app.ts composes/exports Express; server.ts owns listen/startup. Preserve this testable split.
Grow domains under apps/api/src/modules/<domain>/ with routes/controller, service, repository and schema
only where each file has a real responsibility. Small handlers don't need five empty layers.
Controller parses validated HTTP, resolves authenticated scope and maps results/errors; no client-total calculation.
Service authorizes the business action and owns the complete transaction.
Repositories take the service's tx handle, perform scoped queries and never commit partial units independently.
Keep pure calculations independent of Express/DB. Don't add generic base services/repositories or interfaces per file
without a real substitution or boundary need.

Web features can grow under apps/web/src/features/<domain>/, reusable UI in components/, transport in lib/.
Keep workflow state near its feature; no global store/router/query packages just to complete a template.
packages/shared contains DTOs and packages/validation contains strict Zod contracts; both have real API/web consumers. Browser must not import DB/config/secrets.
infra/ grows with real infrastructure; no speculative inventory/production tables or modules.

## Atomic money-write flow

Authenticate/scope → validate → service transaction: claim scoped idempotency row → days in stable order
→ original sale/expense → accounts → counter → verify OPEN/revision/access/prices/balances
→ source+children+ledger+audit+stored response → commit.
Use domain-rules.md for exceptions such as CLOSED-day settlement and cross-store transfers.
Client disabled buttons and in-memory mutexes do not protect multiple processes.
No independent ledger POST that double-posts a sale. Use composite tenant/store FKs and typed source references.
Money stays integer satang; old bill name/price snapshots remain immutable; refund posts on current open day.
SalesService.create owns POS/supplemental idempotency and transaction. postToDay joins the caller-owned
transaction for reconciliation; it must not open a second transaction or commit independently. Its caller must
lock/validate the day and, for multi-bucket work, lock all accounts in ID order before posting.
Reconciliation preview uses a REPEATABLE READ READ ONLY transaction; confirm claims the key, locks the day,
checks revision and recomputes. Positive lines create RECONCILIATION sales; zero-only records increment revision
without sales/movements. Current aggregates cover existing sale payments; D3 must add original-payment
refund/reversal allocations to both the query and DB guard before those sources can ship.

Before restructuring identify consumers, dependency direction, transaction/contract/migration impact.
Preserve callers or provide a contained migration. Update affected docs and verify workflows;
folder creation alone is not architectural completion.
