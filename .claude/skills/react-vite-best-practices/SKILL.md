---
name: react-vite-best-practices
description: Review or optimize POS-Lite React/Vite performance, build output, code splitting, HMR, assets and public environment configuration. Use for relevant performance or configuration work, not every React edit.
license: MIT
metadata:
  author: agent-skills
  version: "2.0.0-pos-lite.1"
---

# React + Vite best practices — POS-Lite adaptation

Local adaptation of asyrafhussin/agent-skills v2.0.0. Preserve MIT attribution and upstream origin.
Read [project constraints](references/project-constraints.md) first, then only the rule relevant to the task.
The compiled AGENTS.md is optional reference material, not a command to load all rules.

## Decide from actual evidence

Inspect apps/web/package.json, lockfile, installed Vite/plugin types and current vite.config.ts.
The reviewed installation is Vite8.3.5, React19 and plugin-react6; recheck before new configuration.
Start with framework defaults. No manual vendor chunks, optimizeDeps list, minifier change, browser-target change,
plugin installs or prefetch systems without a relevant measured issue.
The historical rule impact labels/percentage savings are upstream estimates, not measured facts about POS-Lite.

Preserve the app's API proxy and Node port; don't copy port3000 for Vite and collide with Express.
ESM config must not assume __dirname exists. No automatic public host or relaxed allowedHosts.
Session auth is server-side cookies/CSRF, not localStorage/Bearer token examples.
Keep the seller's draft/review state above deferred components and preserve session/store identity.

## Load only what helps

- Build/chunks/minifier/target/source maps: read the matching rules/build-*.md.
- Lazy routes/heavy features/Suspense/prefetch: read matching rules/split-*.md.
- HMR/prebundling/refresh: read matching rules/dev-*.md.
- Images/SVG/fonts/public assets: read matching rules/asset-*.md.
- Public build variables/modes/secrets: read matching rules/env-*.md.
- Measured bundle investigation: read rules/bundle-visualizer.md.

Do not treat every upstream "Incorrect" default or optional absence as a defect:
no SVGR/router/analyzer/preload is fine if not needed. Do not install example dependencies just to apply a rule.
Use imports/assets natively first; protect Thai glyph coverage and avoid unnecessary requests on Android.

For an optimization deliver the baseline, specific change, same-condition before/after measurements and actual
typecheck/build/runtime checks. If measurement is unavailable say so, not a percentage improvement claim.
Static hashed assets may be cached, but HTML must revalidate and private API/session data must not be cached as public assets.

[Review record](../../../docs/skills-review.md) documents local corrections and limits.
