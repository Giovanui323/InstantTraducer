import React, { useEffect, useMemo, useRef } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

type PageStatus = 'done' | 'in_progress' | 'pending' | 'error';

export interface PagePreviewStripProps {
  totalPages: number;
  currentPage: number;
  onSelect: (page: number) => void;
  onClose: () => void;
  getThumbnail: (page: number) => string | null;
  getStatus: (page: number) => PageStatus;
  getTranslatedText?: (page: number) => string | null;
  theme?: 'light' | 'sepia' | 'dark';
}

export const PagePreviewStrip: React.FC<PagePreviewStripProps> = ({
  totalPages,
  currentPage,
  onSelect,
  onClose,
  getThumbnail,
  getStatus,
  getTranslatedText,
  theme = 'dark'
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const active = el.querySelector<HTMLDivElement>('[data-active=\"true\"]');
    if (active) {
      const rect = active.getBoundingClientRect();
      const parentRect = el.getBoundingClientRect();
      if (rect.left < parentRect.left || rect.right > parentRect.right) {
        active.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
      }
    }
  }, [currentPage]);

  const pages = useMemo(() => {
    const arr: number[] = [];
    for (let p = 1; p <= (totalPages || 0); p++) arr.push(p);
    return arr;
  }, [totalPages]);

  // Theme-based styles for the thumbnail content
  const themeStyles = {
    light: { bg: 'bg-white', text: 'text-gray-900', border: 'border-gray-200' },
    sepia: { bg: 'bg-[#f4ecd8]', text: 'text-[#5b4636]', border: 'border-[#e3d7bf]' },
    dark: { bg: 'bg-[#1a1a1a]', text: 'text-gray-300', border: 'border-white/10' }
  };
  const currentTheme = themeStyles[theme] || themeStyles.dark;

  return (
    <div className="w-full max-w-5xl mx-auto">
      <div className="flex items-center gap-2 px-3">
        <button
          onClick={() => {
            const prev = Math.max(1, currentPage - 1);
            const el = containerRef.current;
            el?.scrollBy({ left: -260, behavior: 'smooth' });
          }}
          className="w-8 h-8 flex items-center justify-center rounded-full bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white border border-white/10 transition-colors"
          title="Scorri a sinistra"
        >
          <ChevronLeft size={18} />
        </button>
        <div
          ref={containerRef}
          className="flex-1 overflow-x-auto scroll-smooth snap-x snap-mandatory hide-scrollbar"
        >
          <div className="flex items-stretch gap-2 py-2 px-1">
            {pages.map((page) => {
              const thumb = getThumbnail(page);
              const status = getStatus(page);
              const isActive = page === currentPage;
              const text = getTranslatedText?.(page);

              return (
                <button
                  key={page}
                  data-active={isActive ? 'true' : 'false'}
                  onClick={() => onSelect(page)}
                  className={`snap-start group relative w-[60px] h-[85px] flex-shrink-0 rounded-lg overflow-hidden border transition-all duration-200 ${isActive
                    ? 'border-blue-500 shadow-[0_0_0_2px_rgba(59,130,246,0.5)] scale-105 z-10'
                    : 'border-white/10 hover:border-white/30 hover:scale-105'
                    } bg-black/40 shadow-lg`}
                  title={`Apri pagina ${page}`}
                >
                  {thumb ? (
                    <img
                      src={thumb}
                      alt={`Anteprima pagina ${page}`}
                      className="w-full h-full object-contain select-none opacity-90 group-hover:opacity-100 transition-opacity"
                      loading="lazy"
                      draggable={false}
                    />
                  ) : text ? (
                    <div className={`w-full h-full ${currentTheme.bg} p-1.5 overflow-hidden select-none flex flex-col items-start`}>
                      <div className={`text-[6px] leading-[7px] ${currentTheme.text} text-left font-serif opacity-75 whitespace-pre-wrap tracking-tight`}>
                        {text.slice(0, 600)}
                      </div>
                    </div>
                  ) : (
                    <div className="w-full h-full bg-white/5 flex items-center justify-center">
                      <div className="w-4 h-6 border border-white/10 rounded-sm bg-white/5" />
                    </div>
                  )}

                  {/* Page number badge */}
                  <div className="absolute top-1 left-1 px-1 rounded-sm bg-black/60 backdrop-blur-[1px] border border-white/5">
                    <span className="text-[7px] font-bold text-white/90 font-mono tracking-tighter">{page}</span>
                  </div>

                  {/* Status indicator (subtle dot) */}
                  <div className="absolute top-1 right-1">
                    <div className={`w-1.5 h-1.5 rounded-full shadow-sm ${status === 'done' ? 'bg-emerald-500' :
                        status === 'in_progress' ? 'bg-amber-500 animate-pulse' :
                          status === 'error' ? 'bg-red-500' : 'bg-transparent'
                      }`} />
                  </div>

                  {/* Active overlay highlight */}
                  <div className={`absolute inset-0 pointer-events-none transition-opacity duration-200 ${isActive ? 'bg-transparent' : 'bg-black/10 group-hover:bg-transparent'}`} />
                </button>
              );
            })}
          </div>
        </div>
        <button
          onClick={() => {
            const el = containerRef.current;
            el?.scrollBy({ left: 260, behavior: 'smooth' });
          }}
          className="w-8 h-8 flex items-center justify-center rounded-full bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white border border-white/10 transition-colors"
          title="Scorri a destra"
        >
          <ChevronRight size={18} />
        </button>
      </div>
    </div>
  );
};

export default PagePreviewStrip;
