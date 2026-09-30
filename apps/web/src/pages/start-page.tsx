import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, ChevronRight, EyeOff, PartyPopper } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";

import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useLanguage } from "@/lib/i18n";
import { useToast } from "@/lib/toast";
import { cn } from "@/lib/utils";

/**
 * "Get started": the owner's roadmap from a fresh account to the first auto-schedule and approved
 * hours. Each step ticks itself off from real data; the tab can be hidden for good.
 */
export function StartPage() {
  const { token, refreshMe } = useAuth();
  const { t } = useLanguage();
  const toast = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [confirmHide, setConfirmHide] = useState(false);
  const roadmapQuery = useQuery({ queryKey: ["roadmap"], queryFn: () => api.getRoadmap(token!), enabled: Boolean(token), refetchOnWindowFocus: true });
  const data = roadmapQuery.data;
  const hide = useMutation({
    mutationFn: () => api.hideRoadmap(token!),
    onSuccess: async () => {
      await refreshMe();
      void queryClient.invalidateQueries({ queryKey: ["roadmap"] });
      toast.success(t("roadmap.hidden"));
      navigate("/overview", { replace: true });
    },
  });

  const allDone = Boolean(data && data.done_count >= data.total);
  const nextKey = data?.steps.find((step) => !step.done)?.key;
  const percent = data ? Math.round((data.done_count / data.total) * 100) : 0;

  return (
    <AppShell title={t("sub.get_started")} subtitle={t("roadmap.subtitle")} flush>
      <div className="px-4 sm:px-6">
        <div className="ios-island mb-6 flex items-center gap-5 px-5 py-5">
          <div
            className="grid size-20 shrink-0 place-items-center rounded-full"
            style={{ background: `conic-gradient(var(--color-success) ${percent * 3.6}deg, var(--color-fill) 0deg)` }}
            aria-hidden
          >
            <span className="grid size-[64px] place-items-center rounded-full bg-white text-[20px] font-semibold tabular-nums text-black">{percent}%</span>
          </div>
          <div className="min-w-0">
            <p className="text-[20px] font-semibold text-black" data-testid="roadmap-progress">
              {allDone ? t("roadmap.all_done") : t("roadmap.progress", { done: data?.done_count ?? 0, total: data?.total ?? 12 })}
            </p>
            <p className="mt-0.5 text-[15px] text-[var(--color-text-muted)]">{allDone ? t("roadmap.all_done_body") : t("roadmap.progress_body")}</p>
          </div>
          {allDone ? <PartyPopper className="ml-auto size-8 shrink-0 text-[var(--color-warning)]" /> : null}
        </div>
      </div>

      <ol className="relative px-4 sm:px-6" data-testid="roadmap">
        {(data?.steps ?? []).map((step, index) => {
          const isNext = step.key === nextKey;
          const last = index === (data?.steps.length ?? 0) - 1;
          return (
            <li key={step.key} className="relative flex gap-4 pb-3">
              {/* The road: a line from each step to the next, green where it's walked. */}
              {!last ? (
                <span
                  className={cn("absolute left-[19px] top-10 bottom-0 w-0.5", step.done ? "bg-[var(--color-success)]" : "bg-[var(--color-separator)]")}
                  aria-hidden
                />
              ) : null}
              <span
                className={cn(
                  "relative z-10 grid size-10 shrink-0 place-items-center rounded-full text-[15px] font-semibold",
                  step.done
                    ? "bg-[var(--color-success)] text-white"
                    : isNext
                      ? "bg-[var(--color-primary-strong)] text-white shadow-[0_0_0_5px_rgba(31,91,214,0.18)]"
                      : "bg-white text-black shadow-[inset_0_0_0_1.5px_var(--color-separator)]",
                )}
              >
                {step.done ? <Check className="size-5" strokeWidth={3} /> : index + 1}
              </span>
              <Link
                to={step.to}
                className={cn(
                  "ios-island flex min-w-0 flex-1 items-center gap-3 px-4 py-3 transition active:opacity-70",
                  isNext && "ring-2 ring-[var(--color-primary-strong)]",
                  step.done && "opacity-70",
                )}
                data-done={step.done ? "true" : undefined}
              >
                <span className="min-w-0 flex-1">
                  <span className={cn("block text-[16px] font-semibold", step.done ? "text-[var(--color-text-muted)]" : "text-black")}>{t(`roadmap.step.${step.key}`)}</span>
                  <span className="block text-[14px] leading-5 text-[var(--color-text-muted)]">{t(`roadmap.step.${step.key}_body`)}</span>
                </span>
                {step.done ? (
                  <span className="shrink-0 text-[13px] font-semibold text-[var(--color-success)]">{t("roadmap.done")}</span>
                ) : (
                  <span className="inline-flex shrink-0 items-center gap-0.5 text-[14px] font-semibold text-[var(--color-primary-strong)]">
                    {isNext ? t("roadmap.go") : null} <ChevronRight className="size-4" />
                  </span>
                )}
              </Link>
            </li>
          );
        })}
      </ol>

      <div className="px-4 pb-4 pt-4 sm:px-6">
        {confirmHide ? (
          <div className="ios-island space-y-3 px-4 py-4">
            <p className="text-[15px] text-black">{t("roadmap.hide_confirm")}</p>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => setConfirmHide(false)}>
                {t("common.cancel")}
              </Button>
              <Button variant="danger" onClick={() => hide.mutate()} disabled={hide.isPending}>
                {t("roadmap.hide")}
              </Button>
            </div>
          </div>
        ) : (
          <Button variant={allDone ? "default" : "ghost"} onClick={() => setConfirmHide(true)}>
            <EyeOff className="size-4" /> {t("roadmap.hide")}
          </Button>
        )}
      </div>
    </AppShell>
  );
}
