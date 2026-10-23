import Link from "next/link";
import { notFound } from "next/navigation";
import { Pencil } from "lucide-react";
import { prisma } from "@dds/database";
import { formatDate } from "@dds/i18n";
import { getI18n, officeTimezone, ownerDisplayName, requireStaff } from "@dds/server";
import { Alert, ButtonLink, Card, CardHeader, DefinitionList, EmptyState, Input, PageHeader, StatusBadge, Table, Td, Th } from "@dds/ui";
import { ActionForm, Collapsible, FadeIn, SubmitButton } from "@dds/ui/client";
import { archiveOwnerAction, ownerPhotoAction } from "../actions";

export const metadata = { title: "Owner" };

export default async function OwnerDetail({ params }: { params: Promise<{ id: string }> }) {
  const staff = await requireStaff("owner.read");
  const { m, locale } = await getI18n();
  const { id } = await params;
  const p = staff.permissions;
  const tz = officeTimezone();
  const o = await prisma.owner.findUnique({
    where: { id },
    include: {
      currentVehicles: { include: { category: true }, orderBy: { createdAt: "desc" } },
      ownershipHistory: { where: { endDate: { not: null } }, include: { vehicle: true }, orderBy: { endDate: "desc" } },
    },
  }).catch(() => null);
  if (!o) notFound();
  const active = o.currentVehicles.filter((v) => !v.archivedAt);
  return (
    <FadeIn>
      <PageHeader
        title={ownerDisplayName(o)}
        subtitle={o.ownerType === "BUSINESS" ? `${m.owner.business} · ${o.businessRegNumber}` : m.owner.individual}
        actions={<>
          {p.has("owner.update") && !o.archivedAt && <ButtonLink variant="secondary" href={`/owners/${o.id}/edit`}><Pencil className="h-4 w-4" />{m.common.edit}</ButtonLink>}
          {p.has("vehicle.create") && !o.archivedAt && <ButtonLink href={`/vehicles/new?owner=${o.id}`}>+ {m.vehicle.newVehicle}</ButtonLink>}
        </>}
      />
      {o.archivedAt && <div className="mb-4"><Alert tone="warn">{m.status.ARCHIVED}</Alert></div>}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="p-5 content-start">
          <div className="aspect-square max-w-48 rounded-xl bg-navy-50 overflow-hidden grid place-items-center mb-4">
            {o.photoFileId ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={`/api/files/${o.photoFileId}`} alt={m.owner.photo} className="h-full w-full object-cover" />
            ) : <span className="text-4xl font-semibold text-navy-600">{ownerDisplayName(o).slice(0, 1)}</span>}
          </div>
          {p.has("file.upload") && !o.archivedAt && (
            <ActionForm action={ownerPhotoAction} className="grid gap-2 mb-5" resetOnSuccess>
              <input type="hidden" name="ownerId" value={o.id} />
              <Input type="file" name="file" accept="image/jpeg,image/png,image/webp" capture="user" required className="h-auto py-2" />
              <SubmitButton variant="secondary">{m.common.upload} · {m.owner.photo}</SubmitButton>
            </ActionForm>
          )}
          <DefinitionList items={[
            ...(o.ownerType === "BUSINESS" ? [{ label: m.owner.representative, value: o.authorizedRepName }, { label: m.owner.representativePhone, value: o.authorizedRepPhone }] : []),
            ...(o.ownerType === "INDIVIDUAL" && p.has("owner.view.national_id") ? [{ label: m.owner.nationalId, value: o.nationalIdRef }] : []),
            { label: m.owner.phone, value: o.phone }, { label: m.owner.email, value: o.email },
            { label: m.owner.address, value: o.address }, { label: m.owner.locality, value: o.locality },
          ]} />
          {o.notes && <p className="mt-4 text-sm text-muted whitespace-pre-wrap">{o.notes}</p>}
          {p.has("owner.archive") && !o.archivedAt && (
            <div className="mt-5 pt-4 border-t border-line">
              <Collapsible summary={m.common.archive}>
                <ActionForm action={archiveOwnerAction} confirmText={`${m.common.archive}?`}>
                  <input type="hidden" name="ownerId" value={o.id} />
                  <SubmitButton variant="danger">{m.common.archive}</SubmitButton>
                </ActionForm>
              </Collapsible>
            </div>
          )}
        </Card>
        <div className="lg:col-span-2 grid gap-4 content-start">
          <Card>
            <CardHeader title={`${m.owner.vehicles} (${active.length})`} />
            {active.length === 0 ? <EmptyState title={m.common.noResults} /> : (
              <Table>
                <thead><tr><Th>{m.vehicle.plate}</Th><Th>{m.vehicle.make}</Th><Th>{m.vehicle.category}</Th><Th>{m.vehicle.registeredAt}</Th></tr></thead>
                <tbody>{active.map((v) => (
                  <tr key={v.id}><Td><Link className="font-semibold text-navy-800 hover:underline" href={`/vehicles/${v.id}`}>{v.plateNumber}</Link></Td><Td>{v.make} {v.model}</Td><Td>{v.category.name}</Td><Td className="text-muted">{formatDate(v.createdAt, locale, tz)}</Td></tr>
                ))}</tbody>
              </Table>
            )}
          </Card>
          {o.ownershipHistory.length > 0 && (
            <Card>
              <CardHeader title={m.vehicle.ownershipHistory} />
              <Table>
                <thead><tr><Th>{m.vehicle.plate}</Th><Th>{m.vehicle.validFrom}</Th><Th>{m.vehicle.validUntil}</Th><Th>{m.common.status}</Th></tr></thead>
                <tbody>{o.ownershipHistory.map((h) => (
                  <tr key={h.id}><Td><Link className="hover:underline" href={`/vehicles/${h.vehicleId}`}>{h.vehicle.plateNumber}</Link></Td><Td>{formatDate(h.startDate, locale, tz)}</Td><Td>{formatDate(h.endDate, locale, tz)}</Td><Td><StatusBadge status="EXPIRED" label={m.vehicle.transfer} /></Td></tr>
                ))}</tbody>
              </Table>
            </Card>
          )}
        </div>
      </div>
    </FadeIn>
  );
}
