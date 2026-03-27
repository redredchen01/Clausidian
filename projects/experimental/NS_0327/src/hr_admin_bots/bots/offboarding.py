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

# 離職交接 checklist 項目
OFFBOARDING_CHECKLIST = [
    "繳回門禁卡/識別證",
    "繳回公司設備（筆電/手機）",
    "移交工作職責與文件",
    "結清費用報銷",
    "完成系統帳號停用申請",
    "簽署離職同意書",
    "辦理勞健保退保",
    "薪資結算確認",
]


class OffboardingBot(BaseBot):
    """離職申請 Bot。驗證身分後自動產生離職申請與交接清單。"""

    WAITING_ID = WAITING_ID
    CONFIRMING = CONFIRMING

    def __init__(self, name: str, bot_config: Any, sheets_client: Any, auth: Any, notifier: Any) -> None:
        super().__init__(name, bot_config, sheets_client, auth, notifier)

    async def start(self, update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
        await update.message.reply_text(
            "歡迎使用離職申請系統。\n請輸入您的員工編號："
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

        # 重複離職申請檢查（pending 狀態）
        existing = self.sheets_client.find_row("offboarding", "employee_id", employee_id)
        if existing and existing.get("status") == "pending":
            await update.message.reply_text(
                f"員工 {employee_id} 已有待審的離職申請，無法重複提交。\n"
                "如有疑問請聯絡 HR。"
            )
            return ConversationHandler.END

        context.user_data["employee"] = employee

        checklist_text = "\n".join(
            f"  {i + 1}. {item}" for i, item in enumerate(OFFBOARDING_CHECKLIST)
        )
        info = self._format_employee_info(employee)

        await update.message.reply_text(
            f"以下離職申請將自動產生：\n\n"
            f"{info}\n"
            f"申請日期：{date.today().isoformat()}\n\n"
            f"離職交接清單：\n{checklist_text}\n\n"
            "請輸入「確認」送出離職申請，或輸入「取消」中止。"
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
        checklist_json = "|".join(OFFBOARDING_CHECKLIST)

        row = {
            "employee_id": employee.get("id", ""),
            "name": employee.get("name", ""),
            "department": employee.get("department", ""),
            "position": employee.get("position", ""),
            "apply_date": date.today().isoformat(),
            "status": "pending",
            "checklist": checklist_json,
        }

        try:
            self.sheets_client.append_row("offboarding", row)

            # 同時通知 HR 與主管
            manager_email = employee.get("manager_email", self.notifier.hr_email)
            checklist_text = "\n".join(
                f"  {i + 1}. {item}" for i, item in enumerate(OFFBOARDING_CHECKLIST)
            )
            email_body = (
                f"員工 {employee.get('name', '')}（{employee.get('id', '')}）"
                f"提出離職申請，請盡快處理。\n\n"
                f"部門：{employee.get('department', '')}\n"
                f"職位：{employee.get('position', '')}\n"
                f"申請日期：{row['apply_date']}\n\n"
                f"離職交接清單：\n{checklist_text}"
            )

            self.notifier.send(
                to=self.notifier.hr_email,
                subject=f"離職申請通知（HR）- {employee.get('name', '')}",
                body=email_body,
            )
            if manager_email != self.notifier.hr_email:
                self.notifier.send(
                    to=manager_email,
                    subject=f"離職申請通知（主管）- {employee.get('name', '')}",
                    body=email_body,
                )

            await update.message.reply_text(
                "離職申請已成功送出！HR 與您的主管將盡快與您聯繫辦理後續手續。"
            )
        except Exception as e:
            logger.error("offboarding submit error: %s", e)
            await update.message.reply_text(
                "送出時發生錯誤，請稍後再試或聯絡 HR。"
            )

        context.user_data.clear()
        return ConversationHandler.END

    async def cancel(self, update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
        context.user_data.clear()
        await update.message.reply_text("已取消離職申請。如需重新開始，請輸入 /start。")
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
