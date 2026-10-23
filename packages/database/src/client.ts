import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaClient } from "./generated/prisma/client";

// One client per server instance (survives Next.js hot reload in dev).
// Server-only: never import this file from a client component.
const globalForPrisma = globalThis as unknown as { __ddsPrisma?: PrismaClient };

function createClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set");
  }
  const adapter = new PrismaNeon({ connectionString });
  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });
}

export const prisma: PrismaClient = globalForPrisma.__ddsPrisma ?? createClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.__ddsPrisma = prisma;
}
