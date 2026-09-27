import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Download } from "lucide-react";

import { AppShell } from "@/components/layout/app-shell";
import { WorkerAvatar } from "@/components/worker-avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ListRow, ListSection } from "@/components/ui/list";
import { Segmented } from "@/components/ui/segmented";
import { Sheet } from "@/components/ui/sheet";
import { canViewPayroll } from "@/lib/access";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { toLocalIso } from "@/lib/date";
import { saveBlob } from "@/lib/file";
import { currencyOf, formatDate, formatMoney } from "@/lib/format";
import { useLanguage } from "@/lib/i18n";
import { useToast } from "@/lib/toast";
import type { PayrollSummaryRow, TimesheetEntry } from "@/lib/types";

type PeriodMode = "week" | "month";

function rangeFor(anchor: Date, mode: PeriodMode) {
  const start = new Date(anchor);
  start.setHours(0, 0, 0, 0);
  if (mode === "month") {
    start.setDate(1);
    return { start: toLocalIso(start), end: toLocalIso(new Date(start.getFullYear(), start.getMonth() + 1, 0)) };
  }
  const day = start.getDay();
  start.setDate(start.getDate() + (day === 0 ? -6 : 1 - day));
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  return { start: toLocalIso(start), end: toLocalIso(end) };
}

function entryHours(entry: TimesheetEntry): number {
  const [startHour, startMinute] = entry.arrived_at.split(":").map(Number);
  const [endHour, endMinute] = entry.left_at.split(":").map(Number);
  let minutes = endHour * 60 + endMinute - (startHour * 60 + startMinute);
  if (minutes <= 0) minutes += 24 * 60;
  return minutes / 60;
}

const hoursText = (value: number | string) => {
  const number = Number(value);
  return `${number % 1 ? number.toFixed(2) : number} h`;
};

export function PayrollPage() {
  const { token, me } = useAuth();
  const { t, lang } = useLanguage();
  const toast = useToast();
  const currency = currencyOf(me);
  const isStaff = me?.role === "STAFF";
  const allowed = isStaff || canViewPayroll(me);

  const [mode, setMode] = useState<PeriodMode>("week");
  const [anchor, setAnchor] = useState(() => new Date());
  const range = useMemo(() => rangeFor(anchor, mode), [anchor, mode]);
  const periodLabel =
    mode === "month"
      ? formatDate(range.start, lang, { month: "long", year: "numeric" })
      : `${formatDate(range.start, lang, { month: "short", day: "numeric" })} – ${formatDate(range.end, lang, { month: "short", day: "numeric" })}`;

  const summaryQuery = useQuery({
    queryKey: ["payroll-summary", range.start, range.end],
    queryFn: () => api.getPayrollSummary(token!, { start_date: range.start, end_date: range.end }),
    enabled: Boolean(token) && allowed,
  });
  const rows = summaryQuery.data?.rows ?? [];
  const [openRow, setOpenRow] = useState<PayrollSummaryRow | null>(null);
  const detailUserId = isStaff ? me?.id : openRow?.user_id;
  const entriesQuery = useQuery({
    queryKey: ["payroll-entries", range.start, range.end, detailUserId],
    queryFn: () => api.listTimesheets(token!, { scope: isStaff ? "my" : "team", start_date: range.start, end_date: range.end, user_id: isStaff ? undefined : detailUserId }),
    enabled: Boolean(token) && allowed && Boolean(detailUserId),
  });
  const confirmed = (entriesQuery.data ?? []).filter((entry) => entry.status === "approved" || entry.status === "corrected").sort((a, b) => a.work_date.localeCompare(b.work_date));

  const [exporting, setExporting] = useState(false);
  const exportCsv = async () => {
    if (!token) return;
    setExporting(true);
    try {
      saveBlob(await api.downloadPayrollCsv(token, { start_date: range.start, end_date: range.end }), `payroll_${range.start}_${range.end}.csv`);
    } catch (error) {
      toast.error(t("dashboard.export_failed"), error instanceof Error ? error.message : undefined);
    } finally {
      setExporting(false);
    }
  };

  const shift = (direction: -1 | 1) =>
    setAnchor((current) => {
      const next = new Date(current);
      if (mode === "month") next.setMonth(next.getMonth() + direction);
      else next.setDate(next.getDate() + 7 * direction);
      return next;
    });

  const totalHours = Number(summaryQuery.data?.total_hours ?? 0);
  const totalPay = Number(summaryQuery.data?.total_payroll_pln ?? 0);
  const overtime = rows.reduce((total, row) => total + Number(row.overtime_hours ?? 0), 0);
  const money = (value: number | string) => formatMoney(value, currency, lang, { decimals: 2 });
  const mine = isStaff ? rows.find((row) => row.user_id === me?.id) ?? rows[0] : null;

  const entryList = (
    <ListSection header={t("payroll.approved_hours")} footer={t("payroll.entries_footer")}>
      {confirmed.map((entry) => (
        <ListRow
          key={entry.id}
          title={`${formatDate(entry.work_date, lang)} · ${entry.arrived_at.slice(0, 5)}–${entry.left_at.slice(0, 5)}`}
          subtitle={entry.is_restricted_entry ? t("schedule.extra_entry") : t("schedule.planned_entry")}
          trailing={<span className="tabular-nums">{hoursText(entryHours(entry))}</span>}
        />
      ))}
      {!confirmed.length ? <ListRow title={<span className="text-[var(--color-text-muted)]">{t("payroll.no_entries")}</span>} /> : null}
    </ListSection>
  );

  if (!allowed) {
    return (
      <AppShell title={t("sub.payroll")} flush>
        <p className="px-4 py-10 text-center text-[15px] text-[var(--color-text-muted)] sm:px-6">{t("payroll.no_access")}</p>
      </AppShell>
    );
  }

  return (
    <AppShell
      title={t("sub.payroll")}
      flush
      action={
        isStaff ? undefined : (
          <Button size="sm" variant="tinted" onClick={exportCsv} disabled={exporting}>
            <Download className="size-4" /> {t("payroll.export")}
          </Button>
        )
      }
    >
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 pb-4 sm:px-6">
        <Segmented
          ariaLabel={t("overview.period")}
          value={mode}
          onChange={setMode}
          options={[
            { value: "week", label: t("overview.week") },
            { value: "month", label: t("overview.month") },
          ]}
        />
        <div className="flex items-center gap-1">
          <Button size="icon" variant="ghost" aria-label={t("overview.previous")} onClick={() => shift(-1)}>
            <ChevronLeft className="size-5" />
          </Button>
          <span className="min-w-[150px] text-center text-[15px] font-semibold text-black">{periodLabel}</span>
          <Button size="icon" variant="ghost" aria-label={t("overview.next")} onClick={() => shift(1)}>
            <ChevronRight className="size-5" />
          </Button>
        </div>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 px-4 sm:grid-cols-3 sm:px-6 [&>*]:ios-island">
        <div className="px-4 py-4">
          <p className="text-[13px] font-semibold text-[var(--color-text-muted)]">{isStaff ? t("payroll.my_pay") : t("payroll.total_pay")}</p>
          <p className="mt-1 text-[28px] font-bold tabular-nums text-black">{money(isStaff ? mine?.payroll_pln ?? 0 : totalPay)}</p>
        </div>
        <div className="px-4 py-4">
          <p className="text-[13px] font-semibold text-[var(--color-text-muted)]">{t("payroll.hours")}</p>
          <p className="mt-1 text-[28px] font-bold tabular-nums text-black">{hoursText(isStaff ? mine?.approved_hours ?? 0 : totalHours)}</p>
        </div>
        <div className="col-span-2 px-4 py-4 sm:col-span-1">
          <p className="text-[13px] font-semibold text-[var(--color-text-muted)]">{t("payroll.overtime")}</p>
          <p className="mt-1 text-[28px] font-bold tabular-nums text-black">{hoursText(isStaff ? mine?.overtime_hours ?? 0 : overtime)}</p>
          <p className="text-[13px] text-[var(--color-text-muted)]">{me?.organization_settings?.labor_rules === "PL" ? t("payroll.overtime_pl") : t("payroll.overtime_us")}</p>
        </div>
      </div>

      {isStaff ? (
        entryList
      ) : (
        <ListSection footer={t("payroll.footer")}>
          {rows.map((row) => (
            <ListRow
              key={row.user_id}
              onClick={() => setOpenRow(row)}
              chevron
              leading={<WorkerAvatar name={row.full_name} size={36} />}
              title={row.full_name}
              subtitle={
                <span>
                  {[row.staff_position, hoursText(row.approved_hours)].filter(Boolean).join(" · ")}
                  {Number(row.overtime_hours ?? 0) > 0 ? (
                    <Badge tone="orange" className="ml-2">
                      {t("payroll.ot", { hours: hoursText(row.overtime_hours ?? 0) })}
                    </Badge>
                  ) : null}
                </span>
              }
              trailing={<span className="font-semibold tabular-nums text-black">{money(row.payroll_pln)}</span>}
            />
          ))}
          {!rows.length ? <ListRow title={<span className="text-[var(--color-text-muted)]">{t("payroll.empty")}</span>} /> : null}
        </ListSection>
      )}

      <Sheet open={Boolean(openRow)} onClose={() => setOpenRow(null)} title={openRow?.full_name ?? ""} subtitle={periodLabel}>
        {openRow ? (
          <div className="-mx-4 sm:-mx-5">
            <ListSection>
              <ListRow title={t("payroll.hours")} trailing={hoursText(openRow.approved_hours)} />
              <ListRow title={t("payroll.base_rate")} trailing={`${money(openRow.hourly_rate_default_pln)}/h`} />
              {Number(openRow.overtime_hours ?? 0) > 0 ? (
                <ListRow title={t("payroll.overtime_premium", { hours: hoursText(openRow.overtime_hours ?? 0) })} trailing={money(openRow.overtime_premium ?? 0)} />
              ) : null}
              <ListRow title={<span className="font-semibold">{t("payroll.gross")}</span>} trailing={<span className="font-bold text-black">{money(openRow.payroll_pln)}</span>} />
            </ListSection>
            {entryList}
          </div>
        ) : null}
      </Sheet>
    </AppShell>
  );
}
