import { am, en, so, type Messages } from "./messages";

export const LOCALES = ["so", "en", "am"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "so";
export const LOCALE_COOKIE = "dds_locale";
export const LOCALE_LABELS: Record<Locale, string> = { so: "Soomaali", en: "English", am: "አማርኛ" };

const DICTS: Record<Locale, Messages> = { so, en, am };

export function isLocale(v: unknown): v is Locale {
  return typeof v === "string" && (LOCALES as readonly string[]).includes(v);
}

export function getMessages(locale: string | undefined | null): Messages {
  return DICTS[isLocale(locale) ? locale : DEFAULT_LOCALE];
}

/** Resolve a dotted key like "status.PAID" or a validation key; falls back to English, then the key. */
export function translate(messages: Messages, key: string): string {
  const pick = (dict: unknown) =>
    key.split(".").reduce<unknown>((acc, part) => (acc && typeof acc === "object" ? (acc as Record<string, unknown>)[part] : undefined), dict);
  const v = pick(messages) ?? pick(en);
  return typeof v === "string" ? v : key;
}

const INTL_LOCALE: Record<Locale, string> = { so: "so-ET", en: "en-GB", am: "am-ET" };

export function formatDate(d: Date | string | null | undefined, locale: Locale, timeZone = "Africa/Addis_Ababa", withTime = false): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  return new Intl.DateTimeFormat(INTL_LOCALE[locale], {
    timeZone, year: "numeric", month: "short", day: "2-digit",
    ...(withTime ? { hour: "2-digit", minute: "2-digit", hour12: false } : {}),
  }).format(date);
}

export function formatNumber(n: number | string, locale: Locale): string {
  return new Intl.NumberFormat(INTL_LOCALE[locale]).format(Number(n));
}

export type { Messages };
export { en, so, am };
