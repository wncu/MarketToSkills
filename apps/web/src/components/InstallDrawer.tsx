import React, { useState } from 'react';
import { Skill } from '../types';
import { 
  X, 
  Trash2, 
  Copy, 
  Check, 
  Terminal, 
  Layers
} from 'lucide-react';

interface InstallDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  selectedSkills: Skill[];
  onRemoveSkill: (skillId: string) => void;
  onClearStack: () => void;
}

export const InstallDrawer: React.FC<InstallDrawerProps> = ({
  isOpen,
  onClose,
  selectedSkills,
  onRemoveSkill,
  onClearStack,
}) => {
  const [target, setTarget] = useState<'gemini' | 'claude' | 'cursor' | 'local'>('gemini');
  const [copiedScript, setCopiedScript] = useState(false);
  const [copiedPrompt, setCopiedPrompt] = useState(false);

  if (!isOpen) return null;

  const skillIds = selectedSkills.map(s => s.id);
  const curlCommand = `curl -fsSL "http://localhost:9001/api/agent/install?skills=${skillIds.join(',')}&target=${target}" | bash`;

  const agentPrompt = `Please install the following MarketToSkills stack for this repository:
${skillIds.map(id => `- ${id}`).join('\n')}

Execute installer:
\`\`\`bash
${curlCommand}
\`\`\``;

  const handleCopyScript = () => {
    navigator.clipboard.writeText(curlCommand);
    setCopiedScript(true);
    setTimeout(() => setCopiedScript(false), 2000);
  };

  const handleCopyPrompt = () => {
    navigator.clipboard.writeText(agentPrompt);
    setCopiedPrompt(true);
    setTimeout(() => setCopiedPrompt(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-black/70 backdrop-blur-xs flex justify-end">
      
      {/* Backdrop */}
      <div className="fixed inset-0" onClick={onClose} />

      {/* Drawer Panel */}
      <div className="relative w-full max-w-md bg-[#101214] border-l border-[#22252a] p-5 flex flex-col justify-between overflow-y-auto z-10">
        
        <div className="space-y-5">
          
          {/* Header */}
          <div className="flex items-center justify-between pb-3.5 border-b border-[#1f2226]">
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-[#c9b084]" />
              <h3 className="text-sm font-semibold text-[#edece6]">
                Active Stack ({selectedSkills.length})
              </h3>
            </div>

            <div className="flex items-center gap-1.5">
              {selectedSkills.length > 0 && (
                <button
                  onClick={onClearStack}
                  className="p-1 rounded text-[#747b83] hover:text-[#edece6] hover:bg-[#181a1e] transition-colors"
                  title="Clear stack"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}

              <button
                onClick={onClose}
                className="p-1 rounded text-[#747b83] hover:text-[#edece6] hover:bg-[#181a1e] transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Selected Skills List */}
          {selectedSkills.length === 0 ? (
            <div className="py-12 text-center space-y-2">
              <p className="text-xs font-medium text-[#c9c8c0]">Stack is empty</p>
              <p className="text-[11px] text-[#656b72] max-w-xs mx-auto">
                Click &quot;+ Add&quot; on any skill card in the catalog to build an installation package for your agent.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              
              {/* Chips List */}
              <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
                {selectedSkills.map((s) => (
                  <div
                    key={s.id}
                    className="p-2 rounded bg-[#15171a] border border-[#22252a] flex items-center justify-between gap-2 text-xs"
                  >
                    <div className="truncate">
                      <span className="font-medium text-[#edece6] block truncate">{s.name}</span>
                      <span className="text-[10px] text-[#787f87] font-mono truncate">{s.id}</span>
                    </div>

                    <button
                      onClick={() => onRemoveSkill(s.id)}
                      className="text-[#656b72] hover:text-[#edece6] p-1 transition-colors"
                      title="Remove"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>

              {/* Target Selector */}
              <div className="space-y-1.5 pt-2 border-t border-[#1f2226]">
                <span className="text-[11px] font-mono text-[#747b83] uppercase tracking-wider block">
                  Target Environment:
                </span>
                <div className="grid grid-cols-2 gap-1.5">
                  <button
                    onClick={() => setTarget('gemini')}
                    className={`p-1.5 rounded text-xs font-medium text-left transition-colors ${
                      target === 'gemini'
                        ? 'bg-[#22262c] text-[#edece6] border border-[#343a42]'
                        : 'bg-[#141619] text-[#747b83] border border-[#1f2226]'
                    }`}
                  >
                    Antigravity (.gemini)
                  </button>

                  <button
                    onClick={() => setTarget('claude')}
                    className={`p-1.5 rounded text-xs font-medium text-left transition-colors ${
                      target === 'claude'
                        ? 'bg-[#22262c] text-[#edece6] border border-[#343a42]'
                        : 'bg-[#141619] text-[#747b83] border border-[#1f2226]'
                    }`}
                  >
                    Claude Code (.claude)
                  </button>

                  <button
                    onClick={() => setTarget('cursor')}
                    className={`p-1.5 rounded text-xs font-medium text-left transition-colors ${
                      target === 'cursor'
                        ? 'bg-[#22262c] text-[#edece6] border border-[#343a42]'
                        : 'bg-[#141619] text-[#747b83] border border-[#1f2226]'
                    }`}
                  >
                    Cursor (.cursor/rules)
                  </button>

                  <button
                    onClick={() => setTarget('local')}
                    className={`p-1.5 rounded text-xs font-medium text-left transition-colors ${
                      target === 'local'
                        ? 'bg-[#22262c] text-[#edece6] border border-[#343a42]'
                        : 'bg-[#141619] text-[#747b83] border border-[#1f2226]'
                    }`}
                  >
                    Local Repo (./skills)
                  </button>
                </div>
              </div>

              {/* Installer 1-Liner */}
              <div className="space-y-2 pt-2">
                <span className="text-xs font-medium text-[#c9c8c0] flex items-center gap-1.5">
                  <Terminal className="w-3.5 h-3.5 text-[#a88d5e]" />
                  <span>1-Line Installer:</span>
                </span>

                <div className="p-2.5 rounded bg-[#0b0c0e] border border-[#1f2226] font-mono text-[11px] text-[#c9b084] break-all select-all">
                  {curlCommand}
                </div>

                <button
                  onClick={handleCopyScript}
                  className="w-full py-2 px-3 rounded bg-[#edece6] hover:bg-white text-[#0b0c0d] font-semibold text-xs flex items-center justify-center gap-1.5 transition-colors"
                >
                  {copiedScript ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedScript ? 'Command Copied' : 'Copy 1-Line Command'}</span>
                </button>

                <button
                  onClick={handleCopyPrompt}
                  className="w-full py-1.5 px-3 rounded bg-[#17191d] hover:bg-[#1f2227] text-[#c9c8c0] text-xs font-medium border border-[#252930] flex items-center justify-center gap-1.5 transition-colors"
                >
                  {copiedPrompt ? <Check className="w-3.5 h-3.5 text-[#52825a]" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedPrompt ? 'Prompt Copied' : 'Copy Complete Agent Prompt'}</span>
                </button>
              </div>

            </div>
          )}

        </div>

        {/* Footer */}
        <div className="pt-4 border-t border-[#1f2226] text-[10px] text-[#555b62] text-center font-mono">
          MARKETTOSKILLS STANDARD DISTRIBUTION
        </div>

      </div>

    </div>
  );
};
