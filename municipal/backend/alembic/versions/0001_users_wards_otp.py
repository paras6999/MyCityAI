"""users, wards and otp_codes tables

Revision ID: 0001
Revises:
Create Date: 2026-10-02
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0001"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "wards",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("number", sa.Integer(), nullable=False, unique=True),
        sa.Column("name", sa.String(120), nullable=False),
    )
    op.create_table(
        "users",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(120), nullable=True),
        sa.Column("phone", sa.String(20), nullable=True, unique=True),
        sa.Column("username", sa.String(60), nullable=True, unique=True),
        sa.Column("password_hash", sa.String(100), nullable=True),
        sa.Column("role", sa.String(20), nullable=False),
        sa.Column("department", sa.String(20), nullable=True),
        sa.Column("ward_id", sa.Integer(), sa.ForeignKey("wards.id"), nullable=True),
        sa.Column("language", sa.String(2), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(
            "role IN ('citizen', 'officer', 'ward_rep', 'mayor', 'admin')", name="role_valid"
        ),
        sa.CheckConstraint(
            "department IS NULL OR department IN ('water', 'roads', 'waste', 'electricity', "
            "'drainage', 'health', 'other')",
            name="dept_valid",
        ),
        sa.CheckConstraint("language IN ('en', 'mr', 'hi')", name="language_valid"),
    )
    op.create_table(
        "otp_codes",
        sa.Column("phone", sa.String(20), primary_key=True),
        sa.Column("code_hash", sa.String(100), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("sent_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("attempts", sa.Integer(), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("otp_codes")
    op.drop_table("users")
    op.drop_table("wards")
