import React from 'react';
import { SettingsSearchItem } from './search';
import { Search } from 'lucide-react';

export const SettingsSearchResults = ({
  query,
  results,
  onSelect,
  onClear
}: {
  query: string;
  results: SettingsSearchItem[];
  onSelect: (item: SettingsSearchItem) => void;
  onClear: () => void;
}) => {
  if (!query.trim()) return null;
  if (results.length === 0) {
    return (
      <div className="mt-2 rounded-xl border border-border-muted bg-surface-2 shadow-surface-2xl p-3 animate-fade-in">
        <div className="flex items-center gap-2 text-[11px] text-txt-muted">
          <Search size={14} className="text-txt-faint" />
          Nessun risultato
        </div>
      </div>
    );
  }

  return (
    <div className="mt-2 rounded-xl border border-border-muted bg-surface-2 shadow-surface-2xl overflow-hidden animate-fade-in">
      <div className="max-h-[320px] overflow-y-auto custom-scrollbar">
        {results.slice(0, 10).map((r) => (
          <button
            key={r.id}
            onClick={() => {
              onSelect(r);
              onClear();
            }}
            className="w-full text-left px-3 py-2.5 hover:bg-white/[0.03] transition-all duration-200 border-b border-border-muted last:border-0"
          >
            <div className="text-[11px] font-bold text-txt-primary">{r.title}</div>
            <div className="text-[10px] text-txt-muted">{r.sectionLabel}</div>
            {r.description && <div className="text-[10px] text-txt-faint mt-1 line-clamp-2">{r.description}</div>}
          </button>
        ))}
      </div>
    </div>
  );
};
