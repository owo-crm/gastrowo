import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Camera, FileUp } from "lucide-react";

import { AppShell } from "@/components/layout/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { toLocalIso } from "@/lib/date";
import { fileToDataUrl } from "@/lib/file";
import { useLanguage } from "@/lib/i18n";
import { useToast } from "@/lib/toast";

function todayIso() {
  return toLocalIso(new Date());
}

export function ReportPage() {
   const { token, me } = useAuth();
   const { t } = useLanguage();
   const toast = useToast();
   const queryClient = useQueryClient();
  const [report, setReport] = useState({
    location_id: "",
    report_date: todayIso(),
    revenue: "",
    photo_url: "",
  });
  const [photoName, setPhotoName] = useState("");

  const locationsQuery = useQuery({
    queryKey: ["locations"],
    queryFn: () => api.listLocations(token!),
    enabled: Boolean(token),
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
      setPhotoName("");
      void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      void queryClient.invalidateQueries({ queryKey: ["owner-dashboard-inline"] });
      void queryClient.invalidateQueries({ queryKey: ["notifications"] });
      toast.success(t("report.saved"));
    },
    onError: (error) => {
      toast.error(t("report.save_failed"), error instanceof Error ? error.message : undefined);
    },
  });

  const locationOptions = useMemo(
    () => (locationsQuery.data ?? []).map((location) => ({ label: location.name, value: location.id })),
    [locationsQuery.data],
  );

  return (
    <AppShell
      title={t("report.title")}
      subtitle={me?.role === "STAFF" ? t("report.subtitle.staff") : t("report.subtitle.default")}
      action={<Badge>{me?.role ?? t("common.member")}</Badge>}
    >
      <div className="stagger-children mx-auto max-w-[760px] pb-24 sm:pb-0">
        <Card className="animate-slide-in overflow-hidden p-0" style={{ animationDelay: "100ms" }}>
          <div className="bg-[linear-gradient(135deg,#eff6ff_0%,#ffffff_55%,#ecfdf5_100%)] px-4 py-5 sm:px-6 sm:py-6">
            <div className="inline-flex items-center gap-2 rounded-full border border-blue-100 bg-white px-3 py-1 text-xs font-semibold text-blue-700">
              <FileUp className="size-3.5" />
              {t("report.badge")}
            </div>
            <h2 className="mt-4 text-2xl font-bold tracking-[-0.05em] text-[var(--color-heading)] sm:text-3xl">{t("report.heading")}</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--color-text-muted)]">
              {t("report.body")}
            </p>
          </div>
          <CardContent className="grid gap-4 p-4 pb-8 sm:p-6 sm:pb-6">
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--color-text-muted)]">{t("report.location")}</p>
                <Select
                  options={locationOptions}
                  value={report.location_id}
                  onChange={(event) => setReport((current) => ({ ...current, location_id: event.target.value }))}
                />
              </div>
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--color-text-muted)]">{t("report.date")}</p>
                <Input type="date" value={report.report_date} onChange={(event) => setReport((current) => ({ ...current, report_date: event.target.value }))} />
              </div>
            </div>
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--color-text-muted)]">{t("report.revenue")}</p>
              <Input
                type="number"
                min={0}
                placeholder={t("report.revenue_placeholder")}
                value={report.revenue}
                onChange={(event) => setReport((current) => ({ ...current, revenue: event.target.value }))}
              />
            </div>
            <div className="rounded-[1.1rem] border border-dashed border-[var(--color-border)] bg-[var(--color-surface-muted)] px-4 py-4">
              <label className="inline-flex cursor-pointer items-center gap-2 text-sm font-medium text-[var(--color-heading)]">
                <Camera className="size-4 text-[var(--color-primary)]" />
                {photoName ? t("report.selected_file", { name: photoName }) : t("report.attach")}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={async (event) => {
                    const file = event.target.files?.[0];
                    if (!file) return;
                    const dataUrl = await fileToDataUrl(file);
                    setReport((current) => ({ ...current, photo_url: dataUrl }));
                    setPhotoName(file.name);
                  }}
                />
              </label>
            </div>
            <div className="hidden sm:block">
              <Button
                onClick={() => reportMutation.mutate()}
                disabled={!report.location_id || !report.revenue || reportMutation.isPending}
                className="w-full"
              >
                {t("report.save")}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
      <div className="fixed inset-x-0 bottom-[calc(5.25rem+env(safe-area-inset-bottom))] z-40 px-4 sm:hidden">
        <div className="mx-auto max-w-[760px] rounded-[1.15rem] border border-[var(--color-border)] bg-white/92 p-2 shadow-[0_18px_40px_rgba(15,23,42,0.12)] backdrop-blur">
          <Button
            onClick={() => reportMutation.mutate()}
            disabled={!report.location_id || !report.revenue || reportMutation.isPending}
            className="w-full"
          >
            {t("report.save")}
          </Button>
        </div>
      </div>
    </AppShell>
  );
}
