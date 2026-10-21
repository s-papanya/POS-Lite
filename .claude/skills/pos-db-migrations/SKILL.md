---
name: pos-db-migrations
description: Design, create or review safe PostgreSQL schema migrations and backfills for POS-Lite while preserving tenant boundaries and financial history. Remote execution requires an explicitly authorized target.
---

# POS-Lite DB migrations

Read [data model](../../../docs/data-model.md), [domain rules](../../../docs/domain-rules.md)
and [tooling state](../../../docs/project-engineering.md).
PostgreSQL/Drizzle is selected, but no migration runner/schema exists yet.
Don't generate Prisma/TypeORM/Alembic files or claim db:migrate ran without actual tooling.
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
