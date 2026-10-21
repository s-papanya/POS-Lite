---
title: Measure Before Custom Chunking
impact: MEDIUM
impactDescription: "Project-specific measurements required"
tags: build, chunks, vite, rolldown
---

> POS-Lite: read [project constraints](../references/project-constraints.md) first. Examples are conditional; measure before changing defaults or adding dependencies.

## Preserve automatic chunking until a measured problem exists

No manualChunks config is not a defect. Inspect the installed Vite bundler types/version first.
Vite8 uses Rolldown; build.rolldownOptions is the native option surface, while compatibility options may differ.
Do not paste older rollupOptions/manualChunks/advancedChunks snippets without checking support.
Don't add router/state dependencies merely to name vendor chunks.
Route/lazy boundaries may solve the actual cost more simply.

Compare initial JS transferred/parsed, request waterfall and repeat-visit cache behavior under the same conditions.
Splitting too finely can add requests, shared dependency cycles or load-time regressions.
Keep initial POS/review state stable. Typecheck/build and exercise affected lazy routes after a justified change.

Reference: [Vite build options](https://vite.dev/config/build-options)
