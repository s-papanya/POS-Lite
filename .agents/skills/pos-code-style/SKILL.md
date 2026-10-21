---
name: pos-code-style
description: Apply POS-Lite TypeScript naming, import, lint and module conventions when editing code or performing style-focused review. Avoid unrelated formatting sweeps.
---

# POS-Lite code style

Read [engineering conventions](../../../docs/project-engineering.md) and the nearest tsconfig/ESLint config.
Use enforced rules first, then local conventions; distinguish convention from installed tooling.

- English identifiers/code, Thai UI and owner-facing explanations.
- camelCase values/functions, PascalCase components/types, UPPER_SNAKE_CASE module constants;
  DB snake_case, JSON camelCase, error codes UPPER_SNAKE_CASE.
- New domain files sales.service.ts/sales.repository.ts/sales.schema.ts where useful;
  React SaleForm.tsx and hooks useSaleDraft.ts. Don't rename established files merely for style.
- Preserve quotes/semicolons of touched files: API predominantly double/semicolons, web single/no semicolons.
  No project Prettier/import-sort config exists yet; don't reformat unrelated code.
- Group new imports Node built-ins → third party → workspace → relative → CSS; use import type for types.
  Preserve intended side effects/order, especially dotenv/config and CSS cascades.
- API NodeNext ESM relative imports use emitted .js paths. Web follows Vite/bundler tsconfig.
  Don't copy server alias/extension assumptions to browser or introduce aliases without matching config.
- API strict TypeScript is enabled; retain it. Parse unknown input and narrow types rather than using any casts
  or suppressions to hide invalid DTO/config. Inspect web tsconfig rather than assuming the same options.
- Never convert BigInt money to Number, parseFloat money input or JSON-serialize raw BigInt.
  Use exact satang strings at HTTP boundaries and explicit Bangkok date helpers.
- Hooks stay unconditional with correct dependencies; don't disable Hooks/Fast Refresh lint to pass.
  Memoize only for measured render cost or a required stable identity, not mechanically.

Web lint extends JS/TypeScript recommended, React Hooks and React Refresh Vite configs.
No custom quote/import-sort rules or API lint script are enforced.
Run affected existing lint/typecheck after code edits; documentation-only edits need link/diff checks.
Introduce shared formatter rules as a scoped tooling change, separate from business behavior.
