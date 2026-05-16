import type { MeResponse, OrganizationSettings } from "@/lib/types";

const defaultSettings: OrganizationSettings = {
  staff_can_submit_revenue_reports: false,
  manager_can_view_full_dashboard: false,
  manager_can_view_payroll: false,
  manager_can_manage_team: true,
  manager_can_manage_business_settings: false,
  manager_can_access_notes: true,
  manager_can_access_inventory: true,
};

export function getOrganizationSettings(me?: MeResponse | null): OrganizationSettings {
  return me?.organization_settings ?? defaultSettings;
}

export function canViewOverview(me?: MeResponse | null): boolean {
  const settings = getOrganizationSettings(me);
  return me?.role === "ADMIN" || (me?.role === "MANAGER" && settings.manager_can_view_full_dashboard);
}

export function canAccessReport(me?: MeResponse | null): boolean {
  const settings = getOrganizationSettings(me);
  return me?.role === "MANAGER" || (me?.role === "STAFF" && settings.staff_can_submit_revenue_reports);
}

export function canManageTeam(me?: MeResponse | null): boolean {
  const settings = getOrganizationSettings(me);
  return me?.role === "ADMIN" || (me?.role === "MANAGER" && settings.manager_can_manage_team);
}

export function canAccessNotes(me?: MeResponse | null): boolean {
  const settings = getOrganizationSettings(me);
  return me?.role === "ADMIN" || (me?.role === "MANAGER" && settings.manager_can_access_notes);
}

export function canAccessInventory(me?: MeResponse | null): boolean {
  const settings = getOrganizationSettings(me);
  return me?.role === "ADMIN" || (me?.role === "MANAGER" && settings.manager_can_access_inventory);
}

export function canViewPayroll(me?: MeResponse | null): boolean {
  const settings = getOrganizationSettings(me);
  return me?.role === "ADMIN" || (me?.role === "MANAGER" && settings.manager_can_view_payroll);
}

export function canManageBusinessSettings(me?: MeResponse | null): boolean {
  const settings = getOrganizationSettings(me);
  return me?.role === "ADMIN" || (me?.role === "MANAGER" && settings.manager_can_manage_business_settings);
}
