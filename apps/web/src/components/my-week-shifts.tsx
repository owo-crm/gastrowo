import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeftRight, Clock3, Hand, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useLanguage } from "@/lib/i18n";
import type { StaffCalendarDay, StaffShiftCard } from "@/lib/types";
import { useToast } from "@/lib/toast";
import { cn } from "@/lib/utils";

type SwapTarget = { shift: StaffShiftCard; assignmentId: string; userName: string };

function hhmm(value: string) {
  return value.slice(0, 5);
}

function dayLabel(date: string, lang: string) {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString(lang === "en" ? "en-GB" : lang, { weekday: "short", day: "numeric", month: "numeric" });
}

/**
 * The worker's week at a glance: their own shifts with the actions they need (report hours, swap),
 * plus open shifts they can pick up. Swaps and pickups go to the manager for approval.
 */
export function MyWeekShifts({
  days,
  onReportHours,
}: {
  days: StaffCalendarDay[];
  onReportHours?: (shift: StaffShiftCard) => void;
}) {
  const { token, me } = useAuth();
  const { t, lang } = useLanguage();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [swapFor, setSwapFor] = useState<StaffShiftCard | null>(null);
  const [swapTarget, setSwapTarget] = useState<SwapTarget | null>(null);

  const allShifts = useMemo(() => days.flatMap((day) => day.shifts).sort((a, b) => (a.date + a.start_time).localeCompare(b.date + b.start_time)), [days]);
  const mine = allShifts.filter((shift) => shift.is_mine);
  const openToTake = allShifts.filter((shift) => shift.can_request_pickup);

  const swapOptions = useMemo<SwapTarget[]>(() => {
    if (!swapFor) return [];
    return allShifts
      .filter((shift) => !shift.is_mine && shift.shift_id !== swapFor.shift_id && (shift.staff_position ?? "") === (swapFor.staff_position ?? ""))
      .flatMap((shift) => shift.assignments.filter((item) => item.user_id !== me?.id).map((item) => ({ shift, assignmentId: item.id, userName: item.user_name })));
  }, [allShifts, swapFor, me?.id]);

  const requestMutation = useMutation({
    mutationFn: (payload: { shift_id: string; request_type: "pickup" | "swap"; requester_assignment_id?: string | null; target_assignment_id?: string | null }) =>
      api.createShiftRequest(token!, payload),
    onSuccess: () => {
      toast.success(t("schedule.request_sent"));
      setSwapFor(null);
      setSwapTarget(null);
      void queryClient.invalidateQueries({ queryKey: ["shiftRequests"] });
      void queryClient.invalidateQueries({ queryKey: ["staffShifts"] });
    },
    onError: (error) => toast.error(t("schedule.request_failed"), error instanceof Error ? error.message : undefined),
  });

  const sendSwap = () => {
    if (!swapFor || !swapTarget) return;
    const own = swapFor.assignments.find((item) => item.user_id === me?.id);
    requestMutation.mutate({
      shift_id: swapTarget.shift.shift_id,
      request_type: "swap",
      requester_assignment_id: own?.id ?? null,
      target_assignment_id: swapTarget.assignmentId,
    });
  };

  return (
    <section className="space-y-3" aria-labelledby="my-week-title">
      <h2 id="my-week-title" className="text-sm font-semibold text-[var(--color-heading)]">
        {t("schedule.my_week")}
      </h2>
      {mine.length ? (
        <ul className="space-y-2">
          {mine.map((shift) => (
            <li key={shift.shift_id} className="rounded-xl border border-[var(--color-border)] bg-white p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold capitalize text-[var(--color-heading)]">{dayLabel(shift.date, lang)}</p>
                  <p className="text-base font-bold text-[var(--color-heading)]">
                    {hhmm(shift.start_time)}–{hhmm(shift.end_time)}
                  </p>
                  <p className="truncate text-xs text-[var(--color-text-muted)]">
                    {[shift.staff_position, shift.location_name].filter(Boolean).join(" · ")}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col gap-1.5">
                  {onReportHours ? (
                    <Button size="sm" variant="secondary" onClick={() => onReportHours(shift)}>
                      <Clock3 className="size-4" /> {t("schedule.report_hours")}
                    </Button>
                  ) : null}
                  <Button size="sm" variant="ghost" onClick={() => setSwapFor(shift)}>
                    <ArrowLeftRight className="size-4" /> {t("schedule.swap")}
                  </Button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-xl border border-dashed border-[var(--color-border)] px-3 py-4 text-sm text-[var(--color-text-muted)]">{t("schedule.no_my_shifts")}</p>
      )}

      {openToTake.length ? (
        <ul className="space-y-2">
          {openToTake.map((shift) => (
            <li key={shift.shift_id} className="flex items-center justify-between gap-3 rounded-xl border border-dashed border-[var(--color-primary)]/40 bg-[var(--color-accent)]/50 p-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold capitalize text-[var(--color-heading)]">
                  {dayLabel(shift.date, lang)} · {hhmm(shift.start_time)}–{hhmm(shift.end_time)}
                </p>
                <p className="truncate text-xs text-[var(--color-text-muted)]">{[shift.staff_position, shift.location_name].filter(Boolean).join(" · ")}</p>
              </div>
              <Button
                size="sm"
                onClick={() => requestMutation.mutate({ shift_id: shift.shift_id, request_type: "pickup" })}
                disabled={requestMutation.isPending}
              >
                <Hand className="size-4" /> {t("schedule.take_shift")}
              </Button>
            </li>
          ))}
        </ul>
      ) : null}

      {swapFor ? (
        <div className="fixed inset-0 z-[130] grid place-items-end bg-slate-900/30 sm:place-items-center" role="dialog" aria-modal="true" aria-labelledby="swap-title">
          <div className="w-full rounded-t-3xl bg-white p-5 shadow-[var(--shadow-float)] sm:max-w-md sm:rounded-3xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 id="swap-title" className="text-base font-semibold text-[var(--color-heading)]">
                  {t("schedule.swap_title")}
                </h3>
                <p className="mt-1 text-sm text-[var(--color-text-muted)]">{t("schedule.swap_body")}</p>
              </div>
              <button type="button" onClick={() => setSwapFor(null)} className="rounded-lg p-1.5 text-[var(--color-text-muted)]" aria-label="Close">
                <X className="size-4" />
              </button>
            </div>
            <p className="mt-3 rounded-xl bg-[var(--color-surface-muted)] px-3 py-2 text-sm font-medium capitalize text-[var(--color-heading)]">
              {dayLabel(swapFor.date, lang)} · {hhmm(swapFor.start_time)}–{hhmm(swapFor.end_time)}
            </p>
            <div className="mt-3 max-h-[45dvh] space-y-2 overflow-y-auto">
              {swapOptions.map((option) => {
                const selected = swapTarget?.assignmentId === option.assignmentId;
                return (
                  <button
                    key={option.assignmentId}
                    type="button"
                    onClick={() => setSwapTarget(option)}
                    aria-pressed={selected}
                    className={cn(
                      "flex w-full items-center justify-between gap-3 rounded-xl border px-3 py-2.5 text-left text-sm transition",
                      selected ? "border-[var(--color-primary)] bg-[var(--color-accent)]" : "border-[var(--color-border)] hover:bg-[var(--color-surface-muted)]",
                    )}
                  >
                    <span className="font-semibold capitalize text-[var(--color-heading)]">
                      {dayLabel(option.shift.date, lang)} · {hhmm(option.shift.start_time)}–{hhmm(option.shift.end_time)}
                    </span>
                    <span className="text-[var(--color-text-muted)]">{option.userName}</span>
                  </button>
                );
              })}
              {!swapOptions.length ? <p className="py-4 text-sm text-[var(--color-text-muted)]">{t("schedule.swap_none")}</p> : null}
            </div>
            <Button className="mt-4 w-full" onClick={sendSwap} disabled={!swapTarget || requestMutation.isPending}>
              {t("schedule.swap_send")}
            </Button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
