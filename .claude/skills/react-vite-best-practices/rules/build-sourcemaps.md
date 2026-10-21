---
title: Keep Source Maps Out of Public Artifacts
impact: HIGH
impactDescription: "Hidden maps are still emitted files"
tags: build, sourcemaps, deployment
---

> POS-Lite: read [project constraints](../references/project-constraints.md) first. Examples are conditional; measure before changing defaults or adding dependencies.

## Source-map policy

sourcemap:false is a valid default without a private debugging workflow.
sourcemap:hidden omits the browser sourceMappingURL comment but still emits map files;
it does not prevent downloading a publicly served .map URL.
If private error tracking is authorized, generate/upload maps privately and remove/exclude them from public assets,
or explicitly deny access and verify the deployed URL behavior.
Do not add a monitoring account/plugin or upload source automatically.
Never put credentials into code/maps; sourcemapExcludeSources alone isn't an access control.

Reference: [Vite sourcemap](https://vite.dev/config/build-options#build-sourcemap)
