import { Category, Skill, SkillDetail, Bundle, SkillsListResponse } from './types';

const API_BASE = '/api';

export async function fetchCategories(): Promise<Category[]> {
  const res = await fetch(`${API_BASE}/categories`);
  if (!res.ok) throw new Error('Failed to fetch categories');
  return res.json();
}

export async function fetchSkills(params: {
  category?: string;
  search?: string;
  source?: string;
  limit?: number;
  offset?: number;
}): Promise<SkillsListResponse> {
  const query = new URLSearchParams();
  if (params.category && params.category !== 'all') query.set('category', params.category);
  if (params.search) query.set('search', params.search);
  if (params.source) query.set('source', params.source);
  if (params.limit) query.set('limit', params.limit.toString());
  if (params.offset) query.set('offset', params.offset.toString());

  const res = await fetch(`${API_BASE}/skills?${query.toString()}`);
  if (!res.ok) throw new Error('Failed to fetch skills');
  return res.json();
}

export async function fetchSkillDetail(category: string, id: string): Promise<SkillDetail> {
  const res = await fetch(`${API_BASE}/skills/${category}/${id}`);
  if (!res.ok) throw new Error(`Failed to fetch skill ${id}`);
  return res.json();
}

export async function fetchBundles(): Promise<Bundle[]> {
  const res = await fetch(`${API_BASE}/bundles`);
  if (!res.ok) throw new Error('Failed to fetch bundles');
  return res.json();
}

export async function fetchAgentManifest(): Promise<string> {
  const res = await fetch('/api/agent/manifest');
  if (!res.ok) throw new Error('Failed to fetch agent manifest');
  return res.text();
}

export async function fetchLLMsTxt(): Promise<string> {
  const res = await fetch('/llms.txt');
  if (!res.ok) throw new Error('Failed to fetch llms.txt');
  return res.text();
}

export async function fetchRecommendations(query: string): Promise<{ recommended_skills: Skill[] }> {
  const res = await fetch(`${API_BASE}/agent/recommend?query=${encodeURIComponent(query)}`);
  if (!res.ok) throw new Error('Failed to fetch recommendations');
  return res.json();
}

export function getAgentInstallUrl(skills: string[], target: string = 'gemini'): string {
  return `${window.location.origin}/api/agent/install?skills=${skills.join(',')}&target=${target}`;
}
