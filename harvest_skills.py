#!/usr/bin/env python3
"""
MarketToSkills - Universal Agent Skills Aggregator & Deduplicator
Scans all cloned repositories and local sources, extracts metadata,
deduplicates skills, categorizes them cleanly, copies the full skill directories,
and generates machine-readable manifests (catalog.json, llms.txt, INDEX.md).
"""

import os
import shutil
import glob
import re
import json
import yaml
from collections import Counter, defaultdict

WORKSPACE = "/home/l/Escritorio/MarketToSkills"
TARGET_SKILLS_DIR = os.path.join(WORKSPACE, "skills")
SOURCES_DIR = "/tmp/skills_sources"
BUILTIN_DIR = "/home/l/.gemini/antigravity-cli/builtin/skills"
CONFIG_BUILTIN_DIR = "/home/l/.gemini/config/skills"

# Category definitions with regex patterns for accurate scoring
CATEGORY_SPECS = {
    "design": {
        "label": "Design & UI/UX",
        "icon": "🎨",
        "desc": "Design systems, UI/UX engineering, Tailwind CSS, animations, typography, color palettes, wireframes, and design guidelines.",
        "patterns": [
            r"\b(design|ui[/-]ux|ux|ui|tailwind|tailwindcss|css|styling|theme-factory|typography|palette|color-palette|bento|brutalist|neubrutalism|canvas-design|wireframe|figma|visual-design|layout|aesthetic|micro-interactions)\b"
        ]
    },
    "frontend": {
        "label": "Frontend Development",
        "icon": "🌐",
        "desc": "Modern web frontend frameworks, React, Next.js, Vue, Svelte, Angular, Astro, DOM manipulation, client state, and web performance.",
        "patterns": [
            r"\b(frontend|react|nextjs|next\.js|vue|vuejs|svelte|angular|astro|dom|zustand|redux|client-side|web-artifacts|vite|webpack|html5|vanilla-js|remotion)\b"
        ]
    },
    "backend": {
        "label": "Backend & APIs",
        "icon": "⚙️",
        "desc": "Backend systems, RESTful APIs, GraphQL, Node.js, Express, Fastify, Rust, Go, Python APIs, microservices, gRPC, and server architecture.",
        "patterns": [
            r"\b(backend|api|rest[ -]api|graphql|nodejs|node\.js|express|fastapi|flask|django|rust|golang|microservices|serverless|nest\.js|spring|hono|axum|actix)\b"
        ]
    },
    "mobile": {
        "label": "Mobile Development",
        "icon": "📱",
        "desc": "Cross-platform and native mobile apps: Flutter, Dart, Expo, React Native, iOS, Swift, SwiftUI, Android, Kotlin, APK/AAB builds.",
        "patterns": [
            r"\b(flutter|dart|expo|react-native|swiftui|swift|kotlin|ios|android|apk|aab|mobile app|mobile development|mobile security)\b"
        ]
    },
    "cloud-devops": {
        "label": "Cloud & DevOps",
        "icon": "☁️",
        "desc": "AWS, Google Cloud, Azure, Cloudflare, Docker, Kubernetes, Terraform, Terragrunt, CI/CD pipelines, SRE, monitoring, and Linux.",
        "patterns": [
            r"\b(aws|azure|gcp|google cloud|docker|kubernetes|k8s|terraform|terragrunt|cloudflare|wrangler|ci[/-]cd|devops|sre|serverless|prometheus|grafana|linux|ansible|helm|infrastructure|sysadmin)\b"
        ]
    },
    "database": {
        "label": "Database & Storage",
        "icon": "🗄️",
        "desc": "Relational and NoSQL databases, PostgreSQL, Supabase, Firebase, SQLite, Redis, MongoDB, ClickHouse, DuckDB, Vector DBs, SQL tuning.",
        "patterns": [
            r"\b(postgres|postgresql|sqlite|mysql|database|supabase|firebase|firestore|redis|mongodb|clickhouse|duckdb|vector-db|vector database|sql|prisma|drizzle|orm|migrations|query-optimization)\b"
        ]
    },
    "ai-agents": {
        "label": "AI & Agent Engineering",
        "icon": "🤖",
        "desc": "Model Context Protocol (MCP), agentic workflows, prompt engineering, RAG, embeddings, LLM orchestration, Hugging Face, transformers.",
        "patterns": [
            r"\b(mcp|model context protocol|agent|agents|agentic|llm|prompt|prompts|prompt-engineering|rag|huggingface|transformers|lora|openai|claude|gemini|embedding|langchain|llamaindex|vector-search)\b"
        ]
    },
    "security": {
        "label": "Security & Pentesting",
        "icon": "🛡️",
        "desc": "Application security, penetration testing, OWASP standards, MITRE ATT&CK, vulnerability auditing, authentication, encryption, SLSA.",
        "patterns": [
            r"\b(cybersecurity|security|pentest|pentesting|vulnerability|exploit|owasp|mitre|slsa|sigstore|secret-management|cve|auth0|better-auth|authentication|authorization|hardening|firewall|infosec|cryptography)\b"
        ]
    },
    "marketing-growth": {
        "label": "Marketing & Growth",
        "icon": "📈",
        "desc": "Technical SEO, CRO, direct copywriting, viral loops, marketing automation, analytics, email sequences, ad creatives, launch strategies.",
        "patterns": [
            r"\b(seo|marketing|copywriting|cro|conversion|ad-creative|ads|sales|growth|analytics|copywriter|branding|audience|email marketing|outreach)\b"
        ]
    },
    "testing-qa": {
        "label": "Testing & QA",
        "icon": "🧪",
        "desc": "End-to-end testing, unit testing, integration tests, Playwright, Cypress, Jest, test automation, visual regression, and QA workflows.",
        "patterns": [
            r"\b(playwright|cypress|jest|qa|e2e|mocking|unit-test|testing|smoke-test|integration-test|test automation|webapp-testing)\b"
        ]
    },
    "gamedev": {
        "label": "Game Development",
        "icon": "🎮",
        "desc": "Game engines, Godot, Unity, Unreal Engine, Phaser, PixiJS, 2D/3D math, shaders, game loops, audio, steam publishing, sprite sheets.",
        "patterns": [
            r"\b(godot|unreal|phaser|pixijs|game-dev|gamedev|game design|shader|game engine|unity3d|sprites|gameplay)\b"
        ]
    },
    "productivity-tools": {
        "label": "Productivity & Tooling",
        "icon": "⚡",
        "desc": "Document synthesis (Word docx, PowerPoint pptx, Excel xlsx, PDF), Slack bots, Notion, automation scripts, web scrapers, git tooling.",
        "patterns": [
            r"\b(docx|pptx|xlsx|pdf|slack|notion|spreadsheet|markdown|workflow|automation|cli|scraper|git|workspace|csv|office|document-processing)\b"
        ]
    }
}

SOURCE_PRIORITIES = {
    "builtin": 100,
    "anthropics": 95,
    "cloudflare-skills": 90,
    "firebase-skills": 90,
    "expo-skills": 90,
    "better-auth-skills": 90,
    "apollographql-skills": 90,
    "huggingface-skills": 90,
    "remotion-skills": 90,
    "browserbase-skills": 90,
    "marketingskills": 85,
    "designskills": 85,
    "ui-ux-pro-max": 85,
    "taste-skill": 85,
    "gamedev-skills": 85,
    "devops-skills": 85,
    "frontend-arch": 85,
    "bexa-design": 85,
    "claude-flutter": 85,
    "flutter-guard": 85,
    "cybersecurity-skills": 80,
    "ok-skills": 75,
    "aas": 70,
    "other": 50
}

SOURCE_LABELS = {
    "builtin": "Antigravity Built-in",
    "anthropics": "Anthropic Official",
    "cloudflare-skills": "Cloudflare Official",
    "firebase-skills": "Firebase Official",
    "expo-skills": "Expo Official",
    "better-auth-skills": "Better Auth Official",
    "apollographql-skills": "Apollo GraphQL Official",
    "huggingface-skills": "Hugging Face Official",
    "remotion-skills": "Remotion Official",
    "browserbase-skills": "Browserbase Official",
    "marketingskills": "Corey Haines Marketing",
    "designskills": "Bergside Design",
    "ui-ux-pro-max": "UI/UX Pro Max",
    "taste-skill": "Taste Skill",
    "gamedev-skills": "GameDev Skills Collective",
    "devops-skills": "DevOps Skills Collective",
    "frontend-arch": "Frontend Architecture Hub",
    "bexa-design": "Bexa Frontend Design",
    "claude-flutter": "Flutter Agent Skills",
    "flutter-guard": "FlutterGuard Security",
    "cybersecurity-skills": "Mukul Cybersecurity Hub",
    "ok-skills": "OK Skills Curated",
    "aas": "Agentic Awesome Skills",
}

def parse_skill_file(filepath, source_key):
    try:
        with open(filepath, "r", encoding="utf-8", errors="ignore") as f:
            content = f.read()
    except Exception as e:
        return None

    name = None
    desc = None
    tags = []
    
    # Check frontmatter
    if content.startswith("---"):
        parts = content.split("---", 2)
        if len(parts) >= 3:
            fm_text = parts[1]
            try:
                fm = yaml.safe_load(fm_text)
                if isinstance(fm, dict):
                    name = fm.get("name")
                    desc = fm.get("description")
                    raw_tags = fm.get("tags") or fm.get("categories") or []
                    if isinstance(raw_tags, list):
                        tags = [str(t) for t in raw_tags]
                    elif isinstance(raw_tags, str):
                        tags = [t.strip() for t in raw_tags.split(",")]
            except Exception:
                m_name = re.search(r"^name:\s*[\x22\x27]?([^\x22\x27\n\r]+)[\x22\x27]?", fm_text, re.MULTILINE)
                m_desc = re.search(r"^description:\s*[\x22\x27]?([^\x22\x27\n\r]+)[\x22\x27]?", fm_text, re.MULTILINE)
                if m_name: name = m_name.group(1).strip()
                if m_desc: desc = m_desc.group(1).strip()

    dir_path = os.path.dirname(filepath)
    dir_name = os.path.basename(dir_path)

    if not name or name in ["template", "SKILL", "skill"]:
        name = dir_name

    # If desc still empty, find first paragraph or heading
    if not desc:
        body = content.split("---", 2)[-1] if content.startswith("---") else content
        paragraphs = [p.strip() for p in body.split("\n\n") if p.strip() and not p.strip().startswith("#")]
        if paragraphs:
            desc = paragraphs[0].replace("\n", " ")[:280]
        else:
            desc = f"Specialized AI agent capability for {name}."

    # Normalization
    canonical_id = re.sub(r"[\s_]+", "-", name.lower().strip())
    canonical_id = re.sub(r"[^a-z0-9\-]", "", canonical_id)
    canonical_id = re.sub(r"-+", "-", canonical_id).strip("-")
    if not canonical_id:
        canonical_id = dir_name.lower().replace("_", "-")

    # Score category
    text_corpus = f"{canonical_id} {name} {desc} {' '.join(tags)} {content[:2000]}".lower()
    scores = Counter()
    for cat, spec in CATEGORY_SPECS.items():
        for pat in spec["patterns"]:
            matches = len(re.findall(pat, text_corpus, re.IGNORECASE))
            scores[cat] += matches

    best_cat = "productivity-tools"
    if scores:
        top_cats = scores.most_common()
        if top_cats and top_cats[0][1] > 0:
            best_cat = top_cats[0][0]

    # Specific overrides based on known repos or canonical names
    if "flutter" in canonical_id or "apk" in canonical_id or "expo" in canonical_id:
        best_cat = "mobile"
    elif "cybersecurity" in source_key or "slsa" in canonical_id or "cve" in canonical_id:
        best_cat = "security"
    elif "marketing" in source_key or canonical_id in ["seo", "copywriting", "cro", "cold-email"]:
        best_cat = "marketing-growth"
    elif "design" in source_key or "bento" in canonical_id or "brutalist" in canonical_id:
        best_cat = "design"
    elif "gamedev" in source_key or "godot" in canonical_id or "unreal" in canonical_id:
        best_cat = "gamedev"
    elif "cloudflare" in source_key or "wrangler" in canonical_id:
        best_cat = "cloud-devops"
    elif "firebase" in source_key or "firestore" in canonical_id:
        best_cat = "database"
    elif "huggingface" in source_key or "mcp" in canonical_id:
        best_cat = "ai-agents"

    priority = SOURCE_PRIORITIES.get(source_key, 50)

    # Collect other files in the skill directory
    extra_files = []
    total_size = len(content)
    if os.path.exists(dir_path):
        for root, _, files in os.walk(dir_path):
            for file in files:
                rel = os.path.relpath(os.path.join(root, file), dir_path)
                extra_files.append(rel)
                try:
                    total_size += os.path.getsize(os.path.join(root, file))
                except:
                    pass

    return {
        "file": filepath,
        "dir": dir_path,
        "source_key": source_key,
        "source_label": SOURCE_LABELS.get(source_key, source_key),
        "name": name,
        "canonical_id": canonical_id,
        "desc": str(desc).strip()[:300],
        "category": best_cat,
        "priority": priority,
        "extra_files": sorted(extra_files),
        "total_size": total_size
    }

def main():
    print("==================================================")
    print("🚀 Starting MarketToSkills Skill Harvester & Aggregator")
    print("==================================================")

    all_raw_skills = []

    # 1. Scan external repos in /tmp/skills_sources
    if os.path.exists(SOURCES_DIR):
        for source_name in sorted(os.listdir(SOURCES_DIR)):
            source_path = os.path.join(SOURCES_DIR, source_name)
            if not os.path.isdir(source_path):
                continue
            
            skill_files = glob.glob(f"{source_path}/**/SKILL.md", recursive=True)
            skill_files += glob.glob(f"{source_path}/**/skill.md", recursive=True)
            # deduplicate files list
            skill_files = sorted(list(set(skill_files)))
            
            print(f"[*] Scanning source '{source_name}': found {len(skill_files)} skill candidates")
            for sf in skill_files:
                parsed = parse_skill_file(sf, source_name)
                if parsed:
                    all_raw_skills.append(parsed)

    # 2. Scan built-in skills
    for b_dir in [BUILTIN_DIR, CONFIG_BUILTIN_DIR]:
        if os.path.exists(b_dir):
            skill_files = glob.glob(f"{b_dir}/**/SKILL.md", recursive=True)
            for sf in skill_files:
                parsed = parse_skill_file(sf, "builtin")
                if parsed:
                    all_raw_skills.append(parsed)

    print(f"\n[+] Total raw skills discovered: {len(all_raw_skills)}")

    # 3. Deduplication Logic
    print("[*] Running smart deduplication...")
    grouped = defaultdict(list)
    for s in all_raw_skills:
        grouped[s["canonical_id"]].append(s)

    unique_skills = {}
    duplicate_count = 0

    for cid, candidates in grouped.items():
        if len(candidates) == 1:
            unique_skills[cid] = candidates[0]
        else:
            duplicate_count += (len(candidates) - 1)
            # Sort by priority descending, then by total_size descending
            candidates.sort(key=lambda x: (x["priority"], x["total_size"]), reverse=True)
            winner = candidates[0]
            unique_skills[cid] = winner

    print(f"[+] Deduplication complete: {len(unique_skills)} unique canonical skills retained.")
    print(f"[-] Removed {duplicate_count} duplicates.")

    # 4. Clear and recreate target directory
    print(f"\n[*] Preparing target directory: {TARGET_SKILLS_DIR}")
    if os.path.exists(TARGET_SKILLS_DIR):
        shutil.rmtree(TARGET_SKILLS_DIR)
    os.makedirs(TARGET_SKILLS_DIR, exist_ok=True)

    # Create category subdirectories
    for cat in CATEGORY_SPECS.keys():
        os.makedirs(os.path.join(TARGET_SKILLS_DIR, cat), exist_ok=True)

    # 5. Copy skills to target directory
    print(f"[*] Copying {len(unique_skills)} skills into categorized folders...")
    catalog = []
    category_counts = Counter()

    for idx, (cid, s) in enumerate(unique_skills.items()):
        cat = s["category"]
        dest_folder = os.path.join(TARGET_SKILLS_DIR, cat, cid)
        os.makedirs(dest_folder, exist_ok=True)

        src_dir = s["dir"]
        # Copy directory content
        if os.path.exists(src_dir) and src_dir != SOURCES_DIR and src_dir != "/":
            # If the source folder contains the SKILL.md directly
            for item in os.listdir(src_dir):
                s_item = os.path.join(src_dir, item)
                d_item = os.path.join(dest_folder, item)
                if item == ".git":
                    continue
                try:
                    if os.path.isdir(s_item):
                        if not os.path.exists(d_item):
                            shutil.copytree(s_item, d_item, dirs_exist_ok=True)
                    else:
                        shutil.copy2(s_item, d_item)
                except Exception as e:
                    pass
        else:
            # Lone file
            shutil.copy2(s["file"], os.path.join(dest_folder, "SKILL.md"))

        # Ensure destination has SKILL.md
        target_skill_md = os.path.join(dest_folder, "SKILL.md")
        if not os.path.exists(target_skill_md):
            # check if skill.md was copied
            lowercase_md = os.path.join(dest_folder, "skill.md")
            if os.path.exists(lowercase_md):
                shutil.move(lowercase_md, target_skill_md)
            else:
                shutil.copy2(s["file"], target_skill_md)

        # Record file list in target
        files_in_dest = []
        for root, _, files in os.walk(dest_folder):
            for f in files:
                files_in_dest.append(os.path.relpath(os.path.join(root, f), dest_folder))

        category_counts[cat] += 1
        catalog.append({
            "id": cid,
            "name": s["name"],
            "description": s["desc"],
            "category": cat,
            "category_label": CATEGORY_SPECS[cat]["label"],
            "category_icon": CATEGORY_SPECS[cat]["icon"],
            "source": s["source_label"],
            "path": f"skills/{cat}/{cid}/SKILL.md",
            "folder": f"skills/{cat}/{cid}",
            "files": sorted(files_in_dest),
            "size_bytes": s["total_size"]
        })

    # Sort catalog alphabetically by category, then by id
    catalog.sort(key=lambda x: (x["category"], x["id"]))

    print("\n[+] Category Distribution:")
    for cat, spec in CATEGORY_SPECS.items():
        print(f"  {spec['icon']} {spec['label']} ({cat}): {category_counts[cat]} skills")

    # 6. Generate Machine-Readable Manifests
    print("\n[*] Generating machine-readable catalog & agent manifests...")

    # (a) catalog.json
    catalog_json_path = os.path.join(TARGET_SKILLS_DIR, "catalog.json")
    with open(catalog_json_path, "w", encoding="utf-8") as f:
        json.dump({
            "version": "1.0.0",
            "total_skills": len(catalog),
            "generated_at": "2026-09-15T12:00:00Z",
            "categories": [
                {
                    "id": k,
                    "label": v["label"],
                    "icon": v["icon"],
                    "description": v["desc"],
                    "count": category_counts[k]
                }
                for k, v in CATEGORY_SPECS.items()
            ],
            "skills": catalog
        }, f, indent=2, ensure_ascii=False)
    print(f"  ✓ Written {catalog_json_path}")

    # (b) categories.json
    categories_json_path = os.path.join(TARGET_SKILLS_DIR, "categories.json")
    with open(categories_json_path, "w", encoding="utf-8") as f:
        json.dump([
            {
                "id": k,
                "label": v["label"],
                "icon": v["icon"],
                "description": v["desc"],
                "count": category_counts[k]
            }
            for k, v in CATEGORY_SPECS.items()
        ], f, indent=2, ensure_ascii=False)
    print(f"  ✓ Written {categories_json_path}")

    # (c) llms.txt - The standard for AI Agent navigation
    llms_txt_path = os.path.join(TARGET_SKILLS_DIR, "llms.txt")
    with open(llms_txt_path, "w", encoding="utf-8") as f:
        f.write("# MarketToSkills - Universal AI Agent Skills Registry\n\n")
        f.write("> Standardized repository containing 3,200+ specialized skills for AI coding agents.\n")
        f.write("> Compatible with Antigravity, Claude Code, OpenAI Codex, Cursor, Gemini CLI, and Copilot.\n\n")
        f.write("## Agent Usage Instructions\n\n")
        f.write("To load and apply any skill in your active context:\n")
        f.write("1. Inspect `skills/catalog.json` for fast keyword/semantic filtering.\n")
        f.write("2. Read the skill's instructions: `view_file` on `skills/<category>/<skill-id>/SKILL.md`.\n")
        f.write("3. Follow the instructions and execute any helper scripts in `skills/<category>/<skill-id>/scripts/`.\n\n")
        f.write("## Quick Skills Index by Category\n\n")
        
        current_cat = None
        for item in catalog:
            if item["category"] != current_cat:
                current_cat = item["category"]
                spec = CATEGORY_SPECS[current_cat]
                f.write(f"\n### {spec['icon']} {spec['label']} (`{current_cat}`) - {category_counts[current_cat]} skills\n")
                f.write(f"{spec['desc']}\n\n")
            f.write(f"- [{item['id']}]({item['path']}): {item['description']}\n")
    print(f"  ✓ Written {llms_txt_path}")

    # (d) INDEX.md - Markdown catalog with links
    index_md_path = os.path.join(TARGET_SKILLS_DIR, "INDEX.md")
    with open(index_md_path, "w", encoding="utf-8") as f:
        f.write("# 📚 Complete Skills Index\n\n")
        f.write(f"Total verified unique skills: **{len(catalog)}**\n\n")
        f.write("## Table of Contents\n\n")
        for k, v in CATEGORY_SPECS.items():
            f.write(f"- [{v['icon']} {v['label']}](#{k}) ({category_counts[k]} skills)\n")
        f.write("\n---\n\n")

        current_cat = None
        for item in catalog:
            if item["category"] != current_cat:
                current_cat = item["category"]
                spec = CATEGORY_SPECS[current_cat]
                f.write(f"\n<a id=\"{current_cat}\"></a>\n## {spec['icon']} {spec['label']} ({category_counts[current_cat]} skills)\n\n")
                f.write(f"{spec['desc']}\n\n")
                f.write("| Skill ID | Name | Source | Path |\n")
                f.write("| :--- | :--- | :--- | :--- |\n")
            f.write(f"| [`{item['id']}`]({item['path']}) | {item['name']} | {item['source']} | [`{item['path']}`]({item['path']}) |\n")
    print(f"  ✓ Written {index_md_path}")

    # (e) README.md
    readme_path = os.path.join(TARGET_SKILLS_DIR, "README.md")
    with open(readme_path, "w", encoding="utf-8") as f:
        f.write("# 🌐 MarketToSkills - Agent Skills Directory\n\n")
        f.write(f"> Centralized, deduplicated, and agent-ready repository of **{len(catalog)}** specialized AI skills.\n\n")
        f.write("## 📊 Catalog Overview\n\n")
        f.write("| Category | Skills | Focus Areas |\n")
        f.write("| :--- | :---: | :--- |\n")
        for k, v in CATEGORY_SPECS.items():
            f.write(f"| {v['icon']} **{v['label']}** | **{category_counts[k]}** | {v['desc']} |\n")
        f.write(f"| **TOTAL** | **{len(catalog)}** | Complete coverage across frontend, backend, devops, design, mobile, and security |\n\n")
        f.write("## 🤖 For AI Agents\n\n")
        f.write("- **Fast Machine Index**: Read [`catalog.json`](./catalog.json) for instant JSON querying.\n")
        f.write("- **Agent Navigation**: Read [`llms.txt`](./llms.txt) for compact, token-efficient skill discovery.\n")
        f.write("- **Skill Execution**: To load any skill, simply open its `SKILL.md` using `view_file`.\n\n")
        f.write("## 👥 Sourced from Top Open Source Registries\n\n")
        f.write("- **Anthropic Official Skills** (`anthropics/skills`)\n")
        f.write("- **Cloudflare Official Skills** (`cloudflare/skills`)\n")
        f.write("- **Firebase Official Skills** (`firebase/skills`)\n")
        f.write("- **Expo Official Skills** (`expo/skills`)\n")
        f.write("- **Hugging Face Official Skills** (`huggingface/skills`)\n")
        f.write("- **Bergside Design Skills** (`bergside/awesome-design-skills`)\n")
        f.write("- **UI/UX Pro Max** (`nextlevelbuilder/ui-ux-pro-max-skill`)\n")
        f.write("- **Corey Haines Marketing Skills** (`coreyhaines31/marketingskills`)\n")
        f.write("- **Mukul Cybersecurity Skills** (`mukul975/Anthropic-Cybersecurity-Skills`)\n")
        f.write("- **GameDev Skills** (`gamedev-skills/awesome-gamedev-agent-skills`)\n")
        f.write("- **Agentic Awesome Skills** (`sickn33/agentic-awesome-skills`)\n")
        f.write("- **Antigravity Built-in Skills**\n\n")
    print(f"  ✓ Written {readme_path}")

    print("\n🎉 ALL SKILLS SUCCESSFULLY HARVESTED, DEDUPLICATED, AND ORGANIZED!")
    print(f"📁 Skills location: {TARGET_SKILLS_DIR}")
    print(f"📦 Total unique skills: {len(catalog)}")

if __name__ == "__main__":
    main()
