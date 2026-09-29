import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { AlertTriangle, Check, CreditCard } from "lucide-react";

import { DemoOffNote } from "@/components/demo-off";
import { AppShell } from "@/components/layout/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ListRow, ListSection } from "@/components/ui/list";
import { Segmented } from "@/components/ui/segmented";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { currencyOf, formatDate, formatMoney } from "@/lib/format";
import { useLanguage } from "@/lib/i18n";
import { PLAN_PRICE, PRO_EXTRA_LOCATION_PRICE, SEVENSHIFTS_USD, normalizePlan, planTitleKey, planTotal, plans, type PaidPlan } from "@/lib/plans";
import { useToast } from "@/lib/toast";
import type { BillingCheckoutCycle, SubscriptionSummary } from "@/lib/types";
import { cn } from "@/lib/utils";

type Translate = (key: string, params?: Record<string, string | number>) => string;

function statusBadge(subscription: SubscriptionSummary, t: Translate, lang: Parameters<typeof formatDate>[1]) {
  if (subscription.status === "trialing") {
    const ends = subscription.trial_ends_at ? formatDate(subscription.trial_ends_at, lang, { month: "long", day: "numeric" }) : null;
    return { tone: "blue" as const, label: ends ? t("billing.trial_until", { date: ends }) : t("billing.trial") };
  }
  if (subscription.status === "past_due") return { tone: "red" as const, label: t("billing.past_due") };
  if (subscription.plan === "free") return { tone: "neutral" as const, label: t("plan.free.title") };
  return { tone: "green" as const, label: t("billing.active") };
}

export function BillingPage() {
  const { token, me } = useAuth();
  const { t, lang } = useLanguage();
  const toast = useToast();
  const [cycle, setCycle] = useState<BillingCheckoutCycle>("monthly");
  const currency = currencyOf(me);

  const subscriptionQuery = useQuery({
    queryKey: ["subscription"],
    queryFn: () => api.getCurrentSubscription(token!),
    enabled: Boolean(token),
    initialData: me?.subscription ?? undefined,
  });
  const subscription = subscriptionQuery.data;

  const checkoutMutation = useMutation({
    mutationFn: (plan: PaidPlan) => api.createCheckoutSession(token!, { plan, billing_cycle: cycle }),
    onSuccess: (session) => window.location.assign(session.url),
    onError: (error) => toast.error(t("billing.checkout_failed"), error instanceof Error ? error.message : undefined),
  });
  const portalMutation = useMutation({
    mutationFn: () => api.createBillingPortalSession(token!),
    onSuccess: (session) => window.location.assign(session.url),
    onError: (error) => toast.error(t("billing.portal_failed"), error instanceof Error ? error.message : undefined),
  });

  const locations = subscription?.billable_locations ?? Math.max(subscription?.active_locations_count ?? 1, 1);
  const currentPlan = subscription ? normalizePlan(subscription.plan) : null;
  const isTrial = subscription?.status === "trialing";
  const hasPaidSubscription = Boolean(subscription?.has_payment_method);
  const atLimit = Boolean(subscription?.member_cap && subscription.active_members_count >= subscription.member_cap);
  const badge = subscription ? statusBadge(subscription, t, lang) : null;
  const perPeriod = cycle === "monthly" ? t("billing.per_month") : t("billing.per_year");

  if (me?.is_sandbox) {
    return (
      <AppShell title={t("sub.billing")} subtitle={t("billing.subtitle")} flush>
        <DemoOffNote body={t("demo.off_billing")} />
      </AppShell>
    );
  }

  return (
    <AppShell title={t("sub.billing")} subtitle={t("billing.subtitle")} flush>
      <div>
        {atLimit ? (
          <div className="mx-4 mb-4 flex items-start gap-3 rounded-2xl bg-[var(--color-warning-fill)] px-4 py-3 text-[15px] text-[#7a3700] sm:mx-6">
            <AlertTriangle className="mt-0.5 size-5 shrink-0" />
            <p className="text-[#7a3700]">{t("billing.limit_reached", { count: subscription?.member_cap ?? 0 })}</p>
          </div>
        ) : null}

        <ListSection header={t("billing.your_plan")}>
          <ListRow
            title={<span className="text-[20px] font-semibold">{subscription ? t(planTitleKey(subscription.plan)) : "…"}</span>}
            trailing={badge ? <Badge tone={badge.tone}>{badge.label}</Badge> : null}
          />
          <ListRow
            title={t("billing.people")}
            trailing={subscription ? `${subscription.active_members_count}${subscription.member_cap ? ` / ${subscription.member_cap}` : ""}` : "–"}
          />
          <ListRow
            title={t("billing.locations")}
            trailing={subscription ? `${subscription.active_locations_count}${subscription.location_cap ? ` / ${subscription.location_cap}` : ""}` : "–"}
          />
          {hasPaidSubscription && subscription?.current_period_ends_at ? (
            <ListRow title={t("billing.next_payment")} trailing={formatDate(subscription.current_period_ends_at, lang, { year: "numeric", month: "long", day: "numeric" })} />
          ) : null}
          {hasPaidSubscription ? (
            <ListRow
              title={<span className="font-semibold text-[var(--color-primary-strong)]">{portalMutation.isPending ? t("billing.opening") : t("billing.manage")}</span>}
              onClick={() => portalMutation.mutate()}
              chevron
            />
          ) : null}
        </ListSection>

        <div className="flex flex-wrap items-center justify-between gap-3 px-4 pb-3 pt-6 sm:px-6">
          <h2 className="text-[20px] font-semibold text-black">{t("billing.choose_plan")}</h2>
          <Segmented
            ariaLabel={t("billing.cycle")}
            value={cycle}
            onChange={setCycle}
            options={[
              { value: "monthly", label: t("billing.monthly") },
              { value: "annual", label: t("billing.annual") },
            ]}
          />
        </div>

        <div className="grid gap-3 px-4 sm:px-6 md:grid-cols-3">
          {plans.map((plan) => {
            const isCurrent = currentPlan === plan.key;
            const paid = plan.key !== "free" ? plan.key : null;
            const price = paid ? PLAN_PRICE[currency][paid][cycle] : 0;
            const saving = paid && currency === "USD" ? Math.round((1 - PLAN_PRICE.USD[paid].monthly / SEVENSHIFTS_USD[paid]) * 100) : null;
            return (
              <section key={plan.key} className={cn("ios-island flex flex-col px-5 py-6", isCurrent && "ring-2 ring-[var(--color-primary-strong)]")}>
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-[20px] font-semibold text-black">{t(`plan.${plan.key}.title`)}</h3>
                  {isCurrent ? <Badge tone="blue">{isTrial ? t("billing.trial") : t("billing.current")}</Badge> : null}
                </div>
                <p className="mt-0.5 text-[15px] text-[var(--color-text-muted)]">{t(`plan.${plan.key}.tagline`)}</p>
                <p className="mt-4 flex flex-wrap items-baseline gap-x-1.5">
                  <span className="text-[34px] font-semibold leading-none tracking-tight text-black">{formatMoney(price, currency, lang)}</span>
                  <span className="text-[14px] text-[var(--color-text-muted)]">
                    {paid ? (cycle === "monthly" ? t("plan.per_location_month") : t("billing.per_location_year")) : t("plan.forever")}
                  </span>
                </p>
                {saving ? <p className="mt-1.5 text-[14px] font-semibold text-[var(--color-success)]">{t("plan.cheaper_than", { percent: saving })}</p> : null}
                {paid === "pro" ? (
                  <p className="mt-1 text-[14px] text-[var(--color-text-muted)]">
                    {t("plan.pro_extra", { price: formatMoney(PRO_EXTRA_LOCATION_PRICE[currency][cycle], currency, lang) })}
                  </p>
                ) : null}
                {paid === "pro" && locations > 1 ? (
                  <p className="mt-1 text-[14px] text-[var(--color-text-muted)]">
                    {t("billing.your_total", { count: locations, total: formatMoney(planTotal(paid, locations, currency, cycle), currency, lang), period: perPeriod })}
                  </p>
                ) : null}
                <ul className="mt-5 flex-1 space-y-2.5">
                  {Array.from({ length: plan.features }, (_, index) => (
                    <li key={index} className="flex items-start gap-2.5 text-[15px] text-black">
                      <Check className="mt-0.5 size-[18px] shrink-0 text-[var(--color-success)]" strokeWidth={3} /> {t(`plan.${plan.key}.f${index + 1}`)}
                    </li>
                  ))}
                </ul>
                {paid && !hasPaidSubscription ? (
                  <Button
                    size="lg"
                    className="mt-6 w-full"
                    variant={plan.key === "standard" ? "default" : "tinted"}
                    onClick={() => checkoutMutation.mutate(paid)}
                    disabled={checkoutMutation.isPending || !token}
                  >
                    <CreditCard className="size-5" />
                    {checkoutMutation.isPending && checkoutMutation.variables === paid ? t("billing.opening") : t("billing.choose", { plan: t(`plan.${plan.key}.title`) })}
                  </Button>
                ) : null}
              </section>
            );
          })}
        </div>
        <p className="px-4 py-4 text-[14px] text-[var(--color-text-muted)] sm:px-6">{t("billing.footer")}</p>
      </div>
    </AppShell>
  );
}
