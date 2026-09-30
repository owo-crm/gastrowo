import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet } from "@/components/ui/sheet";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { formatTime, toLocalIso } from "@/lib/date";
import { formatDate } from "@/lib/format";
import { useLanguage } from "@/lib/i18n";
import { useToast } from "@/lib/toast";
import type { TimesheetEntry, TimesheetReviewAction } from "@/lib/types";

const PAGE_DAYS = 90;

function minutesOf(value: string): number {
  const [hours, minutes] = value.split(":").map(Number);
  return (hours ?? 0) * 60 + (minutes ?? 0);
}

/** Worked hours of one entry: across midnight when it ends "before" it starts, minus the break. */
export function entryHours(entry: Pick<TimesheetEntry, "arrived_at" | "left_at" | "break_minutes">): number {
  let span = minutesOf(entry.left_at) - minutesOf(entry.arrived_at);
  if (span <= 0) span += 24 * 60;
  return Math.max(0, span - (entry.break_minutes ?? 0)) / 60;
}

const STATUS_TONE: Record<TimesheetEntry["status"], "green" | "red" | "orange" | "blue"> = {
  approved: "green",
  corrected: "blue",
  rejected: "red",
  pending: "orange",
};

type Draft = { arrived_at: string; left_at: string; review_note: string };

/**
 * Every shift one person worked, newest first. A manager can fix any entry, also after it was
 * approved (a forgotten clock-out, a wrong break); payroll always reads the current values.
 */
export function WorkerHistorySheet({ userId, name, onClose }: { userId: string | null; name: string; onClose: () => void }) {
  const { token } = useAuth();
  const { t, lang } = useLanguage();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [days, setDays] = useState(PAGE_DAYS);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>({ arrived_at: "", left_at: "", review_note: "" });

  const start = toLocalIso(new Date(Date.now() - days * 86_400_000));
  const historyQuery = useQuery({
    queryKey: ["worker-history", userId, start],
    queryFn: () => api.listTimesheets(token!, { scope: "team", user_id: userId!, start_date: start }),
    enabled: Boolean(token && userId),
  });
  const entries = historyQuery.data ?? [];
  const counted = entries.filter((entry) => entry.status === "approved" || entry.status === "corrected");
  const last28 = toLocalIso(new Date(Date.now() - 28 * 86_400_000));
  const recentHours = counted.filter((entry) => entry.work_date >= last28).reduce((total, entry) => total + entryHours(entry), 0);

  const review = useMutation({
    mutationFn: ({ entry, payload }: { entry: TimesheetEntry; payload: TimesheetReviewAction }) => api.reviewTimesheet(token!, entry.id, payload),
    onSuccess: () => {
      toast.success(t("history.saved"));
      setEditing(null);
      for (const key of ["worker-history", "timesheets", "payroll-summary", "payroll-entries", "dashboard"]) void queryClient.invalidateQueries({ queryKey: [key] });
    },
    onError: (error) => toast.error(t("history.save_failed"), error instanceof Error ? error.message : undefined),
  });

  const open = (entry: TimesheetEntry) => {
    setEditing(entry.id);
    setDraft({ arrived_at: formatTime(entry.arrived_at), left_at: formatTime(entry.left_at), review_note: entry.review_note ?? "" });
  };

  return (
    <Sheet open={Boolean(userId)} onClose={onClose} title={t("history.title")} subtitle={name} size="lg" grouped>
      <div className="mb-5 grid grid-cols-2 gap-3">
        <div className="ios-island px-4 py-3">
          <p className="text-[13px] font-semibold text-[var(--color-text-muted)]">{t("history.last_4_weeks")}</p>
          <p className="mt-0.5 text-[24px] font-semibold tabular-nums text-black">{t("history.hours", { hours: recentHours.toFixed(1) })}</p>
        </div>
        <div className="ios-island px-4 py-3">
          <p className="text-[13px] font-semibold text-[var(--color-text-muted)]">{t("history.shifts_shown")}</p>
          <p className="mt-0.5 text-[24px] font-semibold tabular-nums text-black">{entries.length}</p>
        </div>
      </div>

      <ul className="ios-island divide-y divide-[#e5e5ea]" data-testid="worker-history">
        {entries.map((entry) => {
          const isOpen = editing === entry.id;
          return (
            <li key={entry.id} className="px-4 py-3">
              <button type="button" onClick={() => (isOpen ? setEditing(null) : open(entry))} className="flex w-full items-center gap-3 text-left active:opacity-60">
                <span className="min-w-0 flex-1">
                  <span className="block text-[16px] text-black">{formatDate(entry.work_date, lang, { weekday: "short", month: "short", day: "numeric", year: "numeric" })}</span>
                  <span className="block truncate text-[14px] text-[#3c3c43]">
                    {formatTime(entry.arrived_at)}–{formatTime(entry.left_at)} · {t("history.hours", { hours: entryHours(entry).toFixed(1) })}
                    {entry.is_restricted_entry ? ` · ${t("schedule.extra_entry")}` : ""}
                  </span>
                  {entry.review_note || entry.note ? <span className="block truncate text-[13px] text-[#6c6c70]">{entry.review_note || entry.note}</span> : null}
                </span>
                <Badge tone={STATUS_TONE[entry.status]}>{t(`history.status.${entry.status}`)}</Badge>
              </button>
              {isOpen ? (
                <div className="mt-3 space-y-3 rounded-[14px] bg-[var(--color-bg)] p-3">
                  <div className="grid grid-cols-2 gap-3">
                    <label className="grid gap-1.5 text-[13px] font-semibold text-[var(--color-text-muted)]">
                      {t("schedule.arrived_at")}
                      <Input type="time" value={draft.arrived_at} onChange={(event) => setDraft((current) => ({ ...current, arrived_at: event.target.value }))} />
                    </label>
                    <label className="grid gap-1.5 text-[13px] font-semibold text-[var(--color-text-muted)]">
                      {t("schedule.left_at")}
                      <Input type="time" value={draft.left_at} onChange={(event) => setDraft((current) => ({ ...current, left_at: event.target.value }))} />
                    </label>
                  </div>
                  <Input placeholder={t("schedule.review_note_placeholder")} value={draft.review_note} onChange={(event) => setDraft((current) => ({ ...current, review_note: event.target.value }))} />
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      onClick={() =>
                        review.mutate({
                          entry,
                          payload: { action: "correct", arrived_at: `${draft.arrived_at}:00`, left_at: `${draft.left_at}:00`, review_note: draft.review_note.trim() || undefined },
                        })
                      }
                      disabled={review.isPending || !draft.arrived_at || !draft.left_at}
                    >
                      {t("history.save_times")}
                    </Button>
                    {entry.status !== "approved" ? (
                      <Button size="sm" variant="tinted" onClick={() => review.mutate({ entry, payload: { action: "approve" } })} disabled={review.isPending}>
                        <Check className="size-4" /> {t("schedule.approve")}
                      </Button>
                    ) : null}
                    {entry.status !== "rejected" ? (
                      <Button size="sm" variant="danger-plain" onClick={() => review.mutate({ entry, payload: { action: "reject", review_note: draft.review_note.trim() || undefined } })} disabled={review.isPending}>
                        <X className="size-4" /> {t("schedule.reject")}
                      </Button>
                    ) : null}
                  </div>
                  {entry.status !== "pending" ? <p className="text-[13px] text-[var(--color-text-muted)]">{t("history.edit_hint")}</p> : null}
                </div>
              ) : null}
            </li>
          );
        })}
        {!historyQuery.isLoading && !entries.length ? <li className="px-4 py-4 text-[15px] text-[var(--color-text-muted)]">{t("history.empty")}</li> : null}
      </ul>
      <div className="mt-4 flex justify-center">
        <Button variant="plain" onClick={() => setDays((current) => current + PAGE_DAYS)} disabled={historyQuery.isFetching}>
          {t("history.show_earlier")}
        </Button>
      </div>
    </Sheet>
  );
}
