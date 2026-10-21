---
title: Diagnose HMR Without Changing Auth or Exposure
impact: HIGH
impactDescription: "Correct local dev behavior"
tags: dev, hmr, refresh
---

> POS-Lite: read [project constraints](../references/project-constraints.md) first. Examples are conditional; measure before changing defaults or adding dependencies.

## Start with react() and Vite defaults

No custom HMR config is fine for ordinary local development.
The reviewed plugin-react6 Options has no fastRefresh:true flag; check actual installed types.
Don't force ws, polling or public host without diagnosing the network/file-watch issue.
For authorized Android LAN testing explicitly scope host/allowedHosts; never use allowedHosts:true as a shortcut.
Keep API proxy port aligned with Express.

Separate non-component exports as the Fast Refresh lint requires; avoid unconditional hot.accept hacks.
Dispose listeners/interceptors when custom HMR code genuinely needs cleanup.
Do not introduce Zustand/Axios merely to handle refresh.

POS-Lite plans same-origin HttpOnly session cookies plus CSRF; do not copy localStorage/Bearer token interceptors.
Preserve pending transaction identity across refresh and don't auto-submit money after HMR.

Reference: [Vite server options](https://vite.dev/config/server-options)
