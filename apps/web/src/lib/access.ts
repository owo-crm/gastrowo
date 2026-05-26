import type { MeResponse, MembershipPermissionOverrides, MembershipSummary, OrganizationSettings } from "@/lib/types";

const defaultSettings: OrganizationSettings = {
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

const defaultOverrides: MembershipPermissionOverrides = {
  staff_can_submit_revenue_reports_override: null,
  staff_can_delete_revenue_reports_override: null,
  manager_can_submit_revenue_reports_override: null,
  manager_can_delete_revenue_reports_override: null,
  manager_can_view_full_dashboard_override: null,
  manager_can_view_payroll_override: null,
  manager_can_manage_team_override: null,
  manager_can_manage_business_settings_override: null,
  manager_can_access_notes_override: null,
  manager_can_access_inventory_override: null,
};

function resolve(override: boolean | null | undefined, fallback: boolean): boolean {
  return override == null ? fallback : override;
}

function getActiveMembership(me?: MeResponse | null): MembershipSummary | null {
  if (!me?.active_organization_id) return me?.memberships?.[0] ?? null;
  return me.memberships.find((item) => item.organization_id === me.active_organization_id) ?? me.memberships?.[0] ?? null;
}

export function getOrganizationSettings(me?: MeResponse | null): OrganizationSettings {
  return me?.organization_settings ?? defaultSettings;
}

export function getMembershipPermissionOverrides(me?: MeResponse | null): MembershipPermissionOverrides {
  const membership = getActiveMembership(me);
  if (!membership) return defaultOverrides;
  return {
    staff_can_submit_revenue_reports_override: membership.staff_can_submit_revenue_reports_override,
    staff_can_delete_revenue_reports_override: membership.staff_can_delete_revenue_reports_override,
    manager_can_submit_revenue_reports_override: membership.manager_can_submit_revenue_reports_override,
    manager_can_delete_revenue_reports_override: membership.manager_can_delete_revenue_reports_override,
    manager_can_view_full_dashboard_override: membership.manager_can_view_full_dashboard_override,
    manager_can_view_payroll_override: membership.manager_can_view_payroll_override,
    manager_can_manage_team_override: membership.manager_can_manage_team_override,
    manager_can_manage_business_settings_override: membership.manager_can_manage_business_settings_override,
    manager_can_access_notes_override: membership.manager_can_access_notes_override,
    manager_can_access_inventory_override: membership.manager_can_access_inventory_override,
  };
}

export function canViewOverview(me?: MeResponse | null): boolean {
  const settings = getOrganizationSettings(me);
  const overrides = getMembershipPermissionOverrides(me);
  return me?.role === "ADMIN" || (me?.role === "MANAGER" && resolve(overrides.manager_can_view_full_dashboard_override, settings.manager_can_view_full_dashboard));
}

export function canAccessReport(me?: MeResponse | null): boolean {
  const settings = getOrganizationSettings(me);
  const overrides = getMembershipPermissionOverrides(me);
  if (me?.role === "ADMIN") return true;
  if (me?.role === "MANAGER") {
    return resolve(overrides.manager_can_submit_revenue_reports_override, settings.manager_can_submit_revenue_reports);
  }
  return me?.role === "STAFF" && resolve(overrides.staff_can_submit_revenue_reports_override, settings.staff_can_submit_revenue_reports);
}

export function canDeleteReports(me?: MeResponse | null): boolean {
  const settings = getOrganizationSettings(me);
  const overrides = getMembershipPermissionOverrides(me);
  if (me?.role === "ADMIN") return true;
  if (me?.role === "MANAGER") {
    return resolve(overrides.manager_can_delete_revenue_reports_override, settings.manager_can_delete_revenue_reports);
  }
  return me?.role === "STAFF" && resolve(overrides.staff_can_delete_revenue_reports_override, settings.staff_can_delete_revenue_reports);
}

export function canManageTeam(me?: MeResponse | null): boolean {
  const settings = getOrganizationSettings(me);
  const overrides = getMembershipPermissionOverrides(me);
  return me?.role === "ADMIN" || (me?.role === "MANAGER" && resolve(overrides.manager_can_manage_team_override, settings.manager_can_manage_team));
}

export function canAccessNotes(me?: MeResponse | null): boolean {
  const settings = getOrganizationSettings(me);
  const overrides = getMembershipPermissionOverrides(me);
  return me?.role === "ADMIN" || (me?.role === "MANAGER" && resolve(overrides.manager_can_access_notes_override, settings.manager_can_access_notes));
}

export function canAccessInventory(me?: MeResponse | null): boolean {
  const settings = getOrganizationSettings(me);
  const overrides = getMembershipPermissionOverrides(me);
  return me?.role === "ADMIN" || (me?.role === "MANAGER" && resolve(overrides.manager_can_access_inventory_override, settings.manager_can_access_inventory));
}

export function canViewPayroll(me?: MeResponse | null): boolean {
  const settings = getOrganizationSettings(me);
  const overrides = getMembershipPermissionOverrides(me);
  return me?.role === "ADMIN" || (me?.role === "MANAGER" && resolve(overrides.manager_can_view_payroll_override, settings.manager_can_view_payroll));
}

export function canManageBusinessSettings(me?: MeResponse | null): boolean {
  const settings = getOrganizationSettings(me);
  const overrides = getMembershipPermissionOverrides(me);
  return me?.role === "ADMIN" || (me?.role === "MANAGER" && resolve(overrides.manager_can_manage_business_settings_override, settings.manager_can_manage_business_settings));
}
