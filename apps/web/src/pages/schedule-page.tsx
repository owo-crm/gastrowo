import { useEffect, useMemo, useState } from "react";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import {
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  FileClock,
  Check,
  CheckCircle2,
  CircleAlert,
  Pencil,
  Plus,

  SendHorizontal,

  Sparkles,
  Trash2,
  Wallet,
  XCircle,

  X,
} from "lucide-react";

import { AppShell } from "@/components/layout/app-shell";
import { WorkerAvatar } from "@/components/worker-avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

import { ListRow, ListSection } from "@/components/ui/list";
import { Sheet } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { Segmented } from "@/components/ui/segmented";
import { StaffWeek } from "@/components/schedule/staff-week";
import { ClockCard } from "@/components/clock/clock-card";
import { DayList, DayStrip, WeekGrid, type GridDay, type GridDropTarget, type GridPerson, type GridShift } from "@/components/schedule/week-grid";
import { currencyOf, formatDate, formatMoney } from "@/lib/format";
import { positionColor, tint } from "@/lib/position-colors";
import { cn } from "@/lib/utils";
import { useMediaQuery } from "@/lib/use-media-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { OverlayPortal } from "@/components/ui/overlay-portal";

import { Input } from "@/components/ui/input";

import { Select } from "@/components/ui/select";

import { Textarea } from "@/components/ui/textarea";

import { api } from "@/lib/api";

import { hasPlanFeature } from "@/lib/access";
import { OnboardingChecklist } from "@/components/onboarding-checklist";
import { useAuth } from "@/lib/auth";
import { useLanguage } from "@/lib/i18n";
import type { Lang } from "@/lib/i18n";
import { useToast } from "@/lib/toast";
import { UnsavedDialog, useUnsavedChangesBlocker } from "@/lib/unsaved";

import { formatTime, getMonday, toLocalIso } from "@/lib/date";

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



function getWeekDays(weekStart: string, lang: Lang): Array<{ iso: string; title: string; caption: string; dayOfMonth: number }> {

  const start = parseIsoDate(weekStart);

  return Array.from({ length: 7 }).map((_, index) => {

    const date = new Date(start);

    date.setDate(start.getDate() + index);

    return {

      iso: toIsoDate(date),

      title: dayNames[index],

      caption: formatDate(date, lang, { month: "numeric", day: "numeric" }),

      dayOfMonth: date.getDate(),

    };

  });

}

function formatWeekRangeCompact(weekStart: string, lang: Lang): string {
  const formatPart = (value: string) => formatDate(value, lang, { month: "2-digit", day: "2-digit" });
  return `${formatPart(weekStart)} - ${formatPart(shiftWeek(weekStart, 6))}`;
}



function statusClass(status: ShiftRequest["status"]) {

  if (status === "approved") return "border-emerald-200 bg-emerald-50 text-emerald-700";

  if (status === "rejected") return "border-red-200 bg-red-50 text-red-700";

  if (status === "cancelled") return "border-[var(--color-border)] bg-[var(--color-surface-muted)] text-[var(--color-text-muted)]";

  return "border-[var(--color-primary)] bg-[var(--color-accent)] text-[var(--color-primary-strong)]";

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
  return { accent: "#2f6fed", text: "text-[var(--color-primary-strong)]", chip: "bg-[var(--color-accent)] text-[var(--color-primary-strong)]" };
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
  weekDays: Array<{ iso: string; title: string; caption: string; dayOfMonth: number }>;
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
              className={popupClassName ?? "rounded-[12px] border border-amber-200 bg-white p-3 "}
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
                    className={`rounded-[12px] px-3 py-2 ${entry.tone === "coverage" ? "bg-orange-50" : "bg-amber-50"}`}
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
  "daily_rest_violation",
  "weekly_rest_violation",
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
      daily_rest_violation: "no 11h rest",
      weekly_rest_violation: "no 35h weekly rest",
      desired_hours_cap_exceeded: "hours limit",
      staff_position_mismatch: "wrong position",
      not_in_location: "wrong location",
      location_priority_blocked: "blocked in location",
    },
    pl: {
      availability_missing: "brak dostępności",
      availability_window_mismatch: "poza dostępnością",
      overlap: "nakładanie",
      daily_rest_violation: "brak 11h odpoczynku",
      weekly_rest_violation: "brak 35h odpoczynku tyg.",
      desired_hours_cap_exceeded: "limit godzin",
      staff_position_mismatch: "zła pozycja",
      not_in_location: "zła lokalizacja",
      location_priority_blocked: "blokada w lokalu",
    },
  };

  return copy[lang][reason] ?? reason.replace(/_/g, " ");
}

function getStartCoverageLabel(lang: Lang): string {
  return lang === "pl" ? "Nikt nie zaczyna o czasie" : "No one starts on time";
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
      <div className="pb-1">
        <div className="grid w-full grid-cols-7 items-center gap-0.5 rounded-xl border border-[var(--color-border)] bg-white p-1">
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
                  aria-pressed={isActive}
                  className={`w-full min-w-0 rounded-lg px-0.5 py-2 text-center transition ${isActive ? "bg-[var(--color-accent)] text-[var(--color-primary-strong)] " : "text-[var(--color-text-muted)] hover:bg-[var(--color-surface-muted)] hover:text-[var(--color-heading)]"}`}
                >
                  <p className="text-[11px] font-semibold uppercase">{day.title.slice(0, 3)}</p>
                  <p className="mt-0.5 text-sm font-semibold">{day.dayOfMonth}</p>
                </button>
                {warningEntries.length && t ? (
                  <div className="absolute -right-1 -top-1">
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
      <div className="inline-flex w-full items-center gap-2 rounded-[12px] border border-[var(--color-separator)] bg-white px-2 py-1.5 ">
        <button
          type="button"
          onClick={onPrevious}
          aria-label="Previous week"
          className="grid size-8 place-items-center rounded-full text-[var(--color-text-muted)] transition hover:bg-[var(--color-grouped)] hover:text-black"
        >
          <ChevronLeft className="size-4" />
        </button>
        <div className="min-w-[110px] flex-1 px-2 text-center text-sm font-semibold text-black sm:min-w-[150px]">
          {label}
        </div>
        <button
          type="button"
          onClick={onNext}
          aria-label="Next week"
          className="grid size-8 place-items-center rounded-full text-[var(--color-text-muted)] transition hover:bg-[var(--color-grouped)] hover:text-black"
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
          ? "rounded-[12px] border border-emerald-300 bg-emerald-50/70 ring-1 ring-emerald-200"
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
      <div className="rounded-[12px] border border-dashed border-red-300 bg-red-50 px-3 py-2 text-red-600">
        <p className="text-base font-semibold">{timeLabel}</p>
        {metaLabel ? <p className="mt-1 text-xs font-medium">{metaLabel}</p> : null}
      </div>
    );
  }

  const tone = positionTone(toneLabel ?? positionLabel);
  return (
    <div className={`rounded-[12px] px-3 py-2  ${tone.chip}`} style={{ boxShadow: `inset 4px 0 0 ${tone.accent}` }}>
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
  isMine: boolean;
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
  weekDays: Array<{ iso: string; title: string; caption: string; dayOfMonth: number }>;
  entriesByDate: Record<string, AppliedTimetableLayoutEntry[]>;
  warningEntriesByDate: Record<string, DayWarningEntry[]>;
  timeSlots: number[];
  startMinutes: number;
  todayIso: string;
  /** Catalog order of positions, so blocks get the same colors as in the grid. */
  positionOrder: string[];
  lang: Lang;
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
      className={`rounded-[12px] border px-4 py-4  ${
        entry.isConflict
          ? "border-red-200 bg-red-50/90"
          : entry.isOpen
            ? "border-red-200 bg-red-50/85"
            : entry.isMine
              ? "border-emerald-300 bg-emerald-50/70 ring-1 ring-emerald-200"
              : "border-[var(--color-separator)] bg-white"
      }`}
      style={{
        boxShadow: `inset 4px 0 0 ${entry.isConflict ? "#ef4444" : entry.isOpen ? "#ef4444" : tone.accent}`,
        backgroundColor: entry.isConflict
          ? "rgba(254, 242, 242, 0.96)"
          : entry.isOpen
            ? "rgba(254, 242, 242, 0.9)"
            : hexToRgba(tone.accent, 0.11),
        borderColor: entry.isMine && !entry.isConflict && !entry.isOpen ? "#86efac" : undefined,
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
      className="rounded-[12px] border border-[var(--color-separator)] px-4 py-4 "
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
          <Button
            size="sm"
            variant="secondary"
            className="h-8 px-2.5"
            onClick={onEdit}
            aria-label={`Edit shift ${entry.assigned_user_name} ${formatTime(entry.startTime)}-${formatTime(entry.endTime)}`}
          >
            <Pencil className="size-4" />
          </Button>
          <Button
            size="sm"
            variant="secondary"
            className="h-8 px-2.5 text-[var(--color-danger)] hover:text-[var(--color-danger)]"
            onClick={onDelete}
            aria-label={`Delete shift ${entry.assigned_user_name} ${formatTime(entry.startTime)}-${formatTime(entry.endTime)}`}
          >
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
  weekDays: Array<{ iso: string; title: string; caption: string; dayOfMonth: number }>;
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
            className={`rounded-[12px] border border-[var(--color-separator)] p-3 ${
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
                <Button
                  size="sm"
                  variant="secondary"
                  className="h-8 px-2.5"
                  onClick={() => onCreate(day.iso)}
                  aria-label={`Add shift ${day.title} ${day.caption}`}
                >
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
              <div className="rounded-[12px] border border-dashed border-[var(--color-border)] px-4 py-6 text-sm text-[var(--color-text-muted)]">
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
  weekDays: Array<{ iso: string; title: string; caption: string; dayOfMonth: number }>;
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
            className={`rounded-[12px] border border-[var(--color-separator)] p-3 ${
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
              <div className="rounded-[12px] border border-dashed border-[var(--color-border)] px-4 py-6 text-sm text-[var(--color-text-muted)]">
                {t("schedule.no_shifts_this_day")}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** Pixels per hour on the timeline. */
const TIMELINE_HOUR = 56;

const minutesOfDay = (date: Date) => date.getHours() * 60 + date.getMinutes();

/** "17:00" for a board minute, wrapping past midnight (24:00 → 00:00). */
function boardHourLabel(minutes: number): string {
  return `${String(Math.floor(minutes / 60) % 24).padStart(2, "0")}:00`;
}

/** "17:00" → "17", "16:30" → "16:30": narrow blocks keep the whole range readable. */
function shortClock(value: string): string {
  const clock = formatTime(value);
  return clock.endsWith(":00") ? String(Number(clock.slice(0, 2))) : clock;
}

/**
 * The week as a calendar: one column per day, shifts placed by their exact start and length, side by
 * side when they overlap. Same colors as the grid; open shifts show as dashed blocks.
 */
function AppliedTimetableBoard({
  weekDays,
  entriesByDate,
  warningEntriesByDate,
  timeSlots,
  startMinutes,
  todayIso,
  positionOrder,
  lang,
  t,
}: AppliedTimetableBoardProps) {
  const [openWarningDay, setOpenWarningDay] = useState<string | null>(null);
  const [nowMinutes, setNowMinutes] = useState(() => minutesOfDay(new Date()));
  useEffect(() => {
    const timer = window.setInterval(() => setNowMinutes(minutesOfDay(new Date())), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const hourCount = Math.max(timeSlots.length - 1, 1);
  const boardHeight = hourCount * TIMELINE_HOUR;
  const laneCounts = weekDays.map((day) => Math.max(1, ...(entriesByDate[day.iso] ?? []).map((entry) => entry.laneCount)));
  // Days fill the width; a busy day (many shifts at once) gets wider so blocks stay readable.
  const gridTemplateColumns = `56px ${laneCounts.map((count) => `minmax(${Math.max(140, count * 68)}px, 1fr)`).join(" ")}`;
  const nowTop = ((nowMinutes < startMinutes ? nowMinutes + 24 * 60 : nowMinutes) - startMinutes) / 60 * TIMELINE_HOUR;

  return (
    <div className="min-w-max" style={{ minWidth: "100%" }} data-timeline-board>
      <div className="sticky top-0 z-20 grid border-b border-[var(--color-separator)] bg-white" style={{ gridTemplateColumns }}>
        <div className="sticky left-0 z-10 bg-white" />
        {weekDays.map((day) => {
          const isToday = day.iso === todayIso;
          const warningEntries = warningEntriesByDate[day.iso] ?? [];
          const isWarningOpen = openWarningDay === day.iso;
          return (
            <div key={`header-${day.iso}`} className="relative flex items-center justify-center gap-1.5 border-l border-[var(--color-separator)] py-2.5">
              <span className={cn("text-[12px] font-semibold uppercase", isToday ? "text-[var(--color-danger)]" : "text-[#3c3c43]")}>
                {formatDate(day.iso, lang, { weekday: "short" })}
              </span>
              <span className={cn("grid size-7 place-items-center rounded-full text-[15px] font-semibold", isToday ? "bg-[var(--color-danger)] text-white" : "text-black")}>
                {day.dayOfMonth}
              </span>
              <div className="absolute right-2 top-1/2 -translate-y-1/2">
                <DayWarningPopover
                  warningEntries={warningEntries}
                  isOpen={isWarningOpen}
                  onToggle={() => setOpenWarningDay(isWarningOpen ? null : day.iso)}
                  t={t}
                  buttonClassName="inline-flex size-6 items-center justify-center rounded-full bg-[var(--color-warning-fill)] text-[var(--color-warning)] transition hover:brightness-95"
                />
              </div>
            </div>
          );
        })}
      </div>

      <div className="grid" style={{ gridTemplateColumns }}>
        <div className="sticky left-0 z-10 bg-white" style={{ height: boardHeight + 12 }}>
          {timeSlots.slice(0, -1).map((slot, index) => (
            <span
              key={`time-${slot}`}
              className="absolute right-2 text-[12px] font-medium tabular-nums text-[var(--color-text-muted)]"
              style={{ top: index === 0 ? 4 : index * TIMELINE_HOUR - 8 }}
            >
              {boardHourLabel(slot)}
            </span>
          ))}
        </div>

        {weekDays.map((day) => {
          const isToday = day.iso === todayIso;
          const entries = entriesByDate[day.iso] ?? [];
          return (
            <div
              key={`column-${day.iso}`}
              className={cn("relative border-l border-[var(--color-separator)]", isToday && "bg-[var(--color-accent)]/30")}
              style={{ height: boardHeight + 12 }}
            >
              {Array.from({ length: hourCount }, (_item, index) => (
                <div key={`h-${index}`} className="pointer-events-none absolute inset-x-0" style={{ top: index * TIMELINE_HOUR }}>
                  {index > 0 ? <div className="border-t border-[var(--color-separator)]" /> : null}
                  <div className="border-t border-dashed border-[#ececf0]" style={{ marginTop: TIMELINE_HOUR / 2 }} />
                </div>
              ))}

              {entries.map((entry) => {
                const color = positionColor(entry.positionLabel, positionOrder);
                const top = ((entry.startMinutes - startMinutes) / 60) * TIMELINE_HOUR + 1;
                const height = Math.max(22, (entry.durationMinutes / 60) * TIMELINE_HOUR - 3);
                const width = 100 / entry.laneCount;
                const names = entry.assignedNames.join(", ");
                const timeLabel = `${formatTime(entry.startTime)}–${formatTime(entry.endTime)}`;
                const shortTime = `${shortClock(entry.startTime)}–${shortClock(entry.endTime)}`;
                return (
                  <div
                    key={entry.key}
                    data-timeline-event={timeLabel}
                    data-timeline-open={entry.isOpen ? "true" : undefined}
                    title={`${timeLabel} · ${entry.positionLabel}${names ? ` · ${names}` : ""}${entry.isOpen ? ` · ${entry.metaLabel}` : ""}`}
                    className={cn(
                      "absolute overflow-hidden rounded-[10px] px-2 py-1.5 text-left",
                      entry.isConflict && "ring-2 ring-[var(--color-danger)]",
                    )}
                    style={{
                      top,
                      height,
                      left: `calc(${entry.lane * width}% + 3px)`,
                      width: `calc(${width}% - 6px)`,
                      ...(entry.isOpen
                        ? { backgroundColor: "rgba(255,255,255,0.92)", border: `1.5px dashed ${color}` }
                        : { backgroundColor: tint(color, entry.isMine ? 0.26 : 0.16), boxShadow: `inset 3px 0 0 ${color}` }),
                    }}
                  >
                    <p className="truncate text-[12px] font-semibold tabular-nums leading-4 text-black">{shortTime}</p>
                    {entry.isOpen ? (
                      <>
                        <p className="mt-0.5 truncate text-[13px] font-semibold leading-4" style={{ color }}>
                          {t("schedule.open_short")}
                          {entry.missingCount > 1 ? ` × ${entry.missingCount}` : ""}
                        </p>
                        <p className="truncate text-[12px] leading-4 text-[#3c3c43]">{entry.positionLabel}</p>
                      </>
                    ) : (
                      <>
                        {(entry.assignedNames.length ? entry.assignedNames : [t("schedule.assigned_label")]).slice(0, 3).map((name) => (
                          <p key={name} className="mt-0.5 truncate text-[13px] font-medium leading-4 text-black">
                            {name.split(" ")[0]}
                          </p>
                        ))}
                        {height >= 96 ? <p className="mt-0.5 truncate text-[12px] leading-4 text-[#3c3c43]">{entry.positionLabel}</p> : null}
                      </>
                    )}
                    {entry.isConflict ? (
                      <span className="mt-1 inline-block rounded-full bg-[var(--color-danger-fill)] px-1.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--color-danger)]">
                        {t("schedule.conflict")}
                      </span>
                    ) : null}
                  </div>
                );
              })}

              {isToday && nowTop >= 0 && nowTop <= boardHeight ? (
                <div className="pointer-events-none absolute inset-x-0 z-10" style={{ top: nowTop }} data-now-line>
                  <div className="relative border-t-2 border-[var(--color-danger)]">
                    <span className="absolute -left-1.5 -top-[5px] size-2 rounded-full bg-[var(--color-danger)]" />
                  </div>
                </div>
              ) : null}
            </div>
          );
        })}
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
  /** The slot's position; kept when someone else is assigned (people can work several positions). */
  position?: string | null;
};

type TeamAvailabilityEditorState = {
  userId: string;
  fullName: string;
  slots: AvailabilityPreferenceSlot[];
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

function workDateLabel(value: string, lang: Lang): string {
  return formatDate(value, lang, { year: "numeric", month: "2-digit", day: "2-digit" });
}

function latestTimesheet(entries: TimesheetEntry[]): TimesheetEntry | undefined {
  return [...entries].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];
}



export type ScheduleSection = "calendar" | "availability" | "requests" | "hours";

function RoundAction({ tone, label, onClick, disabled }: { tone: "approve" | "reject"; label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className={
        tone === "approve"
          ? "grid size-10 shrink-0 place-items-center rounded-full bg-[var(--color-success-fill)] text-[var(--color-success)] active:opacity-60 disabled:opacity-40"
          : "grid size-10 shrink-0 place-items-center rounded-full bg-[var(--color-danger-fill)] text-[var(--color-danger)] active:opacity-60 disabled:opacity-40"
      }
    >
      {tone === "approve" ? <Check className="size-5" strokeWidth={3} /> : <X className="size-5" strokeWidth={3} />}
    </button>
  );
}

export function SchedulePage({ section = "calendar" }: { section?: ScheduleSection }) {
  const { t, lang } = useLanguage();
  const location = useLocation();
  const { token, me } = useAuth();
  const toast = useToast();
  const queryClient = useQueryClient();
  const isTimesheetsRoute = section === "hours";
  const navigate = useNavigate();
  const [calendarView, setCalendarView] = useState<"grid" | "timeline">("grid");
  const isPhone = useMediaQuery("(max-width: 767px)");



  const effectiveRoles = useMemo(() => {

    const directRole = me?.role ? [me.role] : [];

    const membershipRoles = (me?.memberships ?? []).map((item) => item.role);

    return Array.from(new Set([...directRole, ...membershipRoles]));

  }, [me]);

  const isStaff = effectiveRoles.includes("STAFF");

  const isManagerView = effectiveRoles.includes("ADMIN") || effectiveRoles.includes("MANAGER");
  const timesheetsEnabled = hasPlanFeature(me, "timesheets");
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
  const [teamAvailabilityEditor, setTeamAvailabilityEditor] = useState<TeamAvailabilityEditorState | null>(null);
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
    if (!shift && entry.shift_id && !entry.is_restricted_entry) return "";
    if (!shift || entry.is_restricted_entry) return t("schedule.extra_entry");
    const plannedMinutes = durationMinutes(shift.start_time, shift.end_time);
    const reportedMinutes = durationMinutes(entry.arrived_at, entry.left_at);
    const deltaMinutes = reportedMinutes - plannedMinutes;
    if (deltaMinutes === 0) return t("schedule.on_time");
    return formatDurationDelta(deltaMinutes);
  };



  const positionsCatalogQuery = useQuery({
    queryKey: ["positions"],
    queryFn: () => api.listPositions(token!),
    enabled: Boolean(token) && me?.role !== "STAFF",
  });
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

    enabled: Boolean(token) && isStaff && timesheetsEnabled,

  });

  const pendingTimesheetsQuery = useQuery({

    // Pending reports need attention whatever week is on screen, so they are not filtered by week.
    queryKey: ["timesheets", "pending"],
    queryFn: () => api.listTimesheets(token!, { scope: "pending" }),

    enabled: Boolean(token) && isManagerView && timesheetsEnabled,

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
      getWeekDays(weekStart, lang).map((day, index) => ({
        ...day,
        title: dayShortNames[index] ?? day.title,
      })),
    [dayShortNames, lang, weekStart],
  );
  const weekRangeCompactLabel = useMemo(() => formatWeekRangeCompact(weekStart, lang), [lang, weekStart]);
  const todayIso = toLocalIso(new Date());
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


  // Edits made in the open draft since it was opened; leaving with any asks to publish first.
  const [draftEdits, setDraftEdits] = useState(0);
  const markDraftEdited = () => setDraftEdits((count) => count + 1);

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
      markDraftEdited();
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
      markDraftEdited();
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
      markDraftEdited();
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
  const approveAvailabilityMutation = useMutation({
    mutationFn: (userId: string) => api.approveAvailability(token!, weekStart, userId),
    onSuccess: () => {
      toast.success(t("schedule.availability_approved"));
      void queryClient.invalidateQueries({ queryKey: ["team-availability-summary", weekStart] });
      void queryClient.invalidateQueries({ queryKey: ["availability", weekStart] });
    },
    onError: (error) => {
      toast.error(t("schedule.approve_availability_failed"), error instanceof Error ? error.message : undefined);
    },
  });
  const saveTeamAvailabilityEditorMutation = useMutation({
    mutationFn: () => {
      if (!teamAvailabilityEditor) {
        throw new Error("Missing team availability editor state.");
      }
      return api.putAvailability(token!, weekStart, {
        user_id: teamAvailabilityEditor.userId,
        desired_hours: teamAvailabilityEditorDesiredHoursForApi,
        slots: teamAvailabilityEditor.slots,
      });
    },
    onSuccess: () => {
      setTeamAvailabilityEditor(null);
      toast.success(t("schedule.availability_saved"));
      void queryClient.invalidateQueries({ queryKey: ["team-availability-summary", weekStart] });
      void queryClient.invalidateQueries({ queryKey: ["availability", weekStart] });
    },
    onError: (error) => {
      toast.error(t("team.availability_failed"), error instanceof Error ? error.message : undefined);
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
      const isMine = shift.assignments.some((assignment) => assignment.user_id === me?.id);
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
          isMine,
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
          isMine: false,
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
  }, [conflictingShiftIds, managerShifts, me?.id, memberNameById, t, weekDays]);

  const appliedTimetableByDate = useMemo(() => {
    const map: Record<string, AppliedTimetableLayoutEntry[]> = {};
    for (const day of weekDays) {
      map[day.iso] = packTimetableEntries(appliedEntriesByDate[day.iso] ?? []);
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

  // Live totals for the draft: recomputed whenever the stored draft changes.
  const draftSummaryQuery = useQuery({
    queryKey: ["draft-summary", weekStart, locationFilter, weeklyOverridesQuery.dataUpdatedAt],
    queryFn: () => api.previewSchedule(token!, weekStart, locationFilter || undefined),
    enabled: Boolean(token) && isManagerView && scheduleStage === "preview" && Boolean(locationFilter),
  });

  const hasSavedDraft = useMemo(
    () =>
      !weeklyOverridesQuery.isPlaceholderData &&
      (weeklyOverridesQuery.data ?? []).some((item) => item.location_id === locationFilter && !item.is_deleted),
    [weeklyOverridesQuery.data, weeklyOverridesQuery.isPlaceholderData, locationFilter],
  );

  useEffect(() => {
    if (!isManagerView || !locationFilter) return;
    if (managerShifts.length > 0 && scheduleStage === "idle") {
      setScheduleStage("applied");
    }
    if (managerShifts.length === 0 && scheduleStage === "applied") {
      setScheduleStage("idle");
    }
    // A generated draft is stored on the server; reopen it after a reload instead of losing the work.
    if (managerShifts.length === 0 && scheduleStage === "idle" && hasSavedDraft) {
      setScheduleStage("preview");
    }
  }, [isManagerView, locationFilter, managerShifts.length, scheduleStage, hasSavedDraft]);

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
    const submittedThisWeek = Object.values(managerAvailabilitySlotsByUserDay[member.id] ?? {}).some((slots) => slots.length > 0);
    // Overnight ranges (e.g. 18:00-02:00) end on the next day, so compare them on a 0-48h scale.
    const toRange = (from: string, to: string) => {
      const start = timeToMinutes(from);
      const end = timeToMinutes(to);
      return [start, end <= start ? end + 24 * 60 : end] as const;
    };
    const [wantedStart, wantedEnd] = toRange(startTime, endTime);
    const fullyAvailable = availableSlots.some((slot) => {
      const [slotStart, slotEnd] = toRange(slot.start_time, slot.end_time);
      return slotStart <= wantedStart && slotEnd >= wantedEnd;
    });
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
      return submittedThisWeek
        ? { rank: 3, tone: "warning" as const, label: t("schedule.day_off_in_availability") }
        : { rank: 2, tone: "muted" as const, label: t("schedule.no_submitted_availability") };
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
      position: entry.staff_position ?? null,
    });
  };

  useEffect(() => {
    if (scheduleStage !== "preview") setDraftEdits(0);
  }, [scheduleStage]);
  const draftBlocker = useUnsavedChangesBlocker(scheduleStage === "preview" && draftEdits > 0);

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
  const pendingByDate = useMemo(() => {
    const groups = new Map<string, TimesheetEntry[]>();
    for (const entry of [...visiblePendingTimesheets].sort((a, b) => a.work_date.localeCompare(b.work_date) || a.arrived_at.localeCompare(b.arrived_at))) {
      groups.set(entry.work_date, [...(groups.get(entry.work_date) ?? []), entry]);
    }
    return [...groups.entries()];
  }, [visiblePendingTimesheets]);

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
  const teamAvailabilityEditorDesiredHours = useMemo(
    () =>
      teamAvailabilityEditor
        ? Math.round(teamAvailabilityEditor.slots.reduce((sum, slot) => sum + shiftHours(slot.start_time, slot.end_time), 0) * 10) / 10
        : 0,
    [teamAvailabilityEditor],
  );

  const availabilityDesiredHoursForApi = useMemo(() => Math.round(availabilityDesiredHours), [availabilityDesiredHours]);
  const teamAvailabilityEditorDesiredHoursForApi = useMemo(() => Math.round(teamAvailabilityEditorDesiredHours), [teamAvailabilityEditorDesiredHours]);

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

  const setTeamAvailabilityDayEnabled = (dayIndex: number, enabled: boolean) => {
    setTeamAvailabilityEditor((current) => {
      if (!current) return current;
      const remaining = current.slots.filter((slot) => slot.day_of_week !== dayIndex);
      return {
        ...current,
        slots: enabled
          ? [...remaining, { day_of_week: dayIndex, start_time: "11:00:00", end_time: "19:00:00", is_available: true }]
          : remaining,
      };
    });
  };

  const updateTeamAvailabilityDayTime = (dayIndex: number, field: "start_time" | "end_time", value: string, baseline?: AvailabilityPreferenceSlot) => {
    setTeamAvailabilityEditor((current) => {
      if (!current) return current;
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

  const availabilityLocked = Boolean(availabilityQuery.data?.locked_at);
  const availabilityCard = canEditOwnAvailability ? (
    <div className="-mx-4 sm:-mx-6">
      {!isManagerView ? (
        <div className="flex items-center justify-between gap-2 px-4 pb-2 sm:px-6">
          <Button size="icon" variant="ghost" aria-label={t("schedule.previous_week")} onClick={() => setWeekStart((current) => shiftWeek(current, -7))}>
            <ChevronLeft className="size-5" />
          </Button>
          <span className="text-[15px] font-semibold text-black">
            {weekDays[0]?.caption} – {weekDays[6]?.caption}
          </span>
          <Button size="icon" variant="ghost" aria-label={t("schedule.next_week")} onClick={() => setWeekStart((current) => shiftWeek(current, 7))}>
            <ChevronRight className="size-5" />
          </Button>
        </div>
      ) : null}
      <ListSection
        header={isManagerView && !isStaff ? t("schedule.my_availability") : t("schedule.availability")}
        footer={availabilityLocked ? t("schedule.week_locked") : isManagerView && !isStaff ? t("schedule.manager_availability_description") : t("schedule.availability_description")}
      >
        {weekDays.map((day, index) => {
          const slots = availabilitySlotsByDay[index] ?? [];
          const firstSlot = slots[0];
          const enabled = Boolean(firstSlot);
          return (
            <li key={`availability-${day.iso}`} className="px-4 py-2.5 sm:px-6">
              <div className="flex min-h-[44px] items-center gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-[16px] text-black">{day.title}</p>
                  <p className="text-[13px] text-[#6c6c70]">{enabled ? day.caption : `${day.caption} · ${t("schedule.off")}`}</p>
                </div>
                <Switch checked={enabled} onChange={(next) => setAvailabilityDayEnabled(index, next)} label={day.title} disabled={availabilityLocked} />
              </div>
              {enabled ? (
                <div className="mt-1.5 flex items-center gap-2 pb-1">
                  <input
                    type="time"
                    aria-label={t("schedule.start_time_label")}
                    value={firstSlot.start_time.slice(0, 5)}
                    disabled={availabilityLocked}
                    onChange={(event) => updateAvailabilityDayTime(index, "start_time", event.target.value, firstSlot)}
                    className="plain-time-input h-10 min-w-0 flex-1 rounded-[10px] bg-[var(--color-grouped)] px-3 text-center text-[16px] tabular-nums text-black outline-none focus:ring-2 focus:ring-[var(--color-primary)] disabled:opacity-60 sm:max-w-[140px] sm:flex-none"
                  />
                  <span className="text-[#6c6c70]">–</span>
                  <input
                    type="time"
                    aria-label={t("schedule.end_time_label")}
                    value={firstSlot.end_time.slice(0, 5)}
                    disabled={availabilityLocked}
                    onChange={(event) => updateAvailabilityDayTime(index, "end_time", event.target.value, firstSlot)}
                    className="plain-time-input h-10 min-w-0 flex-1 rounded-[10px] bg-[var(--color-grouped)] px-3 text-center text-[16px] tabular-nums text-black outline-none focus:ring-2 focus:ring-[var(--color-primary)] disabled:opacity-60 sm:max-w-[140px] sm:flex-none"
                  />
                </div>
              ) : null}
            </li>
          );
        })}
      </ListSection>
      <div className="flex items-center justify-between gap-3 px-4 pb-6 sm:px-6">
        <p className="text-[15px] text-[#3c3c43]">
          <span className="text-[22px] font-semibold tabular-nums text-black">{availabilityDesiredHours % 1 ? availabilityDesiredHours.toFixed(1) : availabilityDesiredHours}</span> {t("schedule.hours_per_week_short")}
        </p>
        <Button onClick={() => saveAvailabilityMutation.mutate()} disabled={saveAvailabilityMutation.isPending || availabilityLocked}>
          {t("common.save")}
        </Button>
      </div>
    </div>
  ) : null;

  const availabilityStatusBadgeClass = (status: TeamAvailabilitySummaryRow["status"]) => {
    if (status === "approved") return "border-emerald-200 bg-emerald-50 text-emerald-700";
    if (status === "filled") return "border-sky-200 bg-sky-50 text-sky-700";
    if (status === "partial") return "border-amber-200 bg-amber-50 text-amber-700";
    return "border-[var(--color-separator)] bg-[var(--color-grouped)] text-[var(--color-text-muted)]";
  };

  const availabilityStatusLabel = (status: TeamAvailabilitySummaryRow["status"]) => {
    if (status === "approved") return t("schedule.status_approved_availability");
    if (status === "filled") return t("schedule.status_filled");
    if (status === "partial") return t("schedule.status_partial");
    return t("schedule.status_empty");
  };

  const teamAvailabilityRows = (teamAvailabilityQuery.data ?? []).filter((item) => item.user_id !== me?.id);
  const dayLetters = weekDays.map((day) => formatDate(day.iso, lang, { weekday: "narrow" }));
  const teamAvailabilityCard = isManagerView ? (
    <div className="-mx-4 sm:-mx-6">
      <div className="flex items-center justify-between gap-2 px-4 pb-2 sm:px-6">
        <Button size="icon" variant="ghost" aria-label={t("schedule.previous_week")} onClick={() => setWeekStart((current) => shiftWeek(current, -7))}>
          <ChevronLeft className="size-5" />
        </Button>
        <span className="text-[15px] font-semibold text-black">
          {weekDays[0]?.caption} – {weekDays[6]?.caption}
        </span>
        <Button size="icon" variant="ghost" aria-label={t("schedule.next_week")} onClick={() => setWeekStart((current) => shiftWeek(current, 7))}>
          <ChevronRight className="size-5" />
        </Button>
      </div>
      <ListSection header={t("schedule.team_availability")} footer={t("schedule.team_availability_description")}>
        {teamAvailabilityRows.map((item) => {
          const availableDays = new Set((item.slots ?? []).filter((slot) => slot.is_available).map((slot) => slot.day_of_week));
          const openEditor = () =>
            setTeamAvailabilityEditor({
              userId: item.user_id,
              fullName: item.full_name,
              slots: (item.slots ?? []).map((slot) => ({ day_of_week: slot.day_of_week, start_time: slot.start_time, end_time: slot.end_time, is_available: slot.is_available })),
            });
          return (
            <li key={item.user_id} className="flex items-center gap-3 px-4 py-3 sm:px-6">
              <button type="button" onClick={openEditor} className="flex min-w-0 flex-1 items-center gap-3 text-left active:opacity-60">
                <WorkerAvatar name={item.full_name} size={36} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[16px] text-black">{item.full_name}</span>
                  <span className="mt-1 flex items-center gap-1" aria-label={t("schedule.items_count", { count: item.slots_count })}>
                    {dayLetters.map((letter, index) => (
                      <span
                        key={index}
                        className={
                          availableDays.has(index)
                            ? "grid size-[22px] place-items-center rounded-full bg-[var(--color-success)] text-[11px] font-semibold text-white"
                            : "grid size-[22px] place-items-center rounded-full bg-[var(--color-fill)] text-[11px] font-semibold text-[#6c6c70]"
                        }
                      >
                        {letter}
                      </span>
                    ))}
                    <span className="ml-1.5 whitespace-nowrap text-[13px] tabular-nums text-[#3c3c43]">{item.desired_hours} h</span>
                  </span>
                </span>
                <Badge tone={item.status === "approved" ? "green" : item.status === "empty" ? "neutral" : "orange"}>{availabilityStatusLabel(item.status)}</Badge>
              </button>
              {item.slots_count > 0 && item.status !== "approved" ? (
                <RoundAction tone="approve" label={t("schedule.approve_availability")} onClick={() => approveAvailabilityMutation.mutate(item.user_id)} disabled={approveAvailabilityMutation.isPending} />
              ) : null}
            </li>
          );
        })}
        {!teamAvailabilityRows.length ? <ListRow title={<span className="text-[var(--color-text-muted)]">{t("schedule.no_team_availability")}</span>} /> : null}
      </ListSection>
    </div>
  ) : null;



  const staffShiftById = Object.fromEntries((staffCalendarQuery.data ?? []).flatMap((day) => day.shifts).map((shift) => [shift.shift_id, shift]));
  const requestStatusTone = (status: string) =>
    status === "approved" ? "green" : status === "rejected" ? "red" : status === "cancelled" ? "neutral" : "orange";
  const staffWeekNav = (
    <div className="flex items-center justify-between gap-2 border-b border-[var(--color-separator)] py-2">
      <Button size="icon" variant="ghost" aria-label={t("schedule.previous_week")} onClick={() => setWeekStart((current) => shiftWeek(current, -7))}>
        <ChevronLeft className="size-5" />
      </Button>
      <span className="text-[15px] font-semibold text-black">
        {weekDays[0]?.caption} – {weekDays[6]?.caption}
      </span>
      <Button size="icon" variant="ghost" aria-label={t("schedule.next_week")} onClick={() => setWeekStart((current) => shiftWeek(current, 7))}>
        <ChevronRight className="size-5" />
      </Button>
    </div>
  );
  const staffOtherSection =
    section === "availability" ? (
      <div className="px-4 sm:px-6">{availabilityCard}</div>
    ) : section === "requests" ? (
      <ListSection header={t("schedule.my_requests")} footer={t("schedule.my_requests_footer")}>
        {(myRequestsQuery.data ?? []).map((request) => {
          const shift = staffShiftById[request.shift_id];
          return (
            <ListRow
              key={request.id}
              title={`${t(`schedule.request_type.${request.request_type}`)}${shift ? ` · ${shift.date} ${formatTime(shift.start_time)}–${formatTime(shift.end_time)}` : ""}`}
              subtitle={request.note ?? new Date(request.created_at).toLocaleDateString(lang)}
              trailing={<Badge tone={requestStatusTone(request.status)}>{t(`schedule.request_status.${request.status}`)}</Badge>}
            />
          );
        })}
        {!myRequestsQuery.data?.length ? <ListRow title={t("schedule.my_requests_empty")} /> : null}
      </ListSection>
    ) : (
      <div>
        {staffWeekNav}
        <ListSection
          header={t("schedule.my_hours")}
          footer={timesheetsEnabled ? (
            <Button variant="tinted" onClick={() => openExtraTimesheetModal(weekDays.some((day) => day.iso === todayIso) ? todayIso : weekDays[0]?.iso)}>
              <FileClock className="size-4" /> {t("schedule.report_extra_hours")}
            </Button>
          ) : null}
        >
          {(myTimesheetsQuery.data ?? []).map((entry) => (
            <ListRow
              key={entry.id}
              title={`${workDateLabel(entry.work_date, lang)} · ${formatTime(entry.arrived_at)}–${formatTime(entry.left_at)}`}
              subtitle={entry.is_restricted_entry ? t("schedule.extra_entry") : t("schedule.planned_entry")}
              trailing={<Badge tone={entry.status === "approved" || entry.status === "corrected" ? "green" : entry.status === "rejected" ? "red" : "orange"}>{statusText(entry.status)}</Badge>}
            />
          ))}
          {!myTimesheetsQuery.data?.length ? <ListRow title={t("schedule.my_hours_empty")} /> : null}
        </ListSection>
      </div>
    );

  // ---- Shift editor (draft) ----
  const positionsByUser = useMemo(() => {
    const map: Record<string, string[]> = {};
    for (const user of usersQuery.data ?? []) map[user.id] = user.positions?.length ? user.positions : user.staff_position ? [user.staff_position] : [];
    return map;
  }, [usersQuery.data]);
  const editorMember = sortedLocationMembers.find((member) => member.id === previewEditorModal?.userId) ?? null;
  const editorPosition = previewEditorModal?.position ?? (editorMember ? positionsByUser[editorMember.id]?.[0] ?? editorMember.staff_position ?? "" : "");
  const editorPositionOptions = Array.from(new Set([...(positionsCatalogQuery.data ?? []).map((item) => item.name), ...(editorPosition ? [editorPosition] : [])])).map((name) => ({ value: name, label: name }));
  // US rules: flag anyone this shift would push past 40 hours in the week.
  const usOvertimeRules = me?.organization_settings?.labor_rules !== "PL";
  const editorOriginalEntry = previewEditorModal?.overrideId
    ? Object.values(previewEntriesByDate).flat().find((entry) => entry.overrideId === previewEditorModal.overrideId)
    : undefined;
  const editorPeople = previewEditorModal
    ? sortedLocationMembers
        .filter((member) => member.role !== "ADMIN")
        .map((member) => {
          const availability = availabilityStatusForMember(member, previewEditorModal.dayIso, `${previewEditorModal.startTime}:00`, `${previewEditorModal.endTime}:00`, previewEditorModal.overrideId);
          const positions = positionsByUser[member.id] ?? (member.staff_position ? [member.staff_position] : []);
          const canWork = member.role === "MANAGER" || !editorPosition || positions.some((item) => item.toLowerCase() === editorPosition.toLowerCase());
          const hours = previewHoursByUser[member.id] ?? 0;
          const alreadyCounted = editorOriginalEntry?.assigned_user_id === member.id ? shiftHours(editorOriginalEntry.startTime, editorOriginalEntry.endTime) : 0;
          const hoursAfter = hours - alreadyCounted + shiftHours(previewEditorModal.startTime, previewEditorModal.endTime);
          const overtime = usOvertimeRules && hoursAfter > 40 + 1e-9;
          const tone = overtime ? ("warning" as const) : availability.tone;
          const hoursLabel = hoursAfter % 1 ? hoursAfter.toFixed(1) : hoursAfter;
          // Keep an availability problem visible and append the overtime note to it.
          const label = !overtime
            ? availability.label
            : availability.tone === "warning"
              ? `${availability.label} · ${t("schedule.overtime_short", { hours: hoursLabel })}`
              : t("schedule.overtime_warning", { hours: hoursLabel });
          const rank = (canWork ? 0 : 10) + Math.max(availability.rank, overtime ? 3 : 0);
          return { id: member.id, name: member.full_name, positions, canWork, tone, label, rank, hours: hours % 1 ? hours.toFixed(1) : hours };
        })
        .sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name))
    : [];
  const savePreviewEditor = () => {
    if (!previewEditorModal) return;
    const member = sortedLocationMembers.find((item) => item.id === previewEditorModal.userId);
    if (!member) return;
    // Whoever works it, the shift is for the chosen position: a manager put on a cook shift works as a cook.
    const staffPosition = editorPosition || (member.role === "STAFF" ? member.staff_position : null) || null;
    const requiredRole = staffPosition ? "STAFF" : member.role;
    patchPreviewEditMutation.mutate(
      previewEditorModal.mode === "create"
        ? {
            action: "create",
            shift_key: `create:${member.id}:${previewEditorModal.dayIso}`,
            location_id: locationFilter,
            day_of_week: previewEditorModal.dayIndex,
            start_time: `${previewEditorModal.startTime}:00`,
            end_time: `${previewEditorModal.endTime}:00`,
            required_role: requiredRole,
            staff_position: staffPosition,
            required_count: 1,
            assigned_user_id: member.id,
          }
        : {
            action: "upsert",
            shift_key: `override:${previewEditorModal.overrideId}`,
            start_time: `${previewEditorModal.startTime}:00`,
            end_time: `${previewEditorModal.endTime}:00`,
            assigned_user_id: member.id,
            required_role: requiredRole,
            staff_position: staffPosition,
            required_count: 1,
          },
      { onSuccess: () => setPreviewEditorModal(null) },
    );
  };

  // Drag and drop in the draft: another day, another person, or back to open shifts.
  const moveDraftShift = (shift: GridShift, target: GridDropTarget) => {
    patchPreviewEditMutation.mutate(
      { action: "upsert", shift_key: `override:${shift.key}`, day_of_week: target.dayIndex, assigned_user_id: target.personId },
      {
        onError: (error) => {
          const overlap = error instanceof Error && /overlap/i.test(error.message);
          toast.error(t("schedule.move_failed"), overlap ? t("schedule.move_overlap") : error instanceof Error ? error.message : undefined);
        },
      },
    );
  };

  // ---- Full-screen week grid (manager calendar) ----
  const positionOrder = (positionsCatalogQuery.data ?? []).map((item) => item.name);
  const gridDays: GridDay[] = weekDays.map((day) => ({
    iso: day.iso,
    weekday: formatDate(day.iso, lang, { weekday: "short" }),
    dayNumber: String(Number(day.iso.slice(8, 10))),
    isToday: day.iso === todayIso,
  }));
  const gridPeople: GridPerson[] = (locationMembersQuery.data ?? [])
    .filter((member) => member.role !== "ADMIN")
    .map((member) => ({ id: member.id, name: member.full_name, position: member.staff_position ?? (member.role === "MANAGER" ? t("shell.role.MANAGER") : null), maxHours: member.max_hours_per_week }));
  const gridShifts: GridShift[] =
    scheduleStage === "preview"
      ? previewOverridesForLocation.map((item) => {
          const entry = previewEntriesByDate[weekDays[item.day_of_week]?.iso ?? ""]?.find((candidate) => candidate.overrideId === item.id);
          return {
            key: item.id,
            dayIndex: item.day_of_week,
            start: item.start_time,
            end: item.end_time,
            position: item.staff_position ?? (item.required_role === "MANAGER" ? t("shell.role.MANAGER") : null),
            personId: item.assigned_user_id ?? null,
            missing: item.assigned_user_id ? 0 : 1,
            onClick: entry
              ? () => openPreviewEditModal(entry)
              : () =>
                  setPreviewEditorModal({
                    mode: "edit",
                    dayIso: weekDays[item.day_of_week]?.iso ?? weekStart,
                    dayIndex: item.day_of_week,
                    overrideId: item.id,
                    userId: "",
                    startTime: item.start_time.slice(0, 5),
                    endTime: item.end_time.slice(0, 5),
                    position: item.staff_position ?? null,
                  }),
          };
        })
      : managerShifts.flatMap((shift) => {
          const dayIndex = weekDays.findIndex((day) => day.iso === shift.date);
          const position = shift.staff_position ?? (shift.required_role === "MANAGER" ? t("shell.role.MANAGER") : null);
          const assigned = shift.assignments.map((assignment) => ({
            key: `${shift.id}:${assignment.id}`,
            dayIndex,
            start: shift.start_time,
            end: shift.end_time,
            position,
            personId: assignment.user_id,
          }));
          const missing = Math.max(0, shift.required_count - shift.assignments.length);
          return missing ? [...assigned, { key: `${shift.id}:open`, dayIndex, start: shift.start_time, end: shift.end_time, position, personId: null, missing }] : assigned;
        });
  const visibleDays = isPhone ? [gridDays[selectedDayIndex] ?? gridDays[0]] : gridDays;
  const visibleShifts = isPhone
    ? gridShifts.filter((shift) => shift.dayIndex === selectedDayIndex).map((shift) => ({ ...shift, dayIndex: 0 }))
    : gridShifts;
  const summary = draftSummaryQuery.data;
  const openCount = gridShifts.reduce((sum, shift) => sum + (shift.missing ?? 0), 0);
  const locations = locationsQuery.data ?? [];

  const managerCalendar = (
    <div className="flex flex-col md:h-[calc(100dvh-var(--nav-height)-8px)]">
      {me?.role === "ADMIN" ? <OnboardingChecklist /> : null}
      <div className="flex flex-wrap items-center gap-2 px-3 pb-2 sm:px-4">
        <div className="flex items-center">
          <Button size="icon" variant="ghost" aria-label={t("schedule.previous_week")} onClick={() => setWeekStart((current) => shiftWeek(current, -7))}>
            <ChevronLeft className="size-5" />
          </Button>
          <span className="min-w-[128px] text-center text-[15px] font-semibold tabular-nums text-black">{`${formatDate(weekDays[0]?.iso ?? weekStart, lang, { month: "short", day: "numeric" })} – ${formatDate(weekDays[6]?.iso ?? weekStart, lang, { month: "short", day: "numeric" })}`}</span>
          <Button size="icon" variant="ghost" aria-label={t("schedule.next_week")} onClick={() => setWeekStart((current) => shiftWeek(current, 7))}>
            <ChevronRight className="size-5" />
          </Button>
        </div>
        {locations.length > 1 ? (
          <div className="w-44">
            <Select options={locations.map((location) => ({ label: location.name, value: location.id }))} value={locationFilter} onChange={(event) => setLocationFilter(event.target.value)} />
          </div>
        ) : null}
        {scheduleStage === "preview" ? (
          <Badge tone="orange">{t("schedule.draft_badge")}</Badge>
        ) : scheduleStage === "applied" ? (
          <Badge tone="green">{t("schedule.published_badge")}</Badge>
        ) : (
          <Badge tone="neutral">{t("schedule.not_generated")}</Badge>
        )}
        {scheduleStage === "preview" && summary ? (
          <span className="hidden text-[14px] text-[#3c3c43] xl:inline">
            {t("schedule.summary_coverage", { filled: summary.coverage_summary.filled_slots, total: summary.coverage_summary.total_slots })}
            {" · "}
            {formatMoney(summary.labor_cost_summary.total_pln, currencyOf(me), lang, { decimals: 0 })}
          </span>
        ) : null}
        {openCount > 0 ? <Badge tone="red" className="max-md:hidden">{t("schedule.grid_open_count", { count: openCount })}</Badge> : null}
        {!isPhone && (scheduleStage === "preview" || scheduleStage === "applied") ? (
          <span className="hidden text-[13px] text-[var(--color-text-muted)] xl:inline">{t(scheduleStage === "preview" ? "schedule.drag_hint" : "schedule.drag_hint_published")}</span>
        ) : null}
        <div className="ml-auto flex flex-wrap items-center gap-2" data-tour="schedule-actions">
          {scheduleStage === "applied" && !isPhone ? (
            <Segmented
              ariaLabel={t("schedule.view")}
              value={calendarView}
              onChange={setCalendarView}
              options={[
                { value: "grid", label: t("schedule.view_grid") },
                { value: "timeline", label: t("schedule.view_timeline") },
              ]}
            />
          ) : null}
          <Button size="sm" variant="ghost" className="max-md:hidden" onClick={() => navigate("/team/templates")}>
            {t("sub.templates")}
          </Button>
          {scheduleStage === "preview" ? (
            <>
              <Button size="sm" variant="ghost" onClick={exitPreviewMode}>
                {t("schedule.close_draft")}
              </Button>
              <Button size="sm" variant="secondary" onClick={() => previewMutation.mutate({ resetOverrides: true, mode: "regenerate" })} disabled={previewMutation.isPending || !locationFilter}>
                <Sparkles className="size-4" /> {t("schedule.regenerate")}
              </Button>
              <Button size="sm" onClick={() => applyMutation.mutate()} disabled={applyMutation.isPending}>
                <ClipboardCheck className="size-4" /> {t("schedule.publish")}
              </Button>
            </>
          ) : scheduleStage === "applied" ? (
            <Button size="sm" onClick={() => previewMutation.mutate({ mode: "edit-from-applied" })} disabled={previewMutation.isPending || !locationFilter || shiftsQuery.isLoading}>
              <Pencil className="size-4" /> {t("schedule.edit_week")}
            </Button>
          ) : (
            <Button size="sm" onClick={() => previewMutation.mutate({ resetOverrides: false, mode: "generate" })} disabled={previewMutation.isPending || !locationFilter}>
              <Sparkles className="size-4" /> {t("schedule.generate")}
            </Button>
          )}
        </div>
      </div>
      {isPhone && (scheduleStage !== "idle" || gridShifts.length) ? (
        <div className="ios-island mx-3 mb-2">
          <DayStrip
            days={gridDays}
            selected={selectedDayIndex}
            onSelect={setSelectedDayIndex}
            openByDay={gridDays.map((_day, index) => gridShifts.filter((shift) => shift.dayIndex === index && shift.missing).length)}
          />
        </div>
      ) : null}
      <div className="min-h-0 flex-1 md:ios-island md:mx-3 md:mb-3">
        {scheduleStage === "idle" && !gridShifts.length ? (
          <div className="grid h-full place-items-center px-6 text-center">
            <div className="max-w-md">
              <p className="text-[20px] font-semibold text-black">{t("schedule.empty_title")}</p>
              <p className="mt-2 text-[15px] text-[var(--color-text-muted)]">{t("schedule.empty_body")}</p>
              <div className="mt-5 flex flex-wrap justify-center gap-2">
                <Button onClick={() => previewMutation.mutate({ resetOverrides: false, mode: "generate" })} disabled={previewMutation.isPending || !locationFilter}>
                  <Sparkles className="size-4" /> {t("schedule.generate")}
                </Button>
                <Button variant="secondary" onClick={() => navigate("/team/templates")}>
                  {t("sub.templates")}
                </Button>
              </div>
            </div>
          </div>
        ) : scheduleStage === "applied" && calendarView === "timeline" && !isPhone ? (
          <div className="h-full overflow-auto">
            <AppliedTimetableBoard
              weekDays={weekDays}
              entriesByDate={appliedTimetableByDate}
              warningEntriesByDate={appliedWarningEntriesByDate}
              timeSlots={appliedTimetableSlots}
              startMinutes={appliedTimetableStartMinutes}
              todayIso={todayIso}
              positionOrder={positionOrder}
              lang={lang}
              t={t}
            />
          </div>
        ) : isPhone ? (
          <DayList
            shifts={visibleShifts}
            people={gridPeople}
            positionOrder={positionOrder}
            t={t}
            onAdd={scheduleStage === "preview" ? () => openPreviewCreateModal(weekDays[selectedDayIndex]?.iso ?? weekStart) : undefined}
          />
        ) : (
          <WeekGrid
            days={visibleDays}
            people={gridPeople}
            shifts={visibleShifts}
            positionOrder={positionOrder}
            t={t}
            onMove={scheduleStage === "preview" ? moveDraftShift : undefined}
            onAdd={
              scheduleStage === "preview"
                ? (dayIndex, personId) => {
                    const realDay = isPhone ? selectedDayIndex : dayIndex;
                    openPreviewCreateModal(weekDays[realDay]?.iso ?? weekStart);
                    if (personId) setPreviewEditorModal((current) => (current ? { ...current, userId: personId } : current));
                  }
                : undefined
            }
          />
        )}
      </div>
    </div>
  );

  const pageTitle =
    section === "calendar" ? (isStaff ? t("sub.home") : t("schedule.title")) : isStaff && section === "hours" ? t("sub.my_hours") : t(`sub.${section}`);

  return (
    <AppShell
      title={pageTitle}
      fullBleed={section === "calendar" && !isStaff}
      flush={isStaff || section !== "calendar"}
      action={
        !isStaff && isTimesheetsRoute && visiblePendingTimesheets.length ? (
          <Button size="sm" onClick={() => approveVisibleTimesheetsMutation.mutate(visiblePendingTimesheets)} disabled={approveVisibleTimesheetsMutation.isPending || reviewTimesheetMutation.isPending}>
            <CheckCircle2 className="size-4" /> {t("schedule.approve_all_count", { count: visiblePendingTimesheets.length })}
          </Button>
        ) : undefined
      }
    >
      {isStaff && section !== "calendar" ? (
        staffOtherSection
      ) : isStaff ? (
        <>
        <ClockCard />
        {hasPlanFeature(me, "payroll") ? (
          <div className="mb-4 px-4 sm:px-6">
            <Button variant="tinted" className="w-full sm:w-auto" onClick={() => navigate("/payroll")}>
              <Wallet className="size-4" /> {t("home.check_payments")}
            </Button>
          </div>
        ) : null}
        <StaffWeek
          token={token!}
          meId={me?.id}
          lang={lang}
          t={t}
          weekDays={weekDays.map((day) => day.iso)}
          days={staffCalendarQuery.data ?? []}
          timesheetsByShift={myTimesheetsByShiftId}
          timesheetsEnabled={timesheetsEnabled}
          onReportHours={openShiftTimesheetModal}
          onReportExtra={(iso) => openExtraTimesheetModal(iso)}
          onPrev={() => setWeekStart((current) => shiftWeek(current, -7))}
          onNext={() => setWeekStart((current) => shiftWeek(current, 7))}
        />
        </>
      ) : section === "calendar" ? (
        managerCalendar
      ) : (


        <div>
          {section === "requests" ? (
            <ListSection header={t("schedule.incoming_requests")} footer={t("schedule.incoming_requests_description")}>
              {(incomingRequestsQuery.data ?? []).map((item) => {
                const shift = shiftsById[item.shift_id];
                return (
                  <li key={item.id} className="flex items-center gap-3 px-4 py-3 sm:px-6">
                    <WorkerAvatar name={item.requester_name} size={36} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[16px] text-black">
                        {item.requester_name}{" "}
                        <Badge tone={item.request_type === "swap" ? "orange" : "blue"} className="ml-1 align-middle">
                          {item.request_type === "swap" ? t("schedule.swap") : t("schedule.pickup")}
                        </Badge>
                      </p>
                      <p className="text-[14px] text-[#3c3c43]">
                        {item.shift_date && item.shift_start_time && item.shift_end_time
                          ? `${formatDate(item.shift_date, lang)} · ${formatTime(item.shift_start_time)}–${formatTime(item.shift_end_time)}${item.shift_position ? ` · ${item.shift_position}` : ""}`
                          : shift
                            ? `${formatDate(shift.date, lang)} · ${formatTime(shift.start_time)}–${formatTime(shift.end_time)}${shift.staff_position ? ` · ${shift.staff_position}` : ""}`
                            : null}
                      </p>
                      {item.request_type === "swap" && item.target_name && item.target_shift_date && item.target_shift_start_time && item.target_shift_end_time ? (
                        <p className="text-[14px] text-[#3c3c43]">
                          {t("schedule.swap_with", {
                            name: item.target_name,
                            shift: `${formatDate(item.target_shift_date, lang)} · ${formatTime(item.target_shift_start_time)}–${formatTime(item.target_shift_end_time)}`,
                          })}
                        </p>
                      ) : null}
                      {item.note ? <p className="mt-0.5 text-[14px] text-black">“{item.note}”</p> : null}
                    </div>
                    <RoundAction tone="approve" label={t("schedule.approve")} onClick={() => reviewShiftRequestMutation.mutate({ requestId: item.id, action: "approve" })} disabled={reviewShiftRequestMutation.isPending} />
                    <RoundAction tone="reject" label={t("schedule.reject")} onClick={() => reviewShiftRequestMutation.mutate({ requestId: item.id, action: "reject" })} disabled={reviewShiftRequestMutation.isPending} />
                  </li>
                );
              })}
              {!incomingRequestsQuery.data?.length ? <ListRow title={<span className="text-[var(--color-text-muted)]">{t("schedule.no_incoming_requests")}</span>} /> : null}
            </ListSection>
          ) : null}

          {section === "availability" && teamAvailabilityCard ? <div className="px-4 sm:px-6">{teamAvailabilityCard}</div> : null}
          {section === "availability" && availabilityCard ? <div className="px-4 pt-4 sm:px-6">{availabilityCard}</div> : null}

          {isTimesheetsRoute ? (
            <>
              {pendingByDate.map(([dateIso, entries]) => (
                <ListSection key={dateIso} header={formatDate(dateIso, lang, { weekday: "long", month: "short", day: "numeric" })}>
                  {entries.map((entry) => {
                    const shift = entry.shift_id ? shiftsById[entry.shift_id] : null;
                    const employeeName = timesheetUserNameById[entry.user_id] ?? entry.user_id.slice(0, 8);
                    const deltaLabel = deltaText(shift, entry);
                    const openCorrection = () =>
                      setReviewModal({ entry, arrived_at: toTimeInput(entry.arrived_at), left_at: toTimeInput(entry.left_at), review_note: entry.review_note ?? "" });
                    return (
                      <li key={entry.id} className="flex items-center gap-3 px-4 py-3 sm:px-6">
                        <button type="button" onClick={openCorrection} className="flex min-w-0 flex-1 items-center gap-3 text-left active:opacity-60">
                          <WorkerAvatar name={employeeName} size={36} />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[16px] text-black">{employeeName}</span>
                            <span className="block truncate text-[14px] text-[#3c3c43]">
                              {formatTime(entry.arrived_at)}–{formatTime(entry.left_at)}
                              {shift
                                ? ` · ${t("schedule.planned_short", { time: `${formatTime(shift.start_time)}–${formatTime(shift.end_time)}` })}`
                                : entry.shift_id
                                  ? ` · ${t("schedule.planned_entry")}`
                                  : ` · ${t("schedule.extra_hours_without_shift")}`}
                            </span>
                            {entry.note ? <span className="block truncate text-[13px] text-[#6c6c70]">{entry.note}</span> : null}
                          </span>
                          {deltaLabel && deltaLabel !== t("schedule.extra_entry") ? (
                            <Badge tone={deltaLabel.startsWith("+") ? "orange" : deltaLabel.startsWith("-") ? "blue" : "green"}>{deltaLabel}</Badge>
                          ) : null}
                        </button>
                        <RoundAction tone="approve" label={t("schedule.approve")} onClick={() => reviewTimesheetMutation.mutate({ entry, payload: { action: "approve" } })} disabled={reviewTimesheetMutation.isPending} />
                        <RoundAction tone="reject" label={t("schedule.reject")} onClick={() => reviewTimesheetMutation.mutate({ entry, payload: { action: "reject" } })} disabled={reviewTimesheetMutation.isPending} />
                      </li>
                    );
                  })}
                </ListSection>
              ))}
              {!visiblePendingTimesheets.length ? (
                <div className="px-4 py-16 text-center sm:px-6">
                  <CheckCircle2 className="mx-auto size-12 text-[var(--color-success)]" />
                  <p className="mt-3 text-[20px] font-semibold text-black">{t("schedule.all_hours_reviewed")}</p>
                  <p className="mt-1 text-[15px] text-[var(--color-text-muted)]">{t("schedule.no_pending_timesheets")}</p>
                </div>
              ) : (
                <p className="px-4 pb-6 text-[13px] text-[var(--color-text-muted)] sm:px-6">{t("schedule.hours_tap_hint")}</p>
              )}
            </>
          ) : null}
        </div>

      )}

      <Sheet
        open={Boolean(previewEditorModal)}
        onClose={() => setPreviewEditorModal(null)}
        title={previewEditorModal?.mode === "create" ? t("schedule.add_shift") : t("schedule.edit_shift")}
        subtitle={previewEditorModal ? formatDate(previewEditorModal.dayIso, lang, { weekday: "long", month: "long", day: "numeric" }) : undefined}
        action={{
          label: t("common.save"),
          onClick: savePreviewEditor,
          disabled: !previewEditorModal || patchPreviewEditMutation.isPending || !previewEditorModal.userId || !locationFilter || previewEditorModal.startTime === previewEditorModal.endTime,
        }}
      >
        {previewEditorModal ? (
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="mb-1.5 block text-[13px] font-semibold text-[var(--color-text-muted)]">{t("schedule.start_time_label")}</span>
                <Input type="time" value={previewEditorModal.startTime} onChange={(event) => setPreviewEditorModal((current) => (current ? { ...current, startTime: event.target.value } : current))} />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-[13px] font-semibold text-[var(--color-text-muted)]">{t("schedule.end_time_label")}</span>
                <Input type="time" value={previewEditorModal.endTime} onChange={(event) => setPreviewEditorModal((current) => (current ? { ...current, endTime: event.target.value } : current))} />
              </label>
            </div>
            {editorPositionOptions.length ? (
              <label className="block">
                <span className="mb-1.5 block text-[13px] font-semibold text-[var(--color-text-muted)]">{t("team.position")}</span>
                <Select value={editorPosition} onChange={(event) => setPreviewEditorModal((current) => (current ? { ...current, position: event.target.value } : current))} options={editorPositionOptions} />
              </label>
            ) : null}
            <div>
              <h3 className="ios-section-header pb-2">{t("schedule.who_works")}</h3>
              <ul className="divide-y divide-[#e5e5ea] rounded-2xl border border-[#e5e5ea] px-3">
                {editorPeople.map((person) => {
                  const selected = person.id === previewEditorModal.userId;
                  return (
                    <li key={person.id}>
                      <button
                        type="button"
                        aria-pressed={selected}
                        onClick={() => setPreviewEditorModal((current) => (current ? { ...current, userId: person.id } : current))}
                        className="flex min-h-[56px] w-full items-center gap-3 py-2 text-left active:bg-[var(--color-fill)]"
                      >
                        <span className={selected ? "grid size-6 place-items-center rounded-full bg-[var(--color-primary-strong)] text-white" : "size-6 rounded-full border-2 border-[#c7c7cc]"}>
                          {selected ? <Check className="size-4" strokeWidth={3} /> : null}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[16px] text-black">
                            {person.name}
                            <span className="text-[#3c3c43]"> · {person.positions.join(", ") || t("team.position_none")}</span>
                          </span>
                          <span
                            className={
                              person.canWork && person.tone === "ok"
                                ? "block text-[14px] font-semibold text-[var(--color-success)]"
                                : !person.canWork || person.tone === "warning"
                                  ? "block text-[14px] font-semibold text-[var(--color-warning)]"
                                  : "block text-[14px] text-[#3c3c43]"
                            }
                          >
                            {person.canWork ? person.label : t("schedule.not_this_position")}
                          </span>
                        </span>
                        <span className="shrink-0 text-[13px] tabular-nums text-[#3c3c43]">{person.hours} h</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
            {previewEditorModal.mode === "edit" && previewEditorModal.overrideId ? (
              <Button
                variant="danger-plain"
                onClick={() =>
                  patchPreviewEditMutation.mutate(
                    { action: "delete", shift_key: `override:${previewEditorModal.overrideId}` },
                    { onSuccess: () => setPreviewEditorModal(null) },
                  )
                }
                disabled={patchPreviewEditMutation.isPending}
              >
                <Trash2 className="size-4" /> {t("schedule.delete_shift")}
              </Button>
            ) : null}
          </div>
        ) : null}
      </Sheet>

      <Sheet
        open={Boolean(teamAvailabilityEditor)}
        onClose={() => setTeamAvailabilityEditor(null)}
        title={t("schedule.approve_availability")}
        subtitle={teamAvailabilityEditor?.fullName}
        action={{ label: t("common.save"), onClick: () => saveTeamAvailabilityEditorMutation.mutate(), disabled: saveTeamAvailabilityEditorMutation.isPending }}
      >
        {teamAvailabilityEditor ? (
          <div>
                <div className="grid gap-4">
                  <div>
                    <p className="text-[11px] uppercase tracking-[0.14em] text-[var(--color-text-muted)]">{t("schedule.hours_per_week")}</p>
                    <div className="mt-1 flex items-baseline gap-2">
                      <p className="text-2xl font-semibold tracking-[-0.01em] text-[var(--color-heading)]">{teamAvailabilityEditorDesiredHours.toFixed(1)}</p>
                      <p className="text-sm text-[var(--color-text-muted)]">{t("schedule.derived_from_ranges")}</p>
                    </div>
                  </div>
                  <div className="grid gap-3 md:grid-cols-2">
                    {weekDays.map((day, index) => {
                      const slots = teamAvailabilityEditor.slots.filter((slot) => slot.day_of_week === index);
                      const firstSlot = slots[0];
                      const enabled = Boolean(firstSlot);
                      return (
                        <div key={`team-availability-editor-${day.iso}`} className="rounded-[12px] border border-[var(--color-border)] bg-white px-4 py-4">
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--color-text-muted)]">{day.title}</p>
                              <p className="text-xs text-[var(--color-text-muted)]">{day.caption}</p>
                            </div>
                            <Switch checked={enabled} label={day.title} onChange={(next) => setTeamAvailabilityDayEnabled(index, next)} />
                          </div>
                          <p className="mt-2 text-xs font-medium text-[var(--color-text-muted)]">{enabled ? t("schedule.available") : t("schedule.off")}</p>
                          <div className="mt-3 grid gap-3 sm:grid-cols-2">
                            <input
                              type="time"
                              value={firstSlot ? firstSlot.start_time.slice(0, 5) : ""}
                              disabled={!enabled}
                              onChange={(event) => updateTeamAvailabilityDayTime(index, "start_time", event.target.value, firstSlot)}
                              className="h-11 w-full border-0 border-b border-[var(--color-border)] bg-transparent px-0 text-base text-[var(--color-heading)] outline-none focus:border-[var(--color-primary)] disabled:text-[var(--color-text-muted)] sm:text-sm"
                            />
                            <input
                              type="time"
                              value={firstSlot ? firstSlot.end_time.slice(0, 5) : ""}
                              disabled={!enabled}
                              onChange={(event) => updateTeamAvailabilityDayTime(index, "end_time", event.target.value, firstSlot)}
                              className="h-11 w-full border-0 border-b border-[var(--color-border)] bg-transparent px-0 text-base text-[var(--color-heading)] outline-none focus:border-[var(--color-primary)] disabled:text-[var(--color-text-muted)] sm:text-sm"
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
        ) : null}
      </Sheet>

      <Sheet
        open={Boolean(timesheetModal)}
        onClose={() => setTimesheetModal(null)}
        title={timesheetModal?.mode === "shift" ? t("schedule.report_hours") : t("schedule.report_extra_hours")}
        subtitle={
          timesheetModal
            ? timesheetModal.mode === "shift"
              ? `${workDateLabel(timesheetModal.workDate, lang)} · ${timesheetModal.shift.location_name}`
              : `${t("schedule.restricted_entry_for")} ${workDateLabel(timesheetModal.workDate, lang)}`
            : undefined
        }
        action={{
          label: t("schedule.submit_report"),
          onClick: () => timesheetModal && createTimesheetMutation.mutate({ modal: timesheetModal, form: timesheetForm }),
          disabled: createTimesheetMutation.isPending || !timesheetForm.arrived_at || !timesheetForm.left_at,
        }}
      >
        {timesheetModal ? (
          <div>
            <div className="grid gap-4">
              {timesheetModal.mode === "extra" ? (
                <label className="grid gap-1.5 text-[13px] font-semibold text-[var(--color-text-muted)]">
                  {t("schedule.work_date")}
                  <Input
                    type="date"
                    value={timesheetModal.workDate}
                    onChange={(event) => setTimesheetModal({ mode: "extra", workDate: event.target.value })}
                  />
                </label>
              ) : null}
              <div className="grid grid-cols-2 gap-3">
                <label className="grid gap-1.5 text-[13px] font-semibold text-[var(--color-text-muted)]">
                  {t("schedule.arrived_at")}
                  <Input
                    type="time"
                    value={timesheetForm.arrived_at}
                    onChange={(event) => setTimesheetForm((current) => ({ ...current, arrived_at: event.target.value }))}
                  />
                </label>
                <label className="grid gap-1.5 text-[13px] font-semibold text-[var(--color-text-muted)]">
                  {t("schedule.left_at")}
                  <Input
                    type="time"
                    value={timesheetForm.left_at}
                    onChange={(event) => setTimesheetForm((current) => ({ ...current, left_at: event.target.value }))}
                  />
                </label>
              </div>
              <label className="grid gap-1.5 text-[13px] font-semibold text-[var(--color-text-muted)]">
                {t("schedule.note")}
                <Textarea
                  rows={3}
                  placeholder={t("schedule.note_placeholder")}
                  value={timesheetForm.note}
                  onChange={(event) => setTimesheetForm((current) => ({ ...current, note: event.target.value }))}
                />
              </label>
              {timesheetModal.mode === "shift" && timesheetModal.assignmentStatus === "in_shift" ? (
                <p className="rounded-[12px] bg-amber-50 px-3 py-2 text-sm text-amber-700">
                  {t("schedule.shift_timer_notice")}
                </p>
              ) : null}
            </div>
            </div>
        ) : null}
      </Sheet>

      <Sheet
        open={Boolean(reviewModal)}
        onClose={() => setReviewModal(null)}
        title={t("schedule.correct_timesheet")}
        subtitle={reviewModal ? `${timesheetUserNameById[reviewModal.entry.user_id] ?? reviewModal.entry.user_id.slice(0, 8)} · ${workDateLabel(reviewModal.entry.work_date, lang)}` : undefined}
        action={{
          label: t("schedule.save_correction"),
          onClick: () =>
            reviewModal &&
            reviewTimesheetMutation.mutate({
              entry: reviewModal.entry,
              payload: {
                action: "correct",
                arrived_at: toApiTime(reviewModal.arrived_at),
                left_at: toApiTime(reviewModal.left_at),
                review_note: reviewModal.review_note.trim() || undefined,
              },
            }),
          disabled: !reviewModal || reviewTimesheetMutation.isPending || !reviewModal.arrived_at || !reviewModal.left_at,
        }}
      >
        {reviewModal ? (
          <div>
            <div className="grid gap-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="grid gap-1.5 text-[13px] font-semibold text-[var(--color-text-muted)]">
                  {t("schedule.arrived_at")}
                  <Input
                    type="time"
                    value={reviewModal.arrived_at}
                    onChange={(event) => setReviewModal((current) => (current ? { ...current, arrived_at: event.target.value } : current))}
                  />
                </label>
                <label className="grid gap-1.5 text-[13px] font-semibold text-[var(--color-text-muted)]">
                  {t("schedule.left_at")}
                  <Input
                    type="time"
                    value={reviewModal.left_at}
                    onChange={(event) => setReviewModal((current) => (current ? { ...current, left_at: event.target.value } : current))}
                  />
                </label>
              </div>
              <label className="grid gap-1.5 text-[13px] font-semibold text-[var(--color-text-muted)]">
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
        ) : null}
      </Sheet>

      <UnsavedDialog
        open={draftBlocker.state === "blocked"}
        title={t("schedule.leave_draft_title")}
        body={t("schedule.leave_draft_body")}
        saveLabel={t("schedule.publish")}
        discardLabel={t("schedule.leave_as_draft")}
        cancelLabel={t("unsaved.keep_editing")}
        saving={applyMutation.isPending}
        onSave={() =>
          applyMutation.mutate(undefined, {
            onSuccess: () => {
              if (draftBlocker.state === "blocked") draftBlocker.proceed();
            },
          })
        }
        onDiscard={() => draftBlocker.state === "blocked" && draftBlocker.proceed()}
        onCancel={() => draftBlocker.state === "blocked" && draftBlocker.reset()}
      />
    </AppShell>

  );

}
