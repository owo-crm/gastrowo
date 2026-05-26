import { CheckCircle2, Layers3, Users2 } from "lucide-react";

import { AppShell } from "@/components/layout/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useLanguage } from "@/lib/i18n";
import { cn } from "@/lib/utils";

const activeSubscription = {
  plan: "Business",
  price: "$15",
  cycle: "/month",
  activeUntil: "31 May 2026",
  status: "Active",
};

const plans = [
  {
    name: "Basic",
    price: "Free",
    cycle: "",
    modules: ["Scheduling", "Team basics"],
    features: ["2 workspaces", "10 collaborators", "Unified analytics"],
    cta: "Current floor",
    active: false,
  },
  {
    name: "Business",
    price: "$15",
    cycle: "/month",
    modules: ["Scheduling", "Team", "Reports"],
    features: ["Unlimited workspaces", "Unlimited collaboration", "15 GB storage", "Revenue analytics", "Mobile app access"],
    cta: "Current active plan",
    active: true,
  },
  {
    name: "Enterprise",
    price: "$25",
    cycle: "/month",
    modules: ["Scheduling", "Team", "Reports", "Payroll"],
    features: ["Unlimited collaboration", "Unlimited data storage", "Time tracking module", "Unified analytics", "HR & Payroll"],
    cta: "Upgrade later",
    active: false,
  },
];

export function BillingPage() {
   const { t } = useLanguage();
   return (
      <AppShell title={t("billing.title")} subtitle={t("billing.subtitle")} action={<Badge className="border-emerald-200 bg-emerald-50 text-emerald-700">{t("billing.active")}</Badge>}>
       <div className="space-y-5">
         <Card className="animate-slide-in overflow-hidden border-0 p-0" style={{ animationDelay: "100ms" }}>
          <div className="grid gap-5 bg-[linear-gradient(135deg,#eef5ff_0%,#ffffff_54%,#f1fff5_100%)] px-4 py-5 sm:px-6 sm:py-6 lg:grid-cols-[1.2fr_0.8fr]">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-blue-700">{t("billing.workspace_billing")}</p>
              <h2 className="mt-3 text-2xl font-bold tracking-[-0.05em] text-[var(--color-heading)] sm:text-3xl">{t("billing.plan_status_heading")}</h2>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--color-text-muted)]">
                {t("billing.plan_status_body")}
              </p>
            </div>
              <div className="grid gap-3 rounded-[1.25rem] bg-white/88 p-4 sm:rounded-[1.4rem]">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm text-[var(--color-text-muted)]">{t("billing.current_plan")}</p>
                  <p className="mt-1 text-2xl font-bold tracking-[-0.04em] text-[var(--color-heading)]">{activeSubscription.plan}</p>
                </div>
                <Badge className="border-blue-200 bg-blue-50 text-blue-700">{t("billing.active")}</Badge>
              </div>
                <div className="grid gap-3 sm:grid-cols-3">
                {[
                  { label: t("billing.price"), value: `${activeSubscription.price}${activeSubscription.cycle}`, icon: Layers3 },
                  { label: t("billing.active_until"), value: activeSubscription.activeUntil, icon: CheckCircle2 },
                  { label: t("billing.seats"), value: t("billing.unlimited"), icon: Users2 },
                ].map((item) => (
                  <div key={item.label} className="rounded-[1rem] border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-3 py-3">
                    <item.icon className="size-4 text-[var(--color-primary)]" />
                    <p className="mt-3 text-xs uppercase tracking-[0.12em] text-[var(--color-text-muted)]">{item.label}</p>
                    <p className="mt-1 text-sm font-semibold text-[var(--color-heading)]">{item.value}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Card>

        <section className="grid gap-5 xl:grid-cols-3">
          {plans.map((plan) => (
            <Card key={plan.name} className={cn("flex min-h-[unset] flex-col justify-between rounded-[1.6rem] border border-[var(--color-border)] bg-[#f7f7f5] p-5 sm:p-6 xl:min-h-[560px]", plan.active && "border-[var(--color-primary)] bg-white")}>
              <div>
                <div className="flex items-start justify-between gap-3">
                  <h3 className="text-2xl font-bold tracking-[-0.04em] text-[var(--color-heading)]">{t(`billing.plan_${plan.name.toLowerCase()}`)}</h3>
                  {plan.active ? <Badge className="border-emerald-200 bg-emerald-50 text-emerald-700">{t("billing.active")}</Badge> : null}
                </div>
                <div className="mt-6 flex items-end gap-1">
                  <p className="text-[3.2rem] font-bold leading-none tracking-[-0.08em] text-[var(--color-heading)] sm:text-[4rem]">{plan.price}</p>
                  {plan.cycle ? <p className="pb-2 text-base font-semibold text-[var(--color-text-muted)]">{plan.cycle}</p> : null}
                </div>
                <div className="mt-6">
                  <p className="text-sm text-[var(--color-text-muted)]">{t("billing.available_modules")}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {plan.modules.map((module) => (
                      <span key={module} className="inline-flex items-center rounded-[0.9rem] bg-[var(--color-surface-muted)] px-3 py-2 text-sm font-medium text-[var(--color-heading)]">
                        {module}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="mt-6 space-y-3">
                  {plan.features.map((feature) => (
                    <div key={feature} className="flex items-center gap-3 text-sm text-[var(--color-heading)]">
                      <span className="grid size-5 shrink-0 place-items-center rounded-full bg-slate-950 text-white">
                        <CheckCircle2 className="size-3.5" />
                      </span>
                      <span>{feature}</span>
                    </div>
                  ))}
                </div>
                {plan.active ? (
                  <div className="mt-6 rounded-[1rem] border border-emerald-200 bg-emerald-50 px-4 py-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-emerald-700">{t("billing.active_until")}</p>
                    <p className="mt-1 text-sm font-semibold text-emerald-800">{activeSubscription.activeUntil}</p>
                  </div>
                ) : null}
              </div>
              <Button variant={plan.active ? "secondary" : "default"} className={cn("mt-8", !plan.active && plan.name === "Enterprise" && "bg-slate-950 text-white hover:bg-slate-800")}>
                {plan.cta}
              </Button>
            </Card>
          ))}
        </section>
      </div>
    </AppShell>
  );
}
