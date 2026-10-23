import clsx from "clsx";
import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

export const cx = clsx;

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
const buttonStyles: Record<ButtonVariant, string> = {
  primary: "bg-navy-800 text-white hover:bg-navy-700 shadow-sm",
  secondary: "bg-white text-navy-800 border border-line hover:bg-navy-50",
  ghost: "text-navy-700 hover:bg-navy-50",
  danger: "bg-white text-bad-700 border border-bad-700/30 hover:bg-bad-50",
};
const buttonBase =
  "inline-flex items-center justify-center gap-2 rounded-lg px-4 h-10 text-sm font-medium transition-[background,transform,box-shadow] duration-150 active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none whitespace-nowrap";

export function Button({ variant = "primary", className, ...props }: ComponentProps<"button"> & { variant?: ButtonVariant }) {
  return <button className={cx(buttonBase, buttonStyles[variant], className)} {...props} />;
}

export function ButtonLink({ variant = "primary", className, ...props }: ComponentProps<typeof Link> & { variant?: ButtonVariant }) {
  return <Link className={cx(buttonBase, buttonStyles[variant], className)} {...props} />;
}

export function Card({ className, ...props }: ComponentProps<"div">) {
  return <div className={cx("print-card rounded-[var(--radius-card)] bg-white border border-line shadow-[var(--shadow-card)]", className)} {...props} />;
}

export function CardHeader({ title, action, subtitle }: { title: ReactNode; subtitle?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 px-5 pt-4 pb-3 border-b border-line">
      <div>
        <h2 className="text-[15px] font-semibold text-navy-900">{title}</h2>
        {subtitle && <p className="text-sm text-muted mt-0.5">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-navy-900">{title}</h1>
        {subtitle && <p className="text-sm text-muted mt-1">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2 no-print">{actions}</div>}
    </div>
  );
}

const inputBase =
  "w-full h-10 rounded-lg border border-line bg-white px-3 text-sm text-ink placeholder:text-muted/70 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 outline-none transition";

export function Input({ className, ...props }: ComponentProps<"input">) {
  return <input className={cx(inputBase, className)} {...props} />;
}
export function Select({ className, ...props }: ComponentProps<"select">) {
  return <select className={cx(inputBase, "pr-8", className)} {...props} />;
}
export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return <textarea className={cx(inputBase, "h-auto min-h-24 py-2", className)} {...props} />;
}

export function Field({ label, children, hint, required, className }: { label: ReactNode; children: ReactNode; hint?: ReactNode; required?: boolean; className?: string }) {
  return (
    <label className={cx("block", className)}>
      <span className="block text-[13px] font-medium text-navy-800 mb-1.5">
        {label} {required && <span className="text-bad-700" aria-hidden>*</span>}
      </span>
      {children}
      {hint && <span className="block text-xs text-muted mt-1">{hint}</span>}
    </label>
  );
}

export function Table({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cx("overflow-x-auto", className)}>
      <table className="w-full text-sm border-collapse">{children}</table>
    </div>
  );
}
export function Th({ children, className }: { children?: ReactNode; className?: string }) {
  return <th className={cx("text-left font-medium text-muted text-xs uppercase tracking-wide px-4 py-3 border-b border-line bg-navy-50/60 whitespace-nowrap", className)}>{children}</th>;
}
export function Td({ className, ...props }: ComponentProps<"td">) {
  return <td className={cx("px-4 py-3 border-b border-line align-middle", className)} {...props} />;
}

export function EmptyState({ title, children }: { title: ReactNode; children?: ReactNode }) {
  return (
    <div className="py-14 text-center">
      <div className="mx-auto mb-3 h-10 w-10 rounded-full bg-navy-50 grid place-items-center text-navy-600">∅</div>
      <p className="font-medium text-navy-900">{title}</p>
      {children && <div className="text-sm text-muted mt-1">{children}</div>}
    </div>
  );
}

export function Alert({ tone = "info", children }: { tone?: "info" | "ok" | "warn" | "bad"; children: ReactNode }) {
  const tones = {
    info: "bg-info-50 text-info-700 border-info-700/20",
    ok: "bg-ok-50 text-ok-700 border-ok-700/20",
    warn: "bg-warn-50 text-warn-800 border-warn-800/20",
    bad: "bg-bad-50 text-bad-700 border-bad-700/20",
  };
  return <div role={tone === "bad" ? "alert" : "status"} className={cx("rounded-lg border px-4 py-3 text-sm", tones[tone])}>{children}</div>;
}

export function DefinitionList({ items }: { items: { label: ReactNode; value: ReactNode }[] }) {
  return (
    <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
      {items.map((it, i) => (
        <div key={i} className="min-w-0">
          <dt className="text-xs text-muted">{it.label}</dt>
          <dd className="font-medium text-navy-900 break-words">{it.value ?? "—"}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Pagination({ page, pageSize, total, hrefFor, labels }: {
  page: number; pageSize: number; total: number; hrefFor: (p: number) => string;
  labels: { previous: string; next: string; page: string; of: string };
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3 text-sm text-muted no-print">
      <span>{labels.page} {page} {labels.of} {pages} · {total}</span>
      <div className="flex gap-2">
        {page > 1 ? <ButtonLink variant="secondary" href={hrefFor(page - 1)}>{labels.previous}</ButtonLink> : <Button variant="secondary" disabled>{labels.previous}</Button>}
        {page < pages ? <ButtonLink variant="secondary" href={hrefFor(page + 1)}>{labels.next}</ButtonLink> : <Button variant="secondary" disabled>{labels.next}</Button>}
      </div>
    </div>
  );
}
