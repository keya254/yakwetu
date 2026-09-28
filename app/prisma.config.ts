import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "./prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    // `?schema=storefront` keeps every table, and Prisma's `_prisma_migrations`,
    // inside the storefront schema. The recommender (sinema-recs) shares this
    // Neon database in schema recs; apply with `prisma migrate deploy` only.
    // Migrations take the DIRECT (non-pooled) Neon endpoint: DDL should not run
    // through PgBouncer. The app itself uses the pooled DATABASE_URL.
    url: process.env["DIRECT_URL"] ?? process.env["DATABASE_URL"],
  },
});
