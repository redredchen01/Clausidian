#!/bin/bash
# Development setup script for hr-admin-bots
set -e

echo "=== HR Admin Bot Package — Development Setup ==="

# 1. Create virtualenv if not present
if [ ! -d ".venv" ]; then
    echo "[1/3] Creating virtualenv..."
    python3 -m venv .venv
else
    echo "[1/3] Virtualenv already exists, skipping"
fi

# 2. Install package in editable mode with dev deps
echo "[2/3] Installing package..."
.venv/bin/pip install -e ".[dev]" --quiet

# 3. Verify imports
echo "[3/3] Verifying imports..."
.venv/bin/python -c "
from hr_admin_bots.config import Config, BotConfig, SmtpConfig
from hr_admin_bots.shared.auth import EmployeeAuth
from hr_admin_bots.shared.sheets import SheetsClient
from hr_admin_bots.shared.notifier import EmailNotifier
from hr_admin_bots.shared.approval import ApprovalManager
from hr_admin_bots.shared.webhook import WebhookNotifier
from hr_admin_bots.shared.audit import AuditLogger
from hr_admin_bots.bots.base import BaseBot
from hr_admin_bots.bots.onboarding import OnboardingBot
from hr_admin_bots.bots.work_permit import WorkPermitBot
from hr_admin_bots.bots.leave import LeaveBot
from hr_admin_bots.bots.offboarding import OffboardingBot
from hr_admin_bots.manager import BotManager
from hr_admin_bots.scheduler import ReminderScheduler
from hr_admin_bots.smart import SmartAssistant
from hr_admin_bots.mcp_server import MCPServer
print('All modules imported successfully')
"

echo ""
echo "=== Done ==="
echo ""
echo "Next steps:"
echo "  cp config.example.json config.json"
echo "  # Edit config.json with your Bot Tokens, Sheet ID, SMTP settings"
echo "  source .venv/bin/activate"
echo "  hr-admin-bots serve --config config.json"
echo ""
echo "Run tests:"
echo "  .venv/bin/pytest tests/"
