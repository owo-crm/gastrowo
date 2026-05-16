"""add shift end and timesheets

Revision ID: 20260422_0006
Revises: 20260421_0005
Create Date: 2026-04-22 19:10:00
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "20260422_0006"
down_revision = "20260421_0005"
branch_labels = None
depends_on = None


def _table_exists(inspector: sa.Inspector, name: str) -> bool:
    return name in inspector.get_table_names()


def _column_exists(inspector: sa.Inspector, table_name: str, column_name: str) -> bool:
    return column_name in {column["name"] for column in inspector.get_columns(table_name)}


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if _table_exists(inspector, "assignments") and not _column_exists(inspector, "assignments", "ended_at"):
        op.add_column("assignments", sa.Column("ended_at", sa.DateTime(timezone=True), nullable=True))

    if bind.dialect.name == "postgresql":
        op.execute("ALTER TYPE assignmentstatusenum ADD VALUE IF NOT EXISTS 'COMPLETED'")

    inspector = sa.inspect(bind)
    if not _table_exists(inspector, "timesheets"):
        op.create_table(
            "timesheets",
            sa.Column("id", sa.Uuid(), primary_key=True, nullable=False),
            sa.Column("organization_id", sa.Uuid(), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False),
            sa.Column("user_id", sa.Uuid(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
            sa.Column("shift_id", sa.Uuid(), sa.ForeignKey("shifts.id", ondelete="SET NULL"), nullable=True),
            sa.Column("work_date", sa.Date(), nullable=False),
            sa.Column("arrived_at", sa.Time(), nullable=False),
            sa.Column("left_at", sa.Time(), nullable=False),
            sa.Column("note", sa.Text(), nullable=True),
            sa.Column("is_restricted_entry", sa.Boolean(), nullable=False, server_default=sa.false()),
            sa.Column(
                "status",
                sa.Enum("PENDING", "APPROVED", "REJECTED", "CORRECTED", name="timesheetstatusenum"),
                nullable=False,
                server_default="PENDING",
            ),
            sa.Column("review_note", sa.Text(), nullable=True),
            sa.Column("reviewed_by", sa.Uuid(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
            sa.Column("reviewed_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        )
        op.create_index("ix_timesheets_organization_id", "timesheets", ["organization_id"], unique=False)
        op.create_index("ix_timesheets_user_id", "timesheets", ["user_id"], unique=False)
        op.create_index("ix_timesheets_shift_id", "timesheets", ["shift_id"], unique=False)
        op.create_index("ix_timesheets_work_date", "timesheets", ["work_date"], unique=False)
        op.create_index("ix_timesheets_status", "timesheets", ["status"], unique=False)
        op.create_index("ix_timesheets_is_restricted_entry", "timesheets", ["is_restricted_entry"], unique=False)


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if _table_exists(inspector, "timesheets"):
        indexes = {index["name"] for index in inspector.get_indexes("timesheets")}
        for index_name in (
            "ix_timesheets_organization_id",
            "ix_timesheets_user_id",
            "ix_timesheets_shift_id",
            "ix_timesheets_work_date",
            "ix_timesheets_status",
            "ix_timesheets_is_restricted_entry",
        ):
            if index_name in indexes:
                op.drop_index(index_name, table_name="timesheets")
        op.drop_table("timesheets")

    inspector = sa.inspect(bind)
    if _table_exists(inspector, "assignments") and _column_exists(inspector, "assignments", "ended_at"):
        op.drop_column("assignments", "ended_at")
