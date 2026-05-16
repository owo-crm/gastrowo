"""add public uid for users

Revision ID: 20260421_0003
Revises: 20260420_0002
Create Date: 2026-04-21 17:35:00
"""

from __future__ import annotations

import uuid

import sqlalchemy as sa
from alembic import op

revision = "20260421_0003"
down_revision = "20260420_0002"
branch_labels = None
depends_on = None


def _generate_uid(existing: set[str]) -> str:
    while True:
        candidate = f"WD{uuid.uuid4().hex[:10].upper()}"
        if candidate not in existing:
            existing.add(candidate)
            return candidate


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    columns = {column["name"] for column in inspector.get_columns("users")}

    if "public_uid" not in columns:
        op.add_column("users", sa.Column("public_uid", sa.String(length=32), nullable=True))

    existing_uids = {
        row[0]
        for row in bind.execute(sa.text("SELECT public_uid FROM users WHERE public_uid IS NOT NULL")).fetchall()
        if row[0]
    }
    user_rows = bind.execute(sa.text("SELECT id FROM users WHERE public_uid IS NULL")).fetchall()
    for row in user_rows:
        generated = _generate_uid(existing_uids)
        bind.execute(
            sa.text("UPDATE users SET public_uid = :public_uid WHERE id = :id"),
            {"public_uid": generated, "id": row[0]},
        )

    op.alter_column("users", "public_uid", nullable=False)

    indexes = {index["name"] for index in inspector.get_indexes("users")}
    if "ix_users_public_uid" not in indexes:
        op.create_index("ix_users_public_uid", "users", ["public_uid"], unique=True)


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    columns = {column["name"] for column in inspector.get_columns("users")}
    indexes = {index["name"] for index in inspector.get_indexes("users")}

    if "ix_users_public_uid" in indexes:
        op.drop_index("ix_users_public_uid", table_name="users")
    if "public_uid" in columns:
        op.drop_column("users", "public_uid")
