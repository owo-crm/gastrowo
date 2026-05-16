import { useEffect, useMemo, useState } from "react";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  FileClock,
  CheckCircle2,
  ListFilter,
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

import { Input } from "@/components/ui/input";

import { Select } from "@/components/ui/select";

import { Textarea } from "@/components/ui/textarea";

import { api } from "@/lib/api";

import { useAuth } from "@/lib/auth";
import { useToast } from "@/lib/toast";

import { formatTime, getMonday } from "@/lib/date";

import type {
  AvailabilityPreferenceSlot,
  SchedulePreview,
  SchedulePreviewCalendar,
  Shift,
  ShiftRequest,
  StaffCalendarDay,
  StaffShiftCard,
  TeamAvailabilitySummaryRow,
  TimesheetEntry,
  TimesheetReviewAction,
} from "@/lib/types";



const dayNames = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const dayOptions = dayNames.map((label, index) => ({ label, value: String(index) }));



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

function parseInlineTimeRange(value: string): { start: string; end: string } | null {
  const cleaned = value.trim();
  const match = /^([01]\d|2[0-3]):([0-5]\d)\s*-\s*([01]\d|2[0-3]):([0-5]\d)$/.exec(cleaned);
  if (!match) return null;
  return { start: `${match[1]}:${match[2]}:00`, end: `${match[3]}:${match[4]}:00` };
}

type ShiftBlockProps = {
  timeRangeLabel: string;
  positionLabel?: string | null;
  captionLabel?: string | null;
  peopleLabel?: string | null;
  editable: boolean;
  isEditing: boolean;
  editText: string;
  onStartEdit?: () => void;
  onEditTextChange?: (next: string) => void;
  onEditKeyDown?: (event: React.KeyboardEvent<HTMLInputElement>) => void;
  onDelete?: () => void;
};

function ShiftBlock({
  timeRangeLabel,
  positionLabel,
  captionLabel,
  peopleLabel,
  editable,
  isEditing,
  editText,
  onStartEdit,
  onEditTextChange,
  onEditKeyDown,
  onDelete,
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
      className={`relative flex min-h-[54px] flex-col justify-between border-l-[3px] px-2 py-1.5 ${isEditing ? "bg-[var(--color-accent)] ring-1 ring-[rgba(47,111,237,0.20)]" : ""}`}
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
          aria-label="Delete shift"
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


type RequestDraft = {

  shiftId: string | null;

  requestType: "pickup" | "swap";

  requesterAssignmentId: string;

  targetAssignmentId: string;

  note: string;

};



type PreviewShiftDraft = {
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

function timesheetStatusLabel(status: TimesheetEntry["status"]) {
  if (status === "approved") return "Approved";
  if (status === "corrected") return "Corrected";
  if (status === "rejected") return "Rejected";
  return "Pending";
}

function workDateLabel(value: string): string {
  const [year, month, day] = value.split("-");
  return `${day}.${month}.${year}`;
}

function latestTimesheet(entries: TimesheetEntry[]): TimesheetEntry | undefined {
  return [...entries].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];
}



export function SchedulePage() {

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
  const isADMIN = effectiveRoles.includes("ADMIN");
  const todayDayIndex = (() => {
    const day = new Date().getDay();
    return day === 0 ? 6 : day - 1;
  })();



  const [weekStart, setWeekStart] = useState(getMonday());
  const [selectedDayIndex, setSelectedDayIndex] = useState(todayDayIndex);

  const [locationFilter, setLocationFilter] = useState("");
  const [positionFilter, setPositionFilter] = useState("all");

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
  const [previewDrafts, setPreviewDrafts] = useState<Record<string, PreviewShiftDraft>>({});
  const [editingShiftKey, setEditingShiftKey] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState("");
  const [bulkDay, setBulkDay] = useState("0");
  const [timesheetModal, setTimesheetModal] = useState<TimesheetModalState | null>(null);
  const [timesheetForm, setTimesheetForm] = useState<TimesheetFormState>({ arrived_at: "11:00", left_at: "22:00", note: "" });
  const [reviewModal, setReviewModal] = useState<ReviewModalState | null>(null);
  const weekEnd = shiftWeek(weekStart, 6);



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

    enabled: Boolean(token) && isStaff,

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

  const previewCalendarQuery = useQuery({

    queryKey: ["preview-calendar", weekStart, locationFilter],

    queryFn: () => api.getPreviewCalendar(token!, weekStart, locationFilter || undefined),

    enabled: Boolean(token) && isManagerView && Boolean(locationFilter),
    placeholderData: (previous) => previous,

  });
  const teamAvailabilityQuery = useQuery({
    queryKey: ["team-availability-summary", weekStart],
    queryFn: () => api.getTeamAvailabilitySummary(token!, weekStart),
    enabled: Boolean(token) && isManagerView,
  });

  const weekDays = useMemo(() => getWeekDays(weekStart), [weekStart]);
  const todayIso = new Date().toISOString().slice(0, 10);
  const selectedDay = weekDays[selectedDayIndex] ?? weekDays[0];



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
    setPreviewDrafts({});
    setEditingShiftKey(null);
    setEditingValue("");
  }, [weekStart, locationFilter]);

  useEffect(() => {
    if (scheduleStage !== "preview" || !previewCalendarQuery.data) {
      return;
    }
    const nextDrafts: Record<string, PreviewShiftDraft> = {};
    for (const row of previewCalendarQuery.data.rows) {
      for (const day of weekDays) {
        for (const cell of row.days[day.iso] ?? []) {
          nextDrafts[cell.shift_key] = {
            startTime: cell.start_time.slice(0, 5),
            endTime: cell.end_time.slice(0, 5),
          };
        }
      }
    }
    setPreviewDrafts(nextDrafts);
  }, [scheduleStage, previewCalendarQuery.data, weekDays]);


  const previewMutation = useMutation({
    mutationFn: async ({ resetOverrides = false }: { resetOverrides?: boolean } = {}) => {
      if (resetOverrides && locationFilter) {
        const existingOverrides = await api.listWeeklyOverrides(token!, weekStart);
        const remainingOverrides = existingOverrides.filter((item) => item.location_id !== locationFilter);
        await api.putWeeklyOverrides(token!, weekStart, remainingOverrides);
      }
      return api.previewSchedule(token!, weekStart, locationFilter || undefined);
    },
    onSuccess: async (data) => {
      setPreviewData(data);
      setEditingShiftKey(null);
      setEditingValue("");
      await previewCalendarQuery.refetch();
      setScheduleStage("preview");
      if (data.apply_blocked) {
        toast.warning("Schedule generated", "Fix start-time alerts before applying.");
      } else {
        toast.success("Schedule generated");
      }
    },
    onError: (error) => {
      toast.error("Failed to generate schedule", error instanceof Error ? error.message : undefined);
    },
  });
  const applyMutation = useMutation({
    mutationFn: () => api.applySchedule(token!, weekStart, locationFilter || undefined),

    onSuccess: (data) => {
      setPreviewData(data);
      setScheduleStage("applied");
      setEditingShiftKey(null);
      setEditingValue("");
      toast.success("Schedule applied", "Workers have been notified.");
      void queryClient.invalidateQueries({ queryKey: ["shifts", weekStart] });
      void queryClient.invalidateQueries({ queryKey: ["staffShifts"] });

      void queryClient.invalidateQueries({ queryKey: ["availability", weekStart] });

      void previewCalendarQuery.refetch();

    },
    onError: (error) => {
      toast.error("Failed to apply schedule", error instanceof Error ? error.message : undefined);
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
      await previewCalendarQuery.refetch();
      void queryClient.invalidateQueries({ queryKey: ["preview-calendar", weekStart] });
      try {
        const refreshedPreview = await api.previewSchedule(token!, weekStart, locationFilter || undefined);
        setPreviewData(refreshedPreview);
      } catch (error) {
        toast.error("Failed to refresh preview status", error instanceof Error ? error.message : undefined);
        return;
      }
      toast.success("Preview edits updated");
    },

  });

  const bulkClearDayMutation = useMutation({
    mutationFn: async () => {
      if (!previewCalendarQuery.data || !locationFilter) return 0;
      const targetDayIso = weekDays[Number(bulkDay)]?.iso;
      if (!targetDayIso) return 0;
      const payloads: Array<Promise<unknown>> = [];
      for (const row of previewCalendarQuery.data.rows) {
        for (const cell of row.days[targetDayIso] ?? []) {
          if (cell.location_id !== locationFilter) continue;
          payloads.push(
            api.patchPreviewEdit(token!, {
              week_start: weekStart,
              action: "delete",
              shift_key: cell.shift_key,
            }),
          );
        }
      }
      await Promise.all(payloads);
      return payloads.length;
    },
    onSuccess: async (deletedCount) => {
      await previewCalendarQuery.refetch();
      void queryClient.invalidateQueries({ queryKey: ["preview-calendar", weekStart] });
      try {
        const refreshedPreview = await api.previewSchedule(token!, weekStart, locationFilter || undefined);
        setPreviewData(refreshedPreview);
      } catch (error) {
        toast.error("Failed to refresh preview status", error instanceof Error ? error.message : undefined);
        return;
      }
      toast.info(
        deletedCount
          ? `Cleared ${deletedCount} shift blocks for ${dayOptions[Number(bulkDay)]?.label ?? "selected day"}.`
          : "Nothing to clear on selected day.",
      );
    },
    onError: (error) => {
      toast.error("Failed to clear selected day", error instanceof Error ? error.message : undefined);
    },
  });
  const saveAvailabilityMutation = useMutation({

    mutationFn: () =>

      api.putAvailability(token!, weekStart, {

        desired_hours: availabilityDesiredHoursForApi,

        slots: availabilityDraft.slots,

      }),

    onSuccess: () => {
      toast.success("Availability saved");

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
      toast.success("Hours report submitted", "Manager review is now pending.");
      void queryClient.invalidateQueries({ queryKey: ["timesheets"] });
      void queryClient.invalidateQueries({ queryKey: ["staffShifts"] });
      void queryClient.invalidateQueries({ queryKey: ["shifts", weekStart] });
      void queryClient.invalidateQueries({ queryKey: ["owner-dashboard-inline"] });
      void queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
    onError: (error) => {
      toast.error("Failed to submit hours", error instanceof Error ? error.message : undefined);
    },
  });

  const reviewTimesheetMutation = useMutation({
    mutationFn: ({ entry, payload }: { entry: TimesheetEntry; payload: TimesheetReviewAction }) =>
      api.reviewTimesheet(token!, entry.id, payload),
    onSuccess: (_, variables) => {
      setReviewModal(null);
      const label =
        variables.payload.action === "approve"
          ? "approved"
          : variables.payload.action === "reject"
            ? "rejected"
            : "corrected";
      toast.success(`Timesheet ${label}.`);
      void queryClient.invalidateQueries({ queryKey: ["timesheets"] });
      void queryClient.invalidateQueries({ queryKey: ["owner-dashboard-inline"] });
      void queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
    onError: (error) => {
      toast.error("Failed to review timesheet", error instanceof Error ? error.message : undefined);
    },
  });

  const approveVisibleTimesheetsMutation = useMutation({
    mutationFn: async (entries: TimesheetEntry[]) => {
      await Promise.all(entries.map((entry) => api.reviewTimesheet(token!, entry.id, { action: "approve" })));
      return entries.length;
    },
    onSuccess: (count) => {
      toast.success("Timesheets approved", `${count} report${count === 1 ? "" : "s"} approved.`);
      void queryClient.invalidateQueries({ queryKey: ["timesheets"] });
      void queryClient.invalidateQueries({ queryKey: ["owner-dashboard-inline"] });
      void queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
    onError: (error) => {
      toast.error("Failed to approve visible timesheets", error instanceof Error ? error.message : undefined);
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
      toast.success("Request sent");

      setRequestDraft({ shiftId: null, requestType: "pickup", requesterAssignmentId: "", targetAssignmentId: "", note: "" });

      void queryClient.invalidateQueries({ queryKey: ["shiftRequests", "my"] });

      void queryClient.invalidateQueries({ queryKey: ["staffShifts", weekStart, staffScope] });

    },

  });

  const reviewShiftRequestMutation = useMutation({

    mutationFn: ({ requestId, action }: { requestId: string; action: "approve" | "reject" | "cancel" }) =>

      api.patchShiftRequest(token!, requestId, action),

    onSuccess: (_, variables) => {
      toast.success(`Request ${variables.action}d.`);

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

  const visibleManagerShifts = useMemo(() => {
    if (positionFilter === "all") return managerShifts;
    return managerShifts.filter((shift) => (shift.staff_position ?? shift.required_role).trim().toLowerCase() === positionFilter);
  }, [managerShifts, positionFilter]);

  const managerShiftsByDate = useMemo(() => {
    const map: Record<string, Shift[]> = {};
    for (const shift of visibleManagerShifts) {
      if (!map[shift.date]) map[shift.date] = [];
      map[shift.date].push(shift);
    }
    for (const shifts of Object.values(map)) {
      shifts.sort((a, b) => a.start_time.localeCompare(b.start_time));
    }
    return map;
  }, [visibleManagerShifts]);

  const memberNameById = useMemo(() => {
    const map: Record<string, string> = {};
    for (const member of locationMembersQuery.data ?? []) map[member.id] = member.full_name;
    return map;
  }, [locationMembersQuery.data]);

  const rosterByUserDate = useMemo(() => {

    const map: Record<string, Record<string, Array<{ shift: Shift; assignmentId: string }>>> = {};

    for (const shift of managerShifts) {

      for (const assignment of shift.assignments) {

        if (!map[assignment.user_id]) map[assignment.user_id] = {};

        if (!map[assignment.user_id][shift.date]) map[assignment.user_id][shift.date] = [];

        map[assignment.user_id][shift.date].push({ shift, assignmentId: assignment.id });

      }

    }

    return map;

  }, [managerShifts]);

  const appliedHoursByUser = useMemo(() => {
    const totals: Record<string, number> = {};
    for (const shift of managerShifts) {
      const hours = shiftHours(shift.start_time, shift.end_time);
      for (const assignment of shift.assignments) {
        totals[assignment.user_id] = (totals[assignment.user_id] ?? 0) + hours;
      }
    }
    return totals;
  }, [managerShifts]);

  const previewHoursByUser = useMemo(() => {
    const totals: Record<string, number> = {};
    const seen = new Set<string>();
    for (const row of previewCalendarQuery.data?.rows ?? []) {
      for (const day of weekDays) {
        for (const cell of row.days[day.iso] ?? []) {
          if (cell.location_id !== locationFilter) continue;
          const key = `${row.user_id}:${cell.shift_key}`;
          if (seen.has(key)) continue;
          seen.add(key);
          totals[row.user_id] = (totals[row.user_id] ?? 0) + shiftHours(cell.start_time, cell.end_time);
        }
      }
    }
    return totals;
  }, [locationFilter, previewCalendarQuery.data?.rows, weekDays]);

  const positionOptions = useMemo(() => {
    const values = new Set<string>();
    for (const member of locationMembersQuery.data ?? []) {
      values.add((member.staff_position ?? member.role).trim());
    }
    const ordered = Array.from(values).sort((a, b) => {
      const delta = getPositionSortKey(a) - getPositionSortKey(b);
      if (delta !== 0) return delta;
      return a.localeCompare(b);
    });
    return [{ label: "All positions", value: "all" }, ...ordered.map((item) => ({ label: item, value: item.toLowerCase() }))];
  }, [locationMembersQuery.data]);

  const sortedLocationMembers = useMemo(() => {
    const matchesPosition = (member: { staff_position?: string | null; role: string }) => {
      if (positionFilter === "all") return true;
      const value = (member.staff_position ?? member.role).trim().toLowerCase();
      return value === positionFilter;
    };
    return (locationMembersQuery.data ?? [])
      .filter(matchesPosition)
      .sort((a, b) => {
        const byPosition = getPositionSortKey(a.staff_position ?? a.role) - getPositionSortKey(b.staff_position ?? b.role);
        if (byPosition !== 0) return byPosition;
        return a.full_name.localeCompare(b.full_name);
      });
  }, [locationMembersQuery.data, positionFilter]);

  const previewRowsByUserId = useMemo(() => {
    const map: Record<string, SchedulePreviewCalendar["rows"][number]> = {};
    for (const row of previewCalendarQuery.data?.rows ?? []) {
      map[row.user_id] = row;
    }
    return map;
  }, [previewCalendarQuery.data?.rows]);
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

  useEffect(() => {
    if (!isManagerView || !locationFilter) return;
    if (managerShifts.length > 0 && scheduleStage === "idle") {
      setScheduleStage("applied");
    }
    if (managerShifts.length === 0 && scheduleStage === "applied") {
      setScheduleStage("idle");
    }
  }, [isManagerView, locationFilter, managerShifts.length, scheduleStage]);

  const mySwapAssignments = useMemo(() => {

    if (!me) return [];

    const options: Array<{ label: string; value: string }> = [];

    for (const day of myStaffCalendarQuery.data ?? []) {

      for (const shift of day.shifts) {

        const mine = shift.assignments.find((item) => item.user_id === me.id);

        if (!mine) continue;

        options.push({

          value: mine.id,

          label: `${dayNames[day.day_of_week]} ${formatTime(shift.start_time)}-${formatTime(shift.end_time)} (${shift.location_name})`,

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



  return (

    <AppShell
      title="Schedule"
      headerVariant={isManagerView ? "minimal" : "default"}
      restaurantName="Old Town"
      subtitle={isStaff ? "Compact weekly view for your own shifts." : undefined}
      action={isStaff ? <div className="hidden sm:block"><Badge>Week of {weekStart}</Badge></div> : undefined}
    >
      {isStaff ? (
        <div className="stagger-grid grid gap-4 2xl:h-[calc(100vh-11.5rem)] 2xl:grid-cols-[2.35fr_1fr]">
          <Card className="min-h-0 max-w-full overflow-x-hidden">
            <CardHeader className="pb-2">
              <div className="grid gap-3">
                <div className="flex items-start justify-between gap-3">
                  <CardTitle className="text-lg">My weekly calendar</CardTitle>
                  <Button size="sm" variant="secondary" className="h-8 px-2.5 sm:hidden" onClick={() => openExtraTimesheetModal(weekDays.some((day) => day.iso === todayIso) ? todayIso : weekDays[0]?.iso)}>
                    <FileClock className="size-4" /> Report extra hours
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
                    <FileClock className="size-4" /> Report extra hours
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="min-h-0 max-w-full overflow-x-hidden">
              <div className="mb-3 flex max-w-full gap-2 overflow-x-auto pb-1 2xl:hidden">
                {weekDays.map((day, index) => {
                  const dayData = staffDaysByWeek[index];
                  const shiftsCount = dayData?.shifts?.length ?? 0;
                  const isActive = selectedDayIndex === index;
                  return (
                    <button
                      key={`staff-day-${day.iso}`}
                      type="button"
                      onClick={() => setSelectedDayIndex(index)}
                      className={`min-w-[76px] rounded-[1rem] border px-3 py-2 text-left transition ${isActive ? "border-[var(--color-primary)] bg-[var(--color-accent)] text-[var(--color-primary)]" : "border-[var(--color-border)] bg-white text-[var(--color-text-muted)]"}`}
                    >
                      <p className="text-xs font-semibold uppercase tracking-[0.12em]">{day.title}</p>
                      <p className="mt-1 text-xs">{day.caption}</p>
                      <p className="mt-2 text-[11px] font-medium">{shiftsCount ? `${shiftsCount} shift${shiftsCount > 1 ? "s" : ""}` : "No shift"}</p>
                    </button>
                  );
                })}
              </div>
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
                              editable={false}
                              isEditing={false}
                              editText=""
                            />
                            <div className="mt-3 flex items-center justify-between gap-2">
                              {latest ? (
                                <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${timesheetStatusClass(latest.status)}`}>
                                  {timesheetStatusLabel(latest.status)}
                                </span>
                              ) : (
                                <span className="text-xs text-[var(--color-text-muted)]">No report</span>
                              )}
                              {canSubmitReport ? (
                                <Button size="sm" variant="secondary" onClick={() => openShiftTimesheetModal(shift)}>
                                  Report hours
                                </Button>
                              ) : null}
                            </div>
                          </div>
                        );
                      })}
                      {(myRestrictedTimesheetsByDate[selectedDay?.iso ?? ""] ?? []).length ? (
                        <div className="rounded-[1rem] bg-amber-50 px-4 py-3 text-sm text-amber-700">
                          Extra hours: {timesheetStatusLabel(latestTimesheet(myRestrictedTimesheetsByDate[selectedDay?.iso ?? ""])?.status ?? "pending")}
                        </div>
                      ) : null}
                      <div className="rounded-[1rem] border border-[var(--color-divider)] bg-[var(--color-surface-muted)] px-4 py-4">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--color-text-muted)]">Team on this day</p>
                            <p className="mt-1 text-xs text-[var(--color-text-muted)]">
                              {coworkerAgenda.length ? "Who else is working and when." : "No other assigned shifts on this day."}
                            </p>
                          </div>
                          <Badge>{teamAgenda.length} total</Badge>
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
                          No shifts on this day.
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
                                  editable={false}
                                  isEditing={false}
                                  editText=""
                                />
                                {shift.is_mine ? (
                                  <div className="flex items-center justify-between gap-1">
                                    {latest ? (
                                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${timesheetStatusClass(latest.status)}`}>
                                        {timesheetStatusLabel(latest.status)}
                                      </span>
                                    ) : (
                                      <span className="text-[10px] text-[var(--color-text-muted)]">No report</span>
                                    )}
                                    {canSubmitReport ? (
                                      <button
                                        type="button"
                                        className="text-[10px] font-semibold text-[var(--color-primary)] hover:underline"
                                        onClick={() => openShiftTimesheetModal(shift)}
                                      >
                                        Report hours
                                      </button>
                                    ) : null}
                                  </div>
                                ) : null}
                              </div>
                            );
                          })}
                          {(myRestrictedTimesheetsByDate[day.iso] ?? []).length ? (
                            <div className="rounded-[0.75rem] bg-amber-50 px-2 py-1 text-[10px] font-medium text-amber-700">
                              Extra hours: {timesheetStatusLabel(latestTimesheet(myRestrictedTimesheetsByDate[day.iso])?.status ?? "pending")}
                            </div>
                          ) : null}
                          {teamAgenda.length ? (
                            <div className="rounded-[0.75rem] border border-[var(--color-divider)] bg-[var(--color-surface-muted)] px-2 py-1.5">
                              <p className="text-[9px] font-semibold uppercase tracking-[0.08em] text-[var(--color-text-muted)]">Team</p>
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
                          {!shifts.length ? <p className="text-[10px] text-[var(--color-text-muted)]">No shift</p> : null}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="min-h-0 max-w-full overflow-x-hidden">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="text-lg">Availability</CardTitle>
                {availabilityQuery.data?.locked_at ? <Badge className="border-amber-200 bg-amber-50 text-amber-700">Locked</Badge> : null}
              </div>
              <CardDescription>Set next-week availability in one compact grid.</CardDescription>
            </CardHeader>
            <CardContent className="min-h-0 max-w-full space-y-4 overflow-y-auto overflow-x-hidden pr-1">
              <div className="grid items-end gap-2 border-b border-[var(--color-divider)] pb-3 md:grid-cols-[1fr_auto]">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.14em] text-[var(--color-text-muted)]">Hours / week</p>
                  <div className="mt-1 flex items-baseline gap-2">
                    <p className="text-2xl font-bold tracking-[-0.06em] text-[var(--color-heading)]">{availabilityDesiredHours.toFixed(1)}</p>
                    <p className="text-sm text-[var(--color-text-muted)]">derived from active day ranges</p>
                  </div>
                </div>
                <Button size="sm" onClick={() => saveAvailabilityMutation.mutate()} disabled={saveAvailabilityMutation.isPending || Boolean(availabilityQuery.data?.locked_at)}>
                  Save
                </Button>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                {weekDays.map((day, index) => {
                  const slots = availabilitySlotsByDay[index] ?? [];
                  const firstSlot = slots[0];
                  const enabled = Boolean(firstSlot);
                  return (
                    <div key={`availability-mobile-${day.iso}`} className="rounded-[1rem] border border-[var(--color-border)] bg-white px-4 py-4">
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
                          className={`relative inline-flex h-7 w-14 items-center rounded-full p-1 transition ${enabled ? "bg-emerald-500/90" : "bg-slate-200"} disabled:opacity-40`}
                        >
                          <span className={`size-5 rounded-full bg-white shadow-sm transition ${enabled ? "translate-x-7" : "translate-x-0"}`} />
                        </button>
                      </div>
                      <p className="mt-2 text-xs font-medium text-[var(--color-text-muted)]">{enabled ? "Available" : "Off"}</p>
                      <div className="mt-3 grid gap-3 sm:grid-cols-2">
                        <input
                          type="time"
                          value={firstSlot ? firstSlot.start_time.slice(0, 5) : ""}
                          disabled={!enabled || Boolean(availabilityQuery.data?.locked_at)}
                          onChange={(event) => updateAvailabilityDayTime(index, "start_time", event.target.value, firstSlot)}
                          className="h-9 w-full border-0 border-b border-[var(--color-border)] bg-transparent px-0 text-sm text-[var(--color-heading)] outline-none focus:border-[var(--color-primary)] disabled:text-[var(--color-text-muted)]"
                        />
                        <input
                          type="time"
                          value={firstSlot ? firstSlot.end_time.slice(0, 5) : ""}
                          disabled={!enabled || Boolean(availabilityQuery.data?.locked_at)}
                          onChange={(event) => updateAvailabilityDayTime(index, "end_time", event.target.value, firstSlot)}
                          className="h-9 w-full border-0 border-b border-[var(--color-border)] bg-transparent px-0 text-sm text-[var(--color-heading)] outline-none focus:border-[var(--color-primary)] disabled:text-[var(--color-text-muted)]"
                        />
                      </div>
                    </div>
                  );
                })}
              </div>

              {availabilityQuery.data?.locked_at ? <p className="text-xs text-amber-600">This week is locked. Ask manager for changes.</p> : null}
            </CardContent>
          </Card>
        </div>

      ) : (

        <div className="stagger-grid grid gap-5">

          <section className="min-w-0 space-y-5">

            <Card>

              <CardHeader>

                <div className="flex flex-wrap items-start justify-between gap-3">

                  <div>

                    <CardTitle>Timesheet approvals</CardTitle>

                    <CardDescription>Review daily hour reports submitted by staff.</CardDescription>

                  </div>
                  {visiblePendingTimesheets.length ? (
                    <Button
                      size="sm"
                      variant="secondary"
                      className="h-9 rounded-[0.85rem] border-0 bg-transparent px-0 text-[var(--color-primary)] shadow-none hover:bg-transparent"
                      onClick={() => approveVisibleTimesheetsMutation.mutate(visiblePendingTimesheets)}
                      disabled={approveVisibleTimesheetsMutation.isPending || reviewTimesheetMutation.isPending}
                    >
                      <CheckCircle2 className="size-4" /> Approve all visible
                    </Button>
                  ) : null}

                </div>

              </CardHeader>

              <CardContent className="space-y-3 overflow-hidden">
                {visiblePendingTimesheets.length ? (
                  <div className="sticky top-0 z-10 flex items-center justify-between gap-3 rounded-[1rem] border border-[var(--color-divider)] bg-white px-4 py-3">
                    <p className="text-sm font-medium text-[var(--color-heading)]">{visiblePendingTimesheets.length} pending report{visiblePendingTimesheets.length === 1 ? "" : "s"} in this week</p>
                    <span className="text-xs text-[var(--color-text-muted)]">Scrollable list</span>
                  </div>
                ) : null}
                <div className="max-h-[520px] space-y-3 overflow-y-auto pr-1">

                {visiblePendingTimesheets.map((entry) => {
                  const shift = entry.shift_id ? shiftsById[entry.shift_id] : null;
                  const employeeName = timesheetUserNameById[entry.user_id] ?? entry.user_id.slice(0, 8);
                  const deltaLabel = getTimesheetDelta(shift, entry);
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
                              ? `${shift.staff_position ?? shift.required_role} at ${shift.date} ${formatTime(shift.start_time)}-${formatTime(shift.end_time)}`
                              : "Extra hours without planned shift"}
                          </p>
                          <p className={`mt-1 text-xs font-semibold ${deltaLabel.startsWith("+") ? "text-amber-700" : deltaLabel.startsWith("-") ? "text-sky-700" : "text-emerald-700"}`}>
                            {deltaLabel === "Extra entry" ? "Extra entry" : `${deltaLabel} vs plan`}
                          </p>
                          {entry.note ? <p className="mt-2 text-sm text-[var(--color-heading)]">{entry.note}</p> : null}
                        </div>
                        <Badge className={timesheetStatusClass(entry.status)}>{timesheetStatusLabel(entry.status)}</Badge>
                      </div>

                      <div className="mt-3 flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          onClick={() => reviewTimesheetMutation.mutate({ entry, payload: { action: "approve" } })}
                          disabled={reviewTimesheetMutation.isPending}
                        >
                          <CheckCircle2 className="size-4" /> Approve
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
                          Correct
                        </Button>
                        <Button
                          size="sm"
                          variant="danger"
                          onClick={() => reviewTimesheetMutation.mutate({ entry, payload: { action: "reject" } })}
                          disabled={reviewTimesheetMutation.isPending}
                        >
                          <XCircle className="size-4" /> Reject
                        </Button>
                      </div>
                    </div>
                  );
                })}
                </div>

                {!visiblePendingTimesheets.length ? (

                  <div className="rounded-[1.2rem] border border-dashed border-[var(--color-border)] px-4 py-6 text-sm text-[var(--color-text-muted)]">

                    No pending timesheets.

                  </div>

                ) : null}

              </CardContent>

            </Card>

            <Card>

              <CardHeader>

                <div className="flex flex-wrap items-start justify-between gap-4">

                  <div>

                    <CardTitle>Schedule calendar</CardTitle>

                    <CardDescription>Plan shifts by location, review coverage, then apply the week.</CardDescription>

                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <div className="inline-flex items-center gap-2 border-b border-[var(--color-divider)] pb-1">
                      <Button variant="secondary" className="h-8 min-w-8 rounded-none border-0 bg-transparent px-1 shadow-none hover:bg-transparent" onClick={() => setWeekStart((current) => shiftWeek(current, -7))}>
                        <ChevronLeft className="size-4" />
                      </Button>
                      <div className="px-1 text-sm font-semibold text-[var(--color-heading)]">
                        {weekDays[0]?.caption} - {weekDays[6]?.caption}
                      </div>
                      <Button variant="secondary" className="h-8 min-w-8 rounded-none border-0 bg-transparent px-1 shadow-none hover:bg-transparent" onClick={() => setWeekStart((current) => shiftWeek(current, 7))}>
                        <ChevronRight className="size-4" />
                      </Button>
                    </div>

                    {scheduleStage === "idle" ? (
                      <Button onClick={() => previewMutation.mutate({ resetOverrides: false })} disabled={previewMutation.isPending || !locationFilter}>
                        <Sparkles className="size-4" /> Generate schedule
                      </Button>
                    ) : null}

                    {scheduleStage === "preview" ? (
                      <>
                        <Button className="bg-emerald-500 text-white hover:bg-emerald-600" onClick={() => applyMutation.mutate()} disabled={applyMutation.isPending || previewData?.apply_blocked}>
                          <ClipboardCheck className="size-4" /> Apply
                        </Button>
                        <Button onClick={() => previewMutation.mutate({ resetOverrides: true })} disabled={previewMutation.isPending || !locationFilter}>
                          <Sparkles className="size-4" /> Regenerate
                        </Button>
                      </>
                    ) : null}

                    {scheduleStage === "applied" ? (
                      <>
                        <Button onClick={() => previewMutation.mutate({ resetOverrides: true })} disabled={previewMutation.isPending || !locationFilter}>
                          <Sparkles className="size-4" /> Regenerate
                        </Button>
                        <Button
                          variant="secondary"
                          onClick={() => {
                            setScheduleStage("preview");
                            toast.info("Edit mode enabled for current week.");
                          }}
                          disabled={previewMutation.isPending}
                        >
                          <Pencil className="size-4" />
                        </Button>
                      </>
                    ) : null}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Select
                    className="min-w-[220px] border-[var(--color-primary)] bg-[var(--color-accent)] text-[var(--color-primary)]"
                    options={((locationsQuery.data ?? []).map((location) => ({ label: location.name, value: location.id })))}
                    value={locationFilter}
                    onChange={(event) => setLocationFilter(event.target.value)}
                  />
                  <Select
                    className="min-w-[160px]"
                    options={positionOptions}
                    value={positionFilter}
                    onChange={(event) => setPositionFilter(event.target.value)}
                  />
                  <Badge>
                    <ListFilter className="mr-1 size-3.5" /> {sortedLocationMembers.length} workers
                  </Badge>

                  {scheduleStage === "preview" ? (
                    <>
                      <Select className="min-w-[140px]" options={dayOptions} value={bulkDay} onChange={(event) => setBulkDay(event.target.value)} />
                      <Button variant="secondary" onClick={() => bulkClearDayMutation.mutate()} disabled={bulkClearDayMutation.isPending || !locationFilter}>
                        <Trash2 className="size-4" /> Clear day
                      </Button>
                    </>
                  ) : null}
                </div>

              </CardHeader>

              <CardContent className="min-w-0 space-y-3">
                <div className="flex gap-2 overflow-x-auto pb-1 lg:hidden">
                  {weekDays.map((day, index) => {
                    const previewCount = previewCalendarQuery.data
                      ? sortedLocationMembers.reduce((sum, member) => sum + ((previewRowsByUserId[member.id]?.days[day.iso] ?? []).filter((item) => item.location_id === locationFilter).length), 0)
                      : (managerShiftsByDate[day.iso] ?? []).length;
                    const isActive = selectedDayIndex === index;
                    return (
                      <button
                        key={`manager-day-${day.iso}`}
                        type="button"
                        onClick={() => setSelectedDayIndex(index)}
                        className={`min-w-[76px] rounded-[1rem] border px-3 py-2 text-left transition ${isActive ? "border-[var(--color-primary)] bg-[var(--color-accent)] text-[var(--color-primary)]" : "border-[var(--color-border)] bg-white text-[var(--color-text-muted)]"}`}
                      >
                        <p className="text-xs font-semibold uppercase tracking-[0.12em]">{day.title}</p>
                        <p className="mt-1 text-xs">{day.caption}</p>
                        <p className="mt-2 text-[11px] font-medium">{previewCount ? `${previewCount} items` : "Empty"}</p>
                      </button>
                    );
                  })}
                </div>

                {scheduleStage === "idle" ? (
                  <div className="rounded-[1.2rem] border border-dashed border-[var(--color-border)] px-4 py-6 text-sm text-[var(--color-text-muted)]">
                    Generate schedule to load shifts for this week.
                  </div>
                ) : null}

                {scheduleStage === "preview" && previewCalendarQuery.data ? (
                  <>
                  <div className="space-y-3 lg:hidden">
                    {sortedLocationMembers.map((member) => {
                      const row = previewRowsByUserId[member.id];
                      const memberPositionLabel =
                        member.staff_position ?? (member.role === "MANAGER" ? "Manager" : member.role === "STAFF" ? "Unassigned" : "ADMIN");
                      const memberTone = positionTone(memberPositionLabel, member.role);
                      const cells = (row?.days[selectedDay?.iso ?? ""] ?? []).filter((item) => item.location_id === locationFilter);
                      return (
                        <div key={`mobile-preview-${member.id}`} className="rounded-[1rem] border border-[var(--color-divider)] bg-white px-4 py-4">
                          <div className="mb-3 flex items-center justify-between gap-3">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold text-[var(--color-heading)]">{member.full_name}</p>
                              <p className={`mt-1 text-xs font-semibold ${memberTone.text}`}>{memberPositionLabel}</p>
                            </div>
                            {isADMIN ? <span className="text-xs text-[var(--color-text-muted)]">{(previewHoursByUser[member.id] ?? 0).toFixed(1)}h</span> : null}
                          </div>
                          {cells.length ? (
                            <div className="space-y-2">
                              {cells.map((cell) => {
                                const canInlineEdit =
                                  cell.required_count <= 1 &&
                                  cell.assigned_users.length <= 1 &&
                                  (cell.assigned_users.length === 0 || cell.assigned_users.some((item) => item.user_id === member.id));
                                const draft = previewDrafts[cell.shift_key] ?? {
                                  startTime: cell.start_time.slice(0, 5),
                                  endTime: cell.end_time.slice(0, 5),
                                };
                                const isEditing = editingShiftKey === cell.shift_key && canInlineEdit;
                                const timeLabel = `${formatTime(draft.startTime)}-${formatTime(draft.endTime)}`;
                                return (
                                  <ShiftBlock
                                    key={`mobile-cell-${cell.shift_key}`}
                                    timeRangeLabel={timeLabel}
                                    positionLabel={cell.staff_position ?? member.staff_position ?? member.role}
                                    editable={canInlineEdit}
                                    isEditing={isEditing}
                                    editText={isEditing ? editingValue : `${draft.startTime}-${draft.endTime}`}
                                    onStartEdit={() => {
                                      if (!canInlineEdit) return;
                                      setEditingShiftKey(cell.shift_key);
                                      setEditingValue(`${draft.startTime}-${draft.endTime}`);
                                    }}
                                    onEditTextChange={(next) => setEditingValue(next)}
                                    onEditKeyDown={(event) => {
                                      if (event.key === "Escape") {
                                        event.preventDefault();
                                        setEditingShiftKey(null);
                                        setEditingValue("");
                                        return;
                                      }
                                      if (event.key !== "Enter") return;
                                      event.preventDefault();
                                      const parsed = parseInlineTimeRange(editingValue);
                                      if (!parsed) {
                                        toast.warning("Use HH:MM-HH:MM format.");
                                        return;
                                      }
                                      setPreviewDrafts((current) => ({
                                        ...current,
                                        [cell.shift_key]: {
                                          startTime: parsed.start.slice(0, 5),
                                          endTime: parsed.end.slice(0, 5),
                                        },
                                      }));
                                      patchPreviewEditMutation.mutate(
                                        {
                                          action: "upsert",
                                          shift_key: cell.shift_key,
                                          start_time: parsed.start,
                                          end_time: parsed.end,
                                        },
                                        {
                                          onSuccess: () => {
                                            setEditingShiftKey(null);
                                            setEditingValue("");
                                          },
                                        },
                                      );
                                    }}
                                    onDelete={
                                      canInlineEdit
                                        ? () =>
                                            patchPreviewEditMutation.mutate(
                                              { action: "delete", shift_key: cell.shift_key },
                                              {
                                                onSuccess: () => {
                                                  setEditingShiftKey(null);
                                                  setEditingValue("");
                                                },
                                              },
                                            )
                                        : undefined
                                    }
                                  />
                                );
                              })}
                            </div>
                          ) : (
                            <div className="space-y-3">
                              {managerAvailabilityByUserDay[member.id]?.[selectedDay?.iso ?? ""]?.windowLabel ? (
                                <div className="rounded-[0.9rem] border border-dashed border-[var(--color-border)] bg-[var(--color-surface-muted)] px-3 py-3 text-xs text-[var(--color-text-muted)]">
                                  <p className="font-semibold text-[var(--color-heading)]">
                                    Wants {managerAvailabilityByUserDay[member.id][selectedDay?.iso ?? ""].windowLabel}
                                  </p>
                                  <p className="mt-1">
                                    Desired {managerAvailabilityByUserDay[member.id][selectedDay?.iso ?? ""].desiredHours}h this week
                                  </p>
                                </div>
                              ) : null}
                              <Button
                                variant="secondary"
                                className="w-full"
                                onClick={() =>
                                  patchPreviewEditMutation.mutate({
                                    action: "create",
                                    shift_key: `create:${member.id}:${selectedDay?.iso}`,
                                    location_id: locationFilter,
                                    day_of_week: selectedDayIndex,
                                    start_time: "11:00:00",
                                    end_time: "22:00:00",
                                    required_role: member.role,
                                    staff_position: member.role === "STAFF" ? member.staff_position ?? "Cook" : null,
                                    required_count: 1,
                                    assigned_user_id: member.id,
                                  })
                                }
                                disabled={member.role === "ADMIN"}
                              >
                                <Plus className="size-4" /> Add shift
                              </Button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  <div className="hidden max-h-[72vh] overflow-auto rounded-[1.5rem] border border-[var(--color-divider)] bg-white lg:block">
                    <div className="min-w-[1180px]">
                      <div className="sticky top-0 z-30 grid grid-cols-[220px_repeat(7,minmax(130px,1fr))] bg-white text-[var(--color-heading)]">
                        <div className="sticky left-0 z-40 border-r border-[var(--color-divider)] bg-white px-3 py-2 text-sm font-semibold">Employees</div>
                        {weekDays.map((day) => (
                          <div
                            key={day.iso}
                            className={`border-r border-[var(--color-divider)] px-3 py-2 ${day.iso === todayIso ? "bg-[rgba(47,111,237,0.05)]" : "bg-white"}`}
                          >
                            <p className="font-semibold">{day.title}</p>
                            <p className="text-xs text-[var(--color-text-muted)]">{day.caption}</p>
                          </div>
                        ))}
                      </div>

                      {sortedLocationMembers.map((member) => {
                        const row = previewRowsByUserId[member.id];
                        const memberPositionLabel =
                          member.staff_position ?? (member.role === "MANAGER" ? "Manager" : member.role === "STAFF" ? "Unassigned" : "ADMIN");
                        const memberTone = positionTone(memberPositionLabel, member.role);
                        return (
                          <div key={member.id} className="grid grid-cols-[220px_repeat(7,minmax(130px,1fr))] border-b border-[var(--color-divider)] bg-white hover:bg-[rgba(15,23,42,0.02)]">
                            <div className="sticky left-0 z-20 border-r border-[var(--color-divider)] bg-white px-3 py-2">
                                <div className="flex w-full flex-col items-center justify-center text-center">
                                  <WorkerAvatar name={member.full_name} size={28} />
                                  <div className="min-w-0">
                                    <p className="mt-1 truncate text-[12px] font-semibold text-[var(--color-heading)]">{member.full_name}</p>
                                    <p className={`mt-0.5 truncate text-[10px] font-semibold ${memberTone.text}`}>{memberPositionLabel}</p>
                                    {isADMIN ? (
                                      <p className="mt-0.5 text-[10px] text-[var(--color-text-muted)]">
                                        {member.hourly_rate_pln} PLN/h • {(previewHoursByUser[member.id] ?? 0).toFixed(1)}h
                                      </p>
                                    ) : null}
                                  </div>
                                </div>
                              </div>
                            {weekDays.map((day) => {
                              const cells = (row?.days[day.iso] ?? []).filter((item) => item.location_id === locationFilter);
                              return (
                                <div
                                  key={`${member.id}-${day.iso}`}
                                  className={`group min-h-[56px] border-r border-[var(--color-divider)] px-1 py-1 align-top ${day.iso === todayIso ? "bg-[rgba(47,111,237,0.05)]" : "bg-white"}`}
                                >
                                  {cells.length ? (
                                    <div className="space-y-1">
                                      {cells.map((cell) => {
                                        const canInlineEdit =
                                          cell.required_count <= 1 &&
                                          cell.assigned_users.length <= 1 &&
                                          (cell.assigned_users.length === 0 || cell.assigned_users.some((item) => item.user_id === member.id));
                                        const draft = previewDrafts[cell.shift_key] ?? {
                                          startTime: cell.start_time.slice(0, 5),
                                          endTime: cell.end_time.slice(0, 5),
                                        };
                                        const isEditing = editingShiftKey === cell.shift_key && canInlineEdit;
                                        const timeLabel = `${formatTime(draft.startTime)}-${formatTime(draft.endTime)}`;

                                        return (
                                          <ShiftBlock
                                            key={`${member.id}-${cell.shift_key}`}
                                            timeRangeLabel={timeLabel}
                                            positionLabel={cell.staff_position ?? member.staff_position ?? member.role}
                                            editable={canInlineEdit}
                                            isEditing={isEditing}
                                            editText={isEditing ? editingValue : `${draft.startTime}-${draft.endTime}`}
                                            onStartEdit={() => {
                                              if (!canInlineEdit) return;
                                              setEditingShiftKey(cell.shift_key);
                                              setEditingValue(`${draft.startTime}-${draft.endTime}`);
                                            }}
                                            onEditTextChange={(next) => setEditingValue(next)}
                                            onEditKeyDown={(event) => {
                                              if (event.key === "Escape") {
                                                event.preventDefault();
                                                setEditingShiftKey(null);
                                                setEditingValue("");
                                                return;
                                              }
                                              if (event.key !== "Enter") return;
                                              event.preventDefault();
                                              const parsed = parseInlineTimeRange(editingValue);
                                              if (!parsed) {
                                                toast.warning("Use HH:MM-HH:MM format.");
                                                return;
                                              }
                                              setPreviewDrafts((current) => ({
                                                ...current,
                                                [cell.shift_key]: {
                                                  startTime: parsed.start.slice(0, 5),
                                                  endTime: parsed.end.slice(0, 5),
                                                },
                                              }));
                                              patchPreviewEditMutation.mutate(
                                                {
                                                  action: "upsert",
                                                  shift_key: cell.shift_key,
                                                  start_time: parsed.start,
                                                  end_time: parsed.end,
                                                },
                                                {
                                                  onSuccess: () => {
                                                    setEditingShiftKey(null);
                                                    setEditingValue("");
                                                  },
                                                },
                                              );
                                            }}
                                            onDelete={
                                              canInlineEdit
                                                ? () => {
                                                    patchPreviewEditMutation.mutate(
                                                      { action: "delete", shift_key: cell.shift_key },
                                                      {
                                                        onSuccess: () => {
                                                          setEditingShiftKey(null);
                                                          setEditingValue("");
                                                        },
                                                      },
                                                    );
                                                  }
                                                : undefined
                                            }
                                          />
                                        );
                                      })}
                                    </div>
                                  ) : (
                                    <div className="flex min-h-[54px] flex-col items-center justify-center gap-1 rounded-[0.85rem] border border-dashed border-transparent px-1 py-1.5 text-center group-hover:border-[var(--color-border)] group-hover:bg-[var(--color-surface-muted)]">
                                      {managerAvailabilityByUserDay[member.id]?.[day.iso]?.windowLabel ? (
                                        <>
                                          <p className="truncate text-[10px] font-semibold text-[var(--color-heading)]">
                                            {managerAvailabilityByUserDay[member.id][day.iso].windowLabel}
                                          </p>
                                          <p className="text-[9px] text-[var(--color-text-muted)]">
                                            Desired {managerAvailabilityByUserDay[member.id][day.iso].desiredHours}h
                                          </p>
                                        </>
                                      ) : (
                                        <p className="text-[9px] text-[var(--color-text-muted)]">No submitted availability</p>
                                      )}
                                      <button
                                        type="button"
                                        className="invisible mt-0.5 grid size-6 place-items-center rounded-full border border-[var(--color-border)] bg-white text-[var(--color-text-muted)] transition hover:bg-[var(--color-surface-muted)] group-hover:visible"
                                        onClick={() =>
                                          patchPreviewEditMutation.mutate({
                                            action: "create",
                                            shift_key: `create:${member.id}:${day.iso}`,
                                            location_id: locationFilter,
                                            day_of_week: dayNames.indexOf(day.title),
                                            start_time: "11:00:00",
                                            end_time: "22:00:00",
                                            required_role: member.role,
                                            staff_position: member.role === "STAFF" ? member.staff_position ?? "Cook" : null,
                                            required_count: 1,
                                            assigned_user_id: member.id,
                                          })
                                        }
                                        disabled={member.role === "ADMIN"}
                                      >
                                        <Plus className="size-4" />
                                      </button>
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  </>
                ) : null}

                {scheduleStage === "applied" ? (
                  <>
                  <div className="space-y-3 lg:hidden">
                    {(managerShiftsByDate[selectedDay?.iso ?? ""] ?? []).map((shift) => {
                      const people = shift.assignments
                        .map((assignment) => memberNameById[assignment.user_id] ?? "Assigned")
                        .join(", ");
                      return (
                        <div key={`applied-mobile-${shift.id}`} className="surface-card rounded-[1rem] px-4 py-4">
                          <ShiftBlock
                            timeRangeLabel={`${formatTime(shift.start_time)}-${formatTime(shift.end_time)}`}
                            positionLabel={shift.staff_position ?? shift.required_role}
                            captionLabel={`${shift.required_count} needed`}
                            peopleLabel={people || "Missing staff"}
                            editable={false}
                            isEditing={false}
                            editText=""
                          />
                        </div>
                      );
                    })}
                    {!(managerShiftsByDate[selectedDay?.iso ?? ""] ?? []).length ? (
                      <div className="rounded-[1rem] border border-dashed border-[var(--color-border)] px-4 py-6 text-sm text-[var(--color-text-muted)]">
                        No shifts on this day.
                      </div>
                    ) : null}
                  </div>
                  <div className="hidden overflow-auto rounded-[1.25rem] border border-[var(--color-divider)] bg-white lg:block">
                    <div className="grid min-w-[900px] grid-cols-7">
                      {weekDays.map((day) => {
                        const shifts = managerShiftsByDate[day.iso] ?? [];
                        return (
                          <div
                            key={day.iso}
                            className={`min-h-[240px] border-r border-[var(--color-divider)] p-2 ${day.iso === todayIso ? "bg-[rgba(47,111,237,0.05)]" : "bg-white"}`}
                          >
                            <div className="mb-2 flex items-start justify-between gap-2">
                              <div>
                                <p className="text-sm font-semibold text-[var(--color-heading)]">{day.title}</p>
                                <p className="text-xs text-[var(--color-text-muted)]">{day.caption}</p>
                              </div>
                              <span className="text-[11px] font-semibold text-[var(--color-text-muted)]">{shifts.length}</span>
                            </div>
                            <div className="divide-y divide-[var(--color-divider)]">
                              {shifts.map((shift) => {
                                const people = shift.assignments
                                  .map((assignment) => memberNameById[assignment.user_id] ?? "Assigned")
                                  .join(", ");
                                return (
                                  <ShiftBlock
                                    key={shift.id}
                                    timeRangeLabel={`${formatTime(shift.start_time)}-${formatTime(shift.end_time)}`}
                                    positionLabel={shift.staff_position ?? shift.required_role}
                                    captionLabel={`${shift.required_count} needed`}
                                    peopleLabel={people || "Missing staff"}
                                    editable={false}
                                    isEditing={false}
                                    editText=""
                                  />
                                );
                              })}
                              {!shifts.length ? (
                                <div className="flex min-h-[120px] items-center justify-center text-sm text-[var(--color-text-muted)]">No shifts</div>
                              ) : null}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  </>
                ) : null}
              </CardContent>
            </Card>

            <Card>

              <CardHeader>

                <div>

                  <CardTitle>Incoming requests</CardTitle>

                  <CardDescription>Approve or reject staff pickup and swap requests.</CardDescription>

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

                          Approve

                        </Button>

                        <Button size="sm" variant="secondary" onClick={() => reviewShiftRequestMutation.mutate({ requestId: item.id, action: "reject" })}>

                          Reject

                        </Button>

                      </div>

                    </div>

                  );

                })}

                {!incomingRequestsQuery.data?.length ? (

                  <div className="rounded-[1.2rem] border border-dashed border-[var(--color-border)] px-4 py-6 text-sm text-[var(--color-text-muted)]">

                    No incoming requests.

                  </div>

                ) : null}

              </CardContent>

            </Card>

          </section>

        </div>

      )}

      {timesheetModal ? (
        <div className="mobile-sheet-backdrop lg:grid lg:place-items-center lg:px-4 lg:py-6">
          <div className="mobile-sheet-panel lg:w-full lg:max-w-[440px] lg:rounded-[1.5rem] lg:border lg:border-[var(--color-border)] lg:bg-white lg:p-5 lg:shadow-[0_24px_80px_rgba(15,23,42,0.18)]">
            <div className="flex items-start justify-between gap-3 border-b border-[var(--color-divider)] px-4 py-4 lg:border-b-0 lg:px-0 lg:py-0">
              <div>
                <p className="text-lg font-bold tracking-[-0.03em] text-[var(--color-heading)]">
                  {timesheetModal.mode === "shift" ? "Report hours" : "Report extra hours"}
                </p>
                <p className="mt-1 text-sm text-[var(--color-text-muted)]">
                  {timesheetModal.mode === "shift"
                    ? `${workDateLabel(timesheetModal.workDate)} • ${timesheetModal.shift.location_name}`
                    : `Restricted entry for ${workDateLabel(timesheetModal.workDate)}`}
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
                  Work date
                  <Input
                    type="date"
                    value={timesheetModal.workDate}
                    onChange={(event) => setTimesheetModal({ mode: "extra", workDate: event.target.value })}
                  />
                </label>
              ) : null}
              <div className="grid grid-cols-2 gap-3">
                <label className="grid gap-1.5 text-sm font-medium text-[var(--color-heading)]">
                  Arrived at
                  <Input
                    type="time"
                    value={timesheetForm.arrived_at}
                    onChange={(event) => setTimesheetForm((current) => ({ ...current, arrived_at: event.target.value }))}
                  />
                </label>
                <label className="grid gap-1.5 text-sm font-medium text-[var(--color-heading)]">
                  Left at
                  <Input
                    type="time"
                    value={timesheetForm.left_at}
                    onChange={(event) => setTimesheetForm((current) => ({ ...current, left_at: event.target.value }))}
                  />
                </label>
              </div>
              <label className="grid gap-1.5 text-sm font-medium text-[var(--color-heading)]">
                Note
                <Textarea
                  rows={3}
                  placeholder="Optional note for manager"
                  value={timesheetForm.note}
                  onChange={(event) => setTimesheetForm((current) => ({ ...current, note: event.target.value }))}
                />
              </label>
              {timesheetModal.mode === "shift" && timesheetModal.assignmentStatus === "in_shift" ? (
                <p className="rounded-[1rem] bg-amber-50 px-3 py-2 text-sm text-amber-700">
                  Submitting this report will also close the operational shift timer.
                </p>
              ) : null}
            </div>
            </div>

            <div className="border-t border-[var(--color-divider)] px-4 py-4 lg:mt-5 lg:flex lg:justify-end lg:gap-2 lg:border-t-0 lg:px-0 lg:py-0">
              <div className="grid gap-2 lg:flex">
              <Button variant="secondary" onClick={() => setTimesheetModal(null)}>
                Cancel
              </Button>
              <Button
                onClick={() => createTimesheetMutation.mutate({ modal: timesheetModal, form: timesheetForm })}
                disabled={createTimesheetMutation.isPending || !timesheetForm.arrived_at || !timesheetForm.left_at}
                className="w-full lg:w-auto"
              >
                Submit report
              </Button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {reviewModal ? (
        <div className="mobile-sheet-backdrop lg:grid lg:place-items-center lg:px-4 lg:py-6">
          <div className="mobile-sheet-panel lg:w-full lg:max-w-[440px] lg:rounded-[1.5rem] lg:border lg:border-[var(--color-border)] lg:bg-white lg:p-5 lg:shadow-[0_24px_80px_rgba(15,23,42,0.18)]">
            <div className="flex items-start justify-between gap-3 border-b border-[var(--color-divider)] px-4 py-4 lg:border-b-0 lg:px-0 lg:py-0">
              <div>
                <p className="text-lg font-bold tracking-[-0.03em] text-[var(--color-heading)]">Correct timesheet</p>
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
                  Arrived at
                  <Input
                    type="time"
                    value={reviewModal.arrived_at}
                    onChange={(event) => setReviewModal((current) => (current ? { ...current, arrived_at: event.target.value } : current))}
                  />
                </label>
                <label className="grid gap-1.5 text-sm font-medium text-[var(--color-heading)]">
                  Left at
                  <Input
                    type="time"
                    value={reviewModal.left_at}
                    onChange={(event) => setReviewModal((current) => (current ? { ...current, left_at: event.target.value } : current))}
                  />
                </label>
              </div>
              <label className="grid gap-1.5 text-sm font-medium text-[var(--color-heading)]">
                Review note
                <Textarea
                  rows={3}
                  placeholder="Optional explanation"
                  value={reviewModal.review_note}
                  onChange={(event) => setReviewModal((current) => (current ? { ...current, review_note: event.target.value } : current))}
                />
              </label>
            </div>
            </div>

            <div className="border-t border-[var(--color-divider)] px-4 py-4 lg:mt-5 lg:flex lg:justify-end lg:gap-2 lg:border-t-0 lg:px-0 lg:py-0">
              <div className="grid gap-2 lg:flex">
              <Button variant="secondary" onClick={() => setReviewModal(null)}>
                Cancel
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
                Save correction
              </Button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

    </AppShell>

  );

}


