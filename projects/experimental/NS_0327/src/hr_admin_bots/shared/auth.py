from __future__ import annotations

import time
from typing import Optional

# TTL for employee lookup cache in seconds
_CACHE_TTL = 300


class EmployeeAuth:
    """Authenticates employees by ID using the Google Sheet employees worksheet."""

    def __init__(self, sheets_client) -> None:
        self._sheets = sheets_client
        # cache: employee_id -> (timestamp, record_dict | None)
        self._cache: dict[str, tuple[float, Optional[dict]]] = {}

    def lookup(self, employee_id: str) -> Optional[dict]:
        """Return employee record dict or None if not found. Uses TTL cache."""
        now = time.monotonic()

        cached = self._cache.get(employee_id)
        if cached is not None:
            ts, record = cached
            if now - ts < _CACHE_TTL:
                return record

        record = self._sheets.find_employee(employee_id)
        self._cache[employee_id] = (now, record)
        return record

    def is_valid(self, employee_id: str) -> bool:
        """Return True if employee exists in the sheet."""
        return self.lookup(employee_id) is not None

    def invalidate(self, employee_id: str) -> None:
        """Remove a specific entry from cache (e.g. after data update)."""
        self._cache.pop(employee_id, None)
