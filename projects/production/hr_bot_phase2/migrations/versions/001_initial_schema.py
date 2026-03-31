"""Initial database schema for HR Bot Phase 2 - Recruitment Management.

Creates all core tables:
- job_postings
- candidates
- applications
- offers

Revision ID: 001_initial_schema
Revises: (none)
Create Date: 2026-03-31
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = "001_initial_schema"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Create initial schema with all 4 core tables and relationships."""

    # Create JobPosting table
    op.create_table(
        "job_postings",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("title", sa.String(200), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("department", sa.String(100), nullable=False),
        sa.Column("salary_min", sa.Float(), nullable=False),
        sa.Column("salary_max", sa.Float(), nullable=False),
        sa.Column("required_skills", sa.JSON(), nullable=False, server_default="[]"),
        sa.Column("nice_to_have_skills", sa.JSON(), nullable=False, server_default="[]"),
        sa.Column("experience_years", sa.Integer(), nullable=False),
        sa.Column("employment_type", sa.String(50), nullable=False, server_default="full-time"),
        sa.Column("location", sa.String(200), nullable=False),
        sa.Column("remote_policy", sa.String(50), nullable=False, server_default="hybrid"),
        sa.Column(
            "status",
            sa.Enum("draft", "open", "closed", "filled", "cancelled", name="jobstatus"),
            nullable=False,
            server_default="draft",
        ),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("posted_at", sa.DateTime(), nullable=True),
        sa.Column("closed_at", sa.DateTime(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("created_by_id", sa.Integer(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )

    # Create Candidate table
    op.create_table(
        "candidates",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("full_name", sa.String(200), nullable=False),
        sa.Column("email", sa.String(200), nullable=False, unique=True),
        sa.Column("phone", sa.String(20), nullable=True),
        sa.Column("resume_url", sa.String(500), nullable=True),
        sa.Column("skills", sa.JSON(), nullable=False, server_default="[]"),
        sa.Column("years_experience", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("current_company", sa.String(200), nullable=True),
        sa.Column("current_title", sa.String(200), nullable=True),
        sa.Column("preferred_location", sa.String(200), nullable=True),
        sa.Column("willing_to_relocate", sa.Boolean(), nullable=False, server_default="0"),
        sa.Column("source", sa.String(50), nullable=True),
        sa.Column("sourced_by_id", sa.Integer(), nullable=True),
        sa.Column("overall_score", sa.Float(), nullable=False, server_default="0.0"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="1"),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("last_reviewed_at", sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("email", name="uq_candidates_email"),
    )

    # Create Application table
    op.create_table(
        "applications",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("candidate_id", sa.Integer(), nullable=False),
        sa.Column("job_posting_id", sa.Integer(), nullable=False),
        sa.Column(
            "status",
            sa.Enum(
                "applied",
                "screening",
                "interview_1",
                "interview_2",
                "technical",
                "offer",
                "accepted",
                "rejected",
                "withdrawn",
                name="applicationstatus",
            ),
            nullable=False,
            server_default="applied",
        ),
        sa.Column("screening_score", sa.Float(), nullable=False, server_default="0.0"),
        sa.Column("interview_scores", sa.JSON(), nullable=False, server_default="{}"),
        sa.Column("technical_score", sa.Float(), nullable=True),
        sa.Column("final_score", sa.Float(), nullable=False, server_default="0.0"),
        sa.Column("cover_letter", sa.Text(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("applied_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("reviewed_at", sa.DateTime(), nullable=True),
        sa.Column("reviewed_by_id", sa.Integer(), nullable=True),
        sa.Column("screening_completed_at", sa.DateTime(), nullable=True),
        sa.Column("interview_1_scheduled_at", sa.DateTime(), nullable=True),
        sa.Column("interview_1_completed_at", sa.DateTime(), nullable=True),
        sa.Column("interview_2_scheduled_at", sa.DateTime(), nullable=True),
        sa.Column("interview_2_completed_at", sa.DateTime(), nullable=True),
        sa.Column("technical_scheduled_at", sa.DateTime(), nullable=True),
        sa.Column("technical_completed_at", sa.DateTime(), nullable=True),
        sa.Column("rejection_reason", sa.String(500), nullable=True),
        sa.Column("rejection_feedback", sa.Text(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["candidate_id"], ["candidates.id"], ),
        sa.ForeignKeyConstraint(["job_posting_id"], ["job_postings.id"], ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("candidate_id", "job_posting_id", name="uq_candidate_job"),
    )

    # Create Offer table
    op.create_table(
        "offers",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("candidate_id", sa.Integer(), nullable=False),
        sa.Column("job_posting_id", sa.Integer(), nullable=False),
        sa.Column("salary", sa.Float(), nullable=False),
        sa.Column("bonus", sa.Float(), nullable=False, server_default="0.0"),
        sa.Column("equity_percentage", sa.Float(), nullable=False, server_default="0.0"),
        sa.Column("start_date", sa.DateTime(), nullable=False),
        sa.Column(
            "status",
            sa.Enum("pending", "accepted", "rejected", "expired", "withdrawn", name="offerstatus"),
            nullable=False,
            server_default="pending",
        ),
        sa.Column("offer_letter_url", sa.String(500), nullable=True),
        sa.Column("benefits_summary", sa.Text(), nullable=True),
        sa.Column("terms_and_conditions", sa.Text(), nullable=True),
        sa.Column("sent_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("expires_at", sa.DateTime(), nullable=False),
        sa.Column("response_deadline", sa.DateTime(), nullable=False),
        sa.Column("accepted_at", sa.DateTime(), nullable=True),
        sa.Column("rejected_at", sa.DateTime(), nullable=True),
        sa.Column("rejection_reason", sa.String(500), nullable=True),
        sa.Column("onboarding_started", sa.Boolean(), nullable=False, server_default="0"),
        sa.Column("onboarding_started_at", sa.DateTime(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_by_id", sa.Integer(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["candidate_id"], ["candidates.id"], ),
        sa.ForeignKeyConstraint(["job_posting_id"], ["job_postings.id"], ),
        sa.PrimaryKeyConstraint("id"),
    )


def downgrade() -> None:
    """Drop all tables created in upgrade."""

    # Drop offers first (has foreign keys)
    op.drop_table("offers")

    # Drop applications
    op.drop_table("applications")

    # Drop candidates
    op.drop_table("candidates")

    # Drop job_postings
    op.drop_table("job_postings")

    # Drop enums (PostgreSQL only - SQLite ignores this)
    op.execute("DROP TYPE IF EXISTS jobstatus CASCADE")
    op.execute("DROP TYPE IF EXISTS applicationstatus CASCADE")
    op.execute("DROP TYPE IF EXISTS offerstatus CASCADE")
