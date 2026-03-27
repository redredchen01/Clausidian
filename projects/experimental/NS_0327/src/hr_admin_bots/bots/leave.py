from __future__ import annotations

import logging
from datetime import date, datetime
from typing import Any, Optional

from telegram import InlineKeyboardButton, InlineKeyboardMarkup, Update
from telegram.ext import (
    Application,
    CallbackQueryHandler,
    CommandHandler,
    ConversationHandler,
    ContextTypes,
    MessageHandler,
    filters,
)

from hr_admin_bots.bots.base import BaseBot
from hr_admin_bots.constants import LEAVE_QUOTA

logger = logging.getLogger(__name__)

WAITING_ID, SELECT_TYPE, INPUT_START, INPUT_END, INPUT_REASON, CONFIRMING = range(6)

DATE_FORMAT = "%Y-%m-%d"


class LeaveBot(BaseBot):
    """請假申請 Bot。"""

    WAITING_ID = WAITING_ID
    SELECT_TYPE = SELECT_TYPE
    INPUT_START = INPUT_START
    INPUT_END = INPUT_END
    INPUT_REASON = INPUT_REASON
    CONFIRMING = CONFIRMING

    def __init__(
        self,
        name: str,
        bot_config: Any,
        sheets_client: Any,
        auth: Any,
        notifier: Any,
        approval_manager: Any = None,
        audit_logger: Any = None,
        smart: Any = None,
    ) -> None:
        super().__init__(name, bot_config, sheets_client, auth, notifier, approval_manager, audit_logger)
        self.smart = smart

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

        # Telegram ID 綁定檢查
        current_tid = update.effective_user.id
        bound_tid = self.sheets_client.get_telegram_id(employee_id)

        if bound_tid is None:
            self.sheets_client.bind_telegram_id(employee_id, current_tid)
        elif bound_tid != current_tid:
            await update.message.reply_text(
                "此員工編號已綁定其他 Telegram 帳號，無法繼續。\n"
                "如有疑問請聯絡 HR。"
            )
            return WAITING_ID

        context.user_data["employee"] = employee
        return await self.select_type(update, context)

    async def select_type(self, update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
        """顯示假別選單（InlineKeyboard）。"""
        employee = context.user_data.get("employee", {})
        employee_id = employee.get("employee_id", "")

        annual_balance = self._get_annual_balance(employee_id)

        # 取得智能建議假別
        suggested_type = None
        if self.smart is not None:
            try:
                suggested_type = self.smart.suggest_leave_type(employee_id)
            except Exception:
                pass

        def _label(lt: str, quota_str: str) -> str:
            label = f"{lt}（{quota_str}）"
            if lt == suggested_type:
                label = f"{label} ✦建議"
            return label

        # 組建假別按鈕，若有建議則額外在最上方加一個快速鍵
        keyboard = []
        if suggested_type:
            keyboard.append([
                InlineKeyboardButton(f"★ {suggested_type}（建議）", callback_data=suggested_type)
            ])

        keyboard += [
            [InlineKeyboardButton(_label("年假", f"剩餘 {annual_balance} 天"), callback_data="年假")],
            [
                InlineKeyboardButton(_label("病假", "無限額"), callback_data="病假"),
                InlineKeyboardButton(_label("事假", f"{LEAVE_QUOTA['事假']} 天"), callback_data="事假"),
            ],
            [
                InlineKeyboardButton(_label("喪假", f"{LEAVE_QUOTA['喪假']} 天"), callback_data="喪假"),
                InlineKeyboardButton(_label("婚假", f"{LEAVE_QUOTA['婚假']} 天"), callback_data="婚假"),
            ],
            [
                InlineKeyboardButton(_label("產假", f"{LEAVE_QUOTA['產假']} 天"), callback_data="產假"),
                InlineKeyboardButton(_label("陪產假", f"{LEAVE_QUOTA['陪產假']} 天"), callback_data="陪產假"),
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

        # 嘗試取得建議原因
        suggested_reason = None
        if self.smart is not None:
            try:
                employee = context.user_data.get("employee", {})
                employee_id = employee.get("employee_id", "")
                leave_type = context.user_data.get("leave_type", "")
                suggested_reason = self.smart.suggest_reason(employee_id, leave_type)
            except Exception:
                pass

        if suggested_reason:
            keyboard = [[InlineKeyboardButton(f"★ {suggested_reason}（建議）", callback_data=f"__reason__{suggested_reason}")]]
            reply_markup = InlineKeyboardMarkup(keyboard)
            await update.message.reply_text(
                f"請假天數：{days} 天\n\n請輸入請假原因，或點選以下建議：",
                reply_markup=reply_markup,
            )
        else:
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

        # 重疊日期檢查
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
        apply_date = date.today().isoformat()
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
            "apply_date": apply_date,
        }

        try:
            self.sheets_client.append_row("leaves", row)

            # Audit
            if self.audit_logger is not None:
                self.audit_logger.log(
                    action="leave_submit",
                    actor=str(update.effective_user.id),
                    target_employee=employee.get("employee_id", ""),
                    details=f"{row['leave_type']} {row['start_date']}~{row['end_date']} ({row['days']}天)",
                )

            # 取得剛寫入的 row index（最後一筆資料 row）
            ws = self.sheets_client.get_worksheet("leaves")
            records = ws.get_all_records()
            row_index = len(records)  # 1-based，最後一筆

            request_data = dict(row)
            request_data["id"] = str(row_index)

            if self.approval_manager is not None:
                # 優先送 Telegram 主管核准，否則 fallback email
                sent_telegram = await self.approval_manager.send_approval_request(
                    _BotWrapper(context.bot),
                    employee,
                    request_data,
                    "leave",
                )
            else:
                # 舊有 email 通知邏輯
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

    # --- Feature 4: /status 與 /balance 指令 ---

    async def status_command(self, update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
        """顯示使用者近期/待審請假申請狀態。"""
        telegram_id = update.effective_user.id

        # 找出對應員工
        employee = self._find_employee_by_telegram_id(telegram_id)
        if not employee:
            await update.message.reply_text(
                "找不到您的員工資料。請先透過 /start 綁定員工編號。"
            )
            return

        employee_id = str(employee.get("employee_id", ""))
        try:
            rows = self.sheets_client.find_rows("leaves", filters={"employee_id": employee_id})
        except Exception as e:
            logger.error("status_command query error: %s", e)
            await update.message.reply_text("查詢失敗，請稍後再試。")
            return

        if not rows:
            await update.message.reply_text("您目前沒有任何請假紀錄。")
            return

        # 顯示最近 5 筆（依 apply_date 倒序）
        sorted_rows = sorted(rows, key=lambda r: r.get("apply_date", ""), reverse=True)[:5]
        lines = ["您的請假申請紀錄（最近 5 筆）：\n"]
        for r in sorted_rows:
            status_label = {
                "pending": "待審中",
                "approved": "已核准",
                "rejected": "已駁回",
            }.get(str(r.get("status", "")), r.get("status", ""))
            lines.append(
                f"• {r.get('leave_type', '')} | {r.get('start_date', '')}~{r.get('end_date', '')} "
                f"（{r.get('days', '')} 天） | {status_label}"
            )

        await update.message.reply_text("\n".join(lines))

    async def balance_command(self, update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
        """顯示各假別剩餘天數。"""
        telegram_id = update.effective_user.id

        employee = self._find_employee_by_telegram_id(telegram_id)
        if not employee:
            await update.message.reply_text(
                "找不到您的員工資料。請先透過 /start 綁定員工編號。"
            )
            return

        employee_id = str(employee.get("employee_id", ""))
        lines = ["您的假別餘額：\n"]

        # 年假
        annual_balance = self._get_annual_balance(employee_id)
        lines.append(f"• 年假：剩餘 {annual_balance} 天")

        # 病假（無限）
        lines.append("• 病假：無限額")

        # 其他固定配額假別
        for leave_type, quota in LEAVE_QUOTA.items():
            if leave_type in ("病假",):
                continue
            used = self._get_used_days(employee_id, leave_type)
            remaining = max(quota - used, 0)
            lines.append(f"• {leave_type}：年度配額 {quota} 天，已用 {used} 天，剩餘 {remaining} 天")

        await update.message.reply_text("\n".join(lines))

    async def stats_command(self, update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
        """顯示 HR 統計：本月申請數、狀態分布、平均審核時間、各假別使用率。"""
        try:
            all_rows = self.sheets_client.find_rows("leaves")
        except Exception as e:
            logger.error("stats_command query error: %s", e)
            await update.message.reply_text("查詢統計資料失敗，請稍後再試。")
            return

        today = date.today()
        current_month_prefix = today.strftime("%Y-%m")

        # 本月申請
        monthly_rows = [r for r in all_rows if r.get("apply_date", "").startswith(current_month_prefix)]

        # 狀態分布（全部）
        status_count: dict[str, int] = {}
        for r in all_rows:
            s = str(r.get("status", "unknown"))
            status_count[s] = status_count.get(s, 0) + 1

        # 本月各假別申請數
        type_count: dict[str, int] = {}
        for r in monthly_rows:
            lt = str(r.get("leave_type", "未知"))
            type_count[lt] = type_count.get(lt, 0) + 1

        # 平均審核時間（有 apply_date 且 status 非 pending 的記錄）
        approval_durations: list[float] = []
        for r in all_rows:
            if r.get("status") not in ("approved", "rejected"):
                continue
            apply_str = r.get("apply_date", "")
            approved_str = r.get("approved_at", "")
            if not apply_str or not approved_str:
                continue
            try:
                t0 = datetime.fromisoformat(apply_str)
                t1 = datetime.fromisoformat(approved_str)
                hours = (t1 - t0).total_seconds() / 3600
                if hours >= 0:
                    approval_durations.append(hours)
            except ValueError:
                continue

        avg_hours = (
            sum(approval_durations) / len(approval_durations)
            if approval_durations
            else None
        )

        # 組合訊息
        lines = [f"HR 請假統計（截至 {today}）\n"]
        lines.append(f"本月申請總數：{len(monthly_rows)} 筆")

        if type_count:
            lines.append("\n本月假別分布：")
            for lt, cnt in sorted(type_count.items(), key=lambda x: -x[1]):
                lines.append(f"  {lt}：{cnt} 筆")

        lines.append("\n全部申請狀態：")
        label_map = {"pending": "待審中", "approved": "已核准", "rejected": "已駁回"}
        for s, cnt in sorted(status_count.items(), key=lambda x: -x[1]):
            lines.append(f"  {label_map.get(s, s)}：{cnt} 筆")

        if avg_hours is not None:
            lines.append(f"\n平均審核時間：{avg_hours:.1f} 小時")
        else:
            lines.append("\n平均審核時間：資料不足")

        await update.message.reply_text("\n".join(lines))

    # --- 內部工具方法 ---

    def _find_employee_by_telegram_id(self, telegram_id: int) -> Optional[dict]:
        """依 Telegram ID 從 employees sheet 找員工。"""
        try:
            ws = self.sheets_client.get_worksheet("employees")
            records = ws.get_all_records()
            for row in records:
                raw = row.get("telegram_id", "")
                if raw == "" or raw is None:
                    continue
                try:
                    if int(raw) == telegram_id:
                        return row
                except (ValueError, TypeError):
                    continue
        except Exception as e:
            logger.warning("_find_employee_by_telegram_id error: %s", e)
        return None

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
                    if not (end_date < existing_start or start_date > existing_end):
                        return True
        except Exception as e:
            logger.warning("check overlap error: %s", e)
        return False

    async def _handle_suggested_reason(self, update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
        """處理使用者點選建議原因按鈕。"""
        query = update.callback_query
        await query.answer()
        reason = query.data.removeprefix("__reason__")
        context.user_data["reason"] = reason

        employee = context.user_data.get("employee", {})
        employee_id = employee.get("employee_id", "")
        leave_type = context.user_data.get("leave_type", "")
        start_date = context.user_data.get("start_date", "")
        end_date = context.user_data.get("end_date", "")
        days = context.user_data.get("days", 0)

        overlap = self._check_overlap(employee_id, start_date, end_date)
        if overlap:
            await query.message.reply_text(
                f"您在 {start_date} 至 {end_date} 期間已有待審或已核准的請假紀錄，"
                "無法提交重疊申請。\n請重新輸入 /start 或聯絡 HR。"
            )
            context.user_data.clear()
            return ConversationHandler.END

        balance_msg = self._check_balance(employee_id, leave_type, days)
        if balance_msg:
            await query.message.reply_text(balance_msg)
            context.user_data.clear()
            return ConversationHandler.END

        await query.message.reply_text(
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
                    CallbackQueryHandler(self._handle_suggested_reason, pattern=r"^__reason__"),
                    MessageHandler(filters.TEXT & ~filters.COMMAND, self.check_and_confirm),
                ],
                CONFIRMING: [
                    MessageHandler(filters.TEXT & ~filters.COMMAND, self.submit)
                ],
            },
            fallbacks=[CommandHandler("cancel", self.cancel)],
        )

    def build_application(self) -> Application:
        """建立 Application，加入 /status、/balance 指令與 approval callback。"""
        app = Application.builder().token(self.bot_config.token).build()
        app.add_handler(self.build_conversation_handler())
        app.add_handler(CommandHandler("status", self.status_command))
        app.add_handler(CommandHandler("balance", self.balance_command))
        app.add_handler(CommandHandler("stats", self.stats_command))

        if self.approval_manager is not None:
            app.add_handler(
                CallbackQueryHandler(
                    self.approval_manager.handle_approval_callback,
                    pattern=r"^(approve|reject):",
                )
            )

        return app


class _BotWrapper:
    """ApprovalManager.send_approval_request 需要 bot_app.bot，此 wrapper 補足介面。"""

    def __init__(self, bot: Any) -> None:
        self.bot = bot


def _parse_date(text: str) -> Optional[date]:
    """解析 YYYY-MM-DD 格式日期字串，失敗回傳 None。"""
    try:
        return datetime.strptime(text, DATE_FORMAT).date()
    except ValueError:
        return None
