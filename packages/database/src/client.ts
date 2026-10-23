import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/prisma/client";

// One client per server instance (survives Next.js hot reload in dev).
// Server-only: never import this file from a client component.
//
// DATABASE_URL = Supabase *transaction* pooler (port 6543) with the portal's own
// least-privilege login role, e.g.
//   postgresql://dds_registration_login.<project-ref>:<password>@<pooler-host>:6543/postgres
//
// TLS: Supabase signs its pooler certificate with its own CA. Put that CA (PEM,
// "Download certificate" under Database → SSL configuration) in DATABASE_CA_CERT to
// get full certificate + hostname verification. Without it, the URL's sslmode applies.
const globalForPrisma = globalThis as unknown as { __ddsPrisma?: PrismaClient };

function createClient(): PrismaClient {
  const raw = process.env.DATABASE_URL;
  if (!raw) {
    throw new Error("DATABASE_URL is not set");
  }
  const ca = process.env.DATABASE_CA_CERT?.replace(/\\n/g, "\n").trim();
  let connectionString = raw;
  if (ca) {
    const url = new URL(raw);
    url.searchParams.delete("sslmode"); // explicit ssl config below takes over
    connectionString = url.toString();
  }
  const adapter = new PrismaPg({
    connectionString,
    ...(ca ? { ssl: { ca, rejectUnauthorized: true } } : {}),
    max: Number(process.env.DATABASE_POOL_MAX ?? 3),
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 10_000,
  });
  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });
}

function getClient(): PrismaClient {
  if (!globalForPrisma.__ddsPrisma) globalForPrisma.__ddsPrisma = createClient();
  return globalForPrisma.__ddsPrisma;
}

/**
 * Lazily-created client: importing this module never opens a connection or
 * requires DATABASE_URL (so `next build` works without database access).
 */
export const prisma: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    const client = getClient();
    const value = Reflect.get(client, prop, client);
    return typeof value === "function" ? value.bind(client) : value;
  },
});
