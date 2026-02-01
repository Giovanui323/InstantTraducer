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
      <div className={`p-4 text-center text-gray-400 text-sm ${className}`}>
        Nessun risultato trovato
      </div>
    );
  }

  // Helper to highlight the search term in the snippet
  const highlightText = (text: string, term: string) => {
    if (!term) return text;
    const parts = text.split(new RegExp(`(${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'));
    return (
      <>
        {parts.map((part, i) => 
          part.toLowerCase() === term.toLowerCase() ? (
            <span key={i} className="bg-yellow-500/40 text-yellow-200 rounded px-0.5 font-medium">
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
    <div className={`flex flex-col max-h-[400px] overflow-y-auto ${className}`}>
      {results.map((item) => (
        <button
          key={item.id}
          onClick={() => onSelect(item)}
          className="flex flex-col gap-1 p-3 hover:bg-white/10 border-b border-white/5 last:border-0 text-left transition-colors group"
        >
          <div className="flex items-center justify-between w-full">
            <div className="flex items-center gap-2 text-xs font-semibold text-blue-300">
              {item.fileId ? <Book size={12} /> : <FileText size={12} />}
              <span>{item.title}</span>
              {item.subtitle && (
                <span className="text-gray-500 font-normal truncate max-w-[150px]">
                  • {item.subtitle}
                </span>
              )}
            </div>
            <ChevronRight size={12} className="opacity-0 group-hover:opacity-50 text-gray-400" />
          </div>
          
          <div className="text-[11px] text-gray-300 leading-relaxed line-clamp-2 break-words">
            {highlightText(item.snippet, searchTerm)}
          </div>
        </button>
      ))}
    </div>
  );
};
