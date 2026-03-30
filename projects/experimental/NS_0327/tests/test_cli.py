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


# ---------------------------------------------------------------------------
# cmd_lookup — employee found/not found
# ---------------------------------------------------------------------------

class TestCmdLookup:
    def test_cmd_lookup_employee_found(self, capsys):
        """Test cmd_lookup when employee exists."""
        from hr_admin_bots.cli import cmd_lookup
        args = MagicMock(config="config.json", employee_id="E001")

        with patch("hr_admin_bots.cli._make_sheets") as mock_make:
            sheets = MagicMock()
            sheets.find_employee.return_value = {"employee_id": "E001", "name": "Alice"}
            mock_make.return_value = sheets

            cmd_lookup(args)
            out = capsys.readouterr().out
            assert "E001" in out
            assert "Alice" in out

    def test_cmd_lookup_employee_not_found(self, capsys):
        """Test cmd_lookup when employee does not exist."""
        from hr_admin_bots.cli import cmd_lookup
        args = MagicMock(config="config.json", employee_id="INVALID")

        with patch("hr_admin_bots.cli._make_sheets") as mock_make:
            sheets = MagicMock()
            sheets.find_employee.return_value = None
            mock_make.return_value = sheets

            with pytest.raises(SystemExit) as exc_info:
                cmd_lookup(args)
            assert exc_info.value.code == 1


# ---------------------------------------------------------------------------
# cmd_balance — annual leave, sick leave, and other quota types
# ---------------------------------------------------------------------------

class TestCmdBalance:
    def test_cmd_balance_employee_found(self, capsys):
        """Test cmd_balance displays employee balance."""
        from hr_admin_bots.cli import cmd_balance
        args = MagicMock(config="config.json", employee_id="E001")

        with patch("hr_admin_bots.cli._make_sheets") as mock_make, \
             patch("hr_admin_bots.cli._get_used_days") as mock_used:
            sheets = MagicMock()
            sheets.find_employee.return_value = {
                "employee_id": "E001",
                "name": "Alice",
                "annual_leave_quota": 20
            }
            mock_make.return_value = sheets
            mock_used.return_value = 5

            cmd_balance(args)
            out = capsys.readouterr().out
            assert "Alice" in out
            assert "年假" in out
            assert "20" in out

    def test_cmd_balance_employee_not_found(self, capsys):
        """Test cmd_balance when employee not found."""
        from hr_admin_bots.cli import cmd_balance
        args = MagicMock(config="config.json", employee_id="INVALID")

        with patch("hr_admin_bots.cli._make_sheets") as mock_make:
            sheets = MagicMock()
            sheets.find_employee.return_value = None
            mock_make.return_value = sheets

            with pytest.raises(SystemExit) as exc_info:
                cmd_balance(args)
            assert exc_info.value.code == 1


# ---------------------------------------------------------------------------
# cmd_status — pending requests across sheets
# ---------------------------------------------------------------------------

class TestCmdStatus:
    def test_cmd_status_with_pending_leave(self, capsys):
        """Test cmd_status shows pending leave request."""
        from hr_admin_bots.cli import cmd_status
        args = MagicMock(config="config.json", employee_id="E001")

        with patch("hr_admin_bots.cli._make_sheets") as mock_make:
            sheets = MagicMock()
            sheets.find_employee.return_value = {"employee_id": "E001", "name": "Alice"}

            def find_rows_side_effect(sheet_name, filters=None):
                if sheet_name == "leaves":
                    return [
                        {
                            "leave_type": "年假",
                            "start_date": "2026-04-01",
                            "end_date": "2026-04-05",
                            "days": 5,
                            "apply_date": "2026-03-30",
                            "status": "pending"
                        }
                    ]
                return []

            sheets.find_rows.side_effect = find_rows_side_effect
            mock_make.return_value = sheets

            cmd_status(args)
            out = capsys.readouterr().out
            assert "請假" in out
            assert "待審 1 筆" in out

    def test_cmd_status_no_pending_requests(self, capsys):
        """Test cmd_status when no pending requests."""
        from hr_admin_bots.cli import cmd_status
        args = MagicMock(config="config.json", employee_id="E001")

        with patch("hr_admin_bots.cli._make_sheets") as mock_make:
            sheets = MagicMock()
            sheets.find_employee.return_value = {"employee_id": "E001", "name": "Alice"}
            sheets.find_rows.return_value = []
            mock_make.return_value = sheets

            cmd_status(args)
            out = capsys.readouterr().out
            assert "沒有待審申請" in out

    def test_cmd_status_sheet_error_gracefully_handled(self, capsys):
        """Test cmd_status handles sheet access errors gracefully."""
        from hr_admin_bots.cli import cmd_status
        args = MagicMock(config="config.json", employee_id="E001")

        with patch("hr_admin_bots.cli._make_sheets") as mock_make:
            sheets = MagicMock()
            sheets.find_employee.return_value = {"employee_id": "E001", "name": "Alice"}
            sheets.find_rows.side_effect = Exception("Sheet error")
            mock_make.return_value = sheets

            # Should not raise, should gracefully handle error
            cmd_status(args)
            out = capsys.readouterr().out
            assert "沒有待審申請" in out


# ---------------------------------------------------------------------------
# cmd_serve — BotManager instantiation
# ---------------------------------------------------------------------------

class TestCmdServe:
    def test_cmd_serve_default_config(self):
        """Test cmd_serve with default config."""
        from hr_admin_bots.cli import cmd_serve
        args = MagicMock(config="config.json", no_scheduler=False, health_port=8080)

        with patch("hr_admin_bots.manager.BotManager") as MockManager:
            manager_instance = MagicMock()
            MockManager.return_value = manager_instance

            cmd_serve(args)

            MockManager.assert_called_once()
            call_kwargs = MockManager.call_args[1]
            assert call_kwargs["config_path"] == "config.json"
            assert call_kwargs["enable_scheduler"] is True
            assert call_kwargs["health_port"] == 8080
            manager_instance.run.assert_called_once()

    def test_cmd_serve_disable_scheduler(self):
        """Test cmd_serve with scheduler disabled."""
        from hr_admin_bots.cli import cmd_serve
        args = MagicMock(config="config.json", no_scheduler=True, health_port=8080)

        with patch("hr_admin_bots.manager.BotManager") as MockManager:
            manager_instance = MagicMock()
            MockManager.return_value = manager_instance

            cmd_serve(args)

            call_kwargs = MockManager.call_args[1]
            assert call_kwargs["enable_scheduler"] is False

    def test_cmd_serve_health_port_zero_disables(self):
        """Test cmd_serve with health_port=0 disables health check."""
        from hr_admin_bots.cli import cmd_serve
        args = MagicMock(config="config.json", no_scheduler=False, health_port=0)

        with patch("hr_admin_bots.manager.BotManager") as MockManager:
            manager_instance = MagicMock()
            MockManager.return_value = manager_instance

            cmd_serve(args)

            call_kwargs = MockManager.call_args[1]
            assert call_kwargs["health_port"] is None


# ---------------------------------------------------------------------------
# cmd_mcp — MCPServer instantiation
# ---------------------------------------------------------------------------

class TestCmdMcp:
    def test_cmd_mcp_initialization(self):
        """Test cmd_mcp initializes and runs MCPServer."""
        from hr_admin_bots.cli import cmd_mcp
        args = MagicMock(config="config.json")

        with patch("hr_admin_bots.mcp_server.MCPServer") as MockServer:
            server_instance = MagicMock()
            MockServer.return_value = server_instance

            cmd_mcp(args)

            MockServer.assert_called_once_with(config_path="config.json")
            server_instance.run.assert_called_once()


# ---------------------------------------------------------------------------
# cmd_report — SmartAssistant summary
# ---------------------------------------------------------------------------

class TestCmdReport:
    def test_cmd_report_generates_summary(self, capsys):
        """Test cmd_report generates and prints monthly summary."""
        from hr_admin_bots.cli import cmd_report
        args = MagicMock(config="config.json")

        with patch("hr_admin_bots.cli._make_sheets") as mock_make, \
             patch("hr_admin_bots.smart.SmartAssistant") as MockAssistant:
            sheets = MagicMock()
            mock_make.return_value = sheets

            assistant = MagicMock()
            assistant.generate_monthly_summary.return_value = {"month": "2026-03", "total_leaves": 42}
            MockAssistant.return_value = assistant

            cmd_report(args)
            out = capsys.readouterr().out
            assert "2026-03" in out


# ---------------------------------------------------------------------------
# _get_used_days — leave balance calculation
# ---------------------------------------------------------------------------

class TestGetUsedDays:
    def test_get_used_days_counts_pending_and_approved(self):
        """Test _get_used_days counts both pending and approved leaves."""
        from hr_admin_bots.cli import _get_used_days

        sheets = MagicMock()
        sheets.find_rows.return_value = [
            {"status": "pending", "start_date": "2026-03-01", "days": "3"},
            {"status": "approved", "start_date": "2026-03-10", "days": "2"},
            {"status": "rejected", "start_date": "2026-03-15", "days": "5"},  # excluded
        ]

        used = _get_used_days(sheets, "E001", "年假")
        assert used == 5

    def test_get_used_days_ignores_different_years(self):
        """Test _get_used_days only counts current year."""
        from hr_admin_bots.cli import _get_used_days
        from datetime import date

        sheets = MagicMock()
        current_year = str(date.today().year)
        other_year = str(int(current_year) - 1)

        sheets.find_rows.return_value = [
            {"status": "approved", "start_date": f"{current_year}-03-01", "days": "3"},
            {"status": "approved", "start_date": f"{other_year}-03-01", "days": "10"},
        ]

        used = _get_used_days(sheets, "E001", "年假")
        assert used == 3

    def test_get_used_days_handles_invalid_days(self):
        """Test _get_used_days gracefully handles invalid day values."""
        from hr_admin_bots.cli import _get_used_days

        sheets = MagicMock()
        sheets.find_rows.return_value = [
            {"status": "approved", "start_date": "2026-03-01", "days": "invalid"},
            {"status": "approved", "start_date": "2026-03-10", "days": "2"},
            {"status": "approved", "start_date": "2026-03-15", "days": None},
        ]

        used = _get_used_days(sheets, "E001", "年假")
        assert used == 2
