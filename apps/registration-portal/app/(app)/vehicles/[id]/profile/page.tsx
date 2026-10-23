import { notFound } from "next/navigation";
import { prisma } from "@dds/database";
import { effectiveRegistrationStatus, formatMoney, toCents } from "@dds/domain";
import { formatDate } from "@dds/i18n";
import { audit, getI18n, officeTimezone, ownerDisplayName, requireStaff, statusOf } from "@dds/server";
import { ButtonLink, Card, DefinitionList, Emblem, StatusBadge, Table, Td, Th } from "@dds/ui";
import { PrintButton } from "@dds/ui/client";

export const metadata = { title: "Vehicle profile" };

/** Printable vehicle profile / registration summary. */
export default async function VehicleProfile({ params }: { params: Promise<{ id: string }> }) {
  const staff = await requireStaff("report.view");
  const { m, locale } = await getI18n();
  const { id } = await params;
  const tz = officeTimezone();
  const v = await prisma.vehicle.findUnique({
    where: { id },
    include: {
      category: true, office: true, currentOwner: true,
      photos: { where: { angle: "PRIMARY", removedAt: null }, take: 1 },
      registrations: { orderBy: { registeredAt: "desc" }, include: { office: true } },
      ownership: { orderBy: { startDate: "desc" }, include: { owner: true } },
      assessments: { where: { cancelledAt: null }, orderBy: { taxYear: "desc" }, include: { allocations: { include: { payment: true } } } },
    },
  }).catch(() => null);
  if (!v) notFound();
  await audit({ actorId: staff.id, action: "vehicle.profile.print", entityType: "vehicle", entityId: v.id });
  const now = new Date();
  const reg = v.registrations.find((r) => r.status !== "CANCELLED");
  const rs = effectiveRegistrationStatus(reg ? { status: reg.status, validUntil: reg.validUntil } : null, now);
  const showTax = staff.permissions.has("tax.read");

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex justify-between mb-4 no-print">
        <ButtonLink variant="ghost" href={`/vehicles/${v.id}`}>← {m.common.back}</ButtonLink>
        <PrintButton label={m.common.print} />
      </div>
      <Card className="p-8">
        <div className="flex items-center gap-3 border-b border-line pb-5 mb-6">
          <Emblem className="h-12 w-12" />
          <div><p className="font-semibold text-navy-900">{m.app.office}</p><p className="text-sm text-muted">{m.vehicle.registration} · {v.office.name}</p></div>
          <div className="ml-auto text-right"><p className="text-2xl font-semibold tracking-wide text-navy-900">{v.plateNumber}</p><StatusBadge status={rs} label={m.status[rs as keyof typeof m.status] ?? rs} /></div>
        </div>
        <div className="grid sm:grid-cols-[180px_1fr] gap-6">
          <div className="aspect-[4/3] rounded-lg bg-navy-50 overflow-hidden grid place-items-center text-xs text-muted">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {v.photos[0] ? <img src={`/api/files/${v.photos[0].fileId}`} alt="" className="h-full w-full object-cover" /> : "—"}
          </div>
          <DefinitionList items={[
            { label: m.vehicle.make, value: `${v.make} ${v.model}` }, { label: m.vehicle.year, value: v.manufactureYear },
            { label: m.vehicle.category, value: v.category.name }, { label: m.vehicle.color, value: v.color },
            { label: m.vehicle.vin, value: v.vin }, { label: m.vehicle.engine, value: v.engineNumber },
            { label: m.vehicle.certificate, value: reg?.certificateNumber }, { label: m.vehicle.validUntil, value: reg?.validUntil ? formatDate(reg.validUntil, locale, tz) : "—" },
            { label: m.vehicle.owner, value: ownerDisplayName(v.currentOwner) }, { label: m.owner.type, value: v.currentOwner.ownerType === "BUSINESS" ? m.owner.business : m.owner.individual },
          ]} />
        </div>
        <h3 className="mt-8 mb-2 font-semibold text-navy-900">{m.vehicle.ownershipHistory}</h3>
        <Table><thead><tr><Th>{m.vehicle.owner}</Th><Th>{m.vehicle.validFrom}</Th><Th>{m.vehicle.validUntil}</Th></tr></thead>
          <tbody>{v.ownership.map((o) => <tr key={o.id}><Td>{ownerDisplayName(o.owner)}</Td><Td>{formatDate(o.startDate, locale, tz)}</Td><Td>{o.endDate ? formatDate(o.endDate, locale, tz) : "—"}</Td></tr>)}</tbody></Table>
        {showTax && <>
          <h3 className="mt-8 mb-2 font-semibold text-navy-900">{m.tax.statement}</h3>
          <Table><thead><tr><Th>{m.tax.year}</Th><Th>{m.tax.amountDue}</Th><Th>{m.tax.paid}</Th><Th>{m.tax.balance}</Th><Th>{m.common.status}</Th></tr></thead>
            <tbody>{v.assessments.map((a) => { const s = statusOf(a, now); return (
              <tr key={a.id}><Td>{a.taxYear}</Td><Td>{formatMoney(toCents(s.amountDue))}</Td><Td>{formatMoney(toCents(s.amountPaid))}</Td><Td>{formatMoney(toCents(s.balance))}</Td><Td>{m.status[s.status]}</Td></tr>
            ); })}</tbody></Table>
        </>}
        <p className="mt-10 text-xs text-muted">{m.reports.generated}: {formatDate(now, locale, tz, true)} · {staff.fullName}</p>
      </Card>
    </div>
  );
}
