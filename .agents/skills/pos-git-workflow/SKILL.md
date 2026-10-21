---
name: pos-git-workflow
description: Prepare POS-Lite branches, focused Conventional Commits and pull requests aligned with milestones. Use for requested Git delivery and PR work; it does not authorize push, merge or deployment by itself.
---

# POS-Lite Git workflow

Read [milestones](../../../docs/milestones.md) and [conventions](../../../docs/project-engineering.md);
inspect status, branch, remote and recent history before mutations.
Main is observed integration branch; no assumed protection/CI/release automation.

## Branch/commit conventions

For requested new branches use lower-case <type>/<milestone>-<topic>, e.g. feat/m1-session-auth,
fix/m3-reconciliation-race or docs/m0-domain-rules.
Respect an existing user-selected branch; don't create branches/worktrees gratuitously.
Conventional Commits: feat(api): ..., fix(db): ..., test(api): ..., docs: ...,
chore(skills): ..., refactor(web): ... . English concrete descriptions; scopes helpful, not enforced hooks.
Mark breaking contracts and explain migration/compatibility.

Stage intended explicit paths and inspect staged diff/check; exclude dependencies/builds/secrets/DB backups/temp files.
Preserve unrelated work. Don't discard/reset/rewrite others' changes or stage everything to force a clean status.
When another consequential change is outside scope, finish your diff and identify it.
Use checks appropriate to the diff; docs/skills don't automatically need broad runtime testing.
Commit under user authorization. An available origin or milestone request alone doesn't authorize push/merge/deploy.
No default force push or silent remote/identity changes; preserve others' commits during conflict handling.

## PR conventions

Concrete title matching final scope. Explain problem/result, issue/milestone, actual validation,
remaining gaps and schema/rollout impact when applicable. Keep small changes short.
Suggested headings when useful: Summary, Validation, Risks / Migration.
Don't invent test results or readiness from build alone.
Map F1–R2 to M0–M7; one merged PR doesn't automatically close a milestone. Preserve P4/P5 decision gate.
Read existing PR templates/rules if present; don't assume one exists.
After any PR creation attach its URL to current chat via attach_artifact when available.
Don't request reviews, post external comments or create issue spam beyond communication authorization.
Report hash, branch, push/PR state and remaining dirty files accurately in Thai.
