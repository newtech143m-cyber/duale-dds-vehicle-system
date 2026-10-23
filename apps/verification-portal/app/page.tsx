import { LogOut } from "lucide-react";
import { prisma } from "@dds/database";
import { formatDate } from "@dds/i18n";
import { getI18n, getSetting, officeTimezone, requireStaff } from "@dds/server";
import { signOutAction } from "@dds/server/auth-actions";
import { Card, Emblem, StatusBadge } from "@dds/ui";
import { LanguageSwitcher } from "@dds/ui/client";
import { VerifyClient } from "@/components/verify-client";

export const dynamic = "force-dynamic";

export default async function VerifyHome() {
  const staff = await requireStaff("verify.search");
  const { m, locale } = await getI18n();
  const requireReason = await getSetting<boolean>("verify.requireReason", false);
  // Officer's own recent searches only (never other officers' history).
  const recent = await prisma.verificationEvent.findMany({ where: { officerId: staff.id }, orderBy: { createdAt: "desc" }, take: 5 });
  const tz = officeTimezone();

  return (
    <div className="min-h-dvh flex flex-col">
      <header className="no-print bg-navy-900 text-white">
        <div className="max-w-5xl mx-auto px-4 h-16 flex items-center gap-3">
          <Emblem />
          <div className="leading-tight">
            <p className="font-semibold text-sm">{m.app.verification}</p>
            <p className="text-xs text-navy-100/70">DDS</p>
          </div>
          <div className="ml-auto flex items-center gap-3">
            <div className="hidden sm:block [&_select]:bg-navy-800 [&_select]:text-white [&_select]:border-white/20 [&_label]:text-white"><LanguageSwitcher current={locale} label={m.common.language} /></div>
            <span className="hidden md:block text-sm text-navy-100/80 max-w-48 truncate">{staff.fullName}</span>
            <form action={signOutAction}><button className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg text-sm hover:bg-white/10" aria-label={m.nav.signOut}><LogOut className="h-4 w-4" /><span className="hidden sm:inline">{m.nav.signOut}</span></button></form>
          </div>
        </div>
      </header>
      <main className="flex-1 w-full max-w-5xl mx-auto px-4 py-6 sm:py-10">
        <div className="sm:hidden mb-4 no-print"><LanguageSwitcher current={locale} label={m.common.language} /></div>
        <VerifyClient m={m} locale={locale} requireReason={requireReason} />
        {recent.length > 0 && (
          <Card className="mt-10 no-print">
            <ul className="divide-y divide-line">
              {recent.map((e) => (
                <li key={e.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
                  <span className="font-semibold text-navy-900 tracking-wide w-32">{e.plateNormalized}</span>
                  <span className="flex flex-wrap gap-1">{e.statuses.map((s) => <StatusBadge key={s} status={s} label={m.status[s as keyof typeof m.status] ?? s} />)}</span>
                  <span className="ml-auto text-xs text-muted font-mono">{e.reference} · {formatDate(e.createdAt, locale, tz, true)}</span>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </main>
    </div>
  );
}
