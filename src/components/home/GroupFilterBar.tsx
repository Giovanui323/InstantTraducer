import React from 'react';
import { Tag, Plus, X } from 'lucide-react';
import { useLibrary } from '../../contexts/LibraryContext';

interface GroupFilterBarProps {
  onCreateGroup: () => void;
}

export const GroupFilterBar: React.FC<GroupFilterBarProps> = ({ onCreateGroup }) => {
  const { availableGroups, selectedGroupFilters, toggleGroupFilter, deleteGroup } = useLibrary();

  return (
    <div className="px-2">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-[10px] font-bold text-txt-muted uppercase tracking-widest flex items-center gap-2">
          <Tag size={12} className="text-txt-muted" /> Gruppi
        </h3>
        <button
          onClick={onCreateGroup}
          className="text-txt-muted hover:text-accent transition-colors duration-150 p-1 hover:bg-white/[0.04] rounded-md"
          title="Crea nuovo gruppo"
        >
          <Plus size={14} />
        </button>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {availableGroups.length === 0 && <span className="text-[11px] text-txt-muted italic pl-1">Nessun gruppo</span>}
        {availableGroups.map(g => {
          const isSelected = selectedGroupFilters.includes(g.id);
          return (
            <div
              key={g.id}
              className={`inline-flex items-stretch rounded-lg border transition-all duration-200 overflow-hidden group ${
                isSelected
                  ? 'bg-accent/10 border-accent/25 shadow-glow-accent'
                  : 'bg-white/[0.03] border-border-muted hover:bg-white/[0.05] hover:border-border'
              }`}
            >
              <button
                type="button"
                onClick={() => toggleGroupFilter(g.id)}
                className={`px-2.5 py-1 text-[10px] font-semibold tracking-wide flex items-center gap-1.5 transition-colors duration-150 focus:outline-none ${
                  isSelected ? 'text-accent' : 'text-txt-secondary hover:text-txt-primary'
                }`}
                aria-pressed={isSelected}
              >
                {g.name}
              </button>
              <button
                type="button"
                onClick={() => deleteGroup(g.id)}
                className={`px-1.5 flex items-center justify-center text-txt-muted hover:text-danger hover:bg-danger/10 transition-all duration-150 focus:outline-none ${
                  isSelected ? 'border-l border-accent/15' : 'border-l border-border-muted'
                } opacity-0 group-hover:opacity-100 focus:opacity-100 focus-within:opacity-100`}
                aria-label={`Elimina gruppo ${g.name}`}
                title={`Elimina gruppo ${g.name}`}
              >
                <X size={10} />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
};
