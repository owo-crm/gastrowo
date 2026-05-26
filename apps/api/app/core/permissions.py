from __future__ import annotations

from app.models import Organization, OrganizationMembership, RoleEnum

PERMISSION_OVERRIDE_FIELDS = (
    "staff_can_submit_revenue_reports_override",
    "staff_can_delete_revenue_reports_override",
    "manager_can_submit_revenue_reports_override",
    "manager_can_delete_revenue_reports_override",
    "manager_can_view_full_dashboard_override",
    "manager_can_view_payroll_override",
    "manager_can_manage_team_override",
    "manager_can_manage_business_settings_override",
    "manager_can_access_notes_override",
    "manager_can_access_inventory_override",
)


def membership_permission_overrides(membership: OrganizationMembership) -> dict[str, bool | None]:
    return {field: getattr(membership, field) for field in PERMISSION_OVERRIDE_FIELDS}


def _resolve(override: bool | None, fallback: bool) -> bool:
    return fallback if override is None else override


def can_submit_revenue_reports(membership: OrganizationMembership, organization: Organization) -> bool:
    if membership.role == RoleEnum.ADMIN:
        return True
    if membership.role == RoleEnum.MANAGER:
        return _resolve(membership.manager_can_submit_revenue_reports_override, organization.manager_can_submit_revenue_reports)
    if membership.role == RoleEnum.STAFF:
        return _resolve(membership.staff_can_submit_revenue_reports_override, organization.staff_can_submit_revenue_reports)
    return False


def can_delete_revenue_reports(membership: OrganizationMembership, organization: Organization) -> bool:
    if membership.role == RoleEnum.ADMIN:
        return True
    if membership.role == RoleEnum.MANAGER:
        return _resolve(membership.manager_can_delete_revenue_reports_override, organization.manager_can_delete_revenue_reports)
    if membership.role == RoleEnum.STAFF:
        return _resolve(membership.staff_can_delete_revenue_reports_override, organization.staff_can_delete_revenue_reports)
    return False


def can_view_full_dashboard(membership: OrganizationMembership, organization: Organization) -> bool:
    if membership.role == RoleEnum.ADMIN:
        return True
    if membership.role == RoleEnum.MANAGER:
        return _resolve(membership.manager_can_view_full_dashboard_override, organization.manager_can_view_full_dashboard)
    return False


def can_view_payroll(membership: OrganizationMembership, organization: Organization) -> bool:
    if membership.role == RoleEnum.ADMIN:
        return True
    if membership.role == RoleEnum.MANAGER:
        return _resolve(membership.manager_can_view_payroll_override, organization.manager_can_view_payroll)
    return False


def can_manage_team(membership: OrganizationMembership, organization: Organization) -> bool:
    if membership.role == RoleEnum.ADMIN:
        return True
    if membership.role == RoleEnum.MANAGER:
        return _resolve(membership.manager_can_manage_team_override, organization.manager_can_manage_team)
    return False


def can_manage_business_settings(membership: OrganizationMembership, organization: Organization) -> bool:
    if membership.role == RoleEnum.ADMIN:
        return True
    if membership.role == RoleEnum.MANAGER:
        return _resolve(
            membership.manager_can_manage_business_settings_override,
            organization.manager_can_manage_business_settings,
        )
    return False


def can_access_notes(membership: OrganizationMembership, organization: Organization) -> bool:
    if membership.role == RoleEnum.ADMIN:
        return True
    if membership.role == RoleEnum.MANAGER:
        return _resolve(membership.manager_can_access_notes_override, organization.manager_can_access_notes)
    return False


def can_access_inventory(membership: OrganizationMembership, organization: Organization) -> bool:
    if membership.role == RoleEnum.ADMIN:
        return True
    if membership.role == RoleEnum.MANAGER:
        return _resolve(membership.manager_can_access_inventory_override, organization.manager_can_access_inventory)
    return False
