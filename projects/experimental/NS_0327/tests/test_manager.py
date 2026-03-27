"""Tests for BotManager — bot creation, enabled/disabled filtering."""
from __future__ import annotations

import json
import tempfile
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

from hr_admin_bots.config import BotConfig, Config, SmtpConfig


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

BASE_CONFIG = {
    "google_sheet_id": "sheet123",
    "google_credentials_file": "creds.json",
    "smtp": {"host": "smtp.test.com", "port": 587, "user": "u", "password": "p"},
    "hr_email": "hr@test.com",
}

ALL_BOT_NAMES = ["onboarding", "work_permit", "leave", "offboarding"]


def write_config(bots: dict, tmp_path: Path | None = None) -> str:
    data = {**BASE_CONFIG, "bots": bots}
    if tmp_path:
        f = tmp_path / "config.json"
        f.write_text(json.dumps(data))
        return str(f)
    # fallback: NamedTemporaryFile
    import tempfile
    tf = tempfile.NamedTemporaryFile("w", suffix=".json", delete=False)
    json.dump(data, tf)
    tf.flush()
    return tf.name


def make_bot_entry(enabled: bool = True) -> dict:
    return {"token": "FAKE_TOKEN", "enabled": enabled}


def build_manager(config_path: str):
    """Instantiate BotManager with all external connections patched."""
    with patch("hr_admin_bots.manager.SheetsClient") as mock_sheets_cls, \
         patch("hr_admin_bots.manager.EmployeeAuth") as mock_auth_cls, \
         patch("hr_admin_bots.manager.EmailNotifier") as mock_notifier_cls:

        mock_sheets_cls.return_value = MagicMock()
        mock_auth_cls.return_value = MagicMock()
        mock_notifier_cls.return_value = MagicMock()

        from hr_admin_bots.manager import BotManager
        manager = BotManager(config_path=config_path)

    return manager


# ---------------------------------------------------------------------------
# Creates correct number of bots
# ---------------------------------------------------------------------------

class TestBotManagerCreation:
    def test_creates_all_four_bots_when_all_enabled(self, tmp_path):
        bots = {name: make_bot_entry(enabled=True) for name in ALL_BOT_NAMES}
        config_path = write_config(bots, tmp_path)
        manager = build_manager(config_path)

        assert len(manager.bots) == 4

    def test_creates_single_bot_when_only_one_configured(self, tmp_path):
        bots = {"onboarding": make_bot_entry(enabled=True)}
        config_path = write_config(bots, tmp_path)
        manager = build_manager(config_path)

        assert len(manager.bots) == 1

    def test_bot_names_match_registry_keys(self, tmp_path):
        bots = {name: make_bot_entry(enabled=True) for name in ALL_BOT_NAMES}
        config_path = write_config(bots, tmp_path)
        manager = build_manager(config_path)

        names = {b.name for b in manager.bots}
        assert names == set(ALL_BOT_NAMES)

    def test_correct_bot_classes_instantiated(self, tmp_path):
        from hr_admin_bots.bots.onboarding import OnboardingBot
        from hr_admin_bots.bots.work_permit import WorkPermitBot
        from hr_admin_bots.bots.leave import LeaveBot
        from hr_admin_bots.bots.offboarding import OffboardingBot

        bots = {name: make_bot_entry(enabled=True) for name in ALL_BOT_NAMES}
        config_path = write_config(bots, tmp_path)
        manager = build_manager(config_path)

        bot_types = {type(b) for b in manager.bots}
        assert OnboardingBot in bot_types
        assert WorkPermitBot in bot_types
        assert LeaveBot in bot_types
        assert OffboardingBot in bot_types

    def test_empty_config_creates_zero_bots(self, tmp_path):
        config_path = write_config(bots={}, tmp_path=tmp_path)
        manager = build_manager(config_path)

        assert len(manager.bots) == 0


# ---------------------------------------------------------------------------
# Skips disabled bots
# ---------------------------------------------------------------------------

class TestBotManagerDisabled:
    def test_skips_disabled_bot(self, tmp_path):
        bots = {
            "onboarding": make_bot_entry(enabled=True),
            "leave": make_bot_entry(enabled=False),
        }
        config_path = write_config(bots, tmp_path)
        manager = build_manager(config_path)

        assert len(manager.bots) == 1
        assert manager.bots[0].name == "onboarding"

    def test_skips_all_disabled_bots(self, tmp_path):
        bots = {name: make_bot_entry(enabled=False) for name in ALL_BOT_NAMES}
        config_path = write_config(bots, tmp_path)
        manager = build_manager(config_path)

        assert len(manager.bots) == 0

    def test_skips_bot_not_in_config(self, tmp_path):
        # work_permit and offboarding missing entirely
        bots = {
            "onboarding": make_bot_entry(enabled=True),
            "leave": make_bot_entry(enabled=True),
        }
        config_path = write_config(bots, tmp_path)
        manager = build_manager(config_path)

        assert len(manager.bots) == 2
        names = {b.name for b in manager.bots}
        assert "work_permit" not in names
        assert "offboarding" not in names

    def test_enabled_false_takes_precedence_over_presence(self, tmp_path):
        bots = {name: make_bot_entry(enabled=False) for name in ALL_BOT_NAMES}
        bots["onboarding"]["enabled"] = True
        config_path = write_config(bots, tmp_path)
        manager = build_manager(config_path)

        assert len(manager.bots) == 1
        assert manager.bots[0].name == "onboarding"


# ---------------------------------------------------------------------------
# Shared dependencies injected correctly
# ---------------------------------------------------------------------------

class TestBotManagerSharedDependencies:
    def test_all_bots_share_same_sheets_client(self, tmp_path):
        bots = {name: make_bot_entry(enabled=True) for name in ALL_BOT_NAMES}
        config_path = write_config(bots, tmp_path)
        manager = build_manager(config_path)

        sheets_clients = {id(b.sheets_client) for b in manager.bots}
        assert len(sheets_clients) == 1, "all bots should share the same SheetsClient instance"

    def test_all_bots_share_same_auth(self, tmp_path):
        bots = {name: make_bot_entry(enabled=True) for name in ALL_BOT_NAMES}
        config_path = write_config(bots, tmp_path)
        manager = build_manager(config_path)

        auths = {id(b.auth) for b in manager.bots}
        assert len(auths) == 1

    def test_all_bots_share_same_notifier(self, tmp_path):
        bots = {name: make_bot_entry(enabled=True) for name in ALL_BOT_NAMES}
        config_path = write_config(bots, tmp_path)
        manager = build_manager(config_path)

        notifiers = {id(b.notifier) for b in manager.bots}
        assert len(notifiers) == 1
