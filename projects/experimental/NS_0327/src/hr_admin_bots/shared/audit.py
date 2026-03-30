"""Audit trail — logs all HR operations to a dedicated worksheet."""
from __future__ import annotations

import logging
from datetime import datetime
from typing import Any

logger = logging.getLogger(__name__)


class AuditLogger:
    """將所有 HR 操作記錄到 Google Sheets 的 audit_log 工作表。"""

    WORKSHEET = "audit_log"

    def __init__(self, sheets_client: Any) -> None:
        self.sheets_client = sheets_client

    def log(
        self,
        action: str,
        actor: str,
        target_employee: str,
        details: str = "",
    ) -> None:
        """在 audit_log 工作表追加一筆操作記錄。

        欄位：timestamp, action, actor, target_employee, details
        """
        entry = {
            "timestamp": datetime.now().isoformat(),
            "action": action,
            "actor": actor,
            "target_employee": target_employee,
            "details": details,
        }
        try:
            self.sheets_client.append_row(self.WORKSHEET, entry)
        except Exception as e:
            # audit 失敗不應中斷業務流程，只記錄警告
            logger.warning(
                "AuditLogger.log failed (action=%s, actor=%s): %s",
                action, actor, e,
            )
