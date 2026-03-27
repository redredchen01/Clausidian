"""MCP Server for HR Admin Bot Package.

Exposes HR operations as MCP tools so AI agents (Claude Code, etc.)
can perform HR tasks programmatically.

Implements JSON-RPC 2.0 over stdin/stdout — no external MCP library needed.

Start:
    python -m hr_admin_bots.mcp_server --config config.json
"""
from __future__ import annotations

import argparse
import json
import logging
import sys
from datetime import date
from typing import Any, Optional

logger = logging.getLogger(__name__)

TOOLS = [
    {
        "name": "hr_lookup_employee",
        "description": "Look up employee by ID. Returns employee info or null.",
        "inputSchema": {
            "type": "object",
            "properties": {"employee_id": {"type": "string"}},
            "required": ["employee_id"],
        },
    },
    {
        "name": "hr_check_leave_balance",
        "description": "Check remaining leave balance for an employee by type.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "employee_id": {"type": "string"},
                "leave_type": {
                    "type": "string",
                    "enum": ["年假", "病假", "事假", "喪假", "婚假", "產假", "陪產假"],
                },
            },
            "required": ["employee_id", "leave_type"],
        },
    },
    {
        "name": "hr_apply_leave",
        "description": "Submit a leave application for an employee.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "employee_id": {"type": "string"},
                "leave_type": {"type": "string"},
                "start_date": {"type": "string", "description": "YYYY-MM-DD"},
                "end_date": {"type": "string", "description": "YYYY-MM-DD"},
                "reason": {"type": "string"},
            },
            "required": ["employee_id", "leave_type", "start_date", "end_date", "reason"],
        },
    },
    {
        "name": "hr_approve_leave",
        "description": "Approve or reject a pending leave request.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "employee_id": {"type": "string"},
                "request_index": {
                    "type": "integer",
                    "description": "1-based row index in leaves sheet",
                },
                "action": {"type": "string", "enum": ["approve", "reject"]},
            },
            "required": ["employee_id", "request_index", "action"],
        },
    },
    {
        "name": "hr_list_pending",
        "description": "List all pending requests across all HR sheets.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "request_type": {
                    "type": "string",
                    "enum": ["leave", "onboarding", "work_permit", "offboarding", "all"],
                }
            },
            "required": ["request_type"],
        },
    },
    {
        "name": "hr_submit_onboarding",
        "description": "Submit onboarding record for a new employee.",
        "inputSchema": {
            "type": "object",
            "properties": {"employee_id": {"type": "string"}},
            "required": ["employee_id"],
        },
    },
    {
        "name": "hr_submit_work_permit",
        "description": "Submit work permit application for an employee.",
        "inputSchema": {
            "type": "object",
            "properties": {"employee_id": {"type": "string"}},
            "required": ["employee_id"],
        },
    },
    {
        "name": "hr_submit_offboarding",
        "description": "Submit offboarding/resignation request for an employee.",
        "inputSchema": {
            "type": "object",
            "properties": {"employee_id": {"type": "string"}},
            "required": ["employee_id"],
        },
    },
]

# Leave quota constants (mirrors leave.py)
_LEAVE_QUOTA: dict[str, int] = {
    "病假": -1,
    "事假": 10,
    "喪假": 3,
    "婚假": 5,
    "產假": 98,
    "陪產假": 15,
}


class MCPServer:
    """Minimal MCP server: JSON-RPC 2.0 over stdin/stdout."""

    def __init__(self, config_path: str) -> None:
        from hr_admin_bots.config import Config
        from hr_admin_bots.shared.auth import EmployeeAuth
        from hr_admin_bots.shared.sheets import SheetsClient

        self.config = Config.from_json(config_path)
        self.sheets = SheetsClient(
            credentials_file=self.config.google_credentials_file,
            sheet_id=self.config.google_sheet_id,
        )
        self.auth = EmployeeAuth(sheets_client=self.sheets)

    # ------------------------------------------------------------------
    # JSON-RPC transport
    # ------------------------------------------------------------------

    def run(self) -> None:
        """Main loop: read newline-delimited JSON-RPC from stdin, reply to stdout."""
        logging.basicConfig(level=logging.WARNING, stream=sys.stderr)
        logger.info("MCP server started")

        for raw_line in sys.stdin:
            raw_line = raw_line.strip()
            if not raw_line:
                continue
            try:
                request = json.loads(raw_line)
            except json.JSONDecodeError as e:
                self._write_error(None, -32700, f"解析錯誤：{e}")
                continue

            req_id = request.get("id")
            method = request.get("method", "")
            params = request.get("params", {})

            try:
                result = self._dispatch(method, params)
                self._write_result(req_id, result)
            except MCPError as e:
                self._write_error(req_id, e.code, e.message)
            except Exception as e:
                logger.exception("Unhandled error in method '%s'", method)
                self._write_error(req_id, -32603, f"內部錯誤：{e}")

    def _dispatch(self, method: str, params: dict) -> Any:
        if method == "initialize":
            return {
                "protocolVersion": "2024-11-05",
                "serverInfo": {"name": "hr-admin-bots", "version": "0.3.0"},
                "capabilities": {"tools": {}},
            }
        if method == "tools/list":
            return {"tools": TOOLS}
        if method == "tools/call":
            return self._call_tool(params.get("name", ""), params.get("arguments", {}))
        raise MCPError(-32601, f"未知方法：{method}")

    def _call_tool(self, name: str, args: dict) -> dict:
        handler = getattr(self, f"_tool_{name}", None)
        if handler is None:
            raise MCPError(-32601, f"未知工具：{name}")
        result = handler(args)
        # MCP content format
        return {"content": [{"type": "text", "text": json.dumps(result, ensure_ascii=False)}]}

    def _write_result(self, req_id: Any, result: Any) -> None:
        response = {"jsonrpc": "2.0", "id": req_id, "result": result}
        print(json.dumps(response, ensure_ascii=False), flush=True)

    def _write_error(self, req_id: Any, code: int, message: str) -> None:
        response = {
            "jsonrpc": "2.0",
            "id": req_id,
            "error": {"code": code, "message": message},
        }
        print(json.dumps(response, ensure_ascii=False), flush=True)

    # ------------------------------------------------------------------
    # Tool handlers
    # ------------------------------------------------------------------

    def _tool_hr_lookup_employee(self, args: dict) -> Any:
        employee_id = args.get("employee_id", "").strip()
        if not employee_id:
            raise MCPError(-32602, "缺少 employee_id 參數")
        return self.sheets.find_employee(employee_id)

    def _tool_hr_check_leave_balance(self, args: dict) -> dict:
        employee_id = args.get("employee_id", "").strip()
        leave_type = args.get("leave_type", "").strip()

        employee = self.sheets.find_employee(employee_id)
        if not employee:
            raise MCPError(-32602, f"找不到員工：{employee_id}")

        if leave_type == "病假":
            return {"employee_id": employee_id, "leave_type": leave_type, "balance": -1, "note": "無限額"}

        if leave_type == "年假":
            balance = self._get_annual_balance(employee_id, employee)
            return {"employee_id": employee_id, "leave_type": leave_type, "balance": balance}

        quota = _LEAVE_QUOTA.get(leave_type)
        if quota is None:
            raise MCPError(-32602, f"不支援的假別：{leave_type}")

        used = self._get_used_days(employee_id, leave_type)
        return {
            "employee_id": employee_id,
            "leave_type": leave_type,
            "quota": quota,
            "used": used,
            "balance": max(quota - used, 0),
        }

    def _tool_hr_apply_leave(self, args: dict) -> dict:
        employee_id = args.get("employee_id", "").strip()
        leave_type = args.get("leave_type", "").strip()
        start_date = args.get("start_date", "").strip()
        end_date = args.get("end_date", "").strip()
        reason = args.get("reason", "").strip()

        employee = self.sheets.find_employee(employee_id)
        if not employee:
            raise MCPError(-32602, f"找不到員工：{employee_id}")

        try:
            from datetime import date as date_cls
            sd = date_cls.fromisoformat(start_date)
            ed = date_cls.fromisoformat(end_date)
        except ValueError:
            raise MCPError(-32602, "日期格式錯誤，請使用 YYYY-MM-DD")

        if ed < sd:
            raise MCPError(-32602, "結束日期不可早於開始日期")

        days = (ed - sd).days + 1

        row = {
            "employee_id": employee_id,
            "name": employee.get("name", ""),
            "department": employee.get("department", ""),
            "leave_type": leave_type,
            "start_date": start_date,
            "end_date": end_date,
            "days": days,
            "reason": reason,
            "status": "pending",
            "apply_date": date.today().isoformat(),
        }
        self.sheets.append_row("leaves", row)

        ws = self.sheets.get_worksheet("leaves")
        row_index = len(ws.get_all_records())

        return {"success": True, "row_index": row_index, "days": days, "status": "pending"}

    def _tool_hr_approve_leave(self, args: dict) -> dict:
        employee_id = args.get("employee_id", "").strip()
        request_index = args.get("request_index")
        action = args.get("action", "").strip()

        if not employee_id:
            raise MCPError(-32602, "缺少 employee_id 參數")
        if request_index is None:
            raise MCPError(-32602, "缺少 request_index 參數")
        if action not in ("approve", "reject"):
            raise MCPError(-32602, "action 必須為 approve 或 reject")

        employee = self.sheets.find_employee(employee_id)
        if not employee:
            raise MCPError(-32602, f"找不到員工：{employee_id}")

        new_status = "approved" if action == "approve" else "rejected"
        self.sheets.update_cell("leaves", int(request_index), "status", new_status)

        return {"success": True, "request_index": request_index, "new_status": new_status}

    def _tool_hr_list_pending(self, args: dict) -> dict:
        request_type = args.get("request_type", "all")

        sheet_map = {
            "leave": "leaves",
            "onboarding": "onboarding",
            "work_permit": "work_permits",
            "offboarding": "offboarding",
        }

        targets = list(sheet_map.items()) if request_type == "all" else [(request_type, sheet_map.get(request_type, request_type))]

        results: dict[str, list] = {}
        for rtype, sheet_name in targets:
            try:
                rows = self.sheets.find_rows(sheet_name, filters={"status": "pending"})
                results[rtype] = rows
            except Exception as e:
                logger.warning("list_pending: error reading sheet '%s': %s", sheet_name, e)
                results[rtype] = []

        return results

    def _tool_hr_submit_onboarding(self, args: dict) -> dict:
        employee_id = args.get("employee_id", "").strip()
        employee = self.sheets.find_employee(employee_id)
        if not employee:
            raise MCPError(-32602, f"找不到員工：{employee_id}")

        row = {
            "employee_id": employee_id,
            "name": employee.get("name", ""),
            "department": employee.get("department", ""),
            "position": employee.get("position", ""),
            "email": employee.get("email", ""),
            "status": "pending",
            "submit_date": date.today().isoformat(),
        }
        self.sheets.append_row("onboarding", row)
        return {"success": True, "employee_id": employee_id, "status": "pending"}

    def _tool_hr_submit_work_permit(self, args: dict) -> dict:
        employee_id = args.get("employee_id", "").strip()
        employee = self.sheets.find_employee(employee_id)
        if not employee:
            raise MCPError(-32602, f"找不到員工：{employee_id}")

        row = {
            "employee_id": employee_id,
            "name": employee.get("name", ""),
            "department": employee.get("department", ""),
            "position": employee.get("position", ""),
            "status": "pending",
            "submit_date": date.today().isoformat(),
        }
        self.sheets.append_row("work_permits", row)
        return {"success": True, "employee_id": employee_id, "status": "pending"}

    def _tool_hr_submit_offboarding(self, args: dict) -> dict:
        employee_id = args.get("employee_id", "").strip()
        employee = self.sheets.find_employee(employee_id)
        if not employee:
            raise MCPError(-32602, f"找不到員工：{employee_id}")

        row = {
            "employee_id": employee_id,
            "name": employee.get("name", ""),
            "department": employee.get("department", ""),
            "position": employee.get("position", ""),
            "email": employee.get("email", ""),
            "manager_email": employee.get("manager_email", ""),
            "status": "pending",
            "submit_date": date.today().isoformat(),
        }
        self.sheets.append_row("offboarding", row)
        return {"success": True, "employee_id": employee_id, "status": "pending"}

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _get_annual_balance(self, employee_id: str, employee: dict) -> int:
        quota = int(employee.get("annual_leave_quota", 0))
        used = self._get_used_days(employee_id, "年假")
        return max(quota - used, 0)

    def _get_used_days(self, employee_id: str, leave_type: str) -> int:
        rows = self.sheets.find_rows("leaves", filters={"employee_id": employee_id, "leave_type": leave_type})
        current_year = str(date.today().year)
        total = 0
        for row in rows:
            if row.get("status") in ("pending", "approved"):
                if row.get("start_date", "").startswith(current_year):
                    try:
                        total += int(row.get("days", 0))
                    except (ValueError, TypeError):
                        pass
        return total


class MCPError(Exception):
    def __init__(self, code: int, message: str) -> None:
        super().__init__(message)
        self.code = code
        self.message = message


def main() -> None:
    parser = argparse.ArgumentParser(description="MCP Server for HR Admin Bot Package")
    parser.add_argument("--config", default="config.json", help="Path to config JSON (default: config.json)")
    args = parser.parse_args()

    server = MCPServer(config_path=args.config)
    server.run()


if __name__ == "__main__":
    main()
