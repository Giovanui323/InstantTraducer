import React from 'react';
import { Book, FileText, ChevronRight } from 'lucide-react';

export interface SearchResultItem {
  id: string;
  title: string;
  subtitle?: string;
  snippet: string;
  page?: number;
  fileId?: string;
  matchIndex: number;
}

interface SearchResultsProps {
  results: SearchResultItem[];
  onSelect: (item: SearchResultItem) => void;
  searchTerm: string;
  className?: string;
}

export const SearchResults: React.FC<SearchResultsProps> = ({ results, onSelect, searchTerm, className = '' }) => {
  if (results.length === 0) {
    return (
      <div className={`p-6 text-center text-txt-muted text-[12px] ${className}`}>
        Nessun risultato trovato
      </div>
    );
  }

  const highlightText = (text: string, term: string) => {
    if (!term) return text;
    const parts = text.split(new RegExp(`(${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'));
    return (
      <>
        {parts.map((part, i) =>
          part.toLowerCase() === term.toLowerCase() ? (
            <span key={i} className="bg-accent/25 text-accent rounded px-0.5 font-medium">
              {part}
            </span>
          ) : (
            part
          )
        )}
      </>
    );
  };

  return (
    <div className={`flex flex-col max-h-[400px] overflow-y-auto custom-scrollbar ${className}`}>
      {results.map((item) => (
        <button
          key={item.id}
          onClick={() => onSelect(item)}
          className="flex flex-col gap-1 p-3 hover:bg-white/[0.03] border-b border-border-muted last:border-0 text-left transition-all duration-200 group"
        >
          <div className="flex items-center justify-between w-full">
            <div className="flex items-center gap-2 text-[11px] font-semibold text-accent">
              {item.fileId ? <Book size={12} /> : <FileText size={12} />}
              <span>{item.title}</span>
              {item.subtitle && (
                <span className="text-txt-faint font-normal truncate max-w-[150px]">
                  • {item.subtitle}
                </span>
              )}
            </div>
            <ChevronRight size={12} className="opacity-0 group-hover:opacity-50 text-txt-muted transition-opacity duration-200" />
          </div>

          <div className="text-[11px] text-txt-secondary leading-relaxed line-clamp-2 break-words">
            {highlightText(item.snippet, searchTerm)}
          </div>
        </button>
      ))}
    </div>
  );
};
