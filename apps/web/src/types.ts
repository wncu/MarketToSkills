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

export interface Bundle {
  id: string;
  name: string;
  icon: string;
  description: string;
  target_role: string;
  skill_ids: string[];
}

export interface SkillsListResponse {
  total: number;
  limit: number;
  offset: number;
  skills: Skill[];
}
