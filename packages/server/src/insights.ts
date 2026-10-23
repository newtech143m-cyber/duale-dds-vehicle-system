import "server-only";
import { prisma } from "@dds/database";
import { activeTaxYear } from "./tax";

/** Dashboard figures — all computed from live data. */
export async function dashboardStats() {
  const year = await activeTaxYear();
  const now = new Date();

  const [totals] = await prisma.$queryRaw<{
    vehicles: number; active_regs: number; expired_regs: number; no_reg: number; reviews: number;
  }[]>`
    WITH latest AS (
      SELECT DISTINCT ON (r.vehicle_id) r.vehicle_id, r.status, r.valid_until
      FROM registrations r WHERE r.status <> 'CANCELLED'
      ORDER BY r.vehicle_id, r.registered_at DESC
    )
    SELECT
      (SELECT count(*)::int FROM vehicles WHERE archived_at IS NULL) AS vehicles,
      (SELECT count(*)::int FROM latest l JOIN vehicles v ON v.id = l.vehicle_id AND v.archived_at IS NULL
         WHERE l.status = 'ACTIVE' AND (l.valid_until IS NULL OR l.valid_until > ${now})) AS active_regs,
      (SELECT count(*)::int FROM latest l JOIN vehicles v ON v.id = l.vehicle_id AND v.archived_at IS NULL
         WHERE l.status = 'EXPIRED' OR (l.status = 'ACTIVE' AND l.valid_until <= ${now})) AS expired_regs,
      (SELECT count(*)::int FROM vehicles v WHERE v.archived_at IS NULL AND NOT EXISTS (SELECT 1 FROM latest l WHERE l.vehicle_id = v.id)) AS no_reg,
      (SELECT count(*)::int FROM review_requests WHERE status IN ('OPEN','IN_PROGRESS')) AS reviews`;

  const [incomplete] = await prisma.$queryRaw<{ n: number }[]>`
    SELECT count(*)::int AS n FROM vehicles v
    WHERE v.archived_at IS NULL AND (
      v.vin IS NULL OR v.color IS NULL
      OR NOT EXISTS (SELECT 1 FROM vehicle_photos p WHERE p.vehicle_id = v.id AND p.angle = 'PRIMARY' AND p.removed_at IS NULL)
      OR NOT EXISTS (SELECT 1 FROM registrations r WHERE r.vehicle_id = v.id AND r.status IN ('ACTIVE','EXPIRED')))`;

  const taxRows = await prisma.$queryRaw<{ status: string; n: number }[]>`
    WITH a AS (
      SELECT ta.id, ta.amount_due, ta.due_date, ta.allow_partial, ta.exempted_at, ta.under_review,
        COALESCE((SELECT sum(pa.amount) FROM payment_allocations pa JOIN tax_payments tp ON tp.id = pa.payment_id
                  WHERE pa.assessment_id = ta.id AND tp.status = 'POSTED'), 0) AS paid
      FROM tax_assessments ta JOIN vehicles v ON v.id = ta.vehicle_id AND v.archived_at IS NULL
      WHERE ta.tax_year = ${year} AND ta.cancelled_at IS NULL
    )
    SELECT CASE
      WHEN under_review THEN 'UNDER_REVIEW'
      WHEN exempted_at IS NOT NULL THEN 'EXEMPT'
      WHEN paid >= amount_due THEN 'PAID'
      WHEN (due_date + 1) <= ${now}::date THEN 'OVERDUE'
      WHEN paid > 0 AND allow_partial THEN 'PARTIALLY_PAID'
      ELSE 'UNPAID' END AS status, count(*)::int AS n
    FROM a GROUP BY 1`;
  const assessedVehicles = taxRows.reduce((s, r) => s + r.n, 0);
  const taxByStatus = Object.fromEntries(taxRows.map((r) => [r.status, r.n])) as Record<string, number>;
  taxByStatus.NOT_ASSESSED = Math.max(0, (totals?.vehicles ?? 0) - assessedVehicles);

  const [revenue] = await prisma.$queryRaw<{ total: string; this_year: string }[]>`
    SELECT COALESCE(sum(amount), 0)::text AS total,
           COALESCE(sum(amount) FILTER (WHERE extract(year FROM paid_at) = ${year}), 0)::text AS this_year
    FROM tax_payments WHERE status = 'POSTED'`;

  const monthly = await prisma.$queryRaw<{ month: string; registrations: number }[]>`
    SELECT to_char(date_trunc('month', created_at AT TIME ZONE 'Africa/Addis_Ababa'), 'YYYY-MM') AS month, count(*)::int AS registrations
    FROM vehicles WHERE created_at > now() - interval '12 months' GROUP BY 1 ORDER BY 1`;
  const collection = await prisma.$queryRaw<{ month: string; amount: string }[]>`
    SELECT to_char(date_trunc('month', paid_at AT TIME ZONE 'Africa/Addis_Ababa'), 'YYYY-MM') AS month, sum(amount)::text AS amount
    FROM tax_payments WHERE status = 'POSTED' AND paid_at > now() - interval '12 months' GROUP BY 1 ORDER BY 1`;
  const categories = await prisma.$queryRaw<{ name: string; n: number }[]>`
    SELECT c.name, count(v.id)::int AS n FROM vehicle_categories c
    LEFT JOIN vehicles v ON v.category_id = c.id AND v.archived_at IS NULL
    GROUP BY c.name HAVING count(v.id) > 0 ORDER BY n DESC`;

  const recentVehicles = await prisma.vehicle.findMany({
    where: { archivedAt: null }, orderBy: { createdAt: "desc" }, take: 6, include: { category: true, currentOwner: true },
  });
  const recentVerifications = await prisma.verificationEvent.findMany({ orderBy: { createdAt: "desc" }, take: 6 });

  return {
    year,
    vehicles: totals?.vehicles ?? 0,
    activeRegistrations: totals?.active_regs ?? 0,
    expiredRegistrations: totals?.expired_regs ?? 0,
    incomplete: incomplete?.n ?? 0,
    reviews: totals?.reviews ?? 0,
    unpaid: (taxByStatus.UNPAID ?? 0) + (taxByStatus.OVERDUE ?? 0) + (taxByStatus.PARTIALLY_PAID ?? 0),
    paidThisYear: taxByStatus.PAID ?? 0,
    revenueTotal: revenue?.total ?? "0",
    revenueYear: revenue?.this_year ?? "0",
    taxByStatus, monthly, collection: collection.map((c) => ({ month: c.month, amount: Number(c.amount) })),
    categories, recentVehicles, recentVerifications,
  };
}

/** CSV with a header block; minimal personal data in bulk exports. */
export function toCsv(title: string, columns: string[], rows: (string | number | null | undefined)[][]): string {
  const esc = (v: unknown) => {
    const s = v === null || v === undefined ? "" : String(v);
    // Neutralise spreadsheet formula injection.
    const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
    return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  return [
    esc(title), esc(`Generated ${new Date().toISOString()}`), "",
    columns.map(esc).join(","),
    ...rows.map((r) => r.map(esc).join(",")),
  ].join("\r\n");
}
