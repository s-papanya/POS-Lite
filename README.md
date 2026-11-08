# POS-Lite — Store Finance Manager

POS-Lite is a mobile-first web application intended for manually recording and analyzing income, expenses, and business costs across multiple stores. It is not a Point-of-Sale checkout system.

The repository currently contains an application scaffold. The financial workflows described below are planned, not implemented.

## Current Implementation

- npm workspaces manage `apps/frontend` and `apps/backend`.
- A shared development command runs both applications through concurrently.
- The frontend renders the React/Vite starter page with a counter and plain CSS.
- The Express backend enables JSON parsing and CORS and exposes `GET /api/health`.
- The frontend does not call the backend yet. There is no database connection, request validation layer, authentication, or financial data persistence.

### Planned Features

- Manually record income, expenses, and business costs.
- Organize financial records across multiple stores.
- Analyze store finances through a mobile-first interface.

These describe the intended product scope, not available functionality.

## Technology Stack

| Area | Currently installed and configured | Planned additions (not installed) |
| --- | --- | --- |
| Frontend | React, React DOM, TypeScript, Vite, ESLint | Tailwind CSS, shadcn/ui, React Router |
| Backend | Node.js, Express, TypeScript, cors, dotenv; tsx for development | PostgreSQL access through `pg`, Zod request validation |
| Monorepo | npm workspaces, concurrently | None required for the current scaffold |

The planned database approach is PostgreSQL with direct SQL through `pg` (node-postgres). No ORM is installed; do not introduce Prisma or another ORM.

## Project Structure

Existing files and directories, excluding dependencies, local environment files, build output, and `.gitkeep` files.

### Repository Root

```text
POS-Lite/
├── apps/
│   ├── frontend/
│   └── backend/
├── .gitignore
├── docker-compose.yml
├── package.json
├── package-lock.json
└── README.md
```

| Path | Purpose |
| --- | --- |
| `apps/` | Frontend and backend workspaces. |
| `package.json` | Workspace definitions and shared scripts. |
| `package-lock.json` | Workspace dependency lockfile. |
| `.gitignore` | Git exclusions. |
| `docker-compose.yml` | Empty; no services configured yet. |
| `README.md` | Project overview and setup. |

### Frontend

```text
apps/frontend/
├── public/
│   ├── favicon.svg
│   └── icons.svg
├── src/
│   ├── assets/
│   │   ├── hero.png
│   │   ├── react.svg
│   │   └── vite.svg
│   ├── components/
│   ├── features/
│   ├── hooks/
│   ├── layouts/
│   ├── pages/
│   ├── services/
│   ├── types/
│   ├── utils/
│   ├── App.css
│   ├── App.tsx
│   ├── index.css
│   └── main.tsx
├── .gitignore
├── eslint.config.js
├── index.html
├── package.json
├── package-lock.json
├── README.md
├── tsconfig.app.json
├── tsconfig.json
├── tsconfig.node.json
└── vite.config.ts
```

| Path | Purpose |
| --- | --- |
| `public/` | Static files served directly. |
| `src/assets/` | Imported images and logos. |
| `src/components/` | Shared UI components. |
| `src/features/` | Feature-specific components, hooks, services, and types. |
| `src/hooks/` | Shared React hooks. |
| `src/layouts/` | Layouts and navigation. |
| `src/pages/` | Route-level pages. |
| `src/services/` | Shared API clients. |
| `src/types/` | Shared TypeScript types. |
| `src/utils/` | Utility functions. |
| `src/App.tsx`, `src/main.tsx` | Root component and React entry point. |
| `src/App.css`, `src/index.css` | Application and global styles. |
| `index.html` | HTML entry point. |
| `eslint.config.js`, `tsconfig*.json`, `vite.config.ts` | Lint, TypeScript, and build configuration. |
| `package.json`, `package-lock.json`, `.gitignore` | Scripts, dependencies, and Git exclusions. |
| `README.md` | Original Vite template documentation. |

The eight module directories from `components/` through `utils/` contain only `.gitkeep` placeholders. The current UI is the Vite starter page.

### Backend

```text
apps/backend/
├── src/
│   ├── configs/
│   ├── controllers/
│   ├── helpers/
│   ├── middlewares/
│   ├── public/
│   ├── repositories/
│   ├── routes/
│   ├── schemas/
│   ├── services/
│   └── index.ts
├── .env.example
├── .gitignore
├── package.json
├── package-lock.json
└── tsconfig.json
```

| Path | Purpose |
| --- | --- |
| `src/configs/` | Configuration and database setup. |
| `src/controllers/` | HTTP request and response handling. |
| `src/helpers/` | Helper functions. |
| `src/middlewares/` | Request processing and error handling. |
| `src/public/` | Static files; not served yet. |
| `src/repositories/` | SQL and data access. |
| `src/routes/` | API routes. |
| `src/schemas/` | Request validation. |
| `src/services/` | Business logic and calculations. |
| `src/index.ts` | Express configuration, health endpoint, and server startup. |
| `.env.example` | Sample environment variables. |
| `tsconfig.json` | TypeScript configuration. |
| `package.json`, `package-lock.json`, `.gitignore` | Scripts, dependencies, and Git exclusions. |

All nine backend module directories contain only `.gitkeep` placeholders. Working server code remains in `src/index.ts`.

### Development Conventions

- Keep feature-specific code in `features/`; share code only when needed.
- Introduce backend layers as needed: routes → controllers → services → repositories.
- `app.ts` and `database/` do not exist yet; pg, Zod, and React Router are not installed.
- Planned database access: PostgreSQL through pg, without an ORM.

## Getting Started

### Prerequisites

- Node.js 22.12 or later in the Node.js 22 release line, or Node.js 24.
- npm with workspace support. The current checks were run with Node.js 24.20.0 and npm 12.2.0.

PostgreSQL and Docker are not required to run the current scaffold.

```sh
node --version
npm --version
```

### Install Dependencies

From the repository root:

```sh
npm install
```

This installs dependencies for both workspaces. For a clean installation using the root lockfile, use `npm ci` instead.

### Environment Variables

The backend loads environment variables through `dotenv/config`. Optionally create `apps/backend/.env` to override the default API port:

```dotenv
PORT=3001
```

`PORT` is the only environment variable read by the current application. If it is unset, the backend uses `3001`. No database credentials or frontend environment variables are required yet. `apps/backend/.env.example` currently contains `PORT=3000`; copying that value into `.env` changes the API port to `3000`. The example above uses `3001` to match the default URLs in this README.

Local `.env` files are ignored by Git. Keep secrets out of documentation and commits. Variables prefixed with `VITE_` are exposed to the frontend bundle and must not contain secrets.

### Run in Development

From the repository root:

```sh
npm run dev
```

Both applications watch for source changes. Press `Ctrl+C` to stop them.

- Frontend: [http://localhost:5173](http://localhost:5173), unless Vite selects another port; check the terminal.
- API health: [http://localhost:3001/api/health](http://localhost:3001/api/health), using the default backend port.

The health endpoint returns:

```json
{
  "status": "ok",
  "service": "POS-Lite API"
}
```

Backend CORS currently allows only `http://localhost:5173`. If the frontend uses another origin, update the CORS configuration in `apps/backend/src/index.ts` before calling the API from the browser. No Vite API proxy is configured.

## Commands

All commands below run from the repository root and correspond to existing package scripts.

| Command | Description |
| --- | --- |
| `npm run dev` | Run frontend and backend together. |
| `npm run dev:frontend` | Run the Vite development server only. |
| `npm run dev:backend` | Run the backend with `tsx watch`. |
| `npm run build` | Build both workspaces, including frontend TypeScript checks. |
| `npm run build -w apps/frontend` | Check frontend TypeScript and build with Vite. |
| `npm run build -w apps/backend` | Compile backend TypeScript. |
| `npm run lint -w apps/frontend` | Run frontend ESLint. |
| `npm run typecheck -w apps/backend` | Check backend TypeScript without emitting files. |
| `npm run start -w apps/backend` | Run the compiled backend from `dist/index.js`. |
| `npm run preview -w apps/frontend` | Preview the frontend build locally. |

Build output goes to `apps/frontend/dist/` and `apps/backend/dist/`. Run the relevant build before `start` or `preview`. Vite preview is for local inspection; Express does not currently serve the frontend build.

There is no root lint or typecheck script, backend lint script, dedicated frontend typecheck script, automated test script, or database migration command. Use the supported workspace commands above.

## Validation

The following checks passed during this documentation review:

```sh
npm run build
npm run lint -w apps/frontend
npm run typecheck -w apps/backend
```

These checks validate the current scaffold, not the planned financial workflows. No business features, dependencies, database setup, or application behavior were changed as part of this review.
