import Link from "next/link";
import { notFound } from "next/navigation";
import { Pencil } from "lucide-react";
import { prisma } from "@dds/database";
import { effectiveRegistrationStatus, missingEssentials, toCents, formatMoney } from "@dds/domain";
import { formatDate } from "@dds/i18n";
import { activeTaxYear, getI18n, officeTimezone, ownerDisplayName, requireStaff, statusOf } from "@dds/server";
import { Alert, ButtonLink, Card, CardHeader, DefinitionList, Field, Input, PageHeader, Select, StatusBadge, Table, Td, Textarea, Th } from "@dds/ui";
import { ActionForm, Collapsible, FadeIn, SubmitButton } from "@dds/ui/client";
import {
  addDocumentAction, addPhotoAction, addRegistrationAction, archiveVehicleAction, cancelRegistrationAction, removeFileAction, transferAction,
} from "../actions";
import { assessAction, exemptAction, recordPaymentAction, reversePaymentAction } from "../../tax/actions";

export const metadata = { title: "Vehicle" };

const ANGLES = ["PRIMARY", "FRONT", "REAR", "LEFT", "RIGHT", "OTHER"] as const;
const DOC_TYPES = ["REGISTRATION_CERTIFICATE", "INSPECTION_CERTIFICATE", "INSURANCE", "OWNERSHIP_TRANSFER", "BUSINESS_LICENSE", "OTHER"] as const;
const human = (s: string) => s.replace(/_/g, " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase());
const today = () => new Date().toISOString().slice(0, 10);

export default async function VehicleDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ created?: string }> }) {
  const staff = await requireStaff("vehicle.read");
  const { m, locale } = await getI18n();
  const { id } = await params;
  const { created } = await searchParams;
  const tz = officeTimezone();
  const p = staff.permissions;

  const v = await prisma.vehicle.findUnique({
    where: { id },
    include: {
      category: true, office: true, currentOwner: true,
      photos: { where: { removedAt: null }, orderBy: { createdAt: "desc" } },
      documents: { where: { removedAt: null }, orderBy: { createdAt: "desc" }, include: { file: true } },
      registrations: { orderBy: { registeredAt: "desc" }, include: { office: true } },
      ownership: { orderBy: { startDate: "desc" }, include: { owner: true } },
      assessments: { where: { cancelledAt: null }, orderBy: { taxYear: "desc" }, include: { taxRule: true, allocations: { include: { payment: { include: { receipt: true } } } } } },
    },
  }).catch(() => null);
  if (!v) notFound();

  const now = new Date();
  const year = await activeTaxYear(now);
  const reg = v.registrations.find((r) => r.status !== "CANCELLED") ?? null;
  const regStatus = effectiveRegistrationStatus(reg ? { status: reg.status, validUntil: reg.validUntil } : null, now);
  const primary = v.photos.find((x) => x.angle === "PRIMARY");
  const missing = missingEssentials({
    plateNumber: v.plateNumber, make: v.make, model: v.model, categoryId: v.categoryId, vin: v.vin, color: v.color,
    hasPrimaryPhoto: !!primary, owner: { displayName: ownerDisplayName(v.currentOwner), phone: v.currentOwner.phone },
    hasActiveOrExpiredRegistration: regStatus === "ACTIVE" || regStatus === "EXPIRED",
  });
  const currentAssessment = v.assessments.find((a) => a.taxYear === year);
  const payments = v.assessments.flatMap((a) => a.allocations.map((al) => ({ ...al.payment, year: a.taxYear }))).sort((a, b) => b.paidAt.getTime() - a.paidAt.getTime());
  const [offices, owners, history] = await Promise.all([
    prisma.registrationOffice.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }),
    p.has("ownership.transfer") ? prisma.owner.findMany({ where: { archivedAt: null, NOT: { id: v.currentOwnerId } }, orderBy: { searchName: "asc" }, take: 1000 }) : Promise.resolve([]),
    p.has("audit.read") ? prisma.auditLog.findMany({ where: { entityId: v.id }, orderBy: { createdAt: "desc" }, take: 15 }) : Promise.resolve([]),
  ]);
  const archived = !!v.archivedAt;
  const money = (x: { toString(): string }) => formatMoney(toCents(x.toString()));

  return (
    <FadeIn>
      <PageHeader
        title={<span className="tracking-wide">{v.plateNumber}</span>}
        subtitle={`${v.make} ${v.model}${v.manufactureYear ? ` · ${v.manufactureYear}` : ""} · ${v.category.name}`}
        actions={<>
          {p.has("vehicle.update") && !archived && <ButtonLink variant="secondary" href={`/vehicles/${v.id}/edit`}><Pencil className="h-4 w-4" />{m.common.edit}</ButtonLink>}
          {p.has("report.view") && <ButtonLink variant="secondary" href={`/vehicles/${v.id}/profile`}>{m.common.print}</ButtonLink>}
        </>}
      />
      {created && <div className="mb-4"><Alert tone="ok">{m.common.saved}</Alert></div>}
      {archived && <div className="mb-4"><Alert tone="warn">{m.status.ARCHIVED}: {v.archivedReason}</Alert></div>}
      {missing.length > 0 && !archived && <div className="mb-4"><Alert tone="warn">{m.status.INCOMPLETE_RECORD}: {missing.join(", ")}</Alert></div>}

      <div className="grid gap-4 xl:grid-cols-3">
        <div className="xl:col-span-2 grid gap-4 content-start">
          <Card>
            <div className="grid md:grid-cols-[260px_1fr]">
              <div className="bg-navy-50 aspect-[4/3] md:aspect-auto md:min-h-56 grid place-items-center overflow-hidden md:rounded-l-[var(--radius-card)]">
                {primary ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={`/api/files/${primary.fileId}`} alt={v.plateNumber} className="h-full w-full object-cover" />
                ) : <span className="text-sm text-muted">{m.vehicle.primaryPhoto}: —</span>}
              </div>
              <div className="p-5">
                <div className="flex flex-wrap gap-2 mb-4">
                  <StatusBadge status={regStatus} label={`${m.vehicle.registration}: ${m.status[regStatus as keyof typeof m.status] ?? regStatus}`} />
                  {p.has("tax.read") && (() => { const s = statusOf(currentAssessment); return <StatusBadge status={s.status} label={`${m.tax.year} ${year}: ${m.status[s.status]}`} />; })()}
                </div>
                <DefinitionList items={[
                  { label: m.vehicle.vin, value: v.vin }, { label: m.vehicle.engine, value: v.engineNumber },
                  { label: m.vehicle.color, value: v.color }, { label: m.vehicle.usage, value: human(v.usage) },
                  { label: m.vehicle.fuel, value: v.fuelType && human(v.fuelType) }, { label: m.vehicle.transmission, value: v.transmission && human(v.transmission) },
                  { label: m.vehicle.passengers, value: v.passengerCapacity }, { label: m.vehicle.load, value: v.loadCapacityKg?.toString() },
                  { label: m.vehicle.previousPlate, value: v.previousPlate }, { label: m.vehicle.office, value: v.office.name },
                ]} />
              </div>
            </div>
          </Card>

          {/* Registrations */}
          <Card>
            <CardHeader title={m.vehicle.registration} />
            <Table>
              <thead><tr><Th>{m.vehicle.certificate}</Th><Th>{m.vehicle.validFrom}</Th><Th>{m.vehicle.validUntil}</Th><Th>{m.common.status}</Th><Th /></tr></thead>
              <tbody>
                {v.registrations.map((r) => {
                  const st = effectiveRegistrationStatus({ status: r.status, validUntil: r.validUntil }, now);
                  return (
                    <tr key={r.id}>
                      <Td className="font-mono text-xs">{r.certificateNumber}</Td>
                      <Td>{formatDate(r.validFrom, locale, tz)}</Td>
                      <Td>{r.validUntil ? formatDate(r.validUntil, locale, tz) : "—"}</Td>
                      <Td><StatusBadge status={st} label={m.status[st as keyof typeof m.status] ?? st} /></Td>
                      <Td className="text-right">
                        {p.has("registration.cancel") && r.status !== "CANCELLED" && (
                          <Collapsible summary={m.common.cancel}>
                            <ActionForm action={cancelRegistrationAction} className="flex gap-2 justify-end">
                              <input type="hidden" name="vehicleId" value={v.id} /><input type="hidden" name="registrationId" value={r.id} />
                              <Input name="reason" placeholder={m.common.reason} required minLength={10} className="w-56" />
                              <SubmitButton variant="danger">{m.common.confirm}</SubmitButton>
                            </ActionForm>
                          </Collapsible>
                        )}
                      </Td>
                    </tr>
                  );
                })}
                {!v.registrations.length && <tr><Td className="text-muted">{m.common.noResults}</Td></tr>}
              </tbody>
            </Table>
            {p.has("registration.create") && !archived && (
              <div className="p-5 border-t border-line">
                <Collapsible summary={`+ ${m.vehicle.addRegistration}`} defaultOpen={!v.registrations.length}>
                  <ActionForm action={addRegistrationAction} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" resetOnSuccess>
                    <input type="hidden" name="vehicleId" value={v.id} />
                    <Field label={m.vehicle.certificate} required><Input name="certificateNumber" required maxLength={50} className="uppercase" /></Field>
                    <Field label={m.vehicle.office} required>
                      <Select name="officeId" defaultValue={staff.officeId ?? v.officeId} required>{offices.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</Select>
                    </Field>
                    <Field label={m.vehicle.registeredAt} required><Input type="date" name="registeredAt" defaultValue={today()} required /></Field>
                    <Field label={m.vehicle.validFrom} required><Input type="date" name="validFrom" defaultValue={today()} required /></Field>
                    <Field label={m.vehicle.validUntil}><Input type="date" name="validUntil" /></Field>
                    <Field label={m.common.notes}><Input name="notes" maxLength={1000} /></Field>
                    <div className="sm:col-span-2 lg:col-span-3 flex justify-end"><SubmitButton>{m.common.save}</SubmitButton></div>
                  </ActionForm>
                </Collapsible>
              </div>
            )}
          </Card>

          {/* Tax */}
          {p.has("tax.read") && (
            <Card>
              <CardHeader title={m.nav.tax} />
              <Table>
                <thead><tr><Th>{m.tax.year}</Th><Th>{m.tax.amountDue}</Th><Th>{m.tax.paid}</Th><Th>{m.tax.balance}</Th><Th>{m.tax.dueDate}</Th><Th>{m.common.status}</Th></tr></thead>
                <tbody>
                  {v.assessments.map((a) => {
                    const s = statusOf(a, now);
                    return (
                      <tr key={a.id}>
                        <Td className="font-medium">{a.taxYear}</Td>
                        <Td>{money(s.amountDue)}</Td><Td>{money(s.amountPaid)}</Td><Td className="font-medium">{money(s.balance)}</Td>
                        <Td>{formatDate(a.dueDate, locale, "UTC")}</Td>
                        <Td><StatusBadge status={s.status} label={m.status[s.status]} />{a.taxRule.source === "CONFIGURED" && <span className="block text-[11px] text-warn-800 mt-1">{m.tax.configured}</span>}</Td>
                      </tr>
                    );
                  })}
                  {!v.assessments.length && <tr><Td className="text-muted">{m.status.NOT_ASSESSED}</Td></tr>}
                </tbody>
              </Table>
              <div className="p-5 border-t border-line grid gap-5">
                {p.has("tax.assess") && !currentAssessment && !archived && (
                  <ActionForm action={assessAction} className="flex flex-wrap items-end gap-3">
                    <input type="hidden" name="vehicleId" value={v.id} />
                    <Field label={m.tax.year}><Input type="number" name="year" defaultValue={year} min={2000} max={2100} className="w-32" /></Field>
                    <SubmitButton variant="secondary">{m.tax.assess}</SubmitButton>
                  </ActionForm>
                )}
                {p.has("tax.payment.record") && currentAssessment && (() => {
                  const s = statusOf(currentAssessment, now);
                  if (!["UNPAID", "OVERDUE", "PARTIALLY_PAID"].includes(s.status)) return null;
                  return (
                    <ActionForm action={recordPaymentAction} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      <input type="hidden" name="vehicleId" value={v.id} /><input type="hidden" name="assessmentId" value={currentAssessment.id} />
                      <div className="sm:col-span-2 lg:col-span-3 font-medium text-navy-900">{m.tax.record} · {year} · {m.tax.balance}: {money(s.balance)}</div>
                      <Field label={`${m.tax.amount} (ETB)`} required hint={currentAssessment.allowPartial ? m.tax.allowPartial : undefined}>
                        <Input name="amount" inputMode="decimal" defaultValue={s.balance} required readOnly={!currentAssessment.allowPartial} />
                      </Field>
                      <Field label={m.tax.method} required>
                        <Select name="method" required>{["CASH", "BANK_TRANSFER", "MOBILE_MONEY", "CHEQUE", "OTHER"].map((x) => <option key={x} value={x}>{human(x)}</option>)}</Select>
                      </Field>
                      <Field label={m.tax.reference} required><Input name="paymentReference" required minLength={3} maxLength={80} /></Field>
                      <Field label={m.tax.externalRef}><Input name="externalRef" maxLength={120} /></Field>
                      <Field label={m.tax.paidAt} required><Input type="date" name="paidAt" defaultValue={today()} required /></Field>
                      <div className="flex items-end justify-end"><SubmitButton>{m.tax.record}</SubmitButton></div>
                    </ActionForm>
                  );
                })()}
                {p.has("tax.exempt") && currentAssessment && !currentAssessment.exemptedAt && (
                  <Collapsible summary={m.tax.exempt}>
                    <ActionForm action={exemptAction} className="grid gap-3 sm:grid-cols-3" confirmText={m.tax.exempt}>
                      <input type="hidden" name="vehicleId" value={v.id} /><input type="hidden" name="assessmentId" value={currentAssessment.id} />
                      <Field label={m.common.reason} required className="sm:col-span-2"><Input name="reason" required minLength={10} /></Field>
                      <Field label={m.tax.reference}><Input name="exemptionRef" /></Field>
                      <div className="sm:col-span-3 flex justify-end"><SubmitButton variant="danger">{m.tax.exempt}</SubmitButton></div>
                    </ActionForm>
                  </Collapsible>
                )}
              </div>
              {payments.length > 0 && (
                <Table className="border-t border-line">
                  <thead><tr><Th>{m.tax.receiptNo}</Th><Th>{m.tax.paidAt}</Th><Th>{m.tax.amount}</Th><Th>{m.tax.method}</Th><Th>{m.common.status}</Th><Th /></tr></thead>
                  <tbody>
                    {payments.map((pay) => (
                      <tr key={pay.id}>
                        <Td>{pay.receipt ? <Link className="font-mono text-xs text-teal-700 hover:underline" href={`/tax/receipts/${pay.receipt.id}`}>{pay.receipt.receiptNumber}</Link> : "—"}</Td>
                        <Td>{formatDate(pay.paidAt, locale, tz)}</Td>
                        <Td>{money(pay.amount)}</Td><Td>{human(pay.method)}</Td>
                        <Td><StatusBadge status={pay.status} label={m.status[pay.status]} /></Td>
                        <Td className="text-right">
                          {p.has("tax.payment.reverse") && pay.status === "POSTED" && (
                            <Collapsible summary={m.tax.reverse}>
                              <ActionForm action={reversePaymentAction} className="flex gap-2 justify-end" confirmText={m.tax.reverse}>
                                <input type="hidden" name="vehicleId" value={v.id} /><input type="hidden" name="paymentId" value={pay.id} />
                                <Input name="reason" placeholder={m.common.reason} required minLength={10} className="w-56" />
                                <SubmitButton variant="danger">{m.common.confirm}</SubmitButton>
                              </ActionForm>
                            </Collapsible>
                          )}
                        </Td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              )}
            </Card>
          )}

          {/* Photos & documents */}
          <Card>
            <CardHeader title={`${m.vehicle.photos} & ${m.vehicle.documents}`} />
            <div className="p-5 grid gap-5">
              {v.photos.length > 0 && (
                <ul className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                  {v.photos.map((ph) => (
                    <li key={ph.id} className="rounded-lg border border-line overflow-hidden bg-white">
                      <a href={`/api/files/${ph.fileId}`} target="_blank" rel="noreferrer">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={`/api/files/${ph.fileId}`} alt={ph.angle} className="aspect-[4/3] w-full object-cover" loading="lazy" />
                      </a>
                      <div className="flex items-center justify-between px-2 py-1.5 text-xs">
                        <span className={ph.angle === "PRIMARY" ? "font-semibold text-teal-700" : "text-muted"}>{human(ph.angle)}</span>
                        {p.has("file.remove") && (
                          <ActionForm action={removeFileAction} confirmText={`${m.common.remove}?`}>
                            <input type="hidden" name="vehicleId" value={v.id} /><input type="hidden" name="id" value={ph.id} /><input type="hidden" name="kind" value="photo" />
                            <button className="text-bad-700 hover:underline">{m.common.remove}</button>
                          </ActionForm>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              {v.documents.length > 0 && (
                <ul className="divide-y divide-line border border-line rounded-lg">
                  {v.documents.map((d) => (
                    <li key={d.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                      <a className="text-teal-700 hover:underline truncate" href={`/api/files/${d.fileId}`} target="_blank" rel="noreferrer">{human(d.docType)}{d.docNumber ? ` · ${d.docNumber}` : ""}</a>
                      {p.has("file.remove") && (
                        <ActionForm action={removeFileAction} confirmText={`${m.common.remove}?`}>
                          <input type="hidden" name="vehicleId" value={v.id} /><input type="hidden" name="id" value={d.id} /><input type="hidden" name="kind" value="document" />
                          <button className="text-xs text-bad-700 hover:underline">{m.common.remove}</button>
                        </ActionForm>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              {p.has("file.upload") && !archived && (
                <div className="grid gap-4 md:grid-cols-2">
                  <ActionForm action={addPhotoAction} className="grid gap-3 rounded-lg border border-dashed border-line p-4" resetOnSuccess>
                    <input type="hidden" name="vehicleId" value={v.id} />
                    <Field label={m.vehicle.photos}><Select name="angle" defaultValue={primary ? "FRONT" : "PRIMARY"}>{ANGLES.map((a) => <option key={a} value={a}>{human(a)}</option>)}</Select></Field>
                    <Input type="file" name="file" accept="image/jpeg,image/png,image/webp" capture="environment" required className="h-auto py-2" />
                    <SubmitButton variant="secondary">{m.common.upload}</SubmitButton>
                  </ActionForm>
                  <ActionForm action={addDocumentAction} className="grid gap-3 rounded-lg border border-dashed border-line p-4" resetOnSuccess>
                    <input type="hidden" name="vehicleId" value={v.id} />
                    <Field label={m.vehicle.documents}><Select name="docType">{DOC_TYPES.map((a) => <option key={a} value={a}>{human(a)}</option>)}</Select></Field>
                    <Input name="docNumber" placeholder="No." maxLength={80} />
                    <Input type="file" name="file" accept="application/pdf,image/jpeg,image/png" required className="h-auto py-2" />
                    <SubmitButton variant="secondary">{m.common.upload}</SubmitButton>
                  </ActionForm>
                </div>
              )}
            </div>
          </Card>
        </div>

        {/* Right column */}
        <div className="grid gap-4 content-start">
          <Card>
            <CardHeader title={m.vehicle.owner} />
            <div className="p-5">
              <Link href={`/owners/${v.currentOwner.id}`} className="font-semibold text-navy-800 hover:underline">{ownerDisplayName(v.currentOwner)}</Link>
              <p className="text-sm text-muted">{v.currentOwner.ownerType === "BUSINESS" ? m.owner.business : m.owner.individual}</p>
              <div className="mt-3"><DefinitionList items={[{ label: m.owner.phone, value: v.currentOwner.phone }, { label: m.owner.locality, value: v.currentOwner.locality }]} /></div>
              {p.has("ownership.transfer") && !archived && (
                <div className="mt-5 pt-4 border-t border-line">
                  <Collapsible summary={m.vehicle.transfer}>
                    <ActionForm action={transferAction} className="grid gap-3" confirmText={m.vehicle.transfer}>
                      <input type="hidden" name="vehicleId" value={v.id} />
                      <Field label={m.vehicle.selectOwner} required>
                        <Select name="newOwnerId" required defaultValue="">
                          <option value="" disabled>—</option>
                          {owners.map((o) => <option key={o.id} value={o.id}>{ownerDisplayName(o)}{o.locality ? ` · ${o.locality}` : ""}</option>)}
                        </Select>
                      </Field>
                      <Field label={m.common.date} required><Input type="date" name="transferDate" defaultValue={today()} required /></Field>
                      <Field label={m.common.reason} required><Input name="transferReason" required minLength={3} /></Field>
                      <Field label={m.tax.reference}><Input name="transferRef" /></Field>
                      <SubmitButton>{m.vehicle.transfer}</SubmitButton>
                    </ActionForm>
                  </Collapsible>
                </div>
              )}
            </div>
          </Card>

          <Card>
            <CardHeader title={m.vehicle.ownershipHistory} />
            <ol className="p-5 space-y-4">
              {v.ownership.map((o) => (
                <li key={o.id} className="relative pl-5 border-l-2 border-line">
                  <span className={`absolute -left-[7px] top-1 h-3 w-3 rounded-full ${o.endDate ? "bg-navy-100" : "bg-teal-500"}`} />
                  <p className="font-medium text-sm text-navy-900">{ownerDisplayName(o.owner)}</p>
                  <p className="text-xs text-muted">{formatDate(o.startDate, locale, tz)} → {o.endDate ? formatDate(o.endDate, locale, tz) : m.status.ACTIVE}</p>
                  {o.transferReason && <p className="text-xs text-muted mt-0.5">{o.transferReason}{o.transferRef ? ` · ${o.transferRef}` : ""}</p>}
                </li>
              ))}
            </ol>
          </Card>

          {p.has("vehicle.archive") && !archived && (
            <Card className="p-5">
              <Collapsible summary={m.common.archive}>
                <ActionForm action={archiveVehicleAction} className="grid gap-3" confirmText={`${m.common.archive}?`}>
                  <input type="hidden" name="vehicleId" value={v.id} />
                  <Field label={m.vehicle.archiveReason} required><Textarea name="reason" required minLength={10} /></Field>
                  <SubmitButton variant="danger">{m.common.archive}</SubmitButton>
                </ActionForm>
              </Collapsible>
            </Card>
          )}

          {history.length > 0 && (
            <Card>
              <CardHeader title={m.common.history} />
              <ul className="p-5 space-y-2 text-xs">
                {history.map((h) => (
                  <li key={h.id.toString()} className="flex justify-between gap-3"><span className="font-mono text-navy-800">{h.action}</span><span className="text-muted whitespace-nowrap">{formatDate(h.createdAt, locale, tz, true)}</span></li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      </div>
    </FadeIn>
  );
}
