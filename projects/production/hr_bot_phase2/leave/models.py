"""Database models for Leave Management.

SQLAlchemy ORM models for leave requests and balance tracking.
"""

from datetime import datetime, date
from enum import Enum
from typing import Optional

from sqlalchemy import (
    Column, Integer, String, Text, DateTime, Boolean, ForeignKey,
    Enum as SQLEnum, Date, Float, Index
)
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import relationship

Base = declarative_base()


class LeaveType(str, Enum):
    """Types of leave available to employees."""
    ANNUAL = "annual"
    SICK = "sick"
    SPECIAL = "special"
    MATERNITY = "maternity"
    PATERNITY = "paternity"
    UNPAID = "unpaid"


class LeaveStatus(str, Enum):
    """Status of a leave request."""
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"
    CANCELLED = "cancelled"
    COMPLETED = "completed"


class LeaveRequest(Base):
    """Represents a leave request from an employee."""

    __tablename__ = 'leave_requests'

    id = Column(Integer, primary_key=True, index=True)
    employee_id = Column(Integer, nullable=False, index=True)

    leave_type = Column(SQLEnum(LeaveType), nullable=False, index=True)
    start_date = Column(Date, nullable=False, index=True)
    end_date = Column(Date, nullable=False, index=True)

    reason = Column(Text, nullable=True)
    contact_phone = Column(String(20), nullable=True)

    status = Column(
        SQLEnum(LeaveStatus),
        default=LeaveStatus.PENDING,
        nullable=False,
        index=True
    )

    # Approval details
    approver_id = Column(Integer, nullable=True, index=True)
    approval_timestamp = Column(DateTime, nullable=True)
    approval_comments = Column(Text, nullable=True)

    # Rejection details (if applicable)
    rejection_timestamp = Column(DateTime, nullable=True)
    rejection_reason = Column(Text, nullable=True)

    # Metadata
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (
        Index('idx_employee_status', 'employee_id', 'status'),
        Index('idx_date_range', 'start_date', 'end_date'),
    )

    def __repr__(self):
        return (
            f"<LeaveRequest(id={self.id}, employee_id={self.employee_id}, "
            f"type={self.leave_type}, status={self.status})>"
        )


class LeaveBalance(Base):
    """Tracks leave balance for each employee and leave type."""

    __tablename__ = 'leave_balances'

    id = Column(Integer, primary_key=True, index=True)
    employee_id = Column(Integer, nullable=False, index=True)
    year = Column(Integer, nullable=False)
    leave_type = Column(SQLEnum(LeaveType), nullable=False)

    used_days = Column(Float, default=0.0, nullable=False)
    approved_requests_count = Column(Integer, default=0, nullable=False)

    last_updated = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (
        Index('idx_employee_year_type', 'employee_id', 'year', 'leave_type'),
    )

    def __repr__(self):
        return (
            f"<LeaveBalance(employee_id={self.employee_id}, year={self.year}, "
            f"type={self.leave_type}, used_days={self.used_days})>"
        )
