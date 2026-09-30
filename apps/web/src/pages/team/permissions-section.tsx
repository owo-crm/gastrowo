import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Lock } from "lucide-react";
import { useNavigate } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { ListRow, ListSection } from "@/components/ui/list";
import { Switch } from "@/components/ui/switch";
import { hasPlanFeature } from "@/lib/access";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useLanguage } from "@/lib/i18n";
import { UPGRADE_ROUTE } from "@/lib/navigation";
import { useToast } from "@/lib/toast";
import type { OrganizationSettings } from "@/lib/types";

type Toggle = keyof Omit<OrganizationSettings, "country" | "currency" | "labor_rules" | "clock_mode" | "schedule_respect_hour_limits" | "roadmap_hidden">;

const STAFF: Toggle[] = ["staff_can_submit_revenue_reports", "staff_can_delete_revenue_reports"];
const MANAGERS: Toggle[] = [
  "manager_can_submit_revenue_reports",
  "manager_can_delete_revenue_reports",
  "manager_can_view_full_dashboard",
  "manager_can_view_payroll",
  "manager_can_manage_team",
  "manager_can_manage_business_settings",
];

const DEFAULTS: Record<Toggle, boolean> = {
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

/** What staff and managers can do across the workspace. Exceptions per person live in their sheet. */
export function PermissionsSection() {
  const { me, token, refreshMe } = useAuth();
  const { t } = useLanguage();
  const toast = useToast();
  const navigate = useNavigate();
  const allowed = hasPlanFeature(me, "permissions");
  const [values, setValues] = useState<Record<Toggle, boolean>>(DEFAULTS);

  useEffect(() => {
    const settings = me?.organization_settings;
    if (settings) setValues(Object.fromEntries(Object.keys(DEFAULTS).map((key) => [key, Boolean(settings[key as Toggle])])) as Record<Toggle, boolean>);
  }, [me?.organization_settings]);

  const save = useMutation({
    mutationFn: () => api.patchCurrentOrganizationSettings(token!, values),
    onSuccess: async () => {
      toast.success(t("profile.business_updated"));
      await refreshMe();
    },
    onError: (error) => toast.error(t("profile.business_update_failed"), error instanceof Error ? error.message : undefined),
  });

  if (!allowed) {
    return (
      <div className="px-4 py-12 text-center sm:px-6">
        <span className="mx-auto grid size-14 place-items-center rounded-full bg-[var(--color-fill)]">
          <Lock className="size-6 text-black" />
        </span>
        <p className="mt-4 text-[20px] font-semibold text-black">{t("team.permissions_locked_title")}</p>
        <p className="mx-auto mt-2 max-w-md text-[15px] text-[var(--color-text-muted)]">{t("team.permissions_locked_body")}</p>
        <Button className="mt-5" onClick={() => navigate(UPGRADE_ROUTE)}>
          {t("team.see_plans")}
        </Button>
      </div>
    );
  }

  const row = (key: Toggle) => (
    <ListRow key={key} title={t(`perm.${key}`)} trailing={<Switch checked={values[key]} label={t(`perm.${key}`)} onChange={(next) => setValues((current) => ({ ...current, [key]: next }))} />} />
  );

  return (
    <div>
      <ListSection header={t("team.filter_staff")}>{STAFF.map(row)}</ListSection>
      {/* Only the owner decides what managers can do. */}
      {me?.role === "ADMIN" ? (
        <ListSection header={t("team.filter_managers")} footer={t("team.permissions_footer")}>
          {MANAGERS.map(row)}
        </ListSection>
      ) : (
        <p className="px-4 pt-2 text-[14px] text-[var(--color-text-muted)] sm:px-6">{t("team.permissions_owner_only")}</p>
      )}
      <div className="px-4 py-4 sm:px-6">
        <Button size="lg" onClick={() => save.mutate()} disabled={save.isPending}>
          {t("common.save")}
        </Button>
      </div>
    </div>
  );
}
