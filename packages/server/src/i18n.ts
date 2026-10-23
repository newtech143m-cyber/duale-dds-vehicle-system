import "server-only";
import { cookies } from "next/headers";
import { DEFAULT_LOCALE, getMessages, isLocale, LOCALE_COOKIE, translate, type Locale, type Messages } from "@dds/i18n";

export interface I18n {
  locale: Locale;
  m: Messages;
  t: (key: string) => string;
}

export async function getI18n(): Promise<I18n> {
  const c = (await cookies()).get(LOCALE_COOKIE)?.value;
  const locale: Locale = isLocale(c) ? c : DEFAULT_LOCALE;
  const m = getMessages(locale);
  return { locale, m, t: (key) => translate(m, key) };
}
