import Link from "next/link";
import { prisma } from "@dds/database";
import { formatDate } from "@dds/i18n";
import { effectiveRegistrationStatus } from "@dds/domain";
import { paginationSchema } from "@dds/validation";
import { getI18n, officeTimezone, ownerDisplayName, requireStaff, searchVehicles } from "@dds/server";
import { ButtonLink, Card, EmptyState, Input, PageHeader, Pagination, Select, StatusBadge, Table, Td, Th, Button } from "@dds/ui";

export const metadata = { title: "Vehicles" };

type SP = Promise<Record<string, string | undefined>>;

export default async function VehiclesPage({ searchParams }: { searchParams: SP }) {
  const staff = await requireStaff("vehicle.read");
  const { m, locale } = await getI18n();
  const sp = await searchParams;
  const pg = paginationSchema.parse(sp);
  const status = sp.status === "ARCHIVED" || sp.status === "UNDER_REVIEW" ? sp.status : undefined;
  const [categories, { total, rows }] = await Promise.all([
    prisma.vehicleCategory.findMany({ orderBy: { name: "asc" } }),
    searchVehicles({ q: pg.q, categoryId: sp.category || undefined, status, page: pg.page, pageSize: pg.pageSize, sort: pg.sort, dir: pg.dir }),
  ]);
  const now = new Date();
  const tz = officeTimezone();
  const qs = (patch: Record<string, string | number | undefined>) => {
    const u = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...sp, ...patch })) if (v !== undefined && v !== "") u.set(k, String(v));
    return `/vehicles?${u}`;
  };
  const sortLink = (key: string, label: string) => (
    <Link href={qs({ sort: key, dir: pg.sort === key && pg.dir === "asc" ? "desc" : "asc", page: 1 })} className="hover:text-navy-900">
      {label}{pg.sort === key ? (pg.dir === "asc" ? " ↑" : " ↓") : ""}
    </Link>
  );

  return (
    <>
      <PageHeader
        title={m.nav.vehicles}
        subtitle={`${total} ${m.common.total.toLowerCase()}`}
        actions={<>
          {staff.permissions.has("report.export") && <ButtonLink variant="secondary" href={`/api/reports/registrations${pg.q ? `?q=${encodeURIComponent(pg.q)}` : ""}`}>{m.common.exportCsv}</ButtonLink>}
          {staff.permissions.has("vehicle.create") && <ButtonLink href="/vehicles/new">+ {m.vehicle.newVehicle}</ButtonLink>}
        </>}
      />
      <Card>
        <form className="flex flex-wrap gap-3 p-4 border-b border-line" role="search">
          <Input name="q" defaultValue={pg.q} placeholder={`${m.vehicle.plate}, ${m.owner.fullName}, VIN, ${m.vehicle.certificate}, ${m.tax.receiptNo}`} className="flex-1 min-w-60" />
          <Select name="category" defaultValue={sp.category ?? ""} className="w-48">
            <option value="">{m.vehicle.category}: {m.common.all}</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
          <Select name="status" defaultValue={status ?? ""} className="w-44">
            <option value="">{m.status.ACTIVE}</option>
            <option value="UNDER_REVIEW">{m.status.UNDER_REVIEW}</option>
            <option value="ARCHIVED">{m.status.ARCHIVED}</option>
          </Select>
          <Button type="submit" variant="secondary">{m.common.filter}</Button>
        </form>
        {rows.length === 0 ? (
          <EmptyState title={m.common.noResults} />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>{sortLink("plateNumber", m.vehicle.plate)}</Th>
                <Th>{sortLink("make", m.vehicle.make)}</Th>
                <Th>{m.vehicle.category}</Th>
                <Th>{m.vehicle.owner}</Th>
                <Th>{m.vehicle.registration}</Th>
                <Th>{sortLink("createdAt", m.vehicle.registeredAt)}</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((v) => {
                const reg = v.registrations[0];
                const rs = v.archivedAt ? "ARCHIVED" : effectiveRegistrationStatus(reg ? { status: reg.status, validUntil: reg.validUntil } : null, now);
                return (
                  <tr key={v.id} className="hover:bg-navy-50/40">
                    <Td>
                      <Link href={`/vehicles/${v.id}`} className="flex items-center gap-3 group">
                        <span className="h-10 w-14 rounded-md bg-navy-50 overflow-hidden shrink-0 grid place-items-center text-[10px] text-muted">
                          {v.photos[0] ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={`/api/files/${v.photos[0].fileId}`} alt="" className="h-full w-full object-cover" loading="lazy" />
                          ) : "—"}
                        </span>
                        <span className="font-semibold text-navy-800 group-hover:underline tracking-wide">{v.plateNumber}</span>
                      </Link>
                    </Td>
                    <Td>{v.make} {v.model} {v.manufactureYear ? <span className="text-muted">· {v.manufactureYear}</span> : null}</Td>
                    <Td>{v.category.name}</Td>
                    <Td className="max-w-48 truncate">{ownerDisplayName(v.currentOwner)}</Td>
                    <Td><StatusBadge status={rs} label={m.status[rs as keyof typeof m.status] ?? rs} /></Td>
                    <Td className="text-muted whitespace-nowrap">{formatDate(v.createdAt, locale, tz)}</Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
        <Pagination page={pg.page} pageSize={pg.pageSize} total={total} hrefFor={(p) => qs({ page: p })}
          labels={{ previous: m.common.previous, next: m.common.next, page: m.common.page, of: m.common.of }} />
      </Card>
    </>
  );
}
