import React from 'react';
import { 
  Home, 
  Bot, 
  Cpu, 
  Library, 
  Compass, 
  FolderGit2, 
  BookmarkCheck,
  ChevronRight
} from 'lucide-react';

interface SidebarProps {
  activeNav: string;
  setActiveNav: (nav: string) => void;
  viewMode: 'human' | 'agent';
  setViewMode: (mode: 'human' | 'agent') => void;
  onSelectCategory: (cat: string) => void;
  totalSkills: number;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeNav,
  setActiveNav,
  viewMode,
  setViewMode,
  onSelectCategory,
  totalSkills,
}) => {
  return (
    <aside className="w-56 shrink-0 hidden lg:flex flex-col justify-between border-r border-[#1f2226] bg-[#0e0f11] min-h-[calc(100vh-53px)] select-none">
      
      <div className="p-3 space-y-6">
        
        {/* Main Navigation */}
        <div className="space-y-1">
          <button
            onClick={() => {
              setActiveNav('home');
              setViewMode('human');
            }}
            className={`w-full flex items-center gap-2.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
              activeNav === 'home' && viewMode === 'human'
                ? 'bg-[#1a1d21] text-[#faf8f5] font-semibold'
                : 'text-[#8c9298] hover:text-[#edece6] hover:bg-[#141619]'
            }`}
          >
            <Home className="w-4 h-4 text-[#727880]" />
            <span>Home</span>
          </button>

          <button
            onClick={() => {
              setActiveNav('agents');
              setViewMode('agent');
            }}
            className={`w-full flex items-center justify-between px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
              viewMode === 'agent'
                ? 'bg-[#1a1d21] text-[#faf8f5] font-semibold'
                : 'text-[#8c9298] hover:text-[#edece6] hover:bg-[#141619]'
            }`}
          >
            <div className="flex items-center gap-2.5">
              <Bot className="w-4 h-4 text-[#727880]" />
              <span>Agents</span>
            </div>
            <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-[#17191d] border border-[#23272d] text-[#a88d5e]">
              PRO
            </span>
          </button>

          <button
            onClick={() => {
              setActiveNav('skills');
              setViewMode('human');
              const el = document.getElementById('marketplace-section');
              if (el) el.scrollIntoView({ behavior: 'smooth' });
            }}
            className={`w-full flex items-center gap-2.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
              activeNav === 'skills'
                ? 'bg-[#1a1d21] text-[#faf8f5] font-semibold'
                : 'text-[#8c9298] hover:text-[#edece6] hover:bg-[#141619]'
            }`}
          >
            <Cpu className="w-4 h-4 text-[#727880]" />
            <span>Skills</span>
          </button>

          <button
            onClick={() => {
              setActiveNav('catalog');
              setViewMode('human');
              onSelectCategory('all');
            }}
            className={`w-full flex items-center gap-2.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
              activeNav === 'catalog'
                ? 'bg-[#1a1d21] text-[#faf8f5] font-semibold'
                : 'text-[#8c9298] hover:text-[#edece6] hover:bg-[#141619]'
            }`}
          >
            <Library className="w-4 h-4 text-[#727880]" />
            <span>Catalog</span>
          </button>
        </div>

        {/* Secondary Navigation */}
        <div className="space-y-1">
          <span className="px-3 text-[10px] font-semibold uppercase tracking-wider text-[#575c63] block mb-1.5">
            Discover
          </span>

          <button
            onClick={() => {
              setActiveNav('explore');
              setViewMode('human');
            }}
            className={`w-full flex items-center gap-2.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
              activeNav === 'explore'
                ? 'bg-[#1a1d21] text-[#faf8f5] font-semibold'
                : 'text-[#8c9298] hover:text-[#edece6] hover:bg-[#141619]'
            }`}
          >
            <Compass className="w-4 h-4 text-[#727880]" />
            <span>Explore</span>
          </button>

          <button
            onClick={() => {
              setActiveNav('categories');
              setViewMode('human');
            }}
            className={`w-full flex items-center gap-2.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
              activeNav === 'categories'
                ? 'bg-[#1a1d21] text-[#faf8f5] font-semibold'
                : 'text-[#8c9298] hover:text-[#edece6] hover:bg-[#141619]'
            }`}
          >
            <FolderGit2 className="w-4 h-4 text-[#727880]" />
            <span>Categories</span>
          </button>

          <button
            onClick={() => {
              setActiveNav('collections');
              setViewMode('human');
            }}
            className={`w-full flex items-center gap-2.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
              activeNav === 'collections'
                ? 'bg-[#1a1d21] text-[#faf8f5] font-semibold'
                : 'text-[#8c9298] hover:text-[#edece6] hover:bg-[#141619]'
            }`}
          >
            <BookmarkCheck className="w-4 h-4 text-[#727880]" />
            <span>Collections</span>
          </button>
        </div>

      </div>

      {/* Subtle Bottom Status Indicator */}
      <div className="p-3 border-t border-[#1f2226] bg-[#0b0c0d]">
        <div className="flex items-center gap-2 px-2 py-1 text-[11px] text-[#787f87]">
          <span className="w-1.5 h-1.5 rounded-full bg-[#52825a]" />
          <span className="truncate">
            {totalSkills > 0 ? totalSkills.toLocaleString() : '3,214'} verified skills and growing
          </span>
        </div>
      </div>

    </aside>
  );
};
