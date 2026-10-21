---
title: Separate Vite Mode From Runtime Environment
impact: HIGH
impactDescription: "Correct staging configuration without leaking secrets"
tags: environment, modes
---

> POS-Lite: read [project constraints](../references/project-constraints.md) first. Examples are conditional; measure before changing defaults or adding dependencies.

## Public build config vs server runtime

Vite mode controls selected env files; NODE_ENV is a separate setting. --mode staging alone doesn't make backend staging
or guarantee import.meta.env.DEV. Environment variables already present when Vite starts have higher priority.
Types don't validate config values; validate public inputs and server inputs separately.

Use same-origin /api/v1 unless a real deployment needs a public API URL.
Never commit real env secrets. This repo ignores .env/.env.* except example files;
preserve that rule rather than copying generic advice to commit mode files.
Public VITE_* values are embedded at build time, not runtime secret config.
Adapt any shell examples to PowerShell when relevant.

Reference: [Vite env and mode](https://vite.dev/guide/env-and-mode)
