# Backend

All application code belongs under `apps/backend/src/` and uses TypeScript.

| Path | Responsibility |
| --- | --- |
| `configs/` | Environment configuration and PostgreSQL connection setup. |
| `routes/` | Endpoint definitions and middleware wiring. |
| `controllers/` | HTTP input, service calls, and responses. |
| `services/` | Business rules, calculations, and workflows. |
| `repositories/` | Parameterized SQL and database access through `pg`. |
| `schemas/` | Zod request validation schemas. |
| `middlewares/` | Validation, authentication, authorization, and error handling. |
| `helpers/` | Reusable backend helpers without feature-specific business rules. |
| `public/` | Public static files only when explicitly needed. |
| `app.ts` | Express setup when separation from startup becomes necessary. |
| `index.ts` | Server startup; currently also contains Express setup. |

- Dependency direction: routes → controllers → services → repositories. Do not put SQL in controllers or HTTP response handling in services and repositories.
- Keep the existing health endpoint and entry point working. Extract `app.ts` only when the task requires it; do not add `server.js` or a parallel entry point.
- Use existing plural names `configs/` and `middlewares/`, not parallel `config/` or `middleware/` directories. Use `helpers/`, not an additional backend `utils/` folder for the same purpose.
- Validate untrusted requests at the HTTP boundary. Keep credentials in environment variables and document only non-secret examples.
- Follow existing file naming; where no convention exists, use `<feature>.controller.ts`, `<feature>.service.ts`, `<feature>.repository.ts`, `<feature>.routes.ts`, and `<feature>.schema.ts`.
