import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  Camera,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Coins,
  CreditCard,
  Eye,
  FileUp,
  Gauge,
  MapPinned,
  ReceiptText,
  Trash2,
  TrendingUp,
  Users2,
  X,
} from "lucide-react";

import { canDeleteReports, canViewPayroll } from "@/lib/access";
import { AppShell } from "@/components/layout/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { OverlayPortal } from "@/components/ui/overlay-portal";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { parseLocalIso, toLocalIso } from "@/lib/date";
import { fileToDataUrl } from "@/lib/file";
import { useLanguage } from "@/lib/i18n";
import { useToast } from "@/lib/toast";
import { cn } from "@/lib/utils";

type PeriodMode = "weekly" | "monthly";
type Tone = "emerald" | "rose" | "blue" | "violet" | "amber";

function formatIso(date: Date) {
  return toLocalIso(date);
}

function startOfWeekMonday(input: Date) {
  const date = new Date(input);
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + diff);
  date.setHours(0, 0, 0, 0);
  return date;
}

function endOfWeekSunday(input: Date) {
  const start = startOfWeekMonday(input);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  return end;
}

function startOfMonth(input: Date) {
  const date = new Date(input);
  date.setDate(1);
  date.setHours(0, 0, 0, 0);
  return date;
}

function endOfMonth(input: Date) {
  const date = new Date(input);
  date.setMonth(date.getMonth() + 1, 0);
  date.setHours(0, 0, 0, 0);
  return date;
}

function buildPeriod(anchor: Date, mode: PeriodMode) {
  if (mode === "monthly") {
    const start = startOfMonth(anchor);
    const end = endOfMonth(anchor);
    return {
      start: formatIso(start),
      end: formatIso(end),
      label: start.toLocaleDateString("en-US", { month: "long", year: "numeric" }),
    };
  }
  const start = startOfWeekMonday(anchor);
  const end = endOfWeekSunday(anchor);
  return {
    start: formatIso(start),
    end: formatIso(end),
    label: `${start.toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit" })} - ${end.toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit" })}`,
  };
}

function sumMetric(rows: Array<{ [key: string]: string }>, key: string) {
  return rows.reduce((sum, row) => sum + Number(row[key] ?? 0), 0);
}

function formatMoneyShort(value: number) {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return value.toFixed(0);
}

function formatChangeText(value: number | null) {
  if (value === null || Number.isNaN(value)) return "";
  return `${Math.abs(value).toFixed(1)}%`;
}

function toneClasses(tone: Tone) {
  if (tone === "emerald") {
    return {
      card: "from-emerald-50 via-white to-white border-emerald-200/80",
      icon: "bg-emerald-100 text-emerald-700",
      value: "text-emerald-700",
      line: "bg-emerald-500",
    };
  }
  if (tone === "rose") {
    return {
      card: "from-rose-50 via-white to-white border-rose-200/80",
      icon: "bg-rose-100 text-rose-700",
      value: "text-rose-700",
      line: "bg-rose-500",
    };
  }
  if (tone === "violet") {
    return {
      card: "from-violet-50 via-white to-white border-violet-200/80",
      icon: "bg-violet-100 text-violet-700",
      value: "text-violet-700",
      line: "bg-violet-500",
    };
  }
  if (tone === "amber") {
    return {
      card: "from-amber-50 via-white to-white border-amber-200/80",
      icon: "bg-amber-100 text-amber-700",
      value: "text-amber-700",
      line: "bg-amber-500",
    };
  }
  return {
    card: "from-blue-50 via-white to-white border-blue-200/80",
    icon: "bg-blue-100 text-blue-700",
    value: "text-blue-700",
    line: "bg-blue-500",
  };
}

function laborState(percent: number | null) {
  if (percent === null) {
    return {
      label: "dashboard.labor_state_empty",
      helper: "dashboard.labor_state_empty_helper",
      tone: "bg-slate-100 text-slate-700",
      icon: AlertCircle,
    };
  }
  if (percent >= 40) {
    return {
      label: "dashboard.labor_state_critical",
      helper: "dashboard.labor_state_critical_helper",
      tone: "bg-rose-100 text-rose-700",
      icon: AlertCircle,
    };
  }
  if (percent >= 30) {
    return {
      label: "dashboard.labor_state_watch",
      helper: "dashboard.labor_state_watch_helper",
      tone: "bg-amber-100 text-amber-700",
      icon: AlertCircle,
    };
  }
  return {
    label: "dashboard.labor_state_healthy",
    helper: "dashboard.labor_state_healthy_helper",
    tone: "bg-emerald-100 text-emerald-700",
    icon: CheckCircle2,
  };
}

function DashboardStatCard({
  label,
  value,
  unit,
  change,
  tone,
  icon: Icon,
  delay,
  noChangeLabel,
  vsYesterdayLabel,
}: {
  label: string;
  value: string;
  unit?: string;
  change: number | null;
  tone: Tone;
  icon: typeof Coins;
  delay: number;
  noChangeLabel: string;
  vsYesterdayLabel: string;
}) {
  const palette = toneClasses(tone);
  const isUp = (change ?? 0) >= 0;
  return (
    <div
      className={cn(
        "animate-slide-in overflow-hidden rounded-[1.55rem] border bg-gradient-to-br px-5 py-5 shadow-[0_18px_44px_rgba(15,23,42,0.06)]",
        palette.card,
      )}
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-slate-500">{label}</p>
          <div className="mt-5 flex items-end gap-2">
            <p className={cn("text-[2rem] font-bold leading-none tracking-[-0.08em] sm:text-[2.4rem]", palette.value)}>{value}</p>
            {unit ? <p className="pb-1 text-sm font-semibold text-slate-500">{unit}</p> : null}
          </div>
        </div>
        <div className={cn("grid size-12 shrink-0 place-items-center rounded-[1rem] shadow-[inset_0_1px_0_rgba(255,255,255,0.7)]", palette.icon)}>
          <Icon className="size-5" />
        </div>
      </div>
      <div className="mt-6 flex items-center justify-between gap-3">
        <div className="flex items-center gap-1.5">
          {change === null ? null : isUp ? <ArrowUp className="size-3.5 text-emerald-600" /> : <ArrowDown className="size-3.5 text-rose-600" />}
          <p className={cn("text-xs font-semibold", change === null ? "text-slate-500" : isUp ? "text-emerald-600" : "text-rose-600")}>
            {change === null ? noChangeLabel : `${formatChangeText(change)} ${vsYesterdayLabel}`}
          </p>
        </div>
        <span className={cn("h-1.5 w-14 rounded-full", palette.line)} />
      </div>
    </div>
  );
}

function FocusTile({
  label,
  value,
  helper,
  tone,
  icon: Icon,
  t: _t,
}: {
  label: string;
  value: string;
  helper: string;
  tone: Tone;
  icon: typeof Gauge;
  t: (key: string, params?: Record<string, string | number | null | undefined>) => string;
}) {
  const palette = toneClasses(tone);
  return (
    <div className="rounded-[1.2rem] border border-slate-200 bg-white px-4 py-4 shadow-[0_10px_24px_rgba(15,23,42,0.04)]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">{label}</p>
          <p className={cn("mt-3 text-2xl font-bold tracking-[-0.06em]", palette.value)}>{value}</p>
        </div>
        <div className={cn("grid size-10 place-items-center rounded-[0.95rem]", palette.icon)}>
          <Icon className="size-4" />
        </div>
      </div>
      <p className="mt-3 text-xs leading-5 text-slate-500">{helper}</p>
    </div>
  );
}

export function DashboardPage() {
  const { token, me } = useAuth();
  const { t } = useLanguage();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [periodMode, setPeriodMode] = useState<PeriodMode>("weekly");
  const [anchorDate, setAnchorDate] = useState(() => new Date());
  const [payrollOpen, setPayrollOpen] = useState(false);
  const [reportsHistoryOpen, setReportsHistoryOpen] = useState(false);
  const [workersLeaderboardOpen, setWorkersLeaderboardOpen] = useState(false);
  const [report, setReport] = useState({
    location_id: "",
    report_date: formatIso(new Date()),
    revenue: "",
    photo_url: "",
  });
  const [reportPhotoName, setReportPhotoName] = useState("");

  const period = useMemo(() => buildPeriod(anchorDate, periodMode), [anchorDate, periodMode]);
  const todayDate = new Date();
  const today = formatIso(todayDate);
  const yesterdayDate = new Date(todayDate);
  yesterdayDate.setDate(yesterdayDate.getDate() - 1);
  const yesterday = formatIso(yesterdayDate);

  const locationsQuery = useQuery({
    queryKey: ["locations"],
    queryFn: () => api.listLocations(token!),
    enabled: Boolean(token),
  });
  const todayDashboardQuery = useQuery({
    queryKey: ["dashboard", "today", today],
    queryFn: () => api.ownerDashboard(token!, today, today),
    enabled: Boolean(token),
  });
  const yesterdayDashboardQuery = useQuery({
    queryKey: ["dashboard", "yesterday", yesterday],
    queryFn: () => api.ownerDashboard(token!, yesterday, yesterday),
    enabled: Boolean(token),
  });
  const dashboardQuery = useQuery({
    queryKey: ["dashboard", period.start, period.end],
    queryFn: () => api.ownerDashboard(token!, period.start, period.end),
    enabled: Boolean(token),
  });

  const addReportMutation = useMutation({
    mutationFn: () =>
      api.addRevenueReport(token!, {
        location_id: report.location_id,
        report_date: report.report_date,
        revenue: report.revenue,
        currency: "PLN",
        photo_url: report.photo_url || null,
      }),
    onSuccess: () => {
      setReport((current) => ({ ...current, revenue: "", photo_url: "" }));
      setReportPhotoName("");
      void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      void queryClient.invalidateQueries({ queryKey: ["notifications"] });
      toast.success(t("report.saved"));
    },
    onError: (error) => {
      toast.error(t("report.save_failed"), error instanceof Error ? error.message : undefined);
    },
  });

  const deleteReportMutation = useMutation({
    mutationFn: (reportId: string) => api.deleteRevenueReport(token!, reportId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      void queryClient.invalidateQueries({ queryKey: ["notifications"] });
      toast.success(t("dashboard.report_deleted"));
    },
    onError: (error) => {
      toast.error(t("dashboard.report_delete_failed"), error instanceof Error ? error.message : undefined);
    },
  });

  const todayRevenue = sumMetric(todayDashboardQuery.data?.totals_by_day ?? [], "revenue");
  const todayLabor = sumMetric(todayDashboardQuery.data?.labor_cost_by_day ?? [], "labor_cost_pln");
  const todayConfirmedHours = Number(todayDashboardQuery.data?.timesheets_summary?.approved_worked_hours ?? 0);
  const todayLaborPct = todayRevenue > 0 ? (todayLabor / todayRevenue) * 100 : null;
  const todayRevenuePerHour = todayConfirmedHours > 0 ? todayRevenue / todayConfirmedHours : null;

  const yesterdayRevenue = sumMetric(yesterdayDashboardQuery.data?.totals_by_day ?? [], "revenue");
  const yesterdayLabor = sumMetric(yesterdayDashboardQuery.data?.labor_cost_by_day ?? [], "labor_cost_pln");
  const yesterdayConfirmedHours = Number(yesterdayDashboardQuery.data?.timesheets_summary?.approved_worked_hours ?? 0);
  const yesterdayLaborPct = yesterdayRevenue > 0 ? (yesterdayLabor / yesterdayRevenue) * 100 : null;
  const yesterdayRevenuePerHour = yesterdayConfirmedHours > 0 ? yesterdayRevenue / yesterdayConfirmedHours : null;

  const revenueChange = yesterdayRevenue > 0 ? ((todayRevenue - yesterdayRevenue) / yesterdayRevenue) * 100 : null;
  const laborPctChange = yesterdayLaborPct !== null && todayLaborPct !== null ? todayLaborPct - yesterdayLaborPct : null;
  const revenuePerHourChange =
    yesterdayRevenuePerHour !== null && todayRevenuePerHour !== null ? ((todayRevenuePerHour - yesterdayRevenuePerHour) / yesterdayRevenuePerHour) * 100 : null;
  const hoursChange = yesterdayConfirmedHours > 0 ? ((todayConfirmedHours - yesterdayConfirmedHours) / yesterdayConfirmedHours) * 100 : null;

  const totalRevenue = sumMetric(dashboardQuery.data?.totals_by_day ?? [], "revenue");
  const totalLabor = sumMetric(dashboardQuery.data?.labor_cost_by_day ?? [], "labor_cost_pln");
  const confirmedWorkedHours = Number(dashboardQuery.data?.timesheets_summary?.approved_worked_hours ?? 0);
  const pendingTimesheets = Number(dashboardQuery.data?.timesheets_summary?.pending_count ?? 0);
  const laborCostPercent = totalRevenue > 0 ? (totalLabor / totalRevenue) * 100 : null;
  const revenuePerConfirmedHour = confirmedWorkedHours > 0 ? totalRevenue / confirmedWorkedHours : null;

  const chartData = useMemo(
    () =>
      (dashboardQuery.data?.revenue_vs_labor ?? []).map((row) => ({
        date: row.date.slice(5),
        revenue: Number(row.revenue),
        labor: Number(row.labor_cost_pln),
      })),
    [dashboardQuery.data],
  );

  const locationRevenue = useMemo(
    () =>
      (dashboardQuery.data?.totals_by_location ?? [])
        .map((row) => ({
          ...row,
          revenueNumber: Number(row.revenue),
        }))
        .sort((a, b) => b.revenueNumber - a.revenueNumber),
    [dashboardQuery.data],
  );

  const maxLocationRevenue = Math.max(...locationRevenue.map((item) => item.revenueNumber), 1);
  const payrollRows = dashboardQuery.data?.employee_payroll ?? [];
  const payrollMissingButHoursExist = confirmedWorkedHours > 0 && payrollRows.length === 0;
  const totalPayroll = payrollRows.reduce((sum, row) => sum + Number(row.payroll_pln), 0);
  const workersLeaderboard = useMemo(
    () =>
      payrollRows
        .map((row) => ({
          ...row,
          hoursNumber: Number(row.approved_hours),
        }))
        .sort((a, b) => b.hoursNumber - a.hoursNumber)
        .slice(0, 10),
    [payrollRows],
  );
  const allReports = useMemo(
    () =>
      (dashboardQuery.data?.reports ?? dashboardQuery.data?.photo_reports ?? []).sort(
        (a, b) =>
          new Date("created_at" in b && b.created_at ? b.created_at : `${b.report_date}T00:00:00`).getTime() -
          new Date("created_at" in a && a.created_at ? a.created_at : `${a.report_date}T00:00:00`).getTime(),
      ),
    [dashboardQuery.data],
  );

  const locationOptions = [
    { label: "Select location", value: "" },
    ...((locationsQuery.data ?? []).map((location) => ({ label: location.name, value: location.id }))),
  ];

  const shiftPeriod = (direction: -1 | 1) => {
    setAnchorDate((current) => {
      const next = new Date(current);
      if (periodMode === "monthly") next.setMonth(next.getMonth() + direction);
      else next.setDate(next.getDate() + 7 * direction);
      return next;
    });
  };

  const laborStateData = laborState(laborCostPercent);
  const StatusIcon = laborStateData.icon;
  const topLocation = locationRevenue[0];
  const allowReportDelete = canDeleteReports(me);

  return (
    <AppShell
      title={t("dashboard.title")}
      subtitle={t("dashboard.subtitle")}
      action={
        canViewPayroll(me) ? (
          <Button onClick={() => setPayrollOpen(true)} className="transition-all duration-200 hover:shadow-lg">
            <CreditCard className="size-4" /> {t("dashboard.payroll")}
          </Button>
        ) : undefined
      }
    >
      <div className="space-y-4 sm:space-y-5 lg:space-y-6">
        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <DashboardStatCard label={t("dashboard.revenue_today")} value={formatMoneyShort(todayRevenue)} unit="PLN" change={revenueChange} tone="emerald" icon={Coins} delay={0} noChangeLabel={t("dashboard.no_comparison")} vsYesterdayLabel={t("dashboard.vs_yesterday")} />
          <DashboardStatCard
            label={t("dashboard.labor_cost_today")}
            value={todayLaborPct === null ? "--" : todayLaborPct.toFixed(1)}
            unit={todayLaborPct === null ? undefined : "%"}
            change={laborPctChange}
            tone="rose"
            icon={TrendingUp}
            delay={90}
            noChangeLabel={t("dashboard.no_comparison")}
            vsYesterdayLabel={t("dashboard.vs_yesterday")}
          />
          <DashboardStatCard
            label={t("dashboard.revenue_per_staff_hour")}
            value={todayRevenuePerHour === null ? "--" : todayRevenuePerHour.toFixed(1)}
            unit={todayRevenuePerHour === null ? undefined : "PLN/h"}
            change={revenuePerHourChange}
            tone="blue"
            icon={Users2}
            delay={180}
            noChangeLabel={t("dashboard.no_comparison")}
            vsYesterdayLabel={t("dashboard.vs_yesterday")}
          />
          <DashboardStatCard label={t("dashboard.confirmed_hours")} value={todayConfirmedHours.toFixed(1)} unit="h" change={hoursChange} tone="violet" icon={Clock3} delay={270} noChangeLabel={t("dashboard.no_comparison")} vsYesterdayLabel={t("dashboard.vs_yesterday")} />
        </section>

        <section className="grid gap-4 xl:grid-cols-[minmax(0,1.55fr)_360px]">
          <Card className="animate-slide-in overflow-hidden border border-slate-200/80 bg-white shadow-[0_22px_50px_rgba(15,23,42,0.06)]" style={{ animationDelay: "160ms" }}>
            <div className="border-b border-slate-200/80 bg-[linear-gradient(135deg,#f8fbff_0%,#ffffff_48%,#f3fff6_100%)] px-4 py-4 sm:px-5 sm:py-5">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-blue-700">{t("dashboard.revenue_analytics")}</p>
                  <h2 className="mt-2 text-[1.6rem] font-bold tracking-[-0.06em] text-slate-950 sm:text-[1.95rem]">{t("dashboard.overview_for", { period: period.label })}</h2>
                  <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">{t("dashboard.analytics_body")}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                  <div className="inline-flex items-center gap-1 rounded-[0.9rem] border border-slate-200 bg-white px-1 py-1 shadow-[0_8px_18px_rgba(15,23,42,0.04)]">
                    <button
                      type="button"
                      onClick={() => setPeriodMode("weekly")}
                      className={cn(
                        "rounded-[0.7rem] px-3 py-1.5 text-sm font-semibold transition",
                        periodMode === "weekly" ? "bg-slate-950 text-white" : "text-slate-500 hover:text-slate-950",
                      )}
                    >
                      {t("dashboard.weekly")}
                    </button>
                    <button
                      type="button"
                      onClick={() => setPeriodMode("monthly")}
                      className={cn(
                        "rounded-[0.7rem] px-3 py-1.5 text-sm font-semibold transition",
                        periodMode === "monthly" ? "bg-slate-950 text-white" : "text-slate-500 hover:text-slate-950",
                      )}
                    >
                      {t("dashboard.monthly")}
                    </button>
                  </div>
                  <div className="inline-flex items-center gap-2 rounded-[0.9rem] border border-slate-200 bg-white px-2 py-1.5 shadow-[0_8px_18px_rgba(15,23,42,0.04)]">
                    <button type="button" onClick={() => shiftPeriod(-1)} className="grid size-8 place-items-center rounded-full text-slate-500 transition hover:bg-slate-100 hover:text-slate-950">
                      <ChevronLeft className="size-4" />
                    </button>
                    <div className="min-w-[110px] text-center text-sm font-semibold text-slate-900 sm:min-w-[150px]">{period.label}</div>
                    <button type="button" onClick={() => shiftPeriod(1)} className="grid size-8 place-items-center rounded-full text-slate-500 transition hover:bg-slate-100 hover:text-slate-950">
                      <ChevronRight className="size-4" />
                    </button>
                  </div>
                </div>
              </div>

              <div className="mt-5 grid gap-3 sm:grid-cols-3">
                <div className="rounded-[1rem] border border-blue-100 bg-white/90 px-4 py-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">{t("dashboard.total_revenue")}</p>
                  <p className="mt-2 text-2xl font-bold tracking-[-0.06em] text-emerald-700">{formatMoneyShort(totalRevenue)}</p>
                  <p className="mt-1 text-xs font-semibold text-emerald-600">{t("dashboard.pln_in_range")}</p>
                </div>
                <div className="rounded-[1rem] border border-rose-100 bg-white/90 px-4 py-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">{t("dashboard.labor_cost")}</p>
                  <p className="mt-2 text-2xl font-bold tracking-[-0.06em] text-rose-700">{formatMoneyShort(totalLabor)}</p>
                  <p className="mt-1 text-xs font-semibold text-rose-600">{t("dashboard.pln_booked_assignments")}</p>
                </div>
                <div className="rounded-[1rem] border border-emerald-100 bg-white/90 px-4 py-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">{t("dashboard.revenue_per_staff_hour")}</p>
                  <p className="mt-2 text-2xl font-bold tracking-[-0.06em] text-blue-700">{revenuePerConfirmedHour === null ? "--" : revenuePerConfirmedHour.toFixed(1)}</p>
                  <p className="mt-1 text-xs font-semibold text-blue-600">{revenuePerConfirmedHour === null ? t("dashboard.no_confirmed_hours_yet") : t("dashboard.pln_per_confirmed_hour")}</p>
                </div>
              </div>
            </div>
            <CardContent className="p-4 sm:p-5">
              <div className="flex h-[280px] flex-col rounded-[1.25rem] border border-slate-200 bg-[linear-gradient(180deg,#ffffff_0%,#f8fbff_100%)] p-3 sm:h-[360px] sm:p-4">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-lg font-bold tracking-[-0.04em] text-slate-950">{t("dashboard.revenue_trend")}</p>
                    <p className="text-sm text-slate-500">{t("dashboard.revenue_trend_description")}</p>
                  </div>
                  <div className="flex items-center gap-4 text-sm">
                    <span className="inline-flex items-center gap-2 text-slate-600"><span className="size-2.5 rounded-full bg-[#2563eb]" /> {t("dashboard.revenue")}</span>
                    <span className="inline-flex items-center gap-2 text-slate-600"><span className="size-2.5 rounded-full bg-[#ef4444]" /> {t("dashboard.labor_cost")}</span>
                  </div>
                </div>
                <div className="min-h-0 flex-1">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData}>
                    <defs>
                      <linearGradient id="dashboardRevenueFill" x1="0" x2="0" y1="0" y2="1">
                        <stop offset="0%" stopColor="#2563eb" stopOpacity={0.22} />
                        <stop offset="100%" stopColor="#2563eb" stopOpacity={0.02} />
                      </linearGradient>
                      <linearGradient id="dashboardLaborFill" x1="0" x2="0" y1="0" y2="1">
                        <stop offset="0%" stopColor="#ef4444" stopOpacity={0.18} />
                        <stop offset="100%" stopColor="#ef4444" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke="#e2e8f0" vertical={false} strokeDasharray="4 4" />
                    <XAxis dataKey="date" tick={{ fill: "#64748b", fontSize: 11 }} tickLine={false} axisLine={false} />
                    <YAxis tick={{ fill: "#64748b", fontSize: 11 }} tickLine={false} axisLine={false} />
                    <Tooltip
                      cursor={{ fill: "rgba(37,99,235,0.05)" }}
                      contentStyle={{
                        background: "rgba(255,255,255,0.98)",
                        border: "1px solid rgba(226,232,240,1)",
                        borderRadius: 14,
                        boxShadow: "0 18px 38px rgba(15,23,42,0.12)",
                        padding: "10px 12px",
                      }}
                      labelStyle={{ color: "#0f172a", fontWeight: 700, marginBottom: 6, fontSize: 12 }}
                      itemStyle={{ color: "#334155", fontWeight: 600, paddingTop: 2, paddingBottom: 2, fontSize: 12 }}
                    />
                    <Area type="monotone" dataKey="revenue" fill="url(#dashboardRevenueFill)" stroke="#2563eb" strokeWidth={2.5} isAnimationActive />
                    <Area type="monotone" dataKey="labor" fill="url(#dashboardLaborFill)" stroke="#ef4444" strokeWidth={2.1} isAnimationActive />
                  </AreaChart>
                </ResponsiveContainer>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="space-y-4">
            <Card className="animate-slide-in border border-slate-200/80 bg-white shadow-[0_22px_50px_rgba(15,23,42,0.06)]" style={{ animationDelay: "240ms" }}>
              <CardHeader className="pb-3">
                <CardTitle className="text-xl tracking-[-0.04em]">{t("dashboard.operations_focus")}</CardTitle>
                <CardDescription>{t("dashboard.operations_focus_description")}</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                <FocusTile label={t("dashboard.labor_cost")} value={laborCostPercent === null ? "--" : `${laborCostPercent.toFixed(1)}%`} helper={t(laborStateData.helper)} tone="rose" icon={Gauge} t={t} />
                <FocusTile label={t("dashboard.pending_timesheets")} value={String(pendingTimesheets)} helper={t("dashboard.pending_timesheets_helper")} tone="amber" icon={ReceiptText} t={t} />
                <FocusTile label={t("dashboard.payroll_in_range")} value={`${formatMoneyShort(totalPayroll)}`} helper={t("dashboard.payroll_in_range_helper")} tone="emerald" icon={CreditCard} t={t} />
                <FocusTile label={t("dashboard.active_locations")} value={String(locationRevenue.length)} helper={topLocation ? t("dashboard.top_revenue_location", { name: topLocation.location_name }) : t("dashboard.no_location_totals")} tone="blue" icon={MapPinned} t={t} />
              </CardContent>
            </Card>

            <Card className="animate-slide-in border border-slate-200/80 bg-white shadow-[0_22px_50px_rgba(15,23,42,0.06)]" style={{ animationDelay: "320ms" }}>
              <CardHeader className="pb-3">
                <CardTitle className="text-xl tracking-[-0.04em]">{t("dashboard.revenue_by_location")}</CardTitle>
                <CardDescription>{t("dashboard.revenue_by_location_description")}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {locationRevenue.map((row, index) => {
                  const tones = ["from-blue-500 to-blue-400", "from-emerald-500 to-emerald-400", "from-amber-500 to-amber-400", "from-violet-500 to-violet-400"];
                  return (
                    <div key={row.location_id} className="space-y-2">
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-slate-900">{row.location_name}</p>
                          <p className="text-xs text-slate-500">{t("dashboard.percent_of_total_revenue", { percent: ((row.revenueNumber / Math.max(totalRevenue, 1)) * 100).toFixed(1) })}</p>
                        </div>
                        <p className="shrink-0 text-sm font-bold text-slate-900">{row.revenueNumber.toFixed(0)} PLN</p>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                        <div className={cn("h-full rounded-full bg-gradient-to-r", tones[index % tones.length])} style={{ width: `${Math.max(8, (row.revenueNumber / maxLocationRevenue) * 100)}%` }} />
                      </div>
                    </div>
                  );
                })}
                {!locationRevenue.length ? <p className="text-sm text-slate-500">{t("dashboard.no_location_revenue")}</p> : null}
              </CardContent>
            </Card>
          </div>
        </section>

        <section className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_380px]">
          <Card className="animate-slide-in border border-slate-200/80 bg-white shadow-[0_22px_50px_rgba(15,23,42,0.06)]" style={{ animationDelay: "400ms" }}>
            <CardHeader className="flex flex-row items-center justify-between gap-3 pb-3">
              <div>
                <CardTitle className="text-xl tracking-[-0.04em]">{t("dashboard.recent_reports")}</CardTitle>
                <CardDescription>{t("dashboard.recent_reports_description")}</CardDescription>
              </div>
              <Button size="sm" variant="secondary" onClick={() => setReportsHistoryOpen(true)} className="h-9 rounded-[0.85rem] px-3">
                {t("dashboard.view_all")}
              </Button>
            </CardHeader>
            <CardContent className="space-y-3">
              {allReports.slice(0, 5).map((item, index) => (
                <div key={item.id} className="animate-slide-in flex items-center justify-between gap-3 rounded-[1rem] border border-slate-200/80 bg-[linear-gradient(145deg,#ffffff,#f8fbff)] px-4 py-3 shadow-[0_8px_20px_rgba(15,23,42,0.04)]" style={{ animationDelay: `${480 + index * 70}ms` }}>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-slate-900">{item.location_name}</p>
                    <p className="mt-1 text-xs text-slate-500">{item.report_date}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <p className="text-sm font-bold text-emerald-700">{item.revenue} PLN</p>
                    {item.photo_url ? <Camera className="size-4 text-slate-400" /> : null}
                    {allowReportDelete ? (
                      <button
                        type="button"
                        className="grid size-8 place-items-center rounded-full text-slate-400 transition hover:bg-rose-50 hover:text-rose-600"
                        onClick={() => {
                          if (!window.confirm(t("dashboard.confirm_delete_report", { date: item.report_date }))) return;
                          deleteReportMutation.mutate(item.id);
                        }}
                      >
                        <Trash2 className="size-4" />
                      </button>
                    ) : null}
                  </div>
                </div>
              ))}
              {!allReports.length ? <p className="py-6 text-sm text-slate-500">No reports yet.</p> : null}
            </CardContent>
          </Card>

          <div className="space-y-4">
            <Card className="animate-slide-in overflow-hidden border border-slate-200/80 bg-white shadow-[0_22px_50px_rgba(15,23,42,0.06)]" style={{ animationDelay: "480ms" }}>
              <div className="border-b border-slate-200/80 bg-[linear-gradient(135deg,#eff6ff_0%,#ffffff_56%,#ecfdf5_100%)] px-4 py-4">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-blue-700">{t("dashboard.daily_report")}</p>
                <h3 className="mt-2 text-xl font-bold tracking-[-0.04em] text-slate-950">{t("dashboard.daily_report_heading")}</h3>
              </div>
              <CardContent className="space-y-3 p-4">
                <Select options={locationOptions} value={report.location_id} onChange={(event) => setReport((current) => ({ ...current, location_id: event.target.value }))} />
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                  <Input type="date" value={report.report_date} onChange={(event) => setReport((current) => ({ ...current, report_date: event.target.value }))} className="h-11" />
                  <Input type="number" min={0} placeholder={t("report.revenue_placeholder")} value={report.revenue} onChange={(event) => setReport((current) => ({ ...current, revenue: event.target.value }))} className="h-11" />
                </div>
                <label className="inline-flex min-h-11 w-full cursor-pointer items-center gap-2 rounded-[0.95rem] border border-slate-200 bg-slate-50 px-3 text-sm text-slate-700 transition hover:border-blue-300 hover:bg-blue-50/50">
                  <FileUp className="size-4 text-blue-600" />
                  <span className="truncate">{reportPhotoName ? t("report.selected_file", { name: reportPhotoName }) : t("dashboard.attach_photo_evidence")}</span>
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={async (event) => {
                      const file = event.target.files?.[0];
                      if (!file) return;
                      const dataUrl = await fileToDataUrl(file);
                      setReport((current) => ({ ...current, photo_url: dataUrl }));
                      setReportPhotoName(file.name);
                    }}
                  />
                </label>
                <Button onClick={() => addReportMutation.mutate()} disabled={!report.location_id || !report.revenue || addReportMutation.isPending} className="w-full">
                  {t("report.save")}
                </Button>
              </CardContent>
            </Card>

            <Card className="animate-slide-in border border-slate-200/80 bg-white shadow-[0_22px_50px_rgba(15,23,42,0.06)]" style={{ animationDelay: "560ms" }}>
              <CardHeader className="flex flex-row items-center justify-between gap-3 pb-3">
                <div>
                  <CardTitle className="text-xl tracking-[-0.04em]">{t("dashboard.top_performers")}</CardTitle>
                  <CardDescription>{t("dashboard.top_performers_description")}</CardDescription>
                </div>
                <Button size="sm" variant="secondary" onClick={() => setWorkersLeaderboardOpen(true)} className="h-9 rounded-[0.85rem] px-3">
                  {t("dashboard.view_all")}
                </Button>
              </CardHeader>
              <CardContent className="space-y-3">
                {workersLeaderboard.slice(0, 5).map((row, idx) => (
                  <div key={row.user_id} className="flex items-center justify-between gap-3 rounded-[1rem] border border-slate-200/80 bg-[linear-gradient(145deg,#ffffff,#f8fbff)] px-4 py-3 shadow-[0_8px_20px_rgba(15,23,42,0.04)]">
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="grid size-10 place-items-center rounded-full bg-[linear-gradient(145deg,#0f172a,#1e293b)] text-sm font-bold text-white">{idx + 1}</div>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-slate-900">{row.full_name}</p>
                        <p className="text-xs text-slate-500">{row.staff_position ?? "Unassigned"}</p>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-bold text-emerald-700">{row.hoursNumber.toFixed(1)}h</p>
                      <p className="text-xs text-slate-500">{Number(row.payroll_pln).toFixed(0)} PLN</p>
                    </div>
                  </div>
                ))}
                {!workersLeaderboard.length ? <p className="py-6 text-sm text-slate-500">{t("dashboard.no_workers_data")}</p> : null}
                {payrollMissingButHoursExist ? (
                  <div className="flex items-start gap-2 rounded-[1rem] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                    <AlertCircle className="mt-0.5 size-4 shrink-0" />
                    {t("dashboard.payroll_temporarily_unavailable")}
                  </div>
                ) : null}
              </CardContent>
            </Card>
          </div>
        </section>

        {canViewPayroll(me) && payrollOpen ? (
          <OverlayPortal>
          <div className="fixed inset-0 z-[1100] bg-slate-900/24 backdrop-blur-sm" role="dialog" aria-modal="true">
            <div className="h-full w-full p-0 sm:p-4 md:p-6">
              <div className="surface-elevated flex h-full w-full flex-col rounded-none sm:rounded-[1.6rem] shadow-[0_20px_60px_rgba(15,23,42,0.15)]">
                <div className="flex items-center justify-between border-b border-slate-200 px-4 py-4 sm:px-5">
                  <div>
                    <h2 className="text-xl font-semibold text-slate-900">{t("dashboard.employee_payroll")}</h2>
                    <p className="text-sm text-slate-600">{t("dashboard.confirmed_timesheets_period", { period: period.label })}</p>
                  </div>
                  <Button size="sm" variant="secondary" onClick={() => setPayrollOpen(false)} className="transition-all duration-200">
                    <X className="size-4" /> {t("common.close")}
                  </Button>
                </div>
                <div className="min-h-0 flex-1 overflow-auto p-4 sm:p-5">
                  <div className="hidden min-w-[860px] md:block">
                    <div className="grid grid-cols-[1.8fr_1fr_0.9fr_0.9fr_1fr] gap-2 border-b border-slate-200 px-2 pb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-600">
                      <p>{t("dashboard.employee")}</p>
                      <p>{t("dashboard.position")}</p>
                      <p className="text-right">{t("dashboard.approved_hours")}</p>
                      <p className="text-right">{t("dashboard.rate")}</p>
                      <p className="text-right">{t("dashboard.payroll")}</p>
                    </div>
                    {payrollRows.map((row) => (
                      <div key={row.user_id} className="grid grid-cols-[1.8fr_1fr_0.9fr_0.9fr_1fr] items-center gap-2 border-b border-slate-200 px-2 py-2.5 text-sm transition-all duration-200 hover:bg-slate-50">
                        <div className="min-w-0">
                          <p className="truncate font-semibold text-slate-900">{row.full_name}</p>
                          <p className="truncate text-xs text-slate-600">{row.role}</p>
                        </div>
                        <div>
                          <Badge className="border-slate-200 bg-slate-50 text-slate-700">{row.staff_position ?? t("dashboard.unassigned")}</Badge>
                        </div>
                        <p className="text-right font-semibold text-slate-900">{Number(row.approved_hours).toFixed(1)}h</p>
                        <p className="text-right text-slate-600">{Number(row.hourly_rate_default_pln).toFixed(2)} PLN/h</p>
                        <p className="text-right font-semibold text-emerald-700">{Number(row.payroll_pln).toFixed(2)} PLN</p>
                      </div>
                    ))}
                    {payrollMissingButHoursExist ? <p className="px-2 py-6 text-sm text-amber-700">{t("dashboard.payroll_temporarily_unavailable")}</p> : null}
                    {!payrollRows.length && !payrollMissingButHoursExist ? <p className="px-2 py-6 text-sm text-slate-600">{t("dashboard.no_confirmed_timesheets")}</p> : null}
                  </div>
                  <div className="space-y-3 md:hidden">
                    {payrollRows.map((row) => (
                      <div key={row.user_id} className="rounded-[1rem] border border-slate-200 bg-white px-4 py-4 transition-all duration-200 hover:shadow-md">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate font-semibold text-slate-900">{row.full_name}</p>
                            <p className="mt-1 text-xs text-slate-600">{row.role}</p>
                          </div>
                          <Badge className="border-slate-200 bg-slate-50 text-slate-700">{row.staff_position ?? t("dashboard.unassigned")}</Badge>
                        </div>
                        <div className="mt-4 grid grid-cols-3 gap-3 text-sm">
                          <div>
                            <p className="text-[11px] uppercase tracking-[0.12em] text-slate-600">{t("dashboard.hours")}</p>
                            <p className="mt-1 font-semibold text-slate-900">{Number(row.approved_hours).toFixed(1)}h</p>
                          </div>
                          <div>
                            <p className="text-[11px] uppercase tracking-[0.12em] text-slate-600">{t("dashboard.rate")}</p>
                            <p className="mt-1 text-slate-600">{Number(row.hourly_rate_default_pln).toFixed(2)} PLN/h</p>
                          </div>
                          <div>
                            <p className="text-[11px] uppercase tracking-[0.12em] text-slate-600">{t("dashboard.payroll")}</p>
                            <p className="mt-1 font-semibold text-emerald-700">{Number(row.payroll_pln).toFixed(2)} PLN</p>
                          </div>
                        </div>
                      </div>
                    ))}
                    {payrollMissingButHoursExist ? <p className="py-6 text-sm text-amber-700">{t("dashboard.payroll_temporarily_unavailable")}</p> : null}
                    {!payrollRows.length && !payrollMissingButHoursExist ? <p className="py-6 text-sm text-slate-600">{t("dashboard.no_confirmed_timesheets")}</p> : null}
                  </div>
                </div>
              </div>
            </div>
          </div>
          </OverlayPortal>
        ) : null}

        {workersLeaderboardOpen ? (
          <OverlayPortal>
          <div className="fixed inset-0 z-[1100] bg-slate-900/24 backdrop-blur-sm" role="dialog" aria-modal="true">
            <div className="h-full w-full p-0 sm:p-4 md:p-6">
              <div className="surface-elevated flex h-full w-full flex-col rounded-none sm:rounded-[1.6rem] shadow-[0_20px_60px_rgba(15,23,42,0.15)]">
                <div className="flex items-center justify-between border-b border-slate-200 px-4 py-4 sm:px-5">
                  <div>
                    <h2 className="text-xl font-semibold text-slate-900">{t("dashboard.top_performers")}</h2>
                    <p className="text-sm text-slate-600">{t("dashboard.by_confirmed_hours", { period: period.label })}</p>
                  </div>
                  <Button size="sm" variant="secondary" onClick={() => setWorkersLeaderboardOpen(false)} className="transition-all duration-200">
                    <X className="size-4" /> {t("common.close")}
                  </Button>
                </div>
                <div className="min-h-0 flex-1 overflow-auto p-4 sm:p-5">
                  <div className="space-y-2">
                    {workersLeaderboard.map((row, idx) => (
                      <div key={row.user_id} className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white p-3 transition-all duration-200 hover:shadow-md">
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          <span className="text-lg font-bold text-slate-400 w-8 text-center">#{idx + 1}</span>
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-slate-900 truncate">{row.full_name}</p>
                            <p className="text-xs text-slate-600">{row.staff_position ?? t("dashboard.unassigned")}</p>
                          </div>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className="text-lg font-bold text-emerald-700">{row.hoursNumber.toFixed(1)}</p>
                          <p className="text-xs text-slate-600">{t("dashboard.hours")}</p>
                        </div>
                      </div>
                    ))}
                    {!workersLeaderboard.length ? <p className="py-6 text-center text-sm text-slate-600">{t("dashboard.no_workers_data")}</p> : null}
                  </div>
                </div>
              </div>
            </div>
          </div>
          </OverlayPortal>
        ) : null}

        {reportsHistoryOpen ? (
          <OverlayPortal>
          <div className="fixed inset-0 z-[1100] bg-slate-900/24 backdrop-blur-sm" role="dialog" aria-modal="true">
            <div className="h-full w-full p-0 sm:p-4 md:p-6">
              <div className="surface-elevated flex h-full w-full flex-col rounded-none sm:rounded-[1.6rem] shadow-[0_20px_60px_rgba(15,23,42,0.15)]">
                <div className="flex items-center justify-between border-b border-slate-200 px-4 py-4 sm:px-5">
                  <div>
                    <h2 className="text-xl font-semibold text-slate-900">{t("dashboard.reports_history")}</h2>
                    <p className="text-sm text-slate-600">{t("dashboard.all_revenue_reports", { period: period.label })}</p>
                  </div>
                  <Button size="sm" variant="secondary" onClick={() => setReportsHistoryOpen(false)} className="transition-all duration-200">
                    <X className="size-4" /> {t("common.close")}
                  </Button>
                </div>
                <div className="min-h-0 flex-1 overflow-auto p-4 sm:p-5">
                  <div className="space-y-2">
                    {allReports.map((item) => (
                      <div key={item.id} className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white p-3 transition-all duration-200 hover:shadow-md">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-slate-900">{item.location_name}</p>
                          <p className="text-xs text-slate-600">{item.report_date}</p>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <p className="text-sm font-bold text-emerald-700">{item.revenue} PLN</p>
                          {item.photo_url ? (
                            <a href={item.photo_url} target="_blank" rel="noreferrer" className="text-slate-400 transition-colors hover:text-slate-600">
                              <Eye className="size-4" />
                            </a>
                          ) : null}
                          {allowReportDelete ? (
                            <button
                              type="button"
                              className="grid size-8 place-items-center rounded-full text-slate-400 transition hover:bg-rose-50 hover:text-rose-600"
                              onClick={() => {
                                if (!window.confirm(t("dashboard.confirm_delete_report", { date: item.report_date }))) return;
                                deleteReportMutation.mutate(item.id);
                              }}
                            >
                              <Trash2 className="size-4" />
                            </button>
                          ) : null}
                        </div>
                      </div>
                    ))}
                    {!allReports.length ? <p className="py-6 text-center text-sm text-slate-600">{t("dashboard.no_reports_yet")}</p> : null}
                  </div>
                </div>
              </div>
            </div>
          </div>
          </OverlayPortal>
        ) : null}
      </div>
    </AppShell>
  );
}
