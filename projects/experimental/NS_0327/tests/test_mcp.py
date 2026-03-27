"""Tests for MCPServer tool handlers (not JSON-RPC transport)."""
from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest

from hr_admin_bots.mcp_server import MCPServer, MCPError


# ---------------------------------------------------------------------------
# Helpers — build MCPServer with all I/O patched
# ---------------------------------------------------------------------------

def make_server(employee: dict | None = None, leave_rows: list | None = None):
    """Instantiate MCPServer without a real config file or Google Sheets."""
    with patch("hr_admin_bots.mcp_server.MCPServer.__init__", lambda self, config_path: None):
        server = MCPServer.__new__(MCPServer)

    sheets = MagicMock()
    sheets.find_employee.return_value = employee
    sheets.find_rows.return_value = leave_rows or []

    server.sheets = sheets
    server.auth = MagicMock()
    return server, sheets


ALICE = {
    "employee_id": "E001",
    "name": "Alice",
    "department": "Engineering",
    "email": "alice@company.com",
    "manager_email": "boss@company.com",
    "annual_leave_quota": 15,
}

PENDING_LEAVES = [
    {
        "employee_id": "E001",
        "name": "Alice",
        "leave_type": "年假",
        "start_date": "2026-04-01",
        "end_date": "2026-04-03",
        "days": 3,
        "status": "pending",
        "apply_date": "2026-03-27",
    }
]


# ---------------------------------------------------------------------------
# _tool_hr_lookup_employee — found / not found
# ---------------------------------------------------------------------------

class TestToolHrLookupEmployee:
    def test_returns_employee_dict_when_found(self):
        server, sheets = make_server(employee=ALICE)
        result = server._tool_hr_lookup_employee({"employee_id": "E001"})
        assert result == ALICE

    def test_calls_find_employee_with_stripped_id(self):
        server, sheets = make_server(employee=ALICE)
        server._tool_hr_lookup_employee({"employee_id": "  E001  "})
        sheets.find_employee.assert_called_once_with("E001")

    def test_returns_none_when_employee_not_found(self):
        server, sheets = make_server(employee=None)
        result = server._tool_hr_lookup_employee({"employee_id": "GHOST"})
        assert result is None

    def test_raises_mcp_error_when_employee_id_missing(self):
        server, sheets = make_server()
        with pytest.raises(MCPError) as exc_info:
            server._tool_hr_lookup_employee({"employee_id": ""})
        assert exc_info.value.code == -32602

    def test_raises_mcp_error_when_employee_id_absent(self):
        server, sheets = make_server()
        with pytest.raises(MCPError):
            server._tool_hr_lookup_employee({})


# ---------------------------------------------------------------------------
# _tool_hr_check_leave_balance — returns balance
# ---------------------------------------------------------------------------

class TestToolHrCheckLeaveBalance:
    def test_returns_balance_for_sick_leave(self):
        server, sheets = make_server(employee=ALICE)
        result = server._tool_hr_check_leave_balance({"employee_id": "E001", "leave_type": "病假"})
        assert result["balance"] == -1
        assert result["note"] == "無限額"

    def test_returns_balance_for_annual_leave(self):
        server, sheets = make_server(employee=ALICE, leave_rows=[])
        result = server._tool_hr_check_leave_balance({"employee_id": "E001", "leave_type": "年假"})
        # quota 15, used 0 → balance 15
        assert result["balance"] == 15
        assert result["employee_id"] == "E001"

    def test_returns_balance_for_personal_leave(self):
        server, sheets = make_server(employee=ALICE, leave_rows=[])
        result = server._tool_hr_check_leave_balance({"employee_id": "E001", "leave_type": "事假"})
        # quota 10, used 0 → balance 10
        assert result["balance"] == 10
        assert "quota" in result
        assert "used" in result

    def test_deducts_used_days_from_balance(self):
        used_leave = {
            "employee_id": "E001",
            "leave_type": "事假",
            "days": 3,
            "status": "approved",
            "start_date": "2026-01-10",
        }
        server, sheets = make_server(employee=ALICE, leave_rows=[used_leave])
        result = server._tool_hr_check_leave_balance({"employee_id": "E001", "leave_type": "事假"})
        assert result["used"] == 3
        assert result["balance"] == 7

    def test_raises_mcp_error_when_employee_not_found(self):
        server, sheets = make_server(employee=None)
        with pytest.raises(MCPError) as exc_info:
            server._tool_hr_check_leave_balance({"employee_id": "GHOST", "leave_type": "年假"})
        assert exc_info.value.code == -32602
        assert "GHOST" in exc_info.value.message

    def test_raises_mcp_error_for_unsupported_leave_type(self):
        server, sheets = make_server(employee=ALICE)
        with pytest.raises(MCPError) as exc_info:
            server._tool_hr_check_leave_balance({"employee_id": "E001", "leave_type": "外星假"})
        assert exc_info.value.code == -32602


# ---------------------------------------------------------------------------
# _tool_hr_list_pending — returns pending records
# ---------------------------------------------------------------------------

class TestToolHrListPending:
    def test_returns_pending_leaves_when_request_type_is_leave(self):
        server, sheets = make_server()
        sheets.find_rows.return_value = PENDING_LEAVES
        result = server._tool_hr_list_pending({"request_type": "leave"})
        assert "leave" in result
        assert result["leave"] == PENDING_LEAVES

    def test_returns_empty_list_when_no_pending(self):
        server, sheets = make_server()
        sheets.find_rows.return_value = []
        result = server._tool_hr_list_pending({"request_type": "leave"})
        assert result["leave"] == []

    def test_all_request_type_returns_all_sheets(self):
        server, sheets = make_server()
        sheets.find_rows.return_value = []
        result = server._tool_hr_list_pending({"request_type": "all"})
        assert "leave" in result
        assert "onboarding" in result
        assert "work_permit" in result
        assert "offboarding" in result

    def test_onboarding_pending_returned_correctly(self):
        server, sheets = make_server()
        onboarding_row = {"employee_id": "E002", "name": "Bob", "status": "pending"}
        sheets.find_rows.return_value = [onboarding_row]
        result = server._tool_hr_list_pending({"request_type": "onboarding"})
        assert result["onboarding"] == [onboarding_row]

    def test_sheets_error_returns_empty_list_for_that_type(self):
        server, sheets = make_server()
        sheets.find_rows.side_effect = Exception("Sheets API error")
        result = server._tool_hr_list_pending({"request_type": "leave"})
        assert result["leave"] == []
