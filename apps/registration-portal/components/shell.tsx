"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  Bell, Car, ChevronsLeft, ChevronsRight, ClipboardCheck, FileBarChart, LayoutDashboard, LogOut, Menu, Receipt,
  Scale, ScrollText, Search, ShieldCheck, Users, UserSquare2, X,
} from "lucide-react";
import { Emblem, cx } from "@dds/ui";
import { LanguageSwitcher } from "@dds/ui/client";
import type { Locale } from "@dds/i18n";

const ICONS = {
  dashboard: LayoutDashboard, vehicles: Car, owners: UserSquare2, tax: Receipt, taxRules: Scale, reviews: ClipboardCheck,
  audit: ScrollText, reports: FileBarChart, staff: Users,
} as const;

export interface NavItem { href: string; label: string; icon: keyof typeof ICONS }

export function Shell({
  nav, children, user, labels, locale, openReviews, signOut,
}: {
  nav: NavItem[]; children: ReactNode; locale: Locale; openReviews: number;
  user: { name: string; roles: string; office: string | null };
  labels: { search: string; signOut: string; language: string; reviews: string; app: string };
  signOut: () => Promise<void>;
}) {
  const pathname = usePathname();
  const reduce = useReducedMotion();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    try { setCollapsed(localStorage.getItem("dds:sidebar") === "1"); } catch {}
  }, []);
  useEffect(() => { setMobileOpen(false); setMenuOpen(false); }, [pathname]);
  const toggle = () => setCollapsed((c) => { try { localStorage.setItem("dds:sidebar", c ? "0" : "1"); } catch {} return !c; });

  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

  const NavLinks = ({ compact }: { compact: boolean }) => (
    <nav className="flex flex-col gap-1" aria-label="Main">
      {nav.map((item) => {
        const Icon = ICONS[item.icon];
        const active = isActive(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            title={compact ? item.label : undefined}
            aria-current={active ? "page" : undefined}
            className={cx(
              "group relative flex items-center gap-3 rounded-lg px-3 h-10 text-sm transition-colors",
              active ? "bg-white/10 text-white" : "text-navy-100/75 hover:bg-white/5 hover:text-white",
            )}
          >
            {active && <motion.span layoutId={reduce ? undefined : "nav-active"} className="absolute left-0 top-2 bottom-2 w-1 rounded-r bg-teal-500" />}
            <Icon className="h-[18px] w-[18px] shrink-0" aria-hidden />
            {!compact && <span className="truncate">{item.label}</span>}
          </Link>
        );
      })}
    </nav>
  );

  return (
    <div className="min-h-dvh lg:flex">
      {/* Desktop sidebar */}
      <motion.aside
        animate={{ width: collapsed ? 76 : 256 }}
        transition={{ duration: reduce ? 0 : 0.2, ease: "easeOut" }}
        className="hidden lg:flex no-print sticky top-0 h-dvh shrink-0 flex-col bg-navy-900 px-3 py-4"
      >
        <div className="flex items-center gap-3 px-2 mb-6 h-10">
          <Emblem />
          {!collapsed && <div className="leading-tight"><p className="text-white font-semibold text-sm">DDS</p><p className="text-navy-100/60 text-xs">{labels.app}</p></div>}
        </div>
        <div className="flex-1 overflow-y-auto"><NavLinks compact={collapsed} /></div>
        <button onClick={toggle} className="mt-3 flex items-center gap-2 rounded-lg px-3 h-9 text-xs text-navy-100/70 hover:bg-white/5 hover:text-white" aria-label="Toggle sidebar">
          {collapsed ? <ChevronsRight className="h-4 w-4" /> : <><ChevronsLeft className="h-4 w-4" /> <span>Collapse</span></>}
        </button>
      </motion.aside>

      {/* Mobile drawer */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div className="fixed inset-0 z-40 lg:hidden" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="absolute inset-0 bg-navy-950/50" onClick={() => setMobileOpen(false)} />
            <motion.aside
              initial={{ x: -280 }} animate={{ x: 0 }} exit={{ x: -280 }} transition={{ duration: 0.2 }}
              className="absolute inset-y-0 left-0 w-72 bg-navy-900 p-4 flex flex-col"
            >
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3"><Emblem /><span className="text-white font-semibold">DDS</span></div>
                <button onClick={() => setMobileOpen(false)} className="text-white p-2" aria-label="Close menu"><X className="h-5 w-5" /></button>
              </div>
              <NavLinks compact={false} />
            </motion.aside>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex-1 min-w-0 flex flex-col">
        <header className="no-print sticky top-0 z-30 bg-white/90 backdrop-blur border-b border-line">
          <div className="flex items-center gap-3 px-4 sm:px-6 h-16">
            <button className="lg:hidden p-2 -ml-2 text-navy-800" onClick={() => setMobileOpen(true)} aria-label="Open menu"><Menu className="h-5 w-5" /></button>
            <form action="/vehicles" className="flex-1 max-w-xl relative" role="search">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted" aria-hidden />
              <input name="q" placeholder={labels.search} aria-label={labels.search}
                className="w-full h-10 rounded-lg bg-surface border border-transparent focus:border-teal-500 focus:bg-white pl-9 pr-3 text-sm outline-none transition" />
            </form>
            <div className="hidden sm:block"><LanguageSwitcher current={locale} label={labels.language} /></div>
            <Link href="/reviews" className="relative p-2 rounded-lg hover:bg-navy-50 text-navy-800" aria-label={`${labels.reviews}: ${openReviews}`}>
              <Bell className="h-5 w-5" />
              {openReviews > 0 && <span className="absolute -top-0.5 -right-0.5 min-w-5 h-5 px-1 rounded-full bg-bad-700 text-white text-[11px] font-semibold grid place-items-center">{openReviews > 99 ? "99+" : openReviews}</span>}
            </Link>
            <div className="relative">
              <button onClick={() => setMenuOpen((o) => !o)} aria-expanded={menuOpen} aria-haspopup="menu"
                className="flex items-center gap-2 rounded-lg pl-1 pr-2 h-10 hover:bg-navy-50">
                <span className="h-8 w-8 rounded-full bg-navy-800 text-white grid place-items-center text-sm font-semibold">{user.name.slice(0, 1).toUpperCase()}</span>
                <span className="hidden md:block text-left leading-tight">
                  <span className="block text-sm font-medium text-navy-900 max-w-40 truncate">{user.name}</span>
                  <span className="block text-xs text-muted max-w-40 truncate">{user.roles}</span>
                </span>
              </button>
              <AnimatePresence>
                {menuOpen && (
                  <motion.div role="menu" initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.12 }}
                    className="absolute right-0 mt-2 w-64 rounded-xl border border-line bg-white shadow-lg p-2">
                    <div className="px-3 py-2 border-b border-line mb-1">
                      <p className="text-sm font-medium text-navy-900">{user.name}</p>
                      <p className="text-xs text-muted">{user.roles}</p>
                      {user.office && <p className="text-xs text-muted mt-0.5 flex items-center gap-1"><ShieldCheck className="h-3 w-3" />{user.office}</p>}
                    </div>
                    <div className="sm:hidden px-3 py-2"><LanguageSwitcher current={locale} label={labels.language} /></div>
                    <form action={signOut}>
                      <button role="menuitem" className="w-full flex items-center gap-2 px-3 h-9 rounded-lg text-sm text-bad-700 hover:bg-bad-50"><LogOut className="h-4 w-4" />{labels.signOut}</button>
                    </form>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </header>
        <main className="flex-1 px-4 sm:px-6 lg:px-8 py-6 lg:py-8 max-w-[1400px] w-full mx-auto">{children}</main>
      </div>
    </div>
  );
}
