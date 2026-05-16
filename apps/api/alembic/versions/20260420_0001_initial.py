"""initial schema

Revision ID: 20260420_0001
Revises:
Create Date: 2026-04-20 08:30:00
"""

from __future__ import annotations

from alembic import op
from app.db import Base
from app import models  # noqa: F401

revision = "20260420_0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    Base.metadata.create_all(bind)


def downgrade() -> None:
    bind = op.get_bind()
    Base.metadata.drop_all(bind)