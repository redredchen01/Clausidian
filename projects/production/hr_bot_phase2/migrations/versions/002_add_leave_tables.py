"""Add leave request and balance tracking tables.

Revision ID: 002_add_leave_tables
Revises: 001_initial_schema
Create Date: 2026-03-31
"""

from alembic import op
import sqlalchemy as sa

revision = "002_add_leave_tables"
down_revision = "001_initial_schema"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Create leave request and balance tables."""

    op.create_table(
        "leave_requests",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("employee_id", sa.Integer(), nullable=False),
        sa.Column(
            "leave_type",
            sa.Enum("annual", "sick", "special", "maternity", "paternity", "unpaid", name="leavetype"),
            nullable=False,
        ),
        sa.Column("start_date", sa.Date(), nullable=False),
        sa.Column("end_date", sa.Date(), nullable=False),
        sa.Column("reason", sa.Text(), nullable=True),
        sa.Column("contact_phone", sa.String(20), nullable=True),
        sa.Column(
            "status",
            sa.Enum("pending", "approved", "rejected", "cancelled", "completed", name="leavestatus"),
            nullable=False,
            server_default="pending",
        ),
        sa.Column("approver_id", sa.Integer(), nullable=True),
        sa.Column("approval_timestamp", sa.DateTime(), nullable=True),
        sa.Column("approval_comments", sa.Text(), nullable=True),
        sa.Column("rejection_timestamp", sa.DateTime(), nullable=True),
        sa.Column("rejection_reason", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.PrimaryKeyConstraint("id"),
    )

    op.create_index("idx_leave_employee_id", "leave_requests", ["employee_id"])
    op.create_index("idx_leave_type", "leave_requests", ["leave_type"])
    op.create_index("idx_leave_status", "leave_requests", ["status"])
    op.create_index("idx_leave_approver_id", "leave_requests", ["approver_id"])
    op.create_index("idx_leave_employee_status", "leave_requests", ["employee_id", "status"])
    op.create_index("idx_leave_date_range", "leave_requests", ["start_date", "end_date"])

    op.create_table(
        "leave_balances",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("employee_id", sa.Integer(), nullable=False),
        sa.Column("year", sa.Integer(), nullable=False),
        sa.Column(
            "leave_type",
            sa.Enum("annual", "sick", "special", "maternity", "paternity", "unpaid", name="leavetype"),
            nullable=False,
        ),
        sa.Column("used_days", sa.Float(), nullable=False, server_default="0.0"),
        sa.Column("approved_requests_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("last_updated", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.PrimaryKeyConstraint("id"),
    )

    op.create_index("idx_leave_balance_emp_year_type", "leave_balances", ["employee_id", "year", "leave_type"])


def downgrade() -> None:
    """Drop leave tables."""

    op.drop_index("idx_leave_balance_emp_year_type", "leave_balances")
    op.drop_table("leave_balances")

    op.drop_index("idx_leave_date_range", "leave_requests")
    op.drop_index("idx_leave_employee_status", "leave_requests")
    op.drop_index("idx_leave_approver_id", "leave_requests")
    op.drop_index("idx_leave_status", "leave_requests")
    op.drop_index("idx_leave_type", "leave_requests")
    op.drop_index("idx_leave_employee_id", "leave_requests")
    op.drop_table("leave_requests")

    op.execute("DROP TYPE IF EXISTS leavetype CASCADE")
    op.execute("DROP TYPE IF EXISTS leavestatus CASCADE")
