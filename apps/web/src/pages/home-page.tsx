import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowUpRight, CalendarClock, Camera, Coins, MapPin, PlayCircle, TrendingUp } from "lucide-react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";

import { AppShell } from "@/components/layout/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { formatDate, formatTime, getMonday, toLocalIso } from "@/lib/date";
import { fileToDataUrl } from "@/lib/file";
import { useLanguage } from "@/lib/i18n";
import { useToast } from "@/lib/toast";
import { cn } from "@/lib/utils";

function durationHours(start: string, end: string) {
  const [startHour, startMinute] = start.split(":").map(Number);
  const [endHour, endMinute] = end.split(":").map(Number);
  const totalMinutes = (endHour * 60 + endMinute) - (startHour * 60 + startMinute);
  return totalMinutes > 0 ? totalMinutes / 60 : 0;
}

function formatCurrency(value: number) {
  return `${value.toFixed(0)} PLN`;
}

function laborState(percent: number | null) {
  if (percent === null) {
    return {
      label: "No revenue yet",
      cardClass: "bg-[linear-gradient(145deg,rgba(248,250,252,0.85),#ffffff)]",
      iconClass: "bg-slate-100 text-slate-600",
      helperClass: "text-slate-600",
    };
  }
  if (percent >= 40) {
    return {
      label: "Critical",
      cardClass: "bg-[linear-gradient(145deg,rgba(255,241,242,0.85),#ffffff)]",
      iconClass: "bg-rose-100 text-rose-700",
      helperClass: "text-rose-700",
    };
  }
  if (percent >= 30) {
    return {
      label: "Watch",
      cardClass: "bg-[linear-gradient(145deg,rgba(255,251,235,0.85),#ffffff)]",
      iconClass: "bg-amber-100 text-amber-700",
      helperClass: "text-amber-700",
    };
  }
  return {
    label: "Healthy",
    cardClass: "bg-[linear-gradient(145deg,rgba(236,253,245,0.85),#ffffff)]",
    iconClass: "bg-emerald-100 text-emerald-700",
    helperClass: "text-emerald-700",
  };
}

function DailySignalCard({
  label,
  value,
  detail,
  icon: Icon,
  cardClass,
  iconClass,
  helperClass,
  badge,
}: {
  label: string;
  value: string;
  detail: string;
  icon: typeof Coins;
  cardClass: string;
  iconClass: string;
  helperClass: string;
  badge?: string;
}) {
  return (
    <motion.div
      whileHover={{ y: -5, scale: 1.005 }}
      transition={{ type: "spring", stiffness: 350, damping: 22 }}
      className={cn("flex min-h-[200px] flex-col justify-between border border-[var(--color-border)] p-6 shadow-[0_16px_40px_-6px_rgba(15,23,42,0.05)] rounded-[1.6rem] bg-white", cardClass)}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--color-text-muted)]">{label}</p>
          {badge ? (
            <Badge className={cn("mt-2.5 border-transparent tracking-[0.04em] text-xs font-semibold px-2.5 py-0.5 rounded-full shadow-sm", iconClass)}>
              {badge}
            </Badge>
          ) : null}
        </div>
        <span className={cn("grid size-11 shrink-0 place-items-center rounded-[1rem] shadow-sm", iconClass)}>
          <Icon className="size-5" />
        </span>
      </div>
      <div className="mt-4">
        <p className="text-[2.65rem] font-bold leading-none tracking-[-0.06em] text-[var(--color-heading)] font-sans">{value}</p>
      </div>
      <div className="mt-auto border-t border-[var(--color-divider)] pt-3.5">
        <p className={cn("text-xs font-medium leading-5", helperClass)}>{detail}</p>
      </div>
    </motion.div>
  );
}

export function HomePage() {
  const { token, me } = useAuth();
  const { t } = useLanguage();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [report, setReport] = useState({
    location_id: "",
    report_date: toLocalIso(new Date()),
    revenue: "",
    photo_url: "",
  });
  const [reportPhotoName, setReportPhotoName] = useState("");

  const weekStart = getMonday();
  const today = new Date();
  const todayIso = toLocalIso(today);

  const shiftsQuery = useQuery({
    queryKey: ["shifts", weekStart],
    queryFn: () => api.listShifts(token!, weekStart),
    enabled: Boolean(token),
  });
  const locationsQuery = useQuery({
    queryKey: ["locations"],
    queryFn: () => api.listLocations(token!),
    enabled: Boolean(token),
  });
  const ownerDashboardQuery = useQuery({
    queryKey: ["owner-dashboard-inline", todayIso],
    queryFn: () => api.ownerDashboard(token!, todayIso, todayIso),
    enabled: Boolean(token) && me?.role !== "STAFF",
  });

  const reportMutation = useMutation({
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
      void queryClient.invalidateQueries({ queryKey: ["owner-dashboard-inline", todayIso] });
      void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      void queryClient.invalidateQueries({ queryKey: ["notifications"] });
      toast.success("Report saved");
    },
    onError: (error) => {
      toast.error("Failed to save report", error instanceof Error ? error.message : undefined);
    },
  });

  const startShiftMutation = useMutation({
    mutationFn: (shiftId: string) => api.startShift(token!, shiftId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["shifts", weekStart] });
      toast.success("Shift started");
    },
    onError: (error) => {
      toast.error("Failed to start shift", error instanceof Error ? error.message : undefined);
    },
  });

  const allShifts = shiftsQuery.data ?? [];

  const myAssignment = useMemo(() => {
    if (!me) return null;
    for (const shift of allShifts) {
      if (shift.date !== todayIso) continue;
      const assignment = shift.assignments.find((item) => item.user_id === me.id);
      if (assignment) return { shift, assignment };
    }
    return null;
  }, [allShifts, me, todayIso]);

  if (me?.role === "STAFF") {
    return (
      <AppShell
        title="Overview"
        subtitle="Personal workspace only."
        action={<Badge className="bg-[var(--color-primary)] text-white border-transparent px-3 py-1 text-sm rounded-full">{today.toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}</Badge>}
      >
        <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
          <Card className="max-w-md mx-auto surface-card overflow-hidden">
            <CardHeader className="pb-3 border-b border-[var(--color-divider)]">
              <div>
                <CardTitle className="text-2xl font-bold tracking-tight">{t("home.today_shift") || "My shift today"}</CardTitle>
                <CardDescription className="text-sm text-[var(--color-text-muted)]">Compact personal shift card.</CardDescription>
              </div>
            </CardHeader>
            <CardContent className="pt-5 space-y-4">
              {myAssignment ? (
                <div className="space-y-4">
                  <div className="surface-muted rounded-[1.2rem] p-5 border border-[var(--color-border)]">
                    <div className="flex items-center gap-2 text-xs font-semibold tracking-wider text-[var(--color-text-muted)] uppercase">
                      <CalendarClock className="size-4 text-[var(--color-primary)]" />
                      <span>{formatDate(myAssignment.shift.date)}</span>
                    </div>
                    <p className="mt-3 text-3xl font-extrabold tracking-tight text-[var(--color-heading)] font-sans">
                      {formatTime(myAssignment.shift.start_time)} - {formatTime(myAssignment.shift.end_time)}
                    </p>
                  </div>
                  <Button
                    onClick={() => startShiftMutation.mutate(myAssignment.shift.id)}
                    disabled={myAssignment.assignment.status === "in_shift" || startShiftMutation.isPending}
                    className="w-full h-12 rounded-[1rem] font-semibold text-sm shadow-md transition-all duration-200"
                  >
                    <PlayCircle className="size-5 mr-1" />
                    {myAssignment.assignment.status === "in_shift" ? "Shift already started" : "Start shift"}
                  </Button>
                </div>
              ) : (
                <div className="rounded-[1.2rem] border-2 border-dashed border-[var(--color-border)] p-6 text-center text-sm font-medium text-[var(--color-text-muted)] bg-[var(--color-bg)]">
                  No shift assigned for today.
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </AppShell>
    );
  }

  const todayFinance = ownerDashboardQuery.data?.revenue_vs_labor?.[0];
  const todayRevenue = Number(todayFinance?.revenue ?? 0);
  const todayLabor = Number(todayFinance?.labor_cost_pln ?? 0);
  const todayAssignedHours = allShifts
    .filter((shift) => shift.date === todayIso)
    .reduce((sum, shift) => sum + durationHours(shift.start_time, shift.end_time) * shift.assignments.length, 0);
  const todayLaborPct = todayRevenue > 0 ? (todayLabor / todayRevenue) * 100 : null;
  const revenuePerStaffHour = todayAssignedHours > 0 ? todayRevenue / todayAssignedHours : null;
  const laborTone = laborState(todayLaborPct);

  return (
    <AppShell
      title="Overview"
      subtitle="Daily revenue and labor control for the current operating day."
      action={<Badge className="bg-[var(--color-primary)] text-white border-transparent px-3.5 py-1 text-sm rounded-full font-semibold shadow-sm">{today.toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}</Badge>}
    >
      <div className="space-y-6">
        <motion.section 
          initial="hidden"
          animate="visible"
          variants={{
            hidden: {},
            visible: { transition: { staggerChildren: 0.08 } }
          }}
          className="grid gap-4 xl:grid-cols-3"
        >
          <DailySignalCard
            label="Revenue today"
            value={formatCurrency(todayRevenue)}
            detail={todayRevenue > 0 ? `${todayLabor.toFixed(0)} PLN labor already booked today` : "Save the first revenue report to start today's finance tracking"}
            icon={Coins}
            cardClass="bg-[linear-gradient(145deg,#eff6ff,#ffffff)] border-blue-100"
            iconClass="bg-blue-100 text-blue-700"
            helperClass="text-blue-700"
          />
          <DailySignalCard
            label="Labor Cost %"
            value={todayLaborPct === null ? "--" : `${todayLaborPct.toFixed(1)}%`}
            detail={
              todayLaborPct === null
                ? "No revenue report yet, so labor share cannot be calculated"
                : `${todayLabor.toFixed(0)} PLN labor against ${todayRevenue.toFixed(0)} PLN revenue`
            }
            icon={TrendingUp}
            cardClass={laborTone.cardClass}
            iconClass={laborTone.iconClass}
            helperClass={laborTone.helperClass}
            badge={laborTone.label}
          />
          <DailySignalCard
            label="Average revenue per staff hour"
            value={revenuePerStaffHour === null ? "--" : `${revenuePerStaffHour.toFixed(1)} PLN/h`}
            detail={
              revenuePerStaffHour === null
                ? "No scheduled assigned hours today"
                : `${todayAssignedHours.toFixed(1)} scheduled staff hours used for today's average`
            }
            icon={CalendarClock}
            cardClass="bg-[linear-gradient(145deg,#ecfdf5,#ffffff)] border-emerald-100"
            iconClass="bg-emerald-100 text-emerald-700"
            helperClass="text-emerald-700"
          />
        </motion.section>

        <motion.div 
          initial={{ opacity: 0, y: 15 }} 
          animate={{ opacity: 1, y: 0 }} 
          transition={{ duration: 0.5, delay: 0.15 }}
          className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]"
        >
          <Card className="surface-card bg-[linear-gradient(145deg,#ffffff,#f5f9ff)] overflow-hidden border border-blue-100">
            <CardHeader className="pb-3 border-b border-blue-50/80">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <CardTitle className="text-xl font-bold tracking-tight text-[var(--color-heading)]">Quick revenue entry</CardTitle>
                  <CardDescription className="text-sm text-[var(--color-text-muted)]">Add the day result before moving to detailed reporting.</CardDescription>
                </div>
                <span className="grid size-11 place-items-center rounded-2xl bg-blue-600 text-white shadow-lg shadow-blue-500/20">
                  <Coins className="size-5" />
                </span>
              </div>
            </CardHeader>
            <CardContent className="pt-5 space-y-4">
              <div className="space-y-3.5">
                <Select
                  className="w-full h-11 border-[var(--color-border)] bg-white text-[var(--color-heading)] rounded-[0.9rem] font-medium"
                  options={[
                    { label: "Select location", value: "" },
                    ...((locationsQuery.data ?? []).map((location) => ({ label: location.name, value: location.id }))),
                  ]}
                  value={report.location_id}
                  onChange={(event) => setReport((current) => ({ ...current, location_id: event.target.value }))}
                />
                <Input 
                  type="date" 
                  className="w-full h-11 border-[var(--color-border)] bg-white rounded-[0.9rem] px-3.5 font-medium" 
                  value={report.report_date} 
                  onChange={(event) => setReport((current) => ({ ...current, report_date: event.target.value }))} 
                />
                <Input 
                  type="number" 
                  min={0} 
                  className="w-full h-11 border-[var(--color-border)] bg-white rounded-[0.9rem] px-3.5 font-medium" 
                  placeholder="Revenue PLN" 
                  value={report.revenue} 
                  onChange={(event) => setReport((current) => ({ ...current, revenue: event.target.value }))} 
                />
                
                <label className="inline-flex min-h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-[0.9rem] border border-[var(--color-border)] bg-white px-4 text-sm font-semibold text-[var(--color-text-muted)] hover:text-[var(--color-heading)] hover:bg-[var(--color-surface-muted)] transition-all duration-200">
                  <Camera className="size-4 text-[var(--color-primary)]" />
                  {reportPhotoName ? `Selected: ${reportPhotoName}` : "Attach photo from file"}
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
              </div>
              <Button
                onClick={() => reportMutation.mutate()}
                disabled={!report.location_id || !report.revenue || reportMutation.isPending}
                className="w-full h-11 rounded-[0.9rem] font-semibold tracking-wide text-sm shadow-md"
              >
                Save report
              </Button>
            </CardContent>
          </Card>

          <Card className="surface-card overflow-hidden">
            <CardHeader className="pb-3 border-b border-[var(--color-divider)]">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <CardTitle className="text-xl font-bold tracking-tight text-[var(--color-heading)]">Locations</CardTitle>
                  <CardDescription className="text-sm text-[var(--color-text-muted)]">Operating points for the current workspace.</CardDescription>
                </div>
                <Link to="/team" className="inline-flex items-center gap-1.5 text-xs font-bold tracking-wide uppercase text-[var(--color-primary)] bg-[var(--color-accent)] px-3 py-1.5 rounded-full hover:bg-[var(--color-primary)] hover:text-white transition-all duration-200">
                  Setup <ArrowUpRight className="size-3.5" />
                </Link>
              </div>
            </CardHeader>
            <CardContent className="pt-5 space-y-3">
              {(locationsQuery.data ?? []).map((location) => (
                <div key={location.id} className="surface-muted flex items-center justify-between gap-3 rounded-[1.3rem] p-4 border border-[rgba(148,163,184,0.1)] transition-all duration-200 hover:border-[rgba(47,111,237,0.22)]">
                  <div className="flex items-center gap-3">
                    <div className="grid size-11 place-items-center rounded-[1rem] bg-[var(--color-accent)] text-[var(--color-primary)] shadow-sm">
                      <MapPin className="size-4.5" />
                    </div>
                    <div>
                      <p className="font-semibold text-sm text-[var(--color-heading)]">{location.name}</p>
                      <p className="text-xs text-[var(--color-text-muted)] font-medium mt-0.5">{location.timezone}</p>
                    </div>
                  </div>
                  <Badge className="bg-white text-[var(--color-text-muted)] border-[var(--color-border)] shadow-sm px-2.5 py-0.5 rounded-md font-semibold text-xs">{location.timezone.split("/").at(-1)}</Badge>
                </div>
              ))}
              {!locationsQuery.data?.length ? (
                <p className="text-sm text-[var(--color-text-muted)] text-center py-6">No locations yet.</p>
              ) : null}
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </AppShell>
  );
}
