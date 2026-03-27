"""Tests for ReminderScheduler — pending leave and offboarding reminder logic."""
from __future__ import annotations

import asyncio
from datetime import datetime, timedelta
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from hr_admin_bots.scheduler import ReminderScheduler


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def make_scheduler(leave_rows=None, offboarding_rows=None, manager_email="mgr@company.com"):
    sheets = MagicMock()
    notifier = MagicMock()
    notifier.send = MagicMock(return_value=True)
    notifier.notify_hr = MagicMock(return_value=True)

    def find_rows_side_effect(sheet, filters=None):
        filters = filters or {}
        if sheet == "leaves":
            rows = leave_rows if leave_rows is not None else []
            if filters.get("status"):
                return [r for r in rows if r.get("status") == filters["status"]]
            return rows
        if sheet == "offboarding":
            rows = offboarding_rows if offboarding_rows is not None else []
            if filters.get("status"):
                return [r for r in rows if r.get("status") == filters["status"]]
            return rows
        return []

    sheets.find_rows.side_effect = find_rows_side_effect

    def find_employee_side_effect(employee_id):
        return {"employee_id": employee_id, "manager_email": manager_email, "email": "emp@company.com"}

    sheets.find_employee.side_effect = find_employee_side_effect

    scheduler = ReminderScheduler(
        sheets_client=sheets,
        notifier=notifier,
        check_interval_hours=6,
    )
    return scheduler, sheets, notifier


def hours_ago(h: int) -> str:
    return (datetime.now() - timedelta(hours=h)).isoformat()


def hours_from_now(h: int) -> str:
    return (datetime.now() + timedelta(hours=h)).isoformat()


async def _fake_to_thread(fn, *args, **kwargs):
    """Async drop-in for asyncio.to_thread that runs fn synchronously."""
    return fn(*args, **kwargs)


# ---------------------------------------------------------------------------
# _check_pending_leaves — finds old pending leaves and sends reminder
# ---------------------------------------------------------------------------

class TestCheckPendingLeavesOldPending:
    @pytest.mark.asyncio
    async def test_sends_reminder_for_leave_pending_more_than_48h(self):
        old_leave = {
            "employee_id": "E001",
            "name": "Alice",
            "leave_type": "年假",
            "start_date": "2026-04-01",
            "end_date": "2026-04-03",
            "days": 3,
            "status": "pending",
            "apply_date": hours_ago(50),  # 50h > 48h threshold
        }
        scheduler, sheets, notifier = make_scheduler(leave_rows=[old_leave])

        with patch("hr_admin_bots.scheduler.asyncio.to_thread", side_effect=_fake_to_thread):
            await scheduler._check_pending_leaves()

        notifier.send.assert_called_once()

    @pytest.mark.asyncio
    async def test_reminder_sent_to_manager_email(self):
        old_leave = {
            "employee_id": "E001",
            "name": "Alice",
            "leave_type": "年假",
            "start_date": "2026-04-01",
            "end_date": "2026-04-03",
            "days": 3,
            "status": "pending",
            "apply_date": hours_ago(72),
        }
        scheduler, sheets, notifier = make_scheduler(
            leave_rows=[old_leave], manager_email="boss@company.com"
        )

        with patch("hr_admin_bots.scheduler.asyncio.to_thread", side_effect=_fake_to_thread):
            await scheduler._check_pending_leaves()

        call_args = notifier.send.call_args[0]
        assert call_args[0] == "boss@company.com"

    @pytest.mark.asyncio
    async def test_sends_reminder_for_each_old_pending_leave(self):
        leaves = [
            {
                "employee_id": f"E00{i}",
                "name": f"Emp{i}",
                "leave_type": "年假",
                "start_date": "2026-04-01",
                "end_date": "2026-04-03",
                "days": 3,
                "status": "pending",
                "apply_date": hours_ago(60),
            }
            for i in range(3)
        ]
        scheduler, sheets, notifier = make_scheduler(leave_rows=leaves)

        with patch("hr_admin_bots.scheduler.asyncio.to_thread", side_effect=_fake_to_thread):
            await scheduler._check_pending_leaves()

        assert notifier.send.call_count == 3


# ---------------------------------------------------------------------------
# _check_pending_leaves — skips recent pending leaves
# ---------------------------------------------------------------------------

class TestCheckPendingLeavesSkipsRecent:
    @pytest.mark.asyncio
    async def test_skips_leave_pending_less_than_48h(self):
        recent_leave = {
            "employee_id": "E001",
            "name": "Alice",
            "leave_type": "年假",
            "start_date": "2026-04-01",
            "end_date": "2026-04-03",
            "days": 3,
            "status": "pending",
            "apply_date": hours_ago(10),  # 10h < 48h threshold
        }
        scheduler, sheets, notifier = make_scheduler(leave_rows=[recent_leave])

        with patch("hr_admin_bots.scheduler.asyncio.to_thread", side_effect=_fake_to_thread):
            await scheduler._check_pending_leaves()

        notifier.send.assert_not_called()

    @pytest.mark.asyncio
    async def test_skips_leave_with_missing_apply_date(self):
        leave_no_date = {
            "employee_id": "E001",
            "name": "Alice",
            "leave_type": "年假",
            "status": "pending",
            "apply_date": "",
        }
        scheduler, sheets, notifier = make_scheduler(leave_rows=[leave_no_date])

        with patch("hr_admin_bots.scheduler.asyncio.to_thread", side_effect=_fake_to_thread):
            await scheduler._check_pending_leaves()

        notifier.send.assert_not_called()

    @pytest.mark.asyncio
    async def test_skips_leave_with_invalid_apply_date(self):
        leave_bad_date = {
            "employee_id": "E001",
            "name": "Alice",
            "leave_type": "年假",
            "status": "pending",
            "apply_date": "NOT_A_DATE",
        }
        scheduler, sheets, notifier = make_scheduler(leave_rows=[leave_bad_date])

        with patch("hr_admin_bots.scheduler.asyncio.to_thread", side_effect=_fake_to_thread):
            await scheduler._check_pending_leaves()

        notifier.send.assert_not_called()


# ---------------------------------------------------------------------------
# _check_pending_leaves — skips approved leaves
# ---------------------------------------------------------------------------

class TestCheckPendingLeavesSkipsApproved:
    @pytest.mark.asyncio
    async def test_does_not_remind_for_approved_leaves(self):
        approved_leave = {
            "employee_id": "E001",
            "name": "Alice",
            "leave_type": "年假",
            "start_date": "2026-04-01",
            "end_date": "2026-04-03",
            "days": 3,
            "status": "approved",
            "apply_date": hours_ago(72),
        }
        scheduler, sheets, notifier = make_scheduler(leave_rows=[approved_leave])

        with patch("hr_admin_bots.scheduler.asyncio.to_thread", side_effect=_fake_to_thread):
            await scheduler._check_pending_leaves()

        notifier.send.assert_not_called()

    @pytest.mark.asyncio
    async def test_does_not_remind_for_rejected_leaves(self):
        rejected_leave = {
            "employee_id": "E001",
            "name": "Alice",
            "leave_type": "年假",
            "status": "rejected",
            "apply_date": hours_ago(72),
        }
        scheduler, sheets, notifier = make_scheduler(leave_rows=[rejected_leave])

        with patch("hr_admin_bots.scheduler.asyncio.to_thread", side_effect=_fake_to_thread):
            await scheduler._check_pending_leaves()

        notifier.send.assert_not_called()


# ---------------------------------------------------------------------------
# _check_pending_leaves — no manager email → fallback to HR
# ---------------------------------------------------------------------------

class TestCheckPendingLeavesNoManager:
    @pytest.mark.asyncio
    async def test_falls_back_to_notify_hr_when_no_manager_email(self):
        old_leave = {
            "employee_id": "E001",
            "name": "Alice",
            "leave_type": "年假",
            "start_date": "2026-04-01",
            "end_date": "2026-04-03",
            "days": 3,
            "status": "pending",
            "apply_date": hours_ago(50),
        }
        scheduler, sheets, notifier = make_scheduler(
            leave_rows=[old_leave], manager_email=""
        )

        with patch("hr_admin_bots.scheduler.asyncio.to_thread", side_effect=_fake_to_thread):
            await scheduler._check_pending_leaves()

        notifier.notify_hr.assert_called_once()
        notifier.send.assert_not_called()


# ---------------------------------------------------------------------------
# _check_pending_offboarding — sends reminder for old pending
# ---------------------------------------------------------------------------

class TestCheckPendingOffboarding:
    @pytest.mark.asyncio
    async def test_sends_hr_reminder_for_offboarding_pending_more_than_72h(self):
        old_offboarding = {
            "employee_id": "E002",
            "name": "Bob",
            "status": "pending",
            "submit_date": hours_ago(80),  # 80h > 72h threshold
        }
        scheduler, sheets, notifier = make_scheduler(offboarding_rows=[old_offboarding])

        with patch("hr_admin_bots.scheduler.asyncio.to_thread", side_effect=_fake_to_thread):
            await scheduler._check_pending_offboarding()

        notifier.notify_hr.assert_called_once()

    @pytest.mark.asyncio
    async def test_skips_offboarding_pending_less_than_72h(self):
        recent_offboarding = {
            "employee_id": "E002",
            "name": "Bob",
            "status": "pending",
            "submit_date": hours_ago(30),  # 30h < 72h threshold
        }
        scheduler, sheets, notifier = make_scheduler(offboarding_rows=[recent_offboarding])

        with patch("hr_admin_bots.scheduler.asyncio.to_thread", side_effect=_fake_to_thread):
            await scheduler._check_pending_offboarding()

        notifier.notify_hr.assert_not_called()

    @pytest.mark.asyncio
    async def test_skips_approved_offboarding(self):
        approved_offboarding = {
            "employee_id": "E002",
            "name": "Bob",
            "status": "approved",
            "submit_date": hours_ago(80),
        }
        scheduler, sheets, notifier = make_scheduler(offboarding_rows=[approved_offboarding])

        with patch("hr_admin_bots.scheduler.asyncio.to_thread", side_effect=_fake_to_thread):
            await scheduler._check_pending_offboarding()

        notifier.notify_hr.assert_not_called()

    @pytest.mark.asyncio
    async def test_skips_offboarding_with_missing_submit_date(self):
        offboarding_no_date = {
            "employee_id": "E002",
            "name": "Bob",
            "status": "pending",
            "submit_date": "",
        }
        scheduler, sheets, notifier = make_scheduler(offboarding_rows=[offboarding_no_date])

        with patch("hr_admin_bots.scheduler.asyncio.to_thread", side_effect=_fake_to_thread):
            await scheduler._check_pending_offboarding()

        notifier.notify_hr.assert_not_called()

    @pytest.mark.asyncio
    async def test_falls_back_to_apply_date_when_no_submit_date(self):
        offboarding_apply_date = {
            "employee_id": "E002",
            "name": "Bob",
            "status": "pending",
            "apply_date": hours_ago(80),  # uses apply_date as fallback
        }
        scheduler, sheets, notifier = make_scheduler(offboarding_rows=[offboarding_apply_date])

        with patch("hr_admin_bots.scheduler.asyncio.to_thread", side_effect=_fake_to_thread):
            await scheduler._check_pending_offboarding()

        notifier.notify_hr.assert_called_once()
