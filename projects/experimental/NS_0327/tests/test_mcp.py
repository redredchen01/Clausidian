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

    smart = MagicMock()
    smart.detect_anomalies.return_value = []
    smart.generate_monthly_summary.return_value = {
        "month": "2026-03",
        "leave": {"total": 0, "by_type": {}, "by_status": {}, "avg_days": 0},
        "onboarding": {"total": 0},
        "work_permit": {"total": 0},
        "offboarding": {"total": 0},
        "anomalies": [],
    }
    server.smart = smart

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


# ---------------------------------------------------------------------------
# _tool_hr_apply_leave
# ---------------------------------------------------------------------------

class TestToolHrApplyLeave:
    def _make_ws(self, records_count: int = 1):
        ws = MagicMock()
        ws.get_all_records.return_value = [{}] * records_count
        return ws

    def test_success_appends_row_and_returns_row_index(self):
        server, sheets = make_server(employee=ALICE)
        ws = self._make_ws(3)
        sheets.get_worksheet.return_value = ws

        result = server._tool_hr_apply_leave({
            "employee_id": "E001",
            "leave_type": "年假",
            "start_date": "2026-04-01",
            "end_date": "2026-04-03",
            "reason": "休息",
        })

        sheets.append_row.assert_called_once()
        assert result["success"] is True
        assert result["row_index"] == 3
        assert result["days"] == 3
        assert result["status"] == "pending"

    def test_employee_not_found_raises_mcp_error(self):
        server, sheets = make_server(employee=None)
        with pytest.raises(MCPError) as exc_info:
            server._tool_hr_apply_leave({
                "employee_id": "GHOST",
                "leave_type": "年假",
                "start_date": "2026-04-01",
                "end_date": "2026-04-03",
                "reason": "休息",
            })
        assert exc_info.value.code == -32602
        assert "GHOST" in exc_info.value.message

    def test_invalid_date_format_raises_mcp_error(self):
        server, sheets = make_server(employee=ALICE)
        with pytest.raises(MCPError) as exc_info:
            server._tool_hr_apply_leave({
                "employee_id": "E001",
                "leave_type": "年假",
                "start_date": "not-a-date",
                "end_date": "2026-04-03",
                "reason": "休息",
            })
        assert exc_info.value.code == -32602

    def test_end_before_start_raises_mcp_error(self):
        server, sheets = make_server(employee=ALICE)
        with pytest.raises(MCPError) as exc_info:
            server._tool_hr_apply_leave({
                "employee_id": "E001",
                "leave_type": "年假",
                "start_date": "2026-04-05",
                "end_date": "2026-04-01",
                "reason": "錯誤",
            })
        assert exc_info.value.code == -32602


# ---------------------------------------------------------------------------
# _tool_hr_approve_leave
# ---------------------------------------------------------------------------

class TestToolHrApproveLeave:
    def test_approve_action_sets_status_approved(self):
        server, sheets = make_server(employee=ALICE)

        result = server._tool_hr_approve_leave({
            "employee_id": "E001",
            "request_index": 2,
            "action": "approve",
        })

        sheets.update_cell.assert_called_once_with("leaves", 2, "status", "approved")
        assert result["success"] is True
        assert result["new_status"] == "approved"

    def test_reject_action_sets_status_rejected(self):
        server, sheets = make_server(employee=ALICE)

        result = server._tool_hr_approve_leave({
            "employee_id": "E001",
            "request_index": 1,
            "action": "reject",
        })

        sheets.update_cell.assert_called_once_with("leaves", 1, "status", "rejected")
        assert result["new_status"] == "rejected"

    def test_employee_not_found_raises_mcp_error(self):
        server, sheets = make_server(employee=None)
        with pytest.raises(MCPError) as exc_info:
            server._tool_hr_approve_leave({
                "employee_id": "GHOST",
                "request_index": 1,
                "action": "approve",
            })
        assert "GHOST" in exc_info.value.message

    def test_invalid_action_raises_mcp_error(self):
        server, sheets = make_server(employee=ALICE)
        with pytest.raises(MCPError) as exc_info:
            server._tool_hr_approve_leave({
                "employee_id": "E001",
                "request_index": 1,
                "action": "delete",
            })
        assert exc_info.value.code == -32602

    def test_missing_employee_id_raises_mcp_error(self):
        server, sheets = make_server()
        with pytest.raises(MCPError):
            server._tool_hr_approve_leave({
                "employee_id": "",
                "request_index": 1,
                "action": "approve",
            })

    def test_missing_request_index_raises_mcp_error(self):
        server, sheets = make_server(employee=ALICE)
        with pytest.raises(MCPError):
            server._tool_hr_approve_leave({
                "employee_id": "E001",
                "action": "approve",
            })


# ---------------------------------------------------------------------------
# _tool_hr_submit_onboarding
# ---------------------------------------------------------------------------

class TestToolHrSubmitOnboarding:
    def test_success_appends_row_with_pending_status(self):
        server, sheets = make_server(employee=ALICE)

        result = server._tool_hr_submit_onboarding({"employee_id": "E001"})

        sheets.append_row.assert_called_once()
        call_args = sheets.append_row.call_args[0]
        assert call_args[0] == "onboarding"
        row = call_args[1]
        assert row["status"] == "pending"
        assert row["employee_id"] == "E001"
        assert result["success"] is True

    def test_employee_not_found_raises_mcp_error(self):
        server, sheets = make_server(employee=None)
        with pytest.raises(MCPError) as exc_info:
            server._tool_hr_submit_onboarding({"employee_id": "GHOST"})
        assert "GHOST" in exc_info.value.message


# ---------------------------------------------------------------------------
# _tool_hr_submit_work_permit
# ---------------------------------------------------------------------------

class TestToolHrSubmitWorkPermit:
    def test_success_appends_row_with_pending_status(self):
        server, sheets = make_server(employee=ALICE)

        result = server._tool_hr_submit_work_permit({"employee_id": "E001"})

        sheets.append_row.assert_called_once()
        call_args = sheets.append_row.call_args[0]
        assert call_args[0] == "work_permits"
        row = call_args[1]
        assert row["status"] == "pending"
        assert result["success"] is True

    def test_employee_not_found_raises_mcp_error(self):
        server, sheets = make_server(employee=None)
        with pytest.raises(MCPError) as exc_info:
            server._tool_hr_submit_work_permit({"employee_id": "NOBODY"})
        assert "NOBODY" in exc_info.value.message


# ---------------------------------------------------------------------------
# _tool_hr_submit_offboarding
# ---------------------------------------------------------------------------

class TestToolHrSubmitOffboarding:
    def test_success_appends_row_with_pending_status(self):
        server, sheets = make_server(employee=ALICE)

        result = server._tool_hr_submit_offboarding({"employee_id": "E001"})

        sheets.append_row.assert_called_once()
        call_args = sheets.append_row.call_args[0]
        assert call_args[0] == "offboarding"
        row = call_args[1]
        assert row["status"] == "pending"
        assert row["employee_id"] == "E001"
        assert result["success"] is True

    def test_employee_not_found_raises_mcp_error(self):
        server, sheets = make_server(employee=None)
        with pytest.raises(MCPError) as exc_info:
            server._tool_hr_submit_offboarding({"employee_id": "X"})
        assert exc_info.value.code == -32602


# ---------------------------------------------------------------------------
# _tool_hr_detect_anomalies
# ---------------------------------------------------------------------------

class TestToolHrDetectAnomalies:
    def test_returns_anomaly_list_from_smart(self):
        server, sheets = make_server(employee=ALICE)
        server.smart.detect_anomalies.return_value = [
            {"type": "high_frequency", "severity": "warning", "message": "近 30 天提交 4 次"}
        ]

        result = server._tool_hr_detect_anomalies({"employee_id": "E001"})

        server.smart.detect_anomalies.assert_called_once_with("E001")
        assert len(result) == 1
        assert result[0]["type"] == "high_frequency"

    def test_returns_empty_list_when_no_anomalies(self):
        server, sheets = make_server(employee=ALICE)
        server.smart.detect_anomalies.return_value = []

        result = server._tool_hr_detect_anomalies({"employee_id": "E001"})

        assert result == []

    def test_missing_employee_id_raises_mcp_error(self):
        server, sheets = make_server()
        with pytest.raises(MCPError) as exc_info:
            server._tool_hr_detect_anomalies({"employee_id": ""})
        assert exc_info.value.code == -32602


# ---------------------------------------------------------------------------
# _tool_hr_monthly_report
# ---------------------------------------------------------------------------

class TestToolHrMonthlyReport:
    def test_returns_summary_from_smart(self):
        server, sheets = make_server()
        expected = {
            "month": "2026-03",
            "leave": {"total": 5, "by_type": {"年假": 3, "事假": 2}, "by_status": {}, "avg_days": 2.0},
            "onboarding": {"total": 1},
            "work_permit": {"total": 0},
            "offboarding": {"total": 0},
            "anomalies": [],
        }
        server.smart.generate_monthly_summary.return_value = expected

        result = server._tool_hr_monthly_report({})

        server.smart.generate_monthly_summary.assert_called_once()
        assert result["month"] == "2026-03"
        assert result["leave"]["total"] == 5

    def test_passes_empty_args_to_smart(self):
        server, sheets = make_server()

        server._tool_hr_monthly_report({})

        server.smart.generate_monthly_summary.assert_called_once()
