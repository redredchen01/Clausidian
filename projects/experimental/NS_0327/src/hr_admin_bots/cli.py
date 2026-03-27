"""CLI for HR Admin Bot Package.

Usage:
    hr-admin-bots serve [--config config.json]     # Start all bots
    hr-admin-bots mcp [--config config.json]       # Start MCP server
    hr-admin-bots lookup <employee_id>             # Quick employee lookup
    hr-admin-bots balance <employee_id>            # Check leave balance
    hr-admin-bots status <employee_id>             # Check pending requests
    hr-admin-bots version                          # Show version
"""
from __future__ import annotations

import argparse
import json
import sys
from datetime import date

from hr_admin_bots import __version__
from hr_admin_bots.constants import LEAVE_QUOTA


def _make_sheets(config_path: str):
    from hr_admin_bots.config import Config
    from hr_admin_bots.shared.sheets import SheetsClient

    config = Config.from_json(config_path)
    return SheetsClient(
        credentials_file=config.google_credentials_file,
        sheet_id=config.google_sheet_id,
    )


# ------------------------------------------------------------------
# Subcommand: serve
# ------------------------------------------------------------------

def cmd_serve(args: argparse.Namespace) -> None:
    from hr_admin_bots.manager import BotManager

    health_port = args.health_port if args.health_port > 0 else None
    manager = BotManager(
        config_path=args.config,
        enable_scheduler=not args.no_scheduler,
        health_port=health_port,
    )
    manager.run()


# ------------------------------------------------------------------
# Subcommand: mcp
# ------------------------------------------------------------------

def cmd_mcp(args: argparse.Namespace) -> None:
    from hr_admin_bots.mcp_server import MCPServer

    server = MCPServer(config_path=args.config)
    server.run()


# ------------------------------------------------------------------
# Subcommand: lookup
# ------------------------------------------------------------------

def cmd_lookup(args: argparse.Namespace) -> None:
    sheets = _make_sheets(args.config)
    employee = sheets.find_employee(args.employee_id)

    if employee is None:
        print(f"找不到員工：{args.employee_id}", file=sys.stderr)
        sys.exit(1)

    print(json.dumps(employee, ensure_ascii=False, indent=2))


# ------------------------------------------------------------------
# Subcommand: balance
# ------------------------------------------------------------------

def _get_used_days(sheets, employee_id: str, leave_type: str) -> int:
    rows = sheets.find_rows("leaves", filters={"employee_id": employee_id, "leave_type": leave_type})
    current_year = str(date.today().year)
    total = 0
    for row in rows:
        if row.get("status") in ("pending", "approved"):
            if row.get("start_date", "").startswith(current_year):
                try:
                    total += int(row.get("days", 0))
                except (ValueError, TypeError):
                    pass
    return total


def cmd_balance(args: argparse.Namespace) -> None:
    sheets = _make_sheets(args.config)
    employee = sheets.find_employee(args.employee_id)

    if employee is None:
        print(f"找不到員工：{args.employee_id}", file=sys.stderr)
        sys.exit(1)

    print(f"員工：{employee.get('name', '')}（{args.employee_id}）")
    print("假別餘額：")

    # 年假
    quota_annual = int(employee.get("annual_leave_quota", 0))
    used_annual = _get_used_days(sheets, args.employee_id, "年假")
    balance_annual = max(quota_annual - used_annual, 0)
    print(f"  年假     配額 {quota_annual} 天，已用 {used_annual} 天，剩餘 {balance_annual} 天")

    # 病假
    print("  病假     無限額")

    # 其他固定配額
    for leave_type, quota in LEAVE_QUOTA.items():
        if leave_type == "病假":
            continue
        used = _get_used_days(sheets, args.employee_id, leave_type)
        balance = max(quota - used, 0)
        print(f"  {leave_type:<6} 配額 {quota} 天，已用 {used} 天，剩餘 {balance} 天")


# ------------------------------------------------------------------
# Subcommand: status
# ------------------------------------------------------------------

def cmd_status(args: argparse.Namespace) -> None:
    sheets = _make_sheets(args.config)
    employee = sheets.find_employee(args.employee_id)

    if employee is None:
        print(f"找不到員工：{args.employee_id}", file=sys.stderr)
        sys.exit(1)

    print(f"員工：{employee.get('name', '')}（{args.employee_id}）")

    sheet_map = {
        "請假": "leaves",
        "入職": "onboarding",
        "工作證": "work_permits",
        "離職": "offboarding",
    }

    found_any = False
    for label, sheet_name in sheet_map.items():
        try:
            rows = sheets.find_rows(sheet_name, filters={"employee_id": args.employee_id})
        except Exception:
            continue

        pending = [r for r in rows if r.get("status") == "pending"]
        if not pending:
            continue

        found_any = True
        print(f"\n{label}（待審 {len(pending)} 筆）：")
        for r in pending:
            if sheet_name == "leaves":
                print(
                    f"  {r.get('leave_type', '')} | "
                    f"{r.get('start_date', '')} ~ {r.get('end_date', '')} "
                    f"（{r.get('days', '')} 天）| 申請日：{r.get('apply_date', '')}"
                )
            else:
                print(f"  申請日：{r.get('submit_date', r.get('apply_date', ''))}")

    if not found_any:
        print("目前沒有待審申請。")


# ------------------------------------------------------------------
# Subcommand: version
# ------------------------------------------------------------------

def cmd_version(_args: argparse.Namespace) -> None:
    print(f"hr-admin-bots {__version__}")


# ------------------------------------------------------------------
# Entry point
# ------------------------------------------------------------------

def main() -> None:
    parser = argparse.ArgumentParser(
        prog="hr-admin-bots",
        description="HR Admin Bot Package CLI",
    )
    sub = parser.add_subparsers(dest="command", metavar="<command>")
    sub.required = True

    # serve
    p_serve = sub.add_parser("serve", help="Start all Telegram bots")
    p_serve.add_argument("--config", default="config.json")
    p_serve.add_argument(
        "--no-scheduler",
        action="store_true",
        default=False,
        help="Disable the automatic reminder scheduler",
    )
    p_serve.add_argument(
        "--health-port",
        type=int,
        default=8080,
        metavar="PORT",
        help="HTTP health check port (0 to disable, default: 8080)",
    )
    p_serve.set_defaults(func=cmd_serve)

    # mcp
    p_mcp = sub.add_parser("mcp", help="Start MCP server (stdin/stdout JSON-RPC)")
    p_mcp.add_argument("--config", default="config.json")
    p_mcp.set_defaults(func=cmd_mcp)

    # lookup
    p_lookup = sub.add_parser("lookup", help="Quick employee lookup")
    p_lookup.add_argument("employee_id")
    p_lookup.add_argument("--config", default="config.json")
    p_lookup.set_defaults(func=cmd_lookup)

    # balance
    p_balance = sub.add_parser("balance", help="Check leave balance")
    p_balance.add_argument("employee_id")
    p_balance.add_argument("--config", default="config.json")
    p_balance.set_defaults(func=cmd_balance)

    # status
    p_status = sub.add_parser("status", help="Check pending requests for an employee")
    p_status.add_argument("employee_id")
    p_status.add_argument("--config", default="config.json")
    p_status.set_defaults(func=cmd_status)

    # version
    p_version = sub.add_parser("version", help="Show version")
    p_version.set_defaults(func=cmd_version)

    args = parser.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
