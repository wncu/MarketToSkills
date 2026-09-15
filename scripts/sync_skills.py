#!/usr/bin/env python3
"""
MarketToSkills Automated Maintenance & Sync Engine
Executes every 3 days to keep the skill registry pristine, deduplicated, and synchronized.
"""

import os
import sys
import json
import re
import hashlib
import subprocess
from datetime import datetime
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
SKILLS_DIR = BASE_DIR / "skills"
CATALOG_PATH = SKILLS_DIR / "catalog.json"
CATEGORIES_PATH = SKILLS_DIR / "categories.json"
LLMS_PATH = SKILLS_DIR / "llms.txt"
INDEX_PATH = SKILLS_DIR / "INDEX.md"
LOG_PATH = BASE_DIR / "logs" / "maintenance.log"

CATEGORIES = [
    "frontend",
    "backend",
    "ai-ml",
    "devops-cloud",
    "mobile",
    "security",
    "database",
    "design-ui",
    "testing-qa",
    "blockchain-web3",
    "automation-tooling",
    "architecture-system"
]

def log(msg):
    timestamp = datetime.now().isoformat()
    entry = f"[{timestamp}] {msg}"
    print(entry)
    LOG_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(LOG_PATH, "a", encoding="utf-8") as f:
        f.write(entry + "\n")

def parse_frontmatter(file_path):
    try:
        with open(file_path, "r", encoding="utf-8", errors="ignore") as f:
            content = f.read()
    except Exception as e:
        return None, None, ""

    match = re.match(r"^---\s*\n(.*?)\n---\s*\n(.*)$", content, re.DOTALL)
    if not match:
        return None, None, content

    yaml_block = match.group(1)
    body = match.group(2)

    name = None
    description = ""

    for line in yaml_block.split("\n"):
        line = line.strip()
        if line.startswith("name:"):
            name = line.split(":", 1)[1].strip().strip('"').strip("'")
        elif line.startswith("description:"):
            description = line.split(":", 1)[1].strip().strip('"').strip("'")

    return name, description, body

def run_maintenance():
    log("=== Starting MarketToSkills Maintenance Cycle ===")
    
    if not SKILLS_DIR.exists():
        log("ERROR: Skills directory not found at " + str(SKILLS_DIR))
        return False

    seen_slugs = set()
    seen_hashes = set()
    duplicates_removed = 0
    valid_skills = []
    category_counts = {c: 0 for c in CATEGORIES}

    # Walk skills directory
    for cat_dir in sorted(SKILLS_DIR.iterdir()):
        if not cat_dir.is_dir() or cat_dir.name not in CATEGORIES:
            continue
        category = cat_dir.name

        for skill_dir in sorted(cat_dir.iterdir()):
            if not skill_dir.is_dir():
                continue

            skill_md = skill_dir / "SKILL.md"
            if not skill_md.exists():
                continue

            slug = skill_dir.name.lower()
            name, desc, body = parse_frontmatter(skill_md)
            if not name:
                name = slug.replace("-", " ").title()
            if not desc:
                first_lines = [l.strip() for l in body.split("\n") if l.strip() and not l.startswith("#")]
                desc = first_lines[0] if first_lines else "No description available."
            desc = desc[:280]

            content_hash = hashlib.sha256(body.encode("utf-8")).hexdigest()

            # Deduplication
            if slug in seen_slugs or content_hash in seen_hashes:
                log(f"Removing duplicate skill: {category}/{slug}")
                try:
                    subprocess.run(["rm", "-rf", str(skill_dir)], check=True)
                    duplicates_removed += 1
                except Exception as e:
                    log(f"Failed to remove duplicate {skill_dir}: {e}")
                continue

            seen_slugs.add(slug)
            seen_hashes.add(content_hash)
            category_counts[category] += 1

            valid_skills.append({
                "id": f"{category}/{slug}",
                "name": name,
                "slug": slug,
                "category": category,
                "description": desc,
                "path": f"skills/{category}/{slug}",
                "verified": True
            })

    log(f"Processed {len(valid_skills)} unique skills. Deduplicated {duplicates_removed} skills.")

    # 1. Update catalog.json
    with open(CATALOG_PATH, "w", encoding="utf-8") as f:
        json.dump(valid_skills, f, indent=2, ensure_ascii=False)
    log(f"Saved updated catalog with {len(valid_skills)} items to {CATALOG_PATH}")

    # 2. Update categories.json
    cats_data = [{"id": k, "name": k.replace("-", " ").title(), "count": v} for k, v in category_counts.items()]
    with open(CATEGORIES_PATH, "w", encoding="utf-8") as f:
        json.dump(cats_data, f, indent=2, ensure_ascii=False)
    log(f"Saved updated categories breakdown to {CATEGORIES_PATH}")

    # 3. Update llms.txt
    with open(LLMS_PATH, "w", encoding="utf-8") as f:
        f.write("# MarketToSkills — LLM Agent Registry Manifest\n\n")
        f.write(f"> Generated: {datetime.now().isoformat()} | Skills Count: {len(valid_skills)}\n\n")
        f.write("## API Endpoints for Autonomous Agents\n")
        f.write("- GET /api/skills — Returns full JSON array of all active skills\n")
        f.write("- GET /api/categories — Returns categories with live count\n")
        f.write("- GET /api/agent/install?skills=id1,id2 — Download concatenated installation bundle\n\n")
        f.write("## Active Skill Categories\n")
        for cat in cats_data:
            f.write(f"- **{cat['name']}** (`{cat['id']}`): {cat['count']} skills\n")
    log("Saved llms.txt")

    # 4. Verify web build
    log("Verifying frontend build...")
    res = subprocess.run(["bun", "run", "build:web"], cwd=BASE_DIR, capture_output=True, text=True)
    if res.returncode == 0:
        log("Frontend build SUCCESS")
    else:
        log(f"Frontend build WARNING/ERROR: {res.stderr[:200]}")

    log("=== Maintenance Cycle Complete ===")
    return True

if __name__ == "__main__":
    success = run_maintenance()
    sys.exit(0 if success else 1)
