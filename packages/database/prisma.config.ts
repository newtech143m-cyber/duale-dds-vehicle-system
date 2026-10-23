import "dotenv/config";
import { defineConfig } from "prisma/config";

// Migrations use the DIRECT (non-pooled) Neon connection.
// The runtime client uses the pooled DATABASE_URL via the Neon adapter (src/client.ts).
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    // `prisma generate` (run during Vercel builds) needs no connection, so a missing
    // URL must not fail the build. Migrate/seed commands fail clearly if it is unset.
    url: process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL ?? "",
  },
});
