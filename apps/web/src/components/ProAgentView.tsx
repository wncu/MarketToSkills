import React, { useState, useEffect } from 'react';
import { Category, Skill } from '../types';
import { fetchLLMsTxt, fetchAgentManifest, fetchRecommendations } from '../api';
import { 
  Terminal, 
  Copy, 
  Check, 
  Code2, 
  FileText
} from 'lucide-react';

interface ProAgentViewProps {
  categories: Category[];
  selectedSkills: Skill[];
  onAddSkill: (skill: Skill) => void;
  onRemoveSkill: (skillId: string) => void;
}

export const ProAgentView: React.FC<ProAgentViewProps> = ({
  categories,
  selectedSkills,
  onAddSkill,
  onRemoveSkill,
}) => {
  const [targetAgent, setTargetAgent] = useState<'gemini' | 'claude' | 'cursor' | 'local'>('gemini');
  const [projectPrompt, setProjectPrompt] = useState('Build a modern Flutter mobile app with Firebase and state management');
  const [recommended, setRecommended] = useState<Skill[]>([]);
  const [recLoading, setRecLoading] = useState(false);

  const [activeManifestTab, setActiveManifestTab] = useState<'llms' | 'manifest'>('llms');
  const [manifestContent, setManifestContent] = useState('');
  const [manifestLoading, setManifestLoading] = useState(false);

  const [copiedPrompt, setCopiedPrompt] = useState(false);
  const [copiedScript, setCopiedScript] = useState(false);

  useEffect(() => {
    setManifestLoading(true);
    const fetcher = activeManifestTab === 'llms' ? fetchLLMsTxt : fetchAgentManifest;
    fetcher()
      .then(setManifestContent)
      .catch(() => setManifestContent('Error loading agent manifest.'))
      .finally(() => setManifestLoading(false));
  }, [activeManifestTab]);

  const handleRecommend = async () => {
    if (!projectPrompt.trim()) return;
    setRecLoading(true);
    try {
      const res = await fetchRecommendations(projectPrompt);
      setRecommended(res.recommended_skills);
    } catch (e) {
      console.error(e);
    } finally {
      setRecLoading(false);
    }
  };

  const skillIds = selectedSkills.map(s => s.id);
  const installCurlCmd = `curl -fsSL "http://localhost:9001/api/agent/install?skills=${skillIds.length > 0 ? skillIds.join(',') : 'flutter,bento,react-ui-patterns'}&target=${targetAgent}" | bash`;

  const copyableAgentPrompt = `Please inspect the MarketToSkills registry to discover and install the necessary skills for our current project stack:
- Agent Manifest: http://localhost:9001/llms.txt
- Run this one-line command to install the required skills into your agent environment:
\`\`\`bash
${installCurlCmd}
\`\`\`
Once installed, read the corresponding SKILL.md file for instructions on building our feature.`;

  const copyPromptToClipboard = () => {
    navigator.clipboard.writeText(copyableAgentPrompt);
    setCopiedPrompt(true);
    setTimeout(() => setCopiedPrompt(false), 2000);
  };

  const copyScriptToClipboard = () => {
    navigator.clipboard.writeText(installCurlCmd);
    setCopiedScript(true);
    setTimeout(() => setCopiedScript(false), 2000);
  };

  return (
    <div className="space-y-6">
      
      {/* Top Banner */}
      <div className="p-5 rounded-lg bg-[#121417] border border-[#22252a] flex flex-col lg:flex-row lg:items-center justify-between gap-6">
        <div className="space-y-1.5 max-w-2xl">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-mono uppercase tracking-wider text-[#a88d5e] font-semibold">
              PRO AGENTS CONTROL PLANE
            </span>
          </div>
          <h2 className="font-serif text-2xl font-normal text-[#edece6]">
            Autonomous Skill Distribution
          </h2>
          <p className="text-xs text-[#8c9298] leading-relaxed">
            Instruct Antigravity, Claude Code, Cursor, Codex, or Gemini CLI to install verified skills. Agents ingest our token-efficient <code className="font-mono text-[#c9b084]">/llms.txt</code> or execute our dynamic bash script.
          </p>
        </div>

        {/* Target Environment */}
        <div className="p-3 rounded-md bg-[#16181b] border border-[#24272c] space-y-2 shrink-0">
          <span className="text-[10px] font-mono text-[#747b83] uppercase tracking-wider block">
            Target Environment
          </span>
          <div className="grid grid-cols-2 gap-1.5">
            <button
              onClick={() => setTargetAgent('gemini')}
              className={`px-2.5 py-1.5 rounded text-xs font-medium text-left transition-colors ${
                targetAgent === 'gemini'
                  ? 'bg-[#22262c] text-[#edece6] border border-[#343a42]'
                  : 'bg-[#121417] text-[#747b83] border border-[#1f2226] hover:text-[#c9c8c0]'
              }`}
            >
              Antigravity (.gemini)
            </button>
            <button
              onClick={() => setTargetAgent('claude')}
              className={`px-2.5 py-1.5 rounded text-xs font-medium text-left transition-colors ${
                targetAgent === 'claude'
                  ? 'bg-[#22262c] text-[#edece6] border border-[#343a42]'
                  : 'bg-[#121417] text-[#747b83] border border-[#1f2226] hover:text-[#c9c8c0]'
              }`}
            >
              Claude Code (.claude)
            </button>
            <button
              onClick={() => setTargetAgent('cursor')}
              className={`px-2.5 py-1.5 rounded text-xs font-medium text-left transition-colors ${
                targetAgent === 'cursor'
                  ? 'bg-[#22262c] text-[#edece6] border border-[#343a42]'
                  : 'bg-[#121417] text-[#747b83] border border-[#1f2226] hover:text-[#c9c8c0]'
              }`}
            >
              Cursor (.cursor)
            </button>
            <button
              onClick={() => setTargetAgent('local')}
              className={`px-2.5 py-1.5 rounded text-xs font-medium text-left transition-colors ${
                targetAgent === 'local'
                  ? 'bg-[#22262c] text-[#edece6] border border-[#343a42]'
                  : 'bg-[#121417] text-[#747b83] border border-[#1f2226] hover:text-[#c9c8c0]'
              }`}
            >
              Local Repo (./skills)
            </button>
          </div>
        </div>
      </div>

      {/* Grid: Prompt & Matcher */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        
        {/* Left: Agent Prompt */}
        <div className="lg:col-span-7 space-y-4">
          <div className="p-4 sm:p-5 rounded-lg bg-[#121417] border border-[#22252a] space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold text-[#edece6] flex items-center gap-1.5">
                <Terminal className="w-3.5 h-3.5 text-[#a88d5e]" />
                <span>Agent Instructions & Command</span>
              </h3>

              <button
                onClick={copyPromptToClipboard}
                className="flex items-center gap-1 px-2.5 py-1 rounded bg-[#1c1f24] hover:bg-[#252930] text-[#edece6] border border-[#2b3038] text-xs font-medium transition-colors"
              >
                {copiedPrompt ? <Check className="w-3 h-3 text-[#52825a]" /> : <Copy className="w-3 h-3" />}
                <span>{copiedPrompt ? 'Copied' : 'Copy Prompt for Agent'}</span>
              </button>
            </div>

            <p className="text-xs text-[#8c9298]">
              Paste this prompt directly into your agent conversation. The agent will execute the curl command and load the skills into context.
            </p>

            <div className="rounded-md bg-[#0c0d0f] border border-[#1f2226] p-3.5 font-mono text-xs text-[#c9c8c0] overflow-x-auto whitespace-pre-wrap leading-relaxed max-h-52">
              {copyableAgentPrompt}
            </div>

            <div className="p-2.5 rounded bg-[#0e1012] border border-[#202327] flex items-center justify-between gap-2 font-mono text-xs">
              <span className="text-[#a88d5e] truncate">{installCurlCmd}</span>
              <button
                onClick={copyScriptToClipboard}
                className="px-2 py-0.5 rounded bg-[#1c1f24] hover:bg-[#23272e] text-[#b5b3aa] text-[11px] shrink-0"
              >
                {copiedScript ? '✓ Copied' : 'Copy'}
              </button>
            </div>
          </div>
        </div>

        {/* Right: Skill Matcher */}
        <div className="lg:col-span-5 space-y-4">
          <div className="p-4 sm:p-5 rounded-lg bg-[#121417] border border-[#22252a] space-y-3">
            <h3 className="text-xs font-semibold text-[#edece6]">
              Skill Matcher
            </h3>
            <p className="text-xs text-[#8c9298]">
              Enter project specifications to query recommended skills:
            </p>

            <div className="flex gap-2">
              <input
                type="text"
                value={projectPrompt}
                onChange={(e) => setProjectPrompt(e.target.value)}
                placeholder="e.g. Flutter with SQLite..."
                className="flex-1 px-3 py-1.5 rounded bg-[#16181b] border border-[#262a30] text-xs text-[#edece6] focus:outline-none focus:border-[#3a4049]"
              />
              <button
                onClick={handleRecommend}
                disabled={recLoading}
                className="px-3 py-1.5 rounded bg-[#edece6] hover:bg-white text-[#0b0c0d] text-xs font-semibold transition-colors disabled:opacity-50"
              >
                {recLoading ? '...' : 'Match'}
              </button>
            </div>

            <div className="space-y-1.5 max-h-52 overflow-y-auto pr-1">
              {recommended.length > 0 ? (
                recommended.map((sk) => {
                  const isSelected = selectedSkills.some(s => s.id === sk.id);
                  return (
                    <div
                      key={sk.id}
                      className="p-2 rounded bg-[#16181b] border border-[#22252a] flex items-center justify-between gap-2 text-xs"
                    >
                      <div className="truncate">
                        <span className="font-medium text-[#edece6] block truncate">{sk.name}</span>
                        <span className="text-[10px] font-mono text-[#747b83] truncate">{sk.id}</span>
                      </div>
                      <button
                        onClick={() => isSelected ? onRemoveSkill(sk.id) : onAddSkill(sk)}
                        className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors ${
                          isSelected
                            ? 'bg-[#a88d5e] text-[#0b0c0d] font-semibold'
                            : 'bg-[#202429] hover:bg-[#282d33] text-[#c9c8c0]'
                        }`}
                      >
                        {isSelected ? 'Added' : '+ Add'}
                      </button>
                    </div>
                  );
                })
              ) : (
                <div className="p-4 text-center text-xs text-[#5e646b]">
                  Submit query to match skills against catalog.
                </div>
              )}
            </div>
          </div>
        </div>

      </div>

      {/* Manifest Viewer */}
      <div className="p-4 sm:p-5 rounded-lg bg-[#121417] border border-[#22252a] space-y-3">
        <div className="flex items-center justify-between border-b border-[#1f2226] pb-3">
          <div>
            <h3 className="text-xs font-semibold text-[#edece6] flex items-center gap-1.5">
              <Code2 className="w-3.5 h-3.5 text-[#a88d5e]" />
              <span>Machine Manifests</span>
            </h3>
            <p className="text-xs text-[#8c9298] mt-0.5">
              Standard plain-text discovery documents.
            </p>
          </div>

          <div className="flex items-center gap-1 bg-[#16181b] p-0.5 rounded border border-[#24272c]">
            <button
              onClick={() => setActiveManifestTab('llms')}
              className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                activeManifestTab === 'llms'
                  ? 'bg-[#23272c] text-[#edece6]'
                  : 'text-[#747b83] hover:text-[#edece6]'
              }`}
            >
              /llms.txt
            </button>
            <button
              onClick={() => setActiveManifestTab('manifest')}
              className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                activeManifestTab === 'manifest'
                  ? 'bg-[#23272c] text-[#edece6]'
                  : 'text-[#747b83] hover:text-[#edece6]'
              }`}
            >
              /api/agent/manifest
            </button>
          </div>
        </div>

        <div className="rounded-md bg-[#0c0d0f] border border-[#1f2226] p-3 font-mono text-xs text-[#b8b6af] overflow-x-auto whitespace-pre-wrap max-h-80 leading-relaxed">
          {manifestLoading ? 'Loading manifest...' : manifestContent}
        </div>
      </div>

    </div>
  );
};
