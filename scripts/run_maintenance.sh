#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

echo "[$(date -Iseconds)] Starting scheduled MarketToSkills maintenance..."

cd "${ROOT_DIR}"

# 1. Run Python sync engine
python3 "${SCRIPT_DIR}/sync_skills.py"

# 2. Check if git status has changes
if [[ -n "$(git status --porcelain)" ]]; then
    echo "[$(date -Iseconds)] New changes detected in skills or manifests. Committing and pushing..."
    git add skills/ packages/ apps/web/
    git commit -m "chore(registry): automated 3-day maintenance and skills sync [skip ci]" || true
    git push origin main || echo "Git push skipped or failed (will retry next cycle)"
else
    echo "[$(date -Iseconds)] Registry is already clean and up to date."
fi

# 3. Health check
if curl -s http://localhost:9001/health >/dev/null 2>&1; then
    echo "[$(date -Iseconds)] API Healthcheck: OK (port 9001)"
else
    echo "[$(date -Iseconds)] API Healthcheck: OFFLINE or NOT RUNNING"
fi

echo "[$(date -Iseconds)] Maintenance complete."
