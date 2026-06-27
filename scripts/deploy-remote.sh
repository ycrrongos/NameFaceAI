#!/usr/bin/env bash
# Run on the GPU server (rong@10.205.243.159) after cloning the repo.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "==> Setting up backend..."
cd backend
if [ ! -d ".venv" ]; then
  python3 -m venv .venv
fi
.venv/bin/pip install -U pip
.venv/bin/pip install -r requirements.txt
if [ ! -f ".env" ]; then
  cp .env.example .env
fi

echo "==> Setting up frontend..."
cd "$ROOT/frontend"
if [ ! -d "node_modules" ]; then
  npm install
fi

echo "==> Done. Start with: $ROOT/scripts/dev.sh"
