"""Shared constants for HR Admin Bot Package."""

LEAVE_QUOTA: dict[str, int] = {
    "年假": -1,  # from employees sheet annual_leave_quota
    "病假": -1,  # unlimited
    "事假": 10,
    "喪假": 3,
    "婚假": 5,
    "產假": 98,
    "陪產假": 15,
}

LEAVE_TYPES = list(LEAVE_QUOTA.keys())
