"""Tests for AuditLogger — append_row call, timestamp format, error resilience."""
from __future__ import annotations

import re
from unittest.mock import MagicMock, call

import pytest

from hr_admin_bots.shared.audit import AuditLogger


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def make_logger():
    sheets = MagicMock()
    return AuditLogger(sheets_client=sheets), sheets


# ---------------------------------------------------------------------------
# log() — correct worksheet and data
# ---------------------------------------------------------------------------

class TestAuditLoggerLog:
    def test_calls_append_row_with_audit_log_worksheet(self):
        logger, sheets = make_logger()
        logger.log(action="leave_apply", actor="E001", target_employee="E002")

        sheets.append_row.assert_called_once()
        ws_arg = sheets.append_row.call_args[0][0]
        assert ws_arg == "audit_log"

    def test_row_contains_action(self):
        logger, sheets = make_logger()
        logger.log(action="leave_apply", actor="E001", target_employee="E002")

        row = sheets.append_row.call_args[0][1]
        assert row["action"] == "leave_apply"

    def test_row_contains_actor(self):
        logger, sheets = make_logger()
        logger.log(action="leave_approve", actor="boss@company.com", target_employee="E001")

        row = sheets.append_row.call_args[0][1]
        assert row["actor"] == "boss@company.com"

    def test_row_contains_target_employee(self):
        logger, sheets = make_logger()
        logger.log(action="leave_reject", actor="MGR", target_employee="E999")

        row = sheets.append_row.call_args[0][1]
        assert row["target_employee"] == "E999"

    def test_row_contains_details_when_provided(self):
        logger, sheets = make_logger()
        logger.log(action="leave_approve", actor="MGR", target_employee="E001", details="status→approved")

        row = sheets.append_row.call_args[0][1]
        assert row["details"] == "status→approved"

    def test_row_has_all_five_keys(self):
        logger, sheets = make_logger()
        logger.log(action="a", actor="b", target_employee="c", details="d")

        row = sheets.append_row.call_args[0][1]
        assert set(row.keys()) == {"timestamp", "action", "actor", "target_employee", "details"}


# ---------------------------------------------------------------------------
# log() — with empty details
# ---------------------------------------------------------------------------

class TestAuditLoggerEmptyDetails:
    def test_empty_details_defaults_to_empty_string(self):
        logger, sheets = make_logger()
        logger.log(action="login", actor="E001", target_employee="E001")

        row = sheets.append_row.call_args[0][1]
        assert row["details"] == ""

    def test_still_calls_append_row_with_empty_details(self):
        logger, sheets = make_logger()
        logger.log(action="login", actor="E001", target_employee="E001")

        sheets.append_row.assert_called_once()


# ---------------------------------------------------------------------------
# timestamp format
# ---------------------------------------------------------------------------

class TestAuditLoggerTimestamp:
    ISO_RE = re.compile(
        r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}"
    )

    def test_timestamp_is_iso_format(self):
        logger, sheets = make_logger()
        logger.log(action="x", actor="y", target_employee="z")

        row = sheets.append_row.call_args[0][1]
        ts = row["timestamp"]
        assert self.ISO_RE.match(ts), f"timestamp not ISO format: {ts!r}"

    def test_timestamp_is_string(self):
        logger, sheets = make_logger()
        logger.log(action="x", actor="y", target_employee="z")

        row = sheets.append_row.call_args[0][1]
        assert isinstance(row["timestamp"], str)


# ---------------------------------------------------------------------------
# error resilience — append_row failure must not propagate
# ---------------------------------------------------------------------------

class TestAuditLoggerErrorResilience:
    def test_does_not_raise_when_append_row_fails(self):
        logger, sheets = make_logger()
        sheets.append_row.side_effect = Exception("Sheets API down")

        # must not raise
        logger.log(action="a", actor="b", target_employee="c")

    def test_still_returns_none_when_append_row_fails(self):
        logger, sheets = make_logger()
        sheets.append_row.side_effect = RuntimeError("network error")

        result = logger.log(action="a", actor="b", target_employee="c")
        assert result is None
