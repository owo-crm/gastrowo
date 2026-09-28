import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { CalendarPlus, Copy, ImagePlus, LogOut } from "lucide-react";

import { AppShell, LanguageList } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ListRow, ListSection } from "@/components/ui/list";
import { Segmented } from "@/components/ui/segmented";
import { api, apiAbsoluteUrl } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { loadBusinessLogo, saveBusinessLogo } from "@/lib/business-branding";
import { imageFileToDataUrl } from "@/lib/file";
import { useLanguage } from "@/lib/i18n";
import { useToast } from "@/lib/toast";

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

  useEffect(() => {
    setFullName(me?.full_name ?? "");
    setAvatarUrl(me?.avatar_url ?? null);
    setBusinessName(me?.active_organization_name ?? "");
    setCountry(me?.organization_settings?.country ?? "US");
    setBusinessLogo(loadBusinessLogo(me?.active_organization_id));
  }, [me?.full_name, me?.avatar_url, me?.active_organization_name, me?.organization_settings?.country, me?.active_organization_id]);

  const saveProfile = useMutation({
    mutationFn: () => api.patchMe(token!, { full_name: fullName.trim(), avatar_url: avatarUrl }),
    onSuccess: async () => {
      toast.success(t("profile.profile_updated"));
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

  const title = section === "business" ? t("sub.business") : section === "calendar" ? t("sub.calendar_sync") : t("sub.profile");
  const profileDirty = fullName.trim() !== (me?.full_name ?? "") || avatarUrl !== (me?.avatar_url ?? null);

  return (
    <AppShell title={title} flush>
      <div>
        {section === "profile" ? (
          <>
            <ListSection header={t("settings.you")}>
              <li>
                <PhotoPicker image={avatarUrl} fallback={initialsOf(fullName, "U")} label={t("profile.upload_avatar")} rounded="full" onPick={setAvatarUrl} />
              </li>
              <li>
                <Field label={t("login.full_name")}>
                  <Input value={fullName} onChange={(event) => setFullName(event.target.value)} />
                </Field>
              </li>
              <ListRow title={t("profile.account")} trailing={me?.email} />
              <ListRow title={t("profile.role")} trailing={me?.role ? t(`shell.role.${me.role}`) : ""} />
            </ListSection>
            <div className="px-4 py-4 sm:px-6">
              <Button size="lg" className="w-full sm:w-auto" onClick={() => saveProfile.mutate()} disabled={!fullName.trim() || !profileDirty || saveProfile.isPending}>
                {t("common.save")}
              </Button>
            </div>
            <ListSection header={t("shell.language")}>
              <li className="px-2 py-1 sm:px-4">
                <LanguageList />
              </li>
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
