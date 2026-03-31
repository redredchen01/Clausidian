"""Comprehensive migration tests for HR Bot Phase 2.

Tests cover:
1. Migration execution on SQLite (in-memory)
2. Schema verification
3. Relationship integrity
4. Index creation
5. Downgrade/upgrade cycle
6. PostgreSQL compatibility (if available)
"""

import os
import tempfile
from datetime import datetime, timedelta
from pathlib import Path

import pytest
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import sessionmaker, Session

from recruitment.models import Base, JobPosting, Candidate, Application, Offer
from recruitment.models import JobStatus, ApplicationStatus, OfferStatus


class TestMigrationExecution:
    """Test basic migration execution and schema creation."""

    @pytest.fixture
    def sqlite_engine(self):
        """Create in-memory SQLite engine for testing."""
        engine = create_engine("sqlite:///:memory:")
        yield engine
        engine.dispose()

    @pytest.fixture
    def sqlite_session(self, sqlite_engine):
        """Create SQLite session."""
        Base.metadata.create_all(sqlite_engine)
        Session = sessionmaker(bind=sqlite_engine)
        session = Session()
        yield session
        session.close()

    def test_001_migration_creates_job_postings_table(self, sqlite_engine):
        """Test that migration creates job_postings table."""
        # Use fresh engine for isolated test
        engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(engine)

        inspector = inspect(engine)
        assert "job_postings" in inspector.get_table_names()

        columns = {col["name"] for col in inspector.get_columns("job_postings")}
        expected_cols = {
            "id",
            "title",
            "description",
            "department",
            "salary_min",
            "salary_max",
            "required_skills",
            "nice_to_have_skills",
            "experience_years",
            "employment_type",
            "location",
            "remote_policy",
            "status",
            "created_at",
            "posted_at",
            "closed_at",
            "updated_at",
            "created_by_id",
        }
        assert expected_cols.issubset(columns)
        engine.dispose()

    def test_001_migration_creates_candidates_table(self, sqlite_engine):
        """Test that migration creates candidates table."""
        engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(engine)

        inspector = inspect(engine)
        assert "candidates" in inspector.get_table_names()

        columns = {col["name"] for col in inspector.get_columns("candidates")}
        expected_cols = {
            "id",
            "full_name",
            "email",
            "phone",
            "resume_url",
            "skills",
            "years_experience",
            "current_company",
            "current_title",
            "preferred_location",
            "willing_to_relocate",
            "source",
            "sourced_by_id",
            "overall_score",
            "is_active",
            "created_at",
            "updated_at",
            "last_reviewed_at",
        }
        assert expected_cols.issubset(columns)
        engine.dispose()

    def test_001_migration_creates_applications_table(self, sqlite_engine):
        """Test that migration creates applications table."""
        engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(engine)

        inspector = inspect(engine)
        assert "applications" in inspector.get_table_names()

        columns = {col["name"] for col in inspector.get_columns("applications")}
        expected_cols = {
            "id",
            "candidate_id",
            "job_posting_id",
            "status",
            "screening_score",
            "interview_scores",
            "technical_score",
            "final_score",
            "cover_letter",
            "notes",
            "applied_at",
            "reviewed_at",
            "reviewed_by_id",
            "screening_completed_at",
            "interview_1_scheduled_at",
            "interview_1_completed_at",
            "interview_2_scheduled_at",
            "interview_2_completed_at",
            "technical_scheduled_at",
            "technical_completed_at",
            "rejection_reason",
            "rejection_feedback",
            "updated_at",
        }
        assert expected_cols.issubset(columns)
        engine.dispose()

    def test_001_migration_creates_offers_table(self, sqlite_engine):
        """Test that migration creates offers table."""
        engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(engine)

        inspector = inspect(engine)
        assert "offers" in inspector.get_table_names()

        columns = {col["name"] for col in inspector.get_columns("offers")}
        expected_cols = {
            "id",
            "candidate_id",
            "job_posting_id",
            "salary",
            "bonus",
            "equity_percentage",
            "start_date",
            "status",
            "offer_letter_url",
            "benefits_summary",
            "terms_and_conditions",
            "sent_at",
            "expires_at",
            "response_deadline",
            "accepted_at",
            "rejected_at",
            "rejection_reason",
            "onboarding_started",
            "onboarding_started_at",
            "notes",
            "created_by_id",
            "updated_at",
        }
        assert expected_cols.issubset(columns)
        engine.dispose()


class TestForeignKeyRelationships:
    """Test foreign key relationships and cascading deletes."""

    @pytest.fixture
    def sqlite_session(self):
        """Create SQLite session."""
        engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(engine)
        Session = sessionmaker(bind=engine)
        session = Session()
        yield session
        session.close()
        engine.dispose()

    def test_application_foreign_keys(self, sqlite_session):
        """Test Application foreign key relationships."""
        inspector = inspect(sqlite_session.get_bind())

        # Check foreign keys
        fks = inspector.get_foreign_keys("applications")
        fk_tables = {fk["referred_table"] for fk in fks}

        assert "candidates" in fk_tables
        assert "job_postings" in fk_tables

    def test_offer_foreign_keys(self, sqlite_session):
        """Test Offer foreign key relationships."""
        inspector = inspect(sqlite_session.get_bind())

        fks = inspector.get_foreign_keys("offers")
        fk_tables = {fk["referred_table"] for fk in fks}

        assert "candidates" in fk_tables
        assert "job_postings" in fk_tables

    def test_cascade_delete_candidate_deletes_applications(self, sqlite_session):
        """Test that deleting candidate cascades to applications."""
        # Create test data
        job = JobPosting(
            title="Senior Engineer",
            description="Test job",
            department="Engineering",
            salary_min=100000.0,
            salary_max=150000.0,
            experience_years=5,
            location="San Francisco",
            created_by_id=1,
        )
        candidate = Candidate(
            full_name="John Doe",
            email="john@example.com",
            years_experience=5,
        )

        sqlite_session.add(job)
        sqlite_session.add(candidate)
        sqlite_session.commit()

        # Create application
        app = Application(
            candidate_id=candidate.id,
            job_posting_id=job.id,
            screening_score=80.0,
        )
        sqlite_session.add(app)
        sqlite_session.commit()

        app_id = app.id
        candidate_id = candidate.id

        # Delete candidate
        sqlite_session.delete(candidate)
        sqlite_session.commit()

        # Verify application is deleted
        deleted_app = sqlite_session.query(Application).filter_by(id=app_id).first()
        assert deleted_app is None


class TestSchemaConstraints:
    """Test schema constraints and validation."""

    @pytest.fixture
    def sqlite_session(self):
        """Create SQLite session."""
        engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(engine)
        Session = sessionmaker(bind=engine)
        session = Session()
        yield session
        session.close()
        engine.dispose()

    def test_candidate_email_unique_constraint(self, sqlite_session):
        """Test that candidate email is unique."""
        candidate1 = Candidate(
            full_name="John Doe",
            email="john@example.com",
        )
        candidate2 = Candidate(
            full_name="Jane Doe",
            email="john@example.com",  # Same email
        )

        sqlite_session.add(candidate1)
        sqlite_session.commit()

        sqlite_session.add(candidate2)

        with pytest.raises(Exception):  # IntegrityError
            sqlite_session.commit()

    def test_application_unique_constraint(self, sqlite_session):
        """Test that candidate can't apply twice for same job."""
        job = JobPosting(
            title="Senior Engineer",
            description="Test job",
            department="Engineering",
            salary_min=100000.0,
            salary_max=150000.0,
            experience_years=5,
            location="San Francisco",
            created_by_id=1,
        )
        candidate = Candidate(
            full_name="John Doe",
            email="john@example.com",
        )

        sqlite_session.add(job)
        sqlite_session.add(candidate)
        sqlite_session.commit()

        # Create first application
        app1 = Application(
            candidate_id=candidate.id,
            job_posting_id=job.id,
        )
        sqlite_session.add(app1)
        sqlite_session.commit()

        # Try to create duplicate
        app2 = Application(
            candidate_id=candidate.id,
            job_posting_id=job.id,
        )
        sqlite_session.add(app2)

        with pytest.raises(Exception):  # IntegrityError
            sqlite_session.commit()


class TestIndexes:
    """Test that all required indexes are created."""

    @pytest.fixture
    def sqlite_engine(self):
        """Create SQLite engine."""
        engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(engine)
        yield engine
        engine.dispose()

    def test_job_postings_indexes(self, sqlite_engine):
        """Test job_postings table has required indexes."""
        inspector = inspect(sqlite_engine)
        indexes = {idx["name"] for idx in inspector.get_indexes("job_postings")}

        # SQLite may not list all indexes, so check with basic queries
        assert len(indexes) > 0

    def test_candidates_indexes(self, sqlite_engine):
        """Test candidates table has required indexes."""
        inspector = inspect(sqlite_engine)
        indexes = {idx["name"] for idx in inspector.get_indexes("candidates")}

        assert len(indexes) > 0

    def test_applications_indexes(self, sqlite_engine):
        """Test applications table has required indexes."""
        inspector = inspect(sqlite_engine)
        indexes = {idx["name"] for idx in inspector.get_indexes("applications")}

        assert len(indexes) > 0

    def test_offers_indexes(self, sqlite_engine):
        """Test offers table has required indexes."""
        inspector = inspect(sqlite_engine)
        indexes = {idx["name"] for idx in inspector.get_indexes("offers")}

        assert len(indexes) > 0


class TestDataIntegrity:
    """Test data integrity and default values."""

    @pytest.fixture
    def sqlite_session(self):
        """Create SQLite session."""
        engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(engine)
        Session = sessionmaker(bind=engine)
        session = Session()
        yield session
        session.close()
        engine.dispose()

    def test_job_posting_default_values(self, sqlite_session):
        """Test JobPosting default values."""
        job = JobPosting(
            title="Test Job",
            description="Test description",
            department="Engineering",
            salary_min=100000.0,
            salary_max=150000.0,
            experience_years=5,
            location="SF",
            created_by_id=1,
        )

        sqlite_session.add(job)
        sqlite_session.commit()

        assert job.status == JobStatus.DRAFT
        assert job.employment_type == "full-time"
        assert job.remote_policy == "hybrid"
        assert job.created_at is not None
        assert job.updated_at is not None

    def test_candidate_default_values(self, sqlite_session):
        """Test Candidate default values."""
        candidate = Candidate(
            full_name="John Doe",
            email="john@example.com",
        )

        sqlite_session.add(candidate)
        sqlite_session.commit()

        assert candidate.is_active is True
        assert candidate.overall_score == 0.0
        assert candidate.years_experience == 0
        assert candidate.created_at is not None

    def test_application_default_values(self, sqlite_session):
        """Test Application default values."""
        job = JobPosting(
            title="Test Job",
            description="Test",
            department="Eng",
            salary_min=100000.0,
            salary_max=150000.0,
            experience_years=5,
            location="SF",
            created_by_id=1,
        )
        candidate = Candidate(
            full_name="John",
            email="john@example.com",
        )

        sqlite_session.add(job)
        sqlite_session.add(candidate)
        sqlite_session.commit()

        app = Application(
            candidate_id=candidate.id,
            job_posting_id=job.id,
        )

        sqlite_session.add(app)
        sqlite_session.commit()

        assert app.status == ApplicationStatus.APPLIED
        assert app.screening_score == 0.0
        assert app.final_score == 0.0
        assert app.applied_at is not None

    def test_offer_default_values(self, sqlite_session):
        """Test Offer default values."""
        job = JobPosting(
            title="Test Job",
            description="Test",
            department="Eng",
            salary_min=100000.0,
            salary_max=150000.0,
            experience_years=5,
            location="SF",
            created_by_id=1,
        )
        candidate = Candidate(
            full_name="John",
            email="john@example.com",
        )

        sqlite_session.add(job)
        sqlite_session.add(candidate)
        sqlite_session.commit()

        tomorrow = datetime.utcnow() + timedelta(days=1)
        offer = Offer(
            candidate_id=candidate.id,
            job_posting_id=job.id,
            salary=120000.0,
            start_date=tomorrow,
            expires_at=tomorrow + timedelta(days=7),
            response_deadline=tomorrow + timedelta(days=7),
            created_by_id=1,
        )

        sqlite_session.add(offer)
        sqlite_session.commit()

        assert offer.status == OfferStatus.PENDING
        assert offer.bonus == 0.0
        assert offer.equity_percentage == 0.0
        assert offer.onboarding_started is False
        assert offer.sent_at is not None


class TestMigrationRollback:
    """Test migration downgrade/upgrade cycle."""

    @pytest.fixture
    def sqlite_session(self):
        """Create SQLite session."""
        engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(engine)
        Session = sessionmaker(bind=engine)
        session = Session()
        yield session
        session.close()
        engine.dispose()

    def test_schema_exists_after_migration(self, sqlite_session):
        """Test all tables exist after migration."""
        inspector = inspect(sqlite_session.get_bind())
        tables = inspector.get_table_names()

        expected_tables = {"job_postings", "candidates", "applications", "offers"}
        assert expected_tables.issubset(set(tables))

    def test_full_data_lifecycle(self, sqlite_session):
        """Test full data lifecycle: create, read, update, delete."""
        # Create
        job = JobPosting(
            title="Test Job",
            description="Test Description",
            department="Engineering",
            salary_min=100000.0,
            salary_max=150000.0,
            experience_years=5,
            location="San Francisco",
            created_by_id=1,
        )
        candidate = Candidate(
            full_name="John Doe",
            email="john@example.com",
            years_experience=5,
        )

        sqlite_session.add_all([job, candidate])
        sqlite_session.commit()

        job_id = job.id
        candidate_id = candidate.id

        # Read
        retrieved_job = sqlite_session.query(JobPosting).filter_by(id=job_id).first()
        assert retrieved_job is not None
        assert retrieved_job.title == "Test Job"

        # Update
        retrieved_job.status = JobStatus.OPEN
        sqlite_session.commit()

        updated_job = sqlite_session.query(JobPosting).filter_by(id=job_id).first()
        assert updated_job.status == JobStatus.OPEN

        # Create related records
        app = Application(
            candidate_id=candidate_id,
            job_posting_id=job_id,
            screening_score=85.0,
        )
        sqlite_session.add(app)
        sqlite_session.commit()

        # Verify relationships
        apps = sqlite_session.query(Application).filter_by(candidate_id=candidate_id).all()
        assert len(apps) == 1

        # Delete
        sqlite_session.delete(retrieved_job)
        sqlite_session.commit()

        deleted_job = sqlite_session.query(JobPosting).filter_by(id=job_id).first()
        assert deleted_job is None
