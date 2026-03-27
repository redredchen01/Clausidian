from __future__ import annotations

import logging
from datetime import date
from typing import Any

from telegram import Update
from telegram.ext import (
    CommandHandler,
    ConversationHandler,
    ContextTypes,
    MessageHandler,
    filters,
)

from hr_admin_bots.bots.base import BaseBot

logger = logging.getLogger(__name__)

WAITING_ID, CONFIRMING, SUBMITTING = range(3)


class OnboardingBot(BaseBot):
    """新進人員報到 Bot。"""

    WAITING_ID = WAITING_ID
    CONFIRMING = CONFIRMING
    SUBMITTING = SUBMITTING

    def __init__(self, name: str, bot_config: Any, sheets_client: Any, auth: Any, notifier: Any) -> None:
        super().__init__(name, bot_config, sheets_client, auth, notifier)

    async def start(self, update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
        await update.message.reply_text(
            "歡迎使用新進人員報到系統。\n請輸入您的員工編號："
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

        # 重複報到檢查
        existing = self.sheets_client.find_row("onboarding", "employee_id", employee_id)
        if existing:
            await update.message.reply_text(
                f"員工 {employee_id} 已有報到紀錄，無法重複提交。\n如有疑問請聯絡 HR。"
            )
            return ConversationHandler.END

        context.user_data["employee"] = employee
        info = self._format_employee_info(employee)
        await update.message.reply_text(
            f"以下是您的員工資訊：\n\n{info}\n\n"
            "請確認以上資訊正確後，輸入「確認」進行報到，或輸入「取消」中止。"
        )
        return CONFIRMING

    async def confirm(self, update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
        text = update.message.text.strip()

        if text == "確認":
            await update.message.reply_text(
                "資訊已確認。請輸入「送出」完成報到申請，或輸入「取消」中止。"
            )
            return SUBMITTING

        await update.message.reply_text(
            "請輸入「確認」以繼續，或輸入 /cancel 取消。"
        )
        return CONFIRMING

    async def submit(self, update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
        text = update.message.text.strip()

        if text != "送出":
            await update.message.reply_text(
                "請輸入「送出」以完成報到，或輸入 /cancel 取消。"
            )
            return SUBMITTING

        employee = context.user_data.get("employee", {})
        row = {
            "employee_id": employee.get("employee_id", ""),
            "name": employee.get("name", ""),
            "department": employee.get("department", ""),
            "position": employee.get("position", ""),
            "onboarding_date": date.today().isoformat(),
            "status": "completed",
        }

        try:
            self.sheets_client.append_row("onboarding", row)
            await self.notifier.send_async(
                to=self.notifier.hr_email,
                subject=f"新進人員報到通知 - {employee.get('name', '')}",
                body=(
                    f"員工 {employee.get('name', '')}（{employee.get('employee_id', '')}）"
                    f"已完成報到申請。\n"
                    f"部門：{employee.get('department', '')}\n"
                    f"職位：{employee.get('position', '')}\n"
                    f"報到日期：{row['onboarding_date']}"
                ),
            )
            await update.message.reply_text(
                "報到申請已成功送出！HR 部門將盡快與您聯繫。"
            )
        except Exception as e:
            logger.error("onboarding submit error: %s", e)
            await update.message.reply_text(
                "送出時發生錯誤，請稍後再試或聯絡 HR。"
            )

        context.user_data.clear()
        return ConversationHandler.END

    async def cancel(self, update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
        context.user_data.clear()
        await update.message.reply_text("已取消報到申請。如需重新開始，請輸入 /start。")
        return ConversationHandler.END

    def build_conversation_handler(self) -> ConversationHandler:
        return ConversationHandler(
            entry_points=[CommandHandler("start", self.start)],
            states={
                WAITING_ID: [
                    MessageHandler(filters.TEXT & ~filters.COMMAND, self.verify_id)
                ],
                CONFIRMING: [
                    MessageHandler(filters.TEXT & ~filters.COMMAND, self.confirm)
                ],
                SUBMITTING: [
                    MessageHandler(filters.TEXT & ~filters.COMMAND, self.submit)
                ],
            },
            fallbacks=[CommandHandler("cancel", self.cancel)],
        )
