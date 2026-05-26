import { useEffect, useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Building2, ImagePlus, Languages, LogOut, Settings2, ShieldCheck, UserCircle2 } from "lucide-react";

import { canManageBusinessSettings } from "@/lib/access";
import { AppShell } from "@/components/layout/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { loadBusinessLogo, saveBusinessLogo } from "@/lib/business-branding";
import { useLanguage } from "@/lib/i18n";
import { fileToDataUrl } from "@/lib/file";
import { useToast } from "@/lib/toast";

type SettingsTab = "personal" | "business";

const defaultWorkspaceSettings = {
  staff_can_submit_revenue_reports: false,
  staff_can_delete_revenue_reports: false,
  manager_can_submit_revenue_reports: true,
  manager_can_delete_revenue_reports: true,
  manager_can_view_full_dashboard: false,
  manager_can_view_payroll: false,
  manager_can_manage_team: true,
  manager_can_manage_business_settings: false,
  manager_can_access_notes: true,
  manager_can_access_inventory: true,
};

export function ProfilePage() {
  const { me, token, logout, refreshMe } = useAuth();
  const toast = useToast();
  const { lang, setLang, t } = useLanguage();
  const canManageBusiness = canManageBusinessSettings(me);
  const [activeTab, setActiveTab] = useState<SettingsTab>("personal");
  const [fullName, setFullName] = useState(me?.full_name ?? "");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(me?.avatar_url ?? null);
  const [workspaceName, setWorkspaceName] = useState(me?.active_organization_name ?? "");
  const [businessLogo, setBusinessLogo] = useState<string | null>(null);
  const [workspaceSettings, setWorkspaceSettings] = useState(me?.organization_settings ?? defaultWorkspaceSettings);

  useEffect(() => {
    setFullName(me?.full_name ?? "");
    setAvatarUrl(me?.avatar_url ?? null);
    setWorkspaceName(me?.active_organization_name ?? "");
    setWorkspaceSettings(me?.organization_settings ?? defaultWorkspaceSettings);
    setBusinessLogo(loadBusinessLogo(me?.active_organization_id));
  }, [me?.full_name, me?.avatar_url, me?.active_organization_name, me?.organization_settings, me?.active_organization_id]);

  useEffect(() => {
    if (!canManageBusiness && activeTab === "business") {
      setActiveTab("personal");
    }
  }, [activeTab, canManageBusiness]);

  const saveProfileMutation = useMutation({
    mutationFn: () => api.patchMe(token!, { full_name: fullName.trim(), avatar_url: avatarUrl }),
    onSuccess: async () => {
      toast.success(t("profile.profile_updated"));
      await refreshMe();
    },
    onError: (error) => {
      toast.error(t("profile.profile_update_failed"), error instanceof Error ? error.message : undefined);
    },
  });

  const saveBusinessMutation = useMutation({
    mutationFn: async () => {
      await api.patchCurrentOrganization(token!, { name: workspaceName.trim() });
      await api.patchCurrentOrganizationSettings(token!, workspaceSettings);
      saveBusinessLogo(me?.active_organization_id, businessLogo);
    },
    onSuccess: async () => {
      toast.success(t("profile.business_updated"));
      await refreshMe();
    },
    onError: (error) => {
      toast.error(t("profile.business_update_failed"), error instanceof Error ? error.message : undefined);
    },
  });

  const initials = useMemo(() => {
    const parts = (fullName || me?.full_name || "U").trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return "U";
    return parts.slice(0, 2).map((item) => item[0]?.toUpperCase() ?? "").join("");
  }, [fullName, me?.full_name]);

  const businessInitials = useMemo(() => {
    const parts = (workspaceName || me?.active_organization_name || "G").trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return "G";
    return parts.slice(0, 2).map((item) => item[0]?.toUpperCase() ?? "").join("");
  }, [workspaceName, me?.active_organization_name]);

  const tabs: Array<{ key: SettingsTab; label: string; icon: typeof UserCircle2 }> = [
    { key: "personal", label: t("profile.personal_tab"), icon: UserCircle2 },
    ...(canManageBusiness ? [{ key: "business" as const, label: t("profile.business_tab"), icon: Building2 }] : []),
  ];

  return (
    <AppShell
      title={t("profile.title")}
      subtitle={t("profile.subtitle")}
      action={<Badge>{t("profile.language_badge")}</Badge>}
    >
      <div className="stagger-children space-y-5">
        <div className="inline-flex flex-wrap items-center gap-2 rounded-[1.1rem] border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-1">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={`inline-flex min-h-10 items-center gap-2 rounded-[0.9rem] px-4 py-2 text-sm font-semibold transition ${activeTab === tab.key ? "bg-white text-[var(--color-primary)]" : "text-[var(--color-text-muted)] hover:text-[var(--color-heading)]"}`}
            >
              <tab.icon className="size-4" />
              {tab.label}
            </button>
          ))}
        </div>

        {activeTab === "personal" ? (
          <div className="stagger-grid grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
            <Card>
              <CardHeader>
                <div>
                  <CardTitle>{t("profile.personal_tab")}</CardTitle>
                  <CardDescription>{t("profile.personal_description")}</CardDescription>
                </div>
              </CardHeader>
              <CardContent className="grid gap-6 md:grid-cols-[180px_1fr]">
                <div className="space-y-3">
                  <div className="grid size-24 place-items-center overflow-hidden rounded-full border border-[var(--color-border)] bg-[var(--color-surface-muted)] text-xl font-semibold text-[var(--color-heading)]">
                    {avatarUrl ? <img src={avatarUrl} alt="Avatar" className="size-full object-cover" /> : initials}
                  </div>
                  <label className="inline-flex cursor-pointer items-center gap-2 rounded-[0.95rem] border border-[var(--color-border)] bg-white px-3 py-2 text-sm text-[var(--color-heading)] transition hover:bg-[var(--color-surface-muted)]">
                    <ImagePlus className="size-4" />
                    {t("profile.upload_avatar")}
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={async (event) => {
                        const file = event.target.files?.[0];
                        if (!file) return;
                        const dataUrl = await fileToDataUrl(file);
                        setAvatarUrl(dataUrl);
                      }}
                    />
                  </label>
                </div>

                <div className="space-y-5">
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <p className="text-sm font-medium text-[var(--color-heading)]">{t("login.full_name")}</p>
                      <Input value={fullName} onChange={(event) => setFullName(event.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <p className="text-sm font-medium text-[var(--color-heading)]">{t("profile.workspace_language")}</p>
                      <div className="grid gap-2 sm:grid-cols-2">
                        <button
                          type="button"
                          onClick={() => setLang("en")}
                          className={`rounded-[0.95rem] border px-3 py-2 text-left text-sm transition ${lang === "en" ? "border-[var(--color-primary)] bg-[var(--color-accent)] text-[var(--color-primary)]" : "border-[var(--color-border)] bg-white text-[var(--color-text-muted)] hover:bg-[var(--color-surface-muted)]"}`}
                        >
                          <span className="inline-flex items-center gap-2 font-medium"><Languages className="size-4" /> {t("language.english")}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setLang("pl")}
                          className={`rounded-[0.95rem] border px-3 py-2 text-left text-sm transition ${lang === "pl" ? "border-[var(--color-primary)] bg-[var(--color-accent)] text-[var(--color-primary)]" : "border-[var(--color-border)] bg-white text-[var(--color-text-muted)] hover:bg-[var(--color-surface-muted)]"}`}
                        >
                          <span className="inline-flex items-center gap-2 font-medium"><Languages className="size-4" /> {t("language.polish")}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setLang("ru")}
                          className={`rounded-[0.95rem] border px-3 py-2 text-left text-sm transition ${lang === "ru" ? "border-[var(--color-primary)] bg-[var(--color-accent)] text-[var(--color-primary)]" : "border-[var(--color-border)] bg-white text-[var(--color-text-muted)] hover:bg-[var(--color-surface-muted)]"}`}
                        >
                          <span className="inline-flex items-center gap-2 font-medium"><Languages className="size-4" /> {t("language.russian")}</span>
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="surface-muted rounded-[1rem] px-4 py-4">
                      <p className="text-xs uppercase tracking-[0.14em] text-[var(--color-text-muted)]">{t("profile.role")}</p>
                      <p className="mt-2 text-lg font-semibold text-[var(--color-heading)]">{me?.role}</p>
                    </div>
                      <div className="surface-muted rounded-[1rem] px-4 py-4">
                        <p className="text-xs uppercase tracking-[0.14em] text-[var(--color-text-muted)]">{t("profile.account")}</p>
                        <p className="mt-2 text-base font-semibold text-[var(--color-heading)]">{me?.email}</p>
                      </div>
                  </div>

                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Button onClick={() => saveProfileMutation.mutate()} disabled={!fullName.trim() || saveProfileMutation.isPending} className="sm:flex-1">
                      {t("profile.save_personal")}
                    </Button>
                    <Button variant="danger" onClick={logout}>
                      <LogOut className="size-4" /> {t("common.logout")}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div>
                  <CardTitle>{t("profile.account_summary")}</CardTitle>
                  <CardDescription>{t("profile.account_summary_description")}</CardDescription>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {[
                  { icon: UserCircle2, title: t("nav.profile"), body: t("profile.summary_profile") },
                  { icon: Settings2, title: t("common.workspace"), body: canManageBusiness ? t("profile.summary_workspace_manage") : t("profile.summary_workspace_readonly") },
                  { icon: ShieldCheck, title: t("profile.access"), body: t("profile.summary_access") },
                ].map((item) => (
                  <div key={item.title} className="flex items-start gap-3 rounded-[1rem] border border-[var(--color-border)] bg-white px-4 py-3">
                    <div className="grid size-10 flex-shrink-0 place-items-center rounded-[0.9rem] bg-slate-100 text-[var(--color-primary)]">
                      <item.icon className="size-4" />
                    </div>
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-[var(--color-heading)]">{item.title}</p>
                      <p className="mt-1 line-clamp-3 text-sm leading-6 text-[var(--color-text-muted)]">{item.body}</p>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        ) : (
          <div className="stagger-grid grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
            <Card>
              <CardHeader>
                <div>
                  <CardTitle>{t("profile.business_identity")}</CardTitle>
                  <CardDescription>{t("profile.business_identity_description")}</CardDescription>
                </div>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="flex flex-wrap items-center gap-4">
                  <div className="grid size-24 place-items-center overflow-hidden rounded-[1.4rem] border border-[var(--color-border)] bg-[var(--color-surface-muted)] text-xl font-semibold text-[var(--color-heading)]">
                    {businessLogo ? <img src={businessLogo} alt="Business logo" className="size-full object-cover" /> : businessInitials}
                  </div>
                  <div className="flex-1 min-w-[220px] space-y-3">
                    <div className="space-y-2">
                      <p className="text-sm font-medium text-[var(--color-heading)]">{t("login.business_name")}</p>
                      <Input value={workspaceName} onChange={(event) => setWorkspaceName(event.target.value)} />
                    </div>
                    <label className="inline-flex cursor-pointer items-center gap-2 rounded-[0.95rem] border border-[var(--color-border)] bg-white px-3 py-2 text-sm text-[var(--color-heading)] transition hover:bg-[var(--color-surface-muted)]">
                      <ImagePlus className="size-4" />
                      {t("profile.upload_business_logo")}
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={async (event) => {
                          const file = event.target.files?.[0];
                          if (!file) return;
                          const dataUrl = await fileToDataUrl(file);
                          setBusinessLogo(dataUrl);
                        }}
                      />
                    </label>
                  </div>
                </div>
                <div className="rounded-[1rem] border border-dashed border-[var(--color-border)] bg-[var(--color-surface-muted)] px-4 py-4 text-sm leading-6 text-[var(--color-text-muted)]">
                  {t("profile.business_logo_note")}
                </div>
                <Button onClick={() => saveBusinessMutation.mutate()} disabled={!workspaceName.trim() || saveBusinessMutation.isPending} className="w-full">
                  {t("profile.save_business")}
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div>
                  <CardTitle>{t("profile.business_permissions")}</CardTitle>
                  <CardDescription>{t("profile.business_permissions_description")}</CardDescription>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {[
                  { key: "staff_can_submit_revenue_reports", label: t("profile.perm_staff_reports") },
                  { key: "staff_can_delete_revenue_reports", label: t("profile.perm_staff_report_delete") },
                  { key: "manager_can_submit_revenue_reports", label: t("profile.perm_manager_report_submit") },
                  { key: "manager_can_delete_revenue_reports", label: t("profile.perm_manager_report_delete") },
                  { key: "manager_can_view_full_dashboard", label: t("profile.perm_manager_dashboard") },
                  { key: "manager_can_view_payroll", label: t("profile.perm_manager_payroll") },
                  { key: "manager_can_manage_team", label: t("profile.perm_manager_team") },
                  { key: "manager_can_manage_business_settings", label: t("profile.perm_manager_business") },
                  { key: "manager_can_access_notes", label: t("profile.perm_manager_notes") },
                  { key: "manager_can_access_inventory", label: t("profile.perm_manager_inventory") },
                ].map((item) => {
                  const checked = workspaceSettings[item.key as keyof typeof workspaceSettings];
                  return (
                    <label key={item.key} className="flex items-center justify-between gap-3 rounded-[1rem] border border-[var(--color-border)] bg-white px-4 py-3">
                      <span className="text-sm font-medium text-[var(--color-heading)]">{item.label}</span>
                      <button
                        type="button"
                        aria-pressed={checked}
                        onClick={() =>
                          setWorkspaceSettings((current) => ({
                            ...current,
                            [item.key]: !current[item.key as keyof typeof current],
                          }))
                        }
                        className={`inline-flex h-8 w-16 items-center rounded-full p-1 transition ${checked ? "bg-[var(--color-primary)]" : "bg-slate-200"}`}
                      >
                        <span className={`size-6 rounded-full bg-white shadow-sm transition ${checked ? "translate-x-8" : "translate-x-0"}`} />
                      </button>
                    </label>
                  );
                })}
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </AppShell>
  );
}
