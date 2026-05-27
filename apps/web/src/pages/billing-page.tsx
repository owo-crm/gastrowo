import { useQuery } from "@tanstack/react-query";
import { CalendarClock, CheckCircle2, CreditCard, MapPin, Users2 } from "lucide-react";

import { AppShell } from "@/components/layout/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useLanguage } from "@/lib/i18n";
import type { SubscriptionPlan } from "@/lib/types";
import { cn } from "@/lib/utils";

const plans: Array<{
  key: SubscriptionPlan;
  title: string;
  price: string;
  cycle: string;
  highlights: string[];
}> = [
  {
    key: "free",
    title: "Free",
    price: "0 zł",
    cycle: "/ mies.",
    highlights: ["1 lokal", "do 5 aktywnych członków", "grafik i dostępność"],
  },
  {
    key: "pro",
    title: "Pro",
    price: "89 zł",
    cycle: "/ lokal / mies.",
    highlights: ["do 25 aktywnych członków", "raporty i prośby o zmiany", "powiadomienia i eksporty"],
  },
  {
    key: "business",
    title: "Business",
    price: "179 zł",
    cycle: "/ workspace / mies.",
    highlights: ["do 5 lokali", "uprawnienia i raporty zbiorcze", "zadania, notatki i inventory"],
  },
];

function planLabel(plan: SubscriptionPlan) {
  return plans.find((item) => item.key === plan)?.title ?? plan;
}

export function BillingPage() {
  const { token, me } = useAuth();
  const { t } = useLanguage();
  const subscriptionQuery = useQuery({
    queryKey: ["subscription"],
    queryFn: () => api.getCurrentSubscription(token!),
    enabled: Boolean(token),
    initialData: me?.subscription ?? undefined,
  });
  const subscription = subscriptionQuery.data;

  return (
    <AppShell
      title={t("billing.title")}
      subtitle="Rozliczenie oparte o lokale, bez naliczania za każdego pracownika osobno."
      action={
        subscription ? (
          <Badge className="border-emerald-200 bg-emerald-50 text-emerald-700">
            {subscription.status === "trialing" ? "30 dni trialu Pro" : `Plan ${planLabel(subscription.plan)}`}
          </Badge>
        ) : undefined
      }
    >
      <div className="space-y-5">
        <Card className="overflow-hidden border-0 p-0">
          <div className="grid gap-5 bg-[linear-gradient(135deg,#eef5ff_0%,#ffffff_54%,#f1fff5_100%)] px-4 py-5 sm:px-6 sm:py-6 lg:grid-cols-[1.1fr_0.9fr]">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-blue-700">Billing</p>
              <h2 className="mt-3 text-2xl font-bold tracking-[-0.05em] text-[var(--color-heading)] sm:text-3xl">
                Przewidywalna subskrypcja dla restauracji i małych sieci
              </h2>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--color-text-muted)]">
                Startujesz bez karty. Trial daje pełny dostęp do Pro przez 30 dni, a potem możesz zostać na Free albo przejść na płatny plan.
              </p>
            </div>
            <div className="grid gap-3 rounded-[1.25rem] bg-white/88 p-4 sm:rounded-[1.4rem]">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm text-[var(--color-text-muted)]">Aktualny plan</p>
                  <p className="mt-1 text-2xl font-bold tracking-[-0.04em] text-[var(--color-heading)]">
                    {subscription ? planLabel(subscription.plan) : "Loading..."}
                  </p>
                </div>
                {subscription ? (
                  <Badge className="border-blue-200 bg-blue-50 text-blue-700">
                    {subscription.status === "trialing" ? "Trial" : "Aktywny"}
                  </Badge>
                ) : null}
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-[1rem] border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-3 py-3">
                  <Users2 className="size-4 text-[var(--color-primary)]" />
                  <p className="mt-3 text-xs uppercase tracking-[0.12em] text-[var(--color-text-muted)]">Aktywny zespół</p>
                  <p className="mt-1 text-sm font-semibold text-[var(--color-heading)]">
                    {subscription ? `${subscription.active_members_count}${subscription.member_cap ? ` / ${subscription.member_cap}` : ""}` : "—"}
                  </p>
                </div>
                <div className="rounded-[1rem] border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-3 py-3">
                  <MapPin className="size-4 text-[var(--color-primary)]" />
                  <p className="mt-3 text-xs uppercase tracking-[0.12em] text-[var(--color-text-muted)]">Lokale</p>
                  <p className="mt-1 text-sm font-semibold text-[var(--color-heading)]">
                    {subscription ? `${subscription.active_locations_count}${subscription.location_cap ? ` / ${subscription.location_cap}` : ""}` : "—"}
                  </p>
                </div>
                <div className="rounded-[1rem] border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-3 py-3">
                  <CalendarClock className="size-4 text-[var(--color-primary)]" />
                  <p className="mt-3 text-xs uppercase tracking-[0.12em] text-[var(--color-text-muted)]">Koniec trialu / okresu</p>
                  <p className="mt-1 text-sm font-semibold text-[var(--color-heading)]">
                    {subscription?.trial_ends_at ?? subscription?.current_period_ends_at ?? "—"}
                  </p>
                </div>
                <div className="rounded-[1rem] border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-3 py-3">
                  <CreditCard className="size-4 text-[var(--color-primary)]" />
                  <p className="mt-3 text-xs uppercase tracking-[0.12em] text-[var(--color-text-muted)]">Rocznie</p>
                  <p className="mt-1 text-sm font-semibold text-[var(--color-heading)]">2 miesiące gratis</p>
                </div>
              </div>
            </div>
          </div>
        </Card>

        <section className="grid gap-5 xl:grid-cols-3">
          {plans.map((plan) => {
            const isCurrent = subscription?.plan === plan.key;
            return (
              <Card
                key={plan.key}
                className={cn(
                  "flex flex-col justify-between rounded-[1.6rem] border border-[var(--color-border)] bg-[#f7f7f5] p-5 sm:p-6",
                  isCurrent && "border-[var(--color-primary)] bg-white",
                )}
              >
                <div>
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="text-2xl font-bold tracking-[-0.04em] text-[var(--color-heading)]">{plan.title}</h3>
                    {isCurrent ? <Badge className="border-emerald-200 bg-emerald-50 text-emerald-700">Aktualny</Badge> : null}
                  </div>
                  <div className="mt-6 flex items-end gap-1">
                    <p className="text-[3.2rem] font-bold leading-none tracking-[-0.08em] text-[var(--color-heading)]">{plan.price}</p>
                    <p className="pb-2 text-base font-semibold text-[var(--color-text-muted)]">{plan.cycle}</p>
                  </div>
                  <div className="mt-6 space-y-3">
                    {plan.highlights.map((feature) => (
                      <div key={feature} className="flex items-center gap-3 text-sm text-[var(--color-heading)]">
                        <span className="grid size-5 shrink-0 place-items-center rounded-full bg-slate-950 text-white">
                          <CheckCircle2 className="size-3.5" />
                        </span>
                        <span>{feature}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <Button variant={isCurrent ? "secondary" : "default"} className="mt-8" disabled>
                  {isCurrent ? "Aktywny plan" : "Checkout Stripe w kolejnym kroku"}
                </Button>
              </Card>
            );
          })}
        </section>
      </div>
    </AppShell>
  );
}
