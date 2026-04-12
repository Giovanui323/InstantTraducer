import React, { useState } from 'react';
import { Upload, ArrowRight, FileDown, X, Settings } from 'lucide-react';
import { PDFMetadata } from '../types';
import { getLanguageFlag } from '../utils/languageUtils';
import { GroupFilterBar } from './home/GroupFilterBar';
import { RecentBooksGrid } from './home/RecentBooksGrid';
import { HomeTranslationSummaryButton } from './home/HomeTranslationSummaryButton';
import { TranslationActivityModal } from './translation/TranslationActivityModal';

interface HomeViewProps {
  hasSession: boolean;
  metadata: PDFMetadata | null;
  docInputLanguage?: string;
  currentPage: number;
  isDragging: boolean;
  isApiConfigured: boolean;
  openMenuId: string | null;
  pkgVersion: string;
  onRequestCloseSession: () => void;
  onReturnToSession: () => void;
  onBrowseClick: () => void;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
  onImportProject: () => void;
  onOpenProject: (fileId: string) => void;
  onRenameProject: (fileId: string, currentName: string, e: React.MouseEvent, currentLanguage?: string) => void;
  onDeleteProject: (fileId: string, e: React.MouseEvent) => void;
  onEditLanguageProject?: (fileId: string, currentLang: string) => void;
  onCreateGroup: () => void;
  onSetOpenMenuId: (id: string | null) => void;
  onOpenSettings: () => void;
  onManageGroups: (fileId: string) => void;
  onExportGpt: (fileId: string) => void;
  isConsultationMode?: boolean;
  isActiveProjectPaused: boolean;
  activeProjectQueueStats: { active: number; queued: number };
  onPauseActiveProject: () => void;
  onStopActiveProject: () => void;
  isOpeningProject?: string | null;
  isClosingSession?: boolean;
}

export const HomeView: React.FC<HomeViewProps> = ({
  hasSession,
  metadata,
  docInputLanguage,
  currentPage,
  isDragging,
  isApiConfigured,
  openMenuId,
  pkgVersion,
  onRequestCloseSession,
  onReturnToSession,
  onBrowseClick,
  onDragOver,
  onDragLeave,
  onDrop,
  onImportProject,
  onOpenProject,
  onRenameProject,
  onDeleteProject,
  onEditLanguageProject,
  onCreateGroup,
  onSetOpenMenuId,
  onOpenSettings,
  onManageGroups,
  onExportGpt,
  isConsultationMode,
  isActiveProjectPaused,
  activeProjectQueueStats,
  onPauseActiveProject,
  onStopActiveProject,
  isOpeningProject,
  isClosingSession
}) => {
  const [isActivityModalOpen, setIsActivityModalOpen] = useState(false);

  return (
    <div className="flex-1 w-full overflow-y-auto select-none custom-scrollbar">
      <div className="mx-auto w-full max-w-6xl px-5 pt-8 pb-12">
        {/* ── Active session card ── */}
        {hasSession && (
          <section className="w-full animate-fade-in">
            <div className="rounded-xl border border-border-muted bg-surface-2/60 shadow-surface-lg overflow-hidden">
              <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto]">
                <button
                  type="button"
                  onClick={onReturnToSession}
                  className="text-left px-6 py-5 hover:bg-white/[0.02] focus:outline-none transition-colors duration-200"
                  aria-label={`Torna alla sessione${metadata?.name ? `: ${metadata.name}` : ''}`}
                >
                  <div className="text-[9px] font-bold uppercase tracking-[0.15em] text-txt-muted mb-1.5">Sessione attiva</div>
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="text-sm opacity-80 shrink-0" title={docInputLanguage}>{getLanguageFlag(docInputLanguage || "")}</span>
                    <span className="font-semibold text-[15px] text-txt-primary truncate min-w-0 tracking-tight" title={metadata?.name || 'Senza titolo'}>
                      {metadata?.name || 'Senza titolo'}
                    </span>
                  </div>
                  <div className="mt-1.5 flex items-center gap-2">
                    <span className="text-[11px] text-txt-muted tabular-nums">Ultima pagina: {currentPage}</span>
                    <span className="text-txt-faint">·</span>
                    <span className="text-[11px] text-accent font-medium">Riprendi</span>
                  </div>
                </button>
                <div className="flex items-center justify-end gap-2 px-5 py-5 sm:border-l sm:border-border-muted">
                  <button
                    type="button"
                    onClick={onRequestCloseSession}
                    disabled={isClosingSession}
                    title="Chiudi sessione"
                    aria-label="Chiudi sessione"
                    className="w-9 h-9 flex items-center justify-center rounded-lg bg-danger/8 text-danger/70 hover:bg-danger/15 hover:text-danger transition-all duration-200 border border-danger/10 hover:border-danger/20 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isClosingSession ? (
                      <div className="w-4 h-4 border-2 border-danger/50 border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <X size={16} />
                    )}
                  </button>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* ── Main grid: Actions + Library ── */}
        <div className="mt-8 grid grid-cols-12 gap-8 items-start">
          {/* LEFT — Upload area */}
          <section className="col-span-12 lg:col-span-5 space-y-5">
            <div className="px-1">
              <h2 className="text-[10px] font-bold text-txt-muted uppercase tracking-[0.15em]">Nuovo progetto</h2>
            </div>

            {/* Drop zone */}
            <div
              className={`group rounded-xl border p-8 text-left transition-all duration-300 ease-out ${
                isConsultationMode
                  ? 'opacity-40 cursor-not-allowed border-border-muted bg-surface-2/30'
                  : isDragging
                    ? 'border-accent/40 bg-accent/[0.04] scale-[1.005] shadow-glow-accent-lg'
                    : 'border-border-muted bg-surface-2/40 hover:border-accent/20 hover:bg-surface-2/60 hover:shadow-glow-accent'
              }`}
              onClick={isConsultationMode ? undefined : onBrowseClick}
              onKeyDown={(e) => {
                if (isConsultationMode) return;
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onBrowseClick();
                }
              }}
              onDragOver={isConsultationMode ? undefined : onDragOver}
              onDragEnter={isConsultationMode ? undefined : onDragOver}
              onDragLeave={isConsultationMode ? undefined : onDragLeave}
              onDrop={isConsultationMode ? undefined : onDrop}
              role={isConsultationMode ? undefined : 'button'}
              tabIndex={isConsultationMode ? -1 : 0}
              aria-label={isConsultationMode ? 'Caricamento PDF disabilitato' : 'Carica nuovo PDF'}
            >
              <div className="flex items-start gap-4">
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 transition-all duration-300 ${
                  isConsultationMode
                    ? 'bg-surface-4 text-txt-muted'
                    : 'bg-accent/10 border border-accent/15 group-hover:bg-accent/15 group-hover:scale-105 group-active:scale-95'
                }`}>
                  <Upload className="text-accent w-5 h-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="text-[14px] font-semibold text-txt-primary tracking-tight">Carica PDF</h3>
                  <p className="mt-1 text-[12px] text-txt-muted leading-relaxed">
                    {isConsultationMode
                      ? "Disabilitato in modalità consultazione."
                      : "Trascina un file qui oppure selezionalo dal computer."}
                  </p>
                  {!isConsultationMode && (
                    <div className="mt-5 flex flex-wrap items-center gap-3">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onBrowseClick();
                        }}
                        className="inline-flex items-center gap-2 px-4 py-2 bg-accent text-white font-semibold rounded-lg text-[11px] hover:bg-accent-hover transition-all duration-200 shadow-glow-accent focus:outline-none tracking-wide"
                      >
                        Sfoglia file <ArrowRight size={13} />
                      </button>
                      <span className="text-[10px] text-txt-muted">Solo PDF</span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Import button */}
            <button
              type="button"
              onClick={isConsultationMode ? undefined : onImportProject}
              disabled={isConsultationMode}
              className={`w-full rounded-xl px-5 py-4 text-left transition-all duration-200 flex items-center justify-between gap-4 border group focus:outline-none ${
                isConsultationMode
                  ? 'opacity-40 cursor-not-allowed border-border-muted bg-surface-2/30 text-txt-muted'
                  : 'cursor-pointer border-border-muted bg-surface-2/40 hover:bg-surface-3/50 hover:border-border text-txt-secondary hover:text-txt-primary'
              }`}
              aria-disabled={isConsultationMode}
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-white/[0.03] border border-border-muted flex items-center justify-center">
                  <FileDown size={16} className="text-txt-muted" />
                </div>
                <div className="min-w-0">
                  <div className="text-[12px] font-semibold">Importa progetto</div>
                  <div className="text-[10px] text-txt-muted mt-0.5">Riprendi un backup .gpt</div>
                </div>
              </div>
              <ArrowRight size={15} className="text-txt-faint group-hover:text-txt-muted transition-colors" />
            </button>
          </section>

          {/* RIGHT — Library */}
          <section className="col-span-12 lg:col-span-7 space-y-5">
            <div className="sticky top-0 z-20 -mx-1 px-1 py-2 bg-surface-0/90 backdrop-blur-lg">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="text-[10px] font-bold text-txt-muted uppercase tracking-[0.15em]">Libreria</h2>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <HomeTranslationSummaryButton onClick={() => setIsActivityModalOpen(true)} />
                  <button
                    type="button"
                    onClick={onOpenSettings}
                    className={`flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-wider transition-all duration-200 px-2.5 py-1.5 rounded-lg border focus:outline-none ${
                      isApiConfigured
                        ? 'text-success bg-success/5 border-success/15 hover:bg-success/10'
                        : 'text-danger bg-danger/5 border-danger/15 hover:bg-danger/10'
                    }`}
                    aria-label={isApiConfigured ? 'API configurate' : 'Configura API'}
                  >
                    <Settings size={11} /> {isApiConfigured ? 'API OK' : 'Configura API'}
                  </button>
                </div>
              </div>
            </div>
            <GroupFilterBar onCreateGroup={onCreateGroup} />
            <RecentBooksGrid
              onOpenProject={onOpenProject}
              onRenameProject={onRenameProject}
              onDeleteProject={onDeleteProject}
              onEditLanguageProject={onEditLanguageProject}
              onManageGroups={onManageGroups}
              onExportGpt={onExportGpt}
              onSetOpenMenuId={onSetOpenMenuId}
              openMenuId={openMenuId}
              isActiveProjectPaused={isActiveProjectPaused}
              activeProjectQueueStats={activeProjectQueueStats}
              onPauseActiveProject={onPauseActiveProject}
              onStopActiveProject={onStopActiveProject}
              isOpeningProject={isOpeningProject}
              onCreateNewProject={isConsultationMode ? undefined : onBrowseClick}
            />
          </section>
        </div>
      </div>

      <div className="fixed bottom-3 right-4 text-[9px] font-semibold text-txt-faint tracking-wide">v{pkgVersion}</div>

      <TranslationActivityModal
        isOpen={isActivityModalOpen}
        onClose={() => setIsActivityModalOpen(false)}
        onOpenProject={onOpenProject}
      />
    </div>
  );
};
