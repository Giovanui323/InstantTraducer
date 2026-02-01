import React from 'react';
import { buildReaderHtml } from '../utils/renderText';

interface SimplifiedReaderProps {
  currentPage: number;
  viewMode: 'single' | 'side-by-side';
  translationMap: Record<number, string>;
  bottomPadding: number;
}

export const SimplifiedReader: React.FC<SimplifiedReaderProps> = ({
  currentPage,
  viewMode,
  translationMap,
  bottomPadding
}) => {
  const text = translationMap[currentPage] || "Nessuna traduzione disponibile per questa pagina.";
  const textRight = viewMode === 'side-by-side' ? (translationMap[currentPage + 1] || "Nessuna traduzione") : null;
  const readerHtmlLeft = buildReaderHtml(text);
  const readerHtmlRight = textRight != null ? buildReaderHtml(textRight || "") : null;

  return (
    <div className="flex-1 overflow-y-auto p-8 font-serif leading-relaxed text-lg max-w-4xl mx-auto space-y-8 select-text" style={{ paddingBottom: bottomPadding }}>
      <div className={`grid gap-12 ${viewMode === 'side-by-side' ? 'grid-cols-2' : 'grid-cols-1'}`}>
        <div className="bg-white/5 p-8 rounded-2xl border border-white/5 shadow-2xl">
          <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-6 border-b border-white/5 pb-2">Pagina {currentPage}</h3>
          {readerHtmlLeft ? (
            <div className="text-gray-200" dangerouslySetInnerHTML={{ __html: readerHtmlLeft }} />
          ) : (
            <div className="whitespace-pre-wrap text-gray-200">{text}</div>
          )}
        </div>
        {viewMode === 'side-by-side' && (
          <div className="bg-white/5 p-8 rounded-2xl border border-white/5 shadow-2xl">
            <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-6 border-b border-white/5 pb-2">Pagina {currentPage + 1}</h3>
            {readerHtmlRight ? (
              <div className="text-gray-200" dangerouslySetInnerHTML={{ __html: readerHtmlRight }} />
            ) : (
              <div className="whitespace-pre-wrap text-gray-200">{textRight}</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
