"""Tests for CLI argument parsing — subcommands, defaults, required args."""
from __future__ import annotations

import argparse
import sys
from unittest.mock import MagicMock, patch

import pytest

# Import main and individual cmd functions
from hr_admin_bots.cli import main
from hr_admin_bots import __version__


# ---------------------------------------------------------------------------
# Helper — parse args without running commands
# ---------------------------------------------------------------------------

def parse(argv: list[str]) -> argparse.Namespace:
    """Call main() with argv, intercepting the func call to return namespace."""
    captured = {}

    def capture_func(args):
        captured["args"] = args

    with patch("hr_admin_bots.cli.cmd_serve", side_effect=capture_func), \
         patch("hr_admin_bots.cli.cmd_mcp", side_effect=capture_func), \
         patch("hr_admin_bots.cli.cmd_lookup", side_effect=capture_func), \
         patch("hr_admin_bots.cli.cmd_balance", side_effect=capture_func), \
         patch("hr_admin_bots.cli.cmd_status", side_effect=capture_func), \
         patch("hr_admin_bots.cli.cmd_version", side_effect=capture_func), \
         patch("sys.argv", ["hr-admin-bots"] + argv):
        main()

    return captured.get("args")


# ---------------------------------------------------------------------------
# version subcommand
# ---------------------------------------------------------------------------

class TestVersionSubcommand:
    def test_version_subcommand_calls_cmd_version(self):
        called = []
        with patch("hr_admin_bots.cli.cmd_version", side_effect=lambda args: called.append(True)), \
             patch("sys.argv", ["hr-admin-bots", "version"]):
            main()
        assert called == [True]

    def test_cmd_version_prints_version_string(self, capsys):
        from hr_admin_bots.cli import cmd_version
        cmd_version(MagicMock())
        out = capsys.readouterr().out
        assert __version__ in out

    def test_cmd_version_output_contains_hr_admin_bots(self, capsys):
        from hr_admin_bots.cli import cmd_version
        cmd_version(MagicMock())
        out = capsys.readouterr().out
        assert "hr-admin-bots" in out


# ---------------------------------------------------------------------------
# serve subcommand — correct defaults
# ---------------------------------------------------------------------------

class TestServeSubcommand:
    def test_serve_default_config_is_config_json(self):
        args = parse(["serve"])
        assert args.config == "config.json"

    def test_serve_default_health_port_is_8080(self):
        args = parse(["serve"])
        assert args.health_port == 8080

    def test_serve_default_no_scheduler_is_false(self):
        args = parse(["serve"])
        assert args.no_scheduler is False

    def test_serve_custom_config(self):
        args = parse(["serve", "--config", "custom.json"])
        assert args.config == "custom.json"

    def test_serve_no_scheduler_flag(self):
        args = parse(["serve", "--no-scheduler"])
        assert args.no_scheduler is True

    def test_serve_custom_health_port(self):
        args = parse(["serve", "--health-port", "9090"])
        assert args.health_port == 9090

    def test_serve_health_port_zero_disables(self):
        args = parse(["serve", "--health-port", "0"])
        assert args.health_port == 0


# ---------------------------------------------------------------------------
# lookup — requires employee_id
# ---------------------------------------------------------------------------

class TestLookupSubcommand:
    def test_lookup_requires_employee_id(self):
        with patch("sys.argv", ["hr-admin-bots", "lookup"]), \
             pytest.raises(SystemExit) as exc_info:
            main()
        # argparse exits with code 2 for missing required args
        assert exc_info.value.code == 2

    def test_lookup_passes_employee_id(self):
        args = parse(["lookup", "E001"])
        assert args.employee_id == "E001"

    def test_lookup_default_config(self):
        args = parse(["lookup", "E001"])
        assert args.config == "config.json"

    def test_lookup_custom_config(self):
        args = parse(["lookup", "E001", "--config", "prod.json"])
        assert args.config == "prod.json"


# ---------------------------------------------------------------------------
# balance — requires employee_id
# ---------------------------------------------------------------------------

class TestBalanceSubcommand:
    def test_balance_requires_employee_id(self):
        with patch("sys.argv", ["hr-admin-bots", "balance"]), \
             pytest.raises(SystemExit) as exc_info:
            main()
        assert exc_info.value.code == 2

    def test_balance_passes_employee_id(self):
        args = parse(["balance", "E002"])
        assert args.employee_id == "E002"

    def test_balance_default_config(self):
        args = parse(["balance", "E002"])
        assert args.config == "config.json"


# ---------------------------------------------------------------------------
# status — requires employee_id
# ---------------------------------------------------------------------------

class TestStatusSubcommand:
    def test_status_requires_employee_id(self):
        with patch("sys.argv", ["hr-admin-bots", "status"]), \
             pytest.raises(SystemExit) as exc_info:
            main()
        assert exc_info.value.code == 2

    def test_status_passes_employee_id(self):
        args = parse(["status", "E003"])
        assert args.employee_id == "E003"

    def test_status_default_config(self):
        args = parse(["status", "E003"])
        assert args.config == "config.json"


# ---------------------------------------------------------------------------
# Missing subcommand — exits with error
# ---------------------------------------------------------------------------

class TestMissingSubcommand:
    def test_no_subcommand_exits_with_error(self):
        with patch("sys.argv", ["hr-admin-bots"]), \
             pytest.raises(SystemExit) as exc_info:
            main()
        assert exc_info.value.code != 0
