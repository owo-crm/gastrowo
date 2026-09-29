import type { Currency } from "@/lib/format";
import type { BillingCheckoutCycle, SubscriptionPlan } from "@/lib/types";

/**
 * Flat plan prices. Keep in sync with the Stripe prices (STRIPE_PRICE_{STARTER,PRO}_{USD,PLN}_*,
 * STRIPE_PRICE_PRO_EXTRA_LOCATION_*) and the limits in the API (services/billing.py).
 * Starter covers one location, Pro three; each further Pro location is an add-on.
 * For one location that is about 25% below 7shifts (Entrée $34.99, The Works $76.99 per location).
 */
export const FREE_LIMITS = { locations: 1, people: 15 };
export const STARTER_LIMITS = { locations: 1, people: 30 };
export const PRO_INCLUDED_LOCATIONS = 3;

export type PaidPlan = "standard" | "pro";
export type PlanKey = "free" | PaidPlan;

export const PLAN_PRICE: Record<Currency, Record<PaidPlan, Record<BillingCheckoutCycle, number>>> = {
  USD: { standard: { monthly: 26, annual: 260 }, pro: { monthly: 58, annual: 580 } },
  PLN: { standard: { monthly: 99, annual: 990 }, pro: { monthly: 219, annual: 2190 } },
};

/** Pro add-on for each location beyond the included three. */
export const PRO_EXTRA_LOCATION_PRICE: Record<Currency, Record<BillingCheckoutCycle, number>> = {
  USD: { monthly: 15, annual: 150 },
  PLN: { monthly: 59, annual: 590 },
};

/** What a plan costs for a number of locations (Starter only ever has one). */
export function planTotal(plan: PaidPlan, locations: number, currency: Currency, cycle: BillingCheckoutCycle): number {
  const extra = plan === "pro" ? Math.max(locations - PRO_INCLUDED_LOCATIONS, 0) : 0;
  return PLAN_PRICE[currency][plan][cycle] + extra * PRO_EXTRA_LOCATION_PRICE[currency][cycle];
}

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
  return plan === "free" ? 0 : PLAN_PRICE[currency][plan].monthly;
}

export function normalizePlan(plan: SubscriptionPlan): PlanKey {
  if (plan === "business" || plan === "enterprise") return "pro";
  return plan;
}

export function planTitleKey(plan: SubscriptionPlan): string {
  return `plan.${normalizePlan(plan)}.title`;
}
