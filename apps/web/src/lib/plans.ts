import type { Currency } from "@/lib/format";
import type { BillingCheckoutCycle, SubscriptionPlan } from "@/lib/types";

/**
 * Prices per location per month. Keep in sync with the Stripe prices
 * (STRIPE_PRICE_{STARTER,PRO}_{USD,PLN}_*) and FREE_* / STARTER_MEMBERS_PER_LOCATION in the API.
 * About 25% below 7shifts (Entrée $34.99, The Works $76.99 per location).
 */
export const FREE_LIMITS = { locations: 1, people: 15 };
export const STARTER_PEOPLE_PER_LOCATION = 30;

export type PaidPlan = "standard" | "pro";
export type PlanKey = "free" | PaidPlan;

export const PRICE_PER_LOCATION: Record<Currency, Record<PaidPlan, Record<BillingCheckoutCycle, number>>> = {
  USD: { standard: { monthly: 26, annual: 260 }, pro: { monthly: 58, annual: 580 } },
  PLN: { standard: { monthly: 99, annual: 990 }, pro: { monthly: 219, annual: 2190 } },
};

/** What 7shifts charges for a comparable plan, per location per month (USD). */
export const SEVENSHIFTS_USD: Record<PaidPlan, number> = { standard: 34.99, pro: 76.99 };

export type PlanDefinition = {
  key: PlanKey;
  /** i18n keys: plan.<key>.title / .tagline / .f1..f4 */
  features: number;
};

export const plans: PlanDefinition[] = [
  { key: "free", features: 4 },
  { key: "standard", features: 4 },
  { key: "pro", features: 4 },
];

export function monthlyPrice(plan: PlanKey, currency: Currency): number {
  return plan === "free" ? 0 : PRICE_PER_LOCATION[currency][plan].monthly;
}

export function normalizePlan(plan: SubscriptionPlan): PlanKey {
  if (plan === "business" || plan === "enterprise") return "pro";
  return plan;
}

export function planTitleKey(plan: SubscriptionPlan): string {
  return `plan.${normalizePlan(plan)}.title`;
}
