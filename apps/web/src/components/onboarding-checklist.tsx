import { useQuery } from "@tanstack/react-query";
import { ChevronRight, Rocket } from "lucide-react";
import { Link } from "react-router-dom";

import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useLanguage } from "@/lib/i18n";

/** A slim "Get started · 4 of 12" strip on the main pages, leading to the full roadmap tab. */
export function OnboardingChecklist() {
  const { token, me } = useAuth();
  const { t } = useLanguage();
  const enabled = Boolean(token) && me?.role === "ADMIN" && !me.organization_settings?.roadmap_hidden;
  const roadmapQuery = useQuery({ queryKey: ["roadmap"], queryFn: () => api.getRoadmap(token!), enabled });
  const data = roadmapQuery.data;
  if (!enabled || !data || data.hidden || data.done_count >= data.total) return null;
  const next = data.steps.find((step) => !step.done);

  return (
    <Link to="/start" className="ios-island mx-3 mb-4 flex items-center gap-3 px-4 py-3 active:opacity-70 sm:mx-6 sm:px-5">
      <span className="grid size-10 shrink-0 place-items-center rounded-full bg-[var(--color-accent)] text-[var(--color-primary-strong)]">
        <Rocket className="size-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[16px] font-semibold text-black">{t("roadmap.strip", { done: data.done_count, total: data.total })}</span>
        {next ? <span className="block truncate text-[14px] text-[var(--color-text-muted)]">{t("roadmap.next", { step: t(`roadmap.step.${next.key}`) })}</span> : null}
        <span className="mt-1.5 block h-1 overflow-hidden rounded-full bg-[var(--color-fill)]">
          <span className="block h-full rounded-full bg-[var(--color-success)]" style={{ width: `${(data.done_count / data.total) * 100}%` }} />
        </span>
      </span>
      <ChevronRight className="size-5 shrink-0 text-[#c4c4c6]" aria-hidden />
    </Link>
  );
}
