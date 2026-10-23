import { prisma } from "@dds/database";
import { getI18n, requireStaff } from "@dds/server";
import { signOutAction } from "@dds/server/auth-actions";
import { Shell, type NavItem } from "@/components/shell";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const staff = await requireStaff();
  const { m, locale } = await getI18n();
  const p = staff.permissions;

  const nav: NavItem[] = [
    { href: "/", label: m.nav.dashboard, icon: "dashboard" },
    ...(p.has("vehicle.read") ? [{ href: "/vehicles", label: m.nav.vehicles, icon: "vehicles" as const }] : []),
    ...(p.has("owner.read") ? [{ href: "/owners", label: m.nav.owners, icon: "owners" as const }] : []),
    ...(p.has("tax.read") ? [{ href: "/tax", label: m.nav.tax, icon: "tax" as const }] : []),
    ...(p.has("tax.read") ? [{ href: "/tax/rules", label: m.nav.taxRules, icon: "taxRules" as const }] : []),
    ...(p.has("review.read") ? [{ href: "/reviews", label: m.nav.reviews, icon: "reviews" as const }] : []),
    ...(p.has("report.view") ? [{ href: "/reports", label: m.nav.reports, icon: "reports" as const }] : []),
    ...(p.has("audit.read") ? [{ href: "/audit", label: m.nav.audit, icon: "audit" as const }] : []),
    ...(p.has("admin.users") ? [{ href: "/staff", label: m.nav.staff, icon: "staff" as const }] : []),
  ];
  const openReviews = p.has("review.read") ? await prisma.reviewRequest.count({ where: { status: { in: ["OPEN", "IN_PROGRESS"] } } }) : 0;

  return (
    <Shell
      nav={nav}
      locale={locale}
      openReviews={openReviews}
      user={{ name: staff.fullName, roles: staff.roleNames.join(", "), office: staff.officeName }}
      labels={{ search: `${m.nav.search}: ${m.vehicle.plate}, ${m.owner.fullName}, VIN…`, signOut: m.nav.signOut, language: m.common.language, reviews: m.nav.reviews, app: m.app.registration }}
      signOut={signOutAction}
    >
      {children}
    </Shell>
  );
}
