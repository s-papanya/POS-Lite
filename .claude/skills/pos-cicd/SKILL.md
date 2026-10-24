---
name: pos-cicd
description: Prepare or review POS-Lite CI checks, build artifacts, environment validation and authorized staging or production deployment plans. Use for delivery and environment readiness, not ordinary feature edits.
---

# POS-Lite CI/CD

Read [tooling state](../../../docs/project-engineering.md) and security/operations in
[architecture](../../../docs/architecture.md). Inspect scripts/workflows/manifests anew.
There is no CI pipeline, deploy target or production runbook yet. Local migration commands exist.
Don't invent infrastructure, secrets or successful pipeline runs from planned docs.

## Build and checks

Root npm run typecheck/lint/test/test:db/build are implemented. Build explicitly emits shared/validation,
API dist and Vite dist; API start requires dist/server.js. test:db uses disposable real PostgreSQL.
Run appropriate gates and distinguish their evidence; missing required gates block release readiness.

When implementing CI within scope, use root npm ci/lockfile and a pinned compatible Node runtime.
Reuse the existing explicit workspace build and Vitest/Supertest scripts in CI.
Use disposable PostgreSQL with clean migrations, upgrade fixtures and concurrency cases.
No production DB for CI tests. Pin workflow actions to reviewed revisions when creating workflows.
Record commit, lockfile/schema version and artifact checksums. Build for the declared public client environment.
Don't conceal gaps with --if-present, continue-on-error or successful noop tests.

## Environment

Inspect names/validation status, never print secret values or dump process.env.
Inspect apps/api/src/config.ts, modules/auth/config.ts and .env.example for the actual validated contract.
PORT must align with Vite proxy; DB/session/APP_ORIGIN and seed credentials remain server-side.
No trusted proxy configuration or production topology is implied by local success.
Preserve existing .env; .env.example contains placeholders, never copy real credentials into it.
SEED_OWNER_PASSWORD is bootstrap/dev input, not a shipped default or production auto-seed.

VITE_* values are public build-time constants. Keep secrets server-side; no broad define/process.env or envPrefix exposure.
ImportMetaEnv types don't validate config values. Vite --mode staging selects env files;
it doesn't set backend NODE_ENV or create staging infrastructure. Check NODE_ENV and mode independently.

## Staging/production

Prepare exact target, app/schema versions, credential source, traffic topology, backup/restore evidence,
migration compatibility/lock budget, cookie/CSRF/proxy config and recovery triggers.
Prefer same-origin HTTPS with Secure/HttpOnly/SameSite cookies. No wildcard credentialed CORS,
unbounded trust proxy, public dev servers or sample production transactions.
Use non-production/anonymized staging fixtures and verify business flows after migration.

Actual deploy/remote migration/rollback needs user authorization covering that target/action; the skill supplies none.
If target/access is missing, finish local artifacts and identify the missing information.
With authorization use the existing pipeline; don't bootstrap hosting or broaden permissions implicitly.
Keep previous compatible app artifact. Prefer expand/contract migrations.
App rollback must not blindly undo data migrations or restore over later financial transactions.

Verify deployed version/health plus authenticated access, isolation and representative money/read paths
with an explicitly safe test account/dataset. Health200 alone is insufficient.
Without authorized safe write fixtures, do read-only checks and report the write-path verification gap.
Stop rollout on failed financial/restore/migration invariants. Don't repeat unchanged failures;
inspect whether a timed-out migration/deploy committed before retrying. Report results without secrets in Thai.
