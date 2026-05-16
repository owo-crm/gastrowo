"""add staff position to organization memberships

Revision ID: 20260421_0004
Revises: 20260421_0003
Create Date: 2026-04-21 22:10:00
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "20260421_0004"
down_revision = "20260421_0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    columns = {column["name"] for column in inspector.get_columns("organization_memberships")}

    if "staff_position" not in columns:
        op.add_column("organization_memberships", sa.Column("staff_position", sa.String(length=80), nullable=True))

    bind.execute(
        sa.text(
            "UPDATE organization_memberships "
            "SET staff_position = :position "
            "WHERE role = :role AND (staff_position IS NULL OR TRIM(staff_position) = '')"
        ),
        {"position": "Staff", "role": "STAFF"},
    )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    columns = {column["name"] for column in inspector.get_columns("organization_memberships")}
    if "staff_position" in columns:
        op.drop_column("organization_memberships", "staff_position")

