import { Category, Skill, SkillDetail, Bundle, SkillsListResponse } from './types';

const API_BASE = '/api';
let cachedCatalog: Skill[] | null = null;

async function getStaticCatalog(): Promise<Skill[]> {
  if (cachedCatalog) return cachedCatalog;
  try {
    const res = await fetch('/catalog.json');
    if (res.ok) {
      const data = await res.json();
      cachedCatalog = data.map((item: any) => {
        const cat = item.category || 'general';
        const slug = item.slug || item.id?.split('/')[1] || item.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
        return {
          id: item.id || `${cat}/${slug}`,
          name: item.name,
          description: item.description || '',
          category: cat,
          category_label: cat.replace(/-/g, ' ').toUpperCase(),
          category_icon: 'Layers',
          source: 'MarketToSkills Registry',
          path: item.path || `skills/${cat}/${slug}`,
          folder: slug,
          files: ['SKILL.md'],
          size_bytes: 4096,
        };
      });
      return cachedCatalog!;
    }
  } catch (e) {
    console.warn('Fallback catalog failed', e);
  }
  return [];
}

export async function fetchCategories(): Promise<Category[]> {
  try {
    const res = await fetch(`${API_BASE}/categories`);
    if (res.ok) return await res.json();
  } catch (e) {
    // continue to fallback
  }

  try {
    const res = await fetch('/categories.json');
    if (res.ok) {
      const data = await res.json();
      return data.map((c: any) => ({
        id: c.id,
        label: c.name || c.label || c.id,
        icon: 'Layers',
        description: `Verified ${c.name || c.id} skills for autonomous agents`,
        count: c.count || 0,
      }));
    }
  } catch (e) {
    console.warn('Fallback categories failed', e);
  }

  return [];
}

export async function fetchSkills(params: {
  category?: string;
  search?: string;
  source?: string;
  limit?: number;
  offset?: number;
}): Promise<SkillsListResponse> {
  const limit = params.limit || 48;
  const offset = params.offset || 0;

  try {
    const query = new URLSearchParams();
    if (params.category && params.category !== 'all') query.set('category', params.category);
    if (params.search) query.set('search', params.search);
    if (params.source) query.set('source', params.source);
    query.set('limit', limit.toString());
    query.set('offset', offset.toString());

    const res = await fetch(`${API_BASE}/skills?${query.toString()}`);
    if (res.ok) return await res.json();
  } catch (e) {
    // continue to fallback
  }

  const catalog = await getStaticCatalog();
  let filtered = catalog;

  if (params.category && params.category !== 'all') {
    filtered = filtered.filter(s => s.category === params.category);
  }

  if (params.search) {
    const q = params.search.toLowerCase();
    filtered = filtered.filter(
      s =>
        s.name.toLowerCase().includes(q) ||
        s.description.toLowerCase().includes(q) ||
        s.category.toLowerCase().includes(q)
    );
  }

  const paged = filtered.slice(offset, offset + limit);
  return {
    skills: paged,
    total: filtered.length,
    offset,
    limit,
  };
}

export async function fetchSkillDetail(category: string, id: string): Promise<SkillDetail> {
  try {
    const res = await fetch(`${API_BASE}/skills/${category}/${id}`);
    if (res.ok) return await res.json();
  } catch (e) {
    // continue to fallback
  }

  const catalog = await getStaticCatalog();
  const found = catalog.find(s => s.id === `${category}/${id}` || s.folder === id);

  const baseSkill: Skill = found || {
    id: `${category}/${id}`,
    name: id.replace(/-/g, ' ').toUpperCase(),
    description: 'Curated agent skill with high-performance instructions.',
    category,
    category_label: category.toUpperCase(),
    category_icon: 'Layers',
    source: 'MarketToSkills Registry',
    path: `skills/${category}/${id}`,
    folder: id,
    files: ['SKILL.md'],
    size_bytes: 4096,
  };

  return {
    ...baseSkill,
    content: `---
name: ${baseSkill.name}
category: ${category}
---

# ${baseSkill.name}

${baseSkill.description}

## Usage
\`\`\`bash
# Fast install via MarketToSkills
curl -sSL https://markettoskills.com/api/agent/install?skills=${category}/${id} | sh
\`\`\`
`,
  };
}

export async function fetchBundles(): Promise<Bundle[]> {
  try {
    const res = await fetch(`${API_BASE}/bundles`);
    if (res.ok) return await res.json();
  } catch (e) {}

  return [
    {
      id: 'fullstack-starter',
      name: 'Full-Stack Agent Stack',
      icon: 'Layers',
      description: 'Essential skills for React, TypeScript, Rust and database design.',
      target_role: 'Full-Stack Developer',
      skill_ids: ['react-patterns', 'typescript-strict', 'axum-api', 'sql-optimizer'],
    },
    {
      id: 'ai-native-suite',
      name: 'AI & Prompt Architecture',
      icon: 'Bot',
      description: 'Prompt engineering, eval suites, RAG optimization and guardrails.',
      target_role: 'AI Engineer',
      skill_ids: ['rag-orchestrator', 'prompt-optimizer', 'llm-evaluator'],
    },
    {
      id: 'production-devops',
      name: 'Production DevOps & Cloud',
      icon: 'Terminal',
      description: 'Docker, Kubernetes, Terraform and CI/CD pipelines for agents.',
      target_role: 'DevOps & SRE',
      skill_ids: ['docker-builder', 'k8s-manifests', 'github-actions-ci'],
    },
  ];
}

export async function fetchAgentManifest(): Promise<string> {
  try {
    const res = await fetch('/api/agent/manifest');
    if (res.ok) return await res.text();
  } catch (e) {}

  try {
    const res = await fetch('/llms.txt');
    if (res.ok) return await res.text();
  } catch (e) {}

  return '# MarketToSkills Agent Registry Manifest\nAll 3,214 skills available via /catalog.json';
}

export async function fetchLLMsTxt(): Promise<string> {
  try {
    const res = await fetch('/llms.txt');
    if (res.ok) return await res.text();
  } catch (e) {}

  return '# MarketToSkills — llms.txt';
}

export async function fetchRecommendations(query: string): Promise<{ recommended_skills: Skill[] }> {
  try {
    const res = await fetch(`${API_BASE}/agent/recommend?query=${encodeURIComponent(query)}`);
    if (res.ok) return await res.json();
  } catch (e) {}

  const catalog = await getStaticCatalog();
  const q = query.toLowerCase();
  const matches = catalog
    .filter(s => s.name.toLowerCase().includes(q) || s.description.toLowerCase().includes(q))
    .slice(0, 5);

  return {
    recommended_skills: matches.length > 0 ? matches : catalog.slice(0, 5),
  };
}

export function getAgentInstallUrl(skills: string[], target: string = 'gemini'): string {
  return `${window.location.origin}/api/agent/install?skills=${skills.join(',')}&target=${target}`;
}
