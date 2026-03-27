from __future__ import annotations

import logging
from typing import Any, Optional

from telegram import InlineKeyboardButton, InlineKeyboardMarkup, Update
from telegram.ext import ContextTypes

logger = logging.getLogger(__name__)

# callback_data 格式："{action}:{request_type}:{row_index}"
# action: approve | reject
# request_type: leave
# row_index: 1-based data row index in the worksheet


class ApprovalManager:
    """處理 Telegram 主管核准流程。"""

    def __init__(self, sheets_client: Any, notifier: Any) -> None:
        self.sheets_client = sheets_client
        self.notifier = notifier

    async def send_approval_request(
        self,
        bot_app: Any,
        employee: dict,
        request_data: dict,
        request_type: str,
    ) -> bool:
        """傳送核准請求給主管（優先 Telegram，否則 email fallback）。

        Returns True if Telegram message was sent, False if fell back to email.
        """
        manager_email = employee.get("manager_email", "")
        manager_tid = self.sheets_client.get_telegram_id_by_email(manager_email)

        summary = self._format_request(employee, request_data, request_type)
        req_id = request_data.get("id", "")

        if manager_tid:
            keyboard = InlineKeyboardMarkup([
                [
                    InlineKeyboardButton(
                        "核准",
                        callback_data=f"approve:{request_type}:{req_id}",
                    ),
                    InlineKeyboardButton(
                        "駁回",
                        callback_data=f"reject:{request_type}:{req_id}",
                    ),
                ]
            ])
            try:
                await bot_app.bot.send_message(
                    chat_id=manager_tid,
                    text=summary,
                    reply_markup=keyboard,
                )
                return True
            except Exception as e:
                logger.error("Telegram approval send failed: %s", e)
                # fall through to email

        # Fallback: email
        if manager_email:
            await self.notifier.send_async(
                to=manager_email,
                subject=f"【待核准】{request_type} 申請 - {employee.get('name', '')}",
                body=summary,
            )
        return False

    async def handle_approval_callback(
        self, update: Update, context: ContextTypes.DEFAULT_TYPE
    ) -> None:
        """處理主管點擊核准/駁回按鈕。"""
        query = update.callback_query
        await query.answer()

        parts = query.data.split(":", 2)
        if len(parts) != 3:
            await query.edit_message_text("回呼資料格式錯誤，請聯絡系統管理員。")
            return

        action, req_type, req_id = parts

        if req_type == "leave":
            await self._handle_leave_approval(query, action, req_id)
        else:
            await query.edit_message_text(f"不支援的申請類型：{req_type}")

    async def _handle_leave_approval(self, query: Any, action: str, row_index_str: str) -> None:
        """更新請假單狀態並通知員工。"""
        try:
            row_index = int(row_index_str)
        except ValueError:
            await query.edit_message_text("無效的申請 ID，請聯絡系統管理員。")
            return

        new_status = "approved" if action == "approve" else "rejected"
        action_label = "核准" if action == "approve" else "駁回"

        try:
            self.sheets_client.update_cell("leaves", row_index, "status", new_status)
        except Exception as e:
            logger.error("Failed to update leave status: %s", e)
            await query.edit_message_text("更新狀態失敗，請聯絡系統管理員。")
            return

        # 取得員工資訊以通知
        try:
            ws = self.sheets_client.get_worksheet("leaves")
            records = ws.get_all_records()
            # row_index 是 1-based data row index
            if row_index < 1 or row_index > len(records):
                raise IndexError("row_index out of range")
            leave_row = records[row_index - 1]

            employee_id = str(leave_row.get("employee_id", ""))
            employee_name = leave_row.get("name", "")
            leave_type = leave_row.get("leave_type", "")
            start_date = leave_row.get("start_date", "")
            end_date = leave_row.get("end_date", "")
            days = leave_row.get("days", "")

            # 通知員工（優先 Telegram）
            emp_tid = self.sheets_client.get_telegram_id(employee_id)
            notify_msg = (
                f"您的請假申請已被{action_label}。\n\n"
                f"假別：{leave_type}\n"
                f"日期：{start_date} 至 {end_date}（{days} 天）\n"
                f"狀態：{new_status}"
            )

            if emp_tid:
                try:
                    await query.bot.send_message(chat_id=emp_tid, text=notify_msg)
                except Exception as e:
                    logger.warning("Telegram notify employee failed, fallback to email: %s", e)
                    await self._email_notify_employee(employee_id, notify_msg, leave_type, employee_name)
            else:
                await self._email_notify_employee(employee_id, notify_msg, leave_type, employee_name)

        except Exception as e:
            logger.error("Failed to notify employee after approval: %s", e)

        await query.edit_message_text(
            f"已{action_label}此請假申請。員工將收到通知。"
        )

    async def _email_notify_employee(
        self, employee_id: str, message: str, leave_type: str, employee_name: str
    ) -> None:
        """透過 email 通知員工審核結果。"""
        employee = self.sheets_client.find_employee(employee_id)
        if not employee:
            return
        email = employee.get("email", "")
        if not email:
            return
        await self.notifier.send_async(
            to=email,
            subject=f"請假申請審核結果 - {employee_name}",
            body=message,
        )

    def _format_request(self, employee: dict, request_data: dict, request_type: str) -> str:
        """格式化申請摘要文字（供 Telegram 訊息或 email 使用）。"""
        if request_type == "leave":
            return (
                f"【請假申請待核准】\n\n"
                f"員工：{employee.get('name', '')}（{employee.get('employee_id', '')}）\n"
                f"部門：{employee.get('department', '')}\n"
                f"假別：{request_data.get('leave_type', '')}\n"
                f"日期：{request_data.get('start_date', '')} 至 {request_data.get('end_date', '')}（{request_data.get('days', '')} 天）\n"
                f"原因：{request_data.get('reason', '')}\n"
                f"申請日期：{request_data.get('apply_date', '')}"
            )
        return f"【{request_type} 申請待核准】\n{request_data}"
