---
name: pos-cicd
description: Prepare or review POS-Lite CI checks, build artifacts, environment validation and authorized staging or production deployment plans. Use for delivery and environment readiness, not ordinary feature edits.
---

# POS-Lite CI/CD

Read [tooling state](../../../docs/project-engineering.md) and security/operations in
[architecture](../../../docs/architecture.md). Inspect scripts/workflows/manifests anew.
There is currently no CI pipeline, deploy target, migration command or production runbook implemented.
Don't invent infrastructure, secrets or successful pipeline runs from planned docs.

## Build and checks

Existing scaffold checks are API typecheck, web lint and web build separately.
Root build --workspaces --if-present skips the API. API start needs compiled dist/server.js;
it isn't evidence of a backend artifact. Missing required gates block a release-readiness claim.

When implementing CI within scope, use root npm ci/lockfile and a pinned compatible Node runtime.
Add explicit API emit/build, app typecheck/lint and actual Vitest/Supertest scripts before requiring them in CI.
Use disposable PostgreSQL with clean migrations, upgrade fixtures and concurrency cases.
No production DB for CI tests. Pin workflow actions to reviewed revisions when creating workflows.
Record commit, lockfile/schema version and artifact checksums. Build for the declared public client environment.
Don't conceal gaps with --if-present, continue-on-error or successful noop tests.

## Environment

Inspect names/validation status, never print secret values or dump process.env.
Current runtime uses dotenv/PORT: validate integer1–65535 and align API with Vite proxy.
Planned server contract includes NODE_ENV, DATABASE_URL, APP_ORIGIN, session/CSRF settings,
trusted proxy and development seed credentials. Require actual config validation before claiming enforcement.
Fail fast for missing/invalid required values. No .env.example exists yet; when adding it use placeholders only.
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
