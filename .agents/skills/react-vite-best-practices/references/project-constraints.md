# POS-Lite constraints for performance work

Relative links below resolve from this reference.
See [current state](../../../../docs/project-engineering.md) and [UX](../../../../docs/ux-flows.md).

Current UI is a starter with no router, Tailwind, auth, component library or financial pages.
Do not add any of them as a side effect of performance review.
White/navy Thai mobile UI needs readable18px text,48px targets and stable drafts, not screenshot-only optimization.
Keep the primary selling workflow fast; lazy-load heavy history/report/export screens when implemented and justified.

Auth plan: HttpOnly same-origin session cookie with CSRF. No localStorage token or unconditional request replay.
Financial DTOs use satang strings, not Number; unknown commit outcome retains original key/payload/identity.

Treat upstream snippets not replaced locally as contextual examples, not required configs.
- No manual chunk/prebundle mandates; Vite8 types/official docs govern Rolldown/Oxc options.
- No guaranteed size/latency percentages; measure this app.
- sourcemap:hidden still emits .map files; keep them out of public artifact or deny serving explicitly.
- React.lazy declarations belong at module scope. Suspense isn't an error boundary or an ordinary fetch loading handler.
- Default HMR works for ordinary local development; no react({fastRefresh:true}), forced ws or polling by default.
- No global tree-shaking side-effect suppression, API property mangling or stripping observability to optimize size.
- VITE_* exposes public values. Other env names aren't automatically safe if plugins/define/logs copy values.
- Shell env assignment examples must be adapted to PowerShell, not silently copied from POSIX commands.
- Latin-only font subsets cannot serve Thai. SVG as img is valid; SVGR needs an installed plugin and actual benefit.
- Prefetch code only when useful; don't prefetch private financial data or add unhandled preload rejections.
- Build target reflects measured Android/browser compatibility. Transpilation target doesn't add every runtime polyfill.

skills-lock.json source/hash describes installed upstream provenance, not a freshly recomputed hash of local adaptations.
After reinstall/update inspect local changes again; don't fake installer hashes.
