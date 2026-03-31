#!/bin/bash
# DSPy Trial — One-command setup + run
set -euo pipefail
cd "$(dirname "$0")"

echo "📦 Setting up DSPy trial environment..."
if [ ! -d ".venv" ]; then
  python3 -m venv .venv
  echo "  Created virtualenv"
fi
source .venv/bin/activate
pip install -q "dspy[anthropic]"
echo "  Installed dspy[anthropic]"

echo ""
echo "📊 Extracting dataset from Obsidian vault..."
python3 extract_dataset.py

if [ -z "${ANTHROPIC_API_KEY:-}" ]; then
  echo ""
  echo "⚠️  Set ANTHROPIC_API_KEY before running:"
  echo "    export ANTHROPIC_API_KEY='sk-ant-...'"
  echo "    source .venv/bin/activate && python3 run_trial.py"
  exit 0
fi

echo ""
echo "🚀 Running DSPy trial..."
python3 run_trial.py
