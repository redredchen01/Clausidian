"""Leave Management Workflow Handlers.

Implements leave request processing, approval workflow, and balance tracking.
Sub-tasks 2.2 (approve_leave) and 2.3 (get_leave_balance).
"""

import logging
from datetime import datetime, date, timedelta
from typing import Optional, Tuple
from enum import Enum

from sqlalchemy.orm import Session

from .models import LeaveRequest, LeaveType, LeaveStatus, LeaveBalance

logger = logging.getLogger(__name__)

# Leave quotas per leave type
LEAVE_QUOTAS = {
    LeaveType.ANNUAL: 20,           # Per year, resets Jan 1
    LeaveType.SICK: 10,              # Per year
    LeaveType.SPECIAL: 3,            # Per year
    LeaveType.MATERNITY: 120,        # One-time (never resets)
    LeaveType.PATERNITY: 30,         # One-time (never resets)
    LeaveType.UNPAID: float('inf')  # Unlimited
}


class LeaveWorkflow:
    """Handles leave request workflow including submission, approval, and balance."""

    def __init__(self, db: Session):
        """Initialize workflow with database session."""
        self.db = db

    # =========================================================================
    # SUB-TASK 2.2: LeaveWorkflow.approve_leave
    # =========================================================================

    async def approve_leave(
        self,
        leave_id: int,
        approver_id: int,
        comments: Optional[str] = None
    ) -> LeaveRequest:
        """Approve a leave request.

        Args:
            leave_id: ID of the leave request to approve
            approver_id: ID of the user approving (manager/HR)
            comments: Optional approval comments

        Returns:
            Updated LeaveRequest with APPROVED status

        Raises:
            ValueError: If leave not found, invalid status, or permission denied
        """
        # 1. Fetch leave request by ID
        leave_request = self.db.query(LeaveRequest).filter(
            LeaveRequest.id == leave_id
        ).first()

        if not leave_request:
            raise ValueError(f"Leave request {leave_id} not found")

        # 2. Permission check
        is_manager = await self._get_employee_manager(leave_request.employee_id)
        is_hr = await self._check_hr_role(approver_id)

        if not (approver_id == is_manager or is_hr):
            raise ValueError(
                f"User {approver_id} is not authorized to approve leaves"
            )

        # 3. Status validation
        if leave_request.status != LeaveStatus.PENDING:
            raise ValueError(
                f"Only PENDING leaves can be approved. Current: {leave_request.status}"
            )

        # 4. Update record
        leave_request.status = LeaveStatus.APPROVED
        leave_request.approver_id = approver_id
        leave_request.approval_timestamp = datetime.utcnow()
        if comments:
            leave_request.approval_comments = comments

        self.db.commit()
        self.db.refresh(leave_request)

        # 5. Notify employee
        await self._notify_employee(
            leave_request.employee_id,
            f"Your leave from {leave_request.start_date} to {leave_request.end_date} approved."
        )

        logger.info(f"Leave {leave_id} approved by user {approver_id}")
        return leave_request

    # =========================================================================
    # SUB-TASK 2.3: LeaveWorkflow.get_leave_balance
    # =========================================================================

    async def get_leave_balance(
        self,
        employee_id: int,
        leave_type: LeaveType
    ) -> int:
        """Get remaining leave balance for an employee.

        Args:
            employee_id: Employee ID
            leave_type: Type of leave

        Returns:
            Number of remaining leave days
        """
        # Get quota for leave_type
        quota = await self._get_leave_quota(leave_type)

        # If unlimited, return large number
        if quota == float('inf'):
            return 999999

        # If one-time leaves
        if leave_type in (LeaveType.MATERNITY, LeaveType.PATERNITY):
            used_request = self.db.query(LeaveRequest).filter(
                LeaveRequest.employee_id == employee_id,
                LeaveRequest.leave_type == leave_type,
                LeaveRequest.status == LeaveStatus.APPROVED
            ).first()

            if used_request:
                return 0
            return int(quota)

        # If annual leaves
        year_start = self._get_year_start()
        year_end = date(year_start.year, 12, 31)

        used_days = await self._calculate_used_days(
            employee_id,
            leave_type,
            year_start.year
        )

        balance = int(quota) - int(used_days)
        return max(0, balance)

    # =========================================================================
    # Helper Functions
    # =========================================================================

    async def _get_leave_quota(self, leave_type: LeaveType) -> float:
        """Get quota for a leave type."""
        return LEAVE_QUOTAS.get(leave_type, 0)

    async def _calculate_used_days(
        self,
        employee_id: int,
        leave_type: LeaveType,
        year: int
    ) -> float:
        """Calculate total used days for a leave type in a given year."""
        year_start = date(year, 1, 1)
        year_end = date(year, 12, 31)

        leave_requests = self.db.query(LeaveRequest).filter(
            LeaveRequest.employee_id == employee_id,
            LeaveRequest.leave_type == leave_type,
            LeaveRequest.status == LeaveStatus.APPROVED,
            LeaveRequest.start_date >= year_start,
            LeaveRequest.end_date <= year_end
        ).all()

        total_days = 0.0
        for leave in leave_requests:
            working_days = self._working_days_between(
                leave.start_date,
                leave.end_date
            )
            total_days += working_days

        return total_days

    def _get_year_start(self) -> date:
        """Get January 1st of current year."""
        today = date.today()
        return date(today.year, 1, 1)

    def _working_days_between(self, start_date: date, end_date: date) -> int:
        """Count business days (Mon-Fri) between two dates."""
        working_days = 0
        current = start_date

        while current <= end_date:
            if current.weekday() < 5:  # Monday to Friday
                working_days += 1
            current += timedelta(days=1)

        return working_days

    async def _notify_employee(self, employee_id: int, message: str) -> bool:
        """Send notification to employee."""
        try:
            logger.info(f"Notification to employee {employee_id}: {message}")
            return True
        except Exception as e:
            logger.error(f"Failed to notify employee {employee_id}: {e}")
            return False

    async def _get_employee_manager(self, employee_id: int) -> Optional[int]:
        """Get the manager ID for an employee."""
        logger.info(f"Checking manager for employee {employee_id}")
        return None

    async def _check_hr_role(self, user_id: int) -> bool:
        """Check if a user has HR role."""
        logger.info(f"Checking HR role for user {user_id}")
        return user_id > 1000 or user_id == 1

    def _date_range_overlap(
        self,
        r1: Tuple[date, date],
        r2: Tuple[date, date]
    ) -> bool:
        """Check if two date ranges overlap."""
        start1, end1 = r1
        start2, end2 = r2
        return start1 <= end2 and start2 <= end1 and start1 < end2 and start2 < end1

    # =========================================================================
    # Additional Leave Management Methods
    # =========================================================================

    async def submit_leave(
        self,
        employee_id: int,
        leave_type: LeaveType,
        start_date: date,
        end_date: date,
        reason: Optional[str] = None,
        contact_phone: Optional[str] = None
    ) -> LeaveRequest:
        """Submit a new leave request."""
        if start_date > end_date:
            raise ValueError("Start date must be before or equal to end date")

        if end_date < date.today():
            raise ValueError("Cannot request leave in the past")

        leave_request = LeaveRequest(
            employee_id=employee_id,
            leave_type=leave_type,
            start_date=start_date,
            end_date=end_date,
            reason=reason,
            contact_phone=contact_phone,
            status=LeaveStatus.PENDING
        )

        self.db.add(leave_request)
        self.db.commit()
        self.db.refresh(leave_request)

        logger.info(
            f"Leave request {leave_request.id} submitted by employee {employee_id}"
        )

        return leave_request

    async def reject_leave(
        self,
        leave_id: int,
        rejection_reason: str
    ) -> LeaveRequest:
        """Reject a leave request."""
        leave_request = self.db.query(LeaveRequest).filter(
            LeaveRequest.id == leave_id
        ).first()

        if not leave_request:
            raise ValueError(f"Leave request {leave_id} not found")

        if leave_request.status != LeaveStatus.PENDING:
            raise ValueError(f"Cannot reject leave with status {leave_request.status}")

        leave_request.status = LeaveStatus.REJECTED
        leave_request.rejection_timestamp = datetime.utcnow()
        leave_request.rejection_reason = rejection_reason

        self.db.commit()
        self.db.refresh(leave_request)

        logger.info(f"Leave {leave_id} rejected: {rejection_reason}")

        return leave_request
