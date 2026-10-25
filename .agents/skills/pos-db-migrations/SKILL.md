---
name: pos-db-migrations
description: Design, create or review safe PostgreSQL schema migrations and backfills for POS-Lite while preserving tenant boundaries and financial history. Remote execution requires an explicitly authorized target.
---

# POS-Lite DB migrations

Read [data model](../../../docs/data-model.md), [domain rules](../../../docs/domain-rules.md)
and [tooling state](../../../docs/project-engineering.md).
PostgreSQL/Drizzle schema and runner exist in apps/api/src/db and apps/api/drizzle.
Use npm run db:generate and review SQL plus meta snapshot/journal; do not introduce another migration framework.
The local db:migrate CLI verifies development host/DB/user and applied checksums, serializes migration execution
and bounds locks/statements. Trigger functions and grantRuntimeAccess are maintained explicitly, not generated
from Drizzle table definitions. New immutable sources normally get SELECT/INSERT only for the runtime role.
PostgreSQL row locks require UPDATE on at least one column: expenses grants UPDATE(id) solely for locking,
with an unconditional immutable trigger rejecting every UPDATE/DELETE, including id=id. Never grant broad
UPDATE to solve a lock permission error; verify both the lock and denied rewrites with the runtime role.
New debit sources need typed composite ledger FKs, exactly-one-source checks, correct signed amounts,
full-payment/source-kind deferred guards and an account-locked no-overdraft INSERT guard. Preserve existing credit guards.
An owner source slot permits both signs only with a deferred kind/amount/actor/exactly-one-movement guard.
For a trigger shared across tables, branch with PL/pgSQL IF on TG_TABLE_NAME before reading table-specific
NEW fields; SQL CASE can resolve an absent record field while planning even if that branch is unchosen.
Transfer ledger slots require non-null OUT/IN legs, unique(transfer_id,leg) and a deferred guard matching
both legs to source store/day/account/actor and equal principal. CHECK must explicitly reject a null leg,
not rely on IN() returning NULL. Positive fee headers must reference one fully paid source-store expense
on the source account with matching amount/time/actor/category; keep its guards and immutability intact.
D3 must replace unique(expense_id), paid-status and service checks together with reversal-aware active payments.
Reconciliation guards validate header/line scope, recorded amounts, deltas and linked RECONCILIATION sales;
when D3 adds refunds/reversals, update both service aggregates and the guard together.
Inspect schema/history/runner version before choosing commands/paths.

## Data and compatibility

Use new versioned reviewed migrations; don't edit already-applied files.
No schema push/reset/drop-recreate/production seed on an existing DB as a shortcut.
Preserve financial sources/snapshots/movements/audits/idempotency/document scopes.
Renaming is not dropping and re-adding data; inspect generated SQL and ORM rename heuristics.

For required columns on populated tables prefer expand → compatible app → bounded resumable backfill
→ verify → enforce constraint → contract after old readers/writers retire.
Explain default business meaning; don't invent historical account/store/price values or rewrite totals to pass constraints.
Backfill with stable keys, progress/retry semantics, row bounds and before/after reconciliation.
Use additive/nullable transitions where needed; retain BIGINT satang and date/timezone semantics.

Name normalization and uniqueness must agree across validation and PostgreSQL: normalize display values
before storing/hash, enforce scoped case-insensitive uniqueness in the DB, and test direct SQL plus parallel
creates. Lookup creation still needs atomic source/audit/key; it must not create ledger rows or open a day.
Require composite tenant/store FKs, source slots, idempotency uniqueness and checks from data-model.md.
Deferred total checks supplement service locks/atomic writes, not replace them.
Add indexes for real history/report/closing queries; inspect existing indexes.
Assess lock level/table size, bounded lock_timeout/statement_timeout and execution window.
CREATE INDEX CONCURRENTLY needs supported nontransactional runner handling, never inside BEGIN.
For supported FK/CHECK changes consider NOT VALID then VALIDATE; verify actual PostgreSQL/runner behavior.
This mechanism doesn't apply to every constraint, such as UNIQUE/NOT NULL.

## Verification and apply

Use disposable real PostgreSQL for clean install and upgrade from representative prior data,
including two businesses/stores and confirmed transactions.
Assert unchanged IDs/references/snapshots/ledger totals, constraints rejecting invalid direct SQL,
compatible old/new app behavior during transition and safe backfill retries.
Restore a backup to a separate database and check invariants; backup exit0 isn't restore proof.

Migration creation is separate from staging/production application.
Remote apply requires user authorization for target/action, verified connection identity,
reviewed migration list, backup/restore evidence and recovery plan; never print DB URL/password.
Use existing authorized pipeline with migration serialization; no implicit infrastructure/permission expansion.
Before local resets/cleanup verify disposable connection/instance, not DB name or env label alone.

After failure inspect runner records/DB state before retry; timeout may have committed DDL.
Stop unchanged retries. Prefer forward repair after data migration commits;
blind down/drop or restoring over new financial transactions can lose data.
Production restore requires explicit scope and understood data-loss window.
Deliver files/SQL, compatibility and lock assessment, actual verification, apply/recovery limits in Thai.
