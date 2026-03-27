"""Tests for SheetsClient with fully mocked gspread + google-auth."""
from __future__ import annotations

from datetime import datetime
from unittest.mock import MagicMock, patch, call

import pytest


# ---------------------------------------------------------------------------
# Helper: build a SheetsClient with all external I/O patched out
# ---------------------------------------------------------------------------

def make_client(ws_records: dict[str, list[dict]] | None = None):
    """
    Returns a SheetsClient whose underlying gspread objects are mocked.

    ws_records: mapping worksheet_name -> list of record dicts returned by
                get_all_records().  Defaults to empty for all sheets.
    """
    ws_records = ws_records or {}

    def _ws(name):
        ws = MagicMock(name=f"ws:{name}")
        records = ws_records.get(name, [])
        ws.get_all_records.return_value = records
        # row_values(1) returns header list derived from first record keys
        if records:
            ws.row_values.return_value = list(records[0].keys())
        else:
            ws.row_values.return_value = []
        return ws

    with patch("hr_admin_bots.shared.sheets.Credentials") as mock_creds, \
         patch("hr_admin_bots.shared.sheets.gspread") as mock_gspread:

        mock_spreadsheet = MagicMock()
        mock_spreadsheet.worksheet.side_effect = _ws
        mock_gspread.authorize.return_value.open_by_key.return_value = mock_spreadsheet
        mock_creds.from_service_account_file.return_value = MagicMock()

        from hr_admin_bots.shared.sheets import SheetsClient
        client = SheetsClient(credentials_file="fake.json", sheet_id="fake_id")
        # expose for assertions
        client._spreadsheet = mock_spreadsheet
        client._mock_ws_factory = _ws

    return client


# ---------------------------------------------------------------------------
# find_employee
# ---------------------------------------------------------------------------

class TestFindEmployee:
    def test_found_returns_matching_row(self):
        records = [
            {"employee_id": "E001", "name": "Alice"},
            {"employee_id": "E002", "name": "Bob"},
        ]
        client = make_client({"employees": records})
        result = client.find_employee("E001")
        assert result == {"employee_id": "E001", "name": "Alice"}

    def test_not_found_returns_none(self):
        client = make_client({"employees": [{"employee_id": "E001", "name": "Alice"}]})
        result = client.find_employee("GHOST")
        assert result is None

    def test_empty_sheet_returns_none(self):
        client = make_client({"employees": []})
        result = client.find_employee("E001")
        assert result is None

    def test_strips_whitespace_in_id(self):
        records = [{"employee_id": "  E001  ", "name": "Alice"}]
        client = make_client({"employees": records})
        result = client.find_employee("E001")
        assert result is not None

    def test_returns_first_match_when_duplicates_exist(self):
        records = [
            {"employee_id": "E001", "name": "Alice"},
            {"employee_id": "E001", "name": "Alice-duplicate"},
        ]
        client = make_client({"employees": records})
        result = client.find_employee("E001")
        assert result["name"] == "Alice"


# ---------------------------------------------------------------------------
# append_row
# ---------------------------------------------------------------------------

class TestAppendRow:
    def test_append_list_calls_append_row_directly(self):
        client = make_client()
        ws = MagicMock()
        client._ws_cache["target"] = ws

        client.append_row("target", ["a", "b", "c"])
        ws.append_row.assert_called_once_with(["a", "b", "c"], value_input_option="USER_ENTERED")

    def test_append_dict_maps_to_header_order(self):
        client = make_client()
        ws = MagicMock()
        ws.row_values.return_value = ["name", "dept", "id"]
        client._ws_cache["target"] = ws

        client.append_row("target", {"id": "E1", "name": "Alice", "dept": "Eng"})
        ws.append_row.assert_called_once_with(
            ["Alice", "Eng", "E1"], value_input_option="USER_ENTERED"
        )

    def test_dict_missing_key_inserts_empty_string(self):
        client = make_client()
        ws = MagicMock()
        ws.row_values.return_value = ["name", "dept", "phone"]
        client._ws_cache["target"] = ws

        client.append_row("target", {"name": "Bob"})
        ws.append_row.assert_called_once_with(
            ["Bob", "", ""], value_input_option="USER_ENTERED"
        )


# ---------------------------------------------------------------------------
# find_row
# ---------------------------------------------------------------------------

class TestFindRow:
    def test_returns_first_matching_row(self):
        records = [
            {"employee_id": "E001", "status": "active"},
            {"employee_id": "E002", "status": "active"},
        ]
        client = make_client({"onboarding": records})
        result = client.find_row("onboarding", "employee_id", "E001")
        assert result == {"employee_id": "E001", "status": "active"}

    def test_returns_none_when_no_match(self):
        client = make_client({"onboarding": [{"employee_id": "E001", "status": "active"}]})
        result = client.find_row("onboarding", "employee_id", "GHOST")
        assert result is None

    def test_matches_by_arbitrary_column(self):
        records = [{"code": "ABC", "value": "42"}, {"code": "XYZ", "value": "99"}]
        client = make_client({"config": records})
        result = client.find_row("config", "code", "XYZ")
        assert result["value"] == "99"


# ---------------------------------------------------------------------------
# find_rows
# ---------------------------------------------------------------------------

class TestFindRows:
    def test_returns_all_rows_with_no_filter(self):
        records = [{"employee_id": "E001"}, {"employee_id": "E002"}]
        client = make_client({"leaves": records})
        result = client.find_rows("leaves")
        assert len(result) == 2

    def test_filters_by_single_condition(self):
        records = [
            {"employee_id": "E001", "status": "approved"},
            {"employee_id": "E001", "status": "pending"},
            {"employee_id": "E002", "status": "approved"},
        ]
        client = make_client({"leaves": records})
        result = client.find_rows("leaves", filters={"status": "approved"})
        assert len(result) == 2
        assert all(r["status"] == "approved" for r in result)

    def test_filters_by_multiple_conditions(self):
        records = [
            {"employee_id": "E001", "leave_type": "事假", "status": "pending"},
            {"employee_id": "E001", "leave_type": "病假", "status": "pending"},
            {"employee_id": "E002", "leave_type": "事假", "status": "pending"},
        ]
        client = make_client({"leaves": records})
        result = client.find_rows(
            "leaves", filters={"employee_id": "E001", "leave_type": "事假"}
        )
        assert len(result) == 1
        assert result[0]["employee_id"] == "E001"
        assert result[0]["leave_type"] == "事假"

    def test_returns_empty_list_when_no_match(self):
        client = make_client({"leaves": [{"employee_id": "E001", "status": "approved"}]})
        result = client.find_rows("leaves", filters={"status": "nonexistent"})
        assert result == []


# ---------------------------------------------------------------------------
# find_rows (used by LeaveBot for balance calculation)
# ---------------------------------------------------------------------------

class TestFindRows:
    def test_returns_all_matching_rows(self):
        client = make_client({"leaves": [
            {"employee_id": "E001", "leave_type": "年假", "status": "approved"},
            {"employee_id": "E001", "leave_type": "事假", "status": "approved"},
            {"employee_id": "E001", "leave_type": "年假", "status": "pending"},
        ]})
        result = client.find_rows("leaves", filters={"employee_id": "E001", "leave_type": "年假"})
        assert len(result) == 2

    def test_returns_empty_when_no_match(self):
        client = make_client({"leaves": [
            {"employee_id": "E002", "leave_type": "年假"},
        ]})
        result = client.find_rows("leaves", filters={"employee_id": "E001"})
        assert result == []

    def test_returns_all_when_no_filters(self):
        client = make_client({"leaves": [{"a": 1}, {"a": 2}]})
        result = client.find_rows("leaves")
        assert len(result) == 2


# ---------------------------------------------------------------------------
# check_duplicate
# ---------------------------------------------------------------------------

class TestCheckDuplicate:
    def test_returns_true_when_match_found(self):
        records = [
            {"employee_id": "E001", "apply_month": "2026-04", "status": "pending"},
        ]
        client = make_client({"work_permits": records})
        result = client.check_duplicate("work_permits", "E001", apply_month="2026-04")
        assert result is True

    def test_returns_false_when_employee_id_mismatch(self):
        records = [
            {"employee_id": "E002", "apply_month": "2026-04"},
        ]
        client = make_client({"work_permits": records})
        result = client.check_duplicate("work_permits", "E001", apply_month="2026-04")
        assert result is False

    def test_returns_false_when_extra_filter_mismatch(self):
        records = [
            {"employee_id": "E001", "apply_month": "2026-03"},
        ]
        client = make_client({"work_permits": records})
        result = client.check_duplicate("work_permits", "E001", apply_month="2026-04")
        assert result is False

    def test_returns_false_on_empty_sheet(self):
        client = make_client({"work_permits": []})
        result = client.check_duplicate("work_permits", "E001")
        assert result is False

    def test_no_extra_filters_matches_any_row_with_correct_id(self):
        records = [{"employee_id": "E001", "something": "x"}]
        client = make_client({"work_permits": records})
        result = client.check_duplicate("work_permits", "E001")
        assert result is True
