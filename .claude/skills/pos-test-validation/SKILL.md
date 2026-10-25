---
name: pos-test-validation
description: Design, implement, or audit POS-Lite unit and PostgreSQL integration tests for financial invariants, authorization, rollback and concurrency. Use for test work or evaluating test claims, not every documentation edit.
---

# POS-Lite test validation

Read [project state](../../../docs/project-engineering.md) and the affected [acceptance A–P](../../../docs/acceptance-scenarios.md).
Inspect root scripts and vitest.config.ts/vitest.db.config.ts before choosing commands.
Vitest/Supertest and real PostgreSQL integration are installed; npm test and npm run test:db are separate. Do not introduce Jest, PyTest, Cypress
or a second runner just because a generic example uses them. Python design checks are documentation checks.

## Select the level

- Unit: pure money/discount rounding, Bangkok date classification, schema validation, permission decisions.
  Use Vitest describe/it, arrange/act/assert and English behavior names. Current locations: apps/api/test/*.test.ts and apps/web/test/*.test.ts.
  Use BigInt satang internally and exact money strings at HTTP boundaries.
- API integration: Supertest against the exported Express app, real PostgreSQL migrated from scratch,
  authenticated cookie/CSRF flow and realistic memberships. Current entry: apps/api/test/database.integration.ts with business-days/sales/supplemental/reconciliation check modules.
- DB integration: actual composite FK/check/unique/deferred constraints, rollback, persisted idempotency,
  competing connections and row locks. SQLite/mocked repositories cannot prove these properties.
- UI: use installed component/browser tooling when present; React Testing Library with Vitest is a future candidate,
  not installed today. Test Thai user-visible behavior, labels and pending states; Android manual evidence is separate.
  Don't install an E2E framework for an unrelated fix.

The DB harness verifies local admin identity and a generated disposable database ownership nonce before cleanup.
Keep that safety check; never redirect it to arbitrary DATABASE_URL. Browser fixture preview-server.mjs is simulated,
not PostgreSQL evidence. A server-rendered receipt test does not prove Android/keyboard usability.
For daily UI verify distinct additional-vs-total intent, signed targets, NO_CHANGE, stale re-preview,
pending reload/login without replay, cross-flow write locks and keep/discard across stores.
Construct pending fixtures through the strict request schemas so canonicalization matches real requests.
Count mutation POSTs separately from preview/auth traffic when proving no automatic financial replay.
Reconciliation races use held row locks + pg_blocking_pids barriers, not timing sleeps; test stale revision,
NO_CHANGE audit/revision without movements, omitted buckets, multi-bucket rollback and replay after permission changes.
Never replace missing tests with a successful placeholder or claim an absent command passed.

## Fixtures and mocks

Use per-test factories for two businesses/two stores, accounts, users and Bangkok dates.
Generate unique IDs; isolate workers by database/schema as supported. Separate clients are necessary for concurrency;
an outer rollback transaction cannot isolate application commits through another pool connection.
Before setup/cleanup, verify a dedicated disposable test connection, including host/instance identity.
Never trust a database name alone or clean up an arbitrary DATABASE_URL pointing to staging/production.

Use vi.fn/vi.spyOn for clocks, generated IDs and external network adapters when relevant; reset after each case.
Do not mock pricing/permission/ledger logic in the integration case claiming to verify it.
Do not mock transaction APIs, row locks or persistence in concurrency/rollback proofs.
Use explicit timestamps or fake timers for time-dependent unit logic, not globally frozen DB concurrency.
Failure injection must fail before real commit and assert no partial source/payment/movement/audit/key remains.

## Meaningful evidence

Map the change to A–P and add the smallest useful regression test. For new money-write paths verify same-key
replay after lost response, changed-payload conflict, wrong-store denial, CLOSED-day denial, consistent source/ledger
and rollback. For reconciliation/closing/refund, use deterministic barriers on separate connections to exercise
both lock orders; no sleep-based races. Assert final balances, row counts, IDs and references rather than private call order.
Account lock queues can block the second waiter behind the first, not directly behind the test blocker;
follow the transitive pg_blocking_pids graph and require both requests to wait before releasing the barrier.
For expense debits test unpaid/no movement, immediate and later-payment audit failures, same-debt races,
shared-bank no-overdraft and direct SQL guards. Immutable source row locks must work while id=id rewrites fail.
When another debit source is added, race it against an existing module on one shared bank, not only itself;
check zero balance is allowed, owner flows leave sales/expenses unchanged, and revoked OWNER fails after a lock wait.
Historical closed-day fixtures may be manufactured only by the disposable DB admin and must restore guards;
they do not prove the application can bypass the separate D4 next-day gate.
Include shared-bank deduplication, negative refund days and original receiving account vs actual payout account when affected.

Report commands, DB version/fixtures, pass/fail/unrun cases and limits in Thai.
Build/lint/schema checks don't prove application tests, DB safety or production readiness.
