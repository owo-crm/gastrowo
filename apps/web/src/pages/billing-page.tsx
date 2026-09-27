import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { AlertTriangle, Check, CreditCard, MapPin, Users2 } from "lucide-react";

import { AppShell } from "@/components/layout/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useLanguage } from "@/lib/i18n";
import { FREE_MEMBER_LIMIT, SEAT_PRICE_PLN, formatPln, normalizePlan, planTitle, plans, type PaidPlan } from "@/lib/plans";
import { useToast } from "@/lib/toast";
import type { BillingCheckoutCycle, SubscriptionSummary } from "@/lib/types";
import { cn } from "@/lib/utils";

function formatDate(value: string | null): string | null {
  if (!value) return null;
  return new Date(value).toLocaleDateString("pl-PL", { day: "numeric", month: "long", year: "numeric" });
}

function peopleLabel(count: number): string {
  if (count === 1) return "osoba";
  const lastDigit = count % 10;
  const lastTwo = count % 100;
  return lastDigit >= 2 && lastDigit <= 4 && (lastTwo < 12 || lastTwo > 14) ? "osoby" : "osób";
}

function statusBadge(subscription: SubscriptionSummary): { label: string; className: string } {
  if (subscription.status === "trialing") {
    const ends = formatDate(subscription.trial_ends_at);
    return { label: ends ? `Trial Pro do ${ends}` : "Trial Pro", className: "border-blue-200 bg-blue-50 text-blue-700" };
  }
  if (subscription.status === "past_due") return { label: "Zaległa płatność", className: "border-red-200 bg-red-50 text-red-700" };
  if (subscription.plan === "free") return { label: "Plan Free", className: "border-slate-200 bg-slate-50 text-slate-700" };
  return { label: `${planTitle(subscription.plan)} aktywny`, className: "border-emerald-200 bg-emerald-50 text-emerald-700" };
}

export function BillingPage() {
  const { token, me } = useAuth();
  const { t } = useLanguage();
  const toast = useToast();
  const [cycle, setCycle] = useState<BillingCheckoutCycle>("monthly");

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
    onError: (error) => toast.error("Nie udało się otworzyć płatności", error instanceof Error ? error.message : undefined),
  });

  const portalMutation = useMutation({
    mutationFn: () => api.createBillingPortalSession(token!),
    onSuccess: (session) => window.location.assign(session.url),
    onError: (error) => toast.error("Nie udało się otworzyć panelu płatności", error instanceof Error ? error.message : undefined),
  });

  const seats = subscription?.billable_seats ?? Math.max(subscription?.active_members_count ?? 1, 1);
  const currentPlan = subscription ? normalizePlan(subscription.plan) : null;
  const isTrial = subscription?.status === "trialing";
  const hasPaidSubscription = Boolean(subscription?.has_payment_method);
  const atFreeLimit = currentPlan === "free" && (subscription?.active_members_count ?? 0) >= FREE_MEMBER_LIMIT;
  const badge = subscription ? statusBadge(subscription) : null;
  const periodEnd = formatDate(subscription?.current_period_ends_at ?? null);

  return (
    <AppShell title={t("billing.title")} subtitle="Płacisz tylko za osoby w zespole. Lokale bez limitu.">
      <div className="mx-auto max-w-4xl space-y-5">
        {atFreeLimit ? (
          <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            <p>
              Plan Free obejmuje do {FREE_MEMBER_LIMIT} osób. Aby zaprosić kolejne, wybierz Standard lub Pro.
            </p>
          </div>
        ) : null}

        <Card className="rounded-2xl border border-[var(--color-border)] p-5 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-sm text-[var(--color-text-muted)]">Twój plan</p>
              <p className="mt-1 text-3xl font-bold tracking-tight text-[var(--color-heading)]">{subscription ? planTitle(subscription.plan) : "…"}</p>
              {periodEnd && hasPaidSubscription ? <p className="mt-1 text-sm text-[var(--color-text-muted)]">Następna płatność: {periodEnd}</p> : null}
            </div>
            {badge ? <Badge className={badge.className}>{badge.label}</Badge> : null}
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <div className="flex items-center gap-3 rounded-xl bg-[var(--color-surface-muted)] px-4 py-3">
              <Users2 className="size-4 text-[var(--color-primary)]" />
              <div>
                <p className="text-xs text-[var(--color-text-muted)]">Zespół</p>
                <p className="text-sm font-semibold text-[var(--color-heading)]">
                  {subscription ? `${subscription.active_members_count}${subscription.member_cap ? ` / ${subscription.member_cap}` : ""} osób` : "–"}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3 rounded-xl bg-[var(--color-surface-muted)] px-4 py-3">
              <MapPin className="size-4 text-[var(--color-primary)]" />
              <div>
                <p className="text-xs text-[var(--color-text-muted)]">Lokale</p>
                <p className="text-sm font-semibold text-[var(--color-heading)]">{subscription ? `${subscription.active_locations_count} · bez limitu` : "–"}</p>
              </div>
            </div>
          </div>
        </Card>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-[var(--color-heading)]">Wybierz plan</h2>
          <div className="inline-flex rounded-xl border border-[var(--color-border)] bg-white p-1" role="group" aria-label="Okres rozliczeniowy">
            {(["monthly", "annual"] as const).map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setCycle(item)}
                aria-pressed={cycle === item}
                className={cn(
                  "rounded-lg px-3 py-1.5 text-sm font-semibold transition",
                  cycle === item ? "bg-[var(--color-heading)] text-white" : "text-[var(--color-text-muted)] hover:text-[var(--color-heading)]",
                )}
              >
                {item === "monthly" ? "Miesięcznie" : "Rocznie −17%"}
              </button>
            ))}
          </div>
        </div>

        <section className="grid gap-4 md:grid-cols-3">
          {plans.map((plan) => {
            const isCurrent = currentPlan === plan.key;
            const paid = plan.key !== "free" ? plan.key : null;
            const seatPrice = paid ? SEAT_PRICE_PLN[paid][cycle] : 0;
            return (
              <Card
                key={plan.key}
                className={cn("flex flex-col rounded-2xl border p-5", isCurrent ? "border-[var(--color-primary)] ring-1 ring-[var(--color-primary)]" : "border-[var(--color-border)]")}
              >
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-base font-semibold text-[var(--color-heading)]">{plan.title}</h3>
                  {isCurrent ? <Badge className="border-blue-200 bg-blue-50 text-blue-700">{isTrial ? "Trial" : "Aktualny"}</Badge> : null}
                </div>
                <p className="mt-1 text-sm text-[var(--color-text-muted)]">{plan.tagline}</p>
                <p className="mt-4">
                  <span className="text-3xl font-bold tracking-tight text-[var(--color-heading)]">{paid ? formatPln(seatPrice) : plan.price}</span>{" "}
                  <span className="text-sm text-[var(--color-text-muted)]">{paid ? (cycle === "monthly" ? "/ osoba / mies." : "/ osoba / rok") : plan.cycle}</span>
                </p>
                {paid ? (
                  <p className="mt-1 text-sm text-[var(--color-text-muted)]">
                    Twój zespół: <span className="font-semibold text-[var(--color-heading)]">{formatPln(seats * seatPrice)}</span> {cycle === "monthly" ? "/ mies." : "/ rok"}
                  </p>
                ) : null}
                <ul className="mt-5 flex-1 space-y-2">
                  {plan.highlights.map((item) => (
                    <li key={item} className="flex items-start gap-2 text-sm text-[var(--color-heading)]">
                      <Check className="mt-0.5 size-4 shrink-0 text-[var(--color-primary)]" /> {item}
                    </li>
                  ))}
                </ul>
                {paid && !hasPaidSubscription ? (
                  <Button
                    className="mt-6 w-full"
                    variant={plan.key === "standard" ? "default" : "secondary"}
                    onClick={() => checkoutMutation.mutate(paid)}
                    disabled={checkoutMutation.isPending || !token}
                  >
                    <CreditCard className="size-4" />
                    {checkoutMutation.isPending && checkoutMutation.variables === paid ? "Otwieranie…" : `Wybierz ${plan.title}`}
                  </Button>
                ) : null}
              </Card>
            );
          })}
        </section>

        <p className="text-sm text-[var(--color-text-muted)]">
          Płacisz za osoby w zespole ({seats} {peopleLabel(seats)} teraz). Kwota zmienia się sama, gdy dodajesz lub usuwasz osoby. Lokale bez limitu w każdym planie.
        </p>

        {hasPaidSubscription ? (
          <Button onClick={() => portalMutation.mutate()} disabled={portalMutation.isPending}>
            <CreditCard className="size-4" />
            {portalMutation.isPending ? "Otwieranie…" : "Zmień plan lub zarządzaj płatnościami"}
          </Button>
        ) : null}
      </div>
    </AppShell>
  );
}
