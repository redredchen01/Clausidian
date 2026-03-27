from __future__ import annotations

import logging
from typing import Any, Optional

from telegram import Update
from telegram.ext import (
    Application,
    CommandHandler,
    ConversationHandler,
    ContextTypes,
    MessageHandler,
    filters,
)

from hr_admin_bots.config import BotConfig

logger = logging.getLogger(__name__)

WAITING_ID, CONFIRMING = range(2)


class BaseBot:
    """所有 HR Bot 的基礎類別，提供員工 ID 驗證流程骨架。"""

    WAITING_ID = WAITING_ID
    CONFIRMING = CONFIRMING

    def __init__(
        self,
        name: str,
        bot_config: BotConfig,
        sheets_client: Any,
        auth: Any,
        notifier: Any,
    ) -> None:
        self.name = name
        self.bot_config = bot_config
        self.sheets_client = sheets_client
        self.auth = auth
        self.notifier = notifier

    async def start(self, update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
        """入口指令，歡迎使用者並要求輸入員工編號。"""
        await update.message.reply_text(
            "歡迎使用 HR 行政機器人。\n請輸入您的員工編號："
        )
        return WAITING_ID

    async def verify_id(self, update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
        """查詢員工資料，存入 user_data，顯示資訊後詢問確認。"""
        employee_id = update.message.text.strip()
        employee = self.auth.lookup(employee_id)

        if not employee:
            await update.message.reply_text(
                "找不到此員工編號，請重新輸入，或輸入 /cancel 取消。"
            )
            return WAITING_ID

        context.user_data["employee"] = employee
        info = self._format_employee_info(employee)
        await update.message.reply_text(
            f"{info}\n\n確認以上資訊正確嗎？請輸入「確認」或「取消」。"
        )
        return CONFIRMING

    async def cancel(self, update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
        """取消對話並清除狀態。"""
        context.user_data.clear()
        await update.message.reply_text("已取消操作。如需重新開始，請輸入 /start。")
        return ConversationHandler.END

    def _format_employee_info(self, employee: dict) -> str:
        """格式化員工基本資訊為顯示文字。"""
        return (
            f"員工編號：{employee.get('employee_id', '')}\n"
            f"姓名：{employee.get('name', '')}\n"
            f"部門：{employee.get('department', '')}\n"
            f"職位：{employee.get('position', '')}"
        )

    def build_conversation_handler(self) -> ConversationHandler:
        """子類別覆寫此方法以加入額外狀態與 handler。"""
        return ConversationHandler(
            entry_points=[CommandHandler("start", self.start)],
            states={
                WAITING_ID: [
                    MessageHandler(filters.TEXT & ~filters.COMMAND, self.verify_id)
                ],
                CONFIRMING: [
                    MessageHandler(filters.TEXT & ~filters.COMMAND, self.cancel)
                ],
            },
            fallbacks=[CommandHandler("cancel", self.cancel)],
        )

    def build_application(self) -> Application:
        """根據 bot_config.token 建立 Telegram Application 實例。"""
        app = Application.builder().token(self.bot_config.token).build()
        app.add_handler(self.build_conversation_handler())
        return app
