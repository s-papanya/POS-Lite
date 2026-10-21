---
title: Keep Credentials Out of Client Artifacts
impact: HIGH
impactDescription: "Prevent secret exposure beyond variable naming"
tags: security, environment
---

> POS-Lite: read [project constraints](../references/project-constraints.md) first. Examples are conditional; measure before changing defaults or adding dependencies.

## VITE_* is public, and naming alone is not protection

VITE_* values are exposed to the browser by design. Server-only variables also leak if copied through define,
envPrefix changes, plugins, generated files, logs or source maps. Do not dump process.env into client config.
Session/DB/CSRF secrets remain server-side. No authentication token in localStorage.
Use same-origin session cookie and explicit CSRF handling for mutations.

Review public config allowlist and production artifacts without printing secret values.
A name-based development console warning is not a release secret check or config validation.
Do not add Stripe/JWT/payment integrations from generic examples; they are not POS-Lite requirements.

Reference: [Vite env variables](https://vite.dev/guide/env-and-mode)
