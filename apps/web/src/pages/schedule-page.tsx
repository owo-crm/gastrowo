import { useEffect, useMemo, useState } from "react";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef } from "react";

import {
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  FileClock,
  CheckCircle2,
  CircleAlert,
  Pencil,
  Plus,

  SendHorizontal,

  Sparkles,
  Trash2,
  XCircle,

} from "lucide-react";

import { AppShell } from "@/components/layout/app-shell";
import { WorkerAvatar } from "@/components/worker-avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { OverlayPortal } from "@/components/ui/overlay-portal";

import { Input } from "@/components/ui/input";

import { Select } from "@/components/ui/select";

import { Textarea } from "@/components/ui/textarea";

import { api } from "@/lib/api";

import { useAuth } from "@/lib/auth";
import { useLanguage } from "@/lib/i18n";
import type { Lang } from "@/lib/i18n";
import { useToast } from "@/lib/toast";

import { formatTime, getMonday } from "@/lib/date";

import type {
  AvailabilityPreferenceSlot,
  LocationMember,
  SchedulePreview,
  Shift,
  ShiftRequest,
  StaffCalendarDay,
  StaffShiftCard,
  TeamAvailabilitySummaryRow,
  TimesheetEntry,
  TimesheetReviewAction,
} from "@/lib/types";



const dayNames = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];



function parseIsoDate(iso: string): Date {

  const [year, month, day] = iso.split("-").map(Number);

  return new Date(year, month - 1, day);

}



function toIsoDate(date: Date): string {

  const year = date.getFullYear();

  const month = `${date.getMonth() + 1}`.padStart(2, "0");

  const day = `${date.getDate()}`.padStart(2, "0");

  return `${year}-${month}-${day}`;

}



function shiftWeek(weekStart: string, offsetDays: number): string {

  const date = parseIsoDate(weekStart);

  date.setDate(date.getDate() + offsetDays);

  return toIsoDate(date);

}



function getWeekDays(weekStart: string): Array<{ iso: string; title: string; caption: string }> {

  const start = parseIsoDate(weekStart);

  return Array.from({ length: 7 }).map((_, index) => {

    const date = new Date(start);

    date.setDate(start.getDate() + index);

    return {

      iso: toIsoDate(date),

      title: dayNames[index],

      caption: `${date.getDate()}.${date.getMonth() + 1}`,

    };

  });

}

function formatWeekRangeCompact(weekStart: string): string {
  const start = parseIsoDate(weekStart);
  const end = parseIsoDate(shiftWeek(weekStart, 6));
  const formatPart = (value: Date) => `${`${value.getDate()}`.padStart(2, "0")}/${`${value.getMonth() + 1}`.padStart(2, "0")}`;
  return `${formatPart(start)} - ${formatPart(end)}`;
}



function statusClass(status: ShiftRequest["status"]) {

  if (status === "approved") return "border-emerald-200 bg-emerald-50 text-emerald-700";

  if (status === "rejected") return "border-red-200 bg-red-50 text-red-700";

  if (status === "cancelled") return "border-[var(--color-border)] bg-[var(--color-surface-muted)] text-[var(--color-text-muted)]";

  return "border-[var(--color-primary)] bg-[var(--color-accent)] text-[var(--color-primary)]";

}

function positionTone(position?: string | null, fallbackRole?: string | null) {
  const key = (position ?? fallbackRole ?? "staff").trim().toLowerCase();
  if (key === "cook" || key === "chef" || key === "kucharz") {
    return { accent: "#f59e0b", text: "text-amber-700", chip: "bg-amber-50 text-amber-700" };
  }
  if (key === "waiter" || key === "kelner") {
    return { accent: "#60a5fa", text: "text-sky-700", chip: "bg-sky-50 text-sky-700" };
  }
  if (key === "bartender" || key === "barman") {
    return { accent: "#a78bfa", text: "text-violet-700", chip: "bg-violet-50 text-violet-700" };
  }
  if (key === "manager" || key === "kierownik") {
    return { accent: "#34d399", text: "text-emerald-700", chip: "bg-emerald-50 text-emerald-700" };
  }
  return { accent: "#2f6fed", text: "text-[var(--color-primary)]", chip: "bg-[var(--color-accent)] text-[var(--color-primary)]" };
}

function normalizePositionLegendLabel(value?: string | null): string {
  const key = (value ?? "").trim().toLowerCase();
  if (!key) return "";
  if (key === "cook" || key === "chef" || key === "kucharz") return "Cook";
  if (key === "waiter" || key === "kelner") return "Waiter";
  if (key === "bartender" || key === "barman") return "Bartender";
  if (key === "manager" || key === "kierownik") return "Manager";
  if (key === "admin") return "ADMIN";
  if (key === "staff") return "Staff";
  return key
    .split(/\s+/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

const positionOrder: Record<string, number> = {
  cook: 0,
  waiter: 1,
  bartender: 2,
  manager: 3,
  staff: 4,
};

function getPositionSortKey(position?: string | null): number {
  if (!position) return 50;
  return positionOrder[position.trim().toLowerCase()] ?? 25;
}

function shiftHours(startTime: string, endTime: string): number {
  const [startHour, startMinute] = startTime.split(":").map(Number);
  const [endHour, endMinute] = endTime.split(":").map(Number);
  const startTotal = startHour * 60 + startMinute;
  let endTotal = endHour * 60 + endMinute;
  if (endTotal <= startTotal) endTotal += 24 * 60;
  return Math.round(((endTotal - startTotal) / 60) * 100) / 100;
}

function durationMinutes(startTime: string, endTime: string): number {
  const [startHour, startMinute] = startTime.split(":").map(Number);
  const [endHour, endMinute] = endTime.split(":").map(Number);
  const startTotal = startHour * 60 + startMinute;
  let endTotal = endHour * 60 + endMinute;
  if (endTotal <= startTotal) endTotal += 24 * 60;
  return endTotal - startTotal;
}

function formatDurationDelta(deltaMinutes: number): string {
  if (deltaMinutes === 0) return "On time";
  const sign = deltaMinutes > 0 ? "+" : "-";
  const absolute = Math.abs(deltaMinutes);
  const hours = Math.floor(absolute / 60);
  const minutes = absolute % 60;
  if (hours && minutes) return `${sign}${hours}h ${minutes} min`;
  if (hours) return `${sign}${hours}h`;
  return `${sign}${minutes} min`;
}

function getTimesheetDelta(shift: Shift | null, entry: TimesheetEntry): string {
  if (!shift || entry.is_restricted_entry) return "Extra entry";
  const plannedMinutes = durationMinutes(shift.start_time, shift.end_time);
  const reportedMinutes = durationMinutes(entry.arrived_at, entry.left_at);
  return formatDurationDelta(reportedMinutes - plannedMinutes);
}

type ShiftBlockProps = {
  timeRangeLabel: string;
  positionLabel?: string | null;
  captionLabel?: string | null;
  peopleLabel?: string | null;
  highlighted?: boolean;
  fitContent?: boolean;
  editable: boolean;
  isEditing: boolean;
  editText: string;
  onStartEdit?: () => void;
  onEditTextChange?: (next: string) => void;
  onEditKeyDown?: (event: React.KeyboardEvent<HTMLInputElement>) => void;
  onDelete?: () => void;
  deleteLabel?: string;
};

type MobileDaySelectorProps = {
  weekDays: Array<{ iso: string; title: string; caption: string }>;
  selectedDayIndex: number;
  onSelect: (index: number) => void;
  warningEntriesByDate?: Record<string, DayWarningEntry[]>;
  t?: (key: string, params?: Record<string, string | number>) => string;
  className?: string;
};

type DayWarningEntry = {
  key: string;
  timeLabel: string;
  positionLabel: string;
  metaLabel: string;
  detailLabel?: string;
  tone?: "missing" | "coverage";
};

type DayWarningPopoverProps = {
  warningEntries: DayWarningEntry[];
  isOpen: boolean;
  onToggle: () => void;
  t: (key: string, params?: Record<string, string | number>) => string;
  buttonClassName?: string;
  popupClassName?: string;
};

function DayWarningPopover({
  warningEntries,
  isOpen,
  onToggle,
  t,
  buttonClassName,
  popupClassName,
}: DayWarningPopoverProps) {
  if (!warningEntries.length) return null;

  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const [popupStyle, setPopupStyle] = useState<{ top: number; left: number; width: number; maxHeight: number } | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setPopupStyle(null);
      return;
    }

    const updatePosition = () => {
      const rect = buttonRef.current?.getBoundingClientRect();
      if (!rect) return;
      const margin = 12;
      const width = Math.min(320, window.innerWidth - margin * 2);
      const left = Math.min(Math.max(margin, rect.right - width), window.innerWidth - width - margin);
      const top = Math.min(rect.bottom + 8, window.innerHeight - 220);
      setPopupStyle({
        top: Math.max(margin, top),
        left,
        width,
        maxHeight: Math.max(180, window.innerHeight - Math.max(margin, top) - margin),
      });
    };

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [isOpen]);

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        type="button"
        className={buttonClassName ?? "inline-flex size-7 items-center justify-center rounded-full border border-amber-200 bg-amber-50 text-amber-700 transition hover:bg-amber-100"}
        onClick={(event) => {
          event.stopPropagation();
          onToggle();
        }}
        aria-label={t("schedule.missing_staff")}
      >
        <CircleAlert className="size-4" />
      </button>
      {isOpen && popupStyle ? (
        <OverlayPortal>
          <div
            className="fixed inset-0 z-[90]"
            onClick={(event) => {
              event.stopPropagation();
              onToggle();
            }}
          >
            <div
              className={popupClassName ?? "rounded-[1rem] border border-amber-200 bg-white p-3 shadow-[0_18px_40px_rgba(15,23,42,0.14)]"}
              style={{
                position: "fixed",
                top: popupStyle.top,
                left: popupStyle.left,
                width: popupStyle.width,
                maxHeight: popupStyle.maxHeight,
              }}
              onClick={(event) => event.stopPropagation()}
            >
              <p className="text-xs font-semibold uppercase tracking-[0.08em] text-amber-700">{t("schedule.missing_staff")}</p>
              <div className="mt-2 space-y-2 overflow-y-auto pr-1" style={{ maxHeight: popupStyle.maxHeight - 42 }}>
                {warningEntries.map((entry) => (
                  <div
                    key={`warning-${entry.key}`}
                    className={`rounded-[0.9rem] px-3 py-2 ${entry.tone === "coverage" ? "bg-orange-50" : "bg-amber-50"}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-semibold text-[var(--color-heading)]">{entry.timeLabel}</p>
                      {entry.tone === "coverage" ? (
                        <span className="rounded-full bg-orange-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-orange-700">
                          Start
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-1 text-sm text-amber-900">{entry.positionLabel}</p>
                    <p className="mt-1 text-xs font-medium text-[var(--color-heading)]">{entry.metaLabel}</p>
                    {entry.detailLabel ? <p className="mt-1 text-xs leading-5 text-[var(--color-text-muted)]">{entry.detailLabel}</p> : null}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </OverlayPortal>
      ) : null}
    </div>
  );
}

const rejectedReasonPriority = [
  "availability_missing",
  "availability_window_mismatch",
  "overlap",
  "desired_hours_cap_exceeded",
  "staff_position_mismatch",
  "not_in_location",
  "location_priority_blocked",
] as const;

function getRejectedReasonLabel(reason: string, lang: Lang): string {
  const copy: Record<Lang, Record<string, string>> = {
    en: {
      availability_missing: "no availability",
      availability_window_mismatch: "outside availability",
      overlap: "overlap",
      desired_hours_cap_exceeded: "hours limit",
      staff_position_mismatch: "wrong position",
      not_in_location: "wrong location",
      location_priority_blocked: "blocked in location",
    },
    pl: {
      availability_missing: "brak dostepnosci",
      availability_window_mismatch: "poza dostepnoscia",
      overlap: "nakladanie",
      desired_hours_cap_exceeded: "limit godzin",
      staff_position_mismatch: "zla pozycja",
      not_in_location: "zla lokalizacja",
      location_priority_blocked: "blokada w lokalu",
    },
    ru: {
      availability_missing: "нет availability",
      availability_window_mismatch: "вне availability",
      overlap: "пересечение",
      desired_hours_cap_exceeded: "лимит часов",
      staff_position_mismatch: "не та позиция",
      not_in_location: "не та точка",
      location_priority_blocked: "заблокирован в точке",
    },
  };

  return copy[lang][reason] ?? reason.replace(/_/g, " ");
}

function getStartCoverageLabel(lang: Lang): string {
  if (lang === "pl") return "Nikt nie zaczyna o czasie";
  if (lang === "ru") return "Никто не выходит к началу";
  return "No one starts on time";
}

function summariseRejectedReasons(reasonCounts: Record<string, number>, lang: Lang): string | undefined {
  const parts = rejectedReasonPriority
    .filter((reason) => (reasonCounts[reason] ?? 0) > 0)
    .slice(0, 2)
    .map((reason) => `${getRejectedReasonLabel(reason, lang)}: ${reasonCounts[reason]}`);

  return parts.length ? parts.join(" • ") : undefined;
}

function MobileDaySelector({ weekDays, selectedDayIndex, onSelect, warningEntriesByDate, t, className }: MobileDaySelectorProps) {
  const [openWarningDay, setOpenWarningDay] = useState<string | null>(null);

  return (
    <div className={className}>
      <div className="overflow-x-auto pb-1">
        <div className="inline-flex min-w-max items-center gap-1 rounded-[1.5rem] border border-[var(--color-border)] bg-white p-1 shadow-[0_10px_24px_rgba(15,23,42,0.05)]">
          {weekDays.map((day, index) => {
            const isActive = selectedDayIndex === index;
            const warningEntries = warningEntriesByDate?.[day.iso] ?? [];
            const isWarningOpen = openWarningDay === day.iso;
            return (
              <div key={day.iso} className="relative">
                <button
                  type="button"
                  onClick={() => {
                    setOpenWarningDay(null);
                    onSelect(index);
                  }}
                  className={`min-w-[96px] rounded-[1.15rem] px-4 py-3 text-center transition ${warningEntries.length ? "pr-10" : ""} ${isActive ? "bg-[var(--color-accent)] text-[var(--color-primary)] shadow-[inset_0_0_0_1px_rgba(47,111,237,0.12)]" : "text-[var(--color-text-muted)] hover:bg-[var(--color-surface-muted)] hover:text-[var(--color-heading)]"}`}
                >
                  <p className="text-[12px] font-semibold uppercase tracking-[0.12em]">{day.title}</p>
                  <p className="mt-1 text-base font-semibold">{day.caption}</p>
                </button>
                {warningEntries.length && t ? (
                  <div className="absolute right-2 top-2">
                    <DayWarningPopover
                      warningEntries={warningEntries}
                      isOpen={isWarningOpen}
                      onToggle={() => setOpenWarningDay(isWarningOpen ? null : day.iso)}
                      t={t}
                      buttonClassName="inline-flex size-6 items-center justify-center rounded-full border border-amber-200 bg-amber-50 text-amber-700 transition hover:bg-amber-100"
                    />
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

type WeekRangeNavigatorProps = {
  label: string;
  onPrevious: () => void;
  onNext: () => void;
  className?: string;
};

function WeekRangeNavigator({ label, onPrevious, onNext, className }: WeekRangeNavigatorProps) {
  return (
    <div className={className}>
      <div className="inline-flex w-full items-center gap-2 rounded-[0.9rem] border border-slate-200 bg-white px-2 py-1.5 shadow-[0_8px_18px_rgba(15,23,42,0.04)]">
        <button
          type="button"
          onClick={onPrevious}
          className="grid size-8 place-items-center rounded-full text-slate-500 transition hover:bg-slate-100 hover:text-slate-950"
        >
          <ChevronLeft className="size-4" />
        </button>
        <div className="min-w-[110px] flex-1 px-2 text-center text-sm font-semibold text-slate-900 sm:min-w-[150px]">
          {label}
        </div>
        <button
          type="button"
          onClick={onNext}
          className="grid size-8 place-items-center rounded-full text-slate-500 transition hover:bg-slate-100 hover:text-slate-950"
        >
          <ChevronRight className="size-4" />
        </button>
      </div>
    </div>
  );
}

function ShiftBlock({
  timeRangeLabel,
  positionLabel,
  captionLabel,
  peopleLabel,
  highlighted = false,
  fitContent = false,
  editable,
  isEditing,
  editText,
  onStartEdit,
  onEditTextChange,
  onEditKeyDown,
  onDelete,
  deleteLabel,
}: ShiftBlockProps) {
  const tone = positionTone(positionLabel);
  return (
    <div
      role={editable ? "button" : undefined}
      tabIndex={editable ? 0 : -1}
      onClick={editable ? onStartEdit : undefined}
      onKeyDown={
        editable
          ? (event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onStartEdit?.();
              }
            }
          : undefined
      }
      className={`relative ${fitContent ? "inline-flex w-fit max-w-full" : "flex w-full"} min-h-[54px] flex-col justify-between border-l-[3px] px-2 py-1.5 ${
        highlighted
          ? "rounded-[0.9rem] border border-emerald-300 bg-emerald-50/70 ring-1 ring-emerald-200"
          : ""
      } ${isEditing ? "bg-[var(--color-accent)] ring-1 ring-[rgba(47,111,237,0.20)]" : ""}`}
      draggable={false}
      style={{ borderLeftColor: tone.accent }}
    >
      {editable && onDelete ? (
        <button
          type="button"
          className="absolute right-1 top-1 rounded border border-[var(--color-border)] bg-white/95 p-0.5 text-[var(--color-text-muted)] hover:bg-[var(--color-surface-muted)]"
          onClick={(event) => {
            event.stopPropagation();
            onDelete();
          }}
          aria-label={deleteLabel ?? "Delete shift"}
        >
          <Trash2 className="size-3" />
        </button>
      ) : null}
      <div className="flex items-start justify-between gap-2">
        {isEditing ? (
          <input
            className="w-full border-none bg-transparent p-0 text-[11px] font-semibold text-[var(--color-heading)] outline-none"
            value={editText}
            onChange={(event) => onEditTextChange?.(event.target.value)}
            onKeyDown={onEditKeyDown}
            onClick={(event) => event.stopPropagation()}
            autoFocus
          />
        ) : (
          <p className="truncate text-[11px] font-semibold text-[var(--color-heading)]">{timeRangeLabel}</p>
        )}
        {positionLabel ? <span className={`truncate text-[9px] font-semibold uppercase tracking-[0.08em] ${tone.text}`}>{positionLabel}</span> : null}
      </div>
      {captionLabel ? <p className="mt-1 truncate text-[10px] text-[var(--color-text-muted)]">{captionLabel}</p> : null}
      {peopleLabel ? <p className="mt-1 truncate text-[10px] font-medium text-[var(--color-heading)]">{peopleLabel}</p> : null}
    </div>
  );
}

type ScheduleShiftPillProps = {
  timeLabel: string;
  positionLabel?: string | null;
  metaLabel?: string | null;
  toneLabel?: string | null;
  kind?: "assigned" | "missing";
};

function ScheduleShiftPill({ timeLabel, positionLabel, metaLabel, toneLabel, kind = "assigned" }: ScheduleShiftPillProps) {
  if (kind === "missing") {
    return (
      <div className="rounded-[1rem] border border-dashed border-red-300 bg-red-50 px-3 py-2 text-red-600">
        <p className="text-base font-semibold">{timeLabel}</p>
        {metaLabel ? <p className="mt-1 text-xs font-medium">{metaLabel}</p> : null}
      </div>
    );
  }

  const tone = positionTone(toneLabel ?? positionLabel);
  return (
    <div className={`rounded-[1rem] px-3 py-2 shadow-[0_8px_20px_rgba(15,23,42,0.04)] ${tone.chip}`} style={{ boxShadow: `inset 4px 0 0 ${tone.accent}` }}>
      <p className="text-base font-semibold">{timeLabel}</p>
      {positionLabel ? <p className="mt-1 text-xs font-semibold">{positionLabel}</p> : null}
      {metaLabel ? <p className="mt-1 text-xs opacity-80">{metaLabel}</p> : null}
    </div>
  );
}

type AppliedReadOnlyViewMode = "cards" | "timetable";

type AppliedTimetableEntry = {
  key: string;
  sourceShiftId: string;
  date: string;
  startTime: string;
  endTime: string;
  startMinutes: number;
  endMinutes: number;
  durationMinutes: number;
  positionLabel: string;
  assignedNames: string[];
  assignedUserIds: string[];
  metaLabel: string;
  requiredCount: number;
  missingCount: number;
  isOpen: boolean;
  isConflict: boolean;
};

type AppliedTimetableLayoutEntry = AppliedTimetableEntry & {
  lane: number;
  laneCount: number;
};

function timeToMinutes(value: string): number {
  const [hour, minute] = value.split(":").map(Number);
  return hour * 60 + minute;
}

function floorHour(minutes: number): number {
  return Math.floor(minutes / 60) * 60;
}

function ceilHour(minutes: number): number {
  return Math.ceil(minutes / 60) * 60;
}

function overlapsMinutes(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd;
}

function hexToRgba(hex: string, alpha: number): string {
  const normalized = hex.replace("#", "");
  const value = normalized.length === 3
    ? normalized
        .split("")
        .map((item) => `${item}${item}`)
        .join("")
    : normalized;
  const red = Number.parseInt(value.slice(0, 2), 16);
  const green = Number.parseInt(value.slice(2, 4), 16);
  const blue = Number.parseInt(value.slice(4, 6), 16);
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

function packTimetableEntries(entries: AppliedTimetableEntry[]): AppliedTimetableLayoutEntry[] {
  if (!entries.length) return [];

  const results: AppliedTimetableLayoutEntry[] = [];
  const chronological = [...entries].sort((a, b) => {
    if (a.startMinutes !== b.startMinutes) return a.startMinutes - b.startMinutes;
    if (a.endMinutes !== b.endMinutes) return a.endMinutes - b.endMinutes;
    return a.key.localeCompare(b.key);
  });

  let cluster: AppliedTimetableEntry[] = [];
  let clusterEnd = -1;

  const flushCluster = () => {
    if (!cluster.length) return;
    const laneEnds: number[] = [];
    const lanePacked = [...cluster]
      .sort((a, b) => {
        const byRole = getPositionSortKey(a.positionLabel) - getPositionSortKey(b.positionLabel);
        if (byRole !== 0) return byRole;
        if (a.startMinutes !== b.startMinutes) return a.startMinutes - b.startMinutes;
        if (a.isOpen !== b.isOpen) return a.isOpen ? 1 : -1;
        return a.key.localeCompare(b.key);
      })
      .map((entry) => {
        let laneIndex = laneEnds.findIndex((end) => end <= entry.startMinutes);
        if (laneIndex === -1) {
          laneIndex = laneEnds.length;
          laneEnds.push(entry.endMinutes);
        } else {
          laneEnds[laneIndex] = entry.endMinutes;
        }
        return { ...entry, lane: laneIndex, laneCount: 1 };
      });

    const laneCount = Math.max(laneEnds.length, 1);
    results.push(...lanePacked.map((item) => ({ ...item, laneCount })));
    cluster = [];
    clusterEnd = -1;
  };

  for (const entry of chronological) {
    if (!cluster.length) {
      cluster = [entry];
      clusterEnd = entry.endMinutes;
      continue;
    }
    if (entry.startMinutes < clusterEnd) {
      cluster.push(entry);
      clusterEnd = Math.max(clusterEnd, entry.endMinutes);
      continue;
    }
    flushCluster();
    cluster = [entry];
    clusterEnd = entry.endMinutes;
  }

  flushCluster();
  return results.sort((a, b) => {
    if (a.startMinutes !== b.startMinutes) return a.startMinutes - b.startMinutes;
    if (a.lane !== b.lane) return a.lane - b.lane;
    return a.key.localeCompare(b.key);
  });
}

function findConflictingShiftIds(shifts: Shift[]): Set<string> {
  const ids = new Set<string>();
  const rowsByUser: Record<string, Array<{ shiftId: string; date: string; startTime: string; endTime: string }>> = {};

  for (const shift of shifts) {
    for (const assignment of shift.assignments) {
      if (!rowsByUser[assignment.user_id]) rowsByUser[assignment.user_id] = [];
      rowsByUser[assignment.user_id].push({
        shiftId: shift.id,
        date: shift.date,
        startTime: shift.start_time,
        endTime: shift.end_time,
      });
    }
  }

  for (const rows of Object.values(rowsByUser)) {
    const ordered = [...rows].sort((a, b) => {
      if (a.date !== b.date) return a.date.localeCompare(b.date);
      if (a.startTime !== b.startTime) return a.startTime.localeCompare(b.startTime);
      return a.endTime.localeCompare(b.endTime);
    });
    for (let index = 0; index < ordered.length; index += 1) {
      const current = ordered[index];
      const currentDate = parseIsoDate(current.date);
      for (let nextIndex = index + 1; nextIndex < ordered.length; nextIndex += 1) {
        const candidate = ordered[nextIndex];
        const candidateDate = parseIsoDate(candidate.date);
        if (candidateDate.getTime() - currentDate.getTime() > 24 * 60 * 60 * 1000) break;
        if (
          overlapsMinutes(
            timeToMinutes(current.startTime),
            timeToMinutes(current.endTime) <= timeToMinutes(current.startTime)
              ? timeToMinutes(current.endTime) + 24 * 60
              : timeToMinutes(current.endTime),
            timeToMinutes(candidate.startTime),
            timeToMinutes(candidate.endTime) <= timeToMinutes(candidate.startTime)
              ? timeToMinutes(candidate.endTime) + 24 * 60
              : timeToMinutes(candidate.endTime),
          ) &&
          current.date === candidate.date
        ) {
          ids.add(current.shiftId);
          ids.add(candidate.shiftId);
        }
      }
    }
  }

  return ids;
}

type AppliedTimetableBoardProps = {
  weekDays: Array<{ iso: string; title: string; caption: string }>;
  entriesByDate: Record<string, AppliedTimetableLayoutEntry[]>;
  warningEntriesByDate: Record<string, DayWarningEntry[]>;
  timeSlots: number[];
  startMinutes: number;
  todayIso: string;
  compact?: boolean;
  t: (key: string, params?: Record<string, string | number>) => string;
};

function AppliedShiftCard({
  entry,
  t,
}: {
  entry: AppliedTimetableEntry;
  t: (key: string, params?: Record<string, string | number>) => string;
}) {
  const tone = positionTone(entry.positionLabel);

  return (
    <div
      className={`rounded-[1rem] border px-4 py-4 shadow-[0_10px_24px_rgba(15,23,42,0.04)] ${
        entry.isConflict ? "border-red-200 bg-red-50/90" : entry.isOpen ? "border-red-200 bg-red-50/85" : "border-[var(--color-divider)] bg-white"
      }`}
      style={{
        boxShadow: `inset 4px 0 0 ${entry.isConflict ? "#ef4444" : entry.isOpen ? "#ef4444" : tone.accent}`,
        backgroundColor: entry.isConflict
          ? "rgba(254, 242, 242, 0.96)"
          : entry.isOpen
            ? "rgba(254, 242, 242, 0.9)"
            : hexToRgba(tone.accent, 0.11),
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-lg font-semibold text-[var(--color-heading)]">
          {formatTime(entry.startTime)}-{formatTime(entry.endTime)}
        </p>
        {entry.isConflict ? (
          <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-red-700">
            {t("schedule.conflict")}
          </span>
        ) : null}
      </div>
      <p className={`mt-2 text-sm font-semibold ${entry.isOpen ? "text-red-700" : tone.text}`}>{entry.positionLabel}</p>
      <p className="mt-2 text-sm leading-5 text-[var(--color-heading)]">{entry.metaLabel}</p>
    </div>
  );
}

function PreviewEditableShiftCard({
  entry,
  onEdit,
  onDelete,
}: {
  entry: PreviewEditableEntry;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const tone = positionTone(entry.positionLabel);

  return (
    <div
      className="rounded-[1rem] border border-[var(--color-divider)] px-4 py-4 shadow-[0_10px_24px_rgba(15,23,42,0.04)]"
      style={{
        boxShadow: `inset 4px 0 0 ${tone.accent}`,
        backgroundColor: hexToRgba(tone.accent, 0.11),
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-lg font-semibold text-[var(--color-heading)]">
            {formatTime(entry.startTime)}-{formatTime(entry.endTime)}
          </p>
          <p className={`mt-2 text-sm font-semibold ${tone.text}`}>{entry.positionLabel}</p>
          <p className="mt-2 text-sm leading-5 text-[var(--color-heading)]">{entry.assigned_user_name}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button size="sm" variant="secondary" className="h-8 px-2.5" onClick={onEdit}>
            <Pencil className="size-4" />
          </Button>
          <Button size="sm" variant="secondary" className="h-8 px-2.5 text-[var(--color-danger)] hover:text-[var(--color-danger)]" onClick={onDelete}>
            <Trash2 className="size-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

function PreviewCardsBoard({
  weekDays,
  entriesByDate,
  warningEntriesByDate,
  todayIso,
  t,
  onCreate,
  onEdit,
  onDelete,
}: {
  weekDays: Array<{ iso: string; title: string; caption: string }>;
  entriesByDate: Record<string, PreviewEditableEntry[]>;
  warningEntriesByDate: Record<string, DayWarningEntry[]>;
  todayIso: string;
  t: (key: string, params?: Record<string, string | number>) => string;
  onCreate: (dayIso: string) => void;
  onEdit: (entry: PreviewEditableEntry) => void;
  onDelete: (entry: PreviewEditableEntry) => void;
}) {
  const [openWarningDay, setOpenWarningDay] = useState<string | null>(null);

  return (
    <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
      {weekDays.map((day) => {
        const entries = entriesByDate[day.iso] ?? [];
        const warningEntries = warningEntriesByDate[day.iso] ?? [];
        const isWarningOpen = openWarningDay === day.iso;

        return (
          <div
            key={`preview-cards-${day.iso}`}
            className={`rounded-[1.2rem] border border-[var(--color-divider)] p-3 ${
              day.iso === todayIso ? "bg-[rgba(47,111,237,0.05)]" : "bg-white"
            }`}
          >
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-[var(--color-heading)]">{day.title}</p>
                <p className="text-xs text-[var(--color-text-muted)]">{day.caption}</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="rounded-full bg-[var(--color-surface-muted)] px-2 py-0.5 text-[11px] font-semibold text-[var(--color-text-muted)]">
                  {entries.length}
                </span>
                <DayWarningPopover
                  warningEntries={warningEntries}
                  isOpen={isWarningOpen}
                  onToggle={() => setOpenWarningDay(isWarningOpen ? null : day.iso)}
                  t={t}
                  buttonClassName="inline-flex size-6 items-center justify-center rounded-full border border-amber-200 bg-amber-50 text-amber-700 transition hover:bg-amber-100"
                />
                <Button size="sm" variant="secondary" className="h-8 px-2.5" onClick={() => onCreate(day.iso)}>
                  <Plus className="size-4" />
                </Button>
              </div>
            </div>

            {entries.length ? (
              <div className="space-y-3">
                {entries.map((entry) => (
                  <PreviewEditableShiftCard
                    key={`preview-entry-${entry.overrideId}`}
                    entry={entry}
                    onEdit={() => onEdit(entry)}
                    onDelete={() => onDelete(entry)}
                  />
                ))}
              </div>
            ) : (
              <div className="rounded-[1rem] border border-dashed border-[var(--color-border)] px-4 py-6 text-sm text-[var(--color-text-muted)]">
                {t("schedule.no_shifts_this_day")}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function AppliedCardsBoard({
  weekDays,
  entriesByDate,
  warningEntriesByDate,
  todayIso,
  t,
}: {
  weekDays: Array<{ iso: string; title: string; caption: string }>;
  entriesByDate: Record<string, AppliedTimetableEntry[]>;
  warningEntriesByDate: Record<string, DayWarningEntry[]>;
  todayIso: string;
  t: (key: string, params?: Record<string, string | number>) => string;
}) {
  const [openWarningDay, setOpenWarningDay] = useState<string | null>(null);

  return (
    <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
      {weekDays.map((day) => {
        const entries = (entriesByDate[day.iso] ?? []).filter((entry) => !entry.isOpen);
        const warningEntries = warningEntriesByDate[day.iso] ?? [];
        const isWarningOpen = openWarningDay === day.iso;

        return (
          <div
            key={`cards-${day.iso}`}
            className={`rounded-[1.2rem] border border-[var(--color-divider)] p-3 ${
              day.iso === todayIso ? "bg-[rgba(47,111,237,0.05)]" : "bg-white"
            }`}
          >
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-[var(--color-heading)]">{day.title}</p>
                <p className="text-xs text-[var(--color-text-muted)]">{day.caption}</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="rounded-full bg-[var(--color-surface-muted)] px-2 py-0.5 text-[11px] font-semibold text-[var(--color-text-muted)]">
                  {entries.length}
                </span>
                <DayWarningPopover
                  warningEntries={warningEntries}
                  isOpen={isWarningOpen}
                  onToggle={() => setOpenWarningDay(isWarningOpen ? null : day.iso)}
                  t={t}
                  buttonClassName="inline-flex size-6 items-center justify-center rounded-full border border-amber-200 bg-amber-50 text-amber-700 transition hover:bg-amber-100"
                />
              </div>
            </div>

            {entries.length ? (
              <div className="space-y-3">
                {entries.map((entry) => (
                  <AppliedShiftCard key={`cards-entry-${entry.key}`} entry={entry} t={t} />
                ))}
              </div>
            ) : (
              <div className="rounded-[1rem] border border-dashed border-[var(--color-border)] px-4 py-6 text-sm text-[var(--color-text-muted)]">
                {t("schedule.no_shifts_this_day")}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function AppliedTimetableBoard({
  weekDays,
  entriesByDate,
  warningEntriesByDate,
  timeSlots,
  startMinutes,
  todayIso,
  compact = false,
  t,
}: AppliedTimetableBoardProps) {
  const [openWarningDay, setOpenWarningDay] = useState<string | null>(null);
  const rowHeight = compact ? 30 : 36;
  const timeColumnWidth = compact ? 50 : 56;
  const laneWidth = compact ? 56 : 64;
  const dayBaseWidth = compact ? 56 : 64;
  const boardHeight = Math.max((timeSlots.length - 1) * rowHeight, rowHeight);
  const dayHeaderClass = compact ? "px-3 py-3" : "px-4 py-4";
  const visibleEntriesByDate = Object.fromEntries(
    weekDays.map((day) => [day.iso, entriesByDate[day.iso] ?? []]),
  ) as Record<string, AppliedTimetableLayoutEntry[]>;
  const dayLaneCounts = weekDays.map((day) =>
    Math.max(1, ...(visibleEntriesByDate[day.iso] ?? []).map((entry) => entry.laneCount)),
  );
  const dayWidths = dayLaneCounts.map((count) => Math.max(dayBaseWidth, count * laneWidth + Math.max(0, count - 1) * 1 + 2));
  const gridTemplateColumns = `${timeColumnWidth}px ${dayWidths.map((width) => `${width}px`).join(" ")}`;
  const boardMinWidth = timeColumnWidth + dayWidths.reduce((sum, width) => sum + width, 0);

  return (
    <div className="overflow-x-auto overflow-y-hidden">
      <div style={{ minWidth: boardMinWidth, width: "max-content" }}>
        <div
          className="sticky top-0 z-30 grid bg-white"
          style={{ gridTemplateColumns }}
        >
          <div className="sticky left-0 z-40 border-r border-b border-[var(--color-divider)] bg-white" />
          {weekDays.map((day) => {
            const warningEntries = warningEntriesByDate[day.iso] ?? [];
            const isWarningOpen = openWarningDay === day.iso;
            return (
            <div
              key={`header-${day.iso}`}
              className={`relative border-b border-r border-[var(--color-divider)] ${dayHeaderClass} ${day.iso === todayIso ? "bg-[rgba(47,111,237,0.05)]" : "bg-white"}`}
            >
              <div className="pr-8">
                <p className={`font-bold uppercase tracking-[0.12em] text-[var(--color-text-muted)] ${compact ? "text-[11px]" : "text-[12px]"}`}>{day.title}</p>
              </div>
              <div className="absolute right-3 top-3">
                <DayWarningPopover
                  warningEntries={warningEntries}
                  isOpen={isWarningOpen}
                  onToggle={() => setOpenWarningDay(isWarningOpen ? null : day.iso)}
                  t={t}
                  buttonClassName="inline-flex size-6 items-center justify-center rounded-full border border-amber-200 bg-amber-50 text-amber-700 transition hover:bg-amber-100"
                />
              </div>
              <p className={`mt-1 font-black tracking-[-0.04em] text-[var(--color-heading)] ${compact ? "text-lg" : "text-2xl"}`}>
                {compact ? day.caption.replace(".", "/") : day.caption.split(".")[0]}
              </p>
            </div>
          )})}
        </div>

        <div
          className="grid"
          style={{ gridTemplateColumns }}
        >
          <div className="sticky left-0 z-20 border-r border-[var(--color-divider)] bg-white">
            <div className="relative" style={{ height: boardHeight }}>
              {timeSlots.map((slot, index) => {
                const top = index * rowHeight;
                const hourLabel = `${`${Math.floor(slot / 60)}`.padStart(2, "0")}:${`${slot % 60}`.padStart(2, "0")}:00`;
                return (
                  <div key={`time-${slot}`} className="absolute inset-x-0" style={{ top }}>
                    <div className="border-t border-[var(--color-divider)]" />
                    {index < timeSlots.length - 1 ? (
                      <span className={`absolute left-2 top-1 ${compact ? "text-[10px]" : "text-xs"} font-semibold text-[var(--color-text-muted)]`}>
                        {formatTime(hourLabel)}
                      </span>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>

          {weekDays.map((day, dayIndex) => (
            <div
              key={`column-${day.iso}`}
              className={`relative min-w-0 border-r border-[var(--color-divider)] ${day.iso === todayIso ? "bg-[rgba(47,111,237,0.04)]" : "bg-white"}`}
              style={{ height: boardHeight }}
            >
              {timeSlots.map((slot, index) => (
                <div
                  key={`line-${day.iso}-${slot}`}
                  className="absolute inset-x-0 border-t border-[var(--color-divider)]"
                  style={{ top: index * rowHeight }}
                />
              ))}

              <div
                className="absolute inset-0 grid px-0.5"
                style={{
                  gridTemplateColumns: `repeat(${dayLaneCounts[dayIndex]}, ${laneWidth}px)`,
                  gridTemplateRows: `repeat(${Math.max(timeSlots.length - 1, 1)}, ${rowHeight}px)`,
                  columnGap: "1px",
                  rowGap: "0px",
                }}
              >
                {visibleEntriesByDate[day.iso].map((entry) => {
                  const tone = positionTone(entry.positionLabel);
                  const namesLabel = entry.assignedNames.map((name) => name.split(" ")[0]).join("\n");
                  const backgroundColor = entry.isConflict
                    ? "rgba(254, 242, 242, 0.98)"
                    : entry.isOpen
                      ? "rgba(254, 242, 242, 0.94)"
                      : hexToRgba(tone.accent, 0.24);
                  const borderColor = entry.isConflict ? "#ef4444" : entry.isOpen ? "#fca5a5" : hexToRgba(tone.accent, 0.38);
                  const rowStart = Math.max(1, Math.round((entry.startMinutes - startMinutes) / 60) + 1);
                  const rowSpan = Math.max(1, Math.round(entry.durationMinutes / 60) + 1);
                  const repeatedLabelCount = Math.max(1, rowSpan);

                  return (
                    <div
                      key={entry.key}
                      style={{
                        gridColumn: `${entry.lane + 1} / span 1`,
                        gridRow: `${rowStart} / span ${rowSpan}`,
                      }}
                      >
                      <div
                        className={`relative flex h-full w-full flex-col rounded-none border px-1 py-0 ${compact ? "gap-0.5" : "gap-1"}`}
                        style={{
                          backgroundColor,
                          borderColor,
                        }}
                      >
                        {entry.isConflict ? (
                          <span className="self-start rounded-full bg-red-100 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.08em] text-red-700">
                            {t("schedule.conflict")}
                          </span>
                        ) : null}
                        {entry.isOpen ? (
                          <p className={`whitespace-normal font-semibold text-red-700 ${compact ? "text-[10px] leading-3" : "text-[11px] leading-3.5"}`}>
                            {entry.positionLabel}{"\n"}{entry.metaLabel}
                          </p>
                        ) : (
                          <div
                            className="grid h-full items-stretch"
                            style={{ gridTemplateRows: `repeat(${repeatedLabelCount}, minmax(0, 1fr))` }}
                          >
                            {Array.from({ length: repeatedLabelCount }).map((_, labelIndex) => (
                              <p
                                key={`${entry.key}-label-${labelIndex}`}
                                className={`flex items-center whitespace-pre-line font-semibold text-[var(--color-heading)] ${compact ? "text-[9px] leading-3" : "text-[10px] leading-3.5"}`}
                              >
                                {namesLabel || t("schedule.assigned_label")}
                              </p>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}


type RequestDraft = {

  shiftId: string | null;

  requestType: "pickup" | "swap";

  requesterAssignmentId: string;

  targetAssignmentId: string;

  note: string;

};

type PreviewEditableEntry = {
  overrideId: string;
  date: string;
  day_of_week: number;
  location_id: string;
  startTime: string;
  endTime: string;
  required_role: "ADMIN" | "MANAGER" | "STAFF";
  staff_position?: string | null;
  assigned_user_id: string;
  assigned_user_name: string;
  positionLabel: string;
};

type PreviewEditorModalState = {
  mode: "create" | "edit";
  dayIso: string;
  dayIndex: number;
  overrideId?: string;
  userId: string;
  startTime: string;
  endTime: string;
};

type TimesheetModalState =
  | {
      mode: "shift";
      shift: StaffShiftCard;
      workDate: string;
      assignmentStatus: StaffShiftCard["assignments"][number]["status"] | null;
    }
  | {
      mode: "extra";
      workDate: string;
    };

type TimesheetFormState = {
  arrived_at: string;
  left_at: string;
  note: string;
};

type ReviewModalState = {
  entry: TimesheetEntry;
  arrived_at: string;
  left_at: string;
  review_note: string;
};

function toTimeInput(value: string): string {
  return value.slice(0, 5);
}

function toApiTime(value: string): string {
  return value.length === 5 ? `${value}:00` : value;
}

function timesheetStatusClass(status: TimesheetEntry["status"]) {
  if (status === "approved") return "bg-emerald-50 text-emerald-700";
  if (status === "corrected") return "bg-sky-50 text-sky-700";
  if (status === "rejected") return "bg-red-50 text-red-700";
  return "bg-amber-50 text-amber-700";
}

function workDateLabel(value: string): string {
  const [year, month, day] = value.split("-");
  return `${day}.${month}.${year}`;
}

function latestTimesheet(entries: TimesheetEntry[]): TimesheetEntry | undefined {
  return [...entries].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];
}



export function SchedulePage() {
  const { t, lang } = useLanguage();

   const { token, me } = useAuth();
   const toast = useToast();

   const queryClient = useQueryClient();



  const effectiveRoles = useMemo(() => {

    const directRole = me?.role ? [me.role] : [];

    const membershipRoles = (me?.memberships ?? []).map((item) => item.role);

    return Array.from(new Set([...directRole, ...membershipRoles]));

  }, [me]);

  const isStaff = effectiveRoles.includes("STAFF");

  const isManagerView = effectiveRoles.includes("ADMIN") || effectiveRoles.includes("MANAGER");
  const canEditOwnAvailability = effectiveRoles.includes("STAFF") || effectiveRoles.includes("MANAGER");
  const isADMIN = effectiveRoles.includes("ADMIN");
  const todayDayIndex = (() => {
    const day = new Date().getDay();
    return day === 0 ? 6 : day - 1;
  })();



  const [weekStart, setWeekStart] = useState(getMonday());
  const [selectedDayIndex, setSelectedDayIndex] = useState(todayDayIndex);

  const [locationFilter, setLocationFilter] = useState("");
  const [staffScope, setStaffScope] = useState<"my" | "team">("team");

  const [requestDraft, setRequestDraft] = useState<RequestDraft>({

    shiftId: null,

    requestType: "pickup",

    requesterAssignmentId: "",

    targetAssignmentId: "",

    note: "",

  });

  const [availabilityDraft, setAvailabilityDraft] = useState<{

    slots: AvailabilityPreferenceSlot[];

  }>({

    slots: [],

  });

  const [previewData, setPreviewData] = useState<SchedulePreview | null>(null);
  const [scheduleStage, setScheduleStage] = useState<"idle" | "preview" | "applied">("idle");
  const [bulkDay, setBulkDay] = useState("0");
  const [mobileAppliedView, setMobileAppliedView] = useState<AppliedReadOnlyViewMode>("cards");
  const [previewEditorModal, setPreviewEditorModal] = useState<PreviewEditorModalState | null>(null);
  const [timesheetModal, setTimesheetModal] = useState<TimesheetModalState | null>(null);
  const [timesheetForm, setTimesheetForm] = useState<TimesheetFormState>({ arrived_at: "11:00", left_at: "22:00", note: "" });
  const [reviewModal, setReviewModal] = useState<ReviewModalState | null>(null);
  const weekEnd = shiftWeek(weekStart, 6);
  const dayShortNames = useMemo(() => [t("days.mon"), t("days.tue"), t("days.wed"), t("days.thu"), t("days.fri"), t("days.sat"), t("days.sun")], [t]);
  const dayOptions = useMemo(() => dayShortNames.map((label, index) => ({ label, value: String(index) })), [dayShortNames]);
  const statusText = (status: TimesheetEntry["status"]) => {
    if (status === "approved") return t("schedule.status_approved");
    if (status === "corrected") return t("schedule.status_corrected");
    if (status === "rejected") return t("schedule.status_rejected");
    return t("schedule.status_pending");
  };
  const deltaText = (shift: Shift | null, entry: TimesheetEntry) => {
    if (!shift || entry.is_restricted_entry) return t("schedule.extra_entry");
    const plannedMinutes = durationMinutes(shift.start_time, shift.end_time);
    const reportedMinutes = durationMinutes(entry.arrived_at, entry.left_at);
    const deltaMinutes = reportedMinutes - plannedMinutes;
    if (deltaMinutes === 0) return t("schedule.on_time");
    return formatDurationDelta(deltaMinutes);
  };



  const locationsQuery = useQuery({

    queryKey: ["locations"],

    queryFn: () => api.listLocations(token!),

    enabled: Boolean(token),

  });

  const usersQuery = useQuery({

    queryKey: ["users"],

    queryFn: () => api.listUsers(token!),

    enabled: Boolean(token) && isManagerView,

  });

  const locationMembersQuery = useQuery({

    queryKey: ["location-members", locationFilter],

    queryFn: () => api.listLocationMembers(token!, locationFilter),

    enabled: Boolean(token) && isManagerView && Boolean(locationFilter),

  });

  const shiftsQuery = useQuery({

    queryKey: ["shifts", weekStart],

    queryFn: () => api.listShifts(token!, weekStart),

    enabled: Boolean(token) && isManagerView,

  });

  const staffCalendarQuery = useQuery({

    queryKey: ["staffShifts", weekStart, "team"],

    queryFn: () => api.listStaffShifts(token!, weekStart, "team"),

    enabled: Boolean(token) && isStaff,

  });

  const myStaffCalendarQuery = useQuery({

    queryKey: ["staffShifts", weekStart, "my"],

    queryFn: () => api.listStaffShifts(token!, weekStart, "my"),

    enabled: Boolean(token) && isStaff,

  });

  const myTimesheetsQuery = useQuery({

    queryKey: ["timesheets", "my", weekStart, weekEnd],

    queryFn: () => api.listTimesheets(token!, { scope: "my", start_date: weekStart, end_date: weekEnd }),

    enabled: Boolean(token) && isStaff,

  });

  const pendingTimesheetsQuery = useQuery({

    queryKey: ["timesheets", "pending", weekStart, weekEnd],

    queryFn: () => api.listTimesheets(token!, { scope: "pending", start_date: weekStart, end_date: weekEnd }),

    enabled: Boolean(token) && isManagerView,

  });

  const availabilityQuery = useQuery({

      queryKey: ["availability", weekStart],

      queryFn: () => api.getAvailability(token!, weekStart),

      enabled: Boolean(token) && canEditOwnAvailability,

    });

  const myRequestsQuery = useQuery({

    queryKey: ["shiftRequests", "my"],

    queryFn: () => api.listShiftRequests(token!, "my"),

    enabled: Boolean(token) && isStaff,

  });

  const incomingRequestsQuery = useQuery({

    queryKey: ["shiftRequests", "incoming"],

    queryFn: () => api.listShiftRequests(token!, "incoming"),

    enabled: Boolean(token) && isManagerView,

  });

  const weeklyOverridesQuery = useQuery({
    queryKey: ["weekly-overrides", weekStart],
    queryFn: () => api.listWeeklyOverrides(token!, weekStart),
    enabled: Boolean(token) && isManagerView,
    placeholderData: (previous) => previous,
  });
  const teamAvailabilityQuery = useQuery({
    queryKey: ["team-availability-summary", weekStart],
    queryFn: () => api.getTeamAvailabilitySummary(token!, weekStart),
    enabled: Boolean(token) && isManagerView,
  });

  const weekDays = useMemo(
    () =>
      getWeekDays(weekStart).map((day, index) => ({
        ...day,
        title: dayShortNames[index] ?? day.title,
      })),
    [dayShortNames, weekStart],
  );
  const weekRangeCompactLabel = useMemo(() => formatWeekRangeCompact(weekStart), [weekStart]);
  const todayIso = new Date().toISOString().slice(0, 10);
  const selectedDay = weekDays[selectedDayIndex] ?? weekDays[0];
  const mobileAppliedViewStorageKey = useMemo(
    () => (me?.id ? `schedule:applied-view:${me.id}:${locationFilter || "default"}` : null),
    [locationFilter, me?.id],
  );



  useEffect(() => {
    if (!locationFilter && locationsQuery.data?.length) {
      setLocationFilter(locationsQuery.data[0].id);
      return;
    }
    if (locationFilter && !(locationsQuery.data ?? []).some((item) => item.id === locationFilter)) {
      setLocationFilter("");
    }
  }, [locationFilter, locationsQuery.data]);

  useEffect(() => {
    if (typeof window === "undefined" || !mobileAppliedViewStorageKey) return;
    const savedView = window.localStorage.getItem(mobileAppliedViewStorageKey);
    if (savedView === "cards" || savedView === "timetable") {
      setMobileAppliedView(savedView);
      return;
    }
    setMobileAppliedView("cards");
  }, [mobileAppliedViewStorageKey]);

  useEffect(() => {
    if (typeof window === "undefined" || !mobileAppliedViewStorageKey) return;
    window.localStorage.setItem(mobileAppliedViewStorageKey, mobileAppliedView);
  }, [mobileAppliedView, mobileAppliedViewStorageKey]);



  useEffect(() => {

    if (!availabilityQuery.data) {

      setAvailabilityDraft({

        slots: [],

      });

      return;

    }



    setAvailabilityDraft({

      slots: availabilityQuery.data.slots.map((slot) => ({

        day_of_week: slot.day_of_week,

        start_time: slot.start_time,

        end_time: slot.end_time,

        is_available: slot.is_available,

      })),

    });

  }, [availabilityQuery.data]);



  useEffect(() => {
    setScheduleStage("idle");
    setPreviewData(null);
    setPreviewEditorModal(null);
  }, [weekStart, locationFilter]);

  const freezeAppliedWeekForPreview = async () => {
    if (!token) {
      throw new Error("Missing auth token.");
    }
    if (!locationFilter) {
      throw new Error("Select a location before editing.");
    }
    await api.freezeAppliedPreview(token, weekStart, locationFilter);
  };

  const materializePreviewForEditing = async () => {
    if (!token) {
      throw new Error("Missing auth token.");
    }
    if (!locationFilter) {
      throw new Error("Select a location before generating.");
    }
    await api.materializePreview(token, { week_start: weekStart, location_id: locationFilter });
  };


  const previewMutation = useMutation({
    mutationFn: async ({
      resetOverrides = false,
      mode = "generate",
    }: {
      resetOverrides?: boolean;
      mode?: "generate" | "regenerate" | "edit-from-applied";
    } = {}) => {
      if (mode === "edit-from-applied") {
        await freezeAppliedWeekForPreview();
        return { preview: null, mode };
      }
      if (resetOverrides && locationFilter) {
        const existingOverrides = await api.listWeeklyOverrides(token!, weekStart);
        const remainingOverrides = existingOverrides.filter((item) => item.location_id !== locationFilter);
        await api.putWeeklyOverrides(token!, weekStart, remainingOverrides);
      }
      const preview = await api.previewSchedule(token!, weekStart, locationFilter || undefined);
      await materializePreviewForEditing();
      return { preview, mode };
    },
    onSuccess: async ({ preview, mode }) => {
      setPreviewData(preview);
      setPreviewEditorModal(null);
      await weeklyOverridesQuery.refetch();
      setScheduleStage("preview");
      if (mode === "edit-from-applied") {
        toast.info(t("schedule.edit_mode_enabled"), t("schedule.edit_mode_loaded"));
        return;
      }
      toast.success(mode === "regenerate" ? t("schedule.regenerated") : t("schedule.generated"));
    },
    onError: (error) => {
      toast.error(t("schedule.generate_failed"), error instanceof Error ? error.message : undefined);
    },
  });
  const applyMutation = useMutation({
    mutationFn: () => api.applySchedule(token!, weekStart, locationFilter || undefined),

    onSuccess: (data) => {
      setPreviewData(data);
      setScheduleStage("applied");
      setPreviewEditorModal(null);
      toast.success(t("schedule.applied"), t("schedule.applied_body"));
      void queryClient.invalidateQueries({ queryKey: ["shifts", weekStart] });
      void queryClient.invalidateQueries({ queryKey: ["staffShifts"] });

      void queryClient.invalidateQueries({ queryKey: ["availability", weekStart] });
      void queryClient.invalidateQueries({ queryKey: ["weekly-overrides", weekStart] });

    },
    onError: (error) => {
      toast.error(t("schedule.apply_failed"), error instanceof Error ? error.message : undefined);
    },

  });

  const patchPreviewEditMutation = useMutation({

    mutationFn: (payload: {

      shift_key: string;

      location_id?: string;

      day_of_week?: number;

      start_time?: string;

      end_time?: string;

      required_role?: "ADMIN" | "MANAGER" | "STAFF";

      staff_position?: string | null;

      required_count?: number;

      assigned_user_id?: string | null;
      action?: "upsert" | "delete" | "create";

    }) =>

      api.patchPreviewEdit(token!, {

        week_start: weekStart,

        ...payload,

      }),

    onSuccess: async () => {
      await weeklyOverridesQuery.refetch();
      void queryClient.invalidateQueries({ queryKey: ["weekly-overrides", weekStart] });
      toast.success(t("schedule.preview_updated"));
    },

  });

  const bulkClearDayMutation = useMutation({
    mutationFn: async ({ dayIndex }: { dayIndex?: number } = {}) => {
      if (!locationFilter) return 0;
      const effectiveDayIndex = dayIndex ?? Number(bulkDay);
      const dayOverrides = previewOverridesForLocation.filter((item) => item.day_of_week === effectiveDayIndex);
      const payloads = dayOverrides.map((item) =>
        api.patchPreviewEdit(token!, {
          week_start: weekStart,
          action: "delete",
          shift_key: `override:${item.id}`,
        }),
      );
      await Promise.all(payloads);
      return { deletedCount: payloads.length, dayIndex: effectiveDayIndex };
    },
    onSuccess: async (result) => {
      const deletedCount = typeof result === "number" ? result : result.deletedCount;
      const clearedDayIndex = typeof result === "number" ? Number(bulkDay) : result.dayIndex;
      await weeklyOverridesQuery.refetch();
      void queryClient.invalidateQueries({ queryKey: ["weekly-overrides", weekStart] });
      toast.info(
        deletedCount
          ? t("schedule.day_cleared", { count: deletedCount, day: dayOptions[clearedDayIndex]?.label ?? t("schedule.selected_day") })
          : t("schedule.nothing_to_clear"),
      );
    },
    onError: (error) => {
      toast.error(t("schedule.clear_day_failed"), error instanceof Error ? error.message : undefined);
    },
  });
  const saveAvailabilityMutation = useMutation({

    mutationFn: () =>

      api.putAvailability(token!, weekStart, {

        desired_hours: availabilityDesiredHoursForApi,

        slots: availabilityDraft.slots,

      }),

    onSuccess: () => {
      toast.success(t("schedule.availability_saved"));

      void queryClient.invalidateQueries({ queryKey: ["availability", weekStart] });

    },

  });

  const createTimesheetMutation = useMutation({
    mutationFn: async ({ modal, form }: { modal: TimesheetModalState; form: TimesheetFormState }) => {
      if (modal.mode === "shift" && modal.assignmentStatus === "in_shift") {
        await api.endShift(token!, modal.shift.shift_id);
      }
      return api.createTimesheet(token!, {
        shift_id: modal.mode === "shift" ? modal.shift.shift_id : null,
        work_date: modal.mode === "extra" ? modal.workDate : null,
        arrived_at: toApiTime(form.arrived_at),
        left_at: toApiTime(form.left_at),
        note: form.note.trim() || null,
      });
    },
    onSuccess: () => {
      setTimesheetModal(null);
      setTimesheetForm({ arrived_at: "11:00", left_at: "22:00", note: "" });
      toast.success(t("schedule.hours_report_submitted"), t("schedule.hours_report_pending_review"));
      void queryClient.invalidateQueries({ queryKey: ["timesheets"] });
      void queryClient.invalidateQueries({ queryKey: ["staffShifts"] });
      void queryClient.invalidateQueries({ queryKey: ["shifts", weekStart] });
      void queryClient.invalidateQueries({ queryKey: ["owner-dashboard-inline"] });
      void queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
    onError: (error) => {
      toast.error(t("schedule.submit_hours_failed"), error instanceof Error ? error.message : undefined);
    },
  });

  const reviewTimesheetMutation = useMutation({
    mutationFn: ({ entry, payload }: { entry: TimesheetEntry; payload: TimesheetReviewAction }) =>
      api.reviewTimesheet(token!, entry.id, payload),
    onSuccess: (_, variables) => {
      setReviewModal(null);
      const label =
        variables.payload.action === "approve"
          ? t("schedule.status_approved")
          : variables.payload.action === "reject"
            ? t("schedule.status_rejected")
            : t("schedule.status_corrected");
      toast.success(t("schedule.timesheet_reviewed", { status: label.toLowerCase() }));
      void queryClient.invalidateQueries({ queryKey: ["timesheets"] });
      void queryClient.invalidateQueries({ queryKey: ["owner-dashboard-inline"] });
      void queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
    onError: (error) => {
      toast.error(t("schedule.review_timesheet_failed"), error instanceof Error ? error.message : undefined);
    },
  });

  const approveVisibleTimesheetsMutation = useMutation({
    mutationFn: async (entries: TimesheetEntry[]) => {
      await Promise.all(entries.map((entry) => api.reviewTimesheet(token!, entry.id, { action: "approve" })));
      return entries.length;
    },
    onSuccess: (count) => {
      toast.success(t("schedule.timesheets_approved"), t("schedule.timesheets_approved_count", { count }));
      void queryClient.invalidateQueries({ queryKey: ["timesheets"] });
      void queryClient.invalidateQueries({ queryKey: ["owner-dashboard-inline"] });
      void queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
    onError: (error) => {
      toast.error(t("schedule.approve_visible_failed"), error instanceof Error ? error.message : undefined);
    },
  });

  const createShiftRequestMutation = useMutation({

    mutationFn: (payload: {

      shift_id: string;

      request_type: "pickup" | "swap";

      requester_assignment_id?: string | null;

      target_assignment_id?: string | null;

      note?: string | null;

    }) => api.createShiftRequest(token!, payload),

    onSuccess: () => {
      toast.success(t("schedule.request_sent"));

      setRequestDraft({ shiftId: null, requestType: "pickup", requesterAssignmentId: "", targetAssignmentId: "", note: "" });

      void queryClient.invalidateQueries({ queryKey: ["shiftRequests", "my"] });

      void queryClient.invalidateQueries({ queryKey: ["staffShifts", weekStart, staffScope] });

    },

  });

  const reviewShiftRequestMutation = useMutation({

    mutationFn: ({ requestId, action }: { requestId: string; action: "approve" | "reject" | "cancel" }) =>

      api.patchShiftRequest(token!, requestId, action),

    onSuccess: (_, variables) => {
      toast.success(t("schedule.request_action_done", { action: variables.action }));

      void queryClient.invalidateQueries({ queryKey: ["shiftRequests"] });

      void queryClient.invalidateQueries({ queryKey: ["shifts", weekStart] });

      void queryClient.invalidateQueries({ queryKey: ["staffShifts"] });

    },

  });

  const shiftsById = useMemo(() => {

    const map: Record<string, Shift> = {};

    for (const shift of shiftsQuery.data ?? []) map[shift.id] = shift;

    return map;

  }, [shiftsQuery.data]);

  const managerShifts = useMemo(() => {

    if (!locationFilter) return shiftsQuery.data ?? [];

    return (shiftsQuery.data ?? []).filter((shift) => shift.location_id === locationFilter);

  }, [locationFilter, shiftsQuery.data]);

  const memberNameById = useMemo(() => {
    const map: Record<string, string> = {};
    for (const member of locationMembersQuery.data ?? []) map[member.id] = member.full_name;
    return map;
  }, [locationMembersQuery.data]);
  const conflictingShiftIds = useMemo(() => findConflictingShiftIds(shiftsQuery.data ?? []), [shiftsQuery.data]);

  const sortedLocationMembers = useMemo(() => {
    return (locationMembersQuery.data ?? [])
      .sort((a, b) => {
        const byPosition = getPositionSortKey(a.staff_position ?? a.role) - getPositionSortKey(b.staff_position ?? b.role);
        if (byPosition !== 0) return byPosition;
        return a.full_name.localeCompare(b.full_name);
      });
  }, [locationMembersQuery.data]);

  const previewOverridesForLocation = useMemo(
    () =>
      (weeklyOverridesQuery.data ?? []).filter(
        (item) => item.location_id === locationFilter && !item.is_deleted,
      ),
    [locationFilter, weeklyOverridesQuery.data],
  );

  const previewEntriesByDate = useMemo(() => {
    const map: Record<string, PreviewEditableEntry[]> = Object.fromEntries(weekDays.map((day) => [day.iso, []]));
    for (const item of previewOverridesForLocation) {
      if (!item.assigned_user_id) continue;
      const dayIso = weekDays[item.day_of_week]?.iso;
      if (!dayIso) continue;
      const positionLabel = item.staff_position ?? item.required_role;
      map[dayIso].push({
        overrideId: item.id,
        date: dayIso,
        day_of_week: item.day_of_week,
        location_id: item.location_id,
        startTime: item.start_time,
        endTime: item.end_time,
        required_role: item.required_role,
        staff_position: item.staff_position ?? null,
        assigned_user_id: item.assigned_user_id,
        assigned_user_name: memberNameById[item.assigned_user_id] ?? t("schedule.assigned_label"),
        positionLabel,
      });
    }

    for (const day of weekDays) {
      map[day.iso] = map[day.iso].sort((a, b) => {
        const byPosition = getPositionSortKey(a.positionLabel) - getPositionSortKey(b.positionLabel);
        if (byPosition !== 0) return byPosition;
        return a.startTime.localeCompare(b.startTime);
      });
    }

    return map;
  }, [memberNameById, previewOverridesForLocation, t, weekDays]);

  const previewHoursByUser = useMemo(() => {
    const totals: Record<string, number> = {};
    for (const entries of Object.values(previewEntriesByDate)) {
      for (const entry of entries) {
        totals[entry.assigned_user_id] = (totals[entry.assigned_user_id] ?? 0) + shiftHours(entry.startTime, entry.endTime);
      }
    }
    return totals;
  }, [previewEntriesByDate]);

  const previewWarningEntriesByDate = useMemo(() => {
    const map: Record<string, DayWarningEntry[]> = Object.fromEntries(weekDays.map((day) => [day.iso, []]));

    for (const day of weekDays) {
      const buckets = new Map<string, { count: number; timeLabel: string; positionLabel: string }>();
      for (const item of previewOverridesForLocation) {
        if (item.assigned_user_id) continue;
        if (item.day_of_week !== weekDays.findIndex((candidate) => candidate.iso === day.iso)) continue;
        const positionLabel = item.staff_position ?? item.required_role;
        const key = `${item.start_time}:${item.end_time}:${positionLabel}`;
        const bucket = buckets.get(key) ?? {
          count: 0,
          timeLabel: `${formatTime(item.start_time)}-${formatTime(item.end_time)}`,
          positionLabel,
        };
        bucket.count += 1;
        buckets.set(key, bucket);
      }

      map[day.iso] = Array.from(buckets.entries())
        .map(([key, bucket]) => ({
          key,
          timeLabel: bucket.timeLabel,
          positionLabel: bucket.positionLabel,
          metaLabel: t("schedule.needed_count", { count: bucket.count }),
          tone: "missing" as const,
        }))
        .sort((a, b) => a.timeLabel.localeCompare(b.timeLabel));
    }

    return map;
  }, [previewOverridesForLocation, t, weekDays]);

  const previewVisibleIssueCount = useMemo(
    () => Object.values(previewWarningEntriesByDate).reduce((sum, entries) => sum + entries.length, 0),
    [previewWarningEntriesByDate],
  );

  const roleLegendItems = useMemo(() => {
    const values = new Map<string, string>();
    for (const member of locationMembersQuery.data ?? []) {
      const value = member.staff_position ?? member.role;
      const label = normalizePositionLegendLabel(value);
      if (label) values.set(label.toLowerCase(), label);
    }
    for (const shift of managerShifts) {
      const value = shift.staff_position ?? shift.required_role;
      const label = normalizePositionLegendLabel(value);
      if (label) values.set(label.toLowerCase(), label);
    }
    return Array.from(values.values())
      .sort((a, b) => {
        const byPosition = getPositionSortKey(a) - getPositionSortKey(b);
        if (byPosition !== 0) return byPosition;
        return a.localeCompare(b);
      })
      .map((label) => {
        const tone = positionTone(label);
        return { label, accent: tone.accent, className: tone.text };
      });
  }, [locationMembersQuery.data, managerShifts]);

  const appliedEntriesByDate = useMemo(() => {
    const map: Record<string, AppliedTimetableEntry[]> = Object.fromEntries(weekDays.map((day) => [day.iso, []]));
    for (const shift of managerShifts) {
      const startMinutes = timeToMinutes(shift.start_time);
      let endMinutes = timeToMinutes(shift.end_time);
      if (endMinutes <= startMinutes) endMinutes += 24 * 60;
      const positionLabel = shift.staff_position ?? shift.required_role;
      const assignedNames = shift.assignments.map((assignment) => memberNameById[assignment.user_id] ?? t("schedule.assigned_label"));
      const missingCount = Math.max(0, shift.required_count - shift.assignments.length);
      if (assignedNames.length) {
        map[shift.date]?.push({
          key: `shift:${shift.id}`,
          sourceShiftId: shift.id,
          date: shift.date,
          startTime: shift.start_time,
          endTime: shift.end_time,
          startMinutes,
          endMinutes,
          durationMinutes: endMinutes - startMinutes,
          positionLabel,
          assignedNames,
          assignedUserIds: shift.assignments.map((assignment) => assignment.user_id),
          metaLabel: assignedNames.join(", "),
          requiredCount: shift.required_count,
          missingCount,
          isOpen: false,
          isConflict: conflictingShiftIds.has(shift.id),
        });
      }
      if (missingCount > 0) {
        map[shift.date]?.push({
          key: `open:${shift.id}`,
          sourceShiftId: shift.id,
          date: shift.date,
          startTime: shift.start_time,
          endTime: shift.end_time,
          startMinutes,
          endMinutes,
          durationMinutes: endMinutes - startMinutes,
          positionLabel,
          assignedNames: [],
          assignedUserIds: [],
          metaLabel: t("schedule.needed_count", { count: missingCount }),
          requiredCount: shift.required_count,
          missingCount,
          isOpen: true,
          isConflict: false,
        });
      }
    }

    for (const dayIso of Object.keys(map)) {
      map[dayIso] = map[dayIso].sort((a, b) => {
        const byPosition = getPositionSortKey(a.positionLabel) - getPositionSortKey(b.positionLabel);
        if (byPosition !== 0) return byPosition;
        if (a.startMinutes !== b.startMinutes) return a.startMinutes - b.startMinutes;
        if (a.isOpen !== b.isOpen) return a.isOpen ? 1 : -1;
        return a.key.localeCompare(b.key);
      });
    }

    return map;
  }, [conflictingShiftIds, managerShifts, memberNameById, t, weekDays]);

  const appliedTimetableByDate = useMemo(() => {
    const map: Record<string, AppliedTimetableLayoutEntry[]> = {};
    for (const day of weekDays) {
      map[day.iso] = packTimetableEntries((appliedEntriesByDate[day.iso] ?? []).filter((entry) => !entry.isOpen));
    }
    return map;
  }, [appliedEntriesByDate, weekDays]);
  const appliedWarningEntriesByDate = useMemo(() => {
    const map: Record<string, DayWarningEntry[]> = {};
    for (const day of weekDays) {
      map[day.iso] = (appliedEntriesByDate[day.iso] ?? [])
        .filter((entry) => entry.isOpen)
        .map((entry) => ({
          key: entry.key,
          timeLabel: `${formatTime(entry.startTime)}-${formatTime(entry.endTime)}`,
          positionLabel: entry.positionLabel,
          metaLabel: entry.metaLabel,
        }));
    }
    return map;
  }, [appliedEntriesByDate, weekDays]);

  const appliedTimetableSlots = useMemo(() => {
    const allEntries = Object.values(appliedEntriesByDate).flat();
    const minMinutes = allEntries.length ? Math.min(...allEntries.map((item) => item.startMinutes)) : 10 * 60;
    const maxMinutes = allEntries.length ? Math.max(...allEntries.map((item) => item.endMinutes)) : 23 * 60;
    const normalizedMin = Math.min(floorHour(minMinutes), 10 * 60);
    const normalizedMax = Math.max(ceilHour(maxMinutes) + 60, 23 * 60, normalizedMin + 60);
    return Array.from({ length: (normalizedMax - normalizedMin) / 60 + 1 }, (_item, index) => normalizedMin + index * 60);
  }, [appliedEntriesByDate]);
  const appliedTimetableStartMinutes = appliedTimetableSlots[0] ?? 10 * 60;
  const selectedAppliedEntries = (appliedEntriesByDate[selectedDay?.iso ?? ""] ?? []).filter((entry) => !entry.isOpen);
  const activeMobileWarningEntriesByDate = scheduleStage === "preview"
    ? previewWarningEntriesByDate
    : scheduleStage === "applied"
      ? appliedWarningEntriesByDate
      : undefined;

  const managerAvailabilityByUserDay = useMemo(() => {
    const map: Record<string, Record<string, { desiredHours: number; windowLabel: string | null }>> = {};
    for (const item of (teamAvailabilityQuery.data ?? []) as TeamAvailabilitySummaryRow[]) {
      const byDay: Record<string, { desiredHours: number; windowLabel: string | null }> = {};
      const sourceSlots = Array.isArray(item.slots) ? item.slots : [];
      for (const day of weekDays) {
        const dayIndex = parseIsoDate(day.iso).getDay();
        const normalizedDayIndex = dayIndex === 0 ? 6 : dayIndex - 1;
        const slots = sourceSlots
          .filter((slot) => slot.is_available && slot.day_of_week === normalizedDayIndex)
          .sort((a, b) => a.start_time.localeCompare(b.start_time));
        const windowLabel = slots.length
          ? slots.map((slot) => `${formatTime(slot.start_time)}-${formatTime(slot.end_time)}`).join(", ")
          : null;
        byDay[day.iso] = {
          desiredHours: item.desired_hours,
          windowLabel,
        };
      }
      map[item.user_id] = byDay;
    }
    return map;
  }, [teamAvailabilityQuery.data, weekDays]);

  const managerAvailabilitySlotsByUserDay = useMemo(() => {
    const map: Record<string, Record<string, AvailabilityPreferenceSlot[]>> = {};
    for (const item of (teamAvailabilityQuery.data ?? []) as TeamAvailabilitySummaryRow[]) {
      const byDay: Record<string, AvailabilityPreferenceSlot[]> = {};
      const sourceSlots = Array.isArray(item.slots) ? item.slots : [];
      for (const day of weekDays) {
        const dayIndex = parseIsoDate(day.iso).getDay();
        const normalizedDayIndex = dayIndex === 0 ? 6 : dayIndex - 1;
        byDay[day.iso] = sourceSlots
          .filter((slot) => slot.is_available && slot.day_of_week === normalizedDayIndex)
          .sort((a, b) => a.start_time.localeCompare(b.start_time));
      }
      map[item.user_id] = byDay;
    }
    return map;
  }, [teamAvailabilityQuery.data, weekDays]);

  useEffect(() => {
    if (!isManagerView || !locationFilter) return;
    if (managerShifts.length > 0 && scheduleStage === "idle") {
      setScheduleStage("applied");
    }
    if (managerShifts.length === 0 && scheduleStage === "applied") {
      setScheduleStage("idle");
    }
  }, [isManagerView, locationFilter, managerShifts.length, scheduleStage]);

  const hasAppliedLocationShifts = useMemo(
    () => managerShifts.some((shift) => shift.location_id === locationFilter),
    [locationFilter, managerShifts],
  );

  const availabilityStatusForMember = (
    member: LocationMember,
    dayIso: string,
    startTime: string,
    endTime: string,
    excludeOverrideId?: string,
  ) => {
    const availableSlots = managerAvailabilitySlotsByUserDay[member.id]?.[dayIso] ?? [];
    const hasAvailability = availableSlots.length > 0;
    const fullyAvailable = availableSlots.some(
      (slot) => timeToMinutes(slot.start_time) <= timeToMinutes(startTime) && timeToMinutes(slot.end_time) >= timeToMinutes(endTime),
    );
    const hasConflict = Object.values(previewEntriesByDate)
      .flat()
      .some(
        (entry) =>
          entry.assigned_user_id === member.id &&
          entry.overrideId !== excludeOverrideId &&
          entry.date === dayIso &&
          overlapsMinutes(timeToMinutes(entry.startTime), timeToMinutes(entry.endTime), timeToMinutes(startTime), timeToMinutes(endTime)),
      );

    if (hasConflict) {
      return { rank: fullyAvailable ? 1 : 3, tone: "warning" as const, label: t("schedule.conflict_with_existing_shift") };
    }
    if (fullyAvailable) {
      return {
        rank: 0,
        tone: "ok" as const,
        label: t("schedule.available_for_selected_time", { time: `${formatTime(startTime)}-${formatTime(endTime)}` }),
      };
    }
    if (!hasAvailability) {
      return { rank: 2, tone: "muted" as const, label: t("schedule.no_submitted_availability") };
    }
    return { rank: 3, tone: "warning" as const, label: t("schedule.unavailable_for_selected_time") };
  };

  const previewEditorWorkerOptions = useMemo(() => {
    if (!previewEditorModal) return [];
    return sortedLocationMembers
      .filter((member) => member.role !== "ADMIN")
      .map((member) => {
        const availability = availabilityStatusForMember(
          member,
          previewEditorModal.dayIso,
          `${previewEditorModal.startTime}:00`,
          `${previewEditorModal.endTime}:00`,
          previewEditorModal.overrideId,
        );
        return {
          value: member.id,
          label: `${member.full_name} • ${member.staff_position ?? member.role} • ${availability.label}`,
          rank: availability.rank,
        };
      })
      .sort((a, b) => a.rank - b.rank || a.label.localeCompare(b.label));
  }, [previewEditorModal, sortedLocationMembers]);

  const selectedPreviewEditorMember = useMemo(
    () => sortedLocationMembers.find((member) => member.id === previewEditorModal?.userId) ?? null,
    [previewEditorModal?.userId, sortedLocationMembers],
  );

  const selectedPreviewEditorAvailability = useMemo(() => {
    if (!previewEditorModal || !selectedPreviewEditorMember) return null;
    return availabilityStatusForMember(
      selectedPreviewEditorMember,
      previewEditorModal.dayIso,
      `${previewEditorModal.startTime}:00`,
      `${previewEditorModal.endTime}:00`,
      previewEditorModal.overrideId,
    );
  }, [previewEditorModal, selectedPreviewEditorMember]);

  const openPreviewCreateModal = (dayIso: string) => {
    const dayIndex = weekDays.findIndex((day) => day.iso === dayIso);
    const defaultMember = sortedLocationMembers.find((member) => member.role !== "ADMIN");
    if (dayIndex < 0 || !defaultMember) return;
    setPreviewEditorModal({
      mode: "create",
      dayIso,
      dayIndex,
      userId: defaultMember.id,
      startTime: "11:00",
      endTime: "19:00",
    });
  };

  const openPreviewEditModal = (entry: PreviewEditableEntry) => {
    setPreviewEditorModal({
      mode: "edit",
      dayIso: entry.date,
      dayIndex: entry.day_of_week,
      overrideId: entry.overrideId,
      userId: entry.assigned_user_id,
      startTime: entry.startTime.slice(0, 5),
      endTime: entry.endTime.slice(0, 5),
    });
  };

  const exitPreviewMode = () => {
    setPreviewEditorModal(null);
    setPreviewData(null);
    setScheduleStage(hasAppliedLocationShifts ? "applied" : "idle");
  };

  const mySwapAssignments = useMemo(() => {

    if (!me) return [];

    const options: Array<{ label: string; value: string }> = [];

    for (const day of myStaffCalendarQuery.data ?? []) {

      for (const shift of day.shifts) {

        const mine = shift.assignments.find((item) => item.user_id === me.id);

        if (!mine) continue;

        options.push({

          value: mine.id,

          label: `${dayShortNames[day.day_of_week] ?? dayNames[day.day_of_week]} ${formatTime(shift.start_time)}-${formatTime(shift.end_time)} (${shift.location_name})`,

        });

      }

    }

    return options;

  }, [me, myStaffCalendarQuery.data]);

  const staffDaysByWeek = useMemo(() => {
    const map: Record<number, StaffCalendarDay> = {};
    for (const day of myStaffCalendarQuery.data ?? []) {
      map[day.day_of_week] = day;
    }
    return map;
  }, [myStaffCalendarQuery.data]);

  const teamAgendaByDay = useMemo(() => {
    const map: Record<
      number,
      Array<{
        shiftId: string;
        userId: string;
        userName: string;
        positionLabel: string;
        startTime: string;
        endTime: string;
        locationName: string;
        isMine: boolean;
      }>
    > = {};
    for (const day of staffCalendarQuery.data ?? []) {
      map[day.day_of_week] = day.shifts.flatMap((shift) =>
        shift.assignments.map((assignment) => ({
          shiftId: shift.shift_id,
          userId: assignment.user_id,
          userName: assignment.user_name,
          positionLabel: shift.staff_position ?? shift.required_role,
          startTime: shift.start_time,
          endTime: shift.end_time,
          locationName: shift.location_name,
          isMine: assignment.user_id === me?.id,
        })),
      );
    }
    return map;
  }, [me?.id, staffCalendarQuery.data]);

  const myTimesheetsByShiftId = useMemo(() => {
    const map: Record<string, TimesheetEntry[]> = {};
    for (const entry of myTimesheetsQuery.data ?? []) {
      if (!entry.shift_id) continue;
      if (!map[entry.shift_id]) map[entry.shift_id] = [];
      map[entry.shift_id].push(entry);
    }
    return map;
  }, [myTimesheetsQuery.data]);

  const myRestrictedTimesheetsByDate = useMemo(() => {
    const map: Record<string, TimesheetEntry[]> = {};
    for (const entry of myTimesheetsQuery.data ?? []) {
      if (!entry.is_restricted_entry) continue;
      if (!map[entry.work_date]) map[entry.work_date] = [];
      map[entry.work_date].push(entry);
    }
    return map;
  }, [myTimesheetsQuery.data]);

  const timesheetUserNameById = useMemo(() => {
    const map: Record<string, string> = {};
    for (const user of usersQuery.data ?? []) map[user.id] = user.full_name;
    for (const member of locationMembersQuery.data ?? []) map[member.id] = member.full_name;
    return map;
  }, [locationMembersQuery.data, usersQuery.data]);

  const visiblePendingTimesheets = pendingTimesheetsQuery.data ?? [];

  const availabilitySlotsByDay = useMemo(() => {
    const map: Record<number, AvailabilityPreferenceSlot[]> = {};
    for (const slot of availabilityDraft.slots) {
      if (!map[slot.day_of_week]) map[slot.day_of_week] = [];
      map[slot.day_of_week].push(slot);
    }
    return map;
  }, [availabilityDraft.slots]);

  const availabilityDesiredHours = useMemo(
    () => Math.round(availabilityDraft.slots.reduce((sum, slot) => sum + shiftHours(slot.start_time, slot.end_time), 0) * 10) / 10,
    [availabilityDraft.slots],
  );

  const availabilityDesiredHoursForApi = useMemo(() => Math.round(availabilityDesiredHours), [availabilityDesiredHours]);

  const setAvailabilityDayEnabled = (dayIndex: number, enabled: boolean) => {
    setAvailabilityDraft((current) => {
      const remaining = current.slots.filter((slot) => slot.day_of_week !== dayIndex);
      if (!enabled) return { ...current, slots: remaining };
      return {
        ...current,
        slots: [...remaining, { day_of_week: dayIndex, start_time: "11:00:00", end_time: "19:00:00", is_available: true }],
      };
    });
  };

  const updateAvailabilityDayTime = (dayIndex: number, field: "start_time" | "end_time", value: string, baseline?: AvailabilityPreferenceSlot) => {
    setAvailabilityDraft((current) => {
      const remaining = current.slots.filter((slot) => slot.day_of_week !== dayIndex);
      const nextBaseline = baseline ?? { day_of_week: dayIndex, start_time: "11:00:00", end_time: "19:00:00", is_available: true };
      return {
        ...current,
        slots: [...remaining, { ...nextBaseline, [field]: `${value}:00` }],
      };
    });
  };

  const openShiftTimesheetModal = (shift: StaffShiftCard) => {
    const ownAssignment = me ? shift.assignments.find((assignment) => assignment.user_id === me.id) : null;
    setTimesheetModal({
      mode: "shift",
      shift,
      workDate: shift.date,
      assignmentStatus: ownAssignment?.status ?? null,
    });
    setTimesheetForm({
      arrived_at: toTimeInput(shift.start_time),
      left_at: toTimeInput(shift.end_time),
      note: "",
    });
  };

  const openExtraTimesheetModal = (workDate = todayIso) => {
    setTimesheetModal({ mode: "extra", workDate });
    setTimesheetForm({ arrived_at: "11:00", left_at: "22:00", note: "" });
  };

  const availabilityCard = canEditOwnAvailability ? (
    <Card className="min-h-0 max-w-full overflow-x-hidden">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-lg">{isManagerView && !isStaff ? t("schedule.my_availability") : t("schedule.availability")}</CardTitle>
          {availabilityQuery.data?.locked_at ? <Badge className="border-amber-200 bg-amber-50 text-amber-700">{t("schedule.locked")}</Badge> : null}
        </div>
        <CardDescription>{isManagerView && !isStaff ? t("schedule.manager_availability_description") : t("schedule.availability_description")}</CardDescription>
      </CardHeader>
      <CardContent className="min-h-0 max-w-full space-y-4 overflow-y-auto overflow-x-hidden pr-1">
        <div className="grid items-end gap-2 border-b border-[var(--color-divider)] pb-3 md:grid-cols-[1fr_auto]">
          <div>
            <p className="text-[11px] uppercase tracking-[0.14em] text-[var(--color-text-muted)]">{t("schedule.hours_per_week")}</p>
            <div className="mt-1 flex items-baseline gap-2">
              <p className="text-2xl font-bold tracking-[-0.06em] text-[var(--color-heading)]">{availabilityDesiredHours.toFixed(1)}</p>
              <p className="text-sm text-[var(--color-text-muted)]">{t("schedule.derived_from_ranges")}</p>
            </div>
          </div>
          <Button size="sm" onClick={() => saveAvailabilityMutation.mutate()} disabled={saveAvailabilityMutation.isPending || Boolean(availabilityQuery.data?.locked_at)}>
            {t("common.save")}
          </Button>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          {weekDays.map((day, index) => {
            const slots = availabilitySlotsByDay[index] ?? [];
            const firstSlot = slots[0];
            const enabled = Boolean(firstSlot);
            return (
              <div key={`availability-card-${day.iso}`} className="rounded-[1rem] border border-[var(--color-border)] bg-white px-4 py-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--color-text-muted)]">{day.title}</p>
                    <p className="text-xs text-[var(--color-text-muted)]">{day.caption}</p>
                  </div>
                  <button
                    type="button"
                    disabled={Boolean(availabilityQuery.data?.locked_at)}
                    aria-pressed={enabled}
                    onClick={() => setAvailabilityDayEnabled(index, !enabled)}
                    className={`relative inline-flex h-11 w-16 items-center rounded-full p-1 transition ${enabled ? "bg-emerald-500/90" : "bg-slate-200"} disabled:opacity-40`}
                  >
                    <span className={`size-7 rounded-full bg-white shadow-sm transition ${enabled ? "translate-x-8" : "translate-x-0"}`} />
                  </button>
                </div>
                <p className="mt-2 text-xs font-medium text-[var(--color-text-muted)]">{enabled ? t("schedule.available") : t("schedule.off")}</p>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <input
                    type="time"
                    value={firstSlot ? firstSlot.start_time.slice(0, 5) : ""}
                    disabled={!enabled || Boolean(availabilityQuery.data?.locked_at)}
                    onChange={(event) => updateAvailabilityDayTime(index, "start_time", event.target.value, firstSlot)}
                    className="h-11 w-full border-0 border-b border-[var(--color-border)] bg-transparent px-0 text-base text-[var(--color-heading)] outline-none focus:border-[var(--color-primary)] disabled:text-[var(--color-text-muted)] sm:text-sm"
                  />
                  <input
                    type="time"
                    value={firstSlot ? firstSlot.end_time.slice(0, 5) : ""}
                    disabled={!enabled || Boolean(availabilityQuery.data?.locked_at)}
                    onChange={(event) => updateAvailabilityDayTime(index, "end_time", event.target.value, firstSlot)}
                    className="h-11 w-full border-0 border-b border-[var(--color-border)] bg-transparent px-0 text-base text-[var(--color-heading)] outline-none focus:border-[var(--color-primary)] disabled:text-[var(--color-text-muted)] sm:text-sm"
                  />
                </div>
              </div>
            );
          })}
        </div>

        {availabilityQuery.data?.locked_at ? <p className="text-xs text-amber-600">{t("schedule.week_locked")}</p> : null}
      </CardContent>
    </Card>
  ) : null;



  return (

    <AppShell
      title={t("schedule.title")}
      headerVariant={isManagerView ? "minimal" : "default"}
      restaurantName="Old Town"
      subtitle={isStaff ? t("schedule.subtitle.staff") : undefined}
      action={isStaff ? <div className="hidden sm:block"><Badge>{t("schedule.week_of", { date: weekStart })}</Badge></div> : undefined}
    >
      {isStaff ? (
        <div className="stagger-grid grid gap-4 2xl:h-[calc(100vh-11.5rem)] 2xl:grid-cols-[2.35fr_1fr]">
          <Card className="min-h-0 max-w-full overflow-x-hidden">
            <CardHeader className="pb-2">
              <div className="grid gap-3">
                <div className="flex items-start justify-between gap-3">
                  <CardTitle className="text-lg">{t("schedule.my_weekly_calendar")}</CardTitle>
                  <Button size="sm" variant="secondary" className="h-8 px-2.5 sm:hidden" onClick={() => openExtraTimesheetModal(weekDays.some((day) => day.iso === todayIso) ? todayIso : weekDays[0]?.iso)}>
                    <FileClock className="size-4" /> {t("schedule.report_extra_hours")}
                  </Button>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <Button size="sm" variant="secondary" className="h-8 min-w-8 rounded-none border-0 bg-transparent px-1.5 shadow-none hover:bg-transparent" onClick={() => setWeekStart((current) => shiftWeek(current, -7))}>
                    <ChevronLeft className="size-4" />
                  </Button>
                  <span className="min-w-0 flex-1 px-1 text-center text-xs font-semibold text-[var(--color-heading)] sm:text-sm">
                    {weekDays[0]?.caption} - {weekDays[6]?.caption}
                  </span>
                  <Button size="sm" variant="secondary" className="h-8 min-w-8 rounded-none border-0 bg-transparent px-1.5 shadow-none hover:bg-transparent" onClick={() => setWeekStart((current) => shiftWeek(current, 7))}>
                    <ChevronRight className="size-4" />
                  </Button>
                </div>
                <div className="hidden sm:flex sm:justify-end">
                  <Button size="sm" variant="secondary" className="h-8 rounded-none border-0 bg-transparent px-1.5 shadow-none hover:bg-transparent" onClick={() => setWeekStart((current) => shiftWeek(current, -7))}>
                    <FileClock className="size-4" /> {t("schedule.report_extra_hours")}
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="min-h-0 max-w-full overflow-x-hidden">
              <MobileDaySelector className="mb-3 2xl:hidden" weekDays={weekDays} selectedDayIndex={selectedDayIndex} onSelect={setSelectedDayIndex} />
              <div className="space-y-3 2xl:hidden">
                {(() => {
                  const dayData = staffDaysByWeek[selectedDayIndex];
                  const shifts = dayData?.shifts ?? [];
                  const teamAgenda = teamAgendaByDay[selectedDayIndex] ?? [];
                  const coworkerAgenda = teamAgenda.filter((item) => !item.isMine);
                  return (
                    <>
                      <div className={`rounded-[1rem] border border-[var(--color-divider)] bg-white px-4 py-4 ${selectedDay?.iso === todayIso ? "bg-[rgba(47,111,237,0.04)]" : ""}`}>
                        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--color-text-muted)]">{selectedDay?.title}</p>
                        <p className="mt-1 text-sm text-[var(--color-text-muted)]">{selectedDay?.caption}</p>
                      </div>
                      {shifts.map((shift) => {
                        const latest = latestTimesheet(myTimesheetsByShiftId[shift.shift_id] ?? []);
                        const canSubmitReport = shift.is_mine && (!latest || latest.status === "rejected");
                        return (
                          <div key={`mobile-${shift.shift_id}`} className="surface-card rounded-[1rem] px-4 py-4">
                            <ShiftBlock
                              timeRangeLabel={`${formatTime(shift.start_time)}-${formatTime(shift.end_time)}`}
                              positionLabel={shift.staff_position ?? shift.required_role}
                              captionLabel={shift.location_name}
                              peopleLabel={shift.assignments.map((assignment) => assignment.user_name.split(" ")[0]).join(", ")}
                              highlighted={shift.is_mine}
                              editable={false}
                              isEditing={false}
                              editText=""
                              deleteLabel={t("schedule.delete_shift")}
                            />
                            <div className="mt-3 flex items-center justify-between gap-2">
                              {latest ? (
                                <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${timesheetStatusClass(latest.status)}`}>
                                  {statusText(latest.status)}
                                </span>
                              ) : (
                                <span className="text-xs text-[var(--color-text-muted)]">{t("schedule.no_report")}</span>
                              )}
                              {canSubmitReport ? (
                                <Button size="sm" variant="secondary" onClick={() => openShiftTimesheetModal(shift)}>
                                  {t("schedule.report_hours")}
                                </Button>
                              ) : null}
                            </div>
                          </div>
                        );
                      })}
                      {(myRestrictedTimesheetsByDate[selectedDay?.iso ?? ""] ?? []).length ? (
                        <div className="rounded-[1rem] bg-amber-50 px-4 py-3 text-sm text-amber-700">
                          {t("schedule.extra_hours")}: {statusText(latestTimesheet(myRestrictedTimesheetsByDate[selectedDay?.iso ?? ""])?.status ?? "pending")}
                        </div>
                      ) : null}
                      <div className="rounded-[1rem] border border-[var(--color-divider)] bg-[var(--color-surface-muted)] px-4 py-4">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--color-text-muted)]">{t("schedule.team_on_this_day")}</p>
                            <p className="mt-1 text-xs text-[var(--color-text-muted)]">
                              {coworkerAgenda.length ? t("schedule.team_on_day_description") : t("schedule.no_other_assigned")}
                            </p>
                          </div>
                          <Badge>{t("schedule.total_count", { count: teamAgenda.length })}</Badge>
                        </div>
                        {coworkerAgenda.length ? (
                          <div className="mt-3 space-y-2">
                            {coworkerAgenda.map((item) => (
                              <div key={`team-mobile-${item.shiftId}-${item.userId}`} className="flex items-center justify-between gap-3 rounded-[0.9rem] border border-[var(--color-divider)] bg-white px-3 py-2">
                                <div className="min-w-0">
                                  <p className="truncate text-sm font-semibold text-[var(--color-heading)]">{item.userName}</p>
                                  <p className="text-[11px] text-[var(--color-text-muted)]">{item.positionLabel}</p>
                                </div>
                                <div className="text-right">
                                  <p className="text-sm font-semibold text-[var(--color-heading)]">{formatTime(item.startTime)}-{formatTime(item.endTime)}</p>
                                  <p className="text-[11px] text-[var(--color-text-muted)]">{item.locationName}</p>
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : null}
                      </div>
                      {!shifts.length ? (
                        <div className="rounded-[1rem] border border-dashed border-[var(--color-border)] px-4 py-6 text-sm text-[var(--color-text-muted)]">
                          {t("schedule.no_shifts_this_day")}
                        </div>
                      ) : null}
                    </>
                  );
                })()}
              </div>
              <div className="hidden h-full overflow-auto rounded-[1rem] border border-[var(--color-divider)] bg-white 2xl:block">
                <div className="grid min-w-[820px] grid-cols-7">
                  {weekDays.map((day, index) => {
                    const dayData = staffDaysByWeek[index];
                    const shifts = dayData?.shifts ?? [];
                    const teamAgenda = (teamAgendaByDay[index] ?? []).filter((item) => !item.isMine);
                    return (
                      <div key={day.iso} className={`min-h-[96px] border-r border-[var(--color-divider)] p-2 ${day.iso === todayIso ? "bg-[rgba(47,111,237,0.05)]" : ""}`}>
                        <p className="text-xs font-semibold text-[var(--color-heading)]">{day.title}</p>
                        <p className="text-[10px] text-[var(--color-text-muted)]">{day.caption}</p>
                        <div className="mt-1.5 space-y-1">
                          {shifts.map((shift) => {
                            const latest = latestTimesheet(myTimesheetsByShiftId[shift.shift_id] ?? []);
                            const canSubmitReport = shift.is_mine && (!latest || latest.status === "rejected");
                            return (
                              <div key={shift.shift_id} className="space-y-1">
                                <ShiftBlock
                                  timeRangeLabel={`${formatTime(shift.start_time)}-${formatTime(shift.end_time)}`}
                                  positionLabel={shift.staff_position ?? shift.required_role}
                                  captionLabel={shift.location_name}
                                  peopleLabel={shift.assignments.map((assignment) => assignment.user_name.split(" ")[0]).join(", ")}
                                  highlighted={shift.is_mine}
                                  editable={false}
                                  isEditing={false}
                                  editText=""
                                />
                                {shift.is_mine ? (
                                  <div className="flex items-center justify-between gap-1">
                                    {latest ? (
                                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${timesheetStatusClass(latest.status)}`}>
                                        {statusText(latest.status)}
                                      </span>
                                    ) : (
                                      <span className="text-[10px] text-[var(--color-text-muted)]">{t("schedule.no_report")}</span>
                                    )}
                                    {canSubmitReport ? (
                                      <button
                                        type="button"
                                        className="text-[10px] font-semibold text-[var(--color-primary)] hover:underline"
                                        onClick={() => openShiftTimesheetModal(shift)}
                                      >
                                        {t("schedule.report_hours")}
                                      </button>
                                    ) : null}
                                  </div>
                                ) : null}
                              </div>
                            );
                          })}
                          {(myRestrictedTimesheetsByDate[day.iso] ?? []).length ? (
                            <div className="rounded-[0.75rem] bg-amber-50 px-2 py-1 text-[10px] font-medium text-amber-700">
                              {t("schedule.extra_hours")}: {statusText(latestTimesheet(myRestrictedTimesheetsByDate[day.iso])?.status ?? "pending")}
                            </div>
                          ) : null}
                          {teamAgenda.length ? (
                            <div className="rounded-[0.75rem] border border-[var(--color-divider)] bg-[var(--color-surface-muted)] px-2 py-1.5">
                              <p className="text-[9px] font-semibold uppercase tracking-[0.08em] text-[var(--color-text-muted)]">{t("schedule.team")}</p>
                              <div className="mt-1 space-y-1">
                                {teamAgenda.map((item) => (
                                  <div key={`team-desktop-${item.shiftId}-${item.userId}`} className="text-[10px] leading-4 text-[var(--color-heading)]">
                                    <span className="font-medium">{item.userName.split(" ")[0]}</span>{" "}
                                    <span className="text-[var(--color-text-muted)]">{formatTime(item.startTime)}-{formatTime(item.endTime)}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ) : null}
                          {!shifts.length ? <p className="text-[10px] text-[var(--color-text-muted)]">{t("schedule.no_shift")}</p> : null}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </CardContent>
          </Card>

          {availabilityCard}
        </div>

      ) : (

        <div className="stagger-grid grid gap-5">

          <section className="min-w-0 space-y-5">

            {availabilityCard ? (
              <div className="stagger-item">{availabilityCard}</div>
            ) : null}

            <Card>

              <CardHeader>

                <div className="flex flex-wrap items-start justify-between gap-3">

                  <div>

                    <CardTitle>{t("schedule.timesheet_approvals")}</CardTitle>

                    <CardDescription>{t("schedule.timesheet_approvals_description")}</CardDescription>

                  </div>
                  {visiblePendingTimesheets.length ? (
                    <Button
                      size="sm"
                      variant="secondary"
                      className="h-9 rounded-[0.85rem] border-0 bg-transparent px-0 text-[var(--color-primary)] shadow-none hover:bg-transparent"
                      onClick={() => approveVisibleTimesheetsMutation.mutate(visiblePendingTimesheets)}
                      disabled={approveVisibleTimesheetsMutation.isPending || reviewTimesheetMutation.isPending}
                    >
                      <CheckCircle2 className="size-4" /> {t("schedule.approve_all_visible")}
                    </Button>
                  ) : null}

                </div>

              </CardHeader>

              <CardContent className="space-y-3 overflow-hidden">
                {visiblePendingTimesheets.length ? (
                  <div className="sticky top-0 z-10 flex items-center justify-between gap-3 rounded-[1rem] border border-[var(--color-divider)] bg-white px-4 py-3">
                    <p className="text-sm font-medium text-[var(--color-heading)]">{t("schedule.pending_reports_in_week", { count: visiblePendingTimesheets.length })}</p>
                    <span className="text-xs text-[var(--color-text-muted)]">{t("schedule.scrollable_list")}</span>
                  </div>
                ) : null}
                <div className="max-h-[520px] space-y-3 overflow-y-auto pr-1">

                {visiblePendingTimesheets.map((entry) => {
                  const shift = entry.shift_id ? shiftsById[entry.shift_id] : null;
                  const employeeName = timesheetUserNameById[entry.user_id] ?? entry.user_id.slice(0, 8);
                  const deltaLabel = deltaText(shift, entry);
                  return (
                    <div key={entry.id} className="surface-muted rounded-[1.2rem] px-4 py-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="font-medium text-[var(--color-heading)]">{employeeName}</p>
                          <p className="mt-1 text-sm text-[var(--color-text-muted)]">
                            {workDateLabel(entry.work_date)} • {formatTime(entry.arrived_at)}-{formatTime(entry.left_at)}
                          </p>
                          <p className="mt-1 text-xs text-[var(--color-text-muted)]">
                            {shift
                              ? `${shift.staff_position ?? shift.required_role} • ${shift.date} ${formatTime(shift.start_time)}-${formatTime(shift.end_time)}`
                              : t("schedule.extra_hours_without_shift")}
                          </p>
                          <p className={`mt-1 text-xs font-semibold ${deltaLabel.startsWith("+") ? "text-amber-700" : deltaLabel.startsWith("-") ? "text-sky-700" : "text-emerald-700"}`}>
                            {deltaLabel === t("schedule.extra_entry") ? t("schedule.extra_entry") : t("schedule.delta_vs_plan", { delta: deltaLabel })}
                          </p>
                          {entry.note ? <p className="mt-2 text-sm text-[var(--color-heading)]">{entry.note}</p> : null}
                        </div>
                        <Badge className={timesheetStatusClass(entry.status)}>{statusText(entry.status)}</Badge>
                      </div>

                      <div className="mt-3 flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          onClick={() => reviewTimesheetMutation.mutate({ entry, payload: { action: "approve" } })}
                          disabled={reviewTimesheetMutation.isPending}
                        >
                          <CheckCircle2 className="size-4" /> {t("schedule.approve")}
                        </Button>
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() =>
                            setReviewModal({
                              entry,
                              arrived_at: toTimeInput(entry.arrived_at),
                              left_at: toTimeInput(entry.left_at),
                              review_note: entry.review_note ?? "",
                            })
                          }
                        >
                          {t("schedule.correct")}
                        </Button>
                        <Button
                          size="sm"
                          variant="danger"
                          onClick={() => reviewTimesheetMutation.mutate({ entry, payload: { action: "reject" } })}
                          disabled={reviewTimesheetMutation.isPending}
                        >
                          <XCircle className="size-4" /> {t("schedule.reject")}
                        </Button>
                      </div>
                    </div>
                  );
                })}
                </div>

                {!visiblePendingTimesheets.length ? (

                  <div className="rounded-[1.2rem] border border-dashed border-[var(--color-border)] px-4 py-6 text-sm text-[var(--color-text-muted)]">

                    {t("schedule.no_pending_timesheets")}

                  </div>

                ) : null}

              </CardContent>

            </Card>

            <Card>

              <CardHeader>

                <div className="flex flex-wrap items-start justify-between gap-4">

                  <div>

                    <CardTitle>{t("schedule.calendar_title")}</CardTitle>

                    <CardDescription>{t("schedule.calendar_description")}</CardDescription>

                  </div>

                  <div className="hidden flex-wrap items-center gap-2 lg:flex">
                    <WeekRangeNavigator
                      label={weekRangeCompactLabel}
                      onPrevious={() => setWeekStart((current) => shiftWeek(current, -7))}
                      onNext={() => setWeekStart((current) => shiftWeek(current, 7))}
                      className="min-w-[360px]"
                    />
                    <Button variant="secondary" onClick={() => window.location.assign("/team")}>
                      {t("schedule.edit_template_for_location")}
                    </Button>

                    {scheduleStage === "idle" ? (
                      <Button onClick={() => previewMutation.mutate({ resetOverrides: false, mode: "generate" })} disabled={previewMutation.isPending || !locationFilter}>
                        <Sparkles className="size-4" /> {t("schedule.generate_from_template")}
                      </Button>
                    ) : null}

                    {scheduleStage === "preview" ? (
                      <>
                        <Button className="bg-emerald-500 text-white hover:bg-emerald-600" onClick={() => applyMutation.mutate()} disabled={applyMutation.isPending}>
                          <ClipboardCheck className="size-4" /> {t("schedule.apply")}
                        </Button>
                        <Button onClick={() => previewMutation.mutate({ resetOverrides: true, mode: "regenerate" })} disabled={previewMutation.isPending || !locationFilter}>
                          <Sparkles className="size-4" /> {t("schedule.regenerate")}
                        </Button>
                      </>
                    ) : null}

                    {scheduleStage === "applied" ? (
                      <>
                        <Button onClick={() => previewMutation.mutate({ resetOverrides: true, mode: "regenerate" })} disabled={previewMutation.isPending || !locationFilter}>
                          <Sparkles className="size-4" /> {t("schedule.regenerate")}
                        </Button>
                        <Button
                          variant="secondary"
                          onClick={() => {
                            previewMutation.mutate({ mode: "edit-from-applied" });
                          }}
                          disabled={previewMutation.isPending || !locationFilter || shiftsQuery.isLoading}
                        >
                          <Pencil className="size-4" />
                        </Button>
                      </>
                    ) : null}
                  </div>
                </div>

                <div className="space-y-4 lg:hidden">
                  <WeekRangeNavigator
                    label={weekRangeCompactLabel}
                    onPrevious={() => setWeekStart((current) => shiftWeek(current, -7))}
                    onNext={() => setWeekStart((current) => shiftWeek(current, 7))}
                  />
                  <Button variant="secondary" className="w-full justify-center" onClick={() => window.location.assign("/team")}>
                    {t("schedule.edit_template_for_location")}
                  </Button>

                  <div className={`grid gap-3 ${scheduleStage === "idle" ? "grid-cols-1" : "grid-cols-2"}`}>
                    {scheduleStage === "idle" ? (
                      <Button className="w-full justify-center" onClick={() => previewMutation.mutate({ resetOverrides: false, mode: "generate" })} disabled={previewMutation.isPending || !locationFilter}>
                        <Sparkles className="size-4" /> {t("schedule.generate_from_template")}
                      </Button>
                    ) : null}

                    {scheduleStage === "preview" ? (
                      <>
                        <Button className="w-full justify-center bg-emerald-500 text-white hover:bg-emerald-600" onClick={() => applyMutation.mutate()} disabled={applyMutation.isPending}>
                          <ClipboardCheck className="size-4" /> {t("schedule.apply")}
                        </Button>
                        <Button className="w-full justify-center" onClick={() => previewMutation.mutate({ resetOverrides: true, mode: "regenerate" })} disabled={previewMutation.isPending || !locationFilter}>
                          <Sparkles className="size-4" /> {t("schedule.regenerate")}
                        </Button>
                      </>
                    ) : null}

                    {scheduleStage === "applied" ? (
                      <>
                        <Button className="w-full justify-center" onClick={() => previewMutation.mutate({ resetOverrides: true, mode: "regenerate" })} disabled={previewMutation.isPending || !locationFilter}>
                          <Sparkles className="size-4" /> {t("schedule.regenerate")}
                        </Button>
                        <Button
                          variant="secondary"
                          className="w-full justify-center"
                          onClick={() => {
                            previewMutation.mutate({ mode: "edit-from-applied" });
                          }}
                          disabled={previewMutation.isPending || !locationFilter || shiftsQuery.isLoading}
                        >
                          <Pencil className="size-4" /> {t("common.edit")}
                        </Button>
                      </>
                    ) : null}
                  </div>
                </div>

                <div className="mt-2 grid gap-3 lg:mt-0 lg:flex lg:flex-wrap lg:items-center">
                  <Select
                    className="w-full min-w-0 lg:min-w-[220px] border-[var(--color-primary)] bg-[var(--color-accent)] text-[var(--color-primary)]"
                    options={((locationsQuery.data ?? []).map((location) => ({ label: location.name, value: location.id })))}
                    value={locationFilter}
                    onChange={(event) => setLocationFilter(event.target.value)}
                  />

                  {scheduleStage === "preview" ? (
                    <>
                      <div className="hidden lg:block lg:min-w-[140px]">
                        <Select className="w-full min-w-0" options={dayOptions} value={bulkDay} onChange={(event) => setBulkDay(event.target.value)} />
                      </div>
                      <Button className="hidden lg:inline-flex lg:w-auto" variant="secondary" onClick={() => bulkClearDayMutation.mutate({})} disabled={bulkClearDayMutation.isPending || !locationFilter}>
                        <Trash2 className="size-4" /> {t("schedule.clear_day")}
                      </Button>
                      <Button className="w-full lg:hidden" variant="secondary" onClick={() => bulkClearDayMutation.mutate({ dayIndex: selectedDayIndex })} disabled={bulkClearDayMutation.isPending || !locationFilter}>
                        <Trash2 className="size-4" /> {t("schedule.clear_day")}
                      </Button>
                    </>
                  ) : null}
                </div>

                <div className="pt-1">
                  {scheduleStage === "applied" ? (
                    <div className="hidden lg:flex lg:flex-wrap lg:items-center lg:justify-between lg:gap-4">
                      <div className="grid grid-cols-2 gap-2">
                        <Button variant={mobileAppliedView === "cards" ? "default" : "secondary"} className="min-w-[132px]" onClick={() => setMobileAppliedView("cards")}>
                          {t("schedule.cards_view")}
                        </Button>
                        <Button variant={mobileAppliedView === "timetable" ? "default" : "secondary"} className="min-w-[132px]" onClick={() => setMobileAppliedView("timetable")}>
                          {t("schedule.timetable_view")}
                        </Button>
                      </div>
                      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
                        {roleLegendItems.map((item) => (
                          <div key={item.label} className="inline-flex items-center gap-2 text-sm text-[var(--color-heading)]">
                            <span className="size-4 rounded-md" style={{ backgroundColor: item.accent }} />
                            <span>{item.label}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
                      {roleLegendItems.map((item) => (
                        <div key={item.label} className="inline-flex items-center gap-2 text-sm text-[var(--color-heading)]">
                          <span className="size-4 rounded-md" style={{ backgroundColor: item.accent }} />
                          <span>{item.label}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

              </CardHeader>

              <CardContent className="min-w-0 space-y-3">
                {scheduleStage === "preview" ? (
                  <div className="space-y-3 lg:hidden">
                    <Button variant="secondary" className="h-9" onClick={exitPreviewMode}>
                      <ChevronLeft className="size-4" /> {t("common.back")}
                    </Button>
                  </div>
                ) : scheduleStage === "applied" && mobileAppliedView === "timetable" ? null : (
                  <MobileDaySelector
                    className="lg:hidden"
                    weekDays={weekDays}
                    selectedDayIndex={selectedDayIndex}
                    onSelect={setSelectedDayIndex}
                    warningEntriesByDate={activeMobileWarningEntriesByDate}
                    t={t}
                  />
                )}

                {scheduleStage === "idle" ? (
                  <div className="rounded-[1.2rem] border border-dashed border-[var(--color-border)] px-4 py-6 text-sm text-[var(--color-text-muted)]">
                    {t("schedule.generate_empty")}
                  </div>
                ) : null}

                {scheduleStage === "preview" && previewVisibleIssueCount > 0 ? (
                  <div className="flex flex-wrap items-start gap-3 rounded-[1rem] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                    <CircleAlert className="mt-0.5 size-4 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold">{t("schedule.missing_staff")}</p>
                      <p className="mt-1 text-xs leading-5 text-amber-800">
                        {previewVisibleIssueCount} • {t("schedule.fix_alerts")}
                      </p>
                    </div>
                  </div>
                ) : null}

                {scheduleStage === "preview" ? (
                  <PreviewCardsBoard
                    weekDays={weekDays}
                    entriesByDate={previewEntriesByDate}
                    warningEntriesByDate={previewWarningEntriesByDate}
                    todayIso={todayIso}
                    t={t}
                    onCreate={openPreviewCreateModal}
                    onEdit={openPreviewEditModal}
                    onDelete={(entry) =>
                      patchPreviewEditMutation.mutate({
                        action: "delete",
                        shift_key: `override:${entry.overrideId}`,
                      })
                    }
                  />
                ) : null}

                {scheduleStage === "applied" ? (
                  <>
                  <div className="space-y-3 lg:hidden">
                    <div className="grid grid-cols-2 gap-2">
                      <Button variant={mobileAppliedView === "cards" ? "default" : "secondary"} className="w-full" onClick={() => setMobileAppliedView("cards")}>
                        {t("schedule.cards_view")}
                      </Button>
                      <Button variant={mobileAppliedView === "timetable" ? "default" : "secondary"} className="w-full" onClick={() => setMobileAppliedView("timetable")}>
                        {t("schedule.timetable_view")}
                      </Button>
                    </div>
                    <div className="overflow-x-auto pb-1">
                      <div className="inline-flex min-w-max items-center gap-x-5 gap-y-2">
                        {roleLegendItems.map((item) => (
                          <div key={`mobile-${item.label}`} className="inline-flex items-center gap-2 text-sm text-[var(--color-heading)]">
                            <span className="size-4 rounded-md" style={{ backgroundColor: item.accent }} />
                            <span>{item.label}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {mobileAppliedView === "cards" ? (
                      selectedAppliedEntries.length ? (
                        selectedAppliedEntries.map((entry) => (
                          <AppliedShiftCard key={`applied-mobile-${entry.key}`} entry={entry} t={t} />
                        ))
                      ) : (
                        <div className="rounded-[1rem] border border-dashed border-[var(--color-border)] px-4 py-6 text-sm text-[var(--color-text-muted)]">
                          {t("schedule.no_shifts_this_day")}
                        </div>
                      )
                    ) : (
                      <div className="rounded-[1.1rem] border border-[var(--color-divider)] bg-white">
                        <AppliedTimetableBoard
                          compact
                          weekDays={weekDays}
                          entriesByDate={appliedTimetableByDate}
                          warningEntriesByDate={appliedWarningEntriesByDate}
                          timeSlots={appliedTimetableSlots}
                          startMinutes={appliedTimetableStartMinutes}
                          todayIso={todayIso}
                          t={t}
                        />
                      </div>
                    )}
                  </div>
                  {mobileAppliedView === "cards" ? (
                    <div className="hidden lg:block">
                      <AppliedCardsBoard
                        weekDays={weekDays}
                        entriesByDate={appliedEntriesByDate}
                        warningEntriesByDate={appliedWarningEntriesByDate}
                        todayIso={todayIso}
                        t={t}
                      />
                    </div>
                  ) : (
                    <div className="hidden rounded-[1.25rem] border border-[var(--color-divider)] bg-white lg:block">
                      <AppliedTimetableBoard
                        weekDays={weekDays}
                        entriesByDate={appliedTimetableByDate}
                        warningEntriesByDate={appliedWarningEntriesByDate}
                        timeSlots={appliedTimetableSlots}
                        startMinutes={appliedTimetableStartMinutes}
                        todayIso={todayIso}
                        t={t}
                      />
                    </div>
                  )}
                  </>
                ) : null}
              </CardContent>
            </Card>

            <Card>

              <CardHeader>

                <div>

                  <CardTitle>{t("schedule.incoming_requests")}</CardTitle>

                  <CardDescription>{t("schedule.incoming_requests_description")}</CardDescription>

                </div>

              </CardHeader>

              <CardContent className="space-y-3">

                {(incomingRequestsQuery.data ?? []).map((item) => {

                  const shift = shiftsById[item.shift_id];

                  return (

                    <div key={item.id} className="surface-muted rounded-[1.2rem] px-4 py-4">

                      <p className="font-medium text-[var(--color-heading)]">{item.requester_name}  {item.request_type.toUpperCase()}</p>

                      <p className="mt-1 text-sm text-[var(--color-text-muted)]">

                        {shift ? `${shift.date}  ${formatTime(shift.start_time)}-${formatTime(shift.end_time)}` : item.shift_id.slice(0, 8)}

                      </p>

                      <div className="mt-3 flex flex-wrap gap-2">

                        <Button size="sm" onClick={() => reviewShiftRequestMutation.mutate({ requestId: item.id, action: "approve" })}>

                          {t("schedule.approve")}

                        </Button>

                        <Button size="sm" variant="secondary" onClick={() => reviewShiftRequestMutation.mutate({ requestId: item.id, action: "reject" })}>

                          {t("schedule.reject")}

                        </Button>

                      </div>

                    </div>

                  );

                })}

                {!incomingRequestsQuery.data?.length ? (

                  <div className="rounded-[1.2rem] border border-dashed border-[var(--color-border)] px-4 py-6 text-sm text-[var(--color-text-muted)]">

                    {t("schedule.no_incoming_requests")}

                  </div>

                ) : null}

              </CardContent>

            </Card>

          </section>

        </div>

      )}

      {previewEditorModal ? (
        <OverlayPortal>
          <div className="mobile-sheet-backdrop lg:grid lg:place-items-center lg:px-4 lg:py-6">
            <div className="mobile-sheet-panel lg:w-full lg:max-w-[520px] lg:rounded-[1.5rem] lg:border lg:border-[var(--color-border)] lg:bg-white lg:p-5 lg:shadow-[0_24px_80px_rgba(15,23,42,0.18)]">
              <div className="flex items-start justify-between gap-3 border-b border-[var(--color-divider)] px-4 py-4 lg:border-b-0 lg:px-0 lg:py-0">
                <div>
                  <p className="text-lg font-bold tracking-[-0.03em] text-[var(--color-heading)]">
                    {previewEditorModal.mode === "create" ? t("schedule.add_shift") : t("common.edit")}
                  </p>
                  <p className="mt-1 text-sm text-[var(--color-text-muted)]">
                    {weekDays[previewEditorModal.dayIndex]?.title} • {weekDays[previewEditorModal.dayIndex]?.caption}
                  </p>
                </div>
                <button
                  type="button"
                  className="rounded-full p-2 text-[var(--color-text-muted)] transition hover:bg-[var(--color-surface-muted)] hover:text-[var(--color-heading)]"
                  onClick={() => setPreviewEditorModal(null)}
                  aria-label="Close"
                >
                  <XCircle className="size-5" />
                </button>
              </div>

              <div className="mobile-sheet-scroll px-4 py-4 lg:px-0">
                <div className="grid gap-4">
                  <label className="grid gap-1.5 text-sm font-medium text-[var(--color-heading)]">
                    {t("common.worker")}
                    <Select
                      options={previewEditorWorkerOptions.map((item) => ({ value: item.value, label: item.label }))}
                      value={previewEditorModal.userId}
                      onChange={(event) =>
                        setPreviewEditorModal((current) =>
                          current ? { ...current, userId: event.target.value } : current,
                        )
                      }
                    />
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <label className="grid gap-1.5 text-sm font-medium text-[var(--color-heading)]">
                      {t("schedule.start_time_label")}
                      <Input
                        type="time"
                        value={previewEditorModal.startTime}
                        onChange={(event) =>
                          setPreviewEditorModal((current) =>
                            current ? { ...current, startTime: event.target.value } : current,
                          )
                        }
                      />
                    </label>
                    <label className="grid gap-1.5 text-sm font-medium text-[var(--color-heading)]">
                      {t("schedule.end_time_label")}
                      <Input
                        type="time"
                        value={previewEditorModal.endTime}
                        onChange={(event) =>
                          setPreviewEditorModal((current) =>
                            current ? { ...current, endTime: event.target.value } : current,
                          )
                        }
                      />
                    </label>
                  </div>
                  {selectedPreviewEditorMember && selectedPreviewEditorAvailability ? (
                    <div className="rounded-[1rem] border border-[var(--color-divider)] bg-white px-4 py-3">
                      <p className="text-sm font-semibold text-[var(--color-heading)]">
                        {selectedPreviewEditorMember.full_name} • {selectedPreviewEditorMember.staff_position ?? selectedPreviewEditorMember.role}
                      </p>
                      <p
                        className={`mt-1 text-sm ${
                          selectedPreviewEditorAvailability.tone === "ok"
                            ? "text-emerald-700"
                            : selectedPreviewEditorAvailability.tone === "warning"
                              ? "text-amber-700"
                              : "text-[var(--color-text-muted)]"
                        }`}
                      >
                        {selectedPreviewEditorAvailability.label}
                      </p>
                      {managerAvailabilityByUserDay[selectedPreviewEditorMember.id]?.[previewEditorModal.dayIso]?.windowLabel ? (
                        <p className="mt-1 text-xs text-[var(--color-text-muted)]">
                          {managerAvailabilityByUserDay[selectedPreviewEditorMember.id][previewEditorModal.dayIso].windowLabel}
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </div>

              <div className="border-t border-[var(--color-divider)] px-4 py-4 lg:px-0">
                <div className="grid gap-2">
                  <Button variant="secondary" onClick={() => setPreviewEditorModal(null)}>
                    {t("common.cancel")}
                  </Button>
                  <Button
                    onClick={() => {
                      const selectedMember = sortedLocationMembers.find((member) => member.id === previewEditorModal.userId);
                      if (!selectedMember) return;
                      patchPreviewEditMutation.mutate(
                        previewEditorModal.mode === "create"
                          ? {
                              action: "create",
                              shift_key: `create:${selectedMember.id}:${previewEditorModal.dayIso}`,
                              location_id: locationFilter,
                              day_of_week: previewEditorModal.dayIndex,
                              start_time: `${previewEditorModal.startTime}:00`,
                              end_time: `${previewEditorModal.endTime}:00`,
                              required_role: selectedMember.role,
                              staff_position: selectedMember.role === "STAFF" ? selectedMember.staff_position ?? "Cook" : null,
                              required_count: 1,
                              assigned_user_id: selectedMember.id,
                            }
                          : {
                              action: "upsert",
                              shift_key: `override:${previewEditorModal.overrideId}`,
                              start_time: `${previewEditorModal.startTime}:00`,
                              end_time: `${previewEditorModal.endTime}:00`,
                              assigned_user_id: selectedMember.id,
                              required_role: selectedMember.role,
                              staff_position: selectedMember.role === "STAFF" ? selectedMember.staff_position ?? "Cook" : null,
                              required_count: 1,
                            },
                        {
                          onSuccess: () => {
                            setPreviewEditorModal(null);
                          },
                        },
                      );
                    }}
                    disabled={patchPreviewEditMutation.isPending || !previewEditorModal.userId || !locationFilter}
                  >
                    {t("common.save")}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </OverlayPortal>
      ) : null}

      {timesheetModal ? (
        <OverlayPortal>
          <div className="mobile-sheet-backdrop lg:grid lg:place-items-center lg:px-4 lg:py-6">
            <div className="mobile-sheet-panel lg:w-full lg:max-w-[440px] lg:rounded-[1.5rem] lg:border lg:border-[var(--color-border)] lg:bg-white lg:p-5 lg:shadow-[0_24px_80px_rgba(15,23,42,0.18)]">
            <div className="flex items-start justify-between gap-3 border-b border-[var(--color-divider)] px-4 py-4 lg:border-b-0 lg:px-0 lg:py-0">
              <div>
                <p className="text-lg font-bold tracking-[-0.03em] text-[var(--color-heading)]">
                  {timesheetModal.mode === "shift" ? t("schedule.report_hours") : t("schedule.report_extra_hours")}
                </p>
                <p className="mt-1 text-sm text-[var(--color-text-muted)]">
                  {timesheetModal.mode === "shift"
                    ? `${workDateLabel(timesheetModal.workDate)} • ${timesheetModal.shift.location_name}`
                    : `${t("schedule.restricted_entry_for")} ${workDateLabel(timesheetModal.workDate)}`}
                </p>
              </div>
              <button
                type="button"
                className="rounded-full p-2 text-[var(--color-text-muted)] transition hover:bg-[var(--color-surface-muted)] hover:text-[var(--color-heading)]"
                onClick={() => setTimesheetModal(null)}
                aria-label="Close"
              >
                <XCircle className="size-5" />
              </button>
            </div>

            <div className="mobile-sheet-scroll px-4 py-4 lg:px-0">
            <div className="grid gap-4 lg:mt-5">
              {timesheetModal.mode === "extra" ? (
                <label className="grid gap-1.5 text-sm font-medium text-[var(--color-heading)]">
                  {t("schedule.work_date")}
                  <Input
                    type="date"
                    value={timesheetModal.workDate}
                    onChange={(event) => setTimesheetModal({ mode: "extra", workDate: event.target.value })}
                  />
                </label>
              ) : null}
              <div className="grid grid-cols-2 gap-3">
                <label className="grid gap-1.5 text-sm font-medium text-[var(--color-heading)]">
                  {t("schedule.arrived_at")}
                  <Input
                    type="time"
                    value={timesheetForm.arrived_at}
                    onChange={(event) => setTimesheetForm((current) => ({ ...current, arrived_at: event.target.value }))}
                  />
                </label>
                <label className="grid gap-1.5 text-sm font-medium text-[var(--color-heading)]">
                  {t("schedule.left_at")}
                  <Input
                    type="time"
                    value={timesheetForm.left_at}
                    onChange={(event) => setTimesheetForm((current) => ({ ...current, left_at: event.target.value }))}
                  />
                </label>
              </div>
              <label className="grid gap-1.5 text-sm font-medium text-[var(--color-heading)]">
                {t("schedule.note")}
                <Textarea
                  rows={3}
                  placeholder={t("schedule.note_placeholder")}
                  value={timesheetForm.note}
                  onChange={(event) => setTimesheetForm((current) => ({ ...current, note: event.target.value }))}
                />
              </label>
              {timesheetModal.mode === "shift" && timesheetModal.assignmentStatus === "in_shift" ? (
                <p className="rounded-[1rem] bg-amber-50 px-3 py-2 text-sm text-amber-700">
                  {t("schedule.shift_timer_notice")}
                </p>
              ) : null}
            </div>
            </div>

            <div className="border-t border-[var(--color-divider)] px-4 py-4 lg:mt-5 lg:flex lg:justify-end lg:gap-2 lg:border-t-0 lg:px-0 lg:py-0">
              <div className="grid gap-2 lg:flex">
              <Button variant="secondary" onClick={() => setTimesheetModal(null)}>
                {t("common.cancel")}
              </Button>
              <Button
                onClick={() => createTimesheetMutation.mutate({ modal: timesheetModal, form: timesheetForm })}
                disabled={createTimesheetMutation.isPending || !timesheetForm.arrived_at || !timesheetForm.left_at}
                className="w-full lg:w-auto"
              >
                {t("schedule.submit_report")}
              </Button>
              </div>
            </div>
            </div>
          </div>
        </OverlayPortal>
      ) : null}

      {reviewModal ? (
        <OverlayPortal>
          <div className="mobile-sheet-backdrop lg:grid lg:place-items-center lg:px-4 lg:py-6">
            <div className="mobile-sheet-panel lg:w-full lg:max-w-[440px] lg:rounded-[1.5rem] lg:border lg:border-[var(--color-border)] lg:bg-white lg:p-5 lg:shadow-[0_24px_80px_rgba(15,23,42,0.18)]">
            <div className="flex items-start justify-between gap-3 border-b border-[var(--color-divider)] px-4 py-4 lg:border-b-0 lg:px-0 lg:py-0">
              <div>
                <p className="text-lg font-bold tracking-[-0.03em] text-[var(--color-heading)]">{t("schedule.correct_timesheet")}</p>
                <p className="mt-1 text-sm text-[var(--color-text-muted)]">
                  {timesheetUserNameById[reviewModal.entry.user_id] ?? reviewModal.entry.user_id.slice(0, 8)} • {workDateLabel(reviewModal.entry.work_date)}
                </p>
              </div>
              <button
                type="button"
                className="rounded-full p-2 text-[var(--color-text-muted)] transition hover:bg-[var(--color-surface-muted)] hover:text-[var(--color-heading)]"
                onClick={() => setReviewModal(null)}
                aria-label="Close"
              >
                <XCircle className="size-5" />
              </button>
            </div>

            <div className="mobile-sheet-scroll px-4 py-4 lg:px-0">
            <div className="grid gap-4 lg:mt-5">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="grid gap-1.5 text-sm font-medium text-[var(--color-heading)]">
                  {t("schedule.arrived_at")}
                  <Input
                    type="time"
                    value={reviewModal.arrived_at}
                    onChange={(event) => setReviewModal((current) => (current ? { ...current, arrived_at: event.target.value } : current))}
                  />
                </label>
                <label className="grid gap-1.5 text-sm font-medium text-[var(--color-heading)]">
                  {t("schedule.left_at")}
                  <Input
                    type="time"
                    value={reviewModal.left_at}
                    onChange={(event) => setReviewModal((current) => (current ? { ...current, left_at: event.target.value } : current))}
                  />
                </label>
              </div>
              <label className="grid gap-1.5 text-sm font-medium text-[var(--color-heading)]">
                {t("schedule.review_note")}
                <Textarea
                  rows={3}
                  placeholder={t("schedule.review_note_placeholder")}
                  value={reviewModal.review_note}
                  onChange={(event) => setReviewModal((current) => (current ? { ...current, review_note: event.target.value } : current))}
                />
              </label>
            </div>
            </div>

            <div className="border-t border-[var(--color-divider)] px-4 py-4 lg:mt-5 lg:flex lg:justify-end lg:gap-2 lg:border-t-0 lg:px-0 lg:py-0">
              <div className="grid gap-2 lg:flex">
              <Button variant="secondary" onClick={() => setReviewModal(null)}>
                {t("common.cancel")}
              </Button>
              <Button
                onClick={() =>
                  reviewTimesheetMutation.mutate({
                    entry: reviewModal.entry,
                    payload: {
                      action: "correct",
                      arrived_at: toApiTime(reviewModal.arrived_at),
                      left_at: toApiTime(reviewModal.left_at),
                      review_note: reviewModal.review_note.trim() || undefined,
                    },
                  })
                }
                disabled={reviewTimesheetMutation.isPending || !reviewModal.arrived_at || !reviewModal.left_at}
                className="w-full lg:w-auto"
              >
                {t("schedule.save_correction")}
              </Button>
              </div>
            </div>
            </div>
          </div>
        </OverlayPortal>
      ) : null}

    </AppShell>

  );

}
