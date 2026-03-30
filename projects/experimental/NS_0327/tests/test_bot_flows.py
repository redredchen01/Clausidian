"""Tests for bot submit/verify_id flows: onboarding, work_permit, offboarding, leave."""
from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock

import pytest

from telegram.ext import ConversationHandler

from hr_admin_bots.bots.onboarding import OnboardingBot
from hr_admin_bots.bots.work_permit import WorkPermitBot
from hr_admin_bots.bots.offboarding import OffboardingBot
from hr_admin_bots.bots.leave import LeaveBot


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def make_update(text: str, user_id: int = 12345):
    update = MagicMock()
    update.message = MagicMock()
    update.message.text = text
    update.message.reply_text = AsyncMock()
    update.effective_user = MagicMock()
    update.effective_user.id = user_id
    update.get_bot = MagicMock()
    update.callback_query = None
    return update


def make_context(user_data: dict | None = None):
    ctx = MagicMock()
    ctx.user_data = user_data or {}
    ctx.bot = MagicMock()
    return ctx


EMPLOYEE = {
    "employee_id": "E001",
    "name": "Alice",
    "department": "Engineering",
    "position": "Engineer",
    "email": "alice@company.com",
    "manager_email": "boss@company.com",
    "annual_leave_quota": 15,
}

BOT_CONFIG = MagicMock()
BOT_CONFIG.token = "fake_token"


def make_sheets():
    sheets = MagicMock()
    sheets.get_telegram_id.return_value = None
    sheets.bind_telegram_id.return_value = True
    sheets.find_row.return_value = None
    sheets.find_rows.return_value = []
    sheets.append_row.return_value = None
    ws = MagicMock()
    ws.get_all_records.return_value = []
    sheets.get_worksheet.return_value = ws
    return sheets


def make_notifier():
    notifier = MagicMock()
    notifier.hr_email = "hr@company.com"
    notifier.send_async = AsyncMock()
    return notifier


def make_auth(employee=EMPLOYEE):
    auth = MagicMock()
    auth.lookup.return_value = employee
    return auth


# ---------------------------------------------------------------------------
# OnboardingBot
# ---------------------------------------------------------------------------

class TestOnboardingBotSubmit:

    def _make_bot(self, **kwargs):
        sheets = kwargs.pop("sheets", make_sheets())
        return OnboardingBot(
            name="onboarding",
            bot_config=BOT_CONFIG,
            sheets_client=sheets,
            auth=make_auth(),
            notifier=make_notifier(),
        ), sheets

    @pytest.mark.asyncio
    async def test_submit_with_confirm_writes_row_and_notifies(self):
        bot, sheets = self._make_bot()
        update = make_update("送出")
        ctx = make_context({"employee": EMPLOYEE})

        result = await bot.submit(update, ctx)

        sheets.append_row.assert_called_once()
        call_args = sheets.append_row.call_args
        assert call_args[0][0] == "onboarding"
        row = call_args[0][1]
        assert row["employee_id"] == "E001"
        assert row["status"] == "completed"

        update.message.reply_text.assert_called()
        assert result == ConversationHandler.END

    @pytest.mark.asyncio
    async def test_submit_with_other_text_asks_again(self):
        bot, sheets = self._make_bot()
        update = make_update("還沒決定")
        ctx = make_context({"employee": EMPLOYEE})

        from hr_admin_bots.bots.onboarding import SUBMITTING
        result = await bot.submit(update, ctx)

        sheets.append_row.assert_not_called()
        assert result == SUBMITTING
        update.message.reply_text.assert_called()

    @pytest.mark.asyncio
    async def test_verify_id_binding_conflict_returns_waiting(self):
        sheets = make_sheets()
        sheets.get_telegram_id.return_value = 99999  # someone else
        bot = OnboardingBot(
            name="onboarding",
            bot_config=BOT_CONFIG,
            sheets_client=sheets,
            auth=make_auth(),
            notifier=make_notifier(),
        )
        update = make_update("E001", user_id=12345)
        ctx = make_context()

        from hr_admin_bots.bots.onboarding import WAITING_ID
        result = await bot.verify_id(update, ctx)

        assert result == WAITING_ID
        sheets.bind_telegram_id.assert_not_called()
        reply_text = update.message.reply_text.call_args[0][0]
        assert "已綁定" in reply_text

    @pytest.mark.asyncio
    async def test_verify_id_no_binding_auto_binds(self):
        sheets = make_sheets()
        sheets.get_telegram_id.return_value = None
        sheets.find_row.return_value = None
        bot = OnboardingBot(
            name="onboarding",
            bot_config=BOT_CONFIG,
            sheets_client=sheets,
            auth=make_auth(),
            notifier=make_notifier(),
        )
        update = make_update("E001", user_id=12345)
        ctx = make_context()

        from hr_admin_bots.bots.onboarding import CONFIRMING
        result = await bot.verify_id(update, ctx)

        sheets.bind_telegram_id.assert_called_once_with("E001", 12345)
        assert result == CONFIRMING

    @pytest.mark.asyncio
    async def test_verify_id_duplicate_record_ends_conversation(self):
        sheets = make_sheets()
        sheets.get_telegram_id.return_value = 12345  # same user
        sheets.find_row.return_value = {"employee_id": "E001", "status": "completed"}
        bot = OnboardingBot(
            name="onboarding",
            bot_config=BOT_CONFIG,
            sheets_client=sheets,
            auth=make_auth(),
            notifier=make_notifier(),
        )
        update = make_update("E001", user_id=12345)
        ctx = make_context()

        result = await bot.verify_id(update, ctx)

        assert result == ConversationHandler.END
        reply_text = update.message.reply_text.call_args[0][0]
        assert "重複" in reply_text


# ---------------------------------------------------------------------------
# WorkPermitBot
# ---------------------------------------------------------------------------

class TestWorkPermitBotSubmit:

    def _make_bot(self, sheets=None):
        sheets = sheets or make_sheets()
        return WorkPermitBot(
            name="work_permit",
            bot_config=BOT_CONFIG,
            sheets_client=sheets,
            auth=make_auth(),
            notifier=make_notifier(),
        ), sheets

    @pytest.mark.asyncio
    async def test_submit_confirm_writes_row(self):
        bot, sheets = self._make_bot()
        permit_data = {
            "employee_id": "E001",
            "name": "Alice",
            "department": "Engineering",
            "position": "Engineer",
            "apply_date": "2026-03-27",
            "apply_month": "2026-03",
        }
        update = make_update("確認")
        ctx = make_context({"employee": EMPLOYEE, "permit_data": permit_data})

        result = await bot.submit(update, ctx)

        sheets.append_row.assert_called_once()
        call_args = sheets.append_row.call_args[0]
        assert call_args[0] == "work_permits"
        assert call_args[1]["status"] == "pending"
        assert result == ConversationHandler.END

    @pytest.mark.asyncio
    async def test_submit_other_text_stays_in_confirming(self):
        bot, sheets = self._make_bot()
        update = make_update("不確定")
        ctx = make_context({"employee": EMPLOYEE, "permit_data": {}})

        from hr_admin_bots.bots.work_permit import CONFIRMING
        result = await bot.submit(update, ctx)

        sheets.append_row.assert_not_called()
        assert result == CONFIRMING

    @pytest.mark.asyncio
    async def test_verify_id_binding_conflict(self):
        sheets = make_sheets()
        sheets.get_telegram_id.return_value = 99999
        bot = WorkPermitBot(
            name="work_permit",
            bot_config=BOT_CONFIG,
            sheets_client=sheets,
            auth=make_auth(),
            notifier=make_notifier(),
        )
        update = make_update("E001", user_id=12345)
        ctx = make_context()

        from hr_admin_bots.bots.work_permit import WAITING_ID
        result = await bot.verify_id(update, ctx)

        assert result == WAITING_ID
        reply_text = update.message.reply_text.call_args[0][0]
        assert "已綁定" in reply_text

    @pytest.mark.asyncio
    async def test_verify_id_new_binding_auto_binds(self):
        sheets = make_sheets()
        sheets.get_telegram_id.return_value = None
        sheets.find_row.return_value = None
        bot = WorkPermitBot(
            name="work_permit",
            bot_config=BOT_CONFIG,
            sheets_client=sheets,
            auth=make_auth(),
            notifier=make_notifier(),
        )
        update = make_update("E001", user_id=12345)
        ctx = make_context()

        from hr_admin_bots.bots.work_permit import CONFIRMING
        result = await bot.verify_id(update, ctx)

        sheets.bind_telegram_id.assert_called_once_with("E001", 12345)
        assert result == CONFIRMING


# ---------------------------------------------------------------------------
# OffboardingBot
# ---------------------------------------------------------------------------

class TestOffboardingBotSubmit:

    def _make_bot(self, sheets=None):
        sheets = sheets or make_sheets()
        return OffboardingBot(
            name="offboarding",
            bot_config=BOT_CONFIG,
            sheets_client=sheets,
            auth=make_auth(),
            notifier=make_notifier(),
        ), sheets

    @pytest.mark.asyncio
    async def test_submit_confirm_writes_row_and_sends_notifications(self):
        bot, sheets = self._make_bot()
        update = make_update("確認")
        ctx = make_context({"employee": EMPLOYEE})

        result = await bot.submit(update, ctx)

        sheets.append_row.assert_called_once()
        call_args = sheets.append_row.call_args[0]
        assert call_args[0] == "offboarding"
        row = call_args[1]
        assert row["status"] == "pending"
        assert row["employee_id"] == "E001"
        assert result == ConversationHandler.END

    @pytest.mark.asyncio
    async def test_submit_other_text_stays_confirming(self):
        bot, sheets = self._make_bot()
        update = make_update("再想想")
        ctx = make_context({"employee": EMPLOYEE})

        from hr_admin_bots.bots.offboarding import CONFIRMING
        result = await bot.submit(update, ctx)

        sheets.append_row.assert_not_called()
        assert result == CONFIRMING

    @pytest.mark.asyncio
    async def test_verify_id_binding_conflict_returns_waiting(self):
        sheets = make_sheets()
        sheets.get_telegram_id.return_value = 99999
        bot = OffboardingBot(
            name="offboarding",
            bot_config=BOT_CONFIG,
            sheets_client=sheets,
            auth=make_auth(),
            notifier=make_notifier(),
        )
        update = make_update("E001", user_id=12345)
        ctx = make_context()

        from hr_admin_bots.bots.offboarding import WAITING_ID
        result = await bot.verify_id(update, ctx)

        assert result == WAITING_ID
        reply_text = update.message.reply_text.call_args[0][0]
        assert "已綁定" in reply_text

    @pytest.mark.asyncio
    async def test_verify_id_new_binding_auto_binds(self):
        sheets = make_sheets()
        sheets.get_telegram_id.return_value = None
        sheets.find_row.return_value = None
        bot = OffboardingBot(
            name="offboarding",
            bot_config=BOT_CONFIG,
            sheets_client=sheets,
            auth=make_auth(),
            notifier=make_notifier(),
        )
        update = make_update("E001", user_id=12345)
        ctx = make_context()

        from hr_admin_bots.bots.offboarding import CONFIRMING
        result = await bot.verify_id(update, ctx)

        sheets.bind_telegram_id.assert_called_once_with("E001", 12345)
        assert result == CONFIRMING

    @pytest.mark.asyncio
    async def test_verify_id_duplicate_pending_ends_conversation(self):
        sheets = make_sheets()
        sheets.get_telegram_id.return_value = 12345
        sheets.find_row.return_value = {"employee_id": "E001", "status": "pending"}
        bot = OffboardingBot(
            name="offboarding",
            bot_config=BOT_CONFIG,
            sheets_client=sheets,
            auth=make_auth(),
            notifier=make_notifier(),
        )
        update = make_update("E001", user_id=12345)
        ctx = make_context()

        result = await bot.verify_id(update, ctx)

        assert result == ConversationHandler.END

    @pytest.mark.asyncio
    async def test_submit_also_notifies_manager_when_different(self):
        """When manager_email != hr_email, both receive notification."""
        sheets = make_sheets()
        notifier = make_notifier()
        notifier.hr_email = "hr@company.com"
        bot = OffboardingBot(
            name="offboarding",
            bot_config=BOT_CONFIG,
            sheets_client=sheets,
            auth=make_auth(),
            notifier=notifier,
        )
        update = make_update("確認")
        ctx = make_context({"employee": EMPLOYEE})  # EMPLOYEE has manager_email = boss@company.com

        await bot.submit(update, ctx)

        assert notifier.send_async.call_count == 2


# ---------------------------------------------------------------------------
# LeaveBot
# ---------------------------------------------------------------------------

class TestLeaveBotSubmit:

    def _make_bot(self, sheets=None):
        sheets = sheets or make_sheets()
        return LeaveBot(
            name="leave",
            bot_config=BOT_CONFIG,
            sheets_client=sheets,
            auth=make_auth(),
            notifier=make_notifier(),
            approval_manager=None,
        ), sheets

    @pytest.mark.asyncio
    async def test_submit_confirm_writes_row(self):
        bot, sheets = self._make_bot()
        user_data = {
            "employee": EMPLOYEE,
            "leave_type": "年假",
            "start_date": "2026-04-01",
            "end_date": "2026-04-03",
            "days": 3,
            "reason": "家族旅遊",
        }
        update = make_update("確認")
        ctx = make_context(user_data)

        result = await bot.submit(update, ctx)

        sheets.append_row.assert_called_once()
        call_args = sheets.append_row.call_args[0]
        assert call_args[0] == "leaves"
        row = call_args[1]
        assert row["leave_type"] == "年假"
        assert row["status"] == "pending"
        assert result == ConversationHandler.END

    @pytest.mark.asyncio
    async def test_submit_other_text_stays_confirming(self):
        bot, sheets = self._make_bot()
        user_data = {
            "employee": EMPLOYEE,
            "leave_type": "年假",
            "start_date": "2026-04-01",
            "end_date": "2026-04-03",
            "days": 3,
            "reason": "旅行",
        }
        update = make_update("不要了")
        ctx = make_context(user_data)

        from hr_admin_bots.bots.leave import CONFIRMING
        result = await bot.submit(update, ctx)

        sheets.append_row.assert_not_called()
        assert result == CONFIRMING

    @pytest.mark.asyncio
    async def test_verify_id_binding_conflict_returns_waiting(self):
        sheets = make_sheets()
        sheets.get_telegram_id.return_value = 99999
        bot = LeaveBot(
            name="leave",
            bot_config=BOT_CONFIG,
            sheets_client=sheets,
            auth=make_auth(),
            notifier=make_notifier(),
        )
        update = make_update("E001", user_id=12345)
        ctx = make_context()

        from hr_admin_bots.bots.leave import WAITING_ID
        result = await bot.verify_id(update, ctx)

        assert result == WAITING_ID
        reply_text = update.message.reply_text.call_args[0][0]
        assert "已綁定" in reply_text

    @pytest.mark.asyncio
    async def test_verify_id_new_binding_auto_binds_and_continues(self):
        sheets = make_sheets()
        sheets.get_telegram_id.return_value = None
        # Mock inline keyboard requirement from select_type
        update = make_update("E001", user_id=12345)
        update.callback_query = None

        bot = LeaveBot(
            name="leave",
            bot_config=BOT_CONFIG,
            sheets_client=sheets,
            auth=make_auth(EMPLOYEE),
            notifier=make_notifier(),
        )
        # Need find_employee for annual balance in select_type
        sheets.find_employee.return_value = EMPLOYEE
        ctx = make_context()

        from hr_admin_bots.bots.leave import SELECT_TYPE
        result = await bot.verify_id(update, ctx)

        sheets.bind_telegram_id.assert_called_once_with("E001", 12345)
        assert result == SELECT_TYPE

    @pytest.mark.asyncio
    async def test_submit_with_approval_manager_calls_send_approval(self):
        """When approval_manager is set, send_approval_request is called instead of notifier."""
        sheets = make_sheets()
        approval_manager = MagicMock()
        approval_manager.send_approval_request = AsyncMock(return_value=True)

        bot = LeaveBot(
            name="leave",
            bot_config=BOT_CONFIG,
            sheets_client=sheets,
            auth=make_auth(),
            notifier=make_notifier(),
            approval_manager=approval_manager,
        )
        user_data = {
            "employee": EMPLOYEE,
            "leave_type": "事假",
            "start_date": "2026-04-01",
            "end_date": "2026-04-01",
            "days": 1,
            "reason": "個人事務",
        }
        update = make_update("確認")
        ctx = make_context(user_data)

        result = await bot.submit(update, ctx)

        approval_manager.send_approval_request.assert_called_once()
        assert result == ConversationHandler.END

    @pytest.mark.asyncio
    async def test_submit_sheets_error_sends_error_message(self):
        sheets = make_sheets()
        sheets.append_row.side_effect = Exception("Sheets unavailable")
        bot, _ = self._make_bot(sheets=sheets)
        user_data = {
            "employee": EMPLOYEE,
            "leave_type": "病假",
            "start_date": "2026-04-01",
            "end_date": "2026-04-01",
            "days": 1,
            "reason": "不舒服",
        }
        update = make_update("確認")
        ctx = make_context(user_data)

        result = await bot.submit(update, ctx)

        reply_text = update.message.reply_text.call_args[0][0]
        assert "錯誤" in reply_text
        assert result == ConversationHandler.END
