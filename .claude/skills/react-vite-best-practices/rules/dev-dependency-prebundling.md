---
title: Diagnose Prebundling Before Adding Includes
impact: MEDIUM
impactDescription: "Measure dev cold start or dependency errors"
tags: dev, prebundling
---

> POS-Lite: read [project constraints](../references/project-constraints.md) first. Examples are conditional; measure before changing defaults or adding dependencies.

## Prefer dependency discovery

Missing optimizeDeps is not itself a defect. Measure repeated optimization or identify a missed linked/dynamic import
before adding a targeted include/exclude. Check installed dependencies; don't install router/query/store/date libraries
to satisfy a sample config. Inspect Vite8's installed optimizer option types before using legacy esbuildOptions.
Warm only actual frequently used files when measurements justify it.
Do not repeatedly clear caches or force optimization to mask a persistent resolution error.

Reference: [Vite dependency prebundling](https://vite.dev/guide/dep-pre-bundling)
