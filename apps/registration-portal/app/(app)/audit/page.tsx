import { prisma, type Prisma } from "@dds/database";
import { formatDate } from "@dds/i18n";
import { paginationSchema } from "@dds/validation";
import { audit, getI18n, officeTimezone, requireStaff } from "@dds/server";
import { Button, ButtonLink, Card, EmptyState, Input, PageHeader, Pagination, Select, Table, Td, Th } from "@dds/ui";

export const metadata = { title: "Audit log" };

export default async function AuditPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const staff = await requireStaff("audit.read");
  const { m, locale } = await getI18n();
  const sp = await searchParams;
  const pg = paginationSchema.parse({ ...sp, pageSize: sp.pageSize ?? 50 });
  const where: Prisma.AuditLogWhereInput = {
    ...(sp.action ? { action: { startsWith: sp.action } } : {}),
    ...(sp.actor ? { actorId: sp.actor } : {}),
    ...(sp.portal === "REGISTRATION" || sp.portal === "VERIFICATION" ? { portal: sp.portal } : {}),
    ...(sp.from || sp.to ? { createdAt: { ...(sp.from ? { gte: new Date(sp.from) } : {}), ...(sp.to ? { lte: new Date(`${sp.to}T23:59:59Z`) } : {}) } } : {}),
  };
  const [total, rows, staffList] = await Promise.all([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({ where, orderBy: { createdAt: "desc" }, skip: (pg.page - 1) * pg.pageSize, take: pg.pageSize }),
    prisma.user.findMany({ select: { id: true, fullName: true }, orderBy: { fullName: "asc" } }),
  ]);
  await audit({ actorId: staff.id, action: "audit.view", entityType: "audit_log", metadata: { filters: Object.keys(sp) } });
  const names = new Map(staffList.map((u) => [u.id, u.fullName]));
  const tz = officeTimezone();
  const qs = (page: number) => `/audit?${new URLSearchParams({ ...Object.fromEntries(Object.entries(sp).filter(([, v]) => v)) as Record<string, string>, page: String(page) })}`;
  return (
    <>
      <PageHeader title={m.audit.title} subtitle={`${total}`}
        actions={staff.permissions.has("report.export") && <ButtonLink variant="secondary" href={`/api/reports/activity?${new URLSearchParams(Object.fromEntries(Object.entries(sp).filter(([, v]) => v)) as Record<string, string>)}`}>{m.common.exportCsv}</ButtonLink>} />
      <Card>
        <form className="flex flex-wrap gap-3 p-4 border-b border-line">
          <Input name="action" defaultValue={sp.action} placeholder={`${m.audit.action} (vehicle., tax., verify.)`} className="w-56" />
          <Select name="actor" defaultValue={sp.actor ?? ""} className="w-56"><option value="">{m.audit.actor}: {m.common.all}</option>{staffList.map((u) => <option key={u.id} value={u.id}>{u.fullName}</option>)}</Select>
          <Select name="portal" defaultValue={sp.portal ?? ""} className="w-44"><option value="">{m.audit.portal}: {m.common.all}</option><option value="REGISTRATION">Registration</option><option value="VERIFICATION">Verification</option></Select>
          <Input type="date" name="from" defaultValue={sp.from} aria-label={m.reports.from} className="w-40" />
          <Input type="date" name="to" defaultValue={sp.to} aria-label={m.reports.to} className="w-40" />
          <Button type="submit" variant="secondary">{m.common.filter}</Button>
        </form>
        {rows.length === 0 ? <EmptyState title={m.common.noResults} /> : (
          <Table>
            <thead><tr><Th>{m.verify.time}</Th><Th>{m.audit.actor}</Th><Th>{m.audit.action}</Th><Th>{m.audit.entity}</Th><Th>{m.audit.portal}</Th><Th>{m.common.details}</Th></tr></thead>
            <tbody>{rows.map((r) => (
              <tr key={r.id.toString()}>
                <Td className="whitespace-nowrap text-muted">{formatDate(r.createdAt, locale, tz, true)}</Td>
                <Td>{r.actorId ? names.get(r.actorId) ?? r.actorId.slice(0, 8) : "—"}</Td>
                <Td className="font-mono text-xs">{r.action}</Td>
                <Td className="text-xs">{r.entityType}{r.entityId ? <span className="block font-mono text-muted">{r.entityId.slice(0, 12)}</span> : null}</Td>
                <Td className="text-xs">{r.portal}</Td>
                <Td className="font-mono text-[11px] text-muted max-w-72 truncate" title={r.metadata ? JSON.stringify(r.metadata) : ""}>{r.metadata ? JSON.stringify(r.metadata) : ""}</Td>
              </tr>
            ))}</tbody>
          </Table>
        )}
        <Pagination page={pg.page} pageSize={pg.pageSize} total={total} hrefFor={qs} labels={{ previous: m.common.previous, next: m.common.next, page: m.common.page, of: m.common.of }} />
      </Card>
    </>
  );
}
