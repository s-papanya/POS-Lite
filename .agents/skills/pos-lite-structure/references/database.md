# Database

Read this when changing SQL, repositories, connections, migrations, or seeds.

- Use PostgreSQL through `pg`, not Prisma, Mongoose, Sequelize, or another ORM. Do not create `models/` as an ORM layer; database schema changes belong in SQL migrations.
- When database work is requested, put versioned SQL under `apps/backend/database/migrations/`; add `seeds/` only for required initial or development data.
- Keep connection setup in apps/backend/src/configs/ and SQL access in apps/backend/src/repositories/. Use parameterized queries for untrusted values.
- Database changes must remain separate from HTTP handling and business calculations. Follow the [backend boundaries](backend.md) when changing application code.
- Keep credentials in environment variables; document only non-secret examples.
- Inspect existing database code and tooling before adding files. Do not assume pg, migrations, or a migration runner already exist.
