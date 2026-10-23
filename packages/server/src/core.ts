import "server-only";
import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { prisma, Prisma, type Portal } from "@dds/database";
import { formatSequence } from "@dds/domain";

export type PortalName = "registration" | "verification";

/** Which portal this deployment is. Enforced server-side for every permission check. */
export function currentPortal(): PortalName {
  return process.env.APP_PORTAL === "verification" ? "verification" : "registration";
}
export function portalEnum(): Portal {
  return currentPortal() === "verification" ? "VERIFICATION" : "REGISTRATION";
}

export function officeTimezone(): string {
  return process.env.OFFICE_TIMEZONE || "Africa/Addis_Ababa";
}

/** Error whose message is an i18n key safe to show to the user. */
export class UserError extends Error {
  constructor(public readonly key: string, public readonly field?: string) {
    super(key);
  }
}

/** SHA-256 of client IP + day, so abuse can be correlated without storing raw IPs. */
export async function requestIpHash(): Promise<string | null> {
  const h = await headers();
  const ip = (h.get("x-forwarded-for") ?? "").split(",")[0]?.trim() || h.get("x-real-ip") || "";
  if (!ip) return null;
  const day = new Date().toISOString().slice(0, 10);
  return createHash("sha256").update(`${ip}|${day}|${process.env.IP_HASH_SALT ?? "dds"}`).digest("hex");
}

type Tx = Prisma.TransactionClient | typeof prisma;

export interface AuditEntry {
  actorId: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  /** Field names / non-sensitive values only. Never passwords, tokens or full personal records. */
  metadata?: Record<string, unknown>;
}

export async function audit(entry: AuditEntry, tx: Tx = prisma): Promise<void> {
  // createMany = INSERT without RETURNING, so the verification DB role needs no SELECT on audit_logs.
  await tx.auditLog.createMany({
    data: {
      actorId: entry.actorId,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId ?? null,
      portal: portalEnum(),
      ipHash: await requestIpHash().catch(() => null),
      metadata: (entry.metadata ?? undefined) as Prisma.InputJsonValue | undefined,
    },
  });
}

/**
 * Fixed-window rate limit stored in Postgres. Returns true when allowed.
 */
export async function rateLimit(key: string, limit: number, windowSeconds = 60): Promise<boolean> {
  const now = Math.floor(Date.now() / 1000);
  const windowStart = new Date((now - (now % windowSeconds)) * 1000);
  const rows = await prisma.$queryRaw<{ count: number }[]>`
    INSERT INTO rate_limit_buckets (key, window_start, count) VALUES (${key}, ${windowStart}, 1)
    ON CONFLICT (key, window_start) DO UPDATE SET count = rate_limit_buckets.count + 1
    RETURNING count`;
  return (rows[0]?.count ?? 0) <= limit;
}

/** Gap-free numbering (receipts, verification refs). Must run inside the business transaction. */
export async function nextSequence(tx: Prisma.TransactionClient, kind: "receipt" | "verification"): Promise<string> {
  const year = new Date().getUTCFullYear();
  const name = `${kind}-${year}`;
  const prefix = `${kind === "receipt" ? "RCPT" : "VER"}-${year}-`;
  await tx.$executeRaw`
    INSERT INTO number_sequences (name, prefix, next_value, padding, updated_at)
    VALUES (${name}, ${prefix}, 1, 6, now()) ON CONFLICT (name) DO NOTHING`;
  const rows = await tx.$queryRaw<{ value: bigint; prefix: string; padding: number }[]>`
    UPDATE number_sequences SET next_value = next_value + 1, updated_at = now()
    WHERE name = ${name} RETURNING next_value - 1 AS value, prefix, padding`;
  const r = rows[0];
  if (!r) throw new Error(`sequence ${name} missing`);
  return formatSequence(r.prefix, BigInt(r.value), Number(r.padding));
}

export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const s = await prisma.systemSetting.findUnique({ where: { key } });
  return (s?.value as T | undefined) ?? fallback;
}

/** Maps unique-index violations to user-facing keys. */
export function mapUniqueViolation(e: unknown): UserError | null {
  const msg = e instanceof Error ? e.message : String(e);
  const code = (e as { code?: string })?.code;
  if (code !== "P2002" && !/unique|duplicate key/i.test(msg)) return null;
  const meta = JSON.stringify((e as { meta?: unknown })?.meta ?? "") + msg;
  if (/plate/.test(meta)) return new UserError("vehicle.duplicatePlate", "plateNumber");
  if (/vin/.test(meta)) return new UserError("vehicle.duplicateVin", "vin");
  if (/certificate/.test(meta)) return new UserError("vehicle.duplicateCertificate", "certificateNumber");
  if (/payment_reference/.test(meta)) return new UserError("validation.duplicateReference", "paymentReference");
  if (/tax_assessments/.test(meta)) return new UserError("validation.alreadyAssessed");
  if (/business_reg/.test(meta)) return new UserError("validation.duplicateBusinessReg", "businessRegNumber");
  if (/email/.test(meta)) return new UserError("validation.duplicateEmail", "email");
  return new UserError("validation.duplicate");
}
