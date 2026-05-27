from __future__ import annotations

import uuid

from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import settings
from app.models import Base

engine = create_engine(settings.database_url, pool_pre_ping=True)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, expire_on_commit=False)


def get_db() -> Session:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db() -> None:
    Base.metadata.create_all(bind=engine)
    _ensure_runtime_schema_compat()


def _ensure_runtime_schema_compat() -> None:
    with engine.begin() as connection:
        inspector = inspect(connection)
        tables = set(inspector.get_table_names())

        # Backward compatibility: migrate old OWNER role values to ADMIN.
        # Note: Skip these updates if the enum no longer contains OWNER value
        # PostgreSQL will reject the update if the enum value doesn't exist
        # Use separate transactions for each operation to avoid "transaction aborted" errors
        def safe_execute(sql: str) -> None:
            try:
                with engine.begin() as conn:
                    conn.execute(text(sql))
            except Exception:
                pass

        if "organization_memberships" in tables:
            safe_execute("UPDATE organization_memberships SET role = 'ADMIN' WHERE role = 'OWNER'")
        if "invite_tokens" in tables:
            safe_execute("UPDATE invite_tokens SET role = 'ADMIN' WHERE role = 'OWNER'")
        if "shift_templates" in tables:
            safe_execute("UPDATE shift_templates SET required_role = 'ADMIN' WHERE required_role = 'OWNER'")
        if "shifts" in tables:
            safe_execute("UPDATE shifts SET required_role = 'ADMIN' WHERE required_role = 'OWNER'")
        if "schedule_weekly_overrides" in tables:
            safe_execute("UPDATE schedule_weekly_overrides SET required_role = 'ADMIN' WHERE required_role = 'OWNER'")

        if "shift_templates" in tables:
            template_columns = {column["name"] for column in inspector.get_columns("shift_templates")}
            if "template_name" not in template_columns:
                connection.execute(text("ALTER TABLE shift_templates ADD COLUMN template_name VARCHAR(120)"))
            if "staff_position" not in template_columns:
                connection.execute(text("ALTER TABLE shift_templates ADD COLUMN staff_position VARCHAR(80)"))
            connection.execute(text("UPDATE shift_templates SET template_name = 'Default template' WHERE template_name IS NULL OR TRIM(template_name) = ''"))
            connection.execute(
                text(
                    "UPDATE shift_templates SET staff_position = :position "
                    "WHERE required_role = :role AND (staff_position IS NULL OR TRIM(staff_position) = '')"
                ),
                {"position": "Cook", "role": "STAFF"},
            )
            connection.execute(
                text("UPDATE shift_templates SET staff_position = 'Cook' WHERE required_role = :role AND staff_position = 'Staff'"),
                {"role": "STAFF"},
            )

        if "users" in tables:
            user_columns = {column["name"] for column in inspector.get_columns("users")}
            if "public_uid" not in user_columns:
                connection.execute(text("ALTER TABLE users ADD COLUMN public_uid VARCHAR(32)"))
            existing_uids = {
                row[0]
                for row in connection.execute(text("SELECT public_uid FROM users WHERE public_uid IS NOT NULL AND TRIM(public_uid) <> ''"))
                if row[0]
            }
            user_rows = connection.execute(text("SELECT id FROM users WHERE public_uid IS NULL OR TRIM(public_uid) = ''")).fetchall()
            for row in user_rows:
                generated = f"WD{uuid.uuid4().hex[:10].upper()}"
                while generated in existing_uids:
                    generated = f"WD{uuid.uuid4().hex[:10].upper()}"
                existing_uids.add(generated)
                connection.execute(
                    text("UPDATE users SET public_uid = :public_uid WHERE id = :id"),
                    {"public_uid": generated, "id": row[0]},
                )
            connection.execute(
                text("CREATE UNIQUE INDEX IF NOT EXISTS ix_users_public_uid ON users (public_uid)")
            )
            if "avatar_url" not in user_columns:
                connection.execute(text("ALTER TABLE users ADD COLUMN avatar_url TEXT"))
            if "onboarding_source" not in user_columns:
                connection.execute(text("ALTER TABLE users ADD COLUMN onboarding_source VARCHAR(80)"))

        if "organizations" in tables:
            organization_columns = {column["name"] for column in inspector.get_columns("organizations")}
            if "staff_can_submit_revenue_reports" not in organization_columns:
                connection.execute(text("ALTER TABLE organizations ADD COLUMN staff_can_submit_revenue_reports BOOLEAN NOT NULL DEFAULT 0"))
            if "staff_can_delete_revenue_reports" not in organization_columns:
                connection.execute(text("ALTER TABLE organizations ADD COLUMN staff_can_delete_revenue_reports BOOLEAN NOT NULL DEFAULT 0"))
            if "manager_can_submit_revenue_reports" not in organization_columns:
                connection.execute(text("ALTER TABLE organizations ADD COLUMN manager_can_submit_revenue_reports BOOLEAN NOT NULL DEFAULT 1"))
            if "manager_can_delete_revenue_reports" not in organization_columns:
                connection.execute(text("ALTER TABLE organizations ADD COLUMN manager_can_delete_revenue_reports BOOLEAN NOT NULL DEFAULT 1"))
            if "manager_can_view_full_dashboard" not in organization_columns:
                connection.execute(text("ALTER TABLE organizations ADD COLUMN manager_can_view_full_dashboard BOOLEAN NOT NULL DEFAULT 0"))
            if "manager_can_view_payroll" not in organization_columns:
                connection.execute(text("ALTER TABLE organizations ADD COLUMN manager_can_view_payroll BOOLEAN NOT NULL DEFAULT 0"))
            if "manager_can_manage_team" not in organization_columns:
                connection.execute(text("ALTER TABLE organizations ADD COLUMN manager_can_manage_team BOOLEAN NOT NULL DEFAULT 1"))
            if "manager_can_manage_business_settings" not in organization_columns:
                connection.execute(text("ALTER TABLE organizations ADD COLUMN manager_can_manage_business_settings BOOLEAN NOT NULL DEFAULT 0"))
            if "manager_can_access_notes" not in organization_columns:
                connection.execute(text("ALTER TABLE organizations ADD COLUMN manager_can_access_notes BOOLEAN NOT NULL DEFAULT 1"))
            if "manager_can_access_inventory" not in organization_columns:
                connection.execute(text("ALTER TABLE organizations ADD COLUMN manager_can_access_inventory BOOLEAN NOT NULL DEFAULT 1"))

        if "organization_subscriptions" not in tables:
            connection.execute(
                text(
                    "CREATE TABLE organization_subscriptions ("
                    "id CHAR(32) PRIMARY KEY, "
                    "organization_id CHAR(32) NOT NULL UNIQUE, "
                    "plan VARCHAR(16) NOT NULL DEFAULT 'free', "
                    "status VARCHAR(16) NOT NULL DEFAULT 'active', "
                    "billing_cycle VARCHAR(16) NOT NULL DEFAULT 'monthly', "
                    "trial_ends_at TIMESTAMP, "
                    "current_period_ends_at TIMESTAMP, "
                    "stripe_customer_id VARCHAR(255), "
                    "stripe_subscription_id VARCHAR(255), "
                    "created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, "
                    "updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, "
                    "FOREIGN KEY(organization_id) REFERENCES organizations(id) ON DELETE CASCADE"
                    ")"
                )
            )
            connection.execute(text("CREATE INDEX ix_organization_subscriptions_organization_id ON organization_subscriptions (organization_id)"))

        if "in_app_notifications" in tables:
            notification_columns = {column["name"] for column in inspector.get_columns("in_app_notifications")}
            if "type" not in notification_columns:
                connection.execute(text("ALTER TABLE in_app_notifications ADD COLUMN type VARCHAR(32) NOT NULL DEFAULT 'general'"))
            if "action_url" not in notification_columns:
                connection.execute(text("ALTER TABLE in_app_notifications ADD COLUMN action_url VARCHAR(500)"))
            if "entity_kind" not in notification_columns:
                connection.execute(text("ALTER TABLE in_app_notifications ADD COLUMN entity_kind VARCHAR(80)"))
            if "entity_id" not in notification_columns:
                connection.execute(text("ALTER TABLE in_app_notifications ADD COLUMN entity_id VARCHAR(64)"))
            connection.execute(text("CREATE INDEX IF NOT EXISTS ix_in_app_notifications_type ON in_app_notifications (type)"))

        if "auth_sessions" not in tables:
            connection.execute(
                text(
                    "CREATE TABLE auth_sessions ("
                    "id CHAR(32) PRIMARY KEY, "
                    "user_id CHAR(32) NOT NULL, "
                    "organization_id CHAR(32), "
                    "token_hash VARCHAR(64) NOT NULL UNIQUE, "
                    "label VARCHAR(120), "
                    "last_seen_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, "
                    "expires_at TIMESTAMP NOT NULL, "
                    "created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, "
                    "FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE, "
                    "FOREIGN KEY(organization_id) REFERENCES organizations(id) ON DELETE CASCADE"
                    ")"
                )
            )
            connection.execute(text("CREATE INDEX ix_auth_sessions_user_id ON auth_sessions (user_id)"))
            connection.execute(text("CREATE INDEX ix_auth_sessions_organization_id ON auth_sessions (organization_id)"))
            connection.execute(text("CREATE INDEX ix_auth_sessions_token_hash ON auth_sessions (token_hash)"))
            connection.execute(text("CREATE INDEX ix_auth_sessions_expires_at ON auth_sessions (expires_at)"))

        if "organization_memberships" in tables:
            membership_columns = {column["name"] for column in inspector.get_columns("organization_memberships")}
            if "staff_position" not in membership_columns:
                connection.execute(text("ALTER TABLE organization_memberships ADD COLUMN staff_position VARCHAR(80)"))
            if "staff_can_submit_revenue_reports_override" not in membership_columns:
                connection.execute(text("ALTER TABLE organization_memberships ADD COLUMN staff_can_submit_revenue_reports_override BOOLEAN"))
            if "staff_can_delete_revenue_reports_override" not in membership_columns:
                connection.execute(text("ALTER TABLE organization_memberships ADD COLUMN staff_can_delete_revenue_reports_override BOOLEAN"))
            if "manager_can_submit_revenue_reports_override" not in membership_columns:
                connection.execute(text("ALTER TABLE organization_memberships ADD COLUMN manager_can_submit_revenue_reports_override BOOLEAN"))
            if "manager_can_delete_revenue_reports_override" not in membership_columns:
                connection.execute(text("ALTER TABLE organization_memberships ADD COLUMN manager_can_delete_revenue_reports_override BOOLEAN"))
            if "manager_can_view_full_dashboard_override" not in membership_columns:
                connection.execute(text("ALTER TABLE organization_memberships ADD COLUMN manager_can_view_full_dashboard_override BOOLEAN"))
            if "manager_can_view_payroll_override" not in membership_columns:
                connection.execute(text("ALTER TABLE organization_memberships ADD COLUMN manager_can_view_payroll_override BOOLEAN"))
            if "manager_can_manage_team_override" not in membership_columns:
                connection.execute(text("ALTER TABLE organization_memberships ADD COLUMN manager_can_manage_team_override BOOLEAN"))
            if "manager_can_manage_business_settings_override" not in membership_columns:
                connection.execute(text("ALTER TABLE organization_memberships ADD COLUMN manager_can_manage_business_settings_override BOOLEAN"))
            if "manager_can_access_notes_override" not in membership_columns:
                connection.execute(text("ALTER TABLE organization_memberships ADD COLUMN manager_can_access_notes_override BOOLEAN"))
            if "manager_can_access_inventory_override" not in membership_columns:
                connection.execute(text("ALTER TABLE organization_memberships ADD COLUMN manager_can_access_inventory_override BOOLEAN"))
            connection.execute(text("UPDATE organization_memberships SET staff_position = NULL WHERE staff_position = 'Staff'"))
            connection.execute(
                text(
                    "CREATE UNIQUE INDEX IF NOT EXISTS uq_organization_memberships_user_id_unique "
                    "ON organization_memberships (user_id)"
                )
            )

        if "availability_weeks" in tables:
            availability_week_columns = {column["name"] for column in inspector.get_columns("availability_weeks")}
            if "approved_at" not in availability_week_columns:
                connection.execute(text("ALTER TABLE availability_weeks ADD COLUMN approved_at TIMESTAMP"))
            if "approved_by" not in availability_week_columns:
                connection.execute(text("ALTER TABLE availability_weeks ADD COLUMN approved_by CHAR(32)"))

        if "position_catalog" not in tables:
            connection.execute(
                text(
                    "CREATE TABLE position_catalog ("
                    "id CHAR(32) PRIMARY KEY, "
                    "organization_id CHAR(32) NOT NULL, "
                    "name VARCHAR(80) NOT NULL, "
                    "is_active BOOLEAN NOT NULL DEFAULT 1, "
                    "created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, "
                    "CONSTRAINT uq_position_catalog_org_name UNIQUE (organization_id, name), "
                    "FOREIGN KEY(organization_id) REFERENCES organizations(id) ON DELETE CASCADE"
                    ")"
                )
            )
            connection.execute(text("CREATE INDEX ix_position_catalog_organization_id ON position_catalog (organization_id)"))
            connection.execute(text("CREATE INDEX ix_position_catalog_is_active ON position_catalog (is_active)"))

        if "schedule_weekly_overrides" not in tables:
            connection.execute(
                text(
                    "CREATE TABLE schedule_weekly_overrides ("
                    "id CHAR(32) PRIMARY KEY, "
                    "organization_id CHAR(32) NOT NULL, "
                    "week_start DATE NOT NULL, "
                    "source_template_id CHAR(32), "
                    "location_id CHAR(32) NOT NULL, "
                    "day_of_week INTEGER NOT NULL, "
                    "start_time TIME NOT NULL, "
                    "end_time TIME NOT NULL, "
                    "required_role VARCHAR(7) NOT NULL, "
                    "staff_position VARCHAR(80), "
                    "required_count INTEGER NOT NULL DEFAULT 1, "
                    "is_deleted BOOLEAN NOT NULL DEFAULT 0, "
                    "assigned_user_id CHAR(32), "
                    "created_by CHAR(32), "
                    "created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, "
                    "updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, "
                    "FOREIGN KEY(organization_id) REFERENCES organizations(id) ON DELETE CASCADE, "
                    "FOREIGN KEY(source_template_id) REFERENCES shift_templates(id) ON DELETE SET NULL, "
                    "FOREIGN KEY(location_id) REFERENCES locations(id) ON DELETE CASCADE, "
                    "FOREIGN KEY(assigned_user_id) REFERENCES users(id) ON DELETE SET NULL, "
                    "FOREIGN KEY(created_by) REFERENCES users(id) ON DELETE SET NULL"
                    ")"
                )
            )
            connection.execute(text("CREATE INDEX ix_schedule_weekly_overrides_org_week ON schedule_weekly_overrides (organization_id, week_start)"))
            connection.execute(text("CREATE INDEX ix_schedule_weekly_overrides_location_id ON schedule_weekly_overrides (location_id)"))
            connection.execute(text("CREATE INDEX ix_schedule_weekly_overrides_source_template_id ON schedule_weekly_overrides (source_template_id)"))
            connection.execute(text("CREATE INDEX ix_schedule_weekly_overrides_is_deleted ON schedule_weekly_overrides (is_deleted)"))
        elif "schedule_weekly_overrides" in tables:
            override_columns = {column["name"] for column in inspector.get_columns("schedule_weekly_overrides")}
            if "source_template_id" not in override_columns:
                connection.execute(text("ALTER TABLE schedule_weekly_overrides ADD COLUMN source_template_id CHAR(32)"))
                connection.execute(
                    text(
                        "CREATE INDEX IF NOT EXISTS ix_schedule_weekly_overrides_source_template_id "
                        "ON schedule_weekly_overrides (source_template_id)"
                    )
                )
            if "is_deleted" not in override_columns:
                connection.execute(text("ALTER TABLE schedule_weekly_overrides ADD COLUMN is_deleted BOOLEAN NOT NULL DEFAULT 0"))
                connection.execute(
                    text(
                        "CREATE INDEX IF NOT EXISTS ix_schedule_weekly_overrides_is_deleted "
                        "ON schedule_weekly_overrides (is_deleted)"
                    )
                )

        if "shifts" in tables:
            shift_columns = {column["name"] for column in inspector.get_columns("shifts")}
            if "staff_position" not in shift_columns:
                connection.execute(text("ALTER TABLE shifts ADD COLUMN staff_position VARCHAR(80)"))

        if "assignments" in tables:
            assignment_columns = {column["name"] for column in inspector.get_columns("assignments")}
            if "ended_at" not in assignment_columns:
                connection.execute(text("ALTER TABLE assignments ADD COLUMN ended_at TIMESTAMP"))

        if "timesheets" not in tables:
            connection.execute(
                text(
                    "CREATE TABLE timesheets ("
                    "id CHAR(32) PRIMARY KEY, "
                    "organization_id CHAR(32) NOT NULL, "
                    "user_id CHAR(32) NOT NULL, "
                    "shift_id CHAR(32), "
                    "work_date DATE NOT NULL, "
                    "arrived_at TIME NOT NULL, "
                    "left_at TIME NOT NULL, "
                    "note TEXT, "
                    "is_restricted_entry BOOLEAN NOT NULL DEFAULT 0, "
                    "status VARCHAR(16) NOT NULL DEFAULT 'PENDING', "
                    "review_note TEXT, "
                    "reviewed_by CHAR(32), "
                    "reviewed_at TIMESTAMP, "
                    "created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, "
                    "updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, "
                    "FOREIGN KEY(organization_id) REFERENCES organizations(id) ON DELETE CASCADE, "
                    "FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE, "
                    "FOREIGN KEY(shift_id) REFERENCES shifts(id) ON DELETE SET NULL, "
                    "FOREIGN KEY(reviewed_by) REFERENCES users(id) ON DELETE SET NULL"
                    ")"
                )
            )
            connection.execute(text("CREATE INDEX ix_timesheets_organization_id ON timesheets (organization_id)"))
            connection.execute(text("CREATE INDEX ix_timesheets_user_id ON timesheets (user_id)"))
            connection.execute(text("CREATE INDEX ix_timesheets_shift_id ON timesheets (shift_id)"))
            connection.execute(text("CREATE INDEX ix_timesheets_work_date ON timesheets (work_date)"))
            connection.execute(text("CREATE INDEX ix_timesheets_status ON timesheets (status)"))
            connection.execute(text("CREATE INDEX ix_timesheets_is_restricted_entry ON timesheets (is_restricted_entry)"))

        if "otp_challenges" not in tables:
            connection.execute(
                text(
                    "CREATE TABLE otp_challenges ("
                    "id CHAR(32) PRIMARY KEY, "
                    "email VARCHAR(255) NOT NULL, "
                    "purpose VARCHAR(32) NOT NULL, "
                    "code VARCHAR(6) NOT NULL, "
                    "invite_token VARCHAR(255), "
                    "expires_at TIMESTAMP NOT NULL, "
                    "consumed_at TIMESTAMP, "
                    "created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP"
                    ")"
                )
            )
            connection.execute(text("CREATE INDEX ix_otp_challenges_email ON otp_challenges (email)"))
            connection.execute(text("CREATE INDEX ix_otp_challenges_purpose ON otp_challenges (purpose)"))
            connection.execute(text("CREATE INDEX ix_otp_challenges_invite_token ON otp_challenges (invite_token)"))
            connection.execute(text("CREATE INDEX ix_otp_challenges_expires_at ON otp_challenges (expires_at)"))

        organizations = connection.execute(text("SELECT id FROM organizations")).fetchall() if "organizations" in tables else []
        for (organization_id,) in organizations:
            subscription_exists = connection.execute(
                text("SELECT id FROM organization_subscriptions WHERE organization_id = :organization_id"),
                {"organization_id": organization_id},
            ).first()
            if subscription_exists is None:
                connection.execute(
                    text(
                        "INSERT INTO organization_subscriptions "
                        "(id, organization_id, plan, status, billing_cycle, created_at, updated_at) "
                        "VALUES (:id, :organization_id, 'free', 'active', 'monthly', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)"
                    ),
                    {"id": uuid.uuid4().hex, "organization_id": organization_id},
                )
            for name in ("Cook", "Bartender", "Waiter", "Manager"):
                exists = connection.execute(
                    text("SELECT id FROM position_catalog WHERE organization_id = :organization_id AND name = :name"),
                    {"organization_id": organization_id, "name": name},
                ).first()
                if exists is None:
                    connection.execute(
                        text(
                            "INSERT INTO position_catalog (id, organization_id, name, is_active, created_at) "
                            "VALUES (:id, :organization_id, :name, :is_active, CURRENT_TIMESTAMP)"
                        ),
                        {
                            "id": uuid.uuid4().hex,
                            "organization_id": organization_id,
                            "name": name,
                            "is_active": True,
                        },
                    )
            connection.execute(
                text("DELETE FROM position_catalog WHERE organization_id = :organization_id AND name = 'Staff'"),
                {"organization_id": organization_id},
            )
