#!/bin/bash
set -e

echo "=== HR Admin Bot Package — 一鍵設定 ==="

# 1. Git commit
echo ""
echo "[1/4] Git commit..."
git add src/ dev/specs/2026-03-27_1_hr-admin-bot-package/ pyproject.toml requirements.txt config.example.json .gitignore README.md
git commit -m "$(cat <<'EOF'
feat: HR Admin Bot Skill Package — 4 Telegram bots with shared foundation

- Onboarding, Work Permit, Leave, Offboarding bots
- Shared: employee auth, Google Sheets client, email notifier
- Unified manager (asyncio.gather for concurrent polling)
- pip installable package (pyproject.toml PEP 621)
- S0 requirement input + brief spec + S1 dev spec

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
echo "  -> Committed: $(git log --oneline -1)"

# 2. Install package
echo ""
echo "[2/4] Installing package..."
pip install -e . 2>/dev/null || pip3 install -e .
echo "  -> Package installed"

# 3. Verify import
echo ""
echo "[3/4] Verifying imports..."
python3 -c "
from hr_admin_bots.config import Config, BotConfig, SmtpConfig
from hr_admin_bots.shared.auth import EmployeeAuth
from hr_admin_bots.shared.sheets import SheetsClient
from hr_admin_bots.shared.notifier import EmailNotifier
from hr_admin_bots.bots.base import BaseBot
from hr_admin_bots.bots.onboarding import OnboardingBot
from hr_admin_bots.bots.work_permit import WorkPermitBot
from hr_admin_bots.bots.leave import LeaveBot
from hr_admin_bots.bots.offboarding import OffboardingBot
from hr_admin_bots.manager import BotManager
print('  -> All 10 modules imported successfully')
"

# 4. Summary
echo ""
echo "[4/4] Done!"
echo ""
echo "=== 完成摘要 ==="
echo "  Commit: $(git log --oneline -1)"
echo "  Package: $(pip show hr-admin-bots 2>/dev/null | grep Version || pip3 show hr-admin-bots 2>/dev/null | grep Version)"
echo "  Files: $(find src -name '*.py' | wc -l | tr -d ' ') Python modules"
echo ""
echo "=== 下一步 ==="
echo "  1. cp config.example.json config.json"
echo "  2. 編輯 config.json 填入 Bot Token + Sheet ID + SMTP"
echo "  3. python -m hr_admin_bots.manager --config config.json"
echo ""
echo "  或重啟 Claude Code 繼續："
echo "  claude"
