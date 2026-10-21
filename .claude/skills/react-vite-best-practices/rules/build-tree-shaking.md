---
title: Preserve Side Effects While Measuring Tree Shaking
impact: MEDIUM
impactDescription: "Avoid removing initialization or styles"
tags: build, tree-shaking, esm
---

> POS-Lite: read [project constraints](../references/project-constraints.md) first. Examples are conditional; measure before changing defaults or adding dependencies.

## Use defaults and inspect the actual bundle

ESM imports allow tree shaking; barrel or namespace imports are not automatically broken.
Don't declare missing package sideEffects metadata a defect in this app.
Do not set moduleSideEffects:no-external, propertyReadSideEffects:false or disable try/catch safeguards blindly:
initialization, CSS, polyfills or runtime getters may be significant.
If publishing a genuinely side-effect-free shared package, declare accurate metadata and preserve style/init files.
Do not add lodash/date/router libraries just because examples use them.

Measure what remains in the production artifact and test affected initialization/styles before and after changes.
Dependency prebundling is a dev optimization, not proof of production tree shaking.

Reference: [Vite build options](https://vite.dev/config/build-options)
