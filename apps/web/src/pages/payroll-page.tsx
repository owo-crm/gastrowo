import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, CreditCard, ReceiptText, Users2 } from "lucide-react";

import { AppShell } from "@/components/layout/app-shell";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { canViewPayroll } from "@/lib/access";
import { useLanguage } from "@/lib/i18n";
import type { PayrollSummaryRow, TimesheetEntry } from "@/lib/types";

type PeriodMode = "weekly" | "monthly";

function toIsoDate(value: Date): string {
  const year = value.getFullYear();
  const month = `${value.getMonth() + 1}`.padStart(2, "0");
  const day = `${value.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function startOfWeek(value: Date): Date {
  const next = new Date(value);
  const day = next.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  next.setDate(next.getDate() + diff);
  next.setHours(0, 0, 0, 0);
  return next;
}

function endOfWeek(value: Date): Date {
  const next = startOfWeek(value);
  next.setDate(next.getDate() + 6);
  return next;
}

function startOfMonth(value: Date): Date {
  return new Date(value.getFullYear(), value.getMonth(), 1);
}

function endOfMonth(value: Date): Date {
  return new Date(value.getFullYear(), value.getMonth() + 1, 0);
}

function shiftAnchor(value: Date, direction: number, mode: PeriodMode): Date {
  const next = new Date(value);
  if (mode === "monthly") {
    next.setMonth(next.getMonth() + direction);
  } else {
    next.setDate(next.getDate() + direction * 7);
  }
  return next;
}

function periodLabel(anchor: Date, mode: PeriodMode): string {
  if (mode === "monthly") {
    return anchor.toLocaleDateString(undefined, { month: "long", year: "numeric" });
  }
  const start = startOfWeek(anchor);
  const end = endOfWeek(anchor);
  return `${start.toLocaleDateString(undefined, { day: "2-digit", month: "2-digit" })} - ${end.toLocaleDateString(undefined, { day: "2-digit", month: "2-digit" })}`;
}

function rangeFor(anchor: Date, mode: PeriodMode) {
  const start = mode === "monthly" ? startOfMonth(anchor) : startOfWeek(anchor);
  const end = mode === "monthly" ? endOfMonth(anchor) : endOfWeek(anchor);
  return { start: toIsoDate(start), end: toIsoDate(end) };
}

function timesheetHours(entry: TimesheetEntry): number {
  const [startHour, startMinute] = entry.arrived_at.split(":").map(Number);
  const [endHour, endMinute] = entry.left_at.split(":").map(Number);
  const startTotal = startHour * 60 + startMinute;
  let endTotal = endHour * 60 + endMinute;
  if (endTotal <= startTotal) endTotal += 24 * 60;
  return (endTotal - startTotal) / 60;
}

function selectedRowFrom(rows: PayrollSummaryRow[], userId: string | null | undefined): PayrollSummaryRow | null {
  if (!rows.length) return null;
  if (!userId) return rows[0];
  return rows.find((row) => row.user_id === userId) ?? rows[0];
}

export function PayrollPage() {
  const { token, me } = useAuth();
  const { t } = useLanguage();
  const [periodMode, setPeriodMode] = useState<PeriodMode>("weekly");
  const [anchorDate, setAnchorDate] = useState(() => new Date());
  const isStaff = me?.role === "STAFF";
  const payrollAllowed = isStaff || canViewPayroll(me);
  const range = useMemo(() => rangeFor(anchorDate, periodMode), [anchorDate, periodMode]);

  const teamPayrollQuery = useQuery({
    queryKey: ["payroll-summary", periodMode, range.start, range.end],
    queryFn: () => api.getPayrollSummary(token!, { start_date: range.start, end_date: range.end }),
    enabled: Boolean(token) && payrollAllowed,
  });

  const [selectedUserId, setSelectedUserId] = useState<string>("");

  useEffect(() => {
    const nextDefault = isStaff ? me?.id ?? "" : teamPayrollQuery.data?.rows[0]?.user_id ?? "";
    if (nextDefault && !selectedUserId) {
      setSelectedUserId(nextDefault);
    }
  }, [isStaff, me?.id, selectedUserId, teamPayrollQuery.data?.rows]);

  const detailUserId = isStaff ? undefined : selectedUserId || undefined;
  const detailPayrollQuery = useQuery({
    queryKey: ["payroll-summary-detail", periodMode, range.start, range.end, detailUserId ?? "self"],
    queryFn: () => api.getPayrollSummary(token!, { start_date: range.start, end_date: range.end, user_id: detailUserId }),
    enabled: Boolean(token) && payrollAllowed,
  });

  const timesheetsQuery = useQuery({
    queryKey: ["payroll-timesheets", periodMode, range.start, range.end, detailUserId ?? "self"],
    queryFn: () =>
      api.listTimesheets(token!, {
        scope: isStaff ? "my" : "team",
        start_date: range.start,
        end_date: range.end,
        user_id: detailUserId,
      }),
    enabled: Boolean(token) && payrollAllowed,
  });

  const selectedRow = useMemo(
    () => selectedRowFrom(detailPayrollQuery.data?.rows ?? teamPayrollQuery.data?.rows ?? [], isStaff ? me?.id : selectedUserId),
    [detailPayrollQuery.data?.rows, teamPayrollQuery.data?.rows, isStaff, me?.id, selectedUserId],
  );

  const confirmedTimesheets = useMemo(
    () => (timesheetsQuery.data ?? []).filter((entry) => entry.status === "approved" || entry.status === "corrected"),
    [timesheetsQuery.data],
  );

  const changePeriod = (direction: number) => setAnchorDate((current) => shiftAnchor(current, direction, periodMode));

  if (!payrollAllowed) {
    return (
      <AppShell title={t("dashboard.payroll")} subtitle="Payroll access is disabled for this account.">
        <Card className="rounded-[1.3rem] border border-amber-200 bg-amber-50 px-5 py-5 text-sm text-amber-800">Payroll access is disabled for this account.</Card>
      </AppShell>
    );
  }

  return (
    <AppShell
      title={t("dashboard.payroll")}
      subtitle={isStaff ? "Your confirmed hours and earnings in one place." : "Team payroll overview with drill-down into each employee."}
      action={<Badge>{periodLabel(anchorDate, periodMode)}</Badge>}
    >
      <div className="space-y-4">
        <Card className="rounded-[1.4rem] border border-slate-200/80 bg-white p-4 sm:p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="inline-flex items-center gap-1 rounded-[0.9rem] border border-slate-200 bg-white px-1 py-1 shadow-[0_8px_18px_rgba(15,23,42,0.04)]">
              <button
                type="button"
                onClick={() => setPeriodMode("weekly")}
                className={`rounded-[0.7rem] px-3 py-1.5 text-sm font-semibold transition ${periodMode === "weekly" ? "bg-slate-950 text-white" : "text-slate-500 hover:text-slate-950"}`}
              >
                {t("dashboard.weekly")}
              </button>
              <button
                type="button"
                onClick={() => setPeriodMode("monthly")}
                className={`rounded-[0.7rem] px-3 py-1.5 text-sm font-semibold transition ${periodMode === "monthly" ? "bg-slate-950 text-white" : "text-slate-500 hover:text-slate-950"}`}
              >
                {t("dashboard.monthly")}
              </button>
            </div>
            <div className="inline-flex items-center gap-2 rounded-[0.9rem] border border-slate-200 bg-white px-2 py-1.5 shadow-[0_8px_18px_rgba(15,23,42,0.04)]">
              <button type="button" onClick={() => changePeriod(-1)} className="grid size-8 place-items-center rounded-full text-slate-500 transition hover:bg-slate-100 hover:text-slate-950">
                <ChevronLeft className="size-4" />
              </button>
              <div className="min-w-[110px] text-center text-sm font-semibold text-slate-900 sm:min-w-[150px]">{periodLabel(anchorDate, periodMode)}</div>
              <button type="button" onClick={() => changePeriod(1)} className="grid size-8 place-items-center rounded-full text-slate-500 transition hover:bg-slate-100 hover:text-slate-950">
                <ChevronRight className="size-4" />
              </button>
            </div>
          </div>
        </Card>

        <section className="grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
          {!isStaff ? (
            <Card className="rounded-[1.4rem] border border-slate-200/80 bg-white p-4 sm:p-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Team payroll</p>
                  <p className="mt-1 text-sm text-slate-600">Select an employee to inspect their payroll.</p>
                </div>
                <Users2 className="size-4 text-[var(--color-primary)]" />
              </div>
              <div className="mt-4 space-y-2">
                {(teamPayrollQuery.data?.rows ?? []).map((row) => (
                  <button
                    key={row.user_id}
                    type="button"
                    onClick={() => setSelectedUserId(row.user_id)}
                    className={`w-full rounded-[1rem] border px-3 py-3 text-left transition ${
                      selectedUserId === row.user_id ? "border-[var(--color-primary)] bg-[var(--color-accent)]" : "border-slate-200 bg-white hover:border-slate-300"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-slate-900">{row.full_name}</p>
                        <p className="mt-1 text-xs text-slate-500">{row.staff_position ?? row.role}</p>
                      </div>
                      <p className="shrink-0 text-sm font-semibold text-emerald-700">{Number(row.payroll_pln).toFixed(2)} PLN</p>
                    </div>
                  </button>
                ))}
              </div>
            </Card>
          ) : null}

          <div className="space-y-4">
            <section className="grid gap-3 sm:grid-cols-3">
              <Card className="rounded-[1.25rem] border border-slate-200/80 bg-white px-4 py-4">
                <ReceiptText className="size-4 text-[var(--color-primary)]" />
                <p className="mt-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">{t("dashboard.approved_hours")}</p>
                <p className="mt-2 text-2xl font-bold tracking-[-0.05em] text-slate-950">{selectedRow ? `${Number(selectedRow.approved_hours).toFixed(1)}h` : "0.0h"}</p>
              </Card>
              <Card className="rounded-[1.25rem] border border-slate-200/80 bg-white px-4 py-4">
                <Users2 className="size-4 text-[var(--color-primary)]" />
                <p className="mt-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">{t("dashboard.rate")}</p>
                <p className="mt-2 text-2xl font-bold tracking-[-0.05em] text-slate-950">{selectedRow ? `${Number(selectedRow.hourly_rate_default_pln).toFixed(2)} PLN/h` : "0.00 PLN/h"}</p>
              </Card>
              <Card className="rounded-[1.25rem] border border-slate-200/80 bg-white px-4 py-4">
                <CreditCard className="size-4 text-[var(--color-primary)]" />
                <p className="mt-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">{t("dashboard.payroll")}</p>
                <p className="mt-2 text-2xl font-bold tracking-[-0.05em] text-emerald-700">{selectedRow ? `${Number(selectedRow.payroll_pln).toFixed(2)} PLN` : "0.00 PLN"}</p>
              </Card>
            </section>

            <Card className="rounded-[1.4rem] border border-slate-200/80 bg-white p-4 sm:p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">{isStaff ? "My payroll detail" : "Individual payroll detail"}</p>
                  <h2 className="mt-1 text-xl font-semibold text-slate-950">{selectedRow?.full_name ?? "—"}</h2>
                  <p className="mt-1 text-sm text-slate-600">{selectedRow?.staff_position ?? selectedRow?.role ?? "No position"}</p>
                </div>
                <Badge>{confirmedTimesheets.length} entries</Badge>
              </div>

              <div className="mt-4 space-y-3">
                {confirmedTimesheets.map((entry) => (
                  <div key={entry.id} className="rounded-[1rem] border border-slate-200 bg-white px-4 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-900">{entry.work_date}</p>
                        <p className="mt-1 text-xs text-slate-500">{entry.arrived_at.slice(0, 5)} - {entry.left_at.slice(0, 5)}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-semibold text-slate-900">{timesheetHours(entry).toFixed(1)}h</p>
                        <p className="mt-1 text-xs text-slate-500">{entry.status}</p>
                      </div>
                    </div>
                    {entry.note ? <p className="mt-2 text-sm text-slate-600">{entry.note}</p> : null}
                  </div>
                ))}
                {!confirmedTimesheets.length ? <p className="py-6 text-sm text-slate-500">No confirmed timesheets in this period.</p> : null}
              </div>
            </Card>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
