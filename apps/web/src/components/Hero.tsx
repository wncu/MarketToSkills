import React from 'react';
import { ArrowRight, Terminal } from 'lucide-react';

interface HeroProps {
  onExploreAgentView: () => void;
  onExploreCatalog: () => void;
  totalSkills: number;
}

export const Hero: React.FC<HeroProps> = ({
  onExploreAgentView,
  onExploreCatalog,
  totalSkills,
}) => {
  return (
    <section className="py-7 border-b border-[#1f2226] bg-[#0c0d0f]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 items-center">
          
          {/* Left Column: Editorial Headline & Actions */}
          <div className="lg:col-span-7 space-y-3.5">
            
            <h1 className="font-serif text-3xl sm:text-4xl lg:text-[40px] font-normal tracking-tight text-[#edece6] leading-[1.18]">
              Teach Any AI Agent <br />
              <span className="italic font-normal text-[#c9b084]">Superpowers On Demand</span>
            </h1>

            <p className="text-xs sm:text-sm text-[#8c9298] max-w-xl leading-relaxed">
              MarketToSkills is an open software registry and execution layer for autonomous coding agents. Discover, preview and install 
              <span className="text-[#edece6] font-medium"> {totalSkills > 0 ? totalSkills.toLocaleString() : '3,214'} verified skills </span> 
              compatible with Antigravity, Claude Code, Cursor, Codex, and Gemini CLI.
            </p>

            {/* Two Understated Actions */}
            <div className="flex flex-wrap items-center gap-2.5 pt-1">
              <button
                onClick={onExploreAgentView}
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-md bg-[#edece6] hover:bg-[#faf8f5] text-[#0b0c0d] font-semibold text-xs transition-colors"
              >
                <Terminal className="w-3.5 h-3.5" />
                <span>Open PRO Agents Terminal</span>
              </button>

              <button
                onClick={onExploreCatalog}
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-md bg-[#141619] hover:bg-[#1a1d21] border border-[#262a30] hover:border-[#363c45] text-[#c9c8c0] text-xs font-medium transition-colors"
              >
                <span>Explore Catalog & Demos</span>
                <ArrowRight className="w-3 h-3 text-[#787f87]" />
              </button>
            </div>

          </div>

          {/* Right Column: 4 Compact Information Cards */}
          <div className="lg:col-span-5 grid grid-cols-2 gap-2.5">
            
            <div className="p-3.5 rounded-lg bg-[#121417] border border-[#1f2226]">
              <div className="text-xl font-mono font-medium text-[#edece6] tracking-tight">
                {totalSkills > 0 ? totalSkills.toLocaleString() : '3,214'}
              </div>
              <div className="text-[11px] font-medium text-[#8c9298] mt-1">
                Verified Agent Skills
              </div>
              <div className="text-[10px] text-[#5e646b] mt-0.5">
                Deduplicated open catalog
              </div>
            </div>

            <div className="p-3.5 rounded-lg bg-[#121417] border border-[#1f2226]">
              <div className="text-xl font-mono font-medium text-[#edece6] tracking-tight">
                12
              </div>
              <div className="text-[11px] font-medium text-[#8c9298] mt-1">
                Domain Categories
              </div>
              <div className="text-[10px] text-[#5e646b] mt-0.5">
                Frontend, backend, mobile...
              </div>
            </div>

            <div className="p-3.5 rounded-lg bg-[#121417] border border-[#1f2226]">
              <div className="text-xl font-mono font-medium text-[#edece6] tracking-tight">
                1-Click
              </div>
              <div className="text-[11px] font-medium text-[#8c9298] mt-1">
                Agent Install
              </div>
              <div className="text-[10px] text-[#5e646b] mt-0.5">
                Standard curl-to-bash script
              </div>
            </div>

            <div className="p-3.5 rounded-lg bg-[#121417] border border-[#1f2226]">
              <div className="text-xl font-mono font-medium text-[#edece6] tracking-tight">
                100%
              </div>
              <div className="text-[11px] font-medium text-[#8c9298] mt-1">
                Live Compiled Demos
              </div>
              <div className="text-[10px] text-[#5e646b] mt-0.5">
                Interactive UI & API previews
              </div>
            </div>

          </div>

        </div>

      </div>
    </section>
  );
};
