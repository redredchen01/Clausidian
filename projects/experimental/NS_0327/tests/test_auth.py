"""Tests for EmployeeAuth — lookup, TTL cache, is_valid, invalidate."""
from __future__ import annotations

import time
from unittest.mock import MagicMock, patch

import pytest

from hr_admin_bots.shared.auth import EmployeeAuth, _CACHE_TTL


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

EMPLOYEE_RECORD = {"employee_id": "E001", "name": "Alice", "department": "Engineering"}


def make_auth(find_return=EMPLOYEE_RECORD):
    sheets = MagicMock()
    sheets.find_employee.return_value = find_return
    auth = EmployeeAuth(sheets)
    return auth, sheets


# ---------------------------------------------------------------------------
# lookup — found / not found
# ---------------------------------------------------------------------------

class TestLookupFound:
    def test_returns_employee_dict(self):
        auth, sheets = make_auth(EMPLOYEE_RECORD)
        result = auth.lookup("E001")
        assert result == EMPLOYEE_RECORD

    def test_calls_find_employee_once_on_first_hit(self):
        auth, sheets = make_auth(EMPLOYEE_RECORD)
        auth.lookup("E001")
        sheets.find_employee.assert_called_once_with("E001")


class TestLookupNotFound:
    def test_returns_none_when_employee_missing(self):
        auth, sheets = make_auth(None)
        result = auth.lookup("GHOST")
        assert result is None

    def test_none_result_is_also_cached(self):
        auth, sheets = make_auth(None)
        auth.lookup("GHOST")
        auth.lookup("GHOST")
        # second call must NOT hit the sheet again
        sheets.find_employee.assert_called_once_with("GHOST")


# ---------------------------------------------------------------------------
# TTL cache behaviour
# ---------------------------------------------------------------------------

class TestTTLCache:
    def test_second_lookup_within_ttl_uses_cache(self):
        auth, sheets = make_auth(EMPLOYEE_RECORD)
        auth.lookup("E001")
        auth.lookup("E001")
        # sheets should only be called once
        sheets.find_employee.assert_called_once()

    def test_lookup_after_ttl_expiry_re_fetches(self):
        auth, sheets = make_auth(EMPLOYEE_RECORD)
        auth.lookup("E001")

        # artificially expire the cache entry
        ts, record = auth._cache["E001"]
        auth._cache["E001"] = (ts - _CACHE_TTL - 1, record)

        auth.lookup("E001")
        assert sheets.find_employee.call_count == 2

    def test_fresh_entry_within_ttl_not_re_fetched(self):
        auth, sheets = make_auth(EMPLOYEE_RECORD)
        # manually plant a fresh cache entry
        auth._cache["E001"] = (time.monotonic(), EMPLOYEE_RECORD)
        result = auth.lookup("E001")
        assert result == EMPLOYEE_RECORD
        sheets.find_employee.assert_not_called()


# ---------------------------------------------------------------------------
# is_valid
# ---------------------------------------------------------------------------

class TestIsValid:
    def test_true_when_employee_found(self):
        auth, _ = make_auth(EMPLOYEE_RECORD)
        assert auth.is_valid("E001") is True

    def test_false_when_employee_not_found(self):
        auth, _ = make_auth(None)
        assert auth.is_valid("GHOST") is False


# ---------------------------------------------------------------------------
# invalidate
# ---------------------------------------------------------------------------

class TestInvalidate:
    def test_invalidate_forces_re_fetch(self):
        auth, sheets = make_auth(EMPLOYEE_RECORD)
        auth.lookup("E001")          # populate cache
        auth.invalidate("E001")      # evict
        auth.lookup("E001")          # should re-fetch
        assert sheets.find_employee.call_count == 2

    def test_invalidate_unknown_id_is_safe(self):
        auth, _ = make_auth()
        # must not raise
        auth.invalidate("NONEXISTENT")

    def test_invalidate_removes_only_target(self):
        auth, sheets = make_auth(EMPLOYEE_RECORD)
        auth.lookup("E001")
        auth.lookup("E002")
        auth.invalidate("E001")
        assert "E001" not in auth._cache
        assert "E002" in auth._cache
