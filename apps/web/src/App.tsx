import React, { useState, useEffect } from 'react';
import { Category, Skill, Bundle } from './types';
import { fetchCategories, fetchSkills, fetchBundles } from './api';
import { Header } from './components/Header';
import { Sidebar } from './components/Sidebar';
import { Hero } from './components/Hero';
import { CategoryNav } from './components/CategoryNav';
import { SkillCard } from './components/SkillCard';
import { SkillModal } from './components/SkillModal';
import { ProAgentView } from './components/ProAgentView';
import { InstallDrawer } from './components/InstallDrawer';
import { Loader2, ArrowRight, Layers, SlidersHorizontal } from 'lucide-react';

export const App: React.FC = () => {
  const [categories, setCategories] = useState<Category[]>([]);
  const [bundles, setBundles] = useState<Bundle[]>([]);
  const [skills, setSkills] = useState<Skill[]>([]);
  const [totalSkillsCount, setTotalSkillsCount] = useState(0);

  const [selectedCategory, setSelectedCategory] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'human' | 'agent'>('human');
  const [activeNav, setActiveNav] = useState('home');

  const [selectedSkills, setSelectedSkills] = useState<Skill[]>([]);
  const [activeSkillModal, setActiveSkillModal] = useState<Skill | null>(null);
  const [isStackOpen, setIsStackOpen] = useState(false);

  const [loading, setLoading] = useState(true);
  const [limit, setLimit] = useState(48);
  const [offset, setOffset] = useState(0);

  // Initial load
  useEffect(() => {
    Promise.all([fetchCategories(), fetchBundles()])
      .then(([cats, bndls]) => {
        const safeCats = Array.isArray(cats) ? cats : [];
        const safeBndls = Array.isArray(bndls) ? bndls : [];
        setCategories(safeCats);
        setBundles(safeBndls);
        const total = safeCats.reduce((acc, c) => acc + (c.count || 0), 0);
        setTotalSkillsCount(total || 3214);
      })
      .catch(console.error);
  }, []);

  // Fetch skills when filters change
  useEffect(() => {
    setLoading(true);
    fetchSkills({
      category: selectedCategory,
      search: searchQuery,
      limit,
      offset: 0,
    })
      .then((res) => {
        setSkills(res?.skills || []);
        setOffset(0);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [selectedCategory, searchQuery, limit]);

  const handleLoadMore = () => {
    const nextOffset = offset + limit;
    setLoading(true);
    fetchSkills({
      category: selectedCategory,
      search: searchQuery,
      limit,
      offset: nextOffset,
    })
      .then((res) => {
        setSkills((prev) => [...prev, ...(res?.skills || [])]);
        setOffset(nextOffset);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  const handleToggleSelectSkill = (skill: Skill) => {
    setSelectedSkills((prev) => {
      const exists = prev.some((s) => s.id === skill.id);
      if (exists) {
        return prev.filter((s) => s.id !== skill.id);
      } else {
        return [...prev, skill];
      }
    });
  };

  const handleAddSkill = (skill: Skill) => {
    setSelectedSkills((prev) => {
      if (prev.some((s) => s.id === skill.id)) return prev;
      return [...prev, skill];
    });
  };

  const handleRemoveSkill = (skillId: string) => {
    setSelectedSkills((prev) => prev.filter((s) => s.id !== skillId));
  };

  return (
    <div className="min-h-screen bg-[#0b0c0d] text-[#edece6] flex flex-col font-sans selection:bg-[#c9b084]/25 selection:text-[#faf8f5]">
      
      {/* Top Navigation */}
      <Header
        viewMode={viewMode}
        setViewMode={setViewMode}
        selectedSkillsCount={selectedSkills.length}
        onOpenStack={() => setIsStackOpen(true)}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        totalSkills={totalSkillsCount}
      />

      {/* Main Container with Left Sidebar */}
      <div className="flex-1 flex w-full">
        
        {/* Left Sidebar */}
        <Sidebar
          activeNav={activeNav}
          setActiveNav={setActiveNav}
          viewMode={viewMode}
          setViewMode={setViewMode}
          onSelectCategory={(cat) => {
            setSelectedCategory(cat);
            const el = document.getElementById('marketplace-section');
            if (el) el.scrollIntoView({ behavior: 'smooth' });
          }}
          totalSkills={totalSkillsCount}
        />

        {/* Main Content Body */}
        <main className="flex-1 overflow-x-hidden">
          
          {/* VIEW 1: PRO AGENTS MODE */}
          {viewMode === 'agent' ? (
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
              <ProAgentView
                categories={categories}
                selectedSkills={selectedSkills}
                onAddSkill={handleAddSkill}
                onRemoveSkill={handleRemoveSkill}
              />
            </div>
          ) : (
            /* VIEW 2: HUMAN MARKETPLACE VIEW */
            <div>
              
              {/* Compact Hero Section */}
              <Hero
                onExploreAgentView={() => setViewMode('agent')}
                onExploreCatalog={() => {
                  const el = document.getElementById('marketplace-section');
                  if (el) el.scrollIntoView({ behavior: 'smooth' });
                }}
                totalSkills={totalSkillsCount}
              />

              {/* MARKETPLACE SECTION (Visual Focus) */}
              <div id="marketplace-section" className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-5">
                
                {/* Browse by Domain */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-[11px] font-medium text-[#747b83]">
                    <span className="uppercase tracking-wider font-mono">
                      Browse by Domain
                    </span>
                    <span className="text-[#555a61]">
                      {skills.length} of {totalSkillsCount > 0 ? totalSkillsCount.toLocaleString() : '3,214'} skills
                    </span>
                  </div>

                  <CategoryNav
                    categories={categories}
                    selectedCategory={selectedCategory}
                    onSelectCategory={(catId) => setSelectedCategory(catId)}
                    totalSkills={totalSkillsCount}
                  />
                </div>

                {/* Section Header: Featured Skills */}
                <div className="flex items-center justify-between pt-2">
                  <div>
                    <h2 className="text-base font-semibold text-[#edece6]">
                      Featured Skills
                    </h2>
                    <p className="text-xs text-[#787f87]">
                      Curated, verified playbooks and runtime capabilities ready for immediate agent deployment.
                    </p>
                  </div>

                  {searchQuery && (
                    <button
                      onClick={() => {
                        setSearchQuery('');
                        setSelectedCategory('all');
                      }}
                      className="text-xs text-[#a88d5e] hover:underline"
                    >
                      Clear search
                    </button>
                  )}
                </div>

                {/* 4-Column Grid */}
                {loading && skills.length === 0 ? (
                  <div className="py-24 text-center space-y-2">
                    <Loader2 className="w-6 h-6 text-[#787f87] animate-spin mx-auto" />
                    <p className="text-xs text-[#747b83]">Loading skills catalog...</p>
                  </div>
                ) : skills.length === 0 ? (
                  <div className="py-16 text-center rounded-lg bg-[#121417] border border-[#1f2226] p-8 space-y-2">
                    <p className="text-sm font-medium text-[#edece6]">No skills match &quot;{searchQuery}&quot;</p>
                    <p className="text-xs text-[#747b83]">Try searching for keywords like flutter, bento, aws, react, or security.</p>
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3.5">
                      {skills.map((skill) => (
                        <SkillCard
                          key={`${skill.category}-${skill.id}`}
                          skill={skill}
                          isSelected={selectedSkills.some((s) => s.id === skill.id)}
                          onToggleSelect={handleToggleSelectSkill}
                          onOpenDetail={(s) => setActiveSkillModal(s)}
                        />
                      ))}
                    </div>

                    {/* Load More Button */}
                    <div className="pt-6 pb-12 text-center">
                      <button
                        onClick={handleLoadMore}
                        disabled={loading}
                        className="px-5 py-2 rounded-md bg-[#141619] hover:bg-[#1a1d21] border border-[#23272c] hover:border-[#33373f] text-[#c9c8c0] text-xs font-medium transition-colors inline-flex items-center gap-2 disabled:opacity-50"
                      >
                        {loading ? (
                          <>
                            <Loader2 className="w-3.5 h-3.5 animate-spin text-[#787f87]" />
                            <span>Loading...</span>
                          </>
                        ) : (
                          <>
                            <span>Load More Skills</span>
                            <ArrowRight className="w-3 h-3 text-[#787f87]" />
                          </>
                        )}
                      </button>
                    </div>
                  </>
                )}

              </div>

            </div>
          )}

        </main>

      </div>

      {/* Floating Stack Status Bar */}
      {selectedSkills.length > 0 && (
        <div className="fixed bottom-5 inset-x-0 z-30 flex justify-center px-4 pointer-events-none">
          <div className="bg-[#121417]/95 border border-[#2e333a] p-3 rounded-lg shadow-xl flex items-center justify-between gap-5 pointer-events-auto max-w-md w-full backdrop-blur">
            <div className="flex items-center gap-2.5">
              <span className="w-6 h-6 rounded bg-[#a88d5e] text-[#0b0c0d] flex items-center justify-center text-xs font-mono font-bold">
                {selectedSkills.length}
              </span>
              <span className="text-xs text-[#edece6]">
                skills selected in stack
              </span>
            </div>

            <button
              onClick={() => setIsStackOpen(true)}
              className="px-3 py-1.5 rounded bg-[#edece6] hover:bg-white text-[#0b0c0d] font-semibold text-xs transition-colors"
            >
              Get Install Script
            </button>
          </div>
        </div>
      )}

      {/* Detail Modal */}
      <SkillModal
        skill={activeSkillModal}
        onClose={() => setActiveSkillModal(null)}
        isInStack={activeSkillModal ? selectedSkills.some((s) => s.id === activeSkillModal.id) : false}
        onToggleStack={(skill) => handleToggleSelectSkill(skill)}
      />

      {/* Stack Drawer */}
      <InstallDrawer
        isOpen={isStackOpen}
        onClose={() => setIsStackOpen(false)}
        selectedSkills={selectedSkills}
        onRemoveSkill={handleRemoveSkill}
        onClearStack={() => setSelectedSkills([])}
      />

    </div>
  );
};
