import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeftRight, ChevronDown, ChevronLeft, ChevronRight, Clock3, Hand } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { api } from "@/lib/api";
import { formatDate } from "@/lib/format";
import type { Lang } from "@/lib/i18n";
import { useToast } from "@/lib/toast";
import type { StaffCalendarDay, StaffShiftCard, TimesheetEntry } from "@/lib/types";
import { cn } from "@/lib/utils";

type Translate = (key: string, params?: Record<string, string | number>) => string;

const hhmm = (value: string) => value.slice(0, 5);

function minutesBetween(start: string, end: string): number {
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  let minutes = eh * 60 + em - (sh * 60 + sm);
  if (minutes <= 0) minutes += 24 * 60;
  return minutes;
}

const hoursLabel = (minutes: number) => `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, "0")}`;

function shiftEnd(shift: StaffShiftCard): Date {
  const end = new Date(`${shift.date}T${shift.end_time}`);
  if (shift.end_time <= shift.start_time) end.setDate(end.getDate() + 1);
  return end;
}

type Tone = "none" | "ok" | "pending" | "action";
const BAR: Record<Tone, string> = { none: "#c7c7cc", ok: "#34c759", pending: "#ff9f0a", action: "#ff3b30" };

/**
 * A worker's week as seven rows: the colored bar says what needs attention (red = report your hours,
 * orange = waiting for approval, green = all good, gray = day off). Tap a day for coworkers and actions.
 */
export function StaffWeek({
  token,
  meId,
  lang,
  t,
  weekDays,
  days,
  timesheetsByShift,
  timesheetsEnabled,
  onReportHours,
  onReportExtra,
  onPrev,
  onNext,
}: {
  token: string;
  meId?: string;
  lang: Lang;
  t: Translate;
  weekDays: string[];
  days: StaffCalendarDay[];
  timesheetsByShift: Record<string, TimesheetEntry[]>;
  timesheetsEnabled: boolean;
  onReportHours: (shift: StaffShiftCard) => void;
  onReportExtra: (dateIso: string) => void;
  onPrev: () => void;
  onNext: () => void;
}) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const todayIso = new Date().toLocaleDateString("sv-SE");
  const [open, setOpen] = useState<string | null>(todayIso);
  const [swapFor, setSwapFor] = useState<StaffShiftCard | null>(null);
  const [swapTarget, setSwapTarget] = useState<{ shift: StaffShiftCard; assignmentId: string } | null>(null);

  const byDate = useMemo(() => Object.fromEntries(days.map((day) => [day.date, day.shifts])), [days]);
  const allShifts = days.flatMap((day) => day.shifts);
  const mine = allShifts.filter((shift) => shift.is_mine);
  const totalMinutes = mine.reduce((sum, shift) => sum + minutesBetween(shift.start_time, shift.end_time), 0);

  const toneFor = (shifts: StaffShiftCard[]): Tone => {
    if (!shifts.length) return "none";
    if (!timesheetsEnabled) return "ok";
    let tone: Tone = "ok";
    for (const shift of shifts) {
      const entries = timesheetsByShift[shift.shift_id] ?? [];
      const latest = [...entries].sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
      if (latest?.status === "rejected" || (!latest && shiftEnd(shift) < new Date())) return "action";
      if (latest?.status === "pending") tone = "pending";
    }
    return tone;
  };

  const request = useMutation({
    mutationFn: (payload: { shift_id: string; request_type: "pickup" | "swap"; requester_assignment_id?: string | null; target_assignment_id?: string | null }) =>
      api.createShiftRequest(token, payload),
    onSuccess: () => {
      toast.success(t("schedule.request_sent"));
      setSwapFor(null);
      setSwapTarget(null);
      void queryClient.invalidateQueries({ queryKey: ["shiftRequests"] });
      void queryClient.invalidateQueries({ queryKey: ["staffShifts"] });
    },
    onError: (error) => toast.error(t("schedule.request_failed"), error instanceof Error ? error.message : undefined),
  });

  const swapOptions = swapFor
    ? allShifts
        .filter((shift) => !shift.is_mine && shift.shift_id !== swapFor.shift_id && (shift.staff_position ?? "") === (swapFor.staff_position ?? ""))
        .flatMap((shift) => shift.assignments.filter((item) => item.user_id !== meId).map((item) => ({ shift, assignmentId: item.id, name: item.user_name })))
    : [];

  const rangeLabel = weekDays.length
    ? `${formatDate(weekDays[0], lang, { day: "2-digit", month: "2-digit" })} – ${formatDate(weekDays[6], lang, { day: "2-digit", month: "2-digit", year: "numeric" })}`
    : "";

  return (
    <div className="mx-auto max-w-2xl">
      <div className="flex items-center justify-between px-2 pb-1">
        <button type="button" onClick={onPrev} aria-label={t("schedule.previous_week")} className="grid size-11 place-items-center rounded-full text-black active:bg-white">
          <ChevronLeft className="size-6" />
        </button>
        <div className="text-center">
          <p className="text-[17px] font-semibold text-black">{rangeLabel}</p>
          <p className="text-[14px] text-[#3c3c43]">{t("schedule.week_total", { hours: hoursLabel(totalMinutes) })}</p>
        </div>
        <button type="button" onClick={onNext} aria-label={t("schedule.next_week")} className="grid size-11 place-items-center rounded-full text-black active:bg-white">
          <ChevronRight className="size-6" />
        </button>
      </div>

      <ul className="ios-island mx-3 mt-3 divide-y divide-[#e5e5ea]">
        {weekDays.map((iso) => {
          const shifts = byDate[iso] ?? [];
          const myShifts = shifts.filter((shift) => shift.is_mine).sort((a, b) => a.start_time.localeCompare(b.start_time));
          const coworkers = shifts.filter((shift) => !shift.is_mine).flatMap((shift) => shift.assignments.map((item) => ({ shift, name: item.user_name })));
          const pickups = shifts.filter((shift) => shift.can_request_pickup);
          const tone = toneFor(myShifts);
          const expanded = open === iso;
          const dayName = formatDate(iso, lang, { weekday: "long" });
          const dayDate = formatDate(iso, lang, { day: "2-digit", month: "2-digit" });
          return (
            <li key={iso} className="relative">
              <span className="absolute inset-y-0 left-0 w-[5px]" style={{ backgroundColor: BAR[tone] }} aria-hidden />
              <button type="button" onClick={() => setOpen(expanded ? null : iso)} aria-expanded={expanded} className="flex w-full items-start gap-3 py-3.5 pl-5 pr-3 text-left active:bg-[#f2f2f7]">
                <span className="min-w-0 flex-1">
                  {myShifts.length ? (
                    myShifts.map((shift) => (
                      <span key={shift.shift_id} className="block">
                        <span className="block text-[19px] font-semibold leading-snug text-black">
                          <span className={iso === todayIso ? "text-[var(--color-primary-strong)]" : undefined}>{dayName}</span>, {dayDate}, {hhmm(shift.start_time)}–{hhmm(shift.end_time)}
                        </span>
                        <span className="block text-[17px] leading-snug text-black">{shift.staff_position ?? t(`shell.role.${shift.required_role}`)}</span>
                        <span className="block text-[15px] leading-snug text-[#3c3c43]">{shift.location_name}</span>
                      </span>
                    ))
                  ) : (
                    <>
                      <span className={cn("block text-[19px] leading-snug", iso === todayIso ? "text-[var(--color-primary-strong)]" : "text-[#8a8a8e]")}>
                        {dayName}, {dayDate}
                      </span>
                      <span className="block text-[17px] leading-snug text-[#8a8a8e]">{t("schedule.no_shift_assigned")}</span>
                    </>
                  )}
                </span>
                <ChevronDown className={cn("mt-1.5 size-6 shrink-0 text-[#8a8a8e] transition-transform", expanded && "rotate-180")} strokeWidth={2} />
              </button>

              {expanded ? (
                <div className="space-y-3 pb-4 pl-5 pr-4">
                  {myShifts.map((shift) => {
                    const entries = timesheetsByShift[shift.shift_id] ?? [];
                    const latest = [...entries].sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
                    const canReport = timesheetsEnabled && (!latest || latest.status === "rejected");
                    return (
                      <div key={`actions-${shift.shift_id}`} className="flex flex-wrap items-center gap-2">
                        {latest ? (
                          <span className="text-[15px] text-[#3c3c43]">
                            {t("schedule.reported_hours", { from: hhmm(latest.arrived_at), to: hhmm(latest.left_at) })} · {t(`schedule.status_${latest.status}`)}
                          </span>
                        ) : null}
                        {canReport ? (
                          <Button size="sm" onClick={() => onReportHours(shift)}>
                            <Clock3 className="size-4" /> {t("schedule.report_hours")}
                          </Button>
                        ) : null}
                        {shiftEnd(shift) > new Date() ? (
                          <Button size="sm" variant="secondary" onClick={() => setSwapFor(shift)}>
                            <ArrowLeftRight className="size-4" /> {t("schedule.swap")}
                          </Button>
                        ) : null}
                      </div>
                    );
                  })}
                  {!myShifts.length && timesheetsEnabled && iso <= todayIso ? (
                    <Button size="sm" variant="secondary" onClick={() => onReportExtra(iso)}>
                      <Clock3 className="size-4" /> {t("schedule.report_extra_hours")}
                    </Button>
                  ) : null}
                  {pickups.map((shift) => (
                    <div key={`pickup-${shift.shift_id}`} className="flex items-center justify-between gap-3 rounded-2xl bg-[#fff4e5] px-3 py-2.5">
                      <span className="min-w-0 text-[15px] text-black">
                        <span className="font-semibold">{t("schedule.open_shift")}</span> · {hhmm(shift.start_time)}–{hhmm(shift.end_time)} · {shift.staff_position}
                      </span>
                      <Button size="sm" onClick={() => request.mutate({ shift_id: shift.shift_id, request_type: "pickup" })} disabled={request.isPending}>
                        <Hand className="size-4" /> {t("schedule.take_shift")}
                      </Button>
                    </div>
                  ))}
                  <div>
                    <p className="pb-1 text-[14px] font-semibold text-[#3c3c43]">{t("schedule.team_on_this_day")}</p>
                    {coworkers.length ? (
                      <ul className="space-y-1">
                        {coworkers.map((item) => (
                          <li key={`${item.shift.shift_id}-${item.name}`} className="flex justify-between gap-3 text-[15px]">
                            <span className="truncate text-black">{item.name}</span>
                            <span className="shrink-0 tabular-nums text-[#3c3c43]">
                              {hhmm(item.shift.start_time)}–{hhmm(item.shift.end_time)} · {item.shift.staff_position}
                            </span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-[15px] text-[#8a8a8e]">{t("schedule.no_other_assigned")}</p>
                    )}
                  </div>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>

      <div className="mx-3 mt-3 flex flex-wrap gap-x-4 gap-y-1 px-2 text-[13px] text-[#3c3c43]">
        {(["ok", "pending", "action"] as const).map((tone) => (
          <span key={tone} className="inline-flex items-center gap-1.5">
            <span className="h-3 w-1.5 rounded-full" style={{ backgroundColor: BAR[tone] }} /> {t(`schedule.legend_${tone}`)}
          </span>
        ))}
      </div>

      <Sheet
        open={Boolean(swapFor)}
        onClose={() => {
          setSwapFor(null);
          setSwapTarget(null);
        }}
        title={t("schedule.swap_title")}
        subtitle={swapFor ? `${formatDate(swapFor.date, lang, { weekday: "short", day: "2-digit", month: "2-digit" })} · ${hhmm(swapFor.start_time)}–${hhmm(swapFor.end_time)}` : undefined}
        action={{
          label: t("schedule.swap_send"),
          disabled: !swapTarget || request.isPending,
          onClick: () => {
            if (!swapFor || !swapTarget) return;
            const own = swapFor.assignments.find((item) => item.user_id === meId);
            request.mutate({ shift_id: swapTarget.shift.shift_id, request_type: "swap", requester_assignment_id: own?.id ?? null, target_assignment_id: swapTarget.assignmentId });
          },
        }}
      >
        <p className="pb-3 text-[15px] text-[#3c3c43]">{t("schedule.swap_body")}</p>
        <ul className="divide-y divide-[#e5e5ea] rounded-2xl border border-[#e5e5ea] px-3">
          {swapOptions.map((option) => {
            const selected = swapTarget?.assignmentId === option.assignmentId;
            return (
              <li key={option.assignmentId}>
                <button type="button" aria-pressed={selected} onClick={() => setSwapTarget(option)} className="flex min-h-[52px] w-full items-center gap-3 py-2 text-left">
                  <span className={selected ? "grid size-6 place-items-center rounded-full bg-[var(--color-primary-strong)]" : "size-6 rounded-full border-2 border-[#c7c7cc]"}>
                    {selected ? <span className="size-2.5 rounded-full bg-white" /> : null}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[16px] text-black">{option.name}</span>
                    <span className="block text-[14px] text-[#3c3c43]">
                      {formatDate(option.shift.date, lang, { weekday: "short", day: "2-digit", month: "2-digit" })} · {hhmm(option.shift.start_time)}–{hhmm(option.shift.end_time)}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
          {!swapOptions.length ? <li className="py-4 text-[15px] text-[#3c3c43]">{t("schedule.swap_none")}</li> : null}
        </ul>
      </Sheet>
    </div>
  );
}
