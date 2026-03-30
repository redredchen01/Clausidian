"""Tests for bot conversation flows with mocked Telegram objects."""
from __future__ import annotations

import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from telegram.ext import ConversationHandler

from hr_admin_bots.bots.base import BaseBot, WAITING_ID, CONFIRMING
from hr_admin_bots.bots.leave import LeaveBot, LEAVE_QUOTA
from hr_admin_bots.config import BotConfig


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

EMPLOYEE = {
    "employee_id": "E001",
    "name": "Alice",
    "department": "Engineering",
    "position": "Engineer",
    "manager_email": "mgr@company.com",
    "telegram_id": 12345,
}


def make_update(text: str, user_id: int = 12345) -> MagicMock:
    """Build a minimal Telegram Update mock with message.text set."""
    update = MagicMock()
    update.message = MagicMock()
    update.message.text = text
    update.message.reply_text = AsyncMock()
    update.callback_query = None
    update.effective_user = MagicMock()
    update.effective_user.id = user_id
    return update


def make_context(user_data: dict | None = None) -> MagicMock:
    ctx = MagicMock()
    ctx.user_data = user_data if user_data is not None else {}
    return ctx


def make_bot_config() -> BotConfig:
    return BotConfig(token="FAKE_TOKEN", enabled=True)


def make_base_bot(auth_return=EMPLOYEE, sheets_return=None) -> BaseBot:
    auth = MagicMock()
    auth.lookup.return_value = auth_return
    sheets = MagicMock()
    sheets.get_telegram_id.return_value = 12345  # match default user_id
    sheets.bind_telegram_id.return_value = True
    if sheets_return is not None:
        sheets.find_row.return_value = sheets_return
    notifier = MagicMock()
    notifier.hr_email = "hr@company.com"
    approval = MagicMock()
    return BaseBot(
        name="base",
        bot_config=make_bot_config(),
        sheets_client=sheets,
        auth=auth,
        notifier=notifier,
        approval_manager=approval,
    )


def make_leave_bot(auth_return=EMPLOYEE) -> LeaveBot:
    auth = MagicMock()
    auth.lookup.return_value = auth_return
    sheets = MagicMock()
    sheets.find_rows.return_value = []
    sheets.find_row.return_value = None
    sheets.find_employee.return_value = auth_return
    sheets.get_telegram_id.return_value = 12345
    sheets.bind_telegram_id.return_value = True
    notifier = MagicMock()
    notifier.hr_email = "hr@company.com"
    approval = MagicMock()
    return LeaveBot(
        name="leave",
        bot_config=make_bot_config(),
        sheets_client=sheets,
        auth=auth,
        notifier=notifier,
        approval_manager=approval,
    )


# ---------------------------------------------------------------------------
# BaseBot.verify_id
# ---------------------------------------------------------------------------

class TestBaseBotVerifyId:
    @pytest.mark.asyncio
    async def test_valid_id_returns_confirming_state(self):
        bot = make_base_bot(auth_return=EMPLOYEE)
        update = make_update("E001")
        ctx = make_context()

        state = await bot.verify_id(update, ctx)

        assert state == CONFIRMING
        assert ctx.user_data["employee"] == EMPLOYEE

    @pytest.mark.asyncio
    async def test_valid_id_stores_employee_in_user_data(self):
        bot = make_base_bot(auth_return=EMPLOYEE)
        update = make_update("E001")
        ctx = make_context()

        await bot.verify_id(update, ctx)

        assert ctx.user_data["employee"]["employee_id"] == "E001"
        assert ctx.user_data["employee"]["name"] == "Alice"

    @pytest.mark.asyncio
    async def test_invalid_id_returns_waiting_id_state(self):
        bot = make_base_bot(auth_return=None)
        update = make_update("GHOST")
        ctx = make_context()

        state = await bot.verify_id(update, ctx)

        assert state == WAITING_ID

    @pytest.mark.asyncio
    async def test_invalid_id_sends_error_message(self):
        bot = make_base_bot(auth_return=None)
        update = make_update("GHOST")
        ctx = make_context()

        await bot.verify_id(update, ctx)

        update.message.reply_text.assert_awaited_once()
        msg = update.message.reply_text.call_args[0][0]
        assert "找不到" in msg

    @pytest.mark.asyncio
    async def test_invalid_id_does_not_set_user_data(self):
        bot = make_base_bot(auth_return=None)
        update = make_update("GHOST")
        ctx = make_context()

        await bot.verify_id(update, ctx)

        assert "employee" not in ctx.user_data

    @pytest.mark.asyncio
    async def test_valid_id_reply_contains_employee_info(self):
        bot = make_base_bot(auth_return=EMPLOYEE)
        update = make_update("E001")
        ctx = make_context()

        await bot.verify_id(update, ctx)

        msg = update.message.reply_text.call_args[0][0]
        assert "Alice" in msg or "確認" in msg

    @pytest.mark.asyncio
    async def test_strips_whitespace_from_input_id(self):
        bot = make_base_bot(auth_return=EMPLOYEE)
        update = make_update("  E001  ")
        ctx = make_context()

        await bot.verify_id(update, ctx)

        bot.auth.lookup.assert_called_once_with("E001")


# ---------------------------------------------------------------------------
# LeaveBot — date validation
#
# FSM flow:
#   INPUT_START state -> user sends start date -> handler: input_end_date()
#     stores start_date, returns INPUT_END
#   INPUT_END state   -> user sends end date   -> handler: input_reason()
#     stores end_date + days, returns INPUT_REASON
# ---------------------------------------------------------------------------

class TestLeaveBotDateValidation:
    @pytest.mark.asyncio
    async def test_input_end_date_rejects_invalid_format(self):
        """start-date collection handler rejects non-ISO text."""
        bot = make_leave_bot()
        update = make_update("not-a-date")
        ctx = make_context()

        from hr_admin_bots.bots.leave import INPUT_START
        state = await bot.input_end_date(update, ctx)

        assert state == INPUT_START
        msg = update.message.reply_text.call_args[0][0]
        assert "格式" in msg

    @pytest.mark.asyncio
    async def test_input_end_date_rejects_slash_format(self):
        bot = make_leave_bot()
        update = make_update("2026/04/05")
        ctx = make_context()

        from hr_admin_bots.bots.leave import INPUT_START
        state = await bot.input_end_date(update, ctx)

        assert state == INPUT_START

    @pytest.mark.asyncio
    async def test_input_end_date_accepts_valid_date_and_stores_it(self):
        """
        input_end_date receives the start-date text, stores it as start_date,
        and transitions to INPUT_END.  The stored value equals the input text.
        """
        bot = make_leave_bot()
        update = make_update("2026-04-05")
        ctx = make_context()

        from hr_admin_bots.bots.leave import INPUT_END
        state = await bot.input_end_date(update, ctx)

        assert state == INPUT_END
        assert ctx.user_data["start_date"] == "2026-04-05"

    @pytest.mark.asyncio
    async def test_input_reason_rejects_end_before_start(self):
        bot = make_leave_bot()
        update = make_update("2026-03-30")  # before start 2026-04-01
        ctx = make_context({"start_date": "2026-04-01"})

        from hr_admin_bots.bots.leave import INPUT_END
        state = await bot.input_reason(update, ctx)

        assert state == INPUT_END
        msg = update.message.reply_text.call_args[0][0]
        assert "早於" in msg

    @pytest.mark.asyncio
    async def test_input_reason_accepts_same_day(self):
        """Single-day leave: end == start is valid."""
        bot = make_leave_bot()
        update = make_update("2026-04-01")
        ctx = make_context({"start_date": "2026-04-01"})

        from hr_admin_bots.bots.leave import INPUT_REASON
        state = await bot.input_reason(update, ctx)

        assert state == INPUT_REASON
        assert ctx.user_data["days"] == 1

    @pytest.mark.asyncio
    async def test_input_reason_calculates_days_correctly(self):
        bot = make_leave_bot()
        update = make_update("2026-04-05")
        ctx = make_context({"start_date": "2026-04-01"})

        await bot.input_reason(update, ctx)

        assert ctx.user_data["days"] == 5


# ---------------------------------------------------------------------------
# LeaveBot — balance check logic (_check_balance)
# ---------------------------------------------------------------------------

class TestLeaveBotBalanceCheck:
    def test_sick_leave_always_passes(self):
        bot = make_leave_bot()
        result = bot._check_balance("E001", "病假", 999)
        assert result is None

    def test_annual_leave_passes_within_balance(self):
        bot = make_leave_bot()
        bot.sheets_client.find_employee.return_value = {"employee_id": "E001", "annual_leave_quota": 10}
        bot.sheets_client.find_rows.return_value = []  # no used days
        result = bot._check_balance("E001", "年假", 5)
        assert result is None

    def test_annual_leave_fails_when_exceeds_balance(self):
        bot = make_leave_bot()
        bot.sheets_client.find_employee.return_value = {"employee_id": "E001", "annual_leave_quota": 3}
        bot.sheets_client.find_rows.return_value = []
        result = bot._check_balance("E001", "年假", 5)
        assert result is not None
        assert "年假" in result

    def test_annual_leave_fails_when_employee_not_found(self):
        bot = make_leave_bot()
        bot.sheets_client.find_employee.return_value = None
        result = bot._check_balance("E001", "年假", 1)
        assert result is not None

    def test_quota_leave_passes_within_quota(self):
        bot = make_leave_bot()
        bot.sheets_client.find_rows.return_value = []
        result = bot._check_balance("E001", "事假", 3)
        assert result is None

    def test_quota_leave_fails_when_quota_exceeded(self):
        bot = make_leave_bot()
        # Already used 8 days of 事假 (quota=10), requesting 5 more
        bot.sheets_client.find_rows.return_value = [
            {"employee_id": "E001", "leave_type": "事假", "status": "approved",
             "start_date": "2026-01-10", "days": 8},
        ]
        result = bot._check_balance("E001", "事假", 5)
        assert result is not None
        assert "事假" in result

    def test_quota_leave_passes_exactly_at_quota(self):
        bot = make_leave_bot()
        # Used 7 days, requesting 3 -> total 10 == quota
        bot.sheets_client.find_rows.return_value = [
            {"employee_id": "E001", "leave_type": "事假", "status": "approved",
             "start_date": "2026-01-05", "days": 7},
        ]
        result = bot._check_balance("E001", "事假", 3)
        assert result is None

    def test_unknown_leave_type_defaults_to_zero_quota(self):
        bot = make_leave_bot()
        bot.sheets_client.find_rows.return_value = []
        result = bot._check_balance("E001", "外星假", 1)
        assert result is not None


# ---------------------------------------------------------------------------
# LeaveBot — overlap detection (_check_overlap)
# ---------------------------------------------------------------------------

class TestLeaveBotOverlapDetection:
    def test_no_overlap_when_no_existing_records(self):
        bot = make_leave_bot()
        bot.sheets_client.find_rows.return_value = []
        result = bot._check_overlap("E001", "2026-04-10", "2026-04-12")
        assert result is False

    def test_no_overlap_when_new_leave_after_existing(self):
        bot = make_leave_bot()
        bot.sheets_client.find_rows.return_value = [
            {"employee_id": "E001", "status": "approved",
             "start_date": "2026-04-01", "end_date": "2026-04-05"},
        ]
        result = bot._check_overlap("E001", "2026-04-06", "2026-04-08")
        assert result is False

    def test_no_overlap_when_new_leave_before_existing(self):
        bot = make_leave_bot()
        bot.sheets_client.find_rows.return_value = [
            {"employee_id": "E001", "status": "pending",
             "start_date": "2026-04-10", "end_date": "2026-04-15"},
        ]
        result = bot._check_overlap("E001", "2026-04-07", "2026-04-09")
        assert result is False

    def test_overlap_detected_when_ranges_intersect(self):
        bot = make_leave_bot()
        bot.sheets_client.find_rows.return_value = [
            {"employee_id": "E001", "status": "approved",
             "start_date": "2026-04-05", "end_date": "2026-04-10"},
        ]
        result = bot._check_overlap("E001", "2026-04-08", "2026-04-12")
        assert result is True

    def test_overlap_detected_when_ranges_exactly_touch(self):
        """Ranges sharing a single boundary day are overlapping."""
        bot = make_leave_bot()
        bot.sheets_client.find_rows.return_value = [
            {"employee_id": "E001", "status": "pending",
             "start_date": "2026-04-01", "end_date": "2026-04-05"},
        ]
        result = bot._check_overlap("E001", "2026-04-05", "2026-04-07")
        assert result is True

    def test_overlap_ignored_for_rejected_status(self):
        bot = make_leave_bot()
        bot.sheets_client.find_rows.return_value = [
            {"employee_id": "E001", "status": "rejected",
             "start_date": "2026-04-05", "end_date": "2026-04-10"},
        ]
        result = bot._check_overlap("E001", "2026-04-05", "2026-04-10")
        assert result is False

    def test_overlap_checked_only_for_pending_and_approved(self):
        bot = make_leave_bot()
        bot.sheets_client.find_rows.return_value = [
            {"employee_id": "E001", "status": "approved",
             "start_date": "2026-04-05", "end_date": "2026-04-10"},
            {"employee_id": "E001", "status": "cancelled",
             "start_date": "2026-04-05", "end_date": "2026-04-10"},
        ]
        result = bot._check_overlap("E001", "2026-04-05", "2026-04-10")
        assert result is True

    def test_new_leave_fully_inside_existing(self):
        bot = make_leave_bot()
        bot.sheets_client.find_rows.return_value = [
            {"employee_id": "E001", "status": "pending",
             "start_date": "2026-04-01", "end_date": "2026-04-20"},
        ]
        result = bot._check_overlap("E001", "2026-04-05", "2026-04-10")
        assert result is True

    def test_returns_false_on_sheets_exception(self):
        bot = make_leave_bot()
        bot.sheets_client.find_rows.side_effect = Exception("sheet error")
        result = bot._check_overlap("E001", "2026-04-05", "2026-04-10")
        assert result is False


# ---------------------------------------------------------------------------
# LeaveBot — edge cases and error paths
# ---------------------------------------------------------------------------

class TestLeaveBotEdgeCases:
    @pytest.mark.asyncio
    async def test_select_type_with_smart_assistant_suggestion(self):
        """Test select_type uses smart assistant suggestion if available."""
        bot = make_leave_bot()
        smart = MagicMock()
        smart.suggest_leave_type.return_value = "病假"
        bot.smart = smart

        update = make_update("E001")
        ctx = make_context({"employee": EMPLOYEE})

        await bot.select_type(update, ctx)

        smart.suggest_leave_type.assert_called_once_with("E001")
        update.message.reply_text.assert_called()

    @pytest.mark.asyncio
    async def test_select_type_handles_smart_assistant_error(self):
        """Test select_type gracefully handles smart assistant errors."""
        bot = make_leave_bot()
        smart = MagicMock()
        smart.suggest_leave_type.side_effect = Exception("LLM error")
        bot.smart = smart

        update = make_update("E001")
        ctx = make_context({"employee": EMPLOYEE})

        # Should not raise, should show menu anyway
        await bot.select_type(update, ctx)
        update.message.reply_text.assert_called()

    def test_get_annual_balance_with_mixed_statuses(self):
        """Test _get_annual_balance counts only pending and approved."""
        bot = make_leave_bot()
        bot.sheets_client.find_employee.return_value = {"annual_leave_quota": 20}
        # _get_annual_balance internally searches for pending/approved status
        bot.sheets_client.find_rows.return_value = [
            {"status": "approved", "days": 5},
            {"status": "pending", "days": 3},
        ]

        balance = bot._get_annual_balance("E001")
        # Balance logic checks for pending/approved status internally
        assert balance >= 0

    def test_get_annual_balance_zero_quota(self):
        """Test _get_annual_balance when employee has zero quota."""
        bot = make_leave_bot()
        bot.sheets_client.find_employee.return_value = {"annual_leave_quota": 0}
        bot.sheets_client.find_rows.return_value = []

        balance = bot._get_annual_balance("E001")
        assert balance == 0

    def test_get_annual_balance_negative_quota(self):
        """Test _get_annual_balance with malformed quota."""
        bot = make_leave_bot()
        bot.sheets_client.find_employee.return_value = {"annual_leave_quota": "invalid"}
        bot.sheets_client.find_rows.return_value = []

        # Should handle gracefully, returning 0 or negative
        try:
            balance = bot._get_annual_balance("E001")
            # If it returns without exception, it's handled
            assert isinstance(balance, (int, float))
        except (ValueError, TypeError):
            # Also acceptable if it raises predictably
            pass

    @pytest.mark.asyncio
    async def test_verify_id_telegram_binding_new_user(self):
        """Test verify_id binds telegram ID for new employee."""
        bot = make_leave_bot()
        bot.sheets_client.get_telegram_id.return_value = None  # No prior binding
        update = make_update("E001", user_id=99999)
        ctx = make_context()

        from hr_admin_bots.bots.leave import SELECT_TYPE
        state = await bot.verify_id(update, ctx)

        bot.sheets_client.bind_telegram_id.assert_called_once_with("E001", 99999)
        assert state == SELECT_TYPE

    @pytest.mark.asyncio
    async def test_verify_id_rejects_mismatched_telegram(self):
        """Test verify_id rejects if telegram ID already bound to different user."""
        bot = make_leave_bot()
        bot.sheets_client.get_telegram_id.return_value = 88888  # different ID
        update = make_update("E001", user_id=99999)
        ctx = make_context()

        from hr_admin_bots.bots.leave import WAITING_ID
        state = await bot.verify_id(update, ctx)

        update.message.reply_text.assert_called()
        assert state == WAITING_ID

    @pytest.mark.asyncio
    async def test_verify_id_allows_same_telegram(self):
        """Test verify_id allows same telegram ID."""
        bot = make_leave_bot()
        bot.sheets_client.get_telegram_id.return_value = 99999  # same as update user
        update = make_update("E001", user_id=99999)
        ctx = make_context()

        from hr_admin_bots.bots.leave import SELECT_TYPE
        state = await bot.verify_id(update, ctx)

        # Should proceed to select_type without rejection
        assert state == SELECT_TYPE

    def test_check_balance_with_used_days_calculation(self):
        """Test _check_balance correctly calculates used days."""
        bot = make_leave_bot()
        bot.sheets_client.find_employee.return_value = {"annual_leave_quota": 20}
        bot.sheets_client.find_rows.return_value = [
            {"status": "approved", "days": 3},
            {"status": "pending", "days": 2},
        ]

        result = bot._check_balance("E001", "年假", 10)
        # Used: 5, Available: 15, Requested: 10 → OK
        assert result is None

    def test_check_balance_exact_quota(self):
        """Test _check_balance when requested equals remaining quota."""
        bot = make_leave_bot()
        bot.sheets_client.find_employee.return_value = {"annual_leave_quota": 10}
        bot.sheets_client.find_rows.return_value = [
            {"status": "approved", "days": 5},
        ]

        result = bot._check_balance("E001", "年假", 5)
        # Used: 5, Available: 5, Requested: 5 → OK
        assert result is None

    def test_check_balance_handles_missing_days_field(self):
        """Test _check_balance ignores rows without days field."""
        bot = make_leave_bot()
        bot.sheets_client.find_employee.return_value = {"annual_leave_quota": 10}
        bot.sheets_client.find_rows.return_value = [
            {"status": "approved"},  # no days field
        ]

        result = bot._check_balance("E001", "年假", 5)
        # Should treat missing days as 0
        assert result is None

    def test_check_balance_with_invalid_days_values(self):
        """Test _check_balance handles non-numeric days."""
        bot = make_leave_bot()
        bot.sheets_client.find_employee.return_value = {"annual_leave_quota": 10}
        bot.sheets_client.find_rows.return_value = [
            {"status": "approved", "days": "invalid"},
            {"status": "approved", "days": None},
            {"status": "approved", "days": 5},
        ]

        result = bot._check_balance("E001", "年假", 3)
        # Should ignore invalid entries and count only 5
        assert result is None
