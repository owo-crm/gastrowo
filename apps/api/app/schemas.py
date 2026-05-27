from __future__ import annotations

from datetime import date, datetime, time
from decimal import Decimal
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, EmailStr, Field, model_validator

from app.models import (
    AssignmentStatusEnum,
    NotificationTypeEnum,
    OtpPurposeEnum,
    RoleEnum,
    ShiftRequestStatusEnum,
    ShiftRequestTypeEnum,
    ShiftSourceEnum,
    SubscriptionPlanEnum,
    SubscriptionStatusEnum,
    TaskStatusEnum,
    TimesheetStatusEnum,
)


class APIModel(BaseModel):
    model_config = {"from_attributes": True}


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class AuthPayload(APIModel):
    access_token: str
    token_type: str = "bearer"


class MembershipOut(APIModel):
    organization_id: UUID
    role: RoleEnum
    max_hours_per_week: int
    staff_position: str | None = None
    staff_can_submit_revenue_reports_override: bool | None = None
    staff_can_delete_revenue_reports_override: bool | None = None
    manager_can_submit_revenue_reports_override: bool | None = None
    manager_can_delete_revenue_reports_override: bool | None = None
    manager_can_view_full_dashboard_override: bool | None = None
    manager_can_view_payroll_override: bool | None = None
    manager_can_manage_team_override: bool | None = None
    manager_can_manage_business_settings_override: bool | None = None
    manager_can_access_notes_override: bool | None = None
    manager_can_access_inventory_override: bool | None = None


class OrganizationSettingsOut(APIModel):
    staff_can_submit_revenue_reports: bool = False
    staff_can_delete_revenue_reports: bool = False
    manager_can_submit_revenue_reports: bool = True
    manager_can_delete_revenue_reports: bool = True
    manager_can_view_full_dashboard: bool = False
    manager_can_view_payroll: bool = False
    manager_can_manage_team: bool = True
    manager_can_manage_business_settings: bool = False
    manager_can_access_notes: bool = True
    manager_can_access_inventory: bool = True


class MeOut(APIModel):
    id: UUID
    email: EmailStr
    full_name: str
    avatar_url: str | None = None
    active_organization_id: UUID | None
    active_organization_name: str | None = None
    role: RoleEnum | None
    is_linked: bool
    memberships: list[MembershipOut]
    organization_settings: OrganizationSettingsOut | None = None
    subscription: "SubscriptionSummaryOut | None" = None


class OrganizationCreate(BaseModel):
    name: str = Field(min_length=2, max_length=160)


class OrganizationPatch(BaseModel):
    name: str = Field(min_length=2, max_length=160)


class OrganizationSettingsPatch(BaseModel):
    staff_can_submit_revenue_reports: bool
    staff_can_delete_revenue_reports: bool
    manager_can_submit_revenue_reports: bool
    manager_can_delete_revenue_reports: bool
    manager_can_view_full_dashboard: bool
    manager_can_view_payroll: bool
    manager_can_manage_team: bool
    manager_can_manage_business_settings: bool
    manager_can_access_notes: bool
    manager_can_access_inventory: bool


class MembershipPermissionOverridesOut(APIModel):
    staff_can_submit_revenue_reports_override: bool | None = None
    staff_can_delete_revenue_reports_override: bool | None = None
    manager_can_submit_revenue_reports_override: bool | None = None
    manager_can_delete_revenue_reports_override: bool | None = None
    manager_can_view_full_dashboard_override: bool | None = None
    manager_can_view_payroll_override: bool | None = None
    manager_can_manage_team_override: bool | None = None
    manager_can_manage_business_settings_override: bool | None = None
    manager_can_access_notes_override: bool | None = None
    manager_can_access_inventory_override: bool | None = None


class MembershipPermissionOverridesPatch(BaseModel):
    staff_can_submit_revenue_reports_override: bool | None = None
    staff_can_delete_revenue_reports_override: bool | None = None
    manager_can_submit_revenue_reports_override: bool | None = None
    manager_can_delete_revenue_reports_override: bool | None = None
    manager_can_view_full_dashboard_override: bool | None = None
    manager_can_view_payroll_override: bool | None = None
    manager_can_manage_team_override: bool | None = None
    manager_can_manage_business_settings_override: bool | None = None
    manager_can_access_notes_override: bool | None = None
    manager_can_access_inventory_override: bool | None = None


class LinkByEmailRequest(BaseModel):
    email: EmailStr
    name: str | None = Field(default=None, min_length=2, max_length=120)


class OtpSendRequest(BaseModel):
    email: EmailStr
    purpose: OtpPurposeEnum
    invite_token: str | None = Field(default=None, max_length=255)


class OtpSendResponse(APIModel):
    sent: bool
    expires_in_seconds: int
    debug_code: str | None = None


class OtpVerifyRequest(BaseModel):
    email: EmailStr
    code: str = Field(min_length=6, max_length=6)
    purpose: OtpPurposeEnum
    full_name: str | None = Field(default=None, min_length=2, max_length=120)
    invite_token: str | None = Field(default=None, max_length=255)


class OtpVerifyResponse(APIModel):
    access_token: str | None = None
    token_type: str = "bearer"
    status: str
    memberships: list[MembershipOut] = []
    active_organization_id: UUID | None = None
    role: RoleEnum | None = None
    verification_token: str | None = None


class SessionBootstrapResponse(APIModel):
    access_token: str
    token_type: str = "bearer"
    status: str
    memberships: list[MembershipOut]
    active_organization_id: UUID | None = None
    role: RoleEnum | None = None


class OwnerOnboardingCompleteRequest(BaseModel):
    verification_token: str
    full_name: str = Field(min_length=2, max_length=120)
    organization_name: str = Field(min_length=2, max_length=160)
    password: str = Field(min_length=8, max_length=128)
    source: str = Field(min_length=2, max_length=80)


class InviteJoinVerifyRequest(BaseModel):
    email: EmailStr
    code: str = Field(min_length=6, max_length=6)
    invite_token: str = Field(min_length=8, max_length=255)


class OrganizationOut(APIModel):
    id: UUID
    name: str


class SubscriptionSummaryOut(APIModel):
    plan: SubscriptionPlanEnum
    status: SubscriptionStatusEnum
    billing_cycle: str
    trial_ends_at: datetime | None = None
    current_period_ends_at: datetime | None = None
    active_members_count: int
    active_locations_count: int
    member_cap: int | None = None
    location_cap: int | None = None
    soft_limit_reached: bool = False


class NotificationOut(APIModel):
    id: UUID
    type: NotificationTypeEnum
    title: str
    body: str
    action_url: str | None = None
    entity_kind: str | None = None
    entity_id: str | None = None
    read_at: datetime | None
    created_at: datetime


class NotificationMarkReadRequest(BaseModel):
    ids: list[UUID] = Field(min_length=1)


class NotificationListOut(APIModel):
    items: list[NotificationOut]
    unread_count: int


class MemberRemovalImpactOut(APIModel):
    user_id: UUID
    full_name: str
    role: RoleEnum
    future_assignments_count: int
    pending_shift_requests_count: int
    location_count: int
    can_remove: bool
    blocking_reason: str | None = None


class MemberRemovalResultOut(MemberRemovalImpactOut):
    removed: bool


class LocationCreate(BaseModel):
    name: str = Field(min_length=2, max_length=160)
    timezone: str = Field(default="Europe/Warsaw", min_length=2, max_length=64)


class LocationPatch(BaseModel):
    name: str = Field(min_length=2, max_length=160)
    timezone: str = Field(min_length=2, max_length=64)
    manager_user_ids: list[UUID] = []


class LocationOut(APIModel):
    id: UUID
    name: str
    timezone: str
    manager_user_ids: list[UUID] = []
    manager_names: list[str] = []


class UserOut(APIModel):
    id: UUID
    email: EmailStr
    full_name: str
    avatar_url: str | None = None


class ProfilePatch(BaseModel):
    full_name: str = Field(min_length=2, max_length=120)
    avatar_url: str | None = Field(default=None, max_length=2_000_000)


class UserMembershipOut(APIModel):
    id: UUID
    email: EmailStr
    full_name: str
    role: RoleEnum
    max_hours_per_week: int
    staff_position: str | None = None


class StaffPositionPatch(BaseModel):
    staff_position: str = Field(min_length=2, max_length=80)

    @model_validator(mode="after")
    def validate_allowed_position(self):
        allowed = {"Cook", "Waiter", "Bartender", "Manager"}
        normalized = self.staff_position.strip()
        if normalized not in allowed:
            raise ValueError("staff_position must be one of: Cook, Waiter, Bartender, Manager")
        self.staff_position = normalized
        return self


class LocationMemberOut(APIModel):
    id: UUID
    email: EmailStr
    full_name: str
    role: RoleEnum
    staff_position: str | None = None
    max_hours_per_week: int
    hourly_rate_pln: Decimal
    priority: int
    permission_overrides: MembershipPermissionOverridesOut | None = None


class LocationMemberPatch(BaseModel):
    hourly_rate_pln: Decimal = Field(ge=0)
    priority: int = Field(ge=0, le=5)
    max_hours_per_week: int | None = Field(default=None, ge=1, le=120)


class WorkerSetupLocationItem(APIModel):
    location_id: UUID
    location_name: str
    priority: int
    hourly_rate_pln: Decimal


class WorkerSetupOut(APIModel):
    user_id: UUID
    full_name: str
    role: RoleEnum
    staff_position: str | None = None
    locations: list[WorkerSetupLocationItem]
    permission_overrides: MembershipPermissionOverridesOut


class WorkerSetupPatchItem(BaseModel):
    location_id: UUID
    priority: int = Field(ge=0, le=5)
    hourly_rate_pln: Decimal = Field(ge=0)


class WorkerSetupPatch(BaseModel):
    locations: list[WorkerSetupPatchItem] = Field(min_length=1)
    permission_overrides: MembershipPermissionOverridesPatch | None = None


class AvailabilitySlotInput(BaseModel):
    day_of_week: int = Field(ge=0, le=6)
    start_time: time
    end_time: time
    is_available: bool = True


class AvailabilityWeekUpsert(BaseModel):
    week_start: date
    desired_hours: int = Field(ge=0, le=120)
    user_id: UUID | None = None
    slots: list[AvailabilitySlotInput]


class AvailabilityWeekApprove(BaseModel):
    user_id: UUID


class AvailabilitySlotOut(APIModel):
    id: UUID
    day_of_week: int
    start_time: time
    end_time: time
    is_available: bool


class AvailabilityWeekOut(APIModel):
    id: UUID
    user_id: UUID
    week_start: date
    desired_hours: int
    approved_at: datetime | None
    approved_by: UUID | None
    locked_at: datetime | None
    locked_by: UUID | None
    slots: list[AvailabilitySlotOut]


class TeamAvailabilitySummaryRowOut(APIModel):
    user_id: UUID
    full_name: str
    desired_hours: int
    slots_count: int
    status: str
    slots: list[AvailabilitySlotOut] = []


class ShiftTemplateCreate(BaseModel):
    location_id: UUID
    day_of_week: int = Field(ge=0, le=6)
    template_name: str = Field(min_length=2, max_length=120)
    start_time: time
    end_time: time
    required_role: RoleEnum
    staff_position: str | None = Field(default=None, min_length=2, max_length=80)
    required_count: int = Field(ge=1, le=25)

    @model_validator(mode="after")
    def validate_template(self):
        if self.end_time <= self.start_time:
            raise ValueError("end_time must be later than start_time")
        if self.required_role == RoleEnum.STAFF and (self.staff_position is None or not self.staff_position.strip()):
            raise ValueError("staff_position is required when required_role is STAFF")
        if self.required_role != RoleEnum.STAFF:
            self.staff_position = None
        return self


class ShiftTemplateOut(APIModel):
    id: UUID
    location_id: UUID
    day_of_week: int
    template_name: str
    start_time: time
    end_time: time
    required_role: RoleEnum
    staff_position: str | None = None
    required_count: int
    usage_count: int


class ShiftTemplatePatch(BaseModel):
    day_of_week: int = Field(ge=0, le=6)
    template_name: str = Field(min_length=2, max_length=120)
    start_time: time
    end_time: time
    required_role: RoleEnum
    staff_position: str | None = Field(default=None, min_length=2, max_length=80)
    required_count: int = Field(ge=1, le=25)
    is_active: bool = True

    @model_validator(mode="after")
    def validate_template(self):
        if self.end_time <= self.start_time:
            raise ValueError("end_time must be later than start_time")
        if self.required_role == RoleEnum.STAFF and (self.staff_position is None or not self.staff_position.strip()):
            raise ValueError("staff_position is required when required_role is STAFF")
        if self.required_role != RoleEnum.STAFF:
            self.staff_position = None
        return self


class PositionCatalogCreate(BaseModel):
    name: str = Field(min_length=2, max_length=80)


class PositionCatalogOut(APIModel):
    id: UUID
    name: str
    is_active: bool


class ScheduleGenerateRequest(BaseModel):
    week_start: date
    location_id: UUID | None = None


class AssignmentOut(APIModel):
    id: UUID
    user_id: UUID
    status: AssignmentStatusEnum
    started_at: datetime | None
    ended_at: datetime | None = None
    override_reason: str | None = None
    overridden_by: UUID | None = None
    overridden_at: datetime | None = None


class ShiftOut(APIModel):
    id: UUID
    location_id: UUID
    date: date
    start_time: time
    end_time: time
    required_role: RoleEnum
    staff_position: str | None = None
    required_count: int
    source: ShiftSourceEnum
    assignments: list[AssignmentOut]


class AssignmentPatch(BaseModel):
    user_id: UUID
    override_reason: str | None = Field(default=None, min_length=3, max_length=1000)


class StaffShiftAssignmentOut(APIModel):
    id: UUID
    user_id: UUID
    user_name: str
    status: AssignmentStatusEnum


class StaffShiftCardOut(APIModel):
    shift_id: UUID
    location_id: UUID
    location_name: str
    date: date
    start_time: time
    end_time: time
    required_role: RoleEnum
    staff_position: str | None = None
    required_count: int
    assignment_count: int
    is_mine: bool
    can_request_pickup: bool
    assignments: list[StaffShiftAssignmentOut]


class StaffCalendarDayOut(APIModel):
    date: date
    day_of_week: int
    shifts: list[StaffShiftCardOut]


class ShiftRequestCreate(BaseModel):
    shift_id: UUID
    request_type: ShiftRequestTypeEnum
    requester_assignment_id: UUID | None = None
    target_assignment_id: UUID | None = None
    note: str | None = Field(default=None, max_length=1000)


class ShiftRequestPatch(BaseModel):
    action: str = Field(pattern="^(approve|reject|cancel)$")


class ShiftRequestOut(APIModel):
    id: UUID
    shift_id: UUID
    requester_user_id: UUID
    requester_name: str
    request_type: ShiftRequestTypeEnum
    status: ShiftRequestStatusEnum
    requester_assignment_id: UUID | None
    target_assignment_id: UUID | None
    note: str | None
    resolved_by: UUID | None
    created_at: datetime
    resolved_at: datetime | None


class SchedulePreviewAssignmentOut(BaseModel):
    shift_key: str
    template_id: UUID
    location_id: UUID
    location_name: str
    date: date
    start_time: time
    end_time: time
    required_role: RoleEnum
    user_id: UUID
    user_name: str
    priority: int
    assigned_hours_after: float
    cost_pln: Decimal


class SchedulePreviewOpenShiftOut(BaseModel):
    shift_key: str
    template_id: UUID
    location_id: UUID
    location_name: str
    date: date
    start_time: time
    end_time: time
    required_role: RoleEnum
    required_count: int
    assigned_count: int
    unfilled_count: int


class SchedulePreviewRejectedCandidateOut(BaseModel):
    shift_key: str
    template_id: UUID
    location_id: UUID
    date: date
    start_time: time
    end_time: time
    user_id: UUID
    user_name: str
    reasons: list[str]


class ScheduleLaborCostSummaryOut(BaseModel):
    total_pln: Decimal
    by_day: list[dict]
    by_location: list[dict]


class ScheduleFairnessRowOut(BaseModel):
    user_id: UUID
    user_name: str
    assigned_hours: float
    desired_hours: int
    desired_gap: float


class CoverageSummaryOut(BaseModel):
    total_slots: int
    filled_slots: int
    fill_rate_pct: float


class SchedulePreviewOut(BaseModel):
    created_shifts: int
    created_assignments: int
    assignments: list[SchedulePreviewAssignmentOut]
    open_shifts: list[SchedulePreviewOpenShiftOut]
    warnings: list[str]
    rejected_candidates: list[SchedulePreviewRejectedCandidateOut]
    labor_cost_summary: ScheduleLaborCostSummaryOut
    fairness_summary: list[ScheduleFairnessRowOut]
    coverage_summary: CoverageSummaryOut
    start_coverage_alerts: list[dict] = []
    apply_blocked: bool = False


class WeeklyShiftOverrideIn(BaseModel):
    id: UUID | None = None
    week_start: date
    source_template_id: UUID | None = None
    location_id: UUID
    day_of_week: int = Field(ge=0, le=6)
    start_time: time
    end_time: time
    required_role: RoleEnum
    staff_position: str | None = Field(default=None, min_length=2, max_length=80)
    required_count: int = Field(ge=0, le=25)
    is_deleted: bool = False
    assigned_user_id: UUID | None = None

    @model_validator(mode="after")
    def validate_override(self):
        if self.end_time <= self.start_time:
            raise ValueError("end_time must be later than start_time")
        if self.is_deleted:
            self.assigned_user_id = None
        elif self.required_count <= 0:
            raise ValueError("required_count must be greater than zero")
        if self.required_role == RoleEnum.STAFF and (self.staff_position is None or not self.staff_position.strip()):
            raise ValueError("staff_position is required when required_role is STAFF")
        if self.required_role != RoleEnum.STAFF:
            self.staff_position = None
        return self


class WeeklyShiftOverrideOut(APIModel):
    id: UUID
    week_start: date
    source_template_id: UUID | None = None
    location_id: UUID
    day_of_week: int
    start_time: time
    end_time: time
    required_role: RoleEnum
    staff_position: str | None
    required_count: int
    is_deleted: bool = False
    assigned_user_id: UUID | None


class WeeklyShiftOverrideBulkIn(BaseModel):
    week_start: date
    overrides: list[WeeklyShiftOverrideIn]


class SchedulePreviewEditPatch(BaseModel):
    week_start: date
    shift_key: str
    action: Literal["upsert", "delete", "create"] = "upsert"
    location_id: UUID | None = None
    day_of_week: int | None = Field(default=None, ge=0, le=6)
    start_time: time | None = None
    end_time: time | None = None
    required_role: RoleEnum | None = None
    staff_position: str | None = Field(default=None, min_length=2, max_length=80)
    required_count: int | None = Field(default=None, ge=1, le=25)
    assigned_user_id: UUID | None = None


class SchedulePreviewMaterializeRequest(BaseModel):
    week_start: date
    location_id: UUID


class PreviewCalendarCellOut(BaseModel):
    shift_key: str
    location_id: UUID
    location_name: str
    date: date
    day_of_week: int
    start_time: time
    end_time: time
    required_role: RoleEnum
    staff_position: str | None
    required_count: int
    assigned_users: list[dict]
    missing_count: int
    source: str


class PreviewCalendarRowOut(BaseModel):
    user_id: UUID
    user_name: str
    role: RoleEnum
    staff_position: str | None
    days: dict[str, list[PreviewCalendarCellOut]]


class SchedulePreviewCalendarOut(BaseModel):
    week_start: date
    rows: list[PreviewCalendarRowOut]
    open_shifts_by_day: dict[str, list[PreviewCalendarCellOut]]
    summary: CoverageSummaryOut


class TaskCreate(BaseModel):
    location_id: UUID | None = None
    title: str = Field(min_length=2, max_length=255)
    description: str = Field(default="", max_length=3000)
    assigned_to: UUID


class TaskPatch(BaseModel):
    status: TaskStatusEnum


class TaskPhotoCreate(BaseModel):
    photo_url: str = Field(min_length=4, max_length=512)


class TaskPhotoOut(APIModel):
    id: UUID
    photo_url: str
    uploaded_by: UUID | None


class TaskOut(APIModel):
    id: UUID
    location_id: UUID | None
    title: str
    description: str
    assigned_to: UUID
    created_by: UUID | None = None
    status: TaskStatusEnum
    created_at: datetime
    completed_at: datetime | None
    photos: list[TaskPhotoOut] = []


class RevenueReportCreate(BaseModel):
    location_id: UUID
    report_date: date
    revenue: Decimal = Field(ge=0)
    currency: str = Field(default="PLN", min_length=3, max_length=8)
    photo_url: str | None = Field(default=None, max_length=512)


class RevenueReportOut(APIModel):
    id: UUID
    location_id: UUID
    report_date: date
    revenue: Decimal
    currency: str
    photo_url: str | None


class DashboardOut(BaseModel):
    totals_by_location: list[dict]
    totals_by_day: list[dict]
    labor_cost_by_day: list[dict]
    labor_cost_by_location: list[dict]
    revenue_vs_labor: list[dict]
    photo_reports: list[dict]
    timesheets_summary: dict


class StartShiftResponse(BaseModel):
    assignment_id: UUID
    status: AssignmentStatusEnum
    started_at: datetime


class EndShiftResponse(BaseModel):
    assignment_id: UUID
    status: AssignmentStatusEnum
    ended_at: datetime


class TimesheetCreate(BaseModel):
    shift_id: UUID | None = None
    work_date: date | None = None
    arrived_at: time
    left_at: time
    note: str | None = Field(default=None, max_length=2000)

    @model_validator(mode="after")
    def validate_timesheet(self):
        if self.left_at <= self.arrived_at:
            raise ValueError("left_at must be later than arrived_at")
        if self.shift_id is None and self.work_date is None:
            raise ValueError("work_date is required when shift_id is not provided")
        return self


class TimesheetReviewAction(BaseModel):
    action: str = Field(pattern="^(approve|reject|correct)$")
    arrived_at: time | None = None
    left_at: time | None = None
    review_note: str | None = Field(default=None, max_length=2000)

    @model_validator(mode="after")
    def validate_review_action(self):
        if self.action == "correct":
            if self.arrived_at is None or self.left_at is None:
                raise ValueError("arrived_at and left_at are required for correction")
            if self.left_at <= self.arrived_at:
                raise ValueError("left_at must be later than arrived_at")
        return self


class TimesheetEntry(APIModel):
    id: UUID
    organization_id: UUID
    user_id: UUID
    shift_id: UUID | None
    work_date: date
    arrived_at: time
    left_at: time
    note: str | None
    is_restricted_entry: bool
    status: TimesheetStatusEnum
    review_note: str | None
    reviewed_by: UUID | None
    reviewed_at: datetime | None
    created_at: datetime
    updated_at: datetime


class NotificationOut(APIModel):
    id: UUID
    title: str
    body: str
    read_at: datetime | None
    created_at: datetime
