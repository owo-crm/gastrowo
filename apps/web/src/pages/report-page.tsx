import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Camera, Trash2 } from "lucide-react";

import { AppShell } from "@/components/layout/app-shell";
import { PhotoThumb } from "@/components/photo-viewer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ListRow, ListSection } from "@/components/ui/list";
import { Select } from "@/components/ui/select";
import { canDeleteReports } from "@/lib/access";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { toLocalIso } from "@/lib/date";
import { imageFileToDataUrl } from "@/lib/file";
import { currencyOf, currencySymbol, formatDate, formatMoney } from "@/lib/format";
import { useLanguage } from "@/lib/i18n";
import { useToast } from "@/lib/toast";

const today = () => toLocalIso(new Date());
const daysAgo = (days: number) => {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return toLocalIso(date);
};

/** End-of-day revenue per location. It feeds labor cost % on the overview. */
export function ReportPage() {
  const { token, me } = useAuth();
  const { t, lang } = useLanguage();
  const toast = useToast();
  const queryClient = useQueryClient();
  const currency = currencyOf(me);
  const canSeeHistory = me?.role === "ADMIN" || me?.role === "MANAGER";

  const locationsQuery = useQuery({ queryKey: ["locations"], queryFn: () => api.listLocations(token!), enabled: Boolean(token) });
  const locations = locationsQuery.data ?? [];
  const [locationId, setLocationId] = useState("");
  const [date, setDate] = useState(today);
  const [amount, setAmount] = useState("");
  const [photo, setPhoto] = useState<string | null>(null);
  const selectedLocation = locationId || locations[0]?.id || "";

  const historyStart = daysAgo(13);
  const historyQuery = useQuery({
    queryKey: ["revenue-reports", historyStart],
    queryFn: () => api.listRevenueReports(token!, historyStart, today()),
    enabled: Boolean(token) && canSeeHistory,
  });
  const locationName = (id: string) => locations.find((item) => item.id === id)?.name ?? "";

  const refresh = () => {
    for (const key of ["revenue-reports", "dashboard", "notifications"]) void queryClient.invalidateQueries({ queryKey: [key] });
  };
  const save = useMutation({
    mutationFn: () =>
      api.addRevenueReport(token!, {
        location_id: selectedLocation,
        report_date: date,
        revenue: amount.replace(",", "."),
        currency,
        photo_url: photo,
      }),
    onSuccess: () => {
      setAmount("");
      setPhoto(null);
      refresh();
      toast.success(t("report.saved"));
    },
    onError: (error) => toast.error(t("report.save_failed"), error instanceof Error ? error.message : undefined),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.deleteRevenueReport(token!, id),
    onSuccess: refresh,
    onError: (error) => toast.error(t("dashboard.report_delete_failed"), error instanceof Error ? error.message : undefined),
  });

  const valid = Boolean(selectedLocation) && Number(amount.replace(",", ".")) > 0 && Boolean(date);

  return (
    <AppShell title={t("sub.revenue")} subtitle={t("revenue.subtitle")} flush>
      <ListSection header={t("revenue.add")} footer={t("revenue.footer")}>
        <li className="grid gap-4 px-4 py-4 sm:grid-cols-2 sm:px-6">
          {locations.length > 1 ? (
            <label className="block sm:col-span-2">
              <span className="mb-1.5 block text-[13px] font-semibold text-[var(--color-text-muted)]">{t("revenue.location")}</span>
              <Select value={selectedLocation} onChange={(event) => setLocationId(event.target.value)} options={locations.map((item) => ({ value: item.id, label: item.name }))} />
            </label>
          ) : null}
          <label className="block">
            <span className="mb-1.5 block text-[13px] font-semibold text-[var(--color-text-muted)]">{t("revenue.date")}</span>
            <Input type="date" value={date} max={today()} onChange={(event) => setDate(event.target.value)} />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-[13px] font-semibold text-[var(--color-text-muted)]">{t("revenue.amount")}</span>
            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[16px] font-semibold text-black">{currencySymbol(currency, lang)}</span>
              <Input inputMode="decimal" className="pl-9 text-[17px] font-semibold" placeholder="0.00" value={amount} onChange={(event) => setAmount(event.target.value)} />
            </div>
          </label>
          <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
            <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-[10px] bg-[var(--color-fill)] px-4 text-[15px] font-semibold text-black active:opacity-70">
              <Camera className="size-5" />
              {photo ? t("revenue.photo_change") : t("revenue.photo_add")}
              <input
                type="file"
                accept="image/*"
                capture="environment"
                className="sr-only"
                onChange={async (event) => {
                  const input = event.currentTarget;
                  const file = input.files?.[0];
                  if (file) setPhoto(await imageFileToDataUrl(file));
                  input.value = "";
                }}
              />
            </label>
            {photo ? <PhotoThumb src={photo} name={`revenue-${date}`} className="size-11 rounded-[8px]" /> : null}
            <Button size="lg" className="ml-auto" onClick={() => save.mutate()} disabled={!valid || save.isPending}>
              {t("revenue.save")}
            </Button>
          </div>
        </li>
      </ListSection>

      {canSeeHistory ? (
        <ListSection header={t("revenue.history")}>
          {(historyQuery.data ?? []).map((report) => (
            <ListRow
              key={report.id}
              leading={
                report.photo_url ? (
                  <PhotoThumb src={report.photo_url} name={`revenue-${report.report_date}-${locationName(report.location_id)}`} className="size-10 rounded-[8px]" />
                ) : undefined
              }
              title={<span className="font-semibold tabular-nums">{formatMoney(report.revenue, currency, lang)}</span>}
              subtitle={`${formatDate(report.report_date, lang)} · ${locationName(report.location_id)}`}
              trailing={
                canDeleteReports(me) ? (
                  <button
                    type="button"
                    aria-label={t("revenue.delete")}
                    onClick={() => remove.mutate(report.id)}
                    className="grid size-10 place-items-center rounded-full text-[#3c3c43] hover:bg-[var(--color-danger-fill)] hover:text-[var(--color-danger)]"
                  >
                    <Trash2 className="size-[18px]" />
                  </button>
                ) : null
              }
            />
          ))}
          {!historyQuery.data?.length ? <ListRow title={<span className="text-[var(--color-text-muted)]">{t("revenue.history_empty")}</span>} /> : null}
        </ListSection>
      ) : null}
    </AppShell>
  );
}
