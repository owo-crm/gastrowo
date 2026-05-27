from __future__ import annotations

from datetime import UTC, datetime
from enum import Enum
import hashlib
import secrets
import uuid

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    Enum as SqlEnum,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
    Time,
    UniqueConstraint,
    Uuid,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    pass


class RoleEnum(str, Enum):
    ADMIN = "ADMIN"
    MANAGER = "MANAGER"
    STAFF = "STAFF"


class TaskStatusEnum(str, Enum):
    PENDING = "pending"
    DONE = "done"


class ShiftSourceEnum(str, Enum):
    MANUAL = "manual"
    AUTO = "auto"


class AssignmentStatusEnum(str, Enum):
    ASSIGNED = "assigned"
    IN_SHIFT = "in_shift"
    COMPLETED = "completed"


class TimesheetStatusEnum(str, Enum):
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"
    CORRECTED = "corrected"


class ShiftRequestStatusEnum(str, Enum):
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"
    CANCELLED = "cancelled"


class ShiftRequestTypeEnum(str, Enum):
    PICKUP = "pickup"
    SWAP = "swap"


class OtpPurposeEnum(str, Enum):
    LOGIN = "login"
    OWNER_SIGNUP = "owner_signup"
    WORKER_SIGNUP = "worker_signup"
    INVITE_JOIN = "invite_join"


class NotificationTypeEnum(str, Enum):
    GENERAL = "general"
    SCHEDULE = "schedule"
    TASK = "task"
    REPORT = "report"
    SHIFT_REQUEST = "shift_request"
    TIMESHEET = "timesheet"
    TEAM = "team"
    BILLING = "billing"


class SubscriptionPlanEnum(str, Enum):
    FREE = "free"
    PRO = "pro"
    BUSINESS = "business"
    ENTERPRISE = "enterprise"


class SubscriptionStatusEnum(str, Enum):
    TRIALING = "trialing"
    ACTIVE = "active"
    PAST_DUE = "past_due"
    CANCELED = "canceled"
    EXPIRED = "expired"


def enum_values(enum_cls: type[Enum]) -> list[str]:
    return [str(item.value) for item in enum_cls]


def generate_legacy_public_uid() -> str:
    return f"WD{uuid.uuid4().hex[:10].upper()}"


def generate_auth_session_token() -> str:
    return secrets.token_urlsafe(48)


def hash_auth_session_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    public_uid: Mapped[str] = mapped_column(String(32), unique=True, index=True, default=generate_legacy_public_uid)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    full_name: Mapped[str] = mapped_column(String(120))
    avatar_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    password_hash: Mapped[str] = mapped_column(String(255), default="")
    onboarding_source: Mapped[str | None] = mapped_column(String(80), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(UTC))


class Organization(Base):
    __tablename__ = "organizations"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(160), unique=True)
    staff_can_submit_revenue_reports: Mapped[bool] = mapped_column(Boolean, default=False)
    staff_can_delete_revenue_reports: Mapped[bool] = mapped_column(Boolean, default=False)
    manager_can_submit_revenue_reports: Mapped[bool] = mapped_column(Boolean, default=True)
    manager_can_delete_revenue_reports: Mapped[bool] = mapped_column(Boolean, default=True)
    manager_can_view_full_dashboard: Mapped[bool] = mapped_column(Boolean, default=False)
    manager_can_view_payroll: Mapped[bool] = mapped_column(Boolean, default=False)
    manager_can_manage_team: Mapped[bool] = mapped_column(Boolean, default=True)
    manager_can_manage_business_settings: Mapped[bool] = mapped_column(Boolean, default=False)
    manager_can_access_notes: Mapped[bool] = mapped_column(Boolean, default=True)
    manager_can_access_inventory: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(UTC))


class OrganizationSubscription(Base):
    __tablename__ = "organization_subscriptions"
    __table_args__ = (UniqueConstraint("organization_id", name="uq_org_subscription_organization"),)

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("organizations.id", ondelete="CASCADE"), index=True)
    plan: Mapped[SubscriptionPlanEnum] = mapped_column(
        SqlEnum(SubscriptionPlanEnum, values_callable=enum_values, native_enum=False),
        default=SubscriptionPlanEnum.FREE,
    )
    status: Mapped[SubscriptionStatusEnum] = mapped_column(
        SqlEnum(SubscriptionStatusEnum, values_callable=enum_values, native_enum=False),
        default=SubscriptionStatusEnum.ACTIVE,
    )
    billing_cycle: Mapped[str] = mapped_column(String(16), default="monthly")
    trial_ends_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    current_period_ends_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    stripe_customer_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    stripe_subscription_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(UTC))
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
    )


class OrganizationMembership(Base):
    __tablename__ = "organization_memberships"
    __table_args__ = (
        UniqueConstraint("organization_id", "user_id", name="uq_org_user"),
        UniqueConstraint("user_id", name="uq_org_membership_user_unique"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("organizations.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("users.id", ondelete="CASCADE"), index=True)
    role: Mapped[RoleEnum] = mapped_column(SqlEnum(RoleEnum), index=True)
    max_hours_per_week: Mapped[int] = mapped_column(Integer, default=40)
    staff_position: Mapped[str | None] = mapped_column(String(80), nullable=True)
    staff_can_submit_revenue_reports_override: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    staff_can_delete_revenue_reports_override: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    manager_can_submit_revenue_reports_override: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    manager_can_delete_revenue_reports_override: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    manager_can_view_full_dashboard_override: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    manager_can_view_payroll_override: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    manager_can_manage_team_override: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    manager_can_manage_business_settings_override: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    manager_can_access_notes_override: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    manager_can_access_inventory_override: Mapped[bool | None] = mapped_column(Boolean, nullable=True)

    organization: Mapped[Organization] = relationship()
    user: Mapped[User] = relationship()


class Location(Base):
    __tablename__ = "locations"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("organizations.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(160))
    timezone: Mapped[str] = mapped_column(String(64), default="Europe/Warsaw")


class LocationMembership(Base):
    __tablename__ = "location_memberships"
    __table_args__ = (UniqueConstraint("location_id", "user_id", name="uq_location_user"),)

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    location_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("locations.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("users.id", ondelete="CASCADE"), index=True)
    hourly_rate_pln: Mapped[float] = mapped_column(Numeric(10, 2), default=0)
    priority: Mapped[int] = mapped_column(Integer, default=3)


class AvailabilityWeek(Base):
    __tablename__ = "availability_weeks"
    __table_args__ = (UniqueConstraint("organization_id", "user_id", "week_start", name="uq_org_user_week"),)

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("organizations.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("users.id", ondelete="CASCADE"), index=True)
    week_start: Mapped[datetime.date] = mapped_column(Date, index=True)
    desired_hours: Mapped[int] = mapped_column(Integer, default=40)
    submitted_by: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    approved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    approved_by: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    locked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    locked_by: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)


class AvailabilitySlot(Base):
    __tablename__ = "availability_slots"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    week_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("availability_weeks.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("users.id", ondelete="CASCADE"), index=True)
    day_of_week: Mapped[int] = mapped_column(Integer, index=True)
    start_time: Mapped[datetime.time] = mapped_column(Time)
    end_time: Mapped[datetime.time] = mapped_column(Time)
    is_available: Mapped[bool] = mapped_column(Boolean, default=True)


class ShiftTemplate(Base):
    __tablename__ = "shift_templates"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("organizations.id", ondelete="CASCADE"), index=True)
    location_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("locations.id", ondelete="CASCADE"), index=True)
    day_of_week: Mapped[int] = mapped_column(Integer, index=True)
    template_name: Mapped[str] = mapped_column(String(120), default="Default template")
    start_time: Mapped[datetime.time] = mapped_column(Time)
    end_time: Mapped[datetime.time] = mapped_column(Time)
    required_role: Mapped[RoleEnum] = mapped_column(SqlEnum(RoleEnum), index=True)
    staff_position: Mapped[str | None] = mapped_column(String(80), nullable=True)
    required_count: Mapped[int] = mapped_column(Integer, default=1)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    usage_count: Mapped[int] = mapped_column(Integer, default=0)
    last_used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class ScheduleWeeklyOverride(Base):
    __tablename__ = "schedule_weekly_overrides"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("organizations.id", ondelete="CASCADE"), index=True)
    week_start: Mapped[datetime.date] = mapped_column(Date, index=True)
    source_template_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("shift_templates.id", ondelete="SET NULL"), index=True, nullable=True
    )
    location_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("locations.id", ondelete="CASCADE"), index=True)
    day_of_week: Mapped[int] = mapped_column(Integer, index=True)
    start_time: Mapped[datetime.time] = mapped_column(Time)
    end_time: Mapped[datetime.time] = mapped_column(Time)
    required_role: Mapped[RoleEnum] = mapped_column(SqlEnum(RoleEnum), index=True)
    staff_position: Mapped[str | None] = mapped_column(String(80), nullable=True)
    required_count: Mapped[int] = mapped_column(Integer, default=1)
    is_deleted: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    assigned_user_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_by: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(UTC))
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
    )


class PositionCatalog(Base):
    __tablename__ = "position_catalog"
    __table_args__ = (UniqueConstraint("organization_id", "name", name="uq_position_catalog_org_name"),)

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("organizations.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(80))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(UTC))


class Shift(Base):
    __tablename__ = "shifts"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("organizations.id", ondelete="CASCADE"), index=True)
    location_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("locations.id", ondelete="CASCADE"), index=True)
    date: Mapped[datetime.date] = mapped_column(Date, index=True)
    start_time: Mapped[datetime.time] = mapped_column(Time)
    end_time: Mapped[datetime.time] = mapped_column(Time)
    required_role: Mapped[RoleEnum] = mapped_column(SqlEnum(RoleEnum), index=True)
    staff_position: Mapped[str | None] = mapped_column(String(80), nullable=True)
    required_count: Mapped[int] = mapped_column(Integer, default=1)
    source: Mapped[ShiftSourceEnum] = mapped_column(SqlEnum(ShiftSourceEnum), default=ShiftSourceEnum.MANUAL)
    created_by: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)


class Assignment(Base):
    __tablename__ = "assignments"
    __table_args__ = (UniqueConstraint("shift_id", "user_id", name="uq_shift_user"),)

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    shift_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("shifts.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("users.id", ondelete="CASCADE"), index=True)
    status: Mapped[AssignmentStatusEnum] = mapped_column(SqlEnum(AssignmentStatusEnum), default=AssignmentStatusEnum.ASSIGNED)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    override_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    overridden_by: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    overridden_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class ShiftRequest(Base):
    __tablename__ = "shift_requests"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("organizations.id", ondelete="CASCADE"), index=True)
    shift_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("shifts.id", ondelete="CASCADE"), index=True)
    requester_user_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("users.id", ondelete="CASCADE"), index=True)
    request_type: Mapped[ShiftRequestTypeEnum] = mapped_column(SqlEnum(ShiftRequestTypeEnum), index=True)
    status: Mapped[ShiftRequestStatusEnum] = mapped_column(SqlEnum(ShiftRequestStatusEnum), default=ShiftRequestStatusEnum.PENDING, index=True)
    requester_assignment_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("assignments.id", ondelete="SET NULL"), nullable=True
    )
    target_assignment_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("assignments.id", ondelete="SET NULL"), nullable=True
    )
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    resolved_by: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(UTC))
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class Timesheet(Base):
    __tablename__ = "timesheets"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("organizations.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("users.id", ondelete="CASCADE"), index=True)
    shift_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("shifts.id", ondelete="SET NULL"), nullable=True, index=True)
    work_date: Mapped[datetime.date] = mapped_column(Date, index=True)
    arrived_at: Mapped[datetime.time] = mapped_column(Time)
    left_at: Mapped[datetime.time] = mapped_column(Time)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_restricted_entry: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    status: Mapped[TimesheetStatusEnum] = mapped_column(SqlEnum(TimesheetStatusEnum), default=TimesheetStatusEnum.PENDING, index=True)
    review_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    reviewed_by: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(UTC))
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
    )


class Task(Base):
    __tablename__ = "tasks"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("organizations.id", ondelete="CASCADE"), index=True)
    location_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("locations.id", ondelete="SET NULL"), nullable=True)
    title: Mapped[str] = mapped_column(String(255))
    description: Mapped[str] = mapped_column(Text, default="")
    assigned_to: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("users.id", ondelete="CASCADE"), index=True)
    created_by: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    status: Mapped[TaskStatusEnum] = mapped_column(SqlEnum(TaskStatusEnum), default=TaskStatusEnum.PENDING, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(UTC))
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class TaskPhoto(Base):
    __tablename__ = "task_photos"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    task_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("tasks.id", ondelete="CASCADE"), index=True)
    photo_url: Mapped[str] = mapped_column(String(512))
    uploaded_by: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(UTC))


class RevenueReport(Base):
    __tablename__ = "revenue_reports"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("organizations.id", ondelete="CASCADE"), index=True)
    location_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("locations.id", ondelete="CASCADE"), index=True)
    report_date: Mapped[datetime.date] = mapped_column(Date, index=True)
    revenue: Mapped[float] = mapped_column(Numeric(12, 2))
    currency: Mapped[str] = mapped_column(String(8), default="PLN")
    photo_url: Mapped[str | None] = mapped_column(String(512), nullable=True)
    created_by: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(UTC))


class InAppNotification(Base):
    __tablename__ = "in_app_notifications"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("organizations.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("users.id", ondelete="CASCADE"), index=True)
    type: Mapped[NotificationTypeEnum] = mapped_column(SqlEnum(NotificationTypeEnum), default=NotificationTypeEnum.GENERAL, index=True)
    title: Mapped[str] = mapped_column(String(200))
    body: Mapped[str] = mapped_column(Text)
    action_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    entity_kind: Mapped[str | None] = mapped_column(String(80), nullable=True)
    entity_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(UTC))


class AuthSession(Base):
    __tablename__ = "auth_sessions"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("users.id", ondelete="CASCADE"), index=True)
    organization_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("organizations.id", ondelete="CASCADE"), nullable=True, index=True)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    label: Mapped[str | None] = mapped_column(String(120), nullable=True)
    last_seen_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(UTC))
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(UTC))


class InviteToken(Base):
    __tablename__ = "invite_tokens"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("organizations.id", ondelete="CASCADE"), index=True)
    email: Mapped[str] = mapped_column(String(255), index=True)
    role: Mapped[RoleEnum] = mapped_column(SqlEnum(RoleEnum), index=True)
    token: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    location_ids_csv: Mapped[str | None] = mapped_column(Text, nullable=True)
    invited_by: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("users.id", ondelete="CASCADE"), index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    accepted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class OtpChallenge(Base):
    __tablename__ = "otp_challenges"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    email: Mapped[str] = mapped_column(String(255), index=True)
    purpose: Mapped[OtpPurposeEnum] = mapped_column(SqlEnum(OtpPurposeEnum), index=True)
    code: Mapped[str] = mapped_column(String(6))
    invite_token: Mapped[str | None] = mapped_column(String(255), nullable=True, index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    consumed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(UTC))
