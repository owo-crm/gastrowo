import type { BillingCheckoutCycle, SubscriptionPlan } from "@/lib/types";

/** Keep in sync with the Stripe prices (STRIPE_PRICE_PRO_MONTHLY / _ANNUAL) and FREE_MEMBER_LIMIT in the API. */
export const FREE_MEMBER_LIMIT = 5;
export const PRO_SEAT_PRICE_PLN: Record<BillingCheckoutCycle, number> = { monthly: 9, annual: 90 };

export type PlanDefinition = {
  key: SubscriptionPlan;
  title: string;
  price: string;
  cycle: string;
  highlights: string[];
};

export const plans: PlanDefinition[] = [
  {
    key: "free",
    title: "Free",
    price: "0 zł",
    cycle: "na zawsze",
    highlights: [`do ${FREE_MEMBER_LIMIT} osób w zespole`, "lokale bez limitu", "wszystkie funkcje"],
  },
  {
    key: "pro",
    title: "Pro",
    price: `${PRO_SEAT_PRICE_PLN.monthly} zł`,
    cycle: "/ osoba / mies.",
    highlights: ["zespół bez limitu", "lokale bez limitu", "wszystkie funkcje", "rocznie 2 miesiące gratis"],
  },
];

export function formatPln(value: number): string {
  return `${value.toLocaleString("pl-PL", { maximumFractionDigits: 2 })} zł`;
}

export function planTitle(plan: SubscriptionPlan): string {
  if (plan === "business" || plan === "enterprise") return "Pro";
  return plans.find((item) => item.key === plan)?.title ?? plan;
}
