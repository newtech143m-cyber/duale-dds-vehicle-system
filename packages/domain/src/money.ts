/**
 * Exact money arithmetic using integer cents (bigint).
 * Input/Output are decimal strings like "1250.50" (as returned by Prisma Decimal.toString()).
 */
export type Cents = bigint;

export function toCents(value: string | number | { toString(): string }): Cents {
  const s = String(value).trim();
  const m = /^(-)?(\d+)(?:\.(\d{1,2})\d*)?$/.exec(s);
  if (!m) throw new Error(`Invalid money value: ${s}`);
  const [, neg, whole, frac = ""] = m;
  // Values beyond 2 decimals are rejected upstream by moneySchema; truncation here is defensive.
  const cents = BigInt(whole!) * 100n + BigInt(frac.padEnd(2, "0"));
  return neg ? -cents : cents;
}

export function fromCents(c: Cents): string {
  const neg = c < 0n;
  const abs = neg ? -c : c;
  const s = `${abs / 100n}.${(abs % 100n).toString().padStart(2, "0")}`;
  return neg ? `-${s}` : s;
}

export function sumCents(values: Iterable<Cents>): Cents {
  let t = 0n;
  for (const v of values) t += v;
  return t;
}

export function formatMoney(c: Cents, currency = "ETB", locale = "en-ET"): string {
  const [whole, frac] = fromCents(c).split(".");
  const grouped = Number(whole).toLocaleString(locale);
  return `${currency} ${grouped}.${frac}`;
}
