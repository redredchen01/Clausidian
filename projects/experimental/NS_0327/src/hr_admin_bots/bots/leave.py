from __future__ import annotations

import logging
from datetime import date, datetime, timedelta
from typing import Any, Optional

from telegram import InlineKeyboardButton, InlineKeyboardMarkup, Update
from telegram.ext import (
    CallbackQueryHandler,
    CommandHandler,
    ConversationHandler,
    ContextTypes,
    MessageHandler,
    filters,
)

from hr_admin_bots.bots.base import BaseBot

logger = logging.getLogger(__name__)

WAITING_ID, SELECT_TYPE, INPUT_START, INPUT_END, INPUT_REASON, CONFIRMING = range(6)

# 固定配額（-1 代表無限）
LEAVE_QUOTA: dict[str, int] = {
    "病假": -1,
    "事假": 10,
    "喪假": 3,
    "婚假": 5,
    "產假": 98,
    "陪產假": 15,
}

DATE_FORMAT = "%Y-%m-%d"


class LeaveBot(BaseBot):
    """請假申請 Bot。"""

    WAITING_ID = WAITING_ID
    SELECT_TYPE = SELECT_TYPE
    INPUT_START = INPUT_START
    INPUT_END = INPUT_END
    INPUT_REASON = INPUT_REASON
    CONFIRMING = CONFIRMING

    def __init__(self, name: str, bot_config: Any, sheets_client: Any, auth: Any, notifier: Any) -> None:
        super().__init__(name, bot_config, sheets_client, auth, notifier)

    async def start(self, update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
        await update.message.reply_text(
            "歡迎使用請假申請系統。\n請輸入您的員工編號："
        )
        return WAITING_ID

    async def verify_id(self, update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
        employee_id = update.message.text.strip()
        employee = self.auth.lookup(employee_id)

        if not employee:
            await update.message.reply_text(
                "找不到此員工編號，請重新輸入，或輸入 /cancel 取消。"
            )
            return WAITING_ID

        context.user_data["employee"] = employee
        return await self.select_type(update, context)

    async def select_type(self, update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
        """顯示假別選單（InlineKeyboard）。"""
        employee = context.user_data.get("employee", {})
        employee_id = employee.get("employee_id", "")

        # 從 sheet 取得年假餘額
        annual_balance = self._get_annual_balance(employee_id)

        keyboard = [
            [InlineKeyboardButton(f"年假（剩餘 {annual_balance} 天）", callback_data="年假")],
            [
                InlineKeyboardButton("病假（無限額）", callback_data="病假"),
                InlineKeyboardButton(f"事假（{LEAVE_QUOTA['事假']} 天）", callback_data="事假"),
            ],
            [
                InlineKeyboardButton(f"喪假（{LEAVE_QUOTA['喪假']} 天）", callback_data="喪假"),
                InlineKeyboardButton(f"婚假（{LEAVE_QUOTA['婚假']} 天）", callback_data="婚假"),
            ],
            [
                InlineKeyboardButton(f"產假（{LEAVE_QUOTA['產假']} 天）", callback_data="產假"),
                InlineKeyboardButton(f"陪產假（{LEAVE_QUOTA['陪產假']} 天）", callback_data="陪產假"),
            ],
        ]
        reply_markup = InlineKeyboardMarkup(keyboard)

        if update.callback_query:
            await update.callback_query.answer()
            await update.callback_query.message.reply_text(
                "請選擇假別：", reply_markup=reply_markup
            )
        else:
            await update.message.reply_text("請選擇假別：", reply_markup=reply_markup)

        return SELECT_TYPE

    async def input_start_date(self, update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
        """接收假別選擇，要求輸入開始日期。"""
        query = update.callback_query
        await query.answer()

        leave_type = query.data
        context.user_data["leave_type"] = leave_type

        await query.message.reply_text(
            f"您選擇了：{leave_type}\n\n請輸入請假開始日期（格式：YYYY-MM-DD）："
        )
        return INPUT_START

    async def input_end_date(self, update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
        """解析開始日期，要求輸入結束日期。"""
        text = update.message.text.strip()
        start_date = _parse_date(text)

        if not start_date:
            await update.message.reply_text(
                "日期格式錯誤，請使用 YYYY-MM-DD 格式（例：2026-04-01）："
            )
            return INPUT_START

        context.user_data["start_date"] = start_date.isoformat()
        await update.message.reply_text("請輸入請假結束日期（格式：YYYY-MM-DD）：")
        return INPUT_END

    async def input_reason(self, update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
        """解析結束日期並計算天數，要求輸入請假原因。"""
        text = update.message.text.strip()
        end_date = _parse_date(text)

        if not end_date:
            await update.message.reply_text(
                "日期格式錯誤，請使用 YYYY-MM-DD 格式（例：2026-04-05）："
            )
            return INPUT_END

        start_date = datetime.fromisoformat(context.user_data["start_date"]).date()
        if end_date < start_date:
            await update.message.reply_text(
                "結束日期不可早於開始日期，請重新輸入："
            )
            return INPUT_END

        days = (end_date - start_date).days + 1
        context.user_data["end_date"] = end_date.isoformat()
        context.user_data["days"] = days

        await update.message.reply_text(
            f"請假天數：{days} 天\n\n請輸入請假原因："
        )
        return INPUT_REASON

    async def check_and_confirm(self, update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
        """檢查餘額與重疊，顯示摘要後詢問確認。"""
        reason = update.message.text.strip()
        context.user_data["reason"] = reason

        employee = context.user_data.get("employee", {})
        employee_id = employee.get("employee_id", "")
        leave_type = context.user_data.get("leave_type", "")
        start_date = context.user_data.get("start_date", "")
        end_date = context.user_data.get("end_date", "")
        days = context.user_data.get("days", 0)

        # 重疊日期檢查（status 為 pending 或 approved）
        overlap = self._check_overlap(employee_id, start_date, end_date)
        if overlap:
            await update.message.reply_text(
                f"您在 {start_date} 至 {end_date} 期間已有待審或已核准的請假紀錄，"
                "無法提交重疊申請。\n請重新輸入 /start 或聯絡 HR。"
            )
            context.user_data.clear()
            return ConversationHandler.END

        # 餘額檢查
        balance_msg = self._check_balance(employee_id, leave_type, days)
        if balance_msg:
            await update.message.reply_text(balance_msg)
            context.user_data.clear()
            return ConversationHandler.END

        await update.message.reply_text(
            f"請假申請摘要：\n\n"
            f"員工：{employee.get('name', '')}（{employee_id}）\n"
            f"假別：{leave_type}\n"
            f"開始日期：{start_date}\n"
            f"結束日期：{end_date}\n"
            f"天數：{days} 天\n"
            f"原因：{reason}\n\n"
            "請輸入「確認」送出申請，或輸入「取消」中止。"
        )
        return CONFIRMING

    async def submit(self, update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
        text = update.message.text.strip()

        if text != "確認":
            await update.message.reply_text(
                "請輸入「確認」以送出申請，或輸入 /cancel 取消。"
            )
            return CONFIRMING

        employee = context.user_data.get("employee", {})
        row = {
            "employee_id": employee.get("employee_id", ""),
            "name": employee.get("name", ""),
            "department": employee.get("department", ""),
            "leave_type": context.user_data.get("leave_type", ""),
            "start_date": context.user_data.get("start_date", ""),
            "end_date": context.user_data.get("end_date", ""),
            "days": context.user_data.get("days", 0),
            "reason": context.user_data.get("reason", ""),
            "status": "pending",
            "apply_date": date.today().isoformat(),
        }

        try:
            self.sheets_client.append_row("leaves", row)
            # 通知主管
            manager_email = employee.get("manager_email", self.notifier.hr_email)
            await self.notifier.send_async(
                to=manager_email,
                subject=f"請假申請通知 - {employee.get('name', '')}",
                body=(
                    f"員工 {employee.get('name', '')}（{employee.get('employee_id', '')}）"
                    f"提出請假申請，請審核。\n\n"
                    f"假別：{row['leave_type']}\n"
                    f"日期：{row['start_date']} 至 {row['end_date']}（{row['days']} 天）\n"
                    f"原因：{row['reason']}"
                ),
            )
            await update.message.reply_text(
                "請假申請已成功送出！主管將盡快審核。"
            )
        except Exception as e:
            logger.error("leave submit error: %s", e)
            await update.message.reply_text(
                "送出時發生錯誤，請稍後再試或聯絡 HR。"
            )

        context.user_data.clear()
        return ConversationHandler.END

    async def cancel(self, update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
        context.user_data.clear()
        await update.message.reply_text("已取消請假申請。如需重新開始，請輸入 /start。")
        return ConversationHandler.END

    # --- 內部工具方法 ---

    def _get_annual_balance(self, employee_id: str) -> int:
        """從 employees sheet 的 annual_leave_quota 欄位取得年假額度，減去已用天數。"""
        try:
            emp = self.sheets_client.find_employee(employee_id)
            if not emp:
                return 0
            quota = int(emp.get("annual_leave_quota", 0))
            used = self._get_used_days(employee_id, "年假")
            return max(quota - used, 0)
        except Exception as e:
            logger.warning("get annual balance error: %s", e)
        return 0

    def _check_balance(self, employee_id: str, leave_type: str, days: int) -> Optional[str]:
        """檢查假別餘額，不足時回傳錯誤訊息，足夠時回傳 None。"""
        if leave_type == "病假":
            return None

        if leave_type == "年假":
            balance = self._get_annual_balance(employee_id)
            if days > balance:
                return f"年假餘額不足。目前剩餘 {balance} 天，申請 {days} 天。"
            return None

        quota = LEAVE_QUOTA.get(leave_type, 0)
        if quota == -1:
            return None

        # 計算本年度已使用天數
        used = self._get_used_days(employee_id, leave_type)
        remaining = quota - used
        if days > remaining:
            return (
                f"{leave_type}額度不足。年度配額 {quota} 天，"
                f"已使用 {used} 天，剩餘 {remaining} 天，申請 {days} 天。"
            )
        return None

    def _get_used_days(self, employee_id: str, leave_type: str) -> int:
        """查詢本年度已核准與待審的該假別天數。"""
        try:
            rows = self.sheets_client.find_rows(
                "leaves",
                filters={
                    "employee_id": employee_id,
                    "leave_type": leave_type,
                },
            )
            current_year = str(date.today().year)
            total = 0
            for row in rows:
                if row.get("status") in ("pending", "approved"):
                    if row.get("start_date", "").startswith(current_year):
                        total += int(row.get("days", 0))
            return total
        except Exception as e:
            logger.warning("get used days error: %s", e)
            return 0

    def _check_overlap(self, employee_id: str, start_date: str, end_date: str) -> bool:
        """檢查是否存在重疊的待審或已核准請假紀錄。"""
        try:
            rows = self.sheets_client.find_rows(
                "leaves",
                filters={"employee_id": employee_id},
            )
            for row in rows:
                if row.get("status") not in ("pending", "approved"):
                    continue
                existing_start = row.get("start_date", "")
                existing_end = row.get("end_date", "")
                if existing_start and existing_end:
                    # 日期區間重疊判斷
                    if not (end_date < existing_start or start_date > existing_end):
                        return True
        except Exception as e:
            logger.warning("check overlap error: %s", e)
        return False

    def build_conversation_handler(self) -> ConversationHandler:
        return ConversationHandler(
            entry_points=[CommandHandler("start", self.start)],
            states={
                WAITING_ID: [
                    MessageHandler(filters.TEXT & ~filters.COMMAND, self.verify_id)
                ],
                SELECT_TYPE: [
                    CallbackQueryHandler(self.input_start_date)
                ],
                INPUT_START: [
                    MessageHandler(filters.TEXT & ~filters.COMMAND, self.input_end_date)
                ],
                INPUT_END: [
                    MessageHandler(filters.TEXT & ~filters.COMMAND, self.input_reason)
                ],
                INPUT_REASON: [
                    MessageHandler(filters.TEXT & ~filters.COMMAND, self.check_and_confirm)
                ],
                CONFIRMING: [
                    MessageHandler(filters.TEXT & ~filters.COMMAND, self.submit)
                ],
            },
            fallbacks=[CommandHandler("cancel", self.cancel)],
        )


def _parse_date(text: str) -> Optional[date]:
    """解析 YYYY-MM-DD 格式日期字串，失敗回傳 None。"""
    try:
        return datetime.strptime(text, DATE_FORMAT).date()
    except ValueError:
        return None
