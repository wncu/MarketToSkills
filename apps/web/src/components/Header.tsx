import React from 'react';
import { 
  Search, 
  Layers, 
  Bot, 
  User, 
  Command,
  SlidersHorizontal
} from 'lucide-react';

interface HeaderProps {
  viewMode: 'human' | 'agent';
  setViewMode: (mode: 'human' | 'agent') => void;
  selectedSkillsCount: number;
  onOpenStack: () => void;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  totalSkills: number;
}

export const Header: React.FC<HeaderProps> = ({
  viewMode,
  setViewMode,
  selectedSkillsCount,
  onOpenStack,
  searchQuery,
  setSearchQuery,
  totalSkills,
}) => {
  return (
    <header className="sticky top-0 z-40 w-full h-[53px] border-b border-[#1f2226] bg-[#0b0c0d]/95 backdrop-blur px-4 sm:px-6 flex items-center justify-between gap-4">
      
      {/* Minimal Wordmark & Version */}
      <div className="flex items-center gap-2.5 shrink-0">
        <div 
          onClick={() => setViewMode('human')}
          className="cursor-pointer flex items-center gap-2"
        >
          <span className="font-semibold tracking-tight text-sm text-[#faf8f5]">
            MarketToSkills
          </span>
          <span className="text-[10px] font-mono text-[#787f87] px-1.5 py-0.5 rounded bg-[#141619] border border-[#23272c]">
            v1.0
          </span>
        </div>
      </div>

      {/* Centered Global Search */}
      <div className="flex-1 max-w-lg mx-auto relative hidden md:block">
        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-[#5e646b]">
          <Search className="w-3.5 h-3.5" />
        </div>
        <input
          type="text"
          placeholder="Search 3,214 agent skills, frameworks, playbooks..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full pl-8 pr-12 py-1.5 bg-[#121417] border border-[#22252a] hover:border-[#2e333a] focus:border-[#3d434d] rounded-md text-xs text-[#edece6] placeholder-[#575c63] focus:outline-none transition-colors"
        />
        <div className="absolute inset-y-0 right-0 pr-2.5 flex items-center pointer-events-none">
          <kbd className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] font-mono text-[#575c63] bg-[#16181b] border border-[#23272c] rounded">
            ⌘K
          </kbd>
        </div>
      </div>

      {/* Controls: Human View, PRO Agents, Stack, Account */}
      <div className="flex items-center gap-3 shrink-0">
        
        {/* Mode Toggle */}
        <div className="flex items-center p-0.5 rounded-md bg-[#131518] border border-[#202327]">
          <button
            onClick={() => setViewMode('human')}
            className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
              viewMode === 'human'
                ? 'bg-[#1f2227] text-[#faf8f5] shadow-sm'
                : 'text-[#7e858d] hover:text-[#d3d2cb]'
            }`}
          >
            Human View
          </button>
          <button
            onClick={() => setViewMode('agent')}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium transition-colors ${
              viewMode === 'agent'
                ? 'bg-[#1f2227] text-[#faf8f5] shadow-sm'
                : 'text-[#7e858d] hover:text-[#d3d2cb]'
            }`}
          >
            <span>PRO Agents</span>
            <span className="w-1.5 h-1.5 rounded-full bg-[#a88d5e]" />
          </button>
        </div>

        {/* Stack Counter / Drawer Trigger */}
        <button
          onClick={onOpenStack}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border transition-colors ${
            selectedSkillsCount > 0
              ? 'bg-[#181a1d] text-[#e8cda2] border-[#a88d5e]/50'
              : 'bg-[#121417] text-[#868d95] border-[#22252a] hover:border-[#2f333a] hover:text-[#edece6]'
          }`}
        >
          <Layers className="w-3.5 h-3.5" />
          <span>Stack</span>
          {selectedSkillsCount > 0 && (
            <span className="ml-0.5 px-1.5 py-0.2 rounded-full text-[10px] font-mono font-bold bg-[#a88d5e] text-[#0b0c0d]">
              {selectedSkillsCount}
            </span>
          )}
        </button>

        {/* Minimal Account Control */}
        <div className="w-7 h-7 rounded-full bg-[#181b1f] border border-[#262a30] flex items-center justify-center text-[11px] font-mono text-[#a5abb1] hover:border-[#3a4049] cursor-pointer" title="User Profile / Settings">
          L
        </div>

      </div>

    </header>
  );
};
