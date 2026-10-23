import "server-only";
import { prisma, type Prisma } from "@dds/database";
import { effectiveRegistrationStatus, formatMoney, missingEssentials, toCents } from "@dds/domain";
import { normalizePlate } from "@dds/validation";
import { ownerDisplayName } from "./registry";
import { activeTaxYear, statusOf } from "./tax";
import type { Staff } from "./session";

export const REPORT_KINDS = ["registrations", "unpaid", "expired", "incomplete", "payments", "activity"] as const;
export type ReportKind = (typeof REPORT_KINDS)[number];

/** Which permission each report needs (in addition to report.view). */
export const REPORT_PERMISSION: Record<ReportKind, "report.view" | "report.financial" | "audit.read"> = {
  registrations: "report.view", expired: "report.view", incomplete: "report.view",
  unpaid: "report.financial", payments: "report.financial", activity: "audit.read",
};

export interface ReportParams { from?: string; to?: string; year?: number; q?: string; limit?: number }
export interface Report { title: string; columns: string[]; rows: (string | number | null)[][] }

const d = (x: Date | null | undefined) => (x ? x.toISOString().slice(0, 10) : "");
const range = (p: ReportParams): Prisma.DateTimeFilter | undefined =>
  p.from || p.to ? { ...(p.from ? { gte: new Date(p.from) } : {}), ...(p.to ? { lte: new Date(`${p.to}T23:59:59Z`) } : {}) } : undefined;

export function canRunReport(staff: Staff, kind: ReportKind): boolean {
  return staff.permissions.has("report.view") && staff.permissions.has(REPORT_PERMISSION[kind]);
}

export async function buildReport(kind: ReportKind, p: ReportParams): Promise<Report> {
  const limit = Math.min(p.limit ?? 10_000, 10_000);
  const now = new Date();
  switch (kind) {
    case "registrations": {
      const rows = await prisma.vehicle.findMany({
        where: { archivedAt: null, ...(range(p) ? { createdAt: range(p) } : {}), ...(p.q ? { plateNormalized: { contains: normalizePlate(p.q) } } : {}) },
        include: { category: true, office: true, currentOwner: true, registrations: { where: { status: { not: "CANCELLED" } }, orderBy: { registeredAt: "desc" }, take: 1 } },
        orderBy: { createdAt: "desc" }, take: limit,
      });
      return {
        title: "Vehicle registration report",
        columns: ["Plate", "Make", "Model", "Year", "Category", "Usage", "Owner", "Office", "Certificate", "Registration status", "Valid until", "Registered on"],
        rows: rows.map((v) => {
          const r = v.registrations[0];
          return [v.plateNumber, v.make, v.model, v.manufactureYear, v.category.name, v.usage, ownerDisplayName(v.currentOwner), v.office.name,
            r?.certificateNumber ?? "", effectiveRegistrationStatus(r ? { status: r.status, validUntil: r.validUntil } : null, now), d(r?.validUntil), d(v.createdAt)];
        }),
      };
    }
    case "expired": {
      const regs = await prisma.registration.findMany({
        where: { status: { in: ["ACTIVE", "EXPIRED"] }, validUntil: { lte: now }, vehicle: { archivedAt: null } },
        include: { vehicle: { include: { registrations: { orderBy: { registeredAt: "desc" }, take: 1 } } }, office: true },
        orderBy: { validUntil: "asc" }, take: limit,
      });
      // Only report vehicles whose LATEST registration is expired.
      const latest = regs.filter((r) => r.vehicle.registrations[0]?.id === r.id);
      return {
        title: "Expired registrations",
        columns: ["Plate", "Certificate", "Valid until", "Days expired", "Office"],
        rows: latest.map((r) => [r.vehicle.plateNumber, r.certificateNumber, d(r.validUntil), Math.floor((now.getTime() - r.validUntil!.getTime()) / 86_400_000), r.office.name]),
      };
    }
    case "incomplete": {
      const vs = await prisma.vehicle.findMany({
        where: { archivedAt: null },
        include: { currentOwner: true, photos: { where: { angle: "PRIMARY", removedAt: null }, take: 1 }, registrations: { where: { status: { in: ["ACTIVE", "EXPIRED"] } }, take: 1 } },
        orderBy: { createdAt: "desc" }, take: limit,
      });
      const rows = vs.map((v) => ({
        v, missing: missingEssentials({
          plateNumber: v.plateNumber, make: v.make, model: v.model, categoryId: v.categoryId, vin: v.vin, color: v.color,
          hasPrimaryPhoto: v.photos.length > 0, owner: { displayName: ownerDisplayName(v.currentOwner), phone: v.currentOwner.phone },
          hasActiveOrExpiredRegistration: v.registrations.length > 0,
        }),
      })).filter((x) => x.missing.length);
      return { title: "Incomplete records", columns: ["Plate", "Make / model", "Missing"], rows: rows.map(({ v, missing }) => [v.plateNumber, `${v.make} ${v.model}`, missing.join(", ")]) };
    }
    case "unpaid": {
      const year = p.year ?? (await activeTaxYear(now));
      const as = await prisma.taxAssessment.findMany({
        where: { taxYear: year, cancelledAt: null, vehicle: { archivedAt: null } },
        include: { vehicle: { include: { currentOwner: true } }, allocations: { include: { payment: true } } },
        orderBy: { dueDate: "asc" },
      });
      const rows = as.map((a) => ({ a, s: statusOf(a, now) })).filter((x) => ["UNPAID", "OVERDUE", "PARTIALLY_PAID"].includes(x.s.status)).slice(0, limit);
      return {
        title: `Unpaid annual tax ${year}`,
        columns: ["Plate", "Owner", "Amount due", "Paid", "Balance", "Due date", "Status"],
        rows: rows.map(({ a, s }) => [a.vehicle.plateNumber, ownerDisplayName(a.vehicle.currentOwner), s.amountDue, s.amountPaid, s.balance, d(a.dueDate), s.status]),
      };
    }
    case "payments": {
      const where: Prisma.TaxPaymentWhereInput = {
        ...(range(p) ? { paidAt: range(p) } : {}),
        ...(p.year ? { allocations: { some: { assessment: { taxYear: p.year } } } } : {}),
      };
      const ps = await prisma.taxPayment.findMany({ where, include: { vehicle: true, receipt: true, office: true, allocations: { include: { assessment: true } } }, orderBy: { paidAt: "desc" }, take: limit });
      const collectors = await prisma.user.findMany({ where: { id: { in: [...new Set(ps.map((x) => x.collectedById))] } }, select: { id: true, fullName: true } });
      const name = new Map(collectors.map((c) => [c.id, c.fullName]));
      const posted = ps.filter((x) => x.status === "POSTED").reduce((t, x) => t + toCents(x.amount.toString()), 0n);
      return {
        title: `Annual tax payments${p.year ? ` ${p.year}` : ""} · posted total ${formatMoney(posted)}`,
        columns: ["Receipt", "Plate", "Tax year", "Amount (ETB)", "Method", "Reference", "Paid on", "Office", "Collected by", "Status"],
        rows: ps.map((x) => [x.receipt?.receiptNumber ?? "", x.vehicle.plateNumber, x.allocations[0]?.assessment.taxYear ?? "", x.amount.toString(), x.method, x.paymentReference, d(x.paidAt), x.office.name, name.get(x.collectedById) ?? "", x.status]),
      };
    }
    case "activity": {
      const logs = await prisma.auditLog.findMany({ where: { ...(range(p) ? { createdAt: range(p) } : {}) }, orderBy: { createdAt: "desc" }, take: limit });
      const users = await prisma.user.findMany({ select: { id: true, fullName: true } });
      const name = new Map(users.map((u) => [u.id, u.fullName]));
      return {
        title: "Officer activity & audit report",
        columns: ["Time (UTC)", "Staff", "Action", "Record type", "Record", "Portal"],
        rows: logs.map((l) => [l.createdAt.toISOString().replace("T", " ").slice(0, 19), l.actorId ? name.get(l.actorId) ?? l.actorId : "", l.action, l.entityType, l.entityId ?? "", l.portal]),
      };
    }
  }
}
