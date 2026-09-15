#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

echo "[$(date -Iseconds)] Starting scheduled MarketToSkills maintenance..."

cd "${ROOT_DIR}"

# 1. Run Python sync engine
python3 "${SCRIPT_DIR}/sync_skills.py"

# 2. Sync generated manifests to web public folder
cp -f "${ROOT_DIR}/skills/catalog.json" "${ROOT_DIR}/apps/web/public/catalog.json"
cp -f "${ROOT_DIR}/skills/categories.json" "${ROOT_DIR}/apps/web/public/categories.json"
cp -f "${ROOT_DIR}/skills/llms.txt" "${ROOT_DIR}/apps/web/public/llms.txt"

# 3. Check if git status has changes
if [[ -n "$(git status --porcelain)" ]]; then
    echo "[$(date -Iseconds)] New changes detected in skills or manifests. Committing and pushing..."
    git add skills/ packages/ apps/web/
    git commit -m "chore(registry): automated 3-day maintenance and skills sync [skip ci]" || true
    git push origin main || echo "Git push skipped or failed (will retry next cycle)"
    
    echo "[$(date -Iseconds)] Deploying updated production build to Vercel..."
    bunx vercel --prod --yes || echo "Vercel deploy warning (check credentials)"
else
    echo "[$(date -Iseconds)] Registry is already clean and up to date."
fi

# 4. Health check local Rust API (port 9001)
if curl -s http://localhost:9001/health >/dev/null 2>&1; then
    echo "[$(date -Iseconds)] API Healthcheck: OK (port 9001)"
else
    echo "[$(date -Iseconds)] API Healthcheck: OFFLINE or NOT RUNNING"
fi

# 5. Health check Vercel production deployment
if curl -sI https://markettoskills.vercel.app | grep -q "200"; then
    echo "[$(date -Iseconds)] Vercel Production Healthcheck: OK (https://markettoskills.vercel.app)"
else
    echo "[$(date -Iseconds)] Vercel Production Healthcheck: WARNING"
fi

echo "[$(date -Iseconds)] Maintenance cycle finished successfully."
