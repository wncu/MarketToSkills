use axum::{
    extract::{Path, Query, State},
    http::{header, HeaderMap, HeaderValue, StatusCode},
    response::IntoResponse,
    routing::get,
    Json, Router,
};
use flate2::write::GzEncoder;
use flate2::Compression;
use serde::{Deserialize, Serialize};
use std::{
    collections::HashMap,
    fs,
    path::PathBuf,
    sync::Arc,
};
use tower_http::cors::{Any, CorsLayer};
use tracing::info;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Category {
    pub id: String,
    pub label: String,
    pub icon: String,
    pub description: String,
    pub count: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Skill {
    pub id: String,
    pub name: String,
    pub description: String,
    pub category: String,
    pub category_label: String,
    pub category_icon: String,
    pub source: String,
    pub path: String,
    pub folder: String,
    pub files: Vec<String>,
    pub size_bytes: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CatalogData {
    pub version: String,
    pub total_skills: usize,
    pub generated_at: String,
    pub categories: Vec<Category>,
    pub skills: Vec<Skill>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SkillDetail {
    #[serde(flatten)]
    pub skill: Skill,
    pub content: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Bundle {
    pub id: String,
    pub name: String,
    pub icon: String,
    pub description: String,
    pub target_role: String,
    pub skill_ids: Vec<String>,
}

#[derive(Debug, Clone)]
pub struct AppState {
    pub skills_dir: PathBuf,
    pub catalog: CatalogData,
    pub skill_map: HashMap<String, Skill>,
    pub bundles: Vec<Bundle>,
    pub llms_txt: String,
}

#[derive(Debug, Deserialize)]
pub struct SkillsQuery {
    pub category: Option<String>,
    pub search: Option<String>,
    pub source: Option<String>,
    pub limit: Option<usize>,
    pub offset: Option<usize>,
}

#[derive(Debug, Serialize)]
pub struct SkillsListResponse {
    pub total: usize,
    pub limit: usize,
    pub offset: usize,
    pub skills: Vec<Skill>,
}

#[derive(Debug, Deserialize)]
pub struct AgentInstallQuery {
    pub skills: Option<String>,
    pub target: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct RecommendQuery {
    pub query: String,
}

#[derive(Debug, Serialize)]
pub struct RecommendResponse {
    pub query: String,
    pub recommended_skills: Vec<Skill>,
}

fn locate_skills_dir() -> PathBuf {
    let candidates = [
        PathBuf::from("skills"),
        PathBuf::from("../../skills"),
        PathBuf::from("../skills"),
        PathBuf::from("/home/l/Escritorio/MarketToSkills/skills"),
    ];

    for c in &candidates {
        if c.join("catalog.json").exists() {
            return c.canonicalize().unwrap_or_else(|_| c.clone());
        }
    }

    PathBuf::from("/home/l/Escritorio/MarketToSkills/skills")
}

fn init_bundles() -> Vec<Bundle> {
    vec![
        Bundle {
            id: "fullstack-modern".to_string(),
            name: "Modern Fullstack Engineer".to_string(),
            icon: "🚀".to_string(),
            description: "React, Tailwind, Node.js backend patterns, REST/GraphQL APIs, and PostgreSQL.".to_string(),
            target_role: "Fullstack Developer".to_string(),
            skill_ids: vec![
                "senior-frontend".to_string(),
                "react-ui-patterns".to_string(),
                "tailwindcss".to_string(),
                "nodejs-backend-patterns".to_string(),
                "api-designer".to_string(),
                "postgres-pro".to_string(),
            ],
        },
        Bundle {
            id: "mobile-master".to_string(),
            name: "Mobile Master (Flutter & Native)".to_string(),
            icon: "📱".to_string(),
            description: "Production-ready Flutter & Dart, Expo Router, SwiftUI UI patterns, and APK security audit.".to_string(),
            target_role: "Mobile App Developer".to_string(),
            skill_ids: vec![
                "flutter-expert".to_string(),
                "flutter-apk-security".to_string(),
                "expo-router".to_string(),
                "swiftui-ui-patterns".to_string(),
                "mobile-developer".to_string(),
            ],
        },
        Bundle {
            id: "cloud-devops-ninja".to_string(),
            name: "Cloud & DevOps Architecture".to_string(),
            icon: "☁️".to_string(),
            description: "AWS CDK/CLI/SST, Docker, Terraform modules, Cloudflare Workers, and CI/CD pipelines.".to_string(),
            target_role: "DevOps / SRE Engineer".to_string(),
            skill_ids: vec![
                "aws-cdk-development".to_string(),
                "aws-serverless".to_string(),
                "terraform-aws-modules".to_string(),
                "docker-expert".to_string(),
                "cloudflare-workers".to_string(),
                "observability-monitoring-monitor-setup".to_string(),
            ],
        },
        Bundle {
            id: "agentic-ai-builder".to_string(),
            name: "Agentic AI & MCP Architect".to_string(),
            icon: "🤖".to_string(),
            description: "MCP Server Builder, Prompt Engineering, RAG architectures, and autonomous agent orchestration.".to_string(),
            target_role: "AI Systems Engineer".to_string(),
            skill_ids: vec![
                "mcp-builder".to_string(),
                "prompt-engineering".to_string(),
                "claude-api".to_string(),
                "mesh-memory".to_string(),
                "vector-database-engineer".to_string(),
                "eval-harness".to_string(),
            ],
        },
        Bundle {
            id: "design-systems-pro".to_string(),
            name: "Design Systems & UI/UX Pro Max".to_string(),
            icon: "🎨".to_string(),
            description: "Bento layouts, Neubrutalism, Anti-UI-Slop guidelines, responsive micro-interactions, and visual harmony.".to_string(),
            target_role: "UI/UX & Design Engineer".to_string(),
            skill_ids: vec![
                "ui-styling".to_string(),
                "bento".to_string(),
                "brutalist".to_string(),
                "anti-ui-slop".to_string(),
                "theme-factory".to_string(),
                "minimal".to_string(),
            ],
        },
        Bundle {
            id: "cybersecurity-shield".to_string(),
            name: "Cybersecurity & OWASP Hardening".to_string(),
            icon: "🛡️".to_string(),
            description: "Web penetration testing, API vulnerability scanning, Better Auth, and SLSA provenance verification.".to_string(),
            target_role: "Security Analyst / Auditor".to_string(),
            skill_ids: vec![
                "web-security-testing".to_string(),
                "api-security-testing".to_string(),
                "owasp-threat-modeling".to_string(),
                "verifying-build-provenance-with-slsa-sigstore".to_string(),
                "client-secret-exposure-audit".to_string(),
            ],
        },
    ]
}

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt()
        .with_env_filter("info,markettoskills_api=debug")
        .init();

    let skills_dir = locate_skills_dir();
    info!("Using skills directory: {:?}", skills_dir);

    let catalog_path = skills_dir.join("catalog.json");
    let catalog_content = fs::read_to_string(&catalog_path)
        .unwrap_or_else(|e| panic!("Failed to read catalog.json at {:?}: {}", catalog_path, e));

    let catalog: CatalogData = serde_json::from_str(&catalog_content)
        .expect("Failed to parse catalog.json");

    info!(
        "Loaded catalog version {} with {} skills across {} categories",
        catalog.version,
        catalog.total_skills,
        catalog.categories.len()
    );

    let mut skill_map = HashMap::new();
    for s in &catalog.skills {
        skill_map.insert(s.id.clone(), s.clone());
    }

    let llms_txt_path = skills_dir.join("llms.txt");
    let llms_txt = fs::read_to_string(&llms_txt_path)
        .unwrap_or_else(|_| "# MarketToSkills Agent Registry".to_string());

    let bundles = init_bundles();

    let state = Arc::new(AppState {
        skills_dir,
        catalog,
        skill_map,
        bundles,
        llms_txt,
    });

    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    let app = Router::new()
        .route("/health", get(health_check))
        .route("/llms.txt", get(get_llms_txt))
        .route("/api/categories", get(get_categories))
        .route("/api/skills", get(list_skills))
        .route("/api/skills/:category/:id", get(get_skill_detail))
        .route("/api/skills/raw/:category/:id", get(get_skill_raw_md))
        .route("/api/skills/download/:category/:id", get(download_skill_tar))
        .route("/api/bundles", get(get_bundles))
        .route("/api/agent/manifest", get(get_agent_manifest))
        .route("/api/agent/recommend", get(recommend_skills))
        .route("/api/agent/install", get(generate_agent_installer))
        .layer(cors)
        .with_state(state);

    let port = std::env::var("PORT").unwrap_or_else(|_| "9001".to_string());
    let addr = format!("0.0.0.0:{}", port);
    info!("Server listening on http://{}", addr);

    let listener = tokio::net::TcpListener::bind(&addr)
        .await
        .unwrap_or_else(|e| panic!("Failed to bind to {}: {}", addr, e));

    axum::serve(listener, app)
        .await
        .expect("Failed to run Axum server");
}

async fn health_check(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    Json(serde_json::json!({
        "status": "ok",
        "service": "MarketToSkills API",
        "version": state.catalog.version,
        "skills_count": state.catalog.total_skills,
        "categories_count": state.catalog.categories.len(),
    }))
}

async fn get_llms_txt(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    let mut headers = HeaderMap::new();
    headers.insert(header::CONTENT_TYPE, HeaderValue::from_static("text/plain; charset=utf-8"));
    (headers, state.llms_txt.clone())
}

async fn get_categories(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    Json(state.catalog.categories.clone())
}

async fn list_skills(
    Query(params): Query<SkillsQuery>,
    State(state): State<Arc<AppState>>,
) -> impl IntoResponse {
    let limit = params.limit.unwrap_or(50).min(500);
    let offset = params.offset.unwrap_or(0);

    let mut filtered: Vec<&Skill> = state.catalog.skills.iter().collect();

    if let Some(cat) = &params.category {
        if !cat.is_empty() && cat != "all" {
            filtered.retain(|s| s.category.eq_ignore_ascii_case(cat));
        }
    }

    if let Some(src) = &params.source {
        if !src.is_empty() {
            filtered.retain(|s| s.source.to_lowercase().contains(&src.to_lowercase()));
        }
    }

    if let Some(q) = &params.search {
        let q_clean = q.trim().to_lowercase();
        if !q_clean.is_empty() {
            filtered.retain(|s| {
                s.id.to_lowercase().contains(&q_clean)
                    || s.name.to_lowercase().contains(&q_clean)
                    || s.description.to_lowercase().contains(&q_clean)
                    || s.category.to_lowercase().contains(&q_clean)
            });
        }
    }

    let total = filtered.len();
    let paged = filtered
        .into_iter()
        .skip(offset)
        .take(limit)
        .cloned()
        .collect();

    Json(SkillsListResponse {
        total,
        limit,
        offset,
        skills: paged,
    })
}

async fn get_skill_detail(
    Path((category, id)): Path<(String, String)>,
    State(state): State<Arc<AppState>>,
) -> Result<Json<SkillDetail>, (StatusCode, String)> {
    let skill = state
        .skill_map
        .get(&id)
        .or_else(|| {
            state.catalog.skills.iter().find(|s| {
                s.category.eq_ignore_ascii_case(&category) && s.id.eq_ignore_ascii_case(&id)
            })
        })
        .cloned()
        .ok_or_else(|| (StatusCode::NOT_FOUND, format!("Skill '{}' not found", id)))?;

    let file_path = state.skills_dir.join(&skill.category).join(&skill.id).join("SKILL.md");
    let content = fs::read_to_string(&file_path).unwrap_or_else(|_| {
        format!("# {}\n\n{}", skill.name, skill.description)
    });

    Ok(Json(SkillDetail { skill, content }))
}

async fn get_skill_raw_md(
    Path((category, id)): Path<(String, String)>,
    State(state): State<Arc<AppState>>,
) -> impl IntoResponse {
    let file_path = state.skills_dir.join(&category).join(&id).join("SKILL.md");
    match fs::read_to_string(&file_path) {
        Ok(content) => {
            let mut headers = HeaderMap::new();
            headers.insert(header::CONTENT_TYPE, HeaderValue::from_static("text/markdown; charset=utf-8"));
            (StatusCode::OK, headers, content).into_response()
        }
        Err(_) => (StatusCode::NOT_FOUND, "SKILL.md not found").into_response(),
    }
}

async fn download_skill_tar(
    Path((category, id)): Path<(String, String)>,
    State(state): State<Arc<AppState>>,
) -> impl IntoResponse {
    let folder_path = state.skills_dir.join(&category).join(&id);
    if !folder_path.exists() {
        return (StatusCode::NOT_FOUND, "Skill folder not found").into_response();
    }

    let mut enc = GzEncoder::new(Vec::new(), Compression::default());
    {
        let mut tar_builder = tar::Builder::new(&mut enc);
        if let Err(e) = tar_builder.append_dir_all(&id, &folder_path) {
            return (StatusCode::INTERNAL_SERVER_ERROR, format!("Failed to archive: {}", e)).into_response();
        }
        if let Err(e) = tar_builder.finish() {
            return (StatusCode::INTERNAL_SERVER_ERROR, format!("Failed to complete archive: {}", e)).into_response();
        }
    }

    match enc.finish() {
        Ok(bytes) => {
            let mut headers = HeaderMap::new();
            headers.insert(header::CONTENT_TYPE, HeaderValue::from_static("application/gzip"));
            let filename = format!("attachment; filename=\"{}.tar.gz\"", id);
            if let Ok(val) = HeaderValue::from_str(&filename) {
                headers.insert(header::CONTENT_DISPOSITION, val);
            }
            (StatusCode::OK, headers, bytes).into_response()
        }
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, format!("Compression error: {}", e)).into_response(),
    }
}

async fn get_bundles(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    Json(state.bundles.clone())
}

async fn get_agent_manifest(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    let mut headers = HeaderMap::new();
    headers.insert(header::CONTENT_TYPE, HeaderValue::from_static("text/plain; charset=utf-8"));

    let mut out = String::new();
    out.push_str("================================================================================\n");
    out.push_str("🤖 MARKET TO SKILLS - AGENT AUTONOMOUS CONTROL & DISCOVERY PROTOCOL\n");
    out.push_str("================================================================================\n\n");
    out.push_str(&format!("Registry Version: {}\n", state.catalog.version));
    out.push_str(&format!("Total Skills: {}\n", state.catalog.total_skills));
    out.push_str("Standard: agentskills.io (SKILL.md standard specification)\n");
    out.push_str("Compatible Agents: Antigravity, Claude Code, Cursor, Codex, Gemini CLI\n\n");
    out.push_str("--------------------------------------------------------------------------------\n");
    out.push_str("⚡ AGENT USAGE & EXECUTION MODES\n");
    out.push_str("--------------------------------------------------------------------------------\n\n");
    out.push_str("1. DIRECT WORKSPACE READ (Zero Overhead):\n");
    out.push_str("   If this repository is cloned in your workspace, simply read any skill with:\n");
    out.push_str("   view_file(AbsolutePath='<workspace>/skills/<category>/<skill-id>/SKILL.md')\n\n");
    out.push_str("2. DIRECT HTTP INSTALL VIA 1-LINER:\n");
    out.push_str("   Run in terminal:\n");
    out.push_str("   curl -s \"http://localhost:9001/api/agent/install?skills=<skill-1>,<skill-2>&target=gemini\" | bash\n\n");
    out.push_str("3. SEARCH / RECOMMEND API:\n");
    out.push_str("   GET /api/agent/recommend?query=your+project+needs\n\n");
    out.push_str("--------------------------------------------------------------------------------\n");
    out.push_str("CATEGORIES & COUNTS:\n");
    out.push_str("--------------------------------------------------------------------------------\n\n");
    for cat in &state.catalog.categories {
        out.push_str(&format!("{} [{}] ({}) -> {}\n", cat.icon, cat.id, cat.count, cat.description));
    }

    (headers, out)
}

async fn recommend_skills(
    Query(params): Query<RecommendQuery>,
    State(state): State<Arc<AppState>>,
) -> impl IntoResponse {
    let q = params.query.to_lowercase();
    let terms: Vec<&str> = q.split_whitespace().collect();

    let mut scored: Vec<(&Skill, usize)> = Vec::new();

    for skill in &state.catalog.skills {
        let mut score = 0;

        for term in &terms {
            if term.len() < 3 {
                continue;
            }
            if skill.id.contains(term) {
                score += 10;
            }
            if skill.name.to_lowercase().contains(term) {
                score += 8;
            }
            if skill.category.to_lowercase().contains(term) {
                score += 5;
            }
            if skill.description.to_lowercase().contains(term) {
                score += 2;
            }
        }

        if score > 0 {
            scored.push((skill, score));
        }
    }

    scored.sort_by(|a, b| b.1.cmp(&a.1));
    let recommended: Vec<Skill> = scored.into_iter().take(12).map(|(s, _)| s.clone()).collect();

    Json(RecommendResponse {
        query: params.query,
        recommended_skills: recommended,
    })
}

async fn generate_agent_installer(
    Query(params): Query<AgentInstallQuery>,
    State(state): State<Arc<AppState>>,
) -> impl IntoResponse {
    let skills_str = params.skills.unwrap_or_default();
    let target = params.target.unwrap_or_else(|| "gemini".to_string()).to_lowercase();

    let requested_ids: Vec<&str> = skills_str
        .split(',')
        .map(|s| s.trim())
        .filter(|s| !s.is_empty())
        .collect();

    let mut script = String::new();
    script.push_str("#!/usr/bin/env bash\n");
    script.push_str("# Auto-generated MarketToSkills Installer for AI Agents\n");
    script.push_str("set -euo pipefail\n\n");

    let dest_dir = match target.as_str() {
        "claude" => "\"${HOME}/.claude/skills\"",
        "cursor" => "\".cursor/rules\"",
        "local" => "\"./skills\"",
        _ => "\"${HOME}/.gemini/antigravity-cli/custom/skills\"",
    };

    script.push_str(&format!("TARGET_DIR={}\n", dest_dir));
    script.push_str("echo \"🎯 [MarketToSkills] Installing skills into: ${TARGET_DIR}\"\n");
    script.push_str("mkdir -p \"${TARGET_DIR}\"\n\n");

    for id in requested_ids {
        if let Some(skill) = state.skill_map.get(id) {
            script.push_str(&format!("echo \"📦 Installing skill: {} ({})\"\n", skill.name, skill.id));
            script.push_str(&format!("mkdir -p \"${{TARGET_DIR}}/{}\"\n", skill.id));
            script.push_str(&format!(
                "curl -fsSL \"http://localhost:9001/api/skills/raw/{}/{}\" > \"${{TARGET_DIR}}/{}/SKILL.md\"\n",
                skill.category, skill.id, skill.id
            ));
            script.push_str(&format!("echo \"  ✓ Installed {}\"\n\n", skill.id));
        } else {
            script.push_str(&format!("echo \"⚠️ Warning: Skill '{}' not found in registry\"\n", id));
        }
    }

    script.push_str("echo \"🎉 Installation completed successfully! Your agent can now use these skills.\"\n");

    let mut headers = HeaderMap::new();
    headers.insert(header::CONTENT_TYPE, HeaderValue::from_static("text/x-shellscript; charset=utf-8"));
    (headers, script)
}
