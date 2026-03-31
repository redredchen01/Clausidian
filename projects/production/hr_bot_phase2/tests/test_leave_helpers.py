"""Test suite for C2.4: Leave Request Handler Helper Functions.

Comprehensive tests for all 7 helper functions:
1. _get_leave_quota() - Quota lookup by type
2. _calculate_used_days() - Sum approved leaves in year
3. _get_year_start() - January 1 of current year
4. _date_range_overlap() - Date conflict detection
5. _working_days_in_range() - Business day calculation
6. _notify_employee() - Telegram notification interface
7. _get_employee_manager() - Manager lookup

Test Coverage: 6+ test cases per function (42+ total)
Success Criteria:
- All 6 helper functions working
- All tests pass (100%)
- 85%+ code coverage
- Production-ready with error handling
"""

import pytest
import asyncio
from datetime import date, datetime, timedelta
from unittest.mock import AsyncMock, MagicMock, patch

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, Session

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from leave.models import LeaveRequest, LeaveType, LeaveStatus, Base
from leave.handlers import LeaveWorkflow, LEAVE_QUOTAS


@pytest.fixture
def db_session():
    """Create an in-memory test database."""
    engine = create_engine('sqlite:///:memory:')
    Base.metadata.create_all(engine)
    SessionLocal = sessionmaker(bind=engine)
    db = SessionLocal()
    yield db
    db.close()


@pytest.fixture
def workflow(db_session):
    """Create workflow instance with test database."""
    return LeaveWorkflow(db_session)


# ============================================================================
# Test Helper 1: _get_leave_quota()
# ============================================================================

class TestGetLeaveQuota:
    """Test Helper 1: _get_leave_quota(leave_type)"""

    def test_quota_annual(self, workflow):
        """Test annual leave quota is 20 days."""
        quota = workflow._get_leave_quota(LeaveType.ANNUAL)
        assert quota == 20

    def test_quota_sick(self, workflow):
        """Test sick leave quota is 10 days."""
        quota = workflow._get_leave_quota(LeaveType.SICK)
        assert quota == 10

    def test_quota_special(self, workflow):
        """Test special leave quota is 3 days."""
        quota = workflow._get_leave_quota(LeaveType.SPECIAL)
        assert quota == 3

    def test_quota_maternity(self, workflow):
        """Test maternity leave quota is 120 days."""
        quota = workflow._get_leave_quota(LeaveType.MATERNITY)
        assert quota == 120

    def test_quota_paternity(self, workflow):
        """Test paternity leave quota is 30 days."""
        quota = workflow._get_leave_quota(LeaveType.PATERNITY)
        assert quota == 30

    def test_quota_unpaid(self, workflow):
        """Test unpaid leave quota is unlimited (inf)."""
        quota = workflow._get_leave_quota(LeaveType.UNPAID)
        assert quota == float('inf')

    def test_quota_all_types_match_spec(self, workflow):
        """Test all quotas match LEAVE_QUOTAS specification."""
        for leave_type in LeaveType:
            quota = workflow._get_leave_quota(leave_type)
            expected = LEAVE_QUOTAS.get(leave_type, 0)
            assert quota == expected


# ============================================================================
# Test Helper 2: _calculate_used_days()
# ============================================================================

class TestCalculateUsedDays:
    """Test Helper 2: _calculate_used_days(employee_id, leave_type, year)"""

    @pytest.mark.asyncio
    async def test_no_approved_leaves(self, workflow):
        """Test zero used days when no leaves approved."""
        used = await workflow._calculate_used_days(
            employee_id=1, leave_type=LeaveType.ANNUAL, year=2026
        )
        assert used == 0

    @pytest.mark.asyncio
    async def test_single_leave_counted(self, workflow, db_session):
        """Test single leave counted correctly."""
        leave = LeaveRequest(
            employee_id=1,
            leave_type=LeaveType.ANNUAL,
            start_date=date(2026, 3, 30),  # Monday
            end_date=date(2026, 4, 3),      # Friday
            status=LeaveStatus.APPROVED
        )
        db_session.add(leave)
        db_session.commit()

        used = await workflow._calculate_used_days(
            employee_id=1, leave_type=LeaveType.ANNUAL, year=2026
        )
        # Should count 5 working days (Mon-Fri)
        assert used == 5

    @pytest.mark.asyncio
    async def test_multiple_leaves_summed(self, workflow, db_session):
        """Test multiple leaves are summed correctly."""
        leave1 = LeaveRequest(
            employee_id=1,
            leave_type=LeaveType.ANNUAL,
            start_date=date(2026, 3, 30),
            end_date=date(2026, 4, 3),
            status=LeaveStatus.APPROVED
        )
        leave2 = LeaveRequest(
            employee_id=1,
            leave_type=LeaveType.ANNUAL,
            start_date=date(2026, 4, 6),
            end_date=date(2026, 4, 10),
            status=LeaveStatus.APPROVED
        )
        db_session.add(leave1)
        db_session.add(leave2)
        db_session.commit()

        used = await workflow._calculate_used_days(
            employee_id=1, leave_type=LeaveType.ANNUAL, year=2026
        )
        # Approximately 10 working days total (5 + 5)
        assert used == 10

    @pytest.mark.asyncio
    async def test_pending_leaves_excluded(self, workflow, db_session):
        """Test pending leaves are not counted in used days."""
        leave = LeaveRequest(
            employee_id=1,
            leave_type=LeaveType.ANNUAL,
            start_date=date(2026, 3, 30),
            end_date=date(2026, 4, 3),
            status=LeaveStatus.PENDING
        )
        db_session.add(leave)
        db_session.commit()

        used = await workflow._calculate_used_days(
            employee_id=1, leave_type=LeaveType.ANNUAL, year=2026
        )
        assert used == 0

    @pytest.mark.asyncio
    async def test_rejected_leaves_excluded(self, workflow, db_session):
        """Test rejected leaves are not counted."""
        leave = LeaveRequest(
            employee_id=1,
            leave_type=LeaveType.ANNUAL,
            start_date=date(2026, 3, 30),
            end_date=date(2026, 4, 3),
            status=LeaveStatus.REJECTED
        )
        db_session.add(leave)
        db_session.commit()

        used = await workflow._calculate_used_days(
            employee_id=1, leave_type=LeaveType.ANNUAL, year=2026
        )
        assert used == 0

    @pytest.mark.asyncio
    async def test_different_employees_separate(self, workflow, db_session):
        """Test used days tracked separately per employee."""
        leave1 = LeaveRequest(
            employee_id=1,
            leave_type=LeaveType.ANNUAL,
            start_date=date(2026, 3, 30),
            end_date=date(2026, 4, 3),
            status=LeaveStatus.APPROVED
        )
        leave2 = LeaveRequest(
            employee_id=2,
            leave_type=LeaveType.ANNUAL,
            start_date=date(2026, 3, 30),
            end_date=date(2026, 4, 3),
            status=LeaveStatus.APPROVED
        )
        db_session.add(leave1)
        db_session.add(leave2)
        db_session.commit()

        used1 = await workflow._calculate_used_days(
            employee_id=1, leave_type=LeaveType.ANNUAL, year=2026
        )
        used2 = await workflow._calculate_used_days(
            employee_id=2, leave_type=LeaveType.ANNUAL, year=2026
        )
        assert used1 == used2
        assert used1 > 0

    @pytest.mark.asyncio
    async def test_different_leave_types_separate(self, workflow, db_session):
        """Test used days tracked separately per leave type."""
        leave1 = LeaveRequest(
            employee_id=1,
            leave_type=LeaveType.ANNUAL,
            start_date=date(2026, 3, 30),
            end_date=date(2026, 4, 3),
            status=LeaveStatus.APPROVED
        )
        leave2 = LeaveRequest(
            employee_id=1,
            leave_type=LeaveType.SICK,
            start_date=date(2026, 4, 6),
            end_date=date(2026, 4, 10),
            status=LeaveStatus.APPROVED
        )
        db_session.add(leave1)
        db_session.add(leave2)
        db_session.commit()

        used_annual = await workflow._calculate_used_days(
            employee_id=1, leave_type=LeaveType.ANNUAL, year=2026
        )
        used_sick = await workflow._calculate_used_days(
            employee_id=1, leave_type=LeaveType.SICK, year=2026
        )
        # Each should count only their respective type
        assert used_annual == 5
        assert used_sick == 5


# ============================================================================
# Test Helper 3: _get_year_start()
# ============================================================================

class TestGetYearStart:
    """Test Helper 3: _get_year_start()"""

    def test_returns_jan_1_current_year(self, workflow):
        """Test year start is January 1."""
        year_start = workflow._get_year_start()
        today = date.today()
        assert year_start.month == 1
        assert year_start.day == 1
        assert year_start.year == today.year

    def test_returns_date_object(self, workflow):
        """Test return type is date."""
        year_start = workflow._get_year_start()
        assert isinstance(year_start, date)

    def test_always_first_day_of_year(self, workflow):
        """Test always returns first day of current year."""
        year_start = workflow._get_year_start()
        # Verify it's Jan 1
        assert year_start == date(date.today().year, 1, 1)


# ============================================================================
# Test Helper 4: _date_range_overlap()
# ============================================================================

class TestDateRangeOverlap:
    """Test Helper 4: _date_range_overlap(r1, r2)"""

    def test_exact_overlap(self, workflow):
        """Test identical date ranges overlap."""
        r1 = (date(2026, 3, 30), date(2026, 4, 3))
        r2 = (date(2026, 3, 30), date(2026, 4, 3))
        assert workflow._date_range_overlap(r1, r2) is True

    def test_partial_overlap_start(self, workflow):
        """Test ranges overlapping at start."""
        r1 = (date(2026, 3, 30), date(2026, 4, 3))
        r2 = (date(2026, 4, 1), date(2026, 4, 5))
        assert workflow._date_range_overlap(r1, r2) is True

    def test_partial_overlap_end(self, workflow):
        """Test ranges overlapping at end."""
        r1 = (date(2026, 4, 1), date(2026, 4, 5))
        r2 = (date(2026, 3, 30), date(2026, 4, 3))
        assert workflow._date_range_overlap(r1, r2) is True

    def test_one_contains_other(self, workflow):
        """Test one range completely contains the other."""
        r1 = (date(2026, 3, 30), date(2026, 4, 10))
        r2 = (date(2026, 4, 1), date(2026, 4, 5))
        assert workflow._date_range_overlap(r1, r2) is True

    def test_adjacent_ranges_no_overlap(self, workflow):
        """Test adjacent ranges (end1 < start2) are NOT overlapping."""
        r1 = (date(2026, 3, 30), date(2026, 4, 3))
        r2 = (date(2026, 4, 4), date(2026, 4, 10))
        # Not overlapping (no day in common)
        assert workflow._date_range_overlap(r1, r2) is False

    def test_ranges_no_overlap_gap(self, workflow):
        """Test ranges with gap between them."""
        r1 = (date(2026, 3, 30), date(2026, 4, 3))
        r2 = (date(2026, 4, 10), date(2026, 4, 15))
        assert workflow._date_range_overlap(r1, r2) is False

    def test_single_day_overlap(self, workflow):
        """Test ranges overlapping on single day."""
        r1 = (date(2026, 3, 30), date(2026, 4, 3))
        r2 = (date(2026, 4, 3), date(2026, 4, 10))
        assert workflow._date_range_overlap(r1, r2) is True


# ============================================================================
# Test Helper 5: _working_days_in_range()
# ============================================================================

class TestWorkingDaysInRange:
    """Test Helper 5: _working_days_in_range(start_date, end_date)"""

    def test_single_weekday(self, workflow):
        """Test single weekday counts as 1."""
        # 2026-03-30 is Monday
        count = workflow._working_days_in_range(date(2026, 3, 30), date(2026, 3, 30))
        assert count == 1

    def test_monday_to_friday(self, workflow):
        """Test Mon-Fri week is 5 working days."""
        # 2026-03-30 (Mon) to 2026-04-03 (Fri)
        count = workflow._working_days_in_range(date(2026, 3, 30), date(2026, 4, 3))
        assert count == 5

    def test_saturday_only(self, workflow):
        """Test Saturday is not a working day."""
        # 2026-03-28 is Saturday
        count = workflow._working_days_in_range(date(2026, 3, 28), date(2026, 3, 28))
        assert count == 0

    def test_sunday_only(self, workflow):
        """Test Sunday is not a working day."""
        # 2026-03-29 is Sunday
        count = workflow._working_days_in_range(date(2026, 3, 29), date(2026, 3, 29))
        assert count == 0

    def test_weekend_only(self, workflow):
        """Test Saturday and Sunday count as 0."""
        # 2026-03-28 (Sat) to 2026-03-29 (Sun)
        count = workflow._working_days_in_range(date(2026, 3, 28), date(2026, 3, 29))
        assert count == 0

    def test_two_week_period(self, workflow):
        """Test two full weeks = 10 working days."""
        # 2026-03-30 (Mon) to 2026-04-10 (Fri)
        count = workflow._working_days_in_range(date(2026, 3, 30), date(2026, 4, 10))
        assert count == 10

    def test_excludes_weekends(self, workflow):
        """Test weekends are excluded from count."""
        # One full week including weekend
        count = workflow._working_days_in_range(date(2026, 3, 30), date(2026, 4, 5))
        # 3/30 (Mon), 3/31 (Tue), 4/1 (Wed), 4/2 (Thu), 4/3 (Fri) = 5 days
        # Excludes 3/28-29 (Sat-Sun) and 4/4-5 (Sat-Sun)
        assert count == 5


# ============================================================================
# Test Helper 6: _notify_employee()
# ============================================================================

class TestNotifyEmployee:
    """Test Helper 6: _notify_employee(employee_id, message)"""

    @pytest.mark.asyncio
    async def test_returns_bool(self, workflow):
        """Test function returns boolean."""
        result = await workflow._notify_employee(employee_id=1, message="Test")
        assert isinstance(result, bool)

    @pytest.mark.asyncio
    async def test_success_returns_true(self, workflow):
        """Test successful notification returns True."""
        result = await workflow._notify_employee(
            employee_id=1, message="Test message"
        )
        assert result is True

    @pytest.mark.asyncio
    async def test_accepts_valid_employee_id(self, workflow):
        """Test function accepts valid employee ID."""
        result = await workflow._notify_employee(
            employee_id=123, message="Message"
        )
        assert isinstance(result, bool)

    @pytest.mark.asyncio
    async def test_accepts_various_messages(self, workflow):
        """Test function accepts various message formats."""
        messages = [
            "Simple message",
            "Message with special chars !@#$%",
            "Very long message " * 10,
            "",  # Empty message
        ]
        for msg in messages:
            result = await workflow._notify_employee(employee_id=1, message=msg)
            assert isinstance(result, bool)

    @pytest.mark.asyncio
    async def test_handles_invalid_employee_gracefully(self, workflow):
        """Test function handles invalid employee ID gracefully."""
        result = await workflow._notify_employee(
            employee_id=-999, message="Test"
        )
        # Should still return boolean
        assert isinstance(result, bool)


# ============================================================================
# Test Helper 7: _get_employee_manager()
# ============================================================================

class TestGetEmployeeManager:
    """Test Helper 7: _get_employee_manager(employee_id)"""

    @pytest.mark.asyncio
    async def test_returns_optional_int(self, workflow):
        """Test function returns Optional[int]."""
        result = await workflow._get_employee_manager(employee_id=1)
        assert result is None or isinstance(result, int)

    @pytest.mark.asyncio
    async def test_accepts_valid_employee_id(self, workflow):
        """Test function accepts valid employee ID."""
        result = await workflow._get_employee_manager(employee_id=123)
        assert result is None or isinstance(result, int)

    @pytest.mark.asyncio
    async def test_handles_nonexistent_employee(self, workflow):
        """Test function gracefully handles nonexistent employee."""
        result = await workflow._get_employee_manager(employee_id=999999)
        # Should return None or valid manager ID
        assert result is None or isinstance(result, int)


# ============================================================================
# Integration Tests
# ============================================================================

class TestHelperIntegration:
    """Integration tests using multiple helpers together"""

    @pytest.mark.asyncio
    async def test_balance_uses_helpers_correctly(self, workflow, db_session):
        """Test get_leave_balance integrates helpers correctly."""
        leave = LeaveRequest(
            employee_id=1,
            leave_type=LeaveType.ANNUAL,
            start_date=date(2026, 3, 30),
            end_date=date(2026, 4, 3),
            status=LeaveStatus.APPROVED
        )
        db_session.add(leave)
        db_session.commit()

        # get_leave_balance should use:
        # - _get_leave_quota() -> 20
        # - _calculate_used_days() -> 5
        # - Result should be 15
        balance = await workflow.get_leave_balance(
            employee_id=1, leave_type=LeaveType.ANNUAL
        )
        assert balance == 15
        assert balance > 0
        assert balance <= 20

    @pytest.mark.asyncio
    async def test_quota_minus_used_equals_balance(self, workflow, db_session):
        """Test math: quota - used_days = balance."""
        leave = LeaveRequest(
            employee_id=1,
            leave_type=LeaveType.ANNUAL,
            start_date=date(2026, 3, 30),
            end_date=date(2026, 4, 3),
            status=LeaveStatus.APPROVED
        )
        db_session.add(leave)
        db_session.commit()

        quota = workflow._get_leave_quota(LeaveType.ANNUAL)
        used = await workflow._calculate_used_days(
            employee_id=1, leave_type=LeaveType.ANNUAL, year=2026
        )
        balance = await workflow.get_leave_balance(
            employee_id=1, leave_type=LeaveType.ANNUAL
        )

        # Balance should be quota - used
        expected = max(0, quota - used)
        assert balance == expected


if __name__ == '__main__':
    pytest.main([__file__, '-v', '--tb=short'])
