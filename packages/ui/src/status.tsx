import clsx from "clsx";
import { CheckCircle2, AlertTriangle, XCircle, Info, Clock, HelpCircle } from "lucide-react";

type Tone = "ok" | "warn" | "bad" | "info" | "neutral";

const TONE: Record<string, Tone> = {
  PAID: "ok", TAX_PAID: "ok", VERIFIED: "ok", ACTIVE: "ok", RESOLVED: "ok", POSTED: "ok", EXEMPT: "info",
  UNPAID: "bad", OVERDUE: "bad", TAX_UNPAID: "bad", REGISTRATION_EXPIRED: "bad", EXPIRED: "bad", CANCELLED: "neutral", REVERSED: "neutral",
  PARTIALLY_PAID: "warn", INCOMPLETE_RECORD: "warn", REVIEW_REQUIRED: "warn", UNDER_REVIEW: "warn", PENDING: "warn", OPEN: "warn", IN_PROGRESS: "info",
  NOT_ASSESSED: "neutral", RECORD_NOT_FOUND: "neutral", SUSPENDED: "bad", ARCHIVED: "neutral", REJECTED: "neutral", NONE: "neutral",
};

const STYLES: Record<Tone, string> = {
  ok: "bg-ok-50 text-ok-700 ring-ok-700/20",
  warn: "bg-warn-50 text-warn-800 ring-warn-800/20",
  bad: "bg-bad-50 text-bad-700 ring-bad-700/20",
  info: "bg-info-50 text-info-700 ring-info-700/20",
  neutral: "bg-navy-50 text-navy-700 ring-navy-700/15",
};
const ICONS = { ok: CheckCircle2, warn: AlertTriangle, bad: XCircle, info: Info, neutral: HelpCircle } as const;

/** Status label with icon + text (never colour alone). */
export function StatusBadge({ status, label, size = "sm" }: { status: string; label: string; size?: "sm" | "lg" }) {
  const tone = TONE[status] ?? "neutral";
  const Icon = status === "PENDING" ? Clock : ICONS[tone];
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1.5 rounded-full ring-1 ring-inset font-medium whitespace-nowrap",
        size === "lg" ? "px-3.5 py-1.5 text-sm" : "px-2.5 py-0.5 text-xs",
        STYLES[tone],
      )}
    >
      <Icon aria-hidden className={size === "lg" ? "h-4 w-4" : "h-3.5 w-3.5"} />
      {label}
    </span>
  );
}

export function statusTone(status: string): Tone {
  return TONE[status] ?? "neutral";
}
