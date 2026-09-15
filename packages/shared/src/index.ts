export interface Skill {
  id: string;
  name: string;
  description: string;
  category: string;
  category_label: string;
  category_icon: string;
  source: string;
  path: string;
  folder: string;
  files: string[];
  size_bytes: number;
}

export interface Category {
  id: string;
  label: string;
  icon: string;
  description: string;
  count: number;
}

export interface SkillDetail extends Skill {
  content: string;
}

export interface CatalogResponse {
  version: string;
  total_skills: number;
  generated_at: string;
  categories: Category[];
  skills: Skill[];
}

export interface SkillsQuery {
  category?: string;
  search?: string;
  limit?: number;
  offset?: number;
  source?: string;
}

export interface SkillsListResponse {
  total: number;
  limit: number;
  offset: number;
  skills: Skill[];
}

export interface SkillBundle {
  id: string;
  name: string;
  icon: string;
  description: string;
  skill_ids: string[];
  target_role: string;
}

export interface AgentInstallRequest {
  skills: string[];
  target?: 'gemini' | 'claude' | 'cursor' | 'local';
}
