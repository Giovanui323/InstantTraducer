import React, { useState, useMemo } from 'react';
import { AlertCircle, Pencil, Trash2, MoreHorizontal, Tag, FileDown, Loader2, Plus, Settings, Search, X } from 'lucide-react';
import { useLibrary } from '../../contexts/LibraryContext';
import { ReadingProgress } from '../../types';
import { getLanguageFlag } from '../../utils/languageUtils';
import { BackgroundTranslationSlotCard } from './BackgroundTranslationSlotCard';
import { TranslationJobDot } from './TranslationJobDot';
import { FallbackBookCover } from './FallbackBookCover';
import { ActiveProjectTranslationControls } from '../translation/ActiveProjectTranslationControls';

interface RecentBooksGridProps {
  onOpenProject: (fileId: string) => void;
  onRenameProject: (fileId: string, currentName: string, e: React.MouseEvent, currentLanguage?: string) => void;
  onDeleteProject: (fileId: string, e: React.MouseEvent) => void;
  onEditLanguageProject?: (fileId: string, currentLang: string) => void;
  onManageGroups: (fileId: string) => void;
  onExportGpt: (fileId: string) => void;
  onSetOpenMenuId: (id: string | null) => void;
  openMenuId: string | null;
  isActiveProjectPaused: boolean;
  activeProjectQueueStats: { active: number; queued: number };
  onPauseActiveProject: () => void;
  onStopActiveProject: () => void;
  isOpeningProject?: string | null;
  onCreateNewProject?: () => void;
}

export const RecentBooksGrid: React.FC<RecentBooksGridProps> = ({
  onOpenProject,
  onRenameProject,
  onDeleteProject,
  onEditLanguageProject,
  onManageGroups,
  onExportGpt,
  onSetOpenMenuId,
  openMenuId,
  isActiveProjectPaused,
  activeProjectQueueStats,
  onPauseActiveProject,
  onStopActiveProject,
  isOpeningProject,
  onCreateNewProject
}) => {
  const { recentBooks, selectedGroupFilters, currentProjectFileId } = useLibrary();
  const [openingFileId, setOpeningFileId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const isMounted = React.useRef(true);

  React.useEffect(() => {
    return () => { isMounted.current = false; };
  }, []);

  const handleOpen = async (fileId: string) => {
    if (openingFileId || isOpeningProject) return;
    setOpeningFileId(fileId);
    try {
      await onOpenProject(fileId);
    } finally {
      if (isMounted.current) {
        setOpeningFileId(null);
      }
    }
  };

  const allBooks = useMemo(() => Object.values(recentBooks || {})
    .filter((b): b is ReadingProgress => !!(b && b.fileId))
    .filter(b => {
      if (selectedGroupFilters.length === 0) return true;
      if (!b || !b.groups) return false;
      return selectedGroupFilters.every(g => b.groups?.includes(g));
    })
    .sort((a, b) => b.timestamp - a.timestamp), [recentBooks, selectedGroupFilters]);

  const normalizedSearch = searchTerm.trim().toLowerCase();
  const filteredBooks = normalizedSearch
    ? allBooks.filter(b => (b.fileName || '').toLowerCase().includes(normalizedSearch))
    : allBooks;
  const hasSearchActive = normalizedSearch.length > 0;
  const totalBooks = allBooks.length;

  const isCurrentTranslating = activeProjectQueueStats.active > 0 || activeProjectQueueStats.queued > 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 px-2">
        <h3 className="flex items-center gap-2 text-[10px] font-bold text-txt-muted uppercase tracking-[0.22em] shrink-0">
          <span className="inline-block w-3 h-px bg-accent/40" aria-hidden="true" />
          Scaffale
        </h3>

        {totalBooks > 0 && (
          <div className="library-search flex-1 max-w-[280px] min-w-0">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-accent/55 pointer-events-none" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Escape') setSearchTerm(''); }}
              placeholder="Cerca un libro..."
              aria-label="Cerca un libro nella libreria"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                className="shrink-0 p-0.5 rounded text-txt-muted hover:text-accent hover:bg-white/[0.06] transition-colors duration-150 focus:outline-none"
                title="Cancella ricerca"
                aria-label="Cancella ricerca"
              >
                <X size={12} />
              </button>
            )}
          </div>
        )}

        <span className="text-[11px] text-txt-muted tabular-nums shrink-0">
          {hasSearchActive
            ? `${filteredBooks.length} di ${totalBooks}`
            : `${totalBooks} ${totalBooks === 1 ? 'volume' : 'volumi'}`}
        </span>
      </div>

      <div
        className="overflow-y-auto pr-1 custom-scrollbar"
        role="region"
        aria-label="Scaffale dei progetti"
      >
        <BackgroundTranslationSlotCard onOpenProject={onOpenProject} />

        {filteredBooks.length === 0 ? (
          hasSearchActive ? (
            <div className="flex flex-col items-center justify-center px-6 py-12 text-center rounded-2xl border border-dashed border-border-muted/80 bg-surface-2/30 animate-fade-in">
              <Search size={28} className="text-txt-muted/50 mb-3" strokeWidth={1.4} />
              <span className="font-reader text-[15px] font-medium text-txt-secondary tracking-tight">Nessun libro trovato</span>
              <p className="mt-1 text-[11.5px] text-txt-muted max-w-[280px]">
                Nessun volume corrisponde a <span className="text-accent/90 font-semibold">"{searchTerm}"</span>.
              </p>
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                className="mt-4 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-white/[0.04] border border-border-muted text-[11px] text-txt-secondary hover:bg-white/[0.06] hover:text-txt-primary hover:border-border transition-all duration-200 focus:outline-none"
              >
                <X size={12} /> Cancella ricerca
              </button>
            </div>
          ) : (
            <div className="relative flex flex-col items-center justify-center px-6 py-16 text-center rounded-2xl border border-dashed border-border-muted/80 bg-gradient-to-b from-surface-2/40 to-surface-1/20 text-txt-muted animate-fade-in overflow-hidden">
              {/* Decorative book stack illustration */}
              <div className="relative w-24 h-16 mb-5 opacity-90">
                <div className="absolute left-0 top-3 w-7 h-12 rounded-sm bg-gradient-to-b from-[#7c1d2e] to-[#2a0e16] shadow-[0_4px_8px_-2px_rgba(0,0,0,0.5)] rotate-[-6deg] border border-black/40" />
                <div className="absolute left-7 top-1 w-7 h-14 rounded-sm bg-gradient-to-b from-[#1e3a5f] to-[#0b1a30] shadow-[0_4px_8px_-2px_rgba(0,0,0,0.5)] rotate-[2deg] border border-black/40" />
                <div className="absolute left-[58px] top-2 w-7 h-13 rounded-sm bg-gradient-to-b from-[#3d2817] to-[#1a1109] shadow-[0_4px_8px_-2px_rgba(0,0,0,0.5)] rotate-[8deg] border border-black/40" style={{ height: '52px' }} />
              </div>
              <span className="font-reader text-[16px] font-semibold text-txt-secondary tracking-tight">Lo scaffale è vuoto</span>
              <p className="mt-1.5 text-[11.5px] text-txt-muted max-w-[260px] leading-relaxed">
                Aggiungi il tuo primo volume e inizia la tua biblioteca.
              </p>
              {onCreateNewProject && (
                <button
                  type="button"
                  onClick={onCreateNewProject}
                  className="mt-5 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-accent/10 border border-accent/25 text-[12px] text-accent font-semibold tracking-wide hover:bg-accent/15 hover:border-accent/40 hover:shadow-glow-accent transition-all duration-200 focus:outline-none"
                >
                  <Plus size={14} /> Aggiungi primo libro
                </button>
              )}
            </div>
          )
        ) : (
          <div
            className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-x-5 gap-y-10 pb-32 pt-2 px-6"
            role="list"
          >
            {filteredBooks.map((book, idx) => {
              const isActive = book.fileId === currentProjectFileId;
              const isOpening = openingFileId === book.fileId || isOpeningProject === book.fileId;
              const menuDomId = `book-menu-${book.fileId}`;
              const menuOpen = openMenuId === book.fileId;
              return (
                <div
                  key={book.fileId}
                  role="listitem"
                  className={`book-card relative group cursor-pointer ${
                    menuOpen ? 'z-30' : 'z-10'
                  } ${isOpening ? 'opacity-60 pointer-events-none' : ''}`}
                  style={{
                    animation: `fadeInUp 360ms cubic-bezier(0.16, 1, 0.3, 1) both`,
                    animationDelay: `${Math.min(idx, 12) * 40}ms`,
                  }}
                  onClick={() => handleOpen(book.fileId || "")}
                >
                  {/* ── Cover wrapper (relative anchor for the menu, no overflow clip) ── */}
                  <div className="relative">
                  {/* ── Cover (with overflow:hidden for inner art) ── */}
                  <div
                    className={`book-cover relative aspect-[2/3] rounded-sm overflow-hidden border transition-all duration-300 ease-out-expo ${
                      isOpening ? '' : 'group-hover:-translate-y-1.5 group-hover:[transform:translateY(-6px)_rotateX(2deg)_rotateY(-1deg)]'
                    } ${
                      isActive
                        ? 'border-success/40 shadow-[0_8px_24px_-8px_rgba(0,0,0,0.5),0_0_0_1px_rgba(52,211,153,0.25)]'
                        : 'border-border-muted shadow-[0_4px_12px_-4px_rgba(0,0,0,0.4)] group-hover:shadow-[0_18px_32px_-10px_rgba(0,0,0,0.7),0_0_0_1px_rgba(245,158,11,0.12)] group-hover:border-accent/20'
                    }`}
                    style={{
                      backgroundImage: book.thumbnail
                        ? `linear-gradient(180deg, rgba(0,0,0,0) 55%, rgba(0,0,0,0.55) 100%), url("${book.thumbnail}")`
                        : undefined,
                      backgroundSize: 'cover',
                      backgroundPosition: 'center top',
                      backgroundColor: book.thumbnail ? undefined : '#2a2d35',
                      transformOrigin: 'center bottom',
                    }}
                  >
                    {/* Spine highlight (left edge) — gilded on hover */}
                    <div
                      className="pointer-events-none absolute inset-y-0 left-0 w-[8px] bg-gradient-to-r from-black/40 via-black/20 to-transparent transition-all duration-300 group-hover:from-amber-700/40 group-hover:via-amber-500/15"
                      aria-hidden
                    />
                    {/* Inner gilt edge on hover */}
                    <div
                      className="pointer-events-none absolute inset-y-0 left-0 w-px bg-amber-300/0 group-hover:bg-amber-300/40 transition-colors duration-300"
                      aria-hidden
                    />
                    {/* Top sheen — paper light */}
                    <div
                      className="pointer-events-none absolute inset-x-0 top-0 h-1/3 bg-gradient-to-b from-white/[0.06] to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                      aria-hidden
                    />

                    {!book.thumbnail && <FallbackBookCover fileName={book.fileName || ''} />}

                    {/* Language flag */}
                    <div className="absolute top-2 right-2 flex items-center gap-1 z-[2]">
                      {book.inputLanguage && (
                        <span
                          className="text-[13px] leading-none bg-black/60 backdrop-blur-md rounded-full w-7 h-7 flex items-center justify-center border border-white/10 shadow-md transition-transform duration-200 group-hover:scale-110"
                          title={book.inputLanguage}
                        >
                          {getLanguageFlag(book.inputLanguage)}
                        </span>
                      )}
                    </div>

                    {/* Missing PDF warning */}
                    {book.hasSafePdf === false && (
                      <div
                        className="absolute top-2 left-2 bg-danger/90 text-white rounded-full p-1 border border-white/20 shadow-md z-[2]"
                        title="PDF originale mancante"
                      >
                        <AlertCircle size={10} />
                      </div>
                    )}

                    {/* Active "Aperto" brass-style badge */}
                    {isActive && (
                      <div
                        className="absolute top-2 left-2 px-2 py-0.5 text-white text-[8px] font-bold uppercase tracking-[0.15em] rounded-full border border-white/25 shadow-md z-[2]"
                        style={{
                          background: 'linear-gradient(180deg, rgba(110,231,183,0.95) 0%, rgba(52,211,153,0.95) 50%, rgba(20,150,100,0.95) 100%)',
                          boxShadow: '0 1px 0 rgba(255,255,255,0.18) inset, 0 -1px 0 rgba(0,0,0,0.18) inset, 0 2px 5px rgba(0,0,0,0.4)',
                          textShadow: '0 1px 0 rgba(0,0,0,0.2)',
                        }}
                      >
                        Aperto
                      </div>
                    )}

                    <TranslationJobDot
                      fileId={book.fileId || ""}
                      isCurrentProjectTranslating={isActive && isCurrentTranslating}
                    />

                    {/* Loading overlay */}
                    {isOpening && (
                      <div className="absolute inset-0 flex items-center justify-center bg-surface-0/60 backdrop-blur-sm z-[3]">
                        <Loader2 className="w-6 h-6 text-accent animate-spin" />
                      </div>
                    )}

                    {/* Action bar — soft glass instead of harsh black */}
                    <div
                      className={`absolute inset-x-0 bottom-0 px-2 pb-2 pt-10 flex items-end justify-end gap-1 transition-opacity duration-200 z-[2] bg-gradient-to-t from-black/70 via-black/30 to-transparent ${
                        menuOpen ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                      }`}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        onClick={(e) => { e.stopPropagation(); onRenameProject(book.fileId || "", book.fileName || "", e, book.inputLanguage); }}
                        className="p-1.5 text-white/85 hover:text-white bg-white/10 hover:bg-white/20 rounded-md backdrop-blur-md border border-white/15 transition-all duration-150 shadow-sm focus:outline-none"
                        title="Rinomina"
                        aria-label="Rinomina"
                      >
                        <Pencil size={11} />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); onDeleteProject(book.fileId || "", e); }}
                        className="p-1.5 text-white/85 hover:text-danger bg-white/10 hover:bg-danger/30 rounded-md backdrop-blur-md border border-white/15 hover:border-danger/40 transition-all duration-150 shadow-sm focus:outline-none"
                        title="Rimuovi"
                        aria-label="Rimuovi"
                      >
                        <Trash2 size={11} />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); onSetOpenMenuId(menuOpen ? null : (book.fileId || "")); }}
                        className={`p-1.5 text-white/85 hover:text-white rounded-md backdrop-blur-md border transition-all duration-150 shadow-sm menu-trigger focus:outline-none ${
                          menuOpen
                            ? 'bg-accent/30 border-accent/40 text-white'
                            : 'bg-white/10 hover:bg-white/20 border-white/15'
                        }`}
                        title="Altro"
                        aria-haspopup="menu"
                        aria-expanded={menuOpen}
                        aria-controls={menuOpen ? menuDomId : undefined}
                        onKeyDown={(e) => {
                          if (e.key === 'Escape') {
                            e.stopPropagation();
                            onSetOpenMenuId(null);
                          }
                        }}
                      >
                        <MoreHorizontal size={11} />
                      </button>
                    </div>
                  </div>

                  {/* ── Dropdown menu — sibling of the cover (NOT inside overflow:hidden) ── */}
                  {menuOpen && (
                    <div
                      id={menuDomId}
                      role="menu"
                      className="absolute left-0 top-full mt-1.5 glass-panel rounded-xl overflow-hidden z-50 flex flex-col min-w-[170px] menu-container animate-fade-in-scale shadow-surface-xl"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        onClick={(e) => { e.stopPropagation(); onSetOpenMenuId(null); onManageGroups(book.fileId || ""); }}
                        className="flex items-center gap-2.5 w-full px-3 py-2.5 text-[11px] text-txt-secondary hover:bg-white/[0.04] hover:text-txt-primary text-left transition-colors duration-100 focus:outline-none"
                        role="menuitem"
                      >
                        <Tag size={13} className="text-txt-muted" /> Gestisci Gruppi
                      </button>
                      {onEditLanguageProject && (
                        <button
                          onClick={(e) => { e.stopPropagation(); onSetOpenMenuId(null); onEditLanguageProject(book.fileId || "", book.inputLanguage || ""); }}
                          className="flex items-center gap-2.5 w-full px-3 py-2.5 text-[11px] text-txt-secondary hover:bg-white/[0.04] hover:text-txt-primary text-left transition-colors duration-100 focus:outline-none"
                          role="menuitem"
                        >
                          <Settings size={13} className="text-txt-muted" /> Cambia Lingua
                        </button>
                      )}
                      <button
                        onClick={(e) => { e.stopPropagation(); onSetOpenMenuId(null); onRenameProject(book.fileId || "", book.fileName || "", e, book.inputLanguage); }}
                        className="flex items-center gap-2.5 w-full px-3 py-2.5 text-[11px] text-txt-secondary hover:bg-white/[0.04] hover:text-txt-primary text-left transition-colors duration-100 focus:outline-none"
                        role="menuitem"
                      >
                        <Pencil size={13} className="text-txt-muted" /> Rinomina
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); onSetOpenMenuId(null); onExportGpt(book.fileId || ""); }}
                        className="flex items-center gap-2.5 w-full px-3 py-2.5 text-[11px] text-txt-secondary hover:bg-white/[0.04] hover:text-txt-primary text-left border-t border-border-muted transition-colors duration-100 focus:outline-none"
                        role="menuitem"
                      >
                        <FileDown size={13} className="text-txt-muted" /> Esporta (.gpt)
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); onSetOpenMenuId(null); onDeleteProject(book.fileId || "", e); }}
                        className="flex items-center gap-2.5 w-full px-3 py-2.5 text-[11px] text-danger/80 hover:bg-danger/5 hover:text-danger text-left transition-colors duration-100 focus:outline-none"
                        role="menuitem"
                      >
                        <Trash2 size={13} /> Rimuovi
                      </button>
                    </div>
                  )}
                  </div>

                  <div className="book-shelf" aria-hidden="true" />

                  <div className="px-0.5">
                    <p
                      className="font-reader text-[13px] font-medium text-txt-primary/95 leading-snug line-clamp-2 tracking-tight group-hover:text-txt-primary transition-colors duration-200"
                      title={book.fileName}
                    >
                      {book.fileName}
                    </p>
                    <div className="mt-1 flex items-center gap-1.5 text-[10px] text-txt-muted">
                      <span className="tabular-nums">pag. {book.lastPage}</span>
                      <span className="text-txt-faint">·</span>
                      <span>{new Date(book.timestamp).toLocaleDateString()}</span>
                    </div>
                    {book.groups && book.groups.length > 0 && (
                      <div className="mt-1.5 flex items-center gap-1 overflow-hidden">
                        {book.groups.slice(0, 2).map((g: string) => (
                          <span
                            key={g}
                            className="text-[9px] bg-accent/[0.06] text-accent/80 px-1.5 py-px rounded border border-accent/15 truncate max-w-[80px] tracking-tight"
                          >
                            {g}
                          </span>
                        ))}
                        {book.groups.length > 2 && (
                          <span className="text-[9px] text-txt-faint shrink-0">+{book.groups.length - 2}</span>
                        )}
                      </div>
                    )}
                    {isActive && (
                      <div className="mt-1.5" onClick={(e) => e.stopPropagation()}>
                        <ActiveProjectTranslationControls
                          isPaused={isActiveProjectPaused}
                          onTogglePause={onPauseActiveProject}
                          onStop={onStopActiveProject}
                          queueStats={activeProjectQueueStats}
                        />
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
