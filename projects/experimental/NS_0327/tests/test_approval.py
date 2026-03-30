"""Tests for ApprovalManager — approval request routing and callback handling."""
from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from hr_admin_bots.shared.approval import ApprovalManager


# ---------------------------------------------------------------------------
# Fixtures / helpers
# ---------------------------------------------------------------------------

def make_manager(manager_tid=None, emp_tid=None):
    """Build an ApprovalManager with all dependencies mocked."""
    sheets = MagicMock()
    sheets.get_telegram_id_by_email.return_value = manager_tid
    sheets.get_telegram_id.return_value = emp_tid

    notifier = MagicMock()
    notifier.send_async = AsyncMock(return_value=None)

    webhook = MagicMock()
    webhook.send_async = AsyncMock(return_value=[True])

    audit = MagicMock()

    mgr = ApprovalManager(
        sheets_client=sheets,
        notifier=notifier,
        webhook_notifier=webhook,
        audit_logger=audit,
    )
    return mgr, sheets, notifier, webhook, audit


EMPLOYEE = {
    "employee_id": "E001",
    "name": "Alice",
    "department": "Engineering",
    "manager_email": "boss@company.com",
    "email": "alice@company.com",
}

REQUEST_DATA = {
    "id": "5",
    "leave_type": "年假",
    "start_date": "2026-04-01",
    "end_date": "2026-04-03",
    "days": 3,
    "reason": "家庭出遊",
    "apply_date": "2026-03-27",
}


def make_fake_bot_app():
    """Return a mock bot_app whose bot.send_message is an AsyncMock."""
    bot_app = MagicMock()
    bot_app.bot.send_message = AsyncMock(return_value=None)
    return bot_app


# ---------------------------------------------------------------------------
# send_approval_request — Telegram path
# ---------------------------------------------------------------------------

class TestSendApprovalRequestTelegram:
    @pytest.mark.asyncio
    async def test_sends_telegram_when_manager_has_tid(self):
        mgr, sheets, notifier, *_ = make_manager(manager_tid="TID123")
        bot_app = make_fake_bot_app()

        result = await mgr.send_approval_request(bot_app, EMPLOYEE, REQUEST_DATA, "leave")

        bot_app.bot.send_message.assert_called_once()
        call_kwargs = bot_app.bot.send_message.call_args
        assert call_kwargs.kwargs["chat_id"] == "TID123" or call_kwargs[1].get("chat_id") == "TID123" or call_kwargs[0][0] == "TID123"
        assert result is True

    @pytest.mark.asyncio
    async def test_does_not_send_email_when_telegram_succeeds(self):
        mgr, sheets, notifier, *_ = make_manager(manager_tid="TID123")
        bot_app = make_fake_bot_app()

        await mgr.send_approval_request(bot_app, EMPLOYEE, REQUEST_DATA, "leave")

        notifier.send_async.assert_not_called()

    @pytest.mark.asyncio
    async def test_message_contains_employee_name(self):
        mgr, *_ = make_manager(manager_tid="TID123")
        bot_app = make_fake_bot_app()

        await mgr.send_approval_request(bot_app, EMPLOYEE, REQUEST_DATA, "leave")

        sent_text = bot_app.bot.send_message.call_args[1].get("text") or bot_app.bot.send_message.call_args[0][1]
        assert "Alice" in sent_text

    @pytest.mark.asyncio
    async def test_keyboard_has_approve_and_reject_buttons(self):
        from telegram import InlineKeyboardMarkup
        mgr, *_ = make_manager(manager_tid="TID123")
        bot_app = make_fake_bot_app()

        await mgr.send_approval_request(bot_app, EMPLOYEE, REQUEST_DATA, "leave")

        kwargs = bot_app.bot.send_message.call_args[1]
        markup = kwargs.get("reply_markup")
        assert markup is not None
        # Flatten all buttons
        buttons = [btn for row in markup.inline_keyboard for btn in row]
        cb_data_list = [btn.callback_data for btn in buttons]
        assert any("approve" in d for d in cb_data_list)
        assert any("reject" in d for d in cb_data_list)


# ---------------------------------------------------------------------------
# send_approval_request — email fallback
# ---------------------------------------------------------------------------

class TestSendApprovalRequestEmailFallback:
    @pytest.mark.asyncio
    async def test_falls_back_to_email_when_no_tid(self):
        mgr, sheets, notifier, *_ = make_manager(manager_tid=None)
        bot_app = make_fake_bot_app()

        result = await mgr.send_approval_request(bot_app, EMPLOYEE, REQUEST_DATA, "leave")

        notifier.send_async.assert_called_once()
        assert result is False

    @pytest.mark.asyncio
    async def test_email_fallback_sends_to_manager_email(self):
        mgr, sheets, notifier, *_ = make_manager(manager_tid=None)
        bot_app = make_fake_bot_app()

        await mgr.send_approval_request(bot_app, EMPLOYEE, REQUEST_DATA, "leave")

        call_kwargs = notifier.send_async.call_args[1]
        assert call_kwargs.get("to") == "boss@company.com"

    @pytest.mark.asyncio
    async def test_falls_back_to_email_on_telegram_exception(self):
        mgr, sheets, notifier, *_ = make_manager(manager_tid="TID_FAIL")
        bot_app = make_fake_bot_app()
        bot_app.bot.send_message.side_effect = Exception("Telegram down")

        result = await mgr.send_approval_request(bot_app, EMPLOYEE, REQUEST_DATA, "leave")

        # Should fall back to email
        notifier.send_async.assert_called_once()
        assert result is False


# ---------------------------------------------------------------------------
# handle_approval_callback — approve / reject
# ---------------------------------------------------------------------------

def make_query(data: str, user_id: int = 999):
    query = MagicMock()
    query.data = data
    query.answer = AsyncMock(return_value=None)
    query.edit_message_text = AsyncMock(return_value=None)
    query.bot = MagicMock()
    query.bot.send_message = AsyncMock(return_value=None)
    query.from_user = MagicMock()
    query.from_user.id = user_id
    return query


def make_update(query):
    update = MagicMock()
    update.callback_query = query
    return update


def make_context():
    return MagicMock()


LEAVE_RECORDS = [
    {
        "employee_id": "E001",
        "name": "Alice",
        "leave_type": "年假",
        "start_date": "2026-04-01",
        "end_date": "2026-04-03",
        "days": 3,
        "status": "pending",
    }
]


class TestHandleApprovalCallbackApprove:
    @pytest.mark.asyncio
    async def test_approve_updates_sheet_status_to_approved(self):
        mgr, sheets, notifier, *_ = make_manager(emp_tid=None)
        ws = MagicMock()
        ws.get_all_records.return_value = LEAVE_RECORDS
        sheets.get_worksheet.return_value = ws
        sheets.find_employee.return_value = {"email": "alice@company.com"}

        query = make_query("approve:leave:1")
        update = make_update(query)

        await mgr.handle_approval_callback(update, make_context())

        sheets.update_cell.assert_called_once_with("leaves", 1, "status", "approved")

    @pytest.mark.asyncio
    async def test_approve_notifies_employee_via_email_when_no_tid(self):
        mgr, sheets, notifier, *_ = make_manager(emp_tid=None)
        ws = MagicMock()
        ws.get_all_records.return_value = LEAVE_RECORDS
        sheets.get_worksheet.return_value = ws
        sheets.find_employee.return_value = {"email": "alice@company.com"}

        query = make_query("approve:leave:1")
        update = make_update(query)

        await mgr.handle_approval_callback(update, make_context())

        notifier.send_async.assert_called_once()

    @pytest.mark.asyncio
    async def test_approve_notifies_employee_via_telegram_when_has_tid(self):
        mgr, sheets, notifier, webhook, audit = make_manager(emp_tid="EMP_TID")
        ws = MagicMock()
        ws.get_all_records.return_value = LEAVE_RECORDS
        sheets.get_worksheet.return_value = ws

        query = make_query("approve:leave:1")
        update = make_update(query)

        await mgr.handle_approval_callback(update, make_context())

        query.bot.send_message.assert_called_once()
        notifier.send_async.assert_not_called()

    @pytest.mark.asyncio
    async def test_approve_edits_message_with_action_label(self):
        mgr, sheets, notifier, *_ = make_manager(emp_tid=None)
        ws = MagicMock()
        ws.get_all_records.return_value = LEAVE_RECORDS
        sheets.get_worksheet.return_value = ws
        sheets.find_employee.return_value = {"email": "alice@company.com"}

        query = make_query("approve:leave:1")
        update = make_update(query)

        await mgr.handle_approval_callback(update, make_context())

        query.edit_message_text.assert_called_once()
        final_text = query.edit_message_text.call_args[0][0]
        assert "核准" in final_text


class TestHandleApprovalCallbackReject:
    @pytest.mark.asyncio
    async def test_reject_updates_sheet_status_to_rejected(self):
        mgr, sheets, notifier, *_ = make_manager(emp_tid=None)
        ws = MagicMock()
        ws.get_all_records.return_value = LEAVE_RECORDS
        sheets.get_worksheet.return_value = ws
        sheets.find_employee.return_value = {"email": "alice@company.com"}

        query = make_query("reject:leave:1")
        update = make_update(query)

        await mgr.handle_approval_callback(update, make_context())

        sheets.update_cell.assert_called_once_with("leaves", 1, "status", "rejected")

    @pytest.mark.asyncio
    async def test_reject_edits_message_with_reject_label(self):
        mgr, sheets, notifier, *_ = make_manager(emp_tid=None)
        ws = MagicMock()
        ws.get_all_records.return_value = LEAVE_RECORDS
        sheets.get_worksheet.return_value = ws
        sheets.find_employee.return_value = {"email": "alice@company.com"}

        query = make_query("reject:leave:1")
        update = make_update(query)

        await mgr.handle_approval_callback(update, make_context())

        final_text = query.edit_message_text.call_args[0][0]
        assert "駁回" in final_text


# ---------------------------------------------------------------------------
# handle_approval_callback — invalid callback data
# ---------------------------------------------------------------------------

class TestHandleApprovalCallbackInvalid:
    @pytest.mark.asyncio
    async def test_invalid_format_edits_error_message(self):
        mgr, *_ = make_manager()
        query = make_query("bad_data_no_colons")
        update = make_update(query)

        await mgr.handle_approval_callback(update, make_context())

        query.edit_message_text.assert_called_once()
        text = query.edit_message_text.call_args[0][0]
        assert "格式錯誤" in text or "管理員" in text

    @pytest.mark.asyncio
    async def test_unsupported_request_type_edits_error_message(self):
        mgr, *_ = make_manager()
        query = make_query("approve:unknown_type:1")
        update = make_update(query)

        await mgr.handle_approval_callback(update, make_context())

        query.edit_message_text.assert_called_once()
        text = query.edit_message_text.call_args[0][0]
        assert "不支援" in text or "unknown_type" in text

    @pytest.mark.asyncio
    async def test_invalid_row_index_edits_error_message(self):
        mgr, *_ = make_manager()
        query = make_query("approve:leave:not_a_number")
        update = make_update(query)

        await mgr.handle_approval_callback(update, make_context())

        query.edit_message_text.assert_called_once()
        text = query.edit_message_text.call_args[0][0]
        assert "無效" in text or "管理員" in text
