"""Tests for SmartAssistant (smart.py)."""
from __future__ import annotations

from datetime import date, timedelta
from unittest.mock import MagicMock, patch

import pytest

from hr_admin_bots.smart import SmartAssistant


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def make_assistant(find_rows_map: dict | None = None, employee: dict | None = None):
    """Build SmartAssistant with a mocked sheets_client."""
    sheets = MagicMock()
    find_rows_map = find_rows_map or {}

    def _find_rows(sheet_name, filters=None):
        rows = find_rows_map.get(sheet_name, [])
        if not filters:
            return rows
        result = []
        for row in rows:
            if all(str(row.get(k, "")).strip() == str(v).strip() for k, v in filters.items()):
                result.append(row)
        return result

    sheets.find_rows.side_effect = _find_rows
    sheets.find_employee.return_value = employee
    return SmartAssistant(sheets_client=sheets), sheets


# ---------------------------------------------------------------------------
# suggest_leave_type
# ---------------------------------------------------------------------------

class TestSuggestLeaveType:
    def test_no_history_returns_none(self):
        assistant, _ = make_assistant()
        assert assistant.suggest_leave_type("E001") is None

    def test_single_type_returns_that_type(self):
        rows = [
            {"employee_id": "E001", "leave_type": "年假"},
            {"employee_id": "E001", "leave_type": "年假"},
        ]
        assistant, _ = make_assistant({"leaves": rows})
        assert assistant.suggest_leave_type("E001") == "年假"

    def test_multiple_types_returns_most_frequent(self):
        rows = [
            {"employee_id": "E001", "leave_type": "事假"},
            {"employee_id": "E001", "leave_type": "年假"},
            {"employee_id": "E001", "leave_type": "年假"},
            {"employee_id": "E001", "leave_type": "年假"},
            {"employee_id": "E001", "leave_type": "事假"},
        ]
        assistant, _ = make_assistant({"leaves": rows})
        assert assistant.suggest_leave_type("E001") == "年假"

    def test_rows_with_empty_leave_type_ignored(self):
        rows = [
            {"employee_id": "E001", "leave_type": ""},
            {"employee_id": "E001", "leave_type": ""},
        ]
        assistant, _ = make_assistant({"leaves": rows})
        assert assistant.suggest_leave_type("E001") is None


# ---------------------------------------------------------------------------
# suggest_reason
# ---------------------------------------------------------------------------

class TestSuggestReason:
    def test_no_history_returns_none(self):
        assistant, _ = make_assistant()
        assert assistant.suggest_reason("E001", "年假") is None

    def test_has_history_returns_most_common_reason(self):
        rows = [
            {"employee_id": "E001", "leave_type": "病假", "reason": "感冒"},
            {"employee_id": "E001", "leave_type": "病假", "reason": "感冒"},
            {"employee_id": "E001", "leave_type": "病假", "reason": "頭痛"},
        ]
        assistant, _ = make_assistant({"leaves": rows})
        assert assistant.suggest_reason("E001", "病假") == "感冒"

    def test_empty_reason_rows_ignored(self):
        rows = [
            {"employee_id": "E001", "leave_type": "事假", "reason": "   "},
        ]
        assistant, _ = make_assistant({"leaves": rows})
        assert assistant.suggest_reason("E001", "事假") is None


# ---------------------------------------------------------------------------
# detect_anomalies
# ---------------------------------------------------------------------------

TODAY = date(2026, 3, 27)
CURRENT_YEAR = "2026"


def _make_leave(apply_date: str, start_date: str, end_date: str) -> dict:
    return {
        "employee_id": "E001",
        "apply_date": apply_date,
        "start_date": start_date,
        "end_date": end_date,
    }


class TestDetectAnomalies:

    # --- high_frequency: >3 applications in last 30 days ---

    def test_high_frequency_triggers_warning(self):
        base = TODAY - timedelta(days=5)
        leaves = [
            _make_leave((base + timedelta(days=i)).isoformat(),
                        f"{CURRENT_YEAR}-03-01",
                        f"{CURRENT_YEAR}-03-01")
            for i in range(4)
        ]
        # Patch date.today() for cutoff calculation
        with patch("hr_admin_bots.smart.date") as mock_date:
            mock_date.today.return_value = TODAY
            mock_date.fromisoformat.side_effect = date.fromisoformat
            mock_date.side_effect = lambda *args, **kw: date(*args, **kw)

            assistant, _ = make_assistant({"leaves": leaves})
            anomalies = assistant.detect_anomalies("E001")

        types = [a["type"] for a in anomalies]
        assert "high_frequency" in types
        hf = next(a for a in anomalies if a["type"] == "high_frequency")
        assert hf["severity"] == "warning"

    def test_exactly_3_in_30_days_no_high_frequency(self):
        base = TODAY - timedelta(days=5)
        leaves = [
            _make_leave((base + timedelta(days=i)).isoformat(),
                        f"{CURRENT_YEAR}-03-0{i+1}",
                        f"{CURRENT_YEAR}-03-0{i+1}")
            for i in range(3)
        ]
        with patch("hr_admin_bots.smart.date") as mock_date:
            mock_date.today.return_value = TODAY
            mock_date.fromisoformat.side_effect = date.fromisoformat
            mock_date.side_effect = lambda *args, **kw: date(*args, **kw)

            assistant, _ = make_assistant({"leaves": leaves})
            anomalies = assistant.detect_anomalies("E001")

        types = [a["type"] for a in anomalies]
        assert "high_frequency" not in types

    # --- weekend_extension: >60% Mon/Fri ---

    def test_weekend_extension_triggers_info(self):
        # 3 leaves all starting on Monday (weekday 0 = Mon)
        # 2026-03-02 is a Monday
        leaves = [
            {"employee_id": "E001", "apply_date": f"{CURRENT_YEAR}-02-01",
             "start_date": "2026-03-02", "end_date": "2026-03-02"},
            {"employee_id": "E001", "apply_date": f"{CURRENT_YEAR}-02-01",
             "start_date": "2026-03-09", "end_date": "2026-03-09"},
            {"employee_id": "E001", "apply_date": f"{CURRENT_YEAR}-02-01",
             "start_date": "2026-03-16", "end_date": "2026-03-16"},
        ]
        with patch("hr_admin_bots.smart.date") as mock_date:
            mock_date.today.return_value = TODAY
            mock_date.fromisoformat.side_effect = date.fromisoformat
            mock_date.side_effect = lambda *args, **kw: date(*args, **kw)

            assistant, _ = make_assistant({"leaves": leaves})
            anomalies = assistant.detect_anomalies("E001")

        types = [a["type"] for a in anomalies]
        assert "weekend_extension" in types
        we = next(a for a in anomalies if a["type"] == "weekend_extension")
        assert we["severity"] == "info"

    def test_weekend_extension_below_threshold_no_anomaly(self):
        # 3 leaves: 1 on Monday, 2 on Wednesday — 33% < 60%
        leaves = [
            {"employee_id": "E001", "apply_date": f"{CURRENT_YEAR}-02-01",
             "start_date": "2026-03-02", "end_date": "2026-03-02"},   # Mon
            {"employee_id": "E001", "apply_date": f"{CURRENT_YEAR}-02-01",
             "start_date": "2026-03-04", "end_date": "2026-03-04"},   # Wed
            {"employee_id": "E001", "apply_date": f"{CURRENT_YEAR}-02-01",
             "start_date": "2026-03-11", "end_date": "2026-03-11"},   # Wed
        ]
        with patch("hr_admin_bots.smart.date") as mock_date:
            mock_date.today.return_value = TODAY
            mock_date.fromisoformat.side_effect = date.fromisoformat
            mock_date.side_effect = lambda *args, **kw: date(*args, **kw)

            assistant, _ = make_assistant({"leaves": leaves})
            anomalies = assistant.detect_anomalies("E001")

        types = [a["type"] for a in anomalies]
        assert "weekend_extension" not in types

    def test_fewer_than_3_leaves_no_weekend_extension_check(self):
        # Only 2 leaves even if both on Monday — not enough data
        leaves = [
            {"employee_id": "E001", "apply_date": f"{CURRENT_YEAR}-02-01",
             "start_date": "2026-03-02", "end_date": "2026-03-02"},
            {"employee_id": "E001", "apply_date": f"{CURRENT_YEAR}-02-01",
             "start_date": "2026-03-09", "end_date": "2026-03-09"},
        ]
        with patch("hr_admin_bots.smart.date") as mock_date:
            mock_date.today.return_value = TODAY
            mock_date.fromisoformat.side_effect = date.fromisoformat
            mock_date.side_effect = lambda *args, **kw: date(*args, **kw)

            assistant, _ = make_assistant({"leaves": leaves})
            anomalies = assistant.detect_anomalies("E001")

        types = [a["type"] for a in anomalies]
        assert "weekend_extension" not in types

    # --- quick_resignation: hired <90 days + has offboarding ---

    def test_quick_resignation_triggers_critical(self):
        hire_date = (TODAY - timedelta(days=30)).isoformat()
        employee = {"employee_id": "E001", "hire_date": hire_date}
        offboard_rows = [{"employee_id": "E001", "status": "pending"}]

        def _find_rows(sheet_name, filters=None):
            if sheet_name == "leaves":
                return []
            if sheet_name == "offboarding":
                return offboard_rows
            return []

        sheets = MagicMock()
        sheets.find_rows.side_effect = _find_rows
        sheets.find_employee.return_value = employee

        with patch("hr_admin_bots.smart.date") as mock_date:
            mock_date.today.return_value = TODAY
            mock_date.fromisoformat.side_effect = date.fromisoformat
            mock_date.side_effect = lambda *args, **kw: date(*args, **kw)

            assistant = SmartAssistant(sheets_client=sheets)
            anomalies = assistant.detect_anomalies("E001")

        types = [a["type"] for a in anomalies]
        assert "quick_resignation" in types
        qr = next(a for a in anomalies if a["type"] == "quick_resignation")
        assert qr["severity"] == "critical"

    def test_quick_resignation_no_offboarding_no_anomaly(self):
        hire_date = (TODAY - timedelta(days=30)).isoformat()
        employee = {"employee_id": "E001", "hire_date": hire_date}

        def _find_rows(sheet_name, filters=None):
            return []

        sheets = MagicMock()
        sheets.find_rows.side_effect = _find_rows
        sheets.find_employee.return_value = employee

        with patch("hr_admin_bots.smart.date") as mock_date:
            mock_date.today.return_value = TODAY
            mock_date.fromisoformat.side_effect = date.fromisoformat
            mock_date.side_effect = lambda *args, **kw: date(*args, **kw)

            assistant = SmartAssistant(sheets_client=sheets)
            anomalies = assistant.detect_anomalies("E001")

        types = [a["type"] for a in anomalies]
        assert "quick_resignation" not in types

    def test_hired_over_90_days_no_quick_resignation(self):
        hire_date = (TODAY - timedelta(days=100)).isoformat()
        employee = {"employee_id": "E001", "hire_date": hire_date}
        offboard_rows = [{"employee_id": "E001", "status": "pending"}]

        def _find_rows(sheet_name, filters=None):
            if sheet_name == "offboarding":
                return offboard_rows
            return []

        sheets = MagicMock()
        sheets.find_rows.side_effect = _find_rows
        sheets.find_employee.return_value = employee

        with patch("hr_admin_bots.smart.date") as mock_date:
            mock_date.today.return_value = TODAY
            mock_date.fromisoformat.side_effect = date.fromisoformat
            mock_date.side_effect = lambda *args, **kw: date(*args, **kw)

            assistant = SmartAssistant(sheets_client=sheets)
            anomalies = assistant.detect_anomalies("E001")

        types = [a["type"] for a in anomalies]
        assert "quick_resignation" not in types

    # --- no anomalies ---

    def test_no_anomalies_returns_empty_list(self):
        employee = {"employee_id": "E001", "hire_date": (TODAY - timedelta(days=200)).isoformat()}

        sheets = MagicMock()
        sheets.find_rows.return_value = []
        sheets.find_employee.return_value = employee

        with patch("hr_admin_bots.smart.date") as mock_date:
            mock_date.today.return_value = TODAY
            mock_date.fromisoformat.side_effect = date.fromisoformat
            mock_date.side_effect = lambda *args, **kw: date(*args, **kw)

            assistant = SmartAssistant(sheets_client=sheets)
            anomalies = assistant.detect_anomalies("E001")

        assert anomalies == []


# ---------------------------------------------------------------------------
# generate_monthly_summary
# ---------------------------------------------------------------------------

class TestGenerateMonthlySummary:

    def _make_sheets(self, leaves=None, onboarding=None, work_permit=None, offboarding=None, employee=None):
        sheets = MagicMock()

        def _find_rows(sheet_name, filters=None):
            mapping = {
                "leaves": leaves or [],
                "onboarding": onboarding or [],
                "work_permit": work_permit or [],
                "offboarding": offboarding or [],
            }
            rows = mapping.get(sheet_name, [])
            if not filters:
                return rows
            result = []
            for row in rows:
                if all(str(row.get(k, "")).strip() == str(v).strip() for k, v in filters.items()):
                    result.append(row)
            return result

        sheets.find_rows.side_effect = _find_rows
        sheets.find_employee.return_value = employee
        return sheets

    def test_empty_month_returns_zeroes(self):
        sheets = self._make_sheets()

        with patch("hr_admin_bots.smart.date") as mock_date:
            mock_date.today.return_value = TODAY
            mock_date.fromisoformat.side_effect = date.fromisoformat
            mock_date.side_effect = lambda *args, **kw: date(*args, **kw)

            assistant = SmartAssistant(sheets_client=sheets)
            summary = assistant.generate_monthly_summary()

        assert summary["leave"]["total"] == 0
        assert summary["leave"]["avg_days"] == 0
        assert summary["leave"]["by_type"] == {}
        assert summary["leave"]["by_status"] == {}
        assert summary["onboarding"]["total"] == 0
        assert summary["work_permit"]["total"] == 0
        assert summary["offboarding"]["total"] == 0
        assert summary["anomalies"] == []

    def test_has_data_returns_correct_counts(self):
        month_prefix = TODAY.strftime("%Y-%m")
        leaves = [
            {"employee_id": "E001", "apply_date": f"{month_prefix}-01",
             "leave_type": "年假", "status": "pending", "days": 3},
            {"employee_id": "E001", "apply_date": f"{month_prefix}-05",
             "leave_type": "年假", "status": "approved", "days": 2},
            {"employee_id": "E001", "apply_date": f"{month_prefix}-10",
             "leave_type": "事假", "status": "pending", "days": 1},
        ]
        employee = {"employee_id": "E001", "hire_date": (TODAY - timedelta(days=200)).isoformat()}
        sheets = self._make_sheets(leaves=leaves, employee=employee)

        with patch("hr_admin_bots.smart.date") as mock_date:
            mock_date.today.return_value = TODAY
            mock_date.fromisoformat.side_effect = date.fromisoformat
            mock_date.side_effect = lambda *args, **kw: date(*args, **kw)

            assistant = SmartAssistant(sheets_client=sheets)
            summary = assistant.generate_monthly_summary()

        assert summary["leave"]["total"] == 3
        assert summary["leave"]["by_type"]["年假"] == 2
        assert summary["leave"]["by_type"]["事假"] == 1
        assert summary["leave"]["by_status"]["pending"] == 2
        assert summary["leave"]["by_status"]["approved"] == 1
        # avg = (3+2+1)/3 = 2.0
        assert summary["leave"]["avg_days"] == 2.0

    def test_includes_anomalies_from_active_employees(self):
        """When an employee's leave this month triggers an anomaly, it appears in summary."""
        month_prefix = TODAY.strftime("%Y-%m")
        hire_date = (TODAY - timedelta(days=30)).isoformat()

        # 4 leaves in last 30 days → high_frequency anomaly
        leaves = [
            {"employee_id": "E001", "apply_date": (TODAY - timedelta(days=i)).isoformat(),
             "start_date": f"{CURRENT_YEAR}-03-01", "end_date": f"{CURRENT_YEAR}-03-01",
             "leave_type": "年假", "status": "pending", "days": 1}
            for i in range(4)
        ]
        # Only the ones in this month should count as "month_leaves"
        for leaf in leaves:
            if not leaf["apply_date"].startswith(month_prefix):
                leaf["apply_date"] = f"{month_prefix}-01"

        employee = {"employee_id": "E001", "hire_date": hire_date}
        offboard_rows = [{"employee_id": "E001", "status": "pending"}]

        sheets = MagicMock()

        def _find_rows(sheet_name, filters=None):
            if sheet_name == "leaves":
                rows = leaves
            elif sheet_name == "offboarding":
                rows = offboard_rows
            else:
                rows = []
            if not filters:
                return rows
            result = []
            for row in rows:
                if all(str(row.get(k, "")).strip() == str(v).strip() for k, v in filters.items()):
                    result.append(row)
            return result

        sheets.find_rows.side_effect = _find_rows
        sheets.find_employee.return_value = employee

        with patch("hr_admin_bots.smart.date") as mock_date:
            mock_date.today.return_value = TODAY
            mock_date.fromisoformat.side_effect = date.fromisoformat
            mock_date.side_effect = lambda *args, **kw: date(*args, **kw)

            assistant = SmartAssistant(sheets_client=sheets)
            summary = assistant.generate_monthly_summary()

        # Should have at least one anomaly tagged with employee_id
        assert len(summary["anomalies"]) > 0
        assert all("employee_id" in a for a in summary["anomalies"])

    def test_other_sheets_counted_by_month_prefix(self):
        month_prefix = TODAY.strftime("%Y-%m")
        onboarding = [
            {"employee_id": "E002", "onboarding_date": f"{month_prefix}-03"},
            {"employee_id": "E003", "onboarding_date": "2025-01-01"},  # old
        ]
        sheets = self._make_sheets(onboarding=onboarding)

        with patch("hr_admin_bots.smart.date") as mock_date:
            mock_date.today.return_value = TODAY
            mock_date.fromisoformat.side_effect = date.fromisoformat
            mock_date.side_effect = lambda *args, **kw: date(*args, **kw)

            assistant = SmartAssistant(sheets_client=sheets)
            summary = assistant.generate_monthly_summary()

        assert summary["onboarding"]["total"] == 1
