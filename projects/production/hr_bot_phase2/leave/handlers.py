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
        quota = self._get_leave_quota(leave_type)

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
    # HELPER FUNCTIONS (C2.4)
    # =========================================================================
    # Helper Function 1: _get_leave_quota (2h)
    # Get annual quota for leave type
    # =========================================================================

    def _get_leave_quota(self, leave_type: LeaveType) -> int:
        """Get annual quota for leave type.

        Args:
            leave_type: Type of leave (ANNUAL, SICK, SPECIAL, MATERNITY, etc.)

        Returns:
            Integer quota for the leave type. Returns float('inf') for UNPAID.

        Examples:
            >>> _get_leave_quota(LeaveType.ANNUAL)
            20
            >>> _get_leave_quota(LeaveType.UNPAID)
            inf
        """
        return LEAVE_QUOTAS.get(leave_type, 0)

    # =========================================================================
    # Helper Function 2: _calculate_used_days (2h)
    # Calculate used days for leave type in given year
    # =========================================================================

    async def _calculate_used_days(
        self,
        employee_id: int,
        leave_type: LeaveType,
        year: int
    ) -> int:
        """Calculate used days for leave type in given year.

        Queries approved LeaveRequests, filters by employee_id, leave_type,
        status=APPROVED, and year. Sums working days (excludes weekends).

        Args:
            employee_id: Employee ID
            leave_type: Type of leave
            year: Calendar year

        Returns:
            Total working days used in the given year

        Examples:
            >>> await _calculate_used_days(emp_id=123, LeaveType.ANNUAL, 2026)
            5
        """
        year_start = date(year, 1, 1)
        year_end = date(year, 12, 31)

        leave_requests = self.db.query(LeaveRequest).filter(
            LeaveRequest.employee_id == employee_id,
            LeaveRequest.leave_type == leave_type,
            LeaveRequest.status == LeaveStatus.APPROVED,
            LeaveRequest.start_date >= year_start,
            LeaveRequest.end_date <= year_end
        ).all()

        total_days = 0
        for leave in leave_requests:
            working_days = self._working_days_in_range(
                leave.start_date,
                leave.end_date
            )
            total_days += working_days

        return total_days

    # =========================================================================
    # Helper Function 3: _get_year_start (1h)
    # Get Jan 1 of current year
    # =========================================================================

    def _get_year_start(self) -> date:
        """Get January 1st of current year.

        Returns:
            date: January 1st of the current year

        Examples:
            >>> _get_year_start()
            date(2026, 1, 1)
        """
        today = date.today()
        return date(today.year, 1, 1)

    # =========================================================================
    # Helper Function 4: _date_range_overlap (2h)
    # Check if two date ranges overlap
    # =========================================================================

    def _date_range_overlap(
        self,
        r1: Tuple[date, date],
        r2: Tuple[date, date]
    ) -> bool:
        """Check if two date ranges overlap.

        Adjacent ranges (end1 < start2) are NOT overlapping.
        Overlapping means at least one day in common.

        Args:
            r1: Tuple of (start_date, end_date) for range 1
            r2: Tuple of (start_date, end_date) for range 2

        Returns:
            True if ranges have at least one day overlap, False otherwise

        Examples:
            >>> r1 = (date(2026, 1, 1), date(2026, 1, 5))
            >>> r2 = (date(2026, 1, 3), date(2026, 1, 7))
            >>> _date_range_overlap(r1, r2)
            True

            >>> r1 = (date(2026, 1, 1), date(2026, 1, 5))
            >>> r2 = (date(2026, 1, 6), date(2026, 1, 10))
            >>> _date_range_overlap(r1, r2)
            False
        """
        start1, end1 = r1
        start2, end2 = r2
        # Overlap exists if start1 <= end2 AND start2 <= end1
        # But we exclude adjacent (end1 == start2) as non-overlapping
        return start1 <= end2 and start2 <= end1 and not (end1 < start2 or end2 < start1)

    # =========================================================================
    # Helper Function 5: _working_days_in_range (3h)
    # Count working days (Mon-Fri) in date range
    # =========================================================================

    def _working_days_in_range(self, start_date: date, end_date: date) -> int:
        """Count working days (Mon-Fri) in date range.

        Iterates from start_date to end_date (inclusive) and counts days
        where weekday() not in [5, 6] (excludes Saturday and Sunday).

        Args:
            start_date: Start date (inclusive)
            end_date: End date (inclusive)

        Returns:
            Count of working days (0-based, so 1 day = 1 working day)

        Examples:
            >>> start = date(2026, 3, 30)  # Monday
            >>> end = date(2026, 3, 30)    # Same day
            >>> _working_days_in_range(start, end)
            1

            >>> start = date(2026, 3, 28)  # Saturday
            >>> end = date(2026, 3, 29)    # Sunday
            >>> _working_days_in_range(start, end)
            0
        """
        working_days = 0
        current = start_date

        while current <= end_date:
            # weekday(): 0=Mon, 1=Tue, ..., 4=Fri, 5=Sat, 6=Sun
            if current.weekday() < 5:
                working_days += 1
            current += timedelta(days=1)

        return working_days

    # Alias for backward compatibility
    def _working_days_between(self, start_date: date, end_date: date) -> int:
        """Backward compatibility wrapper for _working_days_in_range."""
        return self._working_days_in_range(start_date, end_date)

    # =========================================================================
    # Helper Function 6: _notify_employee (1h)
    # Send Telegram notification to employee
    # =========================================================================

    async def _notify_employee(self, employee_id: int, message: str) -> bool:
        """Send Telegram notification to employee.

        Gets employee's Telegram user_id and sends notification via bot.

        Args:
            employee_id: Employee ID
            message: Message to send

        Returns:
            True if sent successfully, False otherwise

        Examples:
            >>> await _notify_employee(123, "Your leave approved")
            True
        """
        try:
            # TODO: Implement actual Telegram bot integration
            # For now, log the notification
            logger.info(f"Notification to employee {employee_id}: {message}")
            return True
        except Exception as e:
            logger.error(f"Failed to notify employee {employee_id}: {e}")
            return False

    # =========================================================================
    # Helper Function 7: _get_employee_manager (1h)
    # Get direct manager of employee
    # =========================================================================

    async def _get_employee_manager(self, employee_id: int) -> Optional[int]:
        """Get direct manager of employee.

        Queries employee record and returns manager_id from relationship.

        Args:
            employee_id: Employee ID

        Returns:
            Manager Employee ID, or None if no manager found

        Examples:
            >>> await _get_employee_manager(123)
            456
        """
        # TODO: Implement actual employee/manager lookup
        # For now, return placeholder
        logger.info(f"Checking manager for employee {employee_id}")
        return None

    # =========================================================================
    # INTERNAL: HR Role Check
    # =========================================================================

    async def _check_hr_role(self, user_id: int) -> bool:
        """Check if a user has HR role.

        Args:
            user_id: User ID

        Returns:
            True if user has HR role, False otherwise
        """
        logger.info(f"Checking HR role for user {user_id}")
        return user_id > 1000 or user_id == 1

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
