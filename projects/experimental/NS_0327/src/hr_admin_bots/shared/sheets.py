from __future__ import annotations

import logging
from typing import Any, Optional

import gspread
from google.oauth2.service_account import Credentials

logger = logging.getLogger(__name__)

# Scopes required for read/write access to Google Sheets
_SCOPES = [
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/drive.readonly",
]

# Column name that stores the employee ID in the employees worksheet
_EMPLOYEE_ID_COL = "employee_id"


class SheetsClient:
    """Thin wrapper around gspread for HR admin operations."""

    def __init__(self, credentials_file: str, sheet_id: str) -> None:
        creds = Credentials.from_service_account_file(credentials_file, scopes=_SCOPES)
        self._client = gspread.authorize(creds)
        self._spreadsheet = self._client.open_by_key(sheet_id)
        # worksheet cache: name -> Worksheet
        self._ws_cache: dict[str, gspread.Worksheet] = {}

    def get_worksheet(self, name: str) -> gspread.Worksheet:
        """Return worksheet by name, using in-memory cache."""
        if name not in self._ws_cache:
            self._ws_cache[name] = self._spreadsheet.worksheet(name)
        return self._ws_cache[name]

    def find_employee(self, employee_id: str) -> Optional[dict]:
        """Return first matching row from 'employees' worksheet as dict, or None."""
        ws = self.get_worksheet("employees")
        records = ws.get_all_records()
        for row in records:
            if str(row.get(_EMPLOYEE_ID_COL, "")).strip() == str(employee_id).strip():
                return row
        return None

    def append_row(self, worksheet_name: str, data: list | dict) -> None:
        """Append a row to the named worksheet. Accepts list or dict."""
        ws = self.get_worksheet(worksheet_name)
        if isinstance(data, dict):
            headers = ws.row_values(1)
            row = [data.get(h, "") for h in headers]
        else:
            row = data
        ws.append_row(row, value_input_option="USER_ENTERED")

    def find_row(
        self, worksheet_name: str, key_col: str, key_val: str
    ) -> Optional[dict]:
        """Return first row where key_col == key_val, or None."""
        ws = self.get_worksheet(worksheet_name)
        records = ws.get_all_records()
        for row in records:
            if str(row.get(key_col, "")).strip() == str(key_val).strip():
                return row
        return None

    def find_rows(
        self, worksheet_name: str, filters: dict[str, str] | None = None
    ) -> list[dict]:
        """Return all rows matching all filter conditions."""
        ws = self.get_worksheet(worksheet_name)
        records = ws.get_all_records()
        if not filters:
            return records
        result = []
        for row in records:
            if all(
                str(row.get(k, "")).strip() == str(v).strip()
                for k, v in filters.items()
            ):
                result.append(row)
        return result

    def check_duplicate(
        self,
        worksheet_name: str,
        employee_id: str,
        **filters: Any,
    ) -> bool:
        """Return True if a row matching employee_id and all extra filters exists."""
        ws = self.get_worksheet(worksheet_name)
        records = ws.get_all_records()
        for row in records:
            if str(row.get(_EMPLOYEE_ID_COL, "")).strip() != str(employee_id).strip():
                continue
            if all(
                str(row.get(k, "")).strip() == str(v).strip()
                for k, v in filters.items()
            ):
                return True
        return False

    def update_cell(
        self, worksheet_name: str, row_index: int, col_name: str, value: str
    ) -> None:
        """Update a single cell identified by 1-based row_index and column header name.

        row_index is the data row index (1 = first data row, excluding header).
        Internally converts to sheet row index by adding 1 for the header row.
        """
        ws = self.get_worksheet(worksheet_name)
        headers = ws.row_values(1)
        try:
            col_index = headers.index(col_name) + 1  # gspread is 1-based
        except ValueError:
            raise ValueError(
                f"Column '{col_name}' not found in worksheet '{worksheet_name}'"
            )
        # row_index 1 = second sheet row (first data row)
        sheet_row = row_index + 1
        ws.update_cell(sheet_row, col_index, value)

    def bind_telegram_id(self, employee_id: str, telegram_id: int) -> bool:
        """Set telegram_id on the employee row. Returns True on success."""
        ws = self.get_worksheet("employees")
        records = ws.get_all_records()
        headers = ws.row_values(1)

        if "telegram_id" not in headers:
            logger.error("'telegram_id' column not found in employees worksheet")
            return False

        col_index = headers.index("telegram_id") + 1

        for idx, row in enumerate(records):
            if str(row.get(_EMPLOYEE_ID_COL, "")).strip() == str(employee_id).strip():
                sheet_row = idx + 2  # +1 for header, +1 for 1-based index
                ws.update_cell(sheet_row, col_index, str(telegram_id))
                return True

        logger.warning("Employee '%s' not found when binding telegram_id", employee_id)
        return False

    def get_telegram_id(self, employee_id: str) -> Optional[int]:
        """Return telegram_id for the given employee_id, or None if not set."""
        employee = self.find_employee(employee_id)
        if not employee:
            return None
        raw = employee.get("telegram_id", "")
        if raw == "" or raw is None:
            return None
        try:
            return int(raw)
        except (ValueError, TypeError):
            return None

    def get_telegram_id_by_email(self, email: str) -> Optional[int]:
        """Return telegram_id for the employee with the given email, or None."""
        if not email:
            return None
        ws = self.get_worksheet("employees")
        records = ws.get_all_records()
        for row in records:
            if str(row.get("email", "")).strip().lower() == str(email).strip().lower():
                raw = row.get("telegram_id", "")
                if raw == "" or raw is None:
                    return None
                try:
                    return int(raw)
                except (ValueError, TypeError):
                    return None
        return None
