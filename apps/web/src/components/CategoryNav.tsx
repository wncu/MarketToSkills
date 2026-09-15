import React from 'react';
import { Category } from '../types';

interface CategoryNavProps {
  categories: Category[];
  selectedCategory: string;
  onSelectCategory: (catId: string) => void;
  totalSkills: number;
}

export const CategoryNav: React.FC<CategoryNavProps> = ({
  categories,
  selectedCategory,
  onSelectCategory,
  totalSkills,
}) => {
  return (
    <div className="w-full overflow-x-auto pb-1 scrollbar-none border-b border-[#1f2226]">
      <div className="flex items-center gap-1.5 min-w-max py-1.5">
        
        {/* All Skills Filter */}
        <button
          onClick={() => onSelectCategory('all')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs transition-colors ${
            selectedCategory === 'all'
              ? 'bg-[#20242a] text-[#edece6] font-medium border border-[#31363e]'
              : 'text-[#81878f] hover:text-[#edece6] hover:bg-[#141619]'
          }`}
        >
          <span>All Skills</span>
          <span className="text-[10px] font-mono text-[#636971]">
            {totalSkills > 0 ? totalSkills.toLocaleString() : '3,214'}
          </span>
        </button>

        {/* Categories */}
        {categories.map((cat) => {
          const isSelected = selectedCategory === cat.id;
          return (
            <button
              key={cat.id}
              onClick={() => onSelectCategory(cat.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs transition-colors ${
                isSelected
                  ? 'bg-[#20242a] text-[#edece6] font-medium border border-[#31363e]'
                  : 'text-[#81878f] hover:text-[#edece6] hover:bg-[#141619]'
              }`}
            >
              <span>{cat.label}</span>
              <span className="text-[10px] font-mono text-[#636971]">
                {cat.count}
              </span>
            </button>
          );
        })}

      </div>
    </div>
  );
};
