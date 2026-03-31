"""Migration helper utilities for HR Bot Phase 2.

Provides common patterns and utilities for database migrations:
- Naming conventions
- Version tracking
- Timestamp helpers
- Status enum helpers
"""

from datetime import datetime
from typing import List, Dict, Any


class MigrationHelpers:
    """Helper functions for database migrations."""

    @staticmethod
    def get_version_info() -> Dict[str, Any]:
        """Get migration version information."""
        return {
            "version": "001_initial_schema",
            "release": "HR Bot Phase 2 v2.0.0",
            "created_at": "2026-03-31",
            "author": "HR Bot Team",
        }

    @staticmethod
    def get_enum_types() -> Dict[str, List[str]]:
        """Get all enum types used in migrations."""
        return {
            "jobstatus": ["draft", "open", "closed", "filled", "cancelled"],
            "applicationstatus": [
                "applied",
                "screening",
                "interview_1",
                "interview_2",
                "technical",
                "offer",
                "accepted",
                "rejected",
                "withdrawn",
            ],
            "offerstatus": ["pending", "accepted", "rejected", "expired", "withdrawn"],
        }

    @staticmethod
    def table_naming_convention(name: str, prefix: str = "ix_") -> str:
        """Generate consistent index names.

        Args:
            name: Column or table name
            prefix: Index prefix (default: ix_)

        Returns:
            Formatted index name
        """
        return f"{prefix}{name}"

    @staticmethod
    def foreign_key_naming_convention(
        table: str, column: str, ref_table: str, ref_column: str = "id"
    ) -> str:
        """Generate consistent foreign key constraint names.

        Args:
            table: Source table name
            column: Foreign key column
            ref_table: Referenced table
            ref_column: Referenced column (default: id)

        Returns:
            Formatted FK constraint name
        """
        return f"fk_{table}_{column}_{ref_table}_{ref_column}"

    @staticmethod
    def unique_constraint_naming(table: str, columns: List[str]) -> str:
        """Generate consistent unique constraint names.

        Args:
            table: Table name
            columns: Column names

        Returns:
            Formatted unique constraint name
        """
        col_str = "_".join(columns)
        return f"uq_{table}_{col_str}"

    @staticmethod
    def index_naming(table: str, columns: List[str], suffix: str = "") -> str:
        """Generate consistent index names.

        Args:
            table: Table name
            columns: Column names
            suffix: Optional suffix

        Returns:
            Formatted index name
        """
        col_str = "_".join(columns)
        suffix_part = f"_{suffix}" if suffix else ""
        return f"ix_{table}_{col_str}{suffix_part}"


class StatusEnumHelpers:
    """Helper functions for managing status enums."""

    # Job Status values
    JOB_STATUSES = ["draft", "open", "closed", "filled", "cancelled"]

    # Application Status values
    APPLICATION_STATUSES = [
        "applied",
        "screening",
        "interview_1",
        "interview_2",
        "technical",
        "offer",
        "accepted",
        "rejected",
        "withdrawn",
    ]

    # Offer Status values
    OFFER_STATUSES = ["pending", "accepted", "rejected", "expired", "withdrawn"]

    @classmethod
    def is_valid_job_status(cls, status: str) -> bool:
        """Check if a job status is valid."""
        return status in cls.JOB_STATUSES

    @classmethod
    def is_valid_application_status(cls, status: str) -> bool:
        """Check if an application status is valid."""
        return status in cls.APPLICATION_STATUSES

    @classmethod
    def is_valid_offer_status(cls, status: str) -> bool:
        """Check if an offer status is valid."""
        return status in cls.OFFER_STATUSES


class TimestampHelpers:
    """Helper functions for timestamp operations in migrations."""

    @staticmethod
    def get_current_timestamp() -> str:
        """Get current timestamp in ISO format."""
        return datetime.utcnow().isoformat()

    @staticmethod
    def get_migration_timestamp() -> str:
        """Get migration timestamp in format suitable for file naming."""
        return datetime.utcnow().strftime("%Y%m%d_%H%M%S")

    @staticmethod
    def format_timestamp_for_db(ts: datetime) -> str:
        """Format datetime for database insertion."""
        return ts.isoformat() + "Z"


class IndexingStrategy:
    """Index optimization strategy for common query patterns."""

    # Frequently queried columns that should be indexed
    INDEXED_COLUMNS = {
        "job_postings": [
            "id",
            "title",
            "status",
            "status_posted_at",  # Composite for filtering open jobs
            "department",
            "created_at",
        ],
        "candidates": [
            "id",
            "email",
            "full_name",
            "is_active",
            "created_at",
        ],
        "applications": [
            "id",
            "candidate_id",
            "job_posting_id",
            "status",
            "final_score",
            "created_at",
        ],
        "offers": [
            "id",
            "candidate_id",
            "job_posting_id",
            "status",
            "expires_at",
            "created_at",
        ],
    }

    @classmethod
    def get_indexes_for_table(cls, table: str) -> List[str]:
        """Get recommended indexes for a table."""
        return cls.INDEXED_COLUMNS.get(table, [])
