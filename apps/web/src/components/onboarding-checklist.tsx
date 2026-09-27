import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, ChevronRight, X } from "lucide-react";
import { Link } from "react-router-dom";

import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { getMonday } from "@/lib/date";
import { useLanguage } from "@/lib/i18n";
import { cn } from "@/lib/utils";

const HIDE_KEY = "gastrowo_onboarding_hidden";

function nextMonday(): string {
  const date = new Date();
  date.setDate(date.getDate() + 7);
  return getMonday(date);
}

function readHidden(organizationId: string | null | undefined): boolean {
  try {
    return Boolean(organizationId) && localStorage.getItem(`${HIDE_KEY}:${organizationId}`) === "1";
  } catch {
    return false;
  }
}

/**
 * "First steps" for a new owner. Progress comes from real data, so it ticks itself off as the
 * owner sets things up, and disappears once a schedule is published.
 */
export function OnboardingChecklist() {
  const { token, me } = useAuth();
  const { t } = useLanguage();
  const organizationId = me?.active_organization_id;
  const [hidden, setHidden] = useState(() => readHidden(organizationId));
  const enabled = Boolean(token) && me?.role === "ADMIN" && !hidden;

  const locationsQuery = useQuery({ queryKey: ["locations"], queryFn: () => api.listLocations(token!), enabled });
  const usersQuery = useQuery({ queryKey: ["users"], queryFn: () => api.listUsers(token!), enabled });
  const templatesQuery = useQuery({ queryKey: ["templates", "all"], queryFn: () => api.listTemplates(token!), enabled });
  const thisWeek = getMonday();
  const upcoming = nextMonday();
  const shiftsThisWeek = useQuery({ queryKey: ["shifts", thisWeek], queryFn: () => api.listShifts(token!, thisWeek), enabled });
  const shiftsNextWeek = useQuery({ queryKey: ["shifts", upcoming], queryFn: () => api.listShifts(token!, upcoming), enabled });

  if (!enabled || locationsQuery.isLoading || usersQuery.isLoading) return null;

  const locations = locationsQuery.data ?? [];
  const users = usersQuery.data ?? [];
  const team = users.filter((user) => user.role !== "ADMIN");
  const published = (shiftsThisWeek.data?.length ?? 0) + (shiftsNextWeek.data?.length ?? 0) > 0;

  const steps = [
    { key: "location", to: "/team", done: locations.some((location) => location.name !== "Main Location") },
    { key: "team", to: "/team", done: team.length > 0 },
    { key: "setup", to: "/team", done: team.length > 0 && team.every((user) => Boolean(user.staff_position)) },
    { key: "templates", to: "/team", done: (templatesQuery.data?.length ?? 0) > 0 },
    { key: "publish", to: "/schedule", done: published },
  ];
  const doneCount = steps.filter((step) => step.done).length;
  if (published) return null;

  const hide = () => {
    try {
      localStorage.setItem(`${HIDE_KEY}:${organizationId}`, "1");
    } catch {
      // Private mode: hide just for this visit.
    }
    setHidden(true);
  };
  const nextStep = steps.find((step) => !step.done)?.key;

  return (
    <section className="surface-card mb-5 rounded-2xl p-4 sm:p-5" aria-labelledby="onboarding-title">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 id="onboarding-title" className="text-base font-semibold text-[var(--color-heading)] sm:text-lg">
            {t("onboarding.title")}
          </h2>
          <p className="mt-0.5 text-sm text-[var(--color-text-muted)]">{t("onboarding.subtitle")}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-[var(--color-text-muted)]">{t("onboarding.progress", { done: doneCount, total: steps.length })}</span>
          <button type="button" onClick={hide} className="rounded-lg p-1.5 text-[var(--color-text-muted)] hover:bg-[var(--color-surface-muted)]" aria-label={t("onboarding.hide")}>
            <X className="size-4" />
          </button>
        </div>
      </div>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[var(--color-surface-muted)]">
        <div className="h-full rounded-full bg-[var(--color-primary)] transition-all" style={{ width: `${(doneCount / steps.length) * 100}%` }} />
      </div>
      <ol className="mt-4 grid gap-2 md:grid-cols-5">
        {steps.map((step, index) => {
          const isNext = step.key === nextStep;
          return (
            <li key={step.key}>
              <Link
                to={step.to}
                className={cn(
                  "flex h-full flex-col rounded-xl border p-3 transition",
                  step.done && "border-emerald-200 bg-emerald-50/60",
                  isNext && "border-[var(--color-primary)] bg-[var(--color-accent)]",
                  !step.done && !isNext && "border-[var(--color-border)] hover:bg-[var(--color-surface-muted)]",
                )}
              >
                <span className="flex items-center gap-2">
                  <span
                    className={cn(
                      "grid size-6 shrink-0 place-items-center rounded-full text-xs font-bold",
                      step.done ? "bg-emerald-500 text-white" : isNext ? "bg-[var(--color-primary)] text-white" : "bg-[var(--color-surface-muted)] text-[var(--color-text-muted)]",
                    )}
                  >
                    {step.done ? <Check className="size-3.5" /> : index + 1}
                  </span>
                  <span className="text-sm font-semibold text-[var(--color-heading)]">{t(`onboarding.step.${step.key}`)}</span>
                </span>
                <span className="mt-1.5 text-xs leading-5 text-[var(--color-text-muted)]">{t(`onboarding.step.${step.key}_body`)}</span>
                {isNext ? (
                  <span className="mt-auto inline-flex items-center gap-1 pt-2 text-xs font-semibold text-[var(--color-primary)]">
                    {t("onboarding.open")} <ChevronRight className="size-3.5" />
                  </span>
                ) : null}
              </Link>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
