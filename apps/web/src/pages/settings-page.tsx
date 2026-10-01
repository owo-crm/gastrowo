import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { CalendarPlus, Compass, Copy, FileClock, ImagePlus, KeyRound, LogOut, MessageCircle, Receipt, Store, Tablet, Trash2, Wallet } from "lucide-react";

import { DemoOffNote } from "@/components/demo-off";
import { startProductTour } from "@/components/product-tour";
import { openSupportChat } from "@/components/support-chat";
import { DeviceSection } from "@/components/device-section";
import { AppShell, LanguageList } from "@/components/layout/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ListRow, ListSection } from "@/components/ui/list";
import { Segmented } from "@/components/ui/segmented";
import { Sheet } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { canAccessReport, hasPlanFeature } from "@/lib/access";
import { api, apiAbsoluteUrl } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { loadBusinessLogo, saveBusinessLogo } from "@/lib/business-branding";
import { imageFileToDataUrl } from "@/lib/file";
import { useLanguage } from "@/lib/i18n";
import { useToast } from "@/lib/toast";
import type { ClockMode } from "@/lib/types";
import { readKioskToken, saveKioskToken } from "@/pages/kiosk-page";

export type SettingsSection = "profile" | "business" | "calendar";

function initialsOf(name: string | null | undefined, fallback: string) {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  return parts.slice(0, 2).map((item) => item[0]?.toUpperCase() ?? "").join("") || fallback;
}

/** Field row: label above a full-width input, iOS form style. */
function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <label className="block px-4 py-3 sm:px-6">
      <span className="mb-1.5 block text-[13px] font-semibold text-[var(--color-text-muted)]">{label}</span>
      {children}
      {hint ? <span className="mt-1.5 block text-[13px] text-[var(--color-text-muted)]">{hint}</span> : null}
    </label>
  );
}

function PhotoPicker({ image, fallback, label, rounded, onPick }: { image: string | null; fallback: string; label: string; rounded: "full" | "lg"; onPick: (dataUrl: string) => void }) {
  return (
    <div className="flex items-center gap-4 px-4 py-4 sm:px-6">
      <span
        className={`grid size-16 shrink-0 place-items-center overflow-hidden bg-[var(--color-primary-strong)] text-[20px] font-semibold text-white ${rounded === "full" ? "rounded-full" : "rounded-[14px]"}`}
      >
        {image ? <img src={image} alt="" className="size-full object-cover" /> : fallback}
      </span>
      <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-[10px] bg-[var(--color-accent)] px-4 text-[15px] font-semibold text-[var(--color-primary-strong)] active:opacity-70">
        <ImagePlus className="size-4" />
        {label}
        <input
          type="file"
          accept="image/*"
          className="sr-only"
          onChange={async (event) => {
            const input = event.currentTarget;
            const file = input.files?.[0];
            if (!file) return;
            onPick(await imageFileToDataUrl(file));
            input.value = "";
          }}
        />
      </label>
    </div>
  );
}

export function SettingsPage({ section = "profile" }: { section?: SettingsSection }) {
  const { me, token, logout, refreshMe } = useAuth();
  const toast = useToast();
  const { t } = useLanguage();

  const [fullName, setFullName] = useState(me?.full_name ?? "");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(me?.avatar_url ?? null);
  const [businessName, setBusinessName] = useState(me?.active_organization_name ?? "");
  const [country, setCountry] = useState<"US" | "PL">(me?.organization_settings?.country ?? "US");
  const [businessLogo, setBusinessLogo] = useState<string | null>(null);
  const [calendarUrl, setCalendarUrl] = useState<string | null>(null);
  const [confirmDemo, setConfirmDemo] = useState(false);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [pinSheet, setPinSheet] = useState(false);
  const [profileSheet, setProfileSheet] = useState(false);
  const isStaff = me?.role === "STAFF";
  const [pinValue, setPinValue] = useState("");
  const [kioskSheet, setKioskSheet] = useState(false);
  const [kioskLocation, setKioskLocation] = useState("");
  const canManageClock = me?.role === "ADMIN" || me?.role === "MANAGER";
  const clockMode: ClockMode = me?.organization_settings?.clock_mode ?? "both";

  const clockMeQuery = useQuery({ queryKey: ["clock-me"], queryFn: () => api.clockMe(token!), enabled: Boolean(token) && section === "profile" });
  const kiosksQuery = useQuery({ queryKey: ["kiosks"], queryFn: () => api.listKiosks(token!), enabled: Boolean(token) && section === "business" && canManageClock });
  const locationsQuery = useQuery({ queryKey: ["locations"], queryFn: () => api.listLocations(token!), enabled: Boolean(token) && section === "business" && canManageClock });

  const respectHourLimits = me?.organization_settings?.schedule_respect_hour_limits !== false;
  const saveHourLimits = useMutation({
    mutationFn: (next: boolean) => api.setScheduleHourLimits(token!, next),
    onSuccess: () => refreshMe(),
    onError: (error) => toast.error(t("settings.hour_limits_failed"), error instanceof Error ? error.message : undefined),
  });
  const saveMode = useMutation({
    mutationFn: (mode: ClockMode) => api.setClockMode(token!, mode),
    onSuccess: async () => {
      await refreshMe();
      void queryClient.invalidateQueries({ queryKey: ["clock-me"] });
    },
    onError: (error) => toast.error(t("clock.save_failed"), error instanceof Error ? error.message : undefined),
  });
  const savePin = useMutation({
    mutationFn: () => api.setMyClockPin(token!, pinValue),
    onSuccess: () => {
      setPinSheet(false);
      setPinValue("");
      toast.success(t("clock.pin_saved"));
      void queryClient.invalidateQueries({ queryKey: ["clock-me"] });
    },
    onError: (error) => toast.error(t("clock.pin_failed"), error instanceof Error ? error.message : undefined),
  });
  // A browser that is already a time clock reopens it instead of registering a new device.
  const localKioskToken = readKioskToken();
  const thisDeviceQuery = useQuery({
    queryKey: ["kiosk-device", localKioskToken],
    queryFn: () => api.kioskDevice(localKioskToken!),
    enabled: Boolean(localKioskToken) && section === "business" && canManageClock,
    retry: false,
  });
  const thisDeviceId = thisDeviceQuery.data?.id ?? null;
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);
  const renameKiosk = useMutation({
    mutationFn: () => api.renameKiosk(token!, renaming!.id, renaming!.name.trim()),
    onSuccess: () => {
      toast.success(t("clock.tablet_renamed"));
      setRenaming(null);
      void queryClient.invalidateQueries({ queryKey: ["kiosks"] });
      void queryClient.invalidateQueries({ queryKey: ["kiosk-device"] });
    },
    onError: (error) => toast.error(t("clock.save_failed"), error instanceof Error ? error.message : undefined),
  });
  const createKiosk = useMutation({
    mutationFn: () => api.createKiosk(token!, { location_id: kioskLocation || locationsQuery.data?.[0]?.id || "", name: t("clock.tablet_default_name") }),
    onSuccess: (device) => {
      saveKioskToken(device.token);
      setKioskSheet(false);
      navigate("/kiosk");
    },
    onError: (error) => toast.error(t("clock.save_failed"), error instanceof Error ? error.message : undefined),
  });
  const removeKiosk = useMutation({
    mutationFn: (id: string) => api.deleteKiosk(token!, id),
    onSuccess: (_data, id) => {
      if (id === thisDeviceId) saveKioskToken(null);
      setRenaming(null);
      void queryClient.invalidateQueries({ queryKey: ["kiosks"] });
      void queryClient.invalidateQueries({ queryKey: ["kiosk-device"] });
    },
  });

  useEffect(() => {
    setFullName(me?.full_name ?? "");
    setAvatarUrl(me?.avatar_url ?? null);
    setBusinessName(me?.active_organization_name ?? "");
    setBusinessLogo(loadBusinessLogo(me?.active_organization_id));
    setCountry(me?.organization_settings?.country ?? "US");
  }, [me?.full_name, me?.avatar_url, me?.active_organization_name, me?.organization_settings?.country, me?.active_organization_id]);

  const saveProfile = useMutation({
    mutationFn: () => api.patchMe(token!, { full_name: fullName.trim(), avatar_url: avatarUrl }),
    onSuccess: async () => {
      toast.success(t("profile.profile_updated"));
      setProfileSheet(false);
      await refreshMe();
    },
    onError: (error) => toast.error(t("profile.profile_update_failed"), error instanceof Error ? error.message : undefined),
  });

  const saveBusiness = useMutation({
    mutationFn: async () => {
      await api.patchCurrentOrganization(token!, { name: businessName.trim(), country });
      saveBusinessLogo(me?.active_organization_id, businessLogo);
    },
    onSuccess: async () => {
      toast.success(t("profile.business_updated"));
      await refreshMe();
    },
    onError: (error) => toast.error(t("profile.business_update_failed"), error instanceof Error ? error.message : undefined),
  });

  const demoRestaurant = useMutation({
    mutationFn: () => api.seedDemoRestaurant(token!),
    onSuccess: async (counts) => {
      setConfirmDemo(false);
      await refreshMe();
      await queryClient.invalidateQueries();
      toast.success(t("demo.done"), t("demo.done_body", { people: counts.people, shifts: counts.shifts, hours: counts.timesheets, days: counts.revenue_days }));
    },
    onError: (error) => toast.error(t("demo.failed"), error instanceof Error ? error.message : undefined),
  });

  const calendarFeed = useMutation({
    mutationFn: () => api.getCalendarFeed(token!),
    onSuccess: (data) => setCalendarUrl(apiAbsoluteUrl(data.path)),
    onError: (error) => toast.error(t("profile.calendar_failed"), error instanceof Error ? error.message : undefined),
  });
  const webcalUrl = calendarUrl?.replace(/^https?:/, "webcal:") ?? null;
  const copyCalendarUrl = async () => {
    if (!calendarUrl) return;
    try {
      await navigator.clipboard.writeText(calendarUrl);
      toast.success(t("profile.calendar_copied"));
    } catch {
      toast.error(t("profile.calendar_failed"));
    }
  };

  const title = section === "business" ? t("sub.business") : section === "calendar" ? t("sub.calendar_sync") : isStaff ? t("section.settings") : t("sub.profile");
  const profileDirty = fullName.trim() !== (me?.full_name ?? "") || avatarUrl !== (me?.avatar_url ?? null);

  return (
    <AppShell title={title} flush>
      <div>
        {section === "profile" ? (
          <>
            {/* You: just the avatar, name and email; tap to edit. */}
            <ListSection>
              <ListRow
                leading={
                  <span className="grid size-14 shrink-0 place-items-center overflow-hidden rounded-full bg-[var(--color-primary-strong)] text-[19px] font-semibold text-white">
                    {me?.avatar_url ? <img src={me.avatar_url} alt="" className="size-full object-cover" /> : initialsOf(me?.full_name, "U")}
                  </span>
                }
                title={<span className="text-[19px] font-semibold">{me?.full_name}</span>}
                subtitle={me?.email}
                chevron
                onClick={() => setProfileSheet(true)}
              />
            </ListSection>
            <Sheet
              open={profileSheet}
              onClose={() => setProfileSheet(false)}
              title={t("settings.you")}
              action={{ label: t("common.save"), onClick: () => saveProfile.mutate(), disabled: !fullName.trim() || !profileDirty || saveProfile.isPending }}
            >
              <div className="-mx-4 sm:-mx-6">
                <PhotoPicker image={avatarUrl} fallback={initialsOf(fullName, "U")} label={t("profile.upload_avatar")} rounded="full" onPick={setAvatarUrl} />
                <Field label={t("login.full_name")}>
                  <Input value={fullName} onChange={(event) => setFullName(event.target.value)} />
                </Field>
              </div>
            </Sheet>
            <ListSection footer={t("clock.pin_footer")}>
              <ListRow
                leading={<KeyRound className="size-5 text-[var(--color-primary-strong)]" />}
                title={t("clock.my_pin")}
                trailing={<span className="text-[20px] font-semibold tracking-[0.25em] tabular-nums text-black">{clockMeQuery.data?.pin ?? "…"}</span>}
                chevron
                onClick={() => setPinSheet(true)}
              />
            </ListSection>
            {/* A worker has no sub-tabs in Settings: pay, hours and the calendar feed open from here. */}
            {isStaff ? (
              <ListSection>
                {hasPlanFeature(me, "payroll") ? (
                  <ListRow leading={<Wallet className="size-5 text-[var(--color-primary-strong)]" />} title={t("sub.payments")} chevron onClick={() => navigate("/payroll")} />
                ) : null}
                {hasPlanFeature(me, "timesheets") ? (
                  <ListRow leading={<FileClock className="size-5 text-[var(--color-primary-strong)]" />} title={t("sub.my_hours")} chevron onClick={() => navigate("/schedule/hours")} />
                ) : null}
                {canAccessReport(me) ? (
                  <ListRow leading={<Receipt className="size-5 text-[var(--color-primary-strong)]" />} title={t("sub.revenue")} chevron onClick={() => navigate("/overview/revenue")} />
                ) : null}
                <ListRow leading={<CalendarPlus className="size-5 text-[var(--color-primary-strong)]" />} title={t("sub.calendar_sync")} chevron onClick={() => navigate("/settings/calendar")} />
              </ListSection>
            ) : null}
            <Sheet
              open={pinSheet}
              onClose={() => setPinSheet(false)}
              title={t("clock.my_pin")}
              action={{ label: t("common.save"), onClick: () => savePin.mutate(), disabled: !/^\d{4,6}$/.test(pinValue) || savePin.isPending }}
            >
              <div className="space-y-2">
                <Input
                  inputMode="numeric"
                  autoComplete="off"
                  placeholder="••••"
                  value={pinValue}
                  onChange={(event) => setPinValue(event.target.value.replace(/\D/g, "").slice(0, 6))}
                  className="text-center text-[28px] tracking-[0.4em]"
                />
                <p className="text-[14px] text-[var(--color-text-muted)]">{t("clock.pin_hint")}</p>
              </div>
            </Sheet>
            <DeviceSection />
            <ListSection header={t("shell.language")}>
              <li className="px-2 py-1 sm:px-4">
                <LanguageList />
              </li>
            </ListSection>
            <ListSection>
              <ListRow
                leading={<Compass className="size-5 text-[var(--color-primary-strong)]" />}
                title={t("tour.replay")}
                chevron
                onClick={() => startProductTour()}
              />
              {!me?.is_sandbox && !me?.is_platform_admin ? (
                <ListRow
                  leading={<MessageCircle className="size-5 text-[var(--color-primary-strong)]" />}
                  title={t("support.settings_row")}
                  subtitle={t("support.settings_row_hint")}
                  chevron
                  onClick={() => openSupportChat()}
                />
              ) : null}
            </ListSection>
            <ListSection>
              <ListRow
                title={
                  <span className="inline-flex items-center gap-2 font-semibold text-[var(--color-danger)]">
                    <LogOut className="size-4" /> {t("shell.log_out")}
                  </span>
                }
                onClick={() => void logout()}
              />
            </ListSection>
          </>
        ) : null}

        {section === "business" ? (
          <>
            <ListSection header={t("settings.business_identity")}>
              <li>
                <PhotoPicker image={businessLogo} fallback={initialsOf(businessName, "GS")} label={t("settings.upload_logo")} rounded="lg" onPick={setBusinessLogo} />
              </li>
              <li>
                <Field label={t("login.business_name")}>
                  <Input value={businessName} onChange={(event) => setBusinessName(event.target.value)} />
                </Field>
              </li>
            </ListSection>
            <ListSection header={t("settings.country")} footer={t("settings.country_footer")}>
              <li className="px-4 py-3 sm:px-6">
                <Segmented
                  className="w-full"
                  ariaLabel={t("settings.country")}
                  value={country}
                  onChange={setCountry}
                  options={[
                    { value: "US", label: t("settings.country_us") },
                    { value: "PL", label: t("settings.country_pl") },
                  ]}
                />
              </li>
              <ListRow title={t("settings.currency")} trailing={country === "PL" ? "PLN (zł)" : "USD ($)"} />
              <ListRow title={t("settings.labor_rules")} trailing={country === "PL" ? t("settings.rules_pl") : t("settings.rules_us")} />
            </ListSection>
            <div className="px-4 py-4 sm:px-6">
              <Button size="lg" className="w-full sm:w-auto" onClick={() => saveBusiness.mutate()} disabled={!businessName.trim() || saveBusiness.isPending}>
                {t("common.save")}
              </Button>
            </div>
            {canManageClock ? (
              <>
                <ListSection header={t("settings.scheduling")} footer={respectHourLimits ? t("settings.hour_limits_on") : t("settings.hour_limits_off")}>
                  <ListRow
                    title={t("settings.hour_limits")}
                    trailing={
                      <Switch
                        checked={respectHourLimits}
                        label={t("settings.hour_limits")}
                        disabled={saveHourLimits.isPending}
                        onChange={(next) => saveHourLimits.mutate(next)}
                      />
                    }
                  />
                </ListSection>
                <ListSection header={t("clock.header")} footer={t("clock.mode_footer")}>
                  <li className="px-4 py-3 sm:px-6" data-tour="time-clock">
                    <Segmented
                      className="w-full"
                      ariaLabel={t("clock.header")}
                      value={clockMode}
                      onChange={(mode) => saveMode.mutate(mode)}
                      options={[
                        { value: "phone", label: t("clock.mode_phone") },
                        { value: "kiosk", label: t("clock.mode_kiosk") },
                        { value: "both", label: t("clock.mode_both") },
                      ]}
                    />
                  </li>
                </ListSection>
                {me?.is_sandbox ? (
                  <DemoOffNote header={t("clock.tablets")} body={t("demo.off_kiosk")} />
                ) : clockMode !== "phone" ? (
                  <ListSection header={t("clock.tablets")} footer={t("clock.tablets_footer")}>
                    {(kiosksQuery.data ?? []).map((device) => (
                      <ListRow
                        key={device.id}
                        leading={<Tablet className="size-5 text-[var(--color-text-muted)]" />}
                        title={
                          <span className="inline-flex items-center gap-2">
                            {device.name}
                            {device.id === thisDeviceId ? <Badge tone="blue">{t("clock.this_device")}</Badge> : null}
                          </span>
                        }
                        subtitle={device.location_name}
                        chevron
                        onClick={() => setRenaming({ id: device.id, name: device.name })}
                      />
                    ))}
                    <ListRow
                      leading={<Tablet className="size-5 text-[var(--color-primary-strong)]" />}
                      title={<span className="font-semibold text-[var(--color-primary-strong)]">{thisDeviceId ? t("clock.open_kiosk_here") : t("clock.use_this_device")}</span>}
                      chevron
                      onClick={() => (thisDeviceId ? navigate("/kiosk") : setKioskSheet(true))}
                    />
                  </ListSection>
                ) : null}
                <Sheet
                  open={Boolean(renaming)}
                  onClose={() => setRenaming(null)}
                  title={renaming?.name ?? ""}
                  action={{ label: t("common.save"), onClick: () => renameKiosk.mutate(), disabled: !renaming?.name.trim() || renameKiosk.isPending }}
                >
                  <div className="space-y-4">
                    <label className="block space-y-1.5">
                      <span className="text-[14px] font-semibold text-[var(--color-text-muted)]">{t("clock.tablet_name")}</span>
                      <Input value={renaming?.name ?? ""} maxLength={80} onChange={(event) => setRenaming((current) => (current ? { ...current, name: event.target.value } : current))} />
                    </label>
                    <Button variant="danger-plain" onClick={() => renaming && removeKiosk.mutate(renaming.id)} disabled={removeKiosk.isPending}>
                      <Trash2 className="size-4" /> {t("clock.remove_tablet")}
                    </Button>
                  </div>
                </Sheet>
                <Sheet
                  open={kioskSheet}
                  onClose={() => setKioskSheet(false)}
                  title={t("clock.use_this_device")}
                  action={{ label: t("clock.start_kiosk"), onClick: () => createKiosk.mutate(), disabled: createKiosk.isPending || !(locationsQuery.data ?? []).length }}
                >
                  <div className="space-y-4 text-[15px] leading-6 text-black">
                    <p>{t("clock.kiosk_explain")}</p>
                    {(locationsQuery.data ?? []).length > 1 ? (
                      <Segmented
                        className="w-full"
                        ariaLabel={t("team.location")}
                        value={kioskLocation || locationsQuery.data![0].id}
                        onChange={setKioskLocation}
                        options={(locationsQuery.data ?? []).map((location) => ({ value: location.id, label: location.name }))}
                      />
                    ) : null}
                  </div>
                </Sheet>
              </>
            ) : null}
            {me?.is_demo_account && me.role === "ADMIN" ? (
              <>
                <ListSection header={t("demo.header")} footer={t("demo.footer")}>
                  <ListRow
                    leading={<Store className="size-5 text-[var(--color-primary-strong)]" />}
                    title={<span className="font-semibold text-[var(--color-primary-strong)]">{t("demo.fill")}</span>}
                    chevron
                    onClick={() => setConfirmDemo(true)}
                  />
                </ListSection>
                <Sheet
                  open={confirmDemo}
                  onClose={() => setConfirmDemo(false)}
                  title={t("demo.confirm_title")}
                >
                  <div className="space-y-3 text-[15px] leading-6 text-black">
                    <p>{t("demo.confirm_body")}</p>
                    <p className="text-[var(--color-text-muted)]">{t("demo.confirm_note")}</p>
                    <Button size="lg" variant="danger" className="w-full" onClick={() => demoRestaurant.mutate()} disabled={demoRestaurant.isPending}>
                      {demoRestaurant.isPending ? t("demo.working") : t("demo.confirm")}
                    </Button>
                  </div>
                </Sheet>
              </>
            ) : null}
          </>
        ) : null}

        {section === "calendar" ? (
          <ListSection header={t("profile.calendar_title")} footer={t("profile.calendar_private")}>
            <li className="px-4 py-4 text-[15px] leading-6 text-[var(--color-text-muted)] sm:px-6">{t("profile.calendar_description")}</li>
            {calendarUrl && webcalUrl ? (
              <>
                <li className="flex gap-2 px-4 py-3 sm:px-6">
                  <Input readOnly value={calendarUrl} onFocus={(event) => event.currentTarget.select()} />
                  <Button variant="secondary" size="icon" onClick={copyCalendarUrl} aria-label={t("profile.calendar_copy")}>
                    <Copy className="size-5" />
                  </Button>
                </li>
                <ListRow
                  title={<span className="font-semibold text-[var(--color-primary-strong)]">Google Calendar</span>}
                  chevron
                  onClick={() => window.open(`https://calendar.google.com/calendar/r?cid=${encodeURIComponent(webcalUrl)}`, "_blank", "noopener")}
                />
                <ListRow
                  title={<span className="font-semibold text-[var(--color-primary-strong)]">Apple / Outlook</span>}
                  chevron
                  onClick={() => window.location.assign(webcalUrl)}
                />
              </>
            ) : (
              <li className="px-4 py-4 sm:px-6">
                <Button size="lg" onClick={() => calendarFeed.mutate()} disabled={calendarFeed.isPending}>
                  <CalendarPlus className="size-5" /> {t("profile.calendar_connect")}
                </Button>
              </li>
            )}
          </ListSection>
        ) : null}
      </div>
    </AppShell>
  );
}
