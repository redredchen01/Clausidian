"""Background scheduler for automatic reminders.

Rules:
- Pending leave requests > 48 hours → remind manager
- Pending offboarding > 72 hours → remind HR
- Employee leave ending within 3 days → remind employee
"""
from __future__ import annotations

import asyncio
import logging
from datetime import date as date_type, datetime, timedelta
from typing import Any, Optional

logger = logging.getLogger(__name__)


class ReminderScheduler:
    """週期性掃描待審申請並發出提醒通知。"""

    def __init__(
        self,
        sheets_client: Any,
        notifier: Any,
        webhook_notifier: Optional[Any] = None,
        check_interval_hours: int = 6,
    ) -> None:
        self.sheets_client = sheets_client
        self.notifier = notifier
        self.webhook_notifier = webhook_notifier
        self.check_interval_hours = check_interval_hours
        self._running = False

    async def start(self) -> None:
        """持續執行提醒迴圈，直到 stop() 被呼叫。"""
        self._running = True
        logger.info("ReminderScheduler started (interval=%dh)", self.check_interval_hours)
        while self._running:
            try:
                await self._check_pending_leaves()
            except Exception as e:
                logger.error("Error in _check_pending_leaves: %s", e)
            try:
                await self._check_pending_offboarding()
            except Exception as e:
                logger.error("Error in _check_pending_offboarding: %s", e)
            try:
                await self._check_expiring_leaves()
            except Exception as e:
                logger.error("Error in _check_expiring_leaves: %s", e)

            await asyncio.sleep(self.check_interval_hours * 3600)

    def stop(self) -> None:
        self._running = False

    # ------------------------------------------------------------------
    # Internal check methods
    # ------------------------------------------------------------------

    async def _check_pending_leaves(self) -> None:
        """請假待審超過 48 小時 → 提醒主管。"""
        try:
            rows = self.sheets_client.find_rows("leaves", filters={"status": "pending"})
        except Exception as e:
            logger.error("Failed to query leaves: %s", e)
            return

        now = datetime.now()
        for row in rows:
            apply_date_str = row.get("apply_date", "")
            if not apply_date_str:
                continue
            try:
                # Full datetime string (e.g. from datetime.now().isoformat())
                apply_date = datetime.fromisoformat(apply_date_str)
            except ValueError:
                try:
                    # Date-only string (e.g. "2026-04-01") — treat as end of that day
                    parsed = date_type.fromisoformat(apply_date_str)
                    apply_date = datetime.combine(parsed, datetime.max.time().replace(microsecond=0))
                except ValueError:
                    continue

            if now - apply_date <= timedelta(hours=48):
                continue

            # 取主管 email
            employee_id = str(row.get("employee_id", ""))
            employee_name = row.get("name", employee_id)
            manager_email = self._get_manager_email(employee_id)
            hours_pending = int((now - apply_date).total_seconds() // 3600)

            subject = f"【提醒】請假申請待審逾 {hours_pending} 小時 - {employee_name}"
            body = (
                f"員工 {employee_name}（{employee_id}）的請假申請已等待審核超過 {hours_pending} 小時。\n\n"
                f"假別：{row.get('leave_type', '')}\n"
                f"日期：{row.get('start_date', '')} 至 {row.get('end_date', '')}（{row.get('days', '')} 天）\n"
                f"申請日期：{apply_date_str}\n\n"
                "請儘速登入系統審核。"
            )

            if manager_email:
                await asyncio.to_thread(
                    self.notifier.send, manager_email, subject, body
                )
                logger.info(
                    "Sent leave pending reminder to %s for employee %s",
                    manager_email, employee_id,
                )
            else:
                # fallback → HR
                await asyncio.to_thread(
                    self.notifier.notify_hr, subject, body
                )

    async def _check_pending_offboarding(self) -> None:
        """離職申請待審超過 72 小時 → 提醒 HR。"""
        try:
            rows = self.sheets_client.find_rows("offboarding", filters={"status": "pending"})
        except Exception as e:
            logger.error("Failed to query offboarding: %s", e)
            return

        now = datetime.now()
        for row in rows:
            submit_date_str = row.get("submit_date", row.get("apply_date", ""))
            if not submit_date_str:
                continue
            try:
                # Full datetime string
                submit_date = datetime.fromisoformat(submit_date_str)
            except ValueError:
                try:
                    # Date-only string — treat as end of that day
                    parsed = date_type.fromisoformat(submit_date_str)
                    submit_date = datetime.combine(parsed, datetime.max.time().replace(microsecond=0))
                except ValueError:
                    continue

            if now - submit_date <= timedelta(hours=72):
                continue

            employee_id = str(row.get("employee_id", ""))
            employee_name = row.get("name", employee_id)
            hours_pending = int((now - submit_date).total_seconds() // 3600)

            subject = f"【提醒】離職申請待處理逾 {hours_pending} 小時 - {employee_name}"
            body = (
                f"員工 {employee_name}（{employee_id}）的離職申請已提交 {hours_pending} 小時，尚未處理。\n\n"
                f"提交日期：{submit_date_str}\n\n"
                "請 HR 儘速跟進。"
            )
            await asyncio.to_thread(self.notifier.notify_hr, subject, body)
            logger.info(
                "Sent offboarding pending reminder to HR for employee %s", employee_id
            )

    async def _check_expiring_leaves(self) -> None:
        """已核准且 3 天內到期的請假 → 提醒員工。"""
        try:
            rows = self.sheets_client.find_rows("leaves", filters={"status": "approved"})
        except Exception as e:
            logger.error("Failed to query approved leaves: %s", e)
            return

        now = datetime.now()
        in_3_days = now + timedelta(days=3)

        for row in rows:
            end_date_str = row.get("end_date", "")
            if not end_date_str:
                continue
            try:
                end_date = datetime.fromisoformat(end_date_str)
            except ValueError:
                # 嘗試 date-only format
                try:
                    from datetime import date as _date
                    end_date = datetime.combine(
                        datetime.strptime(end_date_str, "%Y-%m-%d").date(),
                        datetime.min.time(),
                    )
                except ValueError:
                    continue

            if not (now <= end_date <= in_3_days):
                continue

            employee_id = str(row.get("employee_id", ""))
            employee_name = row.get("name", employee_id)
            leave_type = row.get("leave_type", "")

            employee_email = self._get_employee_email(employee_id)
            if not employee_email:
                continue

            subject = f"【提醒】您的{leave_type}假期即將於 {end_date_str} 結束"
            body = (
                f"親愛的 {employee_name}，\n\n"
                f"您的 {leave_type} 將於 {end_date_str} 結束。\n"
                f"請記得準時回到工作崗位或如需延長，請提前申請。\n\n"
                "此為系統自動提醒，請勿回覆。"
            )
            await asyncio.to_thread(self.notifier.send, employee_email, subject, body)
            logger.info(
                "Sent leave expiry reminder to %s for employee %s",
                employee_email, employee_id,
            )

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    def _get_manager_email(self, employee_id: str) -> str:
        try:
            emp = self.sheets_client.find_employee(employee_id)
            if emp:
                return emp.get("manager_email", "")
        except Exception as e:
            logger.warning("_get_manager_email error for %s: %s", employee_id, e)
        return ""

    def _get_employee_email(self, employee_id: str) -> str:
        try:
            emp = self.sheets_client.find_employee(employee_id)
            if emp:
                return emp.get("email", "")
        except Exception as e:
            logger.warning("_get_employee_email error for %s: %s", employee_id, e)
        return ""
