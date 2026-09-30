import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Coffee, Play, Square, Tablet } from "lucide-react";

import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { formatTime, toLocalIso } from "@/lib/date";
import { formatDate, localeFor } from "@/lib/format";
import { useLanguage } from "@/lib/i18n";
import { useToast } from "@/lib/toast";
import type { ClockSessionInfo } from "@/lib/types";

/** Worked time so far: since clock-in, minus finished breaks and the one running now. */
function elapsed(session: ClockSessionInfo, now: number) {
  const running = session.on_break && session.break_started_at ? now - new Date(session.break_started_at).getTime() : 0;
  const worked = now - new Date(session.clock_in_at).getTime() - session.break_seconds * 1000 - running;
  const minutes = Math.max(0, Math.floor(worked / 60000));
  return `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, "0")}`;
}

/** Start / end shift from the worker's own phone, like a punch clock in the pocket. */
export function ClockCard() {
  const { token } = useAuth();
  const { t, lang } = useLanguage();
  const dayLabel = (iso: string) => {
    const today = toLocalIso(new Date());
    const tomorrow = toLocalIso(new Date(Date.now() + 86_400_000));
    if (iso === today) return t("home.today");
    if (iso === tomorrow) return t("home.tomorrow");
    return formatDate(iso, lang);
  };
  const toast = useToast();
  const queryClient = useQueryClient();
  const [now, setNow] = useState(() => Date.now());

  const clockQuery = useQuery({ queryKey: ["clock-me"], queryFn: () => api.clockMe(token!), enabled: Boolean(token) });
  const session = clockQuery.data?.open_session ?? null;

  useEffect(() => {
    if (!session) return;
    const timer = window.setInterval(() => setNow(Date.now()), 15_000);
    return () => window.clearInterval(timer);
  }, [session]);

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["clock-me"] });
    void queryClient.invalidateQueries({ queryKey: ["timesheets"] });
    void queryClient.invalidateQueries({ queryKey: ["myTimesheets"] });
  };
  const start = useMutation({
    mutationFn: () => api.clockIn(token!),
    onSuccess: () => {
      setNow(Date.now());
      toast.success(t("clock.started"));
      refresh();
    },
    onError: (error) => toast.error(t("clock.failed"), error instanceof Error ? error.message : undefined),
  });
  const breakMutation = useMutation({
    mutationFn: (phase: "start" | "end") => api.clockBreak(token!, phase),
    onSuccess: (_data, phase) => {
      toast.success(phase === "start" ? t("clock.break_started") : t("clock.break_ended"));
      refresh();
    },
    onError: (error) => toast.error(t("clock.failed"), error instanceof Error ? error.message : undefined),
  });
  const stop = useMutation({
    mutationFn: () => api.clockOut(token!),
    onSuccess: (result) => {
      toast.success(t("clock.ended"), result.timesheet_status === "approved" ? t("clock.auto_approved") : t("clock.sent_for_review"));
      refresh();
    },
    onError: (error) => toast.error(t("clock.failed"), error instanceof Error ? error.message : undefined),
  });

  const data = clockQuery.data;
  if (!data) return null;
  const next = data.next_shift ?? null;
  // Already started (by this device's clock): it's the current shift, not the next one.
  const todayIso = toLocalIso(new Date(now));
  const running = Boolean(
    next && (next.date < todayIso || (next.date === todayIso && formatTime(next.start_time) <= new Date(now).toTimeString().slice(0, 5))),
  );

  /** "Today" / "Tomorrow" / "Fri, Oct 3", then the times, position and place. */
  const nextShiftLines = next ? (
    <>
      <p className="text-[13px] font-semibold text-[var(--color-primary-strong)]">{running ? t("home.current_shift") : t("home.next_shift")}</p>
      <p className="text-[20px] font-semibold leading-tight tabular-nums text-black">
        {dayLabel(next.date)} · {formatTime(next.start_time)}–{formatTime(next.end_time)}
      </p>
      <p className="truncate text-[14px] text-[var(--color-text-muted)]">{[next.staff_position, next.location_name].filter(Boolean).join(" · ")}</p>
    </>
  ) : (
    <>
      <p className="text-[17px] font-semibold text-black">{t("home.no_next_shift")}</p>
      <p className="text-[14px] text-[var(--color-text-muted)]">{t("home.no_next_shift_body")}</p>
    </>
  );

  if (!data.phone_allowed) {
    return (
      <div className="ios-island mx-4 mb-4 flex items-center gap-3 px-4 py-3.5 sm:mx-6" data-testid="home-card">
        <div className="min-w-0 flex-1">
          {nextShiftLines}
          <p className="mt-1.5 flex items-center gap-1.5 text-[13px] text-[var(--color-text-muted)]">
            <Tablet className="size-4 shrink-0" /> {data.has_pin ? t("clock.use_tablet_body") : t("clock.no_pin_body")}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="ios-island mx-4 mb-4 flex items-center gap-3 px-4 py-3.5 sm:mx-6" data-testid="home-card">
      <div className="min-w-0 flex-1">
        {session ? (
          <>
            <p className={session.on_break ? "text-[13px] font-semibold text-[var(--color-warning)]" : "text-[13px] font-semibold text-[var(--color-success)]"}>
              {session.on_break ? t("clock.on_break") : t("clock.on_the_clock")}
            </p>
            <p className="text-[28px] font-semibold leading-tight tabular-nums text-black">{elapsed(session, now)}</p>
            <p className="truncate text-[14px] text-[var(--color-text-muted)]">
              {t("clock.since", { time: new Date(session.clock_in_at).toLocaleTimeString(localeFor(lang), { hour: "2-digit", minute: "2-digit" }) })}
              {session.shift ? ` · ${formatTime(session.shift.start_time)}–${formatTime(session.shift.end_time)}` : ` · ${t("clock.no_shift")}`}
            </p>
          </>
        ) : (
          nextShiftLines
        )}
      </div>
      {session ? (
        <div className="flex shrink-0 flex-col gap-2">
          <Button size="lg" variant="danger" onClick={() => stop.mutate()} disabled={stop.isPending}>
            <Square className="size-4 fill-current" /> {t("clock.end")}
          </Button>
          <Button size="sm" variant="tinted" onClick={() => breakMutation.mutate(session.on_break ? "end" : "start")} disabled={breakMutation.isPending}>
            <Coffee className="size-4" /> {session.on_break ? t("clock.end_break") : t("clock.take_break")}
          </Button>
        </div>
      ) : (
        <Button size="lg" onClick={() => start.mutate()} disabled={start.isPending}>
          <Play className="size-4 fill-current" /> {t("clock.start")}
        </Button>
      )}
    </div>
  );
}
