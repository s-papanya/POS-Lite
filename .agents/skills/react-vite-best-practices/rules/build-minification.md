---
title: Preserve Supported Minification Defaults
impact: MEDIUM
impactDescription: "Measure size and runtime behavior"
tags: build, minification, oxc
---

> POS-Lite: read [project constraints](../references/project-constraints.md) first. Examples are conditional; measure before changing defaults or adding dependencies.

## Version-aware minification

Keep the installed Vite minifier default unless measurements justify another option.
The reviewed Vite8 types support Oxc; inspect actual types/docs before changing flags.
Do not nest esbuild inside build or assume an old drop-console snippet applies to Oxc.
Do not mangle API/DTO property names or strip error logging to hide oversized dependencies.
Never rely on minification as secret redaction; secrets must not enter client code.
Keep required license notices.

If evaluating another minifier, compare actual gzip/Brotli transfer and build time, verify production UI behavior,
and document installed dependency/config changes. No fixed percentage savings claim without measurement.

Reference: [Vite minify](https://vite.dev/config/build-options#build-minify)
