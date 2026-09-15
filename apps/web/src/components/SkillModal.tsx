import React, { useEffect, useState } from 'react';
import { Skill, SkillDetail } from '../types';
import { fetchSkillDetail } from '../api';
import { CompiledDemo } from './CompiledDemo';
import { 
  X, 
  Copy, 
  Check, 
  Terminal, 
  FileText, 
  FolderTree, 
  Eye
} from 'lucide-react';

interface SkillModalProps {
  skill: Skill | null;
  onClose: () => void;
  isInStack: boolean;
  onToggleStack: (skill: Skill) => void;
}

export const SkillModal: React.FC<SkillModalProps> = ({
  skill,
  onClose,
  isInStack,
  onToggleStack,
}) => {
  const [detail, setDetail] = useState<SkillDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'demo' | 'markdown' | 'files'>('demo');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!skill) {
      setDetail(null);
      return;
    }

    setLoading(true);
    fetchSkillDetail(skill.category, skill.id)
      .then(setDetail)
      .catch((err) => {
        console.error(err);
        setDetail({
          ...skill,
          content: `# ${skill.name}\n\n${skill.description}\n\n*(Error reading file)*`,
        });
      })
      .finally(() => setLoading(false));
  }, [skill]);

  if (!skill) return null;

  const installCmd = `curl -fsSL "http://localhost:9001/api/agent/install?skills=${skill.id}&target=gemini" | bash`;

  const copyCommand = () => {
    navigator.clipboard.writeText(installCmd);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6">
      
      {/* Backdrop */}
      <div className="fixed inset-0" onClick={onClose} />

      {/* Modal Card */}
      <div className="relative w-full max-w-4xl bg-[#111315] border border-[#23272c] rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[88vh] z-10">
        
        {/* Header */}
        <div className="px-5 py-4 bg-[#14171a] border-b border-[#22252a] flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1 text-[11px]">
              <span className="font-medium text-[#c9b084]">
                {skill.category_label}
              </span>
              <span className="text-[#5b6169]">•</span>
              <span className="font-mono text-[#787f87]">
                {skill.source}
              </span>
            </div>
            <h2 className="font-serif text-2xl font-normal text-[#edece6]">
              {skill.name}
            </h2>
            <p className="text-[11px] text-[#717882] font-mono mt-0.5">
              {skill.path}
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => onToggleStack(skill)}
              className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                isInStack
                  ? 'bg-[#a88d5e] text-[#0b0c0d] font-semibold'
                  : 'bg-[#1e2227] hover:bg-[#252a31] text-[#edece6] border border-[#2b3038]'
              }`}
            >
              {isInStack ? 'Added to Stack' : '+ Add to Stack'}
            </button>

            <button
              onClick={onClose}
              className="p-1.5 rounded text-[#747b83] hover:text-[#edece6] hover:bg-[#1a1d21] transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* 1-Line Agent Install Bar */}
        <div className="px-5 py-2.5 bg-[#0e1012] border-b border-[#1f2226] flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2 text-[#9ba1a6] font-mono overflow-x-auto">
            <Terminal className="w-3.5 h-3.5 text-[#a88d5e] shrink-0" />
            <span className="text-[#555a61] select-none">$</span>
            <code className="text-[#edece6] font-mono text-[11px] truncate max-w-[500px]">
              {installCmd}
            </code>
          </div>

          <button
            onClick={copyCommand}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-[#181a1e] hover:bg-[#202328] text-[#c9b084] border border-[#2b2f36] text-xs font-medium transition-colors shrink-0"
          >
            {copied ? <Check className="w-3 h-3 text-[#52825a]" /> : <Copy className="w-3 h-3" />}
            <span>{copied ? 'Copied' : 'Copy Install Command'}</span>
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="px-5 bg-[#121417] border-b border-[#1f2226] flex items-center gap-4">
          <button
            onClick={() => setActiveTab('demo')}
            className={`flex items-center gap-1.5 py-2.5 text-xs font-medium border-b-2 transition-colors ${
              activeTab === 'demo'
                ? 'border-[#c9b084] text-[#edece6]'
                : 'border-transparent text-[#787f87] hover:text-[#edece6]'
            }`}
          >
            <Eye className="w-3.5 h-3.5" />
            <span>Compiled Visual Demo</span>
          </button>

          <button
            onClick={() => setActiveTab('markdown')}
            className={`flex items-center gap-1.5 py-2.5 text-xs font-medium border-b-2 transition-colors ${
              activeTab === 'markdown'
                ? 'border-[#c9b084] text-[#edece6]'
                : 'border-transparent text-[#787f87] hover:text-[#edece6]'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Instructions (SKILL.md)</span>
          </button>

          <button
            onClick={() => setActiveTab('files')}
            className={`flex items-center gap-1.5 py-2.5 text-xs font-medium border-b-2 transition-colors ${
              activeTab === 'files'
                ? 'border-[#c9b084] text-[#edece6]'
                : 'border-transparent text-[#787f87] hover:text-[#edece6]'
            }`}
          >
            <FolderTree className="w-3.5 h-3.5" />
            <span>Package Files ({skill.files ? skill.files.length : 1})</span>
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 overflow-y-auto flex-1 space-y-4 bg-[#0b0c0e]">
          
          {/* TAB 1: COMPILED DEMO */}
          {activeTab === 'demo' && (
            <div className="space-y-3">
              <p className="text-xs text-[#8c9298]">
                Interactive compilation demonstrating the UI layout, component hierarchy, and rules defined in this skill using sample lorem ipsum content.
              </p>
              <CompiledDemo skill={skill} />
            </div>
          )}

          {/* TAB 2: SKILL.md */}
          {activeTab === 'markdown' && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-[#747b83]">
                <span className="font-mono">Directive Contents</span>
                <button
                  onClick={() => {
                    if (detail?.content) {
                      navigator.clipboard.writeText(detail.content);
                      setCopied(true);
                      setTimeout(() => setCopied(false), 2000);
                    }
                  }}
                  className="flex items-center gap-1 text-[#c9b084] hover:text-white"
                >
                  <Copy className="w-3 h-3" />
                  <span>Copy Markdown</span>
                </button>
              </div>

              <div className="p-4 rounded-md bg-[#121417] border border-[#202327] text-[#edece6] font-mono text-xs leading-relaxed overflow-x-auto whitespace-pre-wrap max-h-[480px]">
                {loading ? 'Reading SKILL.md...' : detail?.content}
              </div>
            </div>
          )}

          {/* TAB 3: FILES */}
          {activeTab === 'files' && (
            <div className="space-y-2">
              <div className="divide-y divide-[#1e2226] rounded-md bg-[#121417] border border-[#202327] overflow-hidden text-xs font-mono">
                {skill.files && skill.files.length > 0 ? (
                  skill.files.map((file, idx) => (
                    <div key={idx} className="p-2.5 flex items-center justify-between text-[#c9c8c0]">
                      <span>{file}</span>
                      <span className="text-[#5c6168] text-[10px]">Verified</span>
                    </div>
                  ))
                ) : (
                  <div className="p-4 text-[#5c6168]">SKILL.md</div>
                )}
              </div>
            </div>
          )}

        </div>

      </div>

    </div>
  );
};
