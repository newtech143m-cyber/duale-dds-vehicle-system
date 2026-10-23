import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/prisma/client";

// One client per server instance (survives Next.js hot reload in dev).
// Server-only: never import this file from a client component.
//
// DATABASE_URL = Supabase *transaction* pooler (port 6543) with the portal's own
// least-privilege login role, e.g.
//   postgresql://dds_registration_login.<project-ref>:<password>@<pooler-host>:6543/postgres?sslmode=require
// Transaction pooling + serverless: keep the per-instance pool small.
const globalForPrisma = globalThis as unknown as { __ddsPrisma?: PrismaClient };

function createClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set");
  }
  const adapter = new PrismaPg({
    connectionString,
    max: Number(process.env.DATABASE_POOL_MAX ?? 3),
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 10_000,
  });
  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });
}

export const prisma: PrismaClient = globalForPrisma.__ddsPrisma ?? createClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.__ddsPrisma = prisma;
}
