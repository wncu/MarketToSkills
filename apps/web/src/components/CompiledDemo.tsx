import React, { useState } from 'react';
import { Skill } from '../types';
import { 
  Smartphone, 
  Terminal, 
  ShieldCheck, 
  Check, 
  Layers
} from 'lucide-react';

interface CompiledDemoProps {
  skill: Skill;
}

export const CompiledDemo: React.FC<CompiledDemoProps> = ({ skill }) => {
  const [demoState, setDemoState] = useState({ count: 42, activeTab: 'overview', toggled: true });

  const cat = skill.category;
  const id = skill.id.toLowerCase();

  const isMobile = cat === 'mobile' || id.includes('flutter') || id.includes('expo') || id.includes('swift');
  const isDesign = cat === 'design' || id.includes('bento') || id.includes('brutalist') || id.includes('ui');
  const isBackend = cat === 'backend' || cat === 'database' || id.includes('api');
  const isSecurity = cat === 'security' || id.includes('audit') || id.includes('pentest');

  return (
    <div className="rounded-lg border border-[#22252a] bg-[#0e1012] overflow-hidden">
      
      {/* Demo Top Bar */}
      <div className="px-3.5 py-2.5 bg-[#141619] border-b border-[#22252a] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full bg-[#2a2e33]" />
            <div className="w-2.5 h-2.5 rounded-full bg-[#2a2e33]" />
            <div className="w-2.5 h-2.5 rounded-full bg-[#2a2e33]" />
          </div>
          <span className="text-[11px] font-mono text-[#747b83] pl-1.5">
            preview://{skill.category}/{skill.id}
          </span>
        </div>

        <span className="text-[10px] font-mono text-[#8c9298] bg-[#1a1d21] border border-[#262a30] px-2 py-0.5 rounded">
          COMPILED RUNTIME
        </span>
      </div>

      {/* Demo View Content */}
      <div className="p-5 sm:p-6 bg-[#0c0d0f]">

        {/* 1. MOBILE PREVIEW */}
        {isMobile && (
          <div className="flex justify-center py-2">
            <div className="w-72 rounded-2xl p-2.5 bg-[#121417] border border-[#262a30] shadow-md">
              <div className="w-20 h-3 bg-[#181b1f] rounded-full mx-auto mb-2" />

              <div className="bg-[#16181c] rounded-xl p-3.5 text-[#edece6] min-h-[380px] flex flex-col justify-between border border-[#22252a]">
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="font-semibold text-[#c9b084] font-mono">Flutter / Dart Frame</span>
                    <span className="text-[10px] font-mono text-[#6e747c]">v3.24</span>
                  </div>

                  <h4 className="font-serif text-base font-normal text-white">
                    Lorem Ipsum Mobile Application
                  </h4>
                  <p className="text-xs text-[#8c9298] leading-relaxed">
                    Dolor sit amet, consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore.
                  </p>

                  <div className="p-3 rounded-md bg-[#1c1f24] border border-[#262a30] space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium text-[#c9c8c0]">Component State</span>
                      <span className="text-[10px] font-mono text-[#52825a]">Ready</span>
                    </div>
                    <div className="w-full bg-[#262a30] h-1 rounded-full overflow-hidden">
                      <div className="bg-[#a88d5e] h-full w-2/3 rounded-full" />
                    </div>
                  </div>

                  <button 
                    onClick={() => setDemoState(s => ({ ...s, count: s.count + 1 }))}
                    className="w-full py-1.5 px-3 rounded-md bg-[#edece6] hover:bg-white text-[#0b0c0d] font-semibold text-xs transition-colors"
                  >
                    State Counter: {demoState.count}
                  </button>
                </div>

                <div className="pt-2.5 border-t border-[#22252a] flex justify-around text-[11px] text-[#747b83]">
                  <span className="text-[#edece6] font-medium">Home</span>
                  <span>Explore</span>
                  <span>Settings</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 2. DESIGN & BENTO PREVIEWS */}
        {isDesign && !isMobile && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            
            <div className="md:col-span-2 p-4 rounded-lg bg-[#141619] border border-[#23272c] space-y-2.5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-[11px] font-mono text-[#a88d5e] uppercase">
                  Design Architecture
                </span>
                <span className="text-[11px] font-mono text-[#636971]">60 FPS</span>
              </div>
              <h3 className="font-serif text-lg font-normal text-[#edece6]">
                Lorem Ipsum Dolor Sit Amet Consectetur
              </h3>
              <p className="text-xs text-[#8c9298] leading-relaxed">
                Sed ut perspiciatis unde omnis iste natus error sit voluptatem accusantium doloremque laudantium, totam rem aperiam eaque ipsa.
              </p>
              <div className="flex gap-2 pt-1">
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#1b1e22] border border-[#272b31] text-[#9ba1a6]">#BentoGrid</span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#1b1e22] border border-[#272b31] text-[#9ba1a6]">#Typography</span>
              </div>
            </div>

            <div className="p-4 rounded-lg bg-[#141619] border border-[#23272c] flex flex-col justify-between space-y-3">
              <div>
                <span className="text-[11px] font-mono text-[#747b83]">THROUGHPUT</span>
                <div className="text-2xl font-mono text-[#edece6] mt-0.5">99.8%</div>
                <p className="text-[11px] text-[#8c9298] mt-1">Consectetur adipiscing metric benchmark.</p>
              </div>
              <div className="w-full bg-[#202327] h-1 rounded-full overflow-hidden">
                <div className="bg-[#a88d5e] h-full w-4/5" />
              </div>
            </div>

            <div className="p-3.5 rounded-lg bg-[#141619] border border-[#23272c] space-y-2">
              <span className="text-[11px] font-mono text-[#747b83]">INTERACTIVE TOGGLE</span>
              <p className="text-xs text-[#8c9298]">Nemo enim ipsam voluptatem quia voluptas.</p>
              <button
                onClick={() => setDemoState(s => ({ ...s, toggled: !s.toggled }))}
                className={`w-full py-1 rounded text-xs font-medium border transition-colors ${
                  demoState.toggled
                    ? 'bg-[#1e2227] text-[#edece6] border-[#343a43]'
                    : 'bg-[#141619] text-[#6e747c] border-[#22252a]'
                }`}
              >
                {demoState.toggled ? 'Status: Active' : 'Status: Inactive'}
              </button>
            </div>

            <div className="md:col-span-2 p-3.5 rounded-lg bg-[#181b1f] border border-[#292d34] flex items-center justify-between">
              <div>
                <h4 className="text-xs font-semibold text-[#edece6]">Typography & Grid Rhythm</h4>
                <p className="text-xs text-[#8c9298]">Ut enim ad minima veniam quis nostrum exercitationem.</p>
              </div>
              <span className="px-2 py-0.5 rounded bg-[#202429] text-[10px] font-mono text-[#a88d5e]">
                SYSTEM V1
              </span>
            </div>

          </div>
        )}

        {/* 3. BACKEND & APIS */}
        {isBackend && (
          <div className="space-y-3 font-mono text-xs">
            <div className="flex items-center justify-between p-2.5 rounded-md bg-[#131518] border border-[#202327]">
              <div className="flex items-center gap-2">
                <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-[#1b221d] text-[#52825a] border border-[#243327]">
                  GET
                </span>
                <span className="text-[#c9c8c0]">/api/v1/skills/manifest/stream</span>
              </div>
              <span className="text-[#52825a] font-mono text-[11px]">200 OK • 12ms</span>
            </div>

            <div className="p-3.5 rounded-md bg-[#0e1012] border border-[#202327] text-[#9ba1a6] space-y-1">
              <span className="text-[#5e646b]">// Compiled API Mock Response (Lorem Ipsum Payload)</span>
              <pre className="text-[11px] text-[#c9b084] overflow-x-auto leading-relaxed">
{JSON.stringify({
  status: "success",
  code: 200,
  latency_ms: 12.4,
  data: {
    skill: skill.id,
    source: skill.source,
    capabilities: ["schema_validation", "high_throughput"],
    sample_entity: {
      id: "lorem_98472",
      title: "Dolor Sit Amet Engine",
      active: true
    }
  }
}, null, 2)}
              </pre>
            </div>
          </div>
        )}

        {/* 4. SECURITY AUDIT */}
        {isSecurity && (
          <div className="space-y-2.5 font-mono text-xs">
            <div className="p-3.5 rounded-md bg-[#0e1012] border border-[#242e26] text-[#8c9298] space-y-2">
              <div className="flex items-center justify-between text-[#52825a] border-b border-[#1c221e] pb-2 text-[11px]">
                <span className="font-semibold flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  AUDIT_REPORT :: {skill.id.toUpperCase()}
                </span>
                <span className="text-[10px] bg-[#172119] px-2 py-0.5 rounded text-[#52825a]">PASS (0 CRITICAL)</span>
              </div>
              <div className="space-y-1 text-[11px] text-[#787f87]">
                <p>✓ Cryptographic signature check: COMPLIANT</p>
                <p>✓ Secret exposure audit: 0 VULNERABILITIES DETECTED</p>
                <p>✓ Role-based authorization matrix: VERIFIED</p>
                <p className="text-[#52575f]">Summary: Baseline security directives compliant with standards.</p>
              </div>
            </div>
          </div>
        )}

        {/* 5. GENERAL & AI CAPABILITIES */}
        {!isMobile && !isDesign && !isBackend && !isSecurity && (
          <div className="p-4 rounded-md bg-[#131518] border border-[#202327] space-y-2 text-xs">
            <div className="flex items-center justify-between text-[#787f87] font-mono text-[11px]">
              <span>Skill Operational Environment</span>
              <span>Memory: 14.2 MB</span>
            </div>
            <h4 className="font-serif text-sm font-normal text-[#edece6]">
              {skill.name}
            </h4>
            <p className="text-xs text-[#8c9298] leading-relaxed">
              Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam.
            </p>
            <div className="p-2.5 rounded bg-[#0e1012] border border-[#1f2226] font-mono text-[11px] text-[#747b83]">
              <span className="text-[#a88d5e]">&gt; agent.activate</span>(&quot;{skill.id}&quot;) <br />
              <span className="text-[#52825a]">&gt; Ready: instructions indexed in active context.</span>
            </div>
          </div>
        )}

      </div>

    </div>
  );
};
