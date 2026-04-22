import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { ChevronLeft, ChevronRight, Check, X as XIcon, Loader2 } from 'lucide-react';

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

const VIRTUALIZATION_BUFFER = 8;

const PagePlaceholder: React.FC<{ page: number }> = ({ page }) => (
  <div
    className="snap-start w-[60px] h-[85px] flex-shrink-0 rounded-lg bg-surface-3/20 border border-border-muted/30"
    data-page-placeholder={page}
  />
);

const PageThumb: React.FC<{
  page: number;
  isActive: boolean;
  status: PageStatus;
  thumb: string | null;
  text: string | null;
  theme: { bg: string; text: string; border: string };
  onSelect: (page: number) => void;
}> = React.memo(({ page, isActive, status, thumb, text, theme: currentTheme, onSelect }) => (
  <button
    data-active={isActive ? 'true' : 'false'}
    onClick={() => onSelect(page)}
    className={`snap-start group relative w-[60px] h-[85px] flex-shrink-0 rounded-lg overflow-hidden border transition-all duration-200 ease-out-expo ${
      isActive
        ? 'border-accent ring-2 ring-accent/25 scale-110 z-10 shadow-[0_0_12px_rgba(245,158,11,0.2)]'
        : status === 'done'
          ? 'border-success/30 hover:border-success/60 hover:scale-[1.06]'
          : status === 'error'
            ? 'border-danger/30 hover:border-danger/60 hover:scale-[1.06]'
            : status === 'in_progress'
              ? 'border-accent/30 hover:border-accent/50 hover:scale-[1.06]'
              : 'border-border-muted/40 hover:border-border hover:scale-[1.06]'
    } bg-surface-3/30`}
    title={`Pagina ${page}${status === 'done' ? ' (tradotta)' : status === 'in_progress' ? ' (in traduzione)' : status === 'error' ? ' (errore)' : ' (da tradurre)'}`}
  >
    {status === 'done' && text ? (
      <div className={`w-full h-full ${currentTheme.bg} p-1.5 overflow-hidden select-none flex flex-col items-start`}>
        <div className={`text-[6px] leading-[7px] ${currentTheme.text} text-left font-serif opacity-75 whitespace-pre-wrap tracking-tight`}>
          {text.slice(0, 300)}
        </div>
      </div>
    ) : thumb ? (
      <img
        src={thumb}
        alt={`Pagina ${page}`}
        className="w-full h-full object-contain select-none opacity-80 group-hover:opacity-100 transition-opacity duration-200"
        loading="lazy"
        draggable={false}
      />
    ) : (
      <div className="w-full h-full bg-surface-4/30 flex items-center justify-center">
        <div className="w-4 h-6 border border-border/50 rounded-sm bg-surface-4/40" />
      </div>
    )}

    {/* Page number pill */}
    <div className={`absolute top-1 left-1 px-1.5 py-0.5 rounded-md text-[7px] font-bold font-mono tabular-nums tracking-tight backdrop-blur-md transition-colors duration-200 ${
      isActive
        ? 'bg-accent/90 text-white border border-accent/60'
        : 'bg-black/50 text-white/85 border border-white/[0.06]'
    }`}>
      {page}
    </div>

    {/* Status badge */}
    <div className="absolute bottom-1 right-1">
      {status === 'done' ? (
        <div className="w-3.5 h-3.5 rounded-full bg-success/90 flex items-center justify-center shadow-[0_0_6px_rgba(63,185,80,0.3)]">
          <Check size={8} strokeWidth={3} className="text-white" />
        </div>
      ) : status === 'in_progress' ? (
        <div className="w-3.5 h-3.5 rounded-full bg-accent/20 flex items-center justify-center">
          <Loader2 size={10} className="text-accent animate-spin" />
        </div>
      ) : status === 'error' ? (
        <div className="w-3.5 h-3.5 rounded-full bg-danger/90 flex items-center justify-center shadow-[0_0_6px_rgba(248,81,73,0.3)]">
          <XIcon size={8} strokeWidth={3} className="text-white" />
        </div>
      ) : (
        <div className="w-2 h-2 rounded-full bg-surface-4 border border-border-muted/50" />
      )}
    </div>

    {/* Hover overlay */}
    <div className={`absolute inset-0 pointer-events-none rounded-lg transition-opacity duration-200 ${isActive ? 'bg-transparent' : 'bg-black/[0.06] group-hover:bg-transparent'}`} />
  </button>
));
PageThumb.displayName = 'PageThumb';

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
  const [visibleCenter, setVisibleCenter] = useState(currentPage);

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
    const active = el.querySelector<HTMLElement>('[data-active="true"]');
    if (active) {
      const rect = active.getBoundingClientRect();
      const parentRect = el.getBoundingClientRect();
      if (rect.left < parentRect.left || rect.right > parentRect.right) {
        active.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
      }
    }
  }, [currentPage]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    let raf: number | null = null;
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = null;
        const scrollLeft = el.scrollLeft;
        const itemWidth = 62;
        const centerPage = Math.floor(scrollLeft / itemWidth) + Math.floor(el.clientWidth / itemWidth / 2) + 1;
        setVisibleCenter(Math.max(1, Math.min(totalPages, centerPage)));
      });
    };

    el.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      el.removeEventListener('scroll', onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [totalPages]);

  useEffect(() => {
    setVisibleCenter(currentPage);
  }, [currentPage]);

  const pages = useMemo(() => {
    const arr: number[] = [];
    for (let p = 1; p <= (totalPages || 0); p++) arr.push(p);
    return arr;
  }, [totalPages]);

  const themeStyles = {
    light: { bg: 'bg-[#faf9f6]', text: 'text-stone-900', border: 'border-stone-200' },
    sepia: { bg: 'bg-[#f5eedd]', text: 'text-[#5b4636]', border: 'border-[#e3d7bf]' },
    dark: { bg: 'bg-[#0c1631]', text: 'text-[#c8d6f0]', border: 'border-accent/[0.08]' }
  };
  const currentTheme = themeStyles[theme] || themeStyles.dark;

  const visibleStart = Math.max(1, visibleCenter - VIRTUALIZATION_BUFFER);
  const visibleEnd = Math.min(totalPages, visibleCenter + VIRTUALIZATION_BUFFER);

  const handleScrollLeft = useCallback(() => {
    containerRef.current?.scrollBy({ left: -260, behavior: 'smooth' });
  }, []);

  const handleScrollRight = useCallback(() => {
    containerRef.current?.scrollBy({ left: 260, behavior: 'smooth' });
  }, []);

  return (
    <div className="w-full max-w-5xl mx-auto">
      <div className="glass-panel flex items-center gap-2 px-3 py-2 rounded-2xl shadow-surface-2xl">
        <button
          onClick={handleScrollLeft}
          className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-white/[0.06] text-txt-muted hover:text-txt-primary transition-all duration-200 active:scale-90"
          title="Scorri a sinistra"
        >
          <ChevronLeft size={14} />
        </button>
        <div
          ref={containerRef}
          className="flex-1 overflow-x-auto scroll-smooth snap-x snap-mandatory hide-scrollbar"
        >
          <div className="flex items-stretch gap-2 px-1">
            {pages.map((page) => {
              if (page < visibleStart || page > visibleEnd) {
                return <PagePlaceholder key={page} page={page} />;
              }

              const thumb = getThumbnail(page);
              const status = getStatus(page);
              const isActive = page === currentPage;
              const text = getTranslatedText?.(page) ?? null;

              return (
                <PageThumb
                  key={page}
                  page={page}
                  isActive={isActive}
                  status={status}
                  thumb={thumb}
                  text={text}
                  theme={currentTheme}
                  onSelect={onSelect}
                />
              );
            })}
          </div>
        </div>
        <button
          onClick={handleScrollRight}
          className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-white/[0.06] text-txt-muted hover:text-txt-primary transition-all duration-200 active:scale-90"
          title="Scorri a destra"
        >
          <ChevronRight size={14} />
        </button>
      </div>
    </div>
  );
};

export default PagePreviewStrip;
