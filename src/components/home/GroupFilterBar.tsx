import React from 'react';
import { Tag } from 'lucide-react';
import { useLibrary } from '../../contexts/LibraryContext';

interface GroupFilterBarProps {
  onOpenGroupManager: () => void;
}

export const GroupFilterBar: React.FC<GroupFilterBarProps> = ({ onOpenGroupManager }) => {
  const { availableGroups, selectedGroupFilters, toggleGroupFilter } = useLibrary();

  return (
    <div className="px-2">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-[10px] font-bold text-txt-muted uppercase tracking-widest flex items-center gap-2">
          <Tag size={12} className="text-txt-muted" /> Gruppi
        </h3>
        <button
          onClick={onOpenGroupManager}
          className="text-[10px] font-semibold text-txt-muted hover:text-accent uppercase tracking-wider transition-colors duration-150 px-1.5 py-0.5 hover:bg-white/[0.04] rounded-md"
        >
          Gestisci
        </button>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {availableGroups.length === 0 && <span className="text-[11px] text-txt-muted italic pl-1">Nessun gruppo</span>}
        {availableGroups.map(g => {
          const isSelected = selectedGroupFilters.includes(g.id);
          return (
            <button
              key={g.id}
              type="button"
              onClick={() => toggleGroupFilter(g.id)}
              className={`inline-flex items-center rounded-lg border px-2.5 py-1 text-[10px] font-semibold tracking-wide transition-all duration-200 focus:outline-none ${
                isSelected
                  ? 'bg-accent/10 border-accent/25 text-accent shadow-glow-accent'
                  : 'bg-white/[0.03] border-border-muted text-txt-secondary hover:bg-white/[0.05] hover:border-border hover:text-txt-primary'
              }`}
              aria-pressed={isSelected}
            >
              {g.name}
            </button>
          );
        })}
      </div>
    </div>
  );
};
