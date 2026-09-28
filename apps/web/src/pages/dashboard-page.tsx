import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AlertTriangle, ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { useNavigate } from "react-router-dom";

import { AppShell } from "@/components/layout/app-shell";
import { OnboardingChecklist } from "@/components/onboarding-checklist";
import { Button } from "@/components/ui/button";
import { ListRow, ListSection } from "@/components/ui/list";
import { Segmented } from "@/components/ui/segmented";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { toLocalIso } from "@/lib/date";
import { currencyOf, formatDate, formatMoney } from "@/lib/format";
import { useLanguage } from "@/lib/i18n";
import { cn } from "@/lib/utils";

type PeriodMode = "week" | "month";

const REVENUE_COLOR = "#1f5bd6";
const LABOR_COLOR = "#e8590c";

function buildPeriod(anchor: Date, mode: PeriodMode) {
  const start = new Date(anchor);
  start.setHours(0, 0, 0, 0);
  if (mode === "month") {
    start.setDate(1);
    const end = new Date(start.getFullYear(), start.getMonth() + 1, 0);
    return { start: toLocalIso(start), end: toLocalIso(end) };
  }
  const day = start.getDay();
  start.setDate(start.getDate() + (day === 0 ? -6 : 1 - day));
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  return { start: toLocalIso(start), end: toLocalIso(end) };
}

const sum = (rows: Array<Record<string, string>>, key: string) => rows.reduce((total, row) => total + Number(row[key] ?? 0), 0);

/** Share of revenue going to wages: under 30% is healthy for a restaurant, above 35% needs attention. */
function laborTone(percent: number | null) {
  if (percent === null) return "text-black";
  if (percent <= 30) return "text-[var(--color-success)]";
  if (percent <= 35) return "text-[var(--color-warning)]";
  return "text-[var(--color-danger)]";
}

function Stat({ label, value, note, valueClass }: { label: string; value: string; note?: string; valueClass?: string }) {
  return (
    <div className="min-w-0 px-4 py-4">
      <p className="text-[13px] font-semibold text-[var(--color-text-muted)]">{label}</p>
      <p className={cn("mt-1 truncate text-[30px] font-semibold leading-tight tracking-[-0.01em] tabular-nums text-black", valueClass)}>{value}</p>
      {note ? <p className="mt-0.5 truncate text-[13px] text-[var(--color-text-muted)]">{note}</p> : null}
    </div>
  );
}

export function DashboardPage() {
  const { token, me } = useAuth();
  const { t, lang } = useLanguage();
  const navigate = useNavigate();
  const currency = currencyOf(me);
  const money = (value: number) => formatMoney(value, currency, lang, { decimals: 0 });

  const [mode, setMode] = useState<PeriodMode>("week");
  const [anchor, setAnchor] = useState(() => new Date());
  const period = useMemo(() => buildPeriod(anchor, mode), [anchor, mode]);
  const periodLabel =
    mode === "month"
      ? formatDate(period.start, lang, { month: "long", year: "numeric" })
      : `${formatDate(period.start, lang, { month: "short", day: "numeric" })} – ${formatDate(period.end, lang, { month: "short", day: "numeric" })}`;

  const dashboardQuery = useQuery({
    queryKey: ["dashboard", period.start, period.end],
    queryFn: () => api.ownerDashboard(token!, period.start, period.end),
    enabled: Boolean(token),
  });
  const data = dashboardQuery.data;
  const onClockQuery = useQuery({ queryKey: ["clock-team"], queryFn: () => api.clockTeam(token!), enabled: Boolean(token), refetchInterval: 60_000 });
  const onClock = onClockQuery.data ?? [];

  const revenue = sum(data?.totals_by_day ?? [], "revenue");
  const labor = sum(data?.labor_cost_by_day ?? [], "labor_cost_pln");
  const hours = Number(data?.timesheets_summary?.approved_worked_hours ?? 0);
  const pending = Number(data?.timesheets_summary?.pending_count ?? 0);
  const laborPercent = revenue > 0 ? (labor / revenue) * 100 : null;

  const chartData = useMemo(
    () =>
      (data?.revenue_vs_labor ?? []).map((row) => ({
        label: formatDate(row.date, lang, mode === "month" ? { day: "numeric" } : { weekday: "short" }),
        date: formatDate(row.date, lang, { weekday: "short", month: "short", day: "numeric" }),
        revenue: Number(row.revenue),
        labor: Number(row.labor_cost_pln),
      })),
    [data, lang, mode],
  );
  const hasChartData = chartData.some((row) => row.revenue > 0 || row.labor > 0);

  const laborByLocation = Object.fromEntries((data?.labor_cost_by_location ?? []).map((row) => [row.location_id, Number(row.labor_cost_pln)]));
  const locationRows = [
    ...(data?.totals_by_location ?? []).map((row) => ({ id: row.location_id, name: row.location_name, revenue: Number(row.revenue) })),
    ...(data?.labor_cost_by_location ?? [])
      .filter((row) => !(data?.totals_by_location ?? []).some((item) => item.location_id === row.location_id))
      .map((row) => ({ id: row.location_id, name: row.location_name, revenue: 0 })),
  ];

  const today = toLocalIso(new Date());
  const todayInPeriod = today >= period.start && today <= period.end;
  const hasTodayRevenue = (data?.totals_by_day ?? []).some((row) => row.date === today && Number(row.revenue) > 0);

  const shift = (direction: -1 | 1) =>
    setAnchor((current) => {
      const next = new Date(current);
      if (mode === "month") next.setMonth(next.getMonth() + direction);
      else next.setDate(next.getDate() + 7 * direction);
      return next;
    });

  return (
    <AppShell
      title={t("sub.overview")}
      flush
      action={
        <Button size="sm" onClick={() => navigate("/overview/revenue")}>
          <Plus className="size-4" /> {t("overview.add_revenue")}
        </Button>
      }
    >
      <OnboardingChecklist />

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

      <div className="mb-6 grid grid-cols-2 gap-3 px-4 sm:px-6 lg:grid-cols-4 [&>*]:ios-island">
        <Stat label={t("overview.revenue")} value={money(revenue)} />
        <Stat label={t("overview.labor_cost")} value={money(labor)} note={t("overview.labor_note")} />
        <Stat
          label={t("overview.labor_percent")}
          value={laborPercent === null ? "—" : `${laborPercent.toFixed(1)}%`}
          valueClass={laborTone(laborPercent)}
          note={laborPercent === null ? t("overview.needs_revenue") : t("overview.labor_target")}
        />
        <Stat label={t("overview.hours")} value={`${hours % 1 ? hours.toFixed(1) : hours} h`} note={t("overview.hours_note")} />
      </div>

      {(pending > 0 || (todayInPeriod && !hasTodayRevenue)) && (
        <ListSection header={t("overview.needs_attention")}>
          {pending > 0 ? (
            <ListRow
              onClick={() => navigate("/schedule/hours")}
              chevron
              leading={<AlertTriangle className="size-5 text-[var(--color-warning)]" />}
              title={t("overview.pending_hours", { count: pending })}
            />
          ) : null}
          {todayInPeriod && !hasTodayRevenue ? (
            <ListRow
              onClick={() => navigate("/overview/revenue")}
              chevron
              leading={<Plus className="size-5 text-[var(--color-primary-strong)]" />}
              title={t("overview.no_revenue_today")}
            />
          ) : null}
        </ListSection>
      )}

      {onClock.length ? (
        <ListSection header={t("clock.now_on_shift", { count: onClock.length })}>
          {onClock.map((row) => (
            <ListRow
              key={row.id}
              title={row.full_name}
              subtitle={[row.shift?.staff_position, row.location_name].filter(Boolean).join(" · ") || t("clock.no_shift")}
              trailing={<span className="tabular-nums">{t("clock.since", { time: new Date(row.clock_in_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) })}</span>}
            />
          ))}
        </ListSection>
      ) : null}

      <section className="ios-island mx-4 mb-6 px-4 py-5 sm:mx-6 sm:px-5">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="text-[17px] font-semibold text-black">{t("overview.chart_title")}</h2>
          <div className="flex items-center gap-4 text-[13px] text-[var(--color-text-muted)]" aria-hidden={!hasChartData}>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-0.5 w-4 rounded-full" style={{ backgroundColor: REVENUE_COLOR }} /> {t("overview.revenue")}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-0.5 w-4 rounded-full" style={{ backgroundColor: LABOR_COLOR }} /> {t("overview.labor_cost")}
            </span>
          </div>
        </div>
        <div className="mt-4 h-[260px] sm:h-[320px]">
          {hasChartData ? (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid stroke="#e5e5ea" vertical={false} />
                <XAxis dataKey="label" tickLine={false} axisLine={{ stroke: "#c6c6c8" }} tick={{ fill: "#3c3c43", fontSize: 12 }} interval="preserveStartEnd" />
                <YAxis
                  width={56}
                  tickLine={false}
                  axisLine={false}
                  tick={{ fill: "#3c3c43", fontSize: 12 }}
                  tickFormatter={(value: number) => formatMoney(value, currency, lang, { decimals: 0 })}
                />
                <Tooltip
                  cursor={{ stroke: "#8e8e93", strokeWidth: 1 }}
                  contentStyle={{ borderRadius: 12, border: "1px solid #c6c6c8", boxShadow: "0 8px 24px rgba(0,0,0,0.12)", fontSize: 13 }}
                  labelFormatter={(_label, payload) => (payload?.[0]?.payload as { date?: string } | undefined)?.date ?? ""}
                  formatter={(value: number, name: string) => [money(value), name === "revenue" ? t("overview.revenue") : t("overview.labor_cost")]}
                />
                <Line type="monotone" dataKey="revenue" stroke={REVENUE_COLOR} strokeWidth={2} dot={false} activeDot={{ r: 5, strokeWidth: 2, stroke: "#fff" }} />
                <Line type="monotone" dataKey="labor" stroke={LABOR_COLOR} strokeWidth={2} dot={false} activeDot={{ r: 5, strokeWidth: 2, stroke: "#fff" }} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="grid h-full place-items-center rounded-2xl bg-[var(--color-grouped)] text-center">
              <div>
                <p className="text-[17px] font-semibold text-black">{t("overview.chart_empty_title")}</p>
                <p className="mt-1 text-[15px] text-[var(--color-text-muted)]">{t("overview.chart_empty_body")}</p>
              </div>
            </div>
          )}
        </div>
      </section>

      <ListSection header={t("overview.by_location")}>
        {locationRows.map((row) => {
          const locationLabor = laborByLocation[row.id] ?? 0;
          const percent = row.revenue > 0 ? (locationLabor / row.revenue) * 100 : null;
          return (
            <ListRow
              key={row.id}
              title={row.name}
              subtitle={t("overview.location_line", { revenue: money(row.revenue), labor: money(locationLabor) })}
              trailing={<span className={cn("font-semibold tabular-nums", laborTone(percent))}>{percent === null ? "—" : `${percent.toFixed(1)}%`}</span>}
            />
          );
        })}
        {!locationRows.length ? <ListRow title={<span className="text-[var(--color-text-muted)]">{t("overview.no_location_data")}</span>} /> : null}
      </ListSection>
    </AppShell>
  );
}
