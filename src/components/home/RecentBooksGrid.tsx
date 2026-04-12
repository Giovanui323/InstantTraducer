import React, { useState } from 'react';
import { BookOpen, AlertCircle, Pencil, Trash2, MoreHorizontal, Tag, FileDown, Loader2, Plus, Settings } from 'lucide-react';
import { useLibrary } from '../../contexts/LibraryContext';
import { ReadingProgress } from '../../types';
import { getLanguageFlag } from '../../utils/languageUtils';
import { BackgroundTranslationSlotCard } from './BackgroundTranslationSlotCard';
import { TranslationJobDot } from './TranslationJobDot';
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

  const filteredBooks = Object.values(recentBooks || {})
    .filter((b): b is ReadingProgress => !!(b && b.fileId))
    .filter(b => {
      if (selectedGroupFilters.length === 0) return true;
      if (!b || !b.groups) return false;
      return selectedGroupFilters.every(g => b.groups?.includes(g));
    })
    .sort((a, b) => b.timestamp - a.timestamp);

  const isCurrentTranslating = activeProjectQueueStats.active > 0 || activeProjectQueueStats.queued > 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between px-2">
        <h3 className="flex items-center gap-2 text-[10px] font-bold text-txt-muted uppercase tracking-widest">Recenti</h3>
        <span className="text-[10px] text-txt-muted tabular-nums">{filteredBooks.length}</span>
      </div>

      <div
        className="max-h-[min(600px,65vh)] overflow-y-auto pr-1 custom-scrollbar"
        role="region"
        aria-label="Elenco progetti recenti"
      >
        <BackgroundTranslationSlotCard onOpenProject={onOpenProject} />

        <div className="grid gap-1.5 pb-32" role="list">
          {filteredBooks.length === 0 && (
            <div className="flex flex-col items-center justify-center p-10 text-center border border-dashed border-border-muted rounded-xl text-txt-muted animate-fade-in">
              <BookOpen size={28} className="mb-3 opacity-15" strokeWidth={1.5} />
              <span className="text-[11px] font-medium">Nessun libro recente</span>
              {onCreateNewProject && (
                <button
                  type="button"
                  onClick={onCreateNewProject}
                  className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-white/[0.04] border border-border-muted text-[11px] text-txt-secondary font-medium hover:bg-white/[0.06] hover:border-border hover:text-txt-primary transition-all duration-200 focus:outline-none"
                >
                  <Plus size={14} /> Carica un PDF
                </button>
              )}
            </div>
          )}
          {filteredBooks.map((book) => {
            const isActive = book.fileId === currentProjectFileId;
            const isOpening = openingFileId === book.fileId || isOpeningProject === book.fileId;
            const menuDomId = `book-menu-${book.fileId}`;
            return (
              <div
                key={book.fileId}
                role="listitem"
                className={`p-3 rounded-xl border flex items-center justify-between transition-all duration-200 cursor-pointer group relative ${
                  openMenuId === book.fileId ? 'z-30' : 'z-10'
                } ${isActive
                  ? 'bg-success/[0.04] border-success/20 shadow-glow-success'
                  : 'bg-surface-2/50 border-transparent hover:bg-surface-3/50 hover:border-border-muted'
                } ${isOpening ? 'opacity-60 pointer-events-none' : ''}`}
                onClick={() => handleOpen(book.fileId || "")}
              >
                {isOpening && (
                  <div className="absolute inset-0 flex items-center justify-center bg-surface-1/50 z-50 rounded-xl backdrop-blur-sm">
                    <Loader2 className="w-5 h-5 text-accent animate-spin" />
                  </div>
                )}
                {isActive && (
                  <div className="absolute left-0 top-3 bottom-3 w-[2.5px] bg-success rounded-r-full shadow-glow-success" />
                )}
                <div className="flex items-center gap-3.5 min-w-0 flex-1 mr-3">
                  <div className="relative shrink-0">
                    {book.thumbnail ? (
                      <img
                        src={book.thumbnail}
                        alt={book.fileName}
                        className="w-8 h-11 object-cover rounded-md shadow-surface border border-border-muted"
                      />
                    ) : (
                      <div className="w-8 h-8 bg-surface-4 text-txt-muted rounded-lg flex items-center justify-center text-[9px] font-bold border border-border-muted">PDF</div>
                    )}
                    {book.hasSafePdf === false && (
                      <div className="absolute -top-1 -right-1 bg-danger text-white rounded-full p-0.5 border-2 border-surface-2" title="PDF originale mancante">
                        <AlertCircle size={8} />
                      </div>
                    )}
                    <TranslationJobDot
                      fileId={book.fileId || ""}
                      isCurrentProjectTranslating={isActive && isCurrentTranslating}
                    />
                  </div>
                  <div className="flex flex-col min-w-0 flex-1">
                    <p className="font-medium text-[12px] text-txt-primary/90 group-hover:text-txt-primary transition-colors duration-150 flex items-center gap-1.5 min-w-0">
                      <span className="text-[11px] shrink-0" title={book.inputLanguage}>{getLanguageFlag(book.inputLanguage || "")}</span>
                      <span className="line-clamp-1 min-w-0 flex-1 leading-snug tracking-tight" title={book.fileName}>{book.fileName}</span>
                    </p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className="text-[10px] text-txt-muted tabular-nums whitespace-nowrap">Pag. {book.lastPage}</span>
                      <span className="text-[8px] text-txt-faint">•</span>
                      <span className="text-[10px] text-txt-muted whitespace-nowrap">{new Date(book.timestamp).toLocaleDateString()}</span>
                      {book.groups && book.groups.length > 0 && (
                        <>
                          <span className="text-[8px] text-txt-faint">•</span>
                          <div className="flex gap-1 overflow-hidden">
                            {book.groups.slice(0, 2).map((g: string) => (
                              <span key={g} className="text-[8px] bg-white/[0.04] text-txt-muted px-1.5 py-px rounded border border-border-muted truncate max-w-[80px]">{g}</span>
                            ))}
                            {book.groups.length > 2 && <span className="text-[8px] text-txt-faint shrink-0">+{book.groups.length - 2}</span>}
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-0.5 shrink-0">
                  {isActive && (
                    <div
                      className="mr-1.5 border-r border-border-muted pr-1.5 hidden sm:block"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <ActiveProjectTranslationControls
                        isPaused={isActiveProjectPaused}
                        onTogglePause={onPauseActiveProject}
                        onStop={onStopActiveProject}
                        queueStats={activeProjectQueueStats}
                      />
                    </div>
                  )}
                  <button
                    onClick={(e) => { e.stopPropagation(); onRenameProject(book.fileId || "", book.fileName || "", e, book.inputLanguage); }}
                    className="p-1.5 text-txt-faint hover:text-accent hover:bg-accent/10 rounded-lg transition-all duration-150"
                    title="Rinomina"
                  >
                    <Pencil size={13} />
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); onDeleteProject(book.fileId || "", e); }}
                    className="p-1.5 text-txt-faint hover:text-danger hover:bg-danger/10 rounded-lg transition-all duration-150"
                    title="Rimuovi"
                  >
                    <Trash2 size={13} />
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); onSetOpenMenuId(openMenuId === (book.fileId || "") ? null : (book.fileId || "")); }}
                    className="p-1.5 text-txt-faint hover:text-txt-secondary hover:bg-white/[0.04] rounded-lg transition-all duration-150 menu-trigger"
                    title="Altro"
                    aria-haspopup="menu"
                    aria-expanded={openMenuId === book.fileId}
                    aria-controls={openMenuId === book.fileId ? menuDomId : undefined}
                    onKeyDown={(e) => {
                      if (e.key === 'Escape') {
                        e.stopPropagation();
                        onSetOpenMenuId(null);
                      }
                    }}
                  >
                    <MoreHorizontal size={13} />
                  </button>
                  {openMenuId === book.fileId && (
                    <div
                      id={menuDomId}
                      role="menu"
                      className="absolute right-2 top-full mt-1 glass-panel rounded-xl overflow-hidden z-50 flex flex-col min-w-[170px] menu-container animate-fade-in-scale"
                    >
                      <button
                        onClick={(e) => { e.stopPropagation(); onSetOpenMenuId(null); onManageGroups(book.fileId || ""); }}
                        className="flex items-center gap-2.5 w-full px-3 py-2.5 text-[11px] text-txt-secondary hover:bg-white/[0.04] hover:text-txt-primary text-left transition-colors duration-100"
                        role="menuitem"
                      >
                        <Tag size={13} className="text-txt-muted" /> Gestisci Gruppi
                      </button>
                      {onEditLanguageProject && (
                        <button
                          onClick={(e) => { e.stopPropagation(); onSetOpenMenuId(null); onEditLanguageProject(book.fileId || "", book.inputLanguage || ""); }}
                          className="flex items-center gap-2.5 w-full px-3 py-2.5 text-[11px] text-txt-secondary hover:bg-white/[0.04] hover:text-txt-primary text-left transition-colors duration-100"
                          role="menuitem"
                        >
                          <Settings size={13} className="text-txt-muted" /> Cambia Lingua
                        </button>
                      )}
                      <button
                        onClick={(e) => { e.stopPropagation(); onSetOpenMenuId(null); onRenameProject(book.fileId || "", book.fileName || "", e, book.inputLanguage); }}
                        className="flex items-center gap-2.5 w-full px-3 py-2.5 text-[11px] text-txt-secondary hover:bg-white/[0.04] hover:text-txt-primary text-left transition-colors duration-100"
                        role="menuitem"
                      >
                        <Pencil size={13} className="text-txt-muted" /> Rinomina
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); onSetOpenMenuId(null); onExportGpt(book.fileId || ""); }}
                        className="flex items-center gap-2.5 w-full px-3 py-2.5 text-[11px] text-txt-secondary hover:bg-white/[0.04] hover:text-txt-primary text-left border-t border-border-muted transition-colors duration-100"
                        role="menuitem"
                      >
                        <FileDown size={13} className="text-txt-muted" /> Esporta (.gpt)
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); onSetOpenMenuId(null); onDeleteProject(book.fileId || "", e); }}
                        className="flex items-center gap-2.5 w-full px-3 py-2.5 text-[11px] text-danger/80 hover:bg-danger/5 hover:text-danger text-left transition-colors duration-100"
                        role="menuitem"
                      >
                        <Trash2 size={13} /> Rimuovi
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

    </div>
  );
};
