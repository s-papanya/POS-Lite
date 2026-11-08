# Frontend

All application code belongs under `apps/frontend/src/`.

| Path | Responsibility |
| --- | --- |
| `components/` | Reusable UI across features. |
| `features/` | Feature-specific components, hooks, services, and types. |
| `pages/` | Route-level screens; compose feature modules. |
| `layouts/` | Shared layouts and navigation. |
| `hooks/` | Application-wide reusable React hooks. |
| `services/` | Shared API clients and cross-feature services. |
| `utils/` | General-purpose utility functions. |
| `types/` | Shared TypeScript types and interfaces. |
| `assets/` | Imported images and other bundled assets. |
| `App.tsx`, `main.tsx` | Root component and React entry point. |

- Keep feature-only code with its feature; move it to shared directories only when there is a real shared use.
- For a new component or page that needs companion files, use a named folder such as `components/Button/Button.tsx` or `pages/Home/Home.tsx`. Follow an existing local pattern if present; do not move simple existing components just for symmetry.
- Colocate required styles and tests. Use `.tsx` for JSX, `.ts` for plain TypeScript, and `.css` for styles. Do not create both CSS and styled-code files without a concrete need.
- Add `index.ts` or `index.tsx` only when a folder export is useful. Add stories only if Storybook is configured and the task calls for them. Do not generate empty tests, stories, styles, or barrel files.
- Reuse existing UI and styling patterns. Tailwind CSS, shadcn/ui, and React Router are planned choices; verify installation before using them. Do not add dependencies as part of an unrelated edit.
