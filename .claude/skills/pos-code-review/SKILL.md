---
name: pos-code-review
description: Review POS-Lite changes for financial correctness, authorization, regressions, migration safety and evidence quality. Use for requested reviews or material risky changes, not every wording edit.
---

# POS-Lite code review

Inspect requested diff/base and affected callers/configs. Read [project state](../../../docs/project-engineering.md),
[domain rules](../../../docs/domain-rules.md) and affected [acceptance cases](../../../docs/acceptance-scenarios.md).
Review within scope; don't turn a review into unrequested implementation or deployment.

Prioritize concrete bugs with a plausible trigger and observable consequence:

- Wrong business/store access, STAFF report exposure, cookie/CSRF/session regressions, secrets in log/bundle.
- Trusted client totals, floating-point money, stale price accepted, mutated snapshots, tendered cash double-counted.
- Reconciliation ignores supplemental/refund/reversal totals, confuses original receiving vs payout account,
  silently reduces sales, or duplicates delta under concurrent confirm.
- Wrong key scope/hash/replay, replay bypassing current permissions, key committed separately from source,
  partial source/payment/movement/audit commits, unstable lock order or absent day/account locks.
- Over/duplicate refund, unpaid expense moving money, owner/transfer treated as sales/expense,
  shared bank total duplicated, variance posted silently, closing history overwritten.
- Destructive migration, weak tenant FKs/source slots, missing backfill/compatibility/restore evidence.
- Success before commit, new key after timeout, draft replay under another user/store, lost form state on lazy/remount,
  or UI-only authorization.

Check tests actually exercise the risk: real PostgreSQL for locks/constraints/rollback and deterministic concurrent clients.
Mocked integration suites or health/build don't prove these properties.
Don't demand implementation-mirroring tests for harmless reversible edits.
Missing planned features are context, not automatically bugs in an intentionally small foundation PR.
Use static inspection when enough; run targeted checks to resolve concrete uncertainties.

Report actionable findings first by impact with file/line, trigger, consequence and focused fix direction.
P0 immediate critical impact; P1 serious financial/access corruption; P2 ordinary bugs; P3 low-impact improvement.
Justify severity rather than assigning by topic. Separate confirmed findings, questions and missing evidence.
If no findings, say so with residual untested risks. Summarize actual checks in Thai.
Don't claim production-ready from build, docs or skill validation.
