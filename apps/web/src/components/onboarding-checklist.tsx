import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, ChevronRight } from "lucide-react";
import { Link } from "react-router-dom";

import { CloseButton } from "@/components/ui/sheet";
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
    { key: "location", to: "/team/locations", done: locations.some((location) => location.name !== "Main Location") },
    { key: "team", to: "/team/invites", done: team.length > 0 },
    { key: "setup", to: "/team/positions", done: team.length > 0 && team.every((user) => Boolean(user.staff_position)) },
    { key: "templates", to: "/team/templates", done: (templatesQuery.data?.length ?? 0) > 0 },
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
    <section className="ios-island mx-3 mb-4 px-4 py-4 sm:mx-6 sm:px-5" aria-labelledby="onboarding-title">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id="onboarding-title" className="text-[17px] font-bold text-black">
            {t("onboarding.title")}
          </h2>
          <p className="text-[14px] text-[var(--color-text-muted)]">
            {t("onboarding.progress", { done: doneCount, total: steps.length })} · {t("onboarding.subtitle")}
          </p>
        </div>
        <CloseButton onClick={hide} label={t("onboarding.hide")} className="-mr-2 -mt-2" />
      </div>
      <div className="mt-3 h-1 overflow-hidden rounded-full bg-[var(--color-fill)]">
        <div className="h-full rounded-full bg-[var(--color-success)] transition-all" style={{ width: `${(doneCount / steps.length) * 100}%` }} />
      </div>
      <ol className="mt-3 grid gap-x-6 md:grid-cols-5">
        {steps.map((step, index) => {
          const isNext = step.key === nextStep;
          return (
            <li key={step.key}>
              <Link
                to={step.to}
                className={cn(
                  "flex h-full items-start gap-2.5 rounded-[10px] py-2.5 md:flex-col md:gap-1.5",
                  isNext && "md:bg-[var(--color-accent)] md:px-3",
                )}
              >
                <span
                  className={cn(
                    "grid size-6 shrink-0 place-items-center rounded-full text-[13px] font-bold",
                    step.done ? "bg-[var(--color-success)] text-white" : isNext ? "bg-[var(--color-primary-strong)] text-white" : "bg-[var(--color-fill)] text-black",
                  )}
                >
                  {step.done ? <Check className="size-4" strokeWidth={3} /> : index + 1}
                </span>
                <span className="min-w-0">
                  <span className={cn("block text-[15px] font-semibold", step.done ? "text-[var(--color-text-muted)] line-through" : "text-black")}>
                    {t(`onboarding.step.${step.key}`)}
                  </span>
                  <span className="block text-[13px] leading-5 text-[var(--color-text-muted)]">{t(`onboarding.step.${step.key}_body`)}</span>
                  {isNext ? (
                    <span className="mt-1 inline-flex items-center gap-0.5 text-[14px] font-semibold text-[var(--color-primary-strong)]">
                      {t("onboarding.open")} <ChevronRight className="size-4" />
                    </span>
                  ) : null}
                </span>
              </Link>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
