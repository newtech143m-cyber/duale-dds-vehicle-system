import Link from "next/link";
import { prisma, type Prisma } from "@dds/database";
import { normalizeName } from "@dds/validation";
import { paginationSchema } from "@dds/validation";
import { getI18n, ownerDisplayName, requireStaff } from "@dds/server";
import { Button, ButtonLink, Card, EmptyState, Input, PageHeader, Pagination, Select, Table, Td, Th } from "@dds/ui";

export const metadata = { title: "Owners" };

export default async function OwnersPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const staff = await requireStaff("owner.read");
  const { m } = await getI18n();
  const sp = await searchParams;
  const pg = paginationSchema.parse(sp);
  const type = sp.type === "INDIVIDUAL" || sp.type === "BUSINESS" ? sp.type : undefined;
  const q = pg.q?.trim();
  const where: Prisma.OwnerWhereInput = {
    archivedAt: sp.archived === "1" ? { not: null } : null,
    ...(type ? { ownerType: type } : {}),
    ...(q ? { OR: [
      { searchName: { contains: normalizeName(q) } },
      { phone: { contains: q } },
      { businessRegNumber: { contains: q.toUpperCase() } },
      ...(staff.permissions.has("owner.view.national_id") ? [{ nationalIdRef: { contains: q } }] : []),
    ] } : {}),
  };
  const [total, rows] = await Promise.all([
    prisma.owner.count({ where }),
    prisma.owner.findMany({
      where, orderBy: { searchName: pg.dir === "asc" ? "asc" : "desc" }, skip: (pg.page - 1) * pg.pageSize, take: pg.pageSize,
      include: { _count: { select: { currentVehicles: { where: { archivedAt: null } } } } },
    }),
  ]);
  const qs = (patch: Record<string, string | number | undefined>) => {
    const u = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...sp, ...patch })) if (v !== undefined && v !== "") u.set(k, String(v));
    return `/owners?${u}`;
  };
  return (
    <>
      <PageHeader title={m.nav.owners} subtitle={`${total} ${m.common.total.toLowerCase()}`}
        actions={staff.permissions.has("owner.create") && <ButtonLink href="/owners/new">+ {m.owner.newOwner}</ButtonLink>} />
      <Card>
        <form className="flex flex-wrap gap-3 p-4 border-b border-line" role="search">
          <Input name="q" defaultValue={q} placeholder={`${m.owner.fullName}, ${m.owner.phone}, ${m.owner.businessReg}`} className="flex-1 min-w-60" />
          <Select name="type" defaultValue={type ?? ""} className="w-44">
            <option value="">{m.owner.type}: {m.common.all}</option>
            <option value="INDIVIDUAL">{m.owner.individual}</option><option value="BUSINESS">{m.owner.business}</option>
          </Select>
          <Select name="archived" defaultValue={sp.archived ?? ""} className="w-40">
            <option value="">{m.status.ACTIVE}</option><option value="1">{m.status.ARCHIVED}</option>
          </Select>
          <Button type="submit" variant="secondary">{m.common.filter}</Button>
        </form>
        {rows.length === 0 ? <EmptyState title={m.common.noResults} /> : (
          <Table>
            <thead><tr><Th><Link href={qs({ dir: pg.dir === "asc" ? "desc" : "asc" })}>{m.owner.fullName} {pg.dir === "asc" ? "↑" : "↓"}</Link></Th><Th>{m.owner.type}</Th><Th>{m.owner.phone}</Th><Th>{m.owner.locality}</Th><Th>{m.owner.vehicles}</Th></tr></thead>
            <tbody>
              {rows.map((o) => (
                <tr key={o.id} className="hover:bg-navy-50/40">
                  <Td><Link className="font-medium text-navy-800 hover:underline" href={`/owners/${o.id}`}>{ownerDisplayName(o)}</Link>{o.ownerType === "BUSINESS" && <span className="block text-xs text-muted">{o.businessRegNumber}</span>}</Td>
                  <Td>{o.ownerType === "BUSINESS" ? m.owner.business : m.owner.individual}</Td>
                  <Td>{o.phone ?? "—"}</Td><Td>{o.locality ?? "—"}</Td>
                  <Td className="tabular-nums">{o._count.currentVehicles}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
        <Pagination page={pg.page} pageSize={pg.pageSize} total={total} hrefFor={(p) => qs({ page: p })}
          labels={{ previous: m.common.previous, next: m.common.next, page: m.common.page, of: m.common.of }} />
      </Card>
    </>
  );
}
