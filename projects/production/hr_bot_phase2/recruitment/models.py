"""Database models for Recruitment Management.

SQLAlchemy ORM models for job postings, candidates, applications, and offers.
"""

from datetime import datetime
from enum import Enum
from typing import List, Optional

from sqlalchemy import (
    Column, Integer, String, Text, Float, DateTime, Boolean, ForeignKey,
    Enum as SQLEnum, JSON, Index, UniqueConstraint
)
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import relationship

Base = declarative_base()


class JobStatus(str, Enum):
    """Status of a job posting."""
    DRAFT = "draft"
    OPEN = "open"
    CLOSED = "closed"
    FILLED = "filled"
    CANCELLED = "cancelled"


class ApplicationStatus(str, Enum):
    """Status of a job application."""
    APPLIED = "applied"
    SCREENING = "screening"
    INTERVIEW_1 = "interview_1"
    INTERVIEW_2 = "interview_2"
    TECHNICAL = "technical"
    OFFER = "offer"
    ACCEPTED = "accepted"
    REJECTED = "rejected"
    WITHDRAWN = "withdrawn"


class OfferStatus(str, Enum):
    """Status of a job offer."""
    PENDING = "pending"
    ACCEPTED = "accepted"
    REJECTED = "rejected"
    EXPIRED = "expired"
    WITHDRAWN = "withdrawn"


class JobPosting(Base):
    """Represents a job posting."""

    __tablename__ = 'job_postings'

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(200), nullable=False, index=True)
    description = Column(Text, nullable=False)
    department = Column(String(100), nullable=False, index=True)
    salary_min = Column(Float, nullable=False)
    salary_max = Column(Float, nullable=False)
    required_skills = Column(JSON, default=list, nullable=False)  # List[str]
    nice_to_have_skills = Column(JSON, default=list, nullable=False)
    experience_years = Column(Integer, nullable=False)  # Minimum years required
    employment_type = Column(String(50), default='full-time')  # full-time, part-time, contract
    location = Column(String(200), nullable=False)
    remote_policy = Column(String(50), default='hybrid')  # on-site, hybrid, remote

    status = Column(SQLEnum(JobStatus), default=JobStatus.DRAFT, nullable=False, index=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    posted_at = Column(DateTime, nullable=True)
    closed_at = Column(DateTime, nullable=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    created_by_id = Column(Integer, nullable=False)  # HR/Hiring manager ID

    # Relationships
    applications = relationship('Application', back_populates='job_posting', cascade='all, delete-orphan')
    offers = relationship('Offer', back_populates='job_posting')

    __table_args__ = (
        Index('ix_job_postings_status_posted', 'status', 'posted_at'),
        Index('ix_job_postings_department', 'department'),
    )

    def __repr__(self):
        return f"<JobPosting(id={self.id}, title={self.title}, status={self.status})>"


class Candidate(Base):
    """Represents a job candidate."""

    __tablename__ = 'candidates'

    id = Column(Integer, primary_key=True, index=True)
    full_name = Column(String(200), nullable=False, index=True)
    email = Column(String(200), nullable=False, unique=True, index=True)
    phone = Column(String(20), nullable=True)
    resume_url = Column(String(500), nullable=True)
    skills = Column(JSON, default=list, nullable=False)  # List[str]
    years_experience = Column(Integer, default=0, nullable=False)
    current_company = Column(String(200), nullable=True)
    current_title = Column(String(200), nullable=True)
    preferred_location = Column(String(200), nullable=True)
    willing_to_relocate = Column(Boolean, default=False)

    source = Column(String(50), nullable=True)  # linkedin, indeed, referral, etc.
    sourced_by_id = Column(Integer, nullable=True)

    overall_score = Column(Float, default=0.0)  # 0-100, auto-calculated
    is_active = Column(Boolean, default=True, index=True)

    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    last_reviewed_at = Column(DateTime, nullable=True)

    # Relationships
    applications = relationship('Application', back_populates='candidate', cascade='all, delete-orphan')
    offers = relationship('Offer', back_populates='candidate')

    __table_args__ = (
        Index('ix_candidates_email', 'email'),
        Index('ix_candidates_is_active', 'is_active'),
    )

    def __repr__(self):
        return f"<Candidate(id={self.id}, name={self.full_name}, score={self.overall_score})>"


class Application(Base):
    """Represents a job application."""

    __tablename__ = 'applications'

    id = Column(Integer, primary_key=True, index=True)
    candidate_id = Column(Integer, ForeignKey('candidates.id'), nullable=False, index=True)
    job_posting_id = Column(Integer, ForeignKey('job_postings.id'), nullable=False, index=True)

    status = Column(SQLEnum(ApplicationStatus), default=ApplicationStatus.APPLIED, nullable=False, index=True)
    screening_score = Column(Float, default=0.0)  # 0-100, auto-calculated from resume screening
    interview_scores = Column(JSON, default=dict, nullable=False)  # {interview_1: 85, interview_2: 88}
    technical_score = Column(Float, nullable=True)
    final_score = Column(Float, default=0.0)  # Weighted average of all scores

    cover_letter = Column(Text, nullable=True)
    notes = Column(Text, nullable=True)  # Internal notes from reviewers

    applied_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    reviewed_at = Column(DateTime, nullable=True)
    reviewed_by_id = Column(Integer, nullable=True)

    # Stage tracking
    screening_completed_at = Column(DateTime, nullable=True)
    interview_1_scheduled_at = Column(DateTime, nullable=True)
    interview_1_completed_at = Column(DateTime, nullable=True)
    interview_2_scheduled_at = Column(DateTime, nullable=True)
    interview_2_completed_at = Column(DateTime, nullable=True)
    technical_scheduled_at = Column(DateTime, nullable=True)
    technical_completed_at = Column(DateTime, nullable=True)

    rejection_reason = Column(String(500), nullable=True)
    rejection_feedback = Column(Text, nullable=True)  # Share with candidate

    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    candidate = relationship('Candidate', back_populates='applications')
    job_posting = relationship('JobPosting', back_populates='applications')

    __table_args__ = (
        UniqueConstraint('candidate_id', 'job_posting_id', name='uq_candidate_job'),
        Index('ix_applications_status', 'status'),
        Index('ix_applications_final_score', 'final_score'),
    )

    def __repr__(self):
        return f"<Application(id={self.id}, candidate_id={self.candidate_id}, status={self.status})>"


class Offer(Base):
    """Represents a job offer."""

    __tablename__ = 'offers'

    id = Column(Integer, primary_key=True, index=True)
    candidate_id = Column(Integer, ForeignKey('candidates.id'), nullable=False, index=True)
    job_posting_id = Column(Integer, ForeignKey('job_postings.id'), nullable=False, index=True)

    salary = Column(Float, nullable=False)
    bonus = Column(Float, default=0.0)
    equity_percentage = Column(Float, default=0.0)
    start_date = Column(DateTime, nullable=False)

    status = Column(SQLEnum(OfferStatus), default=OfferStatus.PENDING, nullable=False, index=True)

    offer_letter_url = Column(String(500), nullable=True)
    benefits_summary = Column(Text, nullable=True)
    terms_and_conditions = Column(Text, nullable=True)

    sent_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    expires_at = Column(DateTime, nullable=False)  # Usually 7-10 days from sent_at
    response_deadline = Column(DateTime, nullable=False)

    accepted_at = Column(DateTime, nullable=True)
    rejected_at = Column(DateTime, nullable=True)
    rejection_reason = Column(String(500), nullable=True)

    # Onboarding tracking
    onboarding_started = Column(Boolean, default=False)
    onboarding_started_at = Column(DateTime, nullable=True)

    notes = Column(Text, nullable=True)  # Internal notes
    created_by_id = Column(Integer, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    candidate = relationship('Candidate', back_populates='offers')
    job_posting = relationship('JobPosting', back_populates='offers')

    __table_args__ = (
        Index('ix_offers_status', 'status'),
        Index('ix_offers_expires_at', 'expires_at'),
    )

    def __repr__(self):
        return f"<Offer(id={self.id}, candidate_id={self.candidate_id}, status={self.status})>"
