import { defineConfig } from "drizzle-kit";

// Generating SQL needs no database credential or live connection.
export default defineConfig({
  dialect: "postgresql", schema: "./src/db/schema.ts", out: "./drizzle",
});
