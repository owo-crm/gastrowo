"""add template name/staff position and position catalog

Revision ID: 20260421_0005
Revises: 20260421_0004
Create Date: 2026-04-21 23:30:00
"""

from __future__ import annotations

import uuid
import sqlalchemy as sa
from alembic import op

revision = "20260421_0005"
down_revision = "20260421_0004"
branch_labels = None
depends_on = None


def _table_exists(inspector: sa.Inspector, name: str) -> bool:
    return name in inspector.get_table_names()


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    template_columns = {column["name"] for column in inspector.get_columns("shift_templates")}
    if "template_name" not in template_columns:
        op.add_column("shift_templates", sa.Column("template_name", sa.String(length=120), nullable=True))
    if "staff_position" not in template_columns:
        op.add_column("shift_templates", sa.Column("staff_position", sa.String(length=80), nullable=True))

    bind.execute(
        sa.text(
            "UPDATE shift_templates SET template_name = :name "
            "WHERE template_name IS NULL OR TRIM(template_name) = ''"
        ),
        {"name": "Default template"},
    )
    bind.execute(
        sa.text(
            "UPDATE shift_templates SET staff_position = :position "
            "WHERE required_role = :role AND (staff_position IS NULL OR TRIM(staff_position) = '')"
        ),
        {"position": "Staff", "role": "STAFF"},
    )
    op.alter_column("shift_templates", "template_name", nullable=False)

    inspector = sa.inspect(bind)
    if not _table_exists(inspector, "position_catalog"):
        op.create_table(
            "position_catalog",
            sa.Column("id", sa.Uuid(), primary_key=True, nullable=False),
            sa.Column("organization_id", sa.Uuid(), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False),
            sa.Column("name", sa.String(length=80), nullable=False),
            sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
            sa.UniqueConstraint("organization_id", "name", name="uq_position_catalog_org_name"),
        )
        op.create_index("ix_position_catalog_organization_id", "position_catalog", ["organization_id"], unique=False)
        op.create_index("ix_position_catalog_is_active", "position_catalog", ["is_active"], unique=False)

    # Seed baseline active positions per organization if missing.
    organizations = bind.execute(sa.text("SELECT id FROM organizations")).fetchall()
    defaults = ("Staff", "Cook", "Bartender", "Waiter")
    for (organization_id,) in organizations:
        for position_name in defaults:
            exists = bind.execute(
                sa.text(
                    "SELECT id FROM position_catalog "
                    "WHERE organization_id = :organization_id AND name = :name"
                ),
                {"organization_id": organization_id, "name": position_name},
            ).first()
            if exists is None:
                bind.execute(
                    sa.text(
                        "INSERT INTO position_catalog (id, organization_id, name, is_active, created_at) "
                        "VALUES (:id, :organization_id, :name, :is_active, CURRENT_TIMESTAMP)"
                    ),
                    {
                        "id": str(uuid.uuid4()),
                        "organization_id": organization_id,
                        "name": position_name,
                        "is_active": True,
                    },
                )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if _table_exists(inspector, "position_catalog"):
        indexes = {index["name"] for index in inspector.get_indexes("position_catalog")}
        if "ix_position_catalog_organization_id" in indexes:
            op.drop_index("ix_position_catalog_organization_id", table_name="position_catalog")
        if "ix_position_catalog_is_active" in indexes:
            op.drop_index("ix_position_catalog_is_active", table_name="position_catalog")
        op.drop_table("position_catalog")

    template_columns = {column["name"] for column in inspector.get_columns("shift_templates")}
    if "staff_position" in template_columns:
        op.drop_column("shift_templates", "staff_position")
    if "template_name" in template_columns:
        op.drop_column("shift_templates", "template_name")
