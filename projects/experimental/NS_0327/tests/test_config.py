"""Test config loading."""
import json
import tempfile
from pathlib import Path

from hr_admin_bots.config import Config, BotConfig, SmtpConfig


def test_from_json():
    data = {
        "bots": {
            "onboarding": {"token": "tok1", "enabled": True},
            "leave": {"token": "tok2", "enabled": False},
        },
        "google_sheet_id": "sheet123",
        "google_credentials_file": "creds.json",
        "smtp": {"host": "smtp.test.com", "port": 465, "user": "u", "password": "p"},
        "hr_email": "hr@test.com",
    }
    with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False) as f:
        json.dump(data, f)
        f.flush()
        cfg = Config.from_json(f.name)

    assert len(cfg.bots) == 2
    assert cfg.bots["onboarding"].token == "tok1"
    assert cfg.bots["onboarding"].enabled is True
    assert cfg.bots["leave"].enabled is False
    assert cfg.google_sheet_id == "sheet123"
    assert cfg.smtp.host == "smtp.test.com"
    assert cfg.smtp.port == 465
    assert cfg.hr_email == "hr@test.com"


def test_get_bot():
    cfg = Config(
        bots={"a": BotConfig(token="t1"), "b": BotConfig(token="t2", enabled=False)},
        google_sheet_id="s",
        google_credentials_file="c",
        smtp=SmtpConfig(host="h", port=1, user="u", password="p"),
        hr_email="hr@x.com",
    )
    assert cfg.get_bot("a").token == "t1"
    assert cfg.get_bot("b").enabled is False
    assert cfg.get_bot("nonexist") is None


def test_leave_quota_constants():
    from hr_admin_bots.bots.leave import LEAVE_QUOTA
    assert LEAVE_QUOTA["病假"] == -1
    assert LEAVE_QUOTA["事假"] == 10
    assert LEAVE_QUOTA["喪假"] == 3
    assert LEAVE_QUOTA["婚假"] == 5
    assert LEAVE_QUOTA["產假"] == 98
    assert LEAVE_QUOTA["陪產假"] == 15


def test_date_parser():
    from hr_admin_bots.bots.leave import _parse_date
    d = _parse_date("2026-04-01")
    assert d is not None
    assert d.year == 2026 and d.month == 4 and d.day == 1
    assert _parse_date("invalid") is None
    assert _parse_date("2026/04/01") is None
