from __future__ import annotations

from datetime import datetime
from typing import Any, Optional

import gspread
from google.oauth2.service_account import Credentials

# Scopes required for read/write access to Google Sheets
_SCOPES = [
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/drive.readonly",
]

# Column name that stores the employee ID in the employees worksheet
_EMPLOYEE_ID_COL = "employee_id"

# Column used to match employee in leave records
_LEAVE_EMPLOYEE_COL = "employee_id"
_LEAVE_TYPE_COL = "leave_type"
_LEAVE_STATUS_COL = "status"
_LEAVE_YEAR_COL = "year"
_LEAVE_DAYS_COL = "days"
_LEAVE_QUOTA_COL = "leave_quota"

# Approved status value
_STATUS_APPROVED = "approved"


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

    def get_leave_balance(self, employee_id: str, leave_type: str) -> float:
        """Calculate remaining leave = annual quota minus approved days in current year."""
        employee = self.find_employee(employee_id)
        if employee is None:
            return 0.0

        quota = float(employee.get(_LEAVE_QUOTA_COL + "_" + leave_type, 0))

        current_year = str(datetime.now().year)
        ws = self.get_worksheet("leaves")
        records = ws.get_all_records()

        used = 0.0
        for row in records:
            if (
                str(row.get(_LEAVE_EMPLOYEE_COL, "")).strip() == str(employee_id).strip()
                and str(row.get(_LEAVE_TYPE_COL, "")).strip() == leave_type.strip()
                and str(row.get(_LEAVE_STATUS_COL, "")).strip() == _STATUS_APPROVED
                and str(row.get(_LEAVE_YEAR_COL, "")).strip() == current_year
            ):
                used += float(row.get(_LEAVE_DAYS_COL, 0))

        return max(quota - used, 0.0)

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
            # check every extra filter
            if all(
                str(row.get(k, "")).strip() == str(v).strip()
                for k, v in filters.items()
            ):
                return True
        return False
