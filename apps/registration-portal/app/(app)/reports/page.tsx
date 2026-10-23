import { formatDate } from "@dds/i18n";
import { activeTaxYear, audit, buildReport, canRunReport, getI18n, officeTimezone, REPORT_KINDS, requireStaff, type ReportKind } from "@dds/server";
import { Button, ButtonLink, Card, Emblem, EmptyState, Input, PageHeader, Select, Table, Td, Th } from "@dds/ui";
import { PrintButton } from "@dds/ui/client";

export const metadata = { title: "Reports" };

export default async function ReportsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const staff = await requireStaff("report.view");
  const { m, locale } = await getI18n();
  const sp = await searchParams;
  const available = REPORT_KINDS.filter((k) => canRunReport(staff, k));
  const kind = (available as readonly string[]).includes(sp.kind ?? "") ? (sp.kind as ReportKind) : available[0]!;
  const year = Number(sp.year) || (await activeTaxYear());
  const params = { from: sp.from, to: sp.to, year: kind === "unpaid" || (kind === "payments" && sp.year) ? year : undefined };
  const report = await buildReport(kind, { ...params, limit: 500 });
  await audit({ actorId: staff.id, action: "report.view", entityType: "report", entityId: kind, metadata: { rows: report.rows.length } });
  const label: Record<ReportKind, string> = {
    registrations: m.reports.registrations, unpaid: m.reports.unpaid, expired: m.reports.expired,
    incomplete: m.reports.incomplete, payments: m.reports.payments, activity: m.reports.activity,
  };
  const csvQs = new URLSearchParams(Object.entries({ ...params, year: params.year ? String(params.year) : undefined }).filter(([, v]) => v) as [string, string][]);
  const tz = officeTimezone();

  return (
    <>
      <PageHeader title={m.reports.title} actions={<>
        <PrintButton label={m.common.print} />
        {staff.permissions.has("report.export") && <ButtonLink variant="secondary" href={`/api/reports/${kind}?${csvQs}`}>{m.common.exportCsv}</ButtonLink>}
      </>} />
      <Card className="mb-4 no-print">
        <form className="flex flex-wrap gap-3 p-4">
          <Select name="kind" defaultValue={kind} className="w-64">{available.map((k) => <option key={k} value={k}>{label[k]}</option>)}</Select>
          {(kind === "unpaid" || kind === "payments") && <Input type="number" name="year" defaultValue={sp.year ?? (kind === "unpaid" ? year : "")} placeholder={m.tax.year} className="w-32" aria-label={m.tax.year} />}
          {kind !== "unpaid" && kind !== "expired" && kind !== "incomplete" && <>
            <Input type="date" name="from" defaultValue={sp.from} aria-label={m.reports.from} className="w-40" />
            <Input type="date" name="to" defaultValue={sp.to} aria-label={m.reports.to} className="w-40" />
          </>}
          <Button type="submit" variant="secondary">{m.common.filter}</Button>
        </form>
      </Card>
      <Card>
        <div className="flex items-center gap-3 p-5 border-b border-line">
          <Emblem />
          <div>
            <p className="font-semibold text-navy-900">{label[kind]}</p>
            <p className="text-xs text-muted">{m.app.office} · {m.reports.generated}: {formatDate(new Date(), locale, tz, true)} · {staff.fullName}{sp.from || sp.to ? ` · ${sp.from ?? "…"} → ${sp.to ?? "…"}` : ""}</p>
          </div>
          <span className="ml-auto text-sm text-muted">{report.rows.length} {report.rows.length === 500 ? "(first 500 — export CSV for all)" : ""}</span>
        </div>
        {report.rows.length === 0 ? <EmptyState title={m.common.noResults} /> : (
          <Table>
            <thead><tr>{report.columns.map((c) => <Th key={c}>{c}</Th>)}</tr></thead>
            <tbody>{report.rows.map((r, i) => <tr key={i}>{r.map((c, j) => <Td key={j} className="text-[13px]">{c ?? ""}</Td>)}</tr>)}</tbody>
          </Table>
        )}
      </Card>
    </>
  );
}
