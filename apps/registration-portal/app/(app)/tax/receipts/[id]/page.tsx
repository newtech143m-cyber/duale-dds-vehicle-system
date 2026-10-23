import { notFound } from "next/navigation";
import { prisma } from "@dds/database";
import { formatMoney, toCents } from "@dds/domain";
import { formatDate } from "@dds/i18n";
import { audit, getI18n, officeTimezone, ownerDisplayName, requireStaff } from "@dds/server";
import { Alert, ButtonLink, Card, Emblem } from "@dds/ui";
import { PrintButton } from "@dds/ui/client";

export const metadata = { title: "Receipt" };

export default async function ReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  const staff = await requireStaff("tax.read");
  const { m, locale } = await getI18n();
  const { id } = await params;
  const tz = officeTimezone();
  const r = await prisma.taxReceipt.findUnique({
    where: { id },
    include: { payment: { include: { office: true, vehicle: { include: { currentOwner: true, category: true } }, allocations: { include: { assessment: { include: { taxRule: true } } } } } } },
  }).catch(() => null);
  if (!r) notFound();
  const [collector, issuer] = await Promise.all([
    prisma.user.findUnique({ where: { id: r.payment.collectedById }, select: { fullName: true } }),
    prisma.user.findUnique({ where: { id: r.issuedById }, select: { fullName: true } }),
  ]);
  await audit({ actorId: staff.id, action: "receipt.view", entityType: "tax_receipt", entityId: r.id });
  const p = r.payment;
  const a = p.allocations[0]?.assessment;
  const human = (s: string) => s.replace(/_/g, " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase());

  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex justify-between mb-4 no-print">
        <ButtonLink variant="ghost" href={`/vehicles/${p.vehicleId}`}>← {m.common.back}</ButtonLink>
        <PrintButton label={m.common.print} />
      </div>
      {(r.voidedAt || p.status === "REVERSED") && <div className="mb-4"><Alert tone="bad">{m.status.REVERSED}: {r.voidReason ?? p.reversalReason}</Alert></div>}
      <Card className="p-8 relative overflow-hidden">
        {r.voidedAt && <div className="absolute inset-0 grid place-items-center pointer-events-none"><span className="text-7xl font-black text-bad-700/15 -rotate-12">VOID</span></div>}
        <div className="flex items-center gap-3 border-b border-line pb-5 mb-6">
          <Emblem className="h-12 w-12" />
          <div>
            <p className="font-semibold text-navy-900">{m.app.office}</p>
            <p className="text-sm text-muted">{p.office.name}</p>
          </div>
          <div className="ml-auto text-right">
            <p className="text-xs uppercase tracking-wide text-muted">{m.tax.receipt}</p>
            <p className="font-mono font-semibold text-navy-900">{r.receiptNumber}</p>
          </div>
        </div>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
          <div><dt className="text-muted text-xs">{m.vehicle.plate}</dt><dd className="font-semibold">{p.vehicle.plateNumber}</dd></div>
          <div><dt className="text-muted text-xs">{m.vehicle.owner}</dt><dd className="font-medium">{ownerDisplayName(p.vehicle.currentOwner)}</dd></div>
          <div><dt className="text-muted text-xs">{m.vehicle.make}</dt><dd>{p.vehicle.make} {p.vehicle.model} · {p.vehicle.category.name}</dd></div>
          <div><dt className="text-muted text-xs">{m.tax.year}</dt><dd>{a?.taxYear ?? "—"}</dd></div>
          <div><dt className="text-muted text-xs">{m.tax.paidAt}</dt><dd>{formatDate(p.paidAt, locale, tz)}</dd></div>
          <div><dt className="text-muted text-xs">{m.tax.method}</dt><dd>{human(p.method)}{p.externalRef ? ` · ${p.externalRef}` : ""}</dd></div>
          <div><dt className="text-muted text-xs">{m.tax.reference}</dt><dd className="font-mono text-xs">{p.paymentReference}</dd></div>
          <div><dt className="text-muted text-xs">{m.tax.collectedBy}</dt><dd>{collector?.fullName ?? "—"}</dd></div>
        </dl>
        <div className="mt-8 rounded-xl bg-navy-50 p-5 flex items-center justify-between">
          <span className="text-sm text-navy-800">{m.tax.amount}</span>
          <span className="text-3xl font-semibold text-navy-900 tabular-nums">{formatMoney(toCents(p.amount.toString()))}</span>
        </div>
        {a?.taxRule.source === "CONFIGURED" && <p className="mt-4 text-xs text-warn-800">{m.tax.configuredWarning}</p>}
        <div className="mt-10 grid grid-cols-2 gap-8 text-xs text-muted">
          <div><div className="border-t border-ink/40 pt-1">{issuer?.fullName ?? ""}</div></div>
          <div className="text-right">{m.reports.generated}: {formatDate(r.issuedAt, locale, tz, true)}</div>
        </div>
      </Card>
    </div>
  );
}
