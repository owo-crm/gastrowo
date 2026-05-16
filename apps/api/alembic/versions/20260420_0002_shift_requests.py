"""add shift requests table

Revision ID: 20260420_0002
Revises: 20260420_0001
Create Date: 2026-04-20 10:15:00
"""

from __future__ import annotations

from alembic import op

from app.db import Base
from app import models  # noqa: F401

revision = "20260420_0002"
down_revision = "20260420_0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    Base.metadata.create_all(bind)


def downgrade() -> None:
    bind = op.get_bind()
    models.ShiftRequest.__table__.drop(bind, checkfirst=True)
