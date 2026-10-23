import Link from "next/link";
import { prisma } from "@dds/database";
import { formatMoney, toCents } from "@dds/domain";
import { formatDate } from "@dds/i18n";
import { paginationSchema } from "@dds/validation";
import { activeTaxYear, getI18n, officeTimezone, requireStaff, statusOf } from "@dds/server";
import { Button, ButtonLink, Card, CardHeader, EmptyState, Field, Input, PageHeader, Pagination, Select, StatusBadge, Table, Td, Th } from "@dds/ui";
import { ActionForm, SubmitButton } from "@dds/ui/client";
import { bulkAssessAction } from "./actions";

export const metadata = { title: "Annual tax" };
const STATUSES = ["PAID", "UNPAID", "PARTIALLY_PAID", "OVERDUE", "EXEMPT", "UNDER_REVIEW"] as const;

export default async function TaxPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const staff = await requireStaff("tax.read");
  const { m, locale } = await getI18n();
  const sp = await searchParams;
  const pg = paginationSchema.parse(sp);
  const year = Number(sp.year) || (await activeTaxYear());
  const want = STATUSES.find((s) => s === sp.status);
  const now = new Date();
  const tz = officeTimezone();

  // Status is derived from payments, so filter after computing it (bounded by year).
  const all = await prisma.taxAssessment.findMany({
    where: { taxYear: year, cancelledAt: null, vehicle: { archivedAt: null, ...(pg.q ? { plateNormalized: { contains: pg.q.replace(/\s/g, "").toUpperCase() } } : {}) } },
    include: { vehicle: true, taxRule: true, allocations: { include: { payment: true } } },
    orderBy: { dueDate: "asc" },
  });
  const withStatus = all.map((a) => ({ a, s: statusOf(a, now) })).filter((x) => !want || x.s.status === want);
  const rows = withStatus.slice((pg.page - 1) * pg.pageSize, pg.page * pg.pageSize);
  const sum = (k: "amountDue" | "amountPaid" | "balance") => formatMoney(withStatus.reduce((t, x) => t + toCents(x.s[k]), 0n));
  const [payments, unassessed] = await Promise.all([
    prisma.taxPayment.findMany({ orderBy: { createdAt: "desc" }, take: 10, include: { vehicle: true, receipt: true } }),
    prisma.vehicle.count({ where: { archivedAt: null, assessments: { none: { taxYear: year, cancelledAt: null } } } }),
  ]);
  const qs = (patch: Record<string, string | number | undefined>) => {
    const u = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...sp, year, ...patch })) if (v !== undefined && String(v) !== "") u.set(k, String(v));
    return `/tax?${u}`;
  };

  return (
    <>
      <PageHeader title={`${m.nav.tax} · ${year}`}
        actions={<>
          {staff.permissions.has("report.export") && <ButtonLink variant="secondary" href={`/api/reports/payments?year=${year}`}>{m.common.exportCsv}</ButtonLink>}
          <ButtonLink variant="secondary" href="/tax/rules">{m.nav.taxRules}</ButtonLink>
        </>} />

      <div className="grid gap-4 sm:grid-cols-3 mb-6">
        {[[m.tax.amountDue, sum("amountDue")], [m.tax.paid, sum("amountPaid")], [m.tax.balance, sum("balance")]].map(([l, v]) => (
          <Card key={l} className="p-5"><p className="text-sm text-muted">{l}</p><p className="mt-2 text-2xl font-semibold text-navy-900 tabular-nums">{v}</p></Card>
        ))}
      </div>

      {staff.permissions.has("tax.assess") && unassessed > 0 && (
        <Card className="p-5 mb-6">
          <ActionForm action={bulkAssessAction} className="flex flex-wrap items-end gap-3" confirmText={`${m.tax.bulkAssess} ${year}?`}>
            <input type="hidden" name="year" value={year} />
            <p className="flex-1 min-w-60 text-sm"><span className="font-semibold text-navy-900">{unassessed}</span> · {m.status.NOT_ASSESSED} ({year})</p>
            <SubmitButton variant="secondary">{m.tax.bulkAssess}</SubmitButton>
          </ActionForm>
        </Card>
      )}

      <Card className="mb-6">
        <form className="flex flex-wrap gap-3 p-4 border-b border-line" role="search">
          <Input name="q" defaultValue={pg.q} placeholder={m.vehicle.plate} className="flex-1 min-w-48" />
          <Field label="" className="w-32"><Input type="number" name="year" defaultValue={year} min={2000} max={2100} aria-label={m.tax.year} /></Field>
          <Select name="status" defaultValue={want ?? ""} className="w-48">
            <option value="">{m.common.status}: {m.common.all}</option>
            {STATUSES.map((s) => <option key={s} value={s}>{m.status[s]}</option>)}
          </Select>
          <Button type="submit" variant="secondary">{m.common.filter}</Button>
        </form>
        {rows.length === 0 ? <EmptyState title={m.common.noResults} /> : (
          <Table>
            <thead><tr><Th>{m.vehicle.plate}</Th><Th>{m.tax.rule}</Th><Th>{m.tax.amountDue}</Th><Th>{m.tax.paid}</Th><Th>{m.tax.balance}</Th><Th>{m.tax.dueDate}</Th><Th>{m.common.status}</Th></tr></thead>
            <tbody>
              {rows.map(({ a, s }) => (
                <tr key={a.id} className="hover:bg-navy-50/40">
                  <Td><Link className="font-semibold text-navy-800 hover:underline" href={`/vehicles/${a.vehicleId}`}>{a.vehicle.plateNumber}</Link></Td>
                  <Td className="max-w-56"><span className="block truncate">{a.taxRule.name}</span>{a.taxRule.source === "CONFIGURED" && <span className="text-[11px] text-warn-800">{m.tax.configured}</span>}</Td>
                  <Td className="tabular-nums">{formatMoney(toCents(s.amountDue))}</Td>
                  <Td className="tabular-nums">{formatMoney(toCents(s.amountPaid))}</Td>
                  <Td className="tabular-nums font-medium">{formatMoney(toCents(s.balance))}</Td>
                  <Td>{formatDate(a.dueDate, locale, "UTC")}</Td>
                  <Td><StatusBadge status={s.status} label={m.status[s.status]} /></Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
        <Pagination page={pg.page} pageSize={pg.pageSize} total={withStatus.length} hrefFor={(p) => qs({ page: p })}
          labels={{ previous: m.common.previous, next: m.common.next, page: m.common.page, of: m.common.of }} />
      </Card>

      <Card>
        <CardHeader title={m.nav.payments} />
        {payments.length === 0 ? <EmptyState title={m.common.noResults} /> : (
          <Table>
            <thead><tr><Th>{m.tax.receiptNo}</Th><Th>{m.vehicle.plate}</Th><Th>{m.tax.amount}</Th><Th>{m.tax.paidAt}</Th><Th>{m.common.status}</Th></tr></thead>
            <tbody>{payments.map((p) => (
              <tr key={p.id}>
                <Td>{p.receipt ? <Link href={`/tax/receipts/${p.receipt.id}`} className="font-mono text-xs text-teal-700 hover:underline">{p.receipt.receiptNumber}</Link> : "—"}</Td>
                <Td>{p.vehicle.plateNumber}</Td><Td className="tabular-nums">{formatMoney(toCents(p.amount.toString()))}</Td>
                <Td>{formatDate(p.paidAt, locale, tz)}</Td><Td><StatusBadge status={p.status} label={m.status[p.status]} /></Td>
              </tr>
            ))}</tbody>
          </Table>
        )}
      </Card>
    </>
  );
}
