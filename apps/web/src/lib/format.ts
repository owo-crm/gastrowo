import type { Lang } from "@/lib/i18n";
import type { MeResponse } from "@/lib/types";

export type Currency = "USD" | "PLN";

const LOCALE: Record<Lang, string> = { en: "en-US" };

export function localeFor(lang: Lang): string {
  return LOCALE[lang] ?? "en-US";
}

/** The business currency from the signed-in user's workspace; US businesses use dollars. */
export function currencyOf(me?: MeResponse | null): Currency {
  return me?.organization_settings?.currency === "PLN" ? "PLN" : "USD";
}

/** Money in the business currency: "$1,234.50" or "1 234,50 zł". */
export function formatMoney(value: number | string | null | undefined, currency: Currency, lang: Lang, options: { decimals?: number } = {}): string {
  const amount = Number(value ?? 0);
  const decimals = options.decimals ?? (Number.isInteger(amount) ? 0 : 2);
  return new Intl.NumberFormat(localeFor(lang), {
    style: "currency",
    currency,
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(Number.isFinite(amount) ? amount : 0);
}

/** Hourly rate label: "$18.50/h". */
export function formatRate(value: number | string | null | undefined, currency: Currency, lang: Lang): string {
  return `${formatMoney(value, currency, lang, { decimals: 2 })}/h`;
}

export function currencySymbol(currency: Currency, lang: Lang): string {
  return (
    new Intl.NumberFormat(localeFor(lang), { style: "currency", currency }).formatToParts(0).find((part) => part.type === "currency")?.value ?? currency
  );
}

/** A calendar date (YYYY-MM-DD or Date) in the user's language: "Mon, Sep 28". */
export function formatDate(value: string | Date, lang: Lang, options: Intl.DateTimeFormatOptions = { weekday: "short", month: "short", day: "numeric" }): string {
  const date =
    typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)
      ? new Date(Number(value.slice(0, 4)), Number(value.slice(5, 7)) - 1, Number(value.slice(8, 10)))
      : new Date(value);
  return new Intl.DateTimeFormat(localeFor(lang), options).format(date);
}
