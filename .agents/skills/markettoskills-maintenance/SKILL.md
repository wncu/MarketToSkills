---
name: markettoskills-maintenance
description: >-
  Automated maintenance and curation engine for the MarketToSkills platform.
  Runs every 3 days to synchronize upstream skills, eliminate duplicates, validate
  SKILL.md specifications, regenerate machine-readable manifests (catalog.json,
  llms.txt, INDEX.md), recompile frontend previews, and push updates to Git/Vercel.
---

# MarketToSkills Maintenance Skill

This skill automates continuous maintenance, health verification, and catalog synchronization for the **MarketToSkills** repository and platform every 3 days.

## Schedule & Trigger

- **Frequency**: Every 3 days (`0 0 */3 * *`).
- **Autonomous Trigger**: Can be executed via Antigravity `schedule` tool or cron.
- **Manual Trigger**: Can be run on demand via `./scripts/run_maintenance.sh`.

## Routine Checklist

Every maintenance execution cycle performs the following sequential actions:

1. **Upstream Skill Ingestion & Sync**:
   - Scans known upstream repositories and registries for new agent skills.
   - Extracts `SKILL.md` specifications and any accompanying scripts/resources.

2. **Validation & Categorization**:
   - Ensures all skills adhere to Antigravity / Agent specification standards:
     - Valid YAML frontmatter with `name` and `description`.
     - Non-empty instruction body.
     - Categorization into one of the 12 primary domains:
       - `frontend`, `backend`, `ai-ml`, `devops-cloud`, `mobile`, `security`,
       - `database`, `design-ui`, `testing-qa`, `blockchain-web3`,
       - `automation-tooling`, `architecture-system`.

3. **Strict Deduplication**:
   - Computes SHA256 content hashes of skill instruction bodies.
   - Normalizes slugs and names to prevent redundant entries.
   - Automatically prunes duplicate or corrupt skill definitions.

4. **Manifest Regeneration**:
   - Updates `skills/catalog.json` with the complete structured catalog.
   - Updates `skills/categories.json` with live skill counts per category.
   - Updates `skills/llms.txt` for sub-millisecond agent ingestion.
   - Updates `skills/INDEX.md` human/agent documentation.

5. **Build & Quality Assurance**:
   - Re-runs `bun run build:web` to verify compiled assets.
   - Verifies TypeScript types and Vite bundle integrity.

6. **Version Control & Remote Deployment**:
   - Checks `git status --porcelain`.
   - Stages and commits any modified skills or manifests.
   - Pushes commits to `origin main`, triggering automatic continuous deployment on Vercel.

7. **Service Health Check**:
   - Pings `http://localhost:9001/health` (Rust Axum API).
   - Writes timestamped entry to `logs/maintenance.log`.

## Quick Execution

```bash
# Run maintenance immediately:
/home/l/Escritorio/MarketToSkills/scripts/run_maintenance.sh

# Or inspect the latest maintenance logs:
tail -n 50 /home/l/Escritorio/MarketToSkills/logs/maintenance.log
```
