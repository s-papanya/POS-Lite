---
title: Choose Targets From Supported Devices
impact: HIGH
impactDescription: "Android compatibility before size claims"
tags: build, target, browsers
---

> POS-Lite: read [project constraints](../references/project-constraints.md) first. Examples are conditional; measure before changing defaults or adding dependencies.

## Match the user's Android browser

Start with the installed Vite default target. Read its version-specific baseline and test the actual supported browser set.
Do not change to esnext solely for a size estimate or assume every Android device supports the latest syntax.
Transpilation is not a blanket polyfill for missing runtime APIs.
Add legacy support only for a demonstrated support requirement and verify both build paths.

Record browser/device versions, syntax/runtime API requirements and measured payload difference.
Do not claim a fixed10–15% gain or add a plugin without need.

Reference: [Vite target](https://vite.dev/config/build-options#build-target)
