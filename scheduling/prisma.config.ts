import "dotenv/config";
import { defineConfig, env } from "prisma/config";

// Prisma 7 no longer reads `datasource.url` from schema.prisma; the schema in
// the Task 4 brief targets an older Prisma CLI. This config file supplies the
// same DATABASE_URL to `db push` / `generate` so the brief's schema (minus
// the now-invalid inline `url = env(...)` line) behaves identically.
export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    url: env("DATABASE_URL"),
  },
});
