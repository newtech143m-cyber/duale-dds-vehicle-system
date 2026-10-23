import Link from "next/link";
import { AlertTriangle, CalendarX2, Car, CheckCircle2, ClipboardList, FileWarning, Landmark, Wallet } from "lucide-react";
import { formatDate } from "@dds/i18n";
import { dashboardStats, getI18n, officeTimezone, ownerDisplayName, requireStaff } from "@dds/server";
import { Card, CardHeader, PageHeader, StatusBadge, Table, Td, Th } from "@dds/ui";
import { AnimatedNumber, Stagger, StaggerItem } from "@dds/ui/client";
import { CategoryBars, CollectionLine, MonthlyBars, StatusDonut } from "@/components/charts";

export const dynamic = "force-dynamic";

export default async function Dashboard() {
  const staff = await requireStaff();
  const { m, locale } = await getI18n();
  const s = await dashboardStats();
  const tz = officeTimezone();
  const canFinance = staff.permissions.has("tax.read");

  const tiles = [
    { label: m.dashboard.totalVehicles, value: s.vehicles, icon: Car, href: "/vehicles" },
    { label: m.dashboard.activeRegistrations, value: s.activeRegistrations, icon: CheckCircle2, href: "/reports?kind=registrations" },
    { label: m.dashboard.incomplete, value: s.incomplete, icon: FileWarning, href: "/reports?kind=incomplete", tone: "warn" },
    { label: m.dashboard.expired, value: s.expiredRegistrations, icon: CalendarX2, href: "/reports?kind=expired", tone: "bad" },
    ...(canFinance ? [
      { label: `${m.dashboard.unpaid} · ${s.year}`, value: s.unpaid, icon: AlertTriangle, href: "/reports?kind=unpaid", tone: "bad" },
      { label: `${m.dashboard.paidThisYear} · ${s.year}`, value: s.paidThisYear, icon: Wallet, href: "/tax" },
      { label: `${m.dashboard.revenue} (ETB)`, value: Number(s.revenueTotal), icon: Landmark, href: "/reports?kind=payments", money: true },
    ] : []),
    { label: m.dashboard.pendingReviews, value: s.reviews, icon: ClipboardList, href: "/reviews", tone: s.reviews ? "warn" : undefined },
  ];

  return (
    <>
      <PageHeader title={m.dashboard.title} subtitle={`${staff.fullName} · ${staff.officeName ?? ""}`} />

      <Stagger className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
        {tiles.map((tile) => (
          <StaggerItem key={tile.label}>
            <Link href={tile.href} className="block group">
              <Card className="p-5 h-full transition-shadow group-hover:shadow-md">
                <div className="flex items-start justify-between gap-3">
                  <p className="text-sm text-muted leading-snug">{tile.label}</p>
                  <span className={`h-9 w-9 shrink-0 rounded-lg grid place-items-center ${tile.tone === "bad" ? "bg-bad-50 text-bad-700" : tile.tone === "warn" ? "bg-warn-50 text-warn-800" : "bg-teal-50 text-teal-700"}`}>
                    <tile.icon className="h-[18px] w-[18px]" aria-hidden />
                  </span>
                </div>
                <p className="mt-3 text-[28px] font-semibold tracking-tight text-navy-900">
                  <AnimatedNumber value={tile.value} format={"money" in tile && tile.money ? "money" : "int"} />
                </p>
              </Card>
            </Link>
          </StaggerItem>
        ))}
      </Stagger>

      <div className="grid gap-4 lg:grid-cols-2 mb-6">
        <Card><CardHeader title={m.dashboard.monthlyRegistrations} /><div className="p-4"><MonthlyBars data={s.monthly} label={m.dashboard.monthlyRegistrations} /></div></Card>
        {canFinance && <Card><CardHeader title={m.dashboard.collection} subtitle="ETB" /><div className="p-4"><CollectionLine data={s.collection} label={m.dashboard.collection} /></div></Card>}
        {canFinance && (
          <Card>
            <CardHeader title={`${m.dashboard.taxStatus} · ${s.year}`} />
            <div className="p-5">
              <StatusDonut data={["PAID", "EXEMPT", "PARTIALLY_PAID", "UNPAID", "OVERDUE", "UNDER_REVIEW", "NOT_ASSESSED"].map((k) => ({ key: k, label: m.status[k as keyof typeof m.status], value: s.taxByStatus[k] ?? 0 }))} />
            </div>
          </Card>
        )}
        <Card><CardHeader title={m.dashboard.categories} /><div className="p-4"><CategoryBars data={s.categories} /></div></Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title={m.dashboard.recentVehicles} action={<Link href="/vehicles" className="text-sm text-teal-700 hover:underline">{m.common.view}</Link>} />
          <Table>
            <thead><tr><Th>{m.vehicle.plate}</Th><Th>{m.vehicle.make}</Th><Th>{m.vehicle.owner}</Th><Th>{m.common.date}</Th></tr></thead>
            <tbody>
              {s.recentVehicles.map((v) => (
                <tr key={v.id} className="hover:bg-navy-50/40">
                  <Td><Link className="font-medium text-navy-800 hover:underline" href={`/vehicles/${v.id}`}>{v.plateNumber}</Link></Td>
                  <Td>{v.make} {v.model}</Td>
                  <Td className="max-w-40 truncate">{ownerDisplayName(v.currentOwner)}</Td>
                  <Td className="text-muted whitespace-nowrap">{formatDate(v.createdAt, locale, tz)}</Td>
                </tr>
              ))}
              {!s.recentVehicles.length && <tr><Td className="text-muted text-center py-8">{m.common.noResults}</Td></tr>}
            </tbody>
          </Table>
        </Card>
        <Card>
          <CardHeader title={m.dashboard.recentVerifications} />
          <Table>
            <thead><tr><Th>{m.verify.reference}</Th><Th>{m.vehicle.plate}</Th><Th>{m.common.status}</Th><Th>{m.verify.time}</Th></tr></thead>
            <tbody>
              {s.recentVerifications.map((e) => (
                <tr key={e.id}>
                  <Td className="font-mono text-xs">{e.reference}</Td>
                  <Td>{e.plateNormalized}</Td>
                  <Td><div className="flex flex-wrap gap-1">{e.statuses.map((st) => <StatusBadge key={st} status={st} label={m.status[st as keyof typeof m.status] ?? st} />)}</div></Td>
                  <Td className="text-muted whitespace-nowrap">{formatDate(e.createdAt, locale, tz, true)}</Td>
                </tr>
              ))}
              {!s.recentVerifications.length && <tr><Td className="text-muted text-center py-8">{m.common.noResults}</Td></tr>}
            </tbody>
          </Table>
        </Card>
      </div>
    </>
  );
}
