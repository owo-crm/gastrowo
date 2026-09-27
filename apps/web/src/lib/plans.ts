import type { BillingCheckoutCycle, SubscriptionPlan } from "@/lib/types";

/** Keep in sync with the Stripe prices (STRIPE_PRICE_*) and FREE_MEMBER_LIMIT / FEATURE_MIN_PLAN in the API. */
export const FREE_MEMBER_LIMIT = 5;

export type PaidPlan = "standard" | "pro";

export const SEAT_PRICE_PLN: Record<PaidPlan, Record<BillingCheckoutCycle, number>> = {
  standard: { monthly: 8, annual: 80 },
  pro: { monthly: 12, annual: 120 },
};

export type PlanDefinition = {
  key: "free" | PaidPlan;
  title: string;
  tagline: string;
  price: string;
  cycle: string;
  highlights: string[];
};

export const plans: PlanDefinition[] = [
  {
    key: "free",
    title: "Free",
    tagline: "Dla małego lokalu",
    price: "0 zł",
    cycle: "na zawsze",
    highlights: [`do ${FREE_MEMBER_LIMIT} osób`, "ręczny grafik i dostępność", "zamiany i prośby", "zadania i kalendarz w telefonie"],
  },
  {
    key: "standard",
    title: "Standard",
    tagline: "Grafik bez pracy",
    price: `${SEAT_PRICE_PLN.standard.monthly} zł`,
    cycle: "/ osoba / mies.",
    highlights: ["wszystko z Free, bez limitu osób", "automatyczny grafik", "kontrola Kodeksu pracy", "ewidencja godzin"],
  },
  {
    key: "pro",
    title: "Pro",
    tagline: "Pełna kontrola kosztów",
    price: `${SEAT_PRICE_PLN.pro.monthly} zł`,
    cycle: "/ osoba / mies.",
    highlights: ["wszystko ze Standard", "wypłaty i eksport CSV", "przychód i % kosztu pracy", "uprawnienia managerów"],
  },
];

export function formatPln(value: number): string {
  return `${value.toLocaleString("pl-PL", { maximumFractionDigits: 2 })} zł`;
}

export function normalizePlan(plan: SubscriptionPlan): "free" | PaidPlan {
  if (plan === "business" || plan === "enterprise") return "pro";
  return plan;
}

export function planTitle(plan: SubscriptionPlan): string {
  const key = normalizePlan(plan);
  return plans.find((item) => item.key === key)?.title ?? plan;
}
