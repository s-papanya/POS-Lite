# Validation and Completion

- Update affected imports, callers, and meaningful tests when behavior changes. Do not create folders or placeholders solely to complete the architecture.
- Update README structure and status when this task changes them; keep planned work distinct from implemented work.
- Run relevant existing scripts from the root: `npm run build`, `npm run lint -w apps/frontend`, and `npm run typecheck -w apps/backend`. Check package scripts first in case they change. Report skipped or failing checks; never claim unrun tests passed.
