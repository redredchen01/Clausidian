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

WAITING_ID, CONFIRMING = range(2)


class WorkPermitBot(BaseBot):
    """工作許可申請 Bot。驗證身分後自動填入部門、職位、日期。"""

    WAITING_ID = WAITING_ID
    CONFIRMING = CONFIRMING

    def __init__(self, name: str, bot_config: Any, sheets_client: Any, auth: Any, notifier: Any, approval_manager: Any = None, audit_logger: Any = None) -> None:
        super().__init__(name, bot_config, sheets_client, auth, notifier, approval_manager, audit_logger)

    async def start(self, update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
        await update.message.reply_text(
            "歡迎使用工作許可申請系統。\n請輸入您的員工編號："
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

        # Telegram ID 綁定檢查
        bound_tid = self.sheets_client.get_telegram_id(employee_id)
        current_tid = update.effective_user.id
        if bound_tid is not None and bound_tid != current_tid:
            await update.message.reply_text(
                "此員工編號已綁定其他 Telegram 帳號，無法繼續。\n如有疑問請聯絡 HR。"
            )
            return WAITING_ID
        if bound_tid is None:
            self.sheets_client.bind_telegram_id(employee_id, current_tid)
            if self.audit_logger:
                self.audit_logger.log("telegram_bind", f"tg:{current_tid}", employee_id)

        # 同一員工同月重複申請檢查
        current_month = date.today().strftime("%Y-%m")
        existing = self.sheets_client.find_row(
            "work_permits", "employee_id", employee_id
        )
        if existing and existing.get("apply_month", "") == current_month:
            await update.message.reply_text(
                f"您本月（{current_month}）已有工作許可申請紀錄，無法重複申請。\n"
                "如有疑問請聯絡 HR。"
            )
            return ConversationHandler.END

        # 自動填入資料
        permit_data = {
            "employee_id": employee.get("employee_id", ""),
            "name": employee.get("name", ""),
            "department": employee.get("department", ""),
            "position": employee.get("position", ""),
            "apply_date": date.today().isoformat(),
            "apply_month": current_month,
        }
        context.user_data["employee"] = employee
        context.user_data["permit_data"] = permit_data

        await update.message.reply_text(
            f"以下工作許可申請資訊已自動填入：\n\n"
            f"員工編號：{permit_data['employee_id']}\n"
            f"姓名：{permit_data['name']}\n"
            f"部門：{permit_data['department']}\n"
            f"職位：{permit_data['position']}\n"
            f"申請日期：{permit_data['apply_date']}\n\n"
            "請確認以上資訊正確後，輸入「確認」送出申請，或輸入「取消」中止。"
        )
        return CONFIRMING

    async def submit(self, update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
        text = update.message.text.strip()

        if text != "確認":
            await update.message.reply_text(
                "請輸入「確認」以送出申請，或輸入 /cancel 取消。"
            )
            return CONFIRMING

        permit_data = context.user_data.get("permit_data", {})
        permit_data["status"] = "pending"

        try:
            self.sheets_client.append_row("work_permits", permit_data)
            employee = context.user_data.get("employee", {})
            await self.notifier.send_async(
                to=self.notifier.hr_email,
                subject=f"工作許可申請通知 - {employee.get('name', '')}",
                body=(
                    f"員工 {employee.get('name', '')}（{employee.get('employee_id', '')}）"
                    f"已提交工作許可申請。\n"
                    f"部門：{permit_data.get('department', '')}\n"
                    f"職位：{permit_data.get('position', '')}\n"
                    f"申請日期：{permit_data.get('apply_date', '')}"
                ),
            )
            await update.message.reply_text(
                "工作許可申請已成功送出！HR 部門將盡快審核。"
            )
        except Exception as e:
            logger.error("work_permit submit error: %s", e)
            await update.message.reply_text(
                "送出時發生錯誤，請稍後再試或聯絡 HR。"
            )

        context.user_data.clear()
        return ConversationHandler.END

    async def cancel(self, update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
        context.user_data.clear()
        await update.message.reply_text("已取消工作許可申請。如需重新開始，請輸入 /start。")
        return ConversationHandler.END

    def build_conversation_handler(self) -> ConversationHandler:
        return ConversationHandler(
            entry_points=[CommandHandler("start", self.start)],
            states={
                WAITING_ID: [
                    MessageHandler(filters.TEXT & ~filters.COMMAND, self.verify_id)
                ],
                CONFIRMING: [
                    MessageHandler(filters.TEXT & ~filters.COMMAND, self.submit)
                ],
            },
            fallbacks=[CommandHandler("cancel", self.cancel)],
        )
