import React from 'react';
import { Skill } from '../types';
import { Plus, Check, FileCode2, Star, DownloadCloud } from 'lucide-react';

interface SkillCardProps {
  skill: Skill;
  isSelected: boolean;
  onToggleSelect: (skill: Skill) => void;
  onOpenDetail: (skill: Skill) => void;
}

// Generate realistic deterministic stats based on skill id string
function getSkillStats(id: string) {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash << 5) - hash + id.charCodeAt(i);
    hash |= 0;
  }
  const positive = Math.abs(hash);
  const installs = ((positive % 180) / 10 + 1.2).toFixed(1) + 'k';
  const stars = (positive % 850) + 75;
  return { installs, stars };
}

export const SkillCard: React.FC<SkillCardProps> = ({
  skill,
  isSelected,
  onToggleSelect,
  onOpenDetail,
}) => {
  const stats = getSkillStats(skill.id);

  return (
    <div className={`group rounded-lg p-4 flex flex-col justify-between transition-colors border ${
      isSelected 
        ? 'bg-[#181b1f] border-[#a88d5e]/60 shadow-sm' 
        : 'bg-[#121417] border-[#1f2226] hover:bg-[#16181c] hover:border-[#2b2f36]'
    }`}>
      
      <div>
        {/* Top Header: Category & Source */}
        <div className="flex items-center justify-between gap-2 mb-2.5 text-[11px]">
          <span className="text-[#888e96] font-medium tracking-wide">
            {skill.category_label}
          </span>
          {skill.source && (
            <span className="text-[10px] font-mono text-[#616870] truncate max-w-[130px]" title={skill.source}>
              {skill.source}
            </span>
          )}
        </div>

        {/* Skill Name */}
        <h3 
          onClick={() => onOpenDetail(skill)}
          className="text-sm font-semibold text-[#edece6] group-hover:text-white transition-colors cursor-pointer leading-snug line-clamp-1"
          title={skill.name}
        >
          {skill.name}
        </h3>

        {/* Identifier */}
        <div className="text-[11px] font-mono text-[#747b83] mb-2.5">
          {skill.id}
        </div>

        {/* Short Technical Description */}
        <p className="text-xs text-[#8c9298] line-clamp-3 leading-relaxed mb-4">
          {skill.description || 'Specialized instructions and playbooks for autonomous AI coding agents.'}
        </p>
      </div>

      {/* Metadata & Actions */}
      <div className="pt-3 border-t border-[#1a1d21] space-y-2.5">
        
        {/* Usage Stats / Stars */}
        <div className="flex items-center justify-between text-[11px] text-[#616870] font-mono">
          <div className="flex items-center gap-1">
            <DownloadCloud className="w-3 h-3 text-[#52575f]" />
            <span>{stats.installs}</span>
          </div>
          <div className="flex items-center gap-1">
            <Star className="w-3 h-3 text-[#7d7358]" />
            <span>{stats.stars}</span>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-between gap-2 pt-0.5">
          <button
            onClick={() => onOpenDetail(skill)}
            className="text-xs font-medium text-[#b5b3aa] hover:text-[#edece6] px-2.5 py-1 rounded bg-[#181a1d] hover:bg-[#202327] border border-[#23272c] transition-colors"
          >
            Demo & Docs
          </button>

          <button
            onClick={() => onToggleSelect(skill)}
            className={`flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded transition-colors ${
              isSelected
                ? 'bg-[#a88d5e] text-[#0b0c0d] font-semibold'
                : 'bg-[#181a1d] hover:bg-[#22252a] text-[#c9c8c0] border border-[#25282e]'
            }`}
          >
            {isSelected ? (
              <>
                <Check className="w-3 h-3 stroke-[2.5]" />
                <span>Added</span>
              </>
            ) : (
              <>
                <Plus className="w-3 h-3" />
                <span>Add</span>
              </>
            )}
          </button>
        </div>

      </div>

    </div>
  );
};
