import React from 'react';
import Draggable from 'react-draggable';
import { ChevronLeft, ChevronRight, RotateCw, Languages, MessageSquare, Play } from 'lucide-react';
import { getVerificationUiState } from '../utils/verificationUi';
import { ActiveProjectTranslationControls } from './translation/ActiveProjectTranslationControls';
import type { ReaderViewModePreference } from './reader/bookLayout';

interface MainToolbarProps {
  draggableRef: React.RefObject<HTMLDivElement | null>;
  currentPage: number;
  totalPages: number;
  viewMode: ReaderViewModePreference;
  queueStats: {
    active: number;
    queued: number;
    details?: Array<{ page: number; type: 'translation' | 'verification'; status: 'active' | 'queued' }>;
  };
  isPaused: boolean;
  isTranslatedMode: boolean;
  isManualMode: boolean;
  previewPage: number | null;
  verificationMap: Record<number, any>;
  annotationMap: Record<number, any[]>;
  translationMap: Record<number, string>;
  currentPages: number[];
  onPrevPage: () => void;
  onNextPage: () => void;
  onTogglePreviewStrip: () => void;
  onTogglePause: () => void;
  onStop: () => void;
  onRetranslatePages: (pages: number[]) => void;

  onOpenOriginalPreview: () => void;
  onToggleManualMode: () => void;
  onOpenNotes: (page: number) => void;
  isConsultationMode?: boolean;
}

export const MainToolbar: React.FC<MainToolbarProps> = ({
  draggableRef,
  currentPage,
  totalPages,
  viewMode,
  queueStats,
  isPaused,
  isTranslatedMode,
  isManualMode,
  previewPage,
  verificationMap,
  annotationMap,
  translationMap,
  currentPages,
  onPrevPage,
  onNextPage,
  onTogglePreviewStrip,
  onTogglePause,
  onStop,
  onRetranslatePages,

  onOpenOriginalPreview,
  onToggleManualMode,
  onOpenNotes,
  isConsultationMode
}) => {
  const translatedCurrentPages = currentPages.filter(
    (p) => typeof translationMap[p] === 'string' && translationMap[p].trim().length > 0
  );

  const currentVerification = verificationMap[currentPage];
  const verificationUi = getVerificationUiState(currentVerification);

  const showPageActionButton = isTranslatedMode && (isManualMode || translatedCurrentPages.length > 0);
  const pageActionTitle = isManualMode
    ? (currentPages.length > 1 ? 'Avvia traduzione pagine' : 'Avvia traduzione pagina')
    : 'Ritraduci pagina';

  const pageActionPages = isManualMode ? currentPages : translatedCurrentPages;

  return (
    <div className="fixed bottom-24 left-0 w-full flex justify-center z-[200] pointer-events-none">
      <Draggable nodeRef={draggableRef}>
        <div
          ref={draggableRef}
          className="pointer-events-auto glass-panel flex items-center gap-1.5 pl-2 pr-3 py-1.5 rounded-2xl shadow-surface-2xl select-none cursor-move hover:shadow-glow-accent/20 transition-all duration-300 ease-out-expo"
        >
          {/* Navigation */}
          <button
            onClick={onPrevPage}
            className="w-10 h-10 flex items-center justify-center text-txt-secondary hover:text-txt-primary hover:bg-white/[0.06] rounded-xl transition-all duration-150 active:scale-90"
          >
            <ChevronLeft size={20} />
          </button>

          <button
            onClick={onTogglePreviewStrip}
            className="preview-strip-trigger px-3 min-w-[72px] h-10 flex flex-col items-center justify-center cursor-pointer hover:bg-white/[0.04] rounded-xl transition-all duration-200"
            title="Apri anteprime pagine"
          >
            <span className="text-[13px] font-bold text-txt-primary tabular-nums leading-none">{currentPage}</span>
            <span className="text-[9px] text-txt-secondary leading-none mt-0.5">di {totalPages > 0 ? totalPages : '…'}</span>
          </button>

          <button
            onClick={onNextPage}
            className="w-10 h-10 flex items-center justify-center text-txt-secondary hover:text-txt-primary hover:bg-white/[0.06] rounded-xl transition-all duration-150 active:scale-90"
          >
            <ChevronRight size={20} />
          </button>

          {!isConsultationMode && (
            <>
              <div className="w-px h-7 bg-border-muted mx-1" />

              {/* Translation controls */}
              <ActiveProjectTranslationControls
                isPaused={isPaused}
                onTogglePause={onTogglePause}
                onStop={onStop}
                queueStats={queueStats}
                variant="toolbar"
              />

              {/* Retranslate / Play button */}
              {showPageActionButton && (
                <button
                  onClick={() => onRetranslatePages(pageActionPages)}
                  className={`w-8 h-8 flex items-center justify-center rounded-lg transition-all duration-200 border ${
                    isManualMode
                      ? 'bg-success/10 text-success border-success/20 hover:bg-success/20 hover:border-success/35'
                      : 'bg-warning/10 text-warning border-warning/20 hover:bg-warning/20 hover:border-warning/35'
                  } active:scale-90`}
                  title={pageActionTitle}
                >
                  {isManualMode ? <Play size={12} fill="currentColor" /> : <RotateCw size={12} />}
                </button>
              )}

              {/* Original preview */}
              <button
                onClick={onOpenOriginalPreview}
                className="px-2.5 py-1.5 rounded-lg text-[9px] font-bold uppercase tracking-wider transition-all duration-200 flex items-center gap-1.5 bg-white/[0.03] border border-border-muted text-txt-secondary hover:bg-white/[0.06] hover:text-txt-primary hover:border-border"
              >
                <Languages size={11} />
                <span>Originale</span>
              </button>

              {/* Manual mode toggle */}
              <button
                onClick={onToggleManualMode}
                className={`px-2.5 py-1.5 rounded-lg text-[9px] font-bold uppercase tracking-wider transition-all duration-200 flex items-center gap-2 border ${
                  isManualMode
                    ? 'bg-accent/10 border-accent/25 text-accent'
                    : 'bg-white/[0.03] border-border-muted text-txt-secondary hover:bg-white/[0.05] hover:text-txt-primary'
                }`}
                title={isManualMode ? "Modalità Manuale Attiva (Clicca sulle pagine per tradurle)" : "Passa a Modalità Manuale"}
              >
                <span>Manuale</span>
                <div className={`w-5 h-3 rounded-full relative transition-all duration-200 ${isManualMode ? 'bg-accent' : 'bg-surface-5'}`}>
                  <div className={`absolute top-[2px] w-2 h-2 rounded-full shadow-sm transition-all duration-200 ${isManualMode ? 'left-[10px] bg-white' : 'left-[2px] bg-txt-secondary'}`} />
                </div>
              </button>
            </>
          )}

          {/* Notes & verification */}
          <button
            onClick={() => onOpenNotes(currentPage)}
            className="w-8 h-8 flex items-center justify-center rounded-lg transition-all duration-200 bg-white/[0.03] text-txt-secondary hover:text-txt-primary hover:bg-white/[0.06] border border-border-muted relative"
            title="Dubbi & Verifica"
          >
            <MessageSquare size={13} />
            {(currentVerification?.state && currentVerification?.state !== 'idle') && (
              <div className={`absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full border border-surface-1 ${verificationUi.dotClass} ${currentVerification?.state === 'verifying' ? 'animate-pulse' : ''}`} />
            )}
            {(!currentVerification?.state || currentVerification?.state === 'idle') && (annotationMap[currentPage]?.length || 0) > 0 && (
              <div className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-warning border border-surface-1" />
            )}
          </button>
        </div>
      </Draggable>
    </div>
  );
};
