---
name: pos-lite-structure
description: Keep POS-Lite frontend and backend code changes aligned with the repository architecture. Use when adding, editing, moving, or reviewing application modules in this project.
---

# POS-Lite Structure

POS-Lite is a mobile-first Store Finance Manager for manual income, expense, and business cost records across stores. It is not a checkout system.

## Shared Rules

- Read the root README, relevant package.json files, and affected code. Inspect callers before changing exports, signatures, or file paths.
- Follow the actual repository structure. Distinguish implemented modules from placeholders and planned dependencies.
- Keep changes scoped to the request. Preserve working code; do not add layers, dependencies, or placeholder files just to complete a tree.
- Use PostgreSQL through pg without an ORM. Do not stage, commit, push, or rewrite Git history unless explicitly requested for the current task.

## Read by Task

Load only the references relevant to the current task. A change spanning multiple areas needs each relevant reference.

| When | Reference |
| --- | --- |
| Editing React components, pages, hooks, styles, or frontend modules | [Frontend](references/frontend.md) |
| Editing Express routes, controllers, services, middleware, or server setup | [Backend](references/backend.md) |
| Editing SQL, repositories, database connections, migrations, or seeds | [Database](references/database.md); also read Backend when changing application code |
| Selecting checks, updating documentation, or reporting completion | [Validation and completion](references/validation.md) |
