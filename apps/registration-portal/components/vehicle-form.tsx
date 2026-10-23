import { prisma, type Vehicle } from "@dds/database";
import { ownerDisplayName, type Staff } from "@dds/server";
import type { Messages } from "@dds/i18n";
import { ButtonLink, Card, Field, Input, Select } from "@dds/ui";
import { ActionForm, SubmitButton, type ActionResult } from "@dds/ui/client";

const USAGES = ["PRIVATE", "COMMERCIAL", "PUBLIC_TRANSPORT", "GOVERNMENT", "NGO", "DIPLOMATIC", "OTHER"] as const;
const FUELS = ["PETROL", "DIESEL", "ELECTRIC", "HYBRID", "LPG", "OTHER"] as const;
const TRANSMISSIONS = ["MANUAL", "AUTOMATIC", "OTHER"] as const;

export async function VehicleForm({
  m, staff, vehicle, action, ownerId,
}: {
  m: Messages; staff: Staff; vehicle?: Vehicle; ownerId?: string;
  action: (p: ActionResult, d: FormData) => Promise<ActionResult>;
}) {
  const [categories, offices, owners] = await Promise.all([
    prisma.vehicleCategory.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }),
    prisma.registrationOffice.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }),
    vehicle
      ? prisma.owner.findMany({ where: { id: vehicle.currentOwnerId } })
      : prisma.owner.findMany({ where: { archivedAt: null }, orderBy: { searchName: "asc" }, take: 1000 }),
  ]);
  const v = vehicle;
  const usageLabel = (u: string) => u.replace(/_/g, " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase());

  return (
    <ActionForm action={action}>
      {v && <input type="hidden" name="vehicleId" value={v.id} />}
      <div className="grid gap-6">
        <Card className="p-5">
          <h2 className="font-semibold text-navy-900 mb-4">{m.vehicle.registration}</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Field label={m.vehicle.plate} required><Input name="plateNumber" defaultValue={v?.plateNumber} required maxLength={40} placeholder="3-AA 12345" className="uppercase" /></Field>
            <Field label={m.vehicle.previousPlate}><Input name="previousPlate" defaultValue={v?.previousPlate ?? ""} maxLength={30} /></Field>
            <Field label={m.vehicle.category} required>
              <Select name="categoryId" defaultValue={v?.categoryId ?? ""} required>
                <option value="" disabled>—</option>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
            </Field>
            <Field label={m.vehicle.vin}><Input name="vin" defaultValue={v?.vin ?? ""} maxLength={40} className="uppercase" /></Field>
            <Field label={m.vehicle.engine}><Input name="engineNumber" defaultValue={v?.engineNumber ?? ""} maxLength={40} className="uppercase" /></Field>
            <Field label={m.vehicle.office} required>
              <Select name="officeId" defaultValue={v?.officeId ?? staff.officeId ?? ""} required>
                <option value="" disabled>—</option>
                {offices.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
              </Select>
            </Field>
          </div>
        </Card>

        <Card className="p-5">
          <h2 className="font-semibold text-navy-900 mb-4">{m.verify.vehicleInfo}</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Field label={m.vehicle.make} required><Input name="make" defaultValue={v?.make} required maxLength={80} /></Field>
            <Field label={m.vehicle.model} required><Input name="model" defaultValue={v?.model} required maxLength={80} /></Field>
            <Field label={m.vehicle.year}><Input name="manufactureYear" type="number" min={1900} max={2100} defaultValue={v?.manufactureYear ?? ""} /></Field>
            <Field label={m.vehicle.color}><Input name="color" defaultValue={v?.color ?? ""} maxLength={40} /></Field>
            <Field label={m.vehicle.fuel}>
              <Select name="fuelType" defaultValue={v?.fuelType ?? ""}><option value="">—</option>{FUELS.map((f) => <option key={f} value={f}>{usageLabel(f)}</option>)}</Select>
            </Field>
            <Field label={m.vehicle.transmission}>
              <Select name="transmission" defaultValue={v?.transmission ?? ""}><option value="">—</option>{TRANSMISSIONS.map((f) => <option key={f} value={f}>{usageLabel(f)}</option>)}</Select>
            </Field>
            <Field label={m.vehicle.usage} required>
              <Select name="usage" defaultValue={v?.usage ?? "PRIVATE"} required>{USAGES.map((u) => <option key={u} value={u}>{usageLabel(u)}</option>)}</Select>
            </Field>
            <Field label={m.vehicle.passengers}><Input name="passengerCapacity" type="number" min={0} max={500} defaultValue={v?.passengerCapacity ?? ""} /></Field>
            <Field label={m.vehicle.load}><Input name="loadCapacityKg" inputMode="decimal" defaultValue={v?.loadCapacityKg?.toString() ?? ""} /></Field>
          </div>
        </Card>

        <Card className="p-5">
          <h2 className="font-semibold text-navy-900 mb-4">{m.vehicle.owner}</h2>
          {v ? (
            <>
              <input type="hidden" name="currentOwnerId" value={v.currentOwnerId} />
              <p className="text-sm">{owners[0] ? ownerDisplayName(owners[0]) : "—"} <span className="text-muted">— {m.vehicle.transfer}</span></p>
            </>
          ) : (
            <div className="flex flex-wrap items-end gap-3">
              <Field label={m.vehicle.selectOwner} required className="flex-1 min-w-64">
                <Select name="currentOwnerId" defaultValue={ownerId ?? ""} required>
                  <option value="" disabled>—</option>
                  {owners.map((o) => <option key={o.id} value={o.id}>{ownerDisplayName(o)}{o.locality ? ` · ${o.locality}` : ""}{o.phone ? ` · ${o.phone}` : ""}</option>)}
                </Select>
              </Field>
              {staff.permissions.has("owner.create") && <ButtonLink variant="secondary" href="/owners/new?next=vehicle">+ {m.owner.newOwner}</ButtonLink>}
            </div>
          )}
        </Card>

        <div className="flex gap-3 justify-end">
          <ButtonLink variant="secondary" href={v ? `/vehicles/${v.id}` : "/vehicles"}>{m.common.cancel}</ButtonLink>
          <SubmitButton>{m.common.save}</SubmitButton>
        </div>
      </div>
    </ActionForm>
  );
}
