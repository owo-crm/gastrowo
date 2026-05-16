import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowUpRight, CalendarClock, Camera, Coins, MapPin, PlayCircle, TrendingUp } from "lucide-react";
import { Link } from "react-router-dom";

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
      cardClass: "bg-[linear-gradient(145deg,#f8fafc,#ffffff)]",
      iconClass: "bg-slate-100 text-slate-600",
      helperClass: "text-slate-600",
    };
  }
  if (percent >= 40) {
    return {
      label: "Critical",
      cardClass: "bg-[linear-gradient(145deg,#fff1f2,#ffffff)]",
      iconClass: "bg-rose-100 text-rose-700",
      helperClass: "text-rose-700",
    };
  }
  if (percent >= 30) {
    return {
      label: "Watch",
      cardClass: "bg-[linear-gradient(145deg,#fffbeb,#ffffff)]",
      iconClass: "bg-amber-100 text-amber-700",
      helperClass: "text-amber-700",
    };
  }
  return {
    label: "Healthy",
    cardClass: "bg-[linear-gradient(145deg,#ecfdf5,#ffffff)]",
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
    <Card className={cn("flex min-h-[200px] flex-col justify-between border-0 p-5 shadow-[0_18px_44px_rgba(15,23,42,0.06)]", cardClass)}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-[var(--color-text-muted)]">{label}</p>
          {badge ? (
            <Badge className={cn("mt-3 border-transparent tracking-[0.04em]", iconClass)}>
              {badge}
            </Badge>
          ) : null}
        </div>
        <span className={cn("grid size-11 shrink-0 place-items-center rounded-[1rem]", iconClass)}>
          <Icon className="size-5" />
        </span>
      </div>
      <div className="mt-5">
        <p className="text-[2.95rem] font-bold leading-none tracking-[-0.07em] text-[var(--color-heading)]">{value}</p>
      </div>
      <div className="mt-auto border-t border-[var(--color-divider)] pt-3">
        <p className={cn("text-sm", helperClass)}>{detail}</p>
      </div>
    </Card>
  );
}

export function HomePage() {
  const { token, me } = useAuth();
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
        action={<Badge>{today.toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}</Badge>}
      >
        <Card>
          <CardHeader>
            <div>
              <CardTitle>My shift today</CardTitle>
              <CardDescription>Compact personal shift card.</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            {myAssignment ? (
              <div className="space-y-3">
                <div className="surface-muted rounded-[1.1rem] px-4 py-4">
                  <div className="flex items-center gap-2 text-sm text-[var(--color-text-muted)]">
                    <CalendarClock className="size-4" />
                    <span>{formatDate(myAssignment.shift.date)}</span>
                  </div>
                  <p className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-[var(--color-heading)]">
                    {formatTime(myAssignment.shift.start_time)}-{formatTime(myAssignment.shift.end_time)}
                  </p>
                </div>
                <Button
                  onClick={() => startShiftMutation.mutate(myAssignment.shift.id)}
                  disabled={myAssignment.assignment.status === "in_shift" || startShiftMutation.isPending}
                  className="w-full"
                >
                  <PlayCircle className="size-4" />
                  {myAssignment.assignment.status === "in_shift" ? "Shift already started" : "Start shift"}
                </Button>
              </div>
            ) : (
              <div className="rounded-[1.1rem] border border-dashed border-[var(--color-border)] px-4 py-4 text-sm text-[var(--color-text-muted)]">
                No shift assigned for today.
              </div>
            )}
          </CardContent>
        </Card>
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
      action={<Badge>{today.toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}</Badge>}
    >
      <div className="space-y-5">
        <section className="grid gap-4 xl:grid-cols-3">
          <DailySignalCard
            label="Revenue today"
            value={formatCurrency(todayRevenue)}
            detail={todayRevenue > 0 ? `${todayLabor.toFixed(0)} PLN labor already booked today` : "Save the first revenue report to start today's finance tracking"}
            icon={Coins}
            cardClass="bg-[linear-gradient(145deg,#eff6ff,#ffffff)]"
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
            cardClass="bg-[linear-gradient(145deg,#ecfdf5,#ffffff)]"
            iconClass="bg-emerald-100 text-emerald-700"
            helperClass="text-emerald-700"
          />
        </section>

        <div className="grid gap-5 xl:grid-cols-[1.05fr_0.95fr]">
          <Card className="bg-[linear-gradient(145deg,#ffffff,#f3f8ff)]">
            <CardHeader>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <CardTitle>Quick revenue entry</CardTitle>
                  <CardDescription>Add the day result before moving to detailed reporting.</CardDescription>
                </div>
                <span className="grid size-10 place-items-center rounded-full bg-blue-600 text-white">
                  <Coins className="size-4" />
                </span>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <Select
                className="border-blue-200 bg-white text-blue-900"
                options={[
                  { label: "Select location", value: "" },
                  ...((locationsQuery.data ?? []).map((location) => ({ label: location.name, value: location.id }))),
                ]}
                value={report.location_id}
                onChange={(event) => setReport((current) => ({ ...current, location_id: event.target.value }))}
              />
              <Input type="date" value={report.report_date} onChange={(event) => setReport((current) => ({ ...current, report_date: event.target.value }))} />
              <Input type="number" min={0} placeholder="Revenue PLN" value={report.revenue} onChange={(event) => setReport((current) => ({ ...current, revenue: event.target.value }))} />
              <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-[0.9rem] border border-[var(--color-border)] bg-white px-3 text-sm text-[var(--color-heading)] transition hover:bg-[var(--color-surface-muted)]">
                <Camera className="size-4" />
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
              <Button
                onClick={() => reportMutation.mutate()}
                disabled={!report.location_id || !report.revenue || reportMutation.isPending}
                className="w-full"
              >
                Save report
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <CardTitle>Locations</CardTitle>
                  <CardDescription>Operating points for the current workspace.</CardDescription>
                </div>
                <Link to="/team" className="inline-flex items-center gap-2 text-sm font-semibold text-[var(--color-primary)]">
                  Setup <ArrowUpRight className="size-4" />
                </Link>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {(locationsQuery.data ?? []).map((location) => (
                <div key={location.id} className="surface-muted flex items-center justify-between gap-3 rounded-[1.3rem] px-4 py-4">
                  <div className="flex items-center gap-3">
                    <div className="grid size-11 place-items-center rounded-[1rem] bg-[var(--color-accent)] text-[var(--color-primary)]">
                      <MapPin className="size-4" />
                    </div>
                    <div>
                      <p className="font-medium text-[var(--color-heading)]">{location.name}</p>
                      <p className="text-sm text-[var(--color-text-muted)]">{location.timezone}</p>
                    </div>
                  </div>
                  <Badge>{location.timezone.split("/").at(-1)}</Badge>
                </div>
              ))}
              {!locationsQuery.data?.length ? (
                <p className="text-sm text-[var(--color-text-muted)]">No locations yet.</p>
              ) : null}
            </CardContent>
          </Card>
        </div>
      </div>
    </AppShell>
  );
}
