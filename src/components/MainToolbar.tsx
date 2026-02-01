import React from 'react';
import Draggable from 'react-draggable';
import { ChevronLeft, ChevronRight, Loader2, Play, Pause, RotateCw, Languages, MessageSquare } from 'lucide-react';
import { getVerificationUiState } from '../utils/verificationUi';

interface MainToolbarProps {
  draggableRef: React.RefObject<HTMLDivElement | null>;
  currentPage: number;
  totalPages: number;
  viewMode: 'single' | 'side-by-side';
  queueStats: { active: number; queued: number };
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
  onRetranslatePages: (pages: number[]) => void;
  onToggleTranslatedMode: () => void;
  onToggleManualMode: () => void;
  onOpenNotes: (page: number) => void;
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
  onRetranslatePages,
  onToggleTranslatedMode,
  onToggleManualMode,
  onOpenNotes
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
        <div ref={draggableRef} className="pointer-events-auto flex items-center gap-1.5 bg-black/70 backdrop-blur-xl pl-2 pr-2 py-1.5 rounded-full shadow-[0_8px_30px_rgba(0,0,0,0.14)] border border-white/15 select-none cursor-move hover:bg-black/80 transition-colors scale-95 hover:scale-100 ease-out duration-200">
          <button onClick={onPrevPage} className="w-8 h-8 flex items-center justify-center text-gray-300 hover:text-white hover:bg-white/5 rounded-full transition-all"><ChevronLeft size={18} /></button>

          <button
            onClick={onTogglePreviewStrip}
            className="px-3 min-w-[60px] text-center flex flex-col items-center justify-center cursor-pointer hover:bg-white/5 rounded-lg transition-colors"
            title="Apri anteprime pagine"
          >
            <span className="text-xs font-semibold text-white">{currentPage}</span>
            <span className="text-[9px] text-gray-300 leading-none">di {totalPages}</span>
          </button>

          {(queueStats.active > 0 || queueStats.queued > 0) && (
            <div className="px-2 text-[9px] text-white/80 font-medium flex items-center gap-1 cursor-default">
              <Loader2 size={12} className={queueStats.active > 0 ? 'animate-spin' : ''} />
              <span>{queueStats.active} attive</span>
              <span className="text-white/35">•</span>
              <span>{queueStats.queued} in coda</span>
            </div>
          )}

          <button onClick={onNextPage} className="w-8 h-8 flex items-center justify-center text-gray-300 hover:text-white hover:bg-white/5 rounded-full transition-all"><ChevronRight size={18} /></button>

          <div className="w-[1px] h-5 bg-white/5 mx-1" />

          <button onClick={onTogglePause} className={`w-8 h-8 flex items-center justify-center rounded-full transition-all ${isPaused ? 'bg-amber-500/15 text-amber-200 border border-amber-500/25' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}>
            {isPaused ? <Play size={14} fill="currentColor" /> : <Pause size={14} fill="currentColor" />}
          </button>

          {showPageActionButton && (
            <button
              onClick={() => onRetranslatePages(pageActionPages)}
              className={`ml-1 w-7 h-7 flex items-center justify-center rounded-full transition-all border ${
                isManualMode
                  ? 'bg-green-500/15 text-green-200 border-green-500/25 hover:bg-green-500/22 hover:border-green-500/35'
                  : 'bg-red-500/15 text-red-200 border-red-500/25 hover:bg-red-500/22 hover:border-red-500/35'
              }`}
              title={pageActionTitle}
            >
              {isManualMode ? <Play size={12} fill="currentColor" /> : <RotateCw size={12} />}
            </button>
          )}

          <button onClick={onToggleTranslatedMode} className={`ml-1 px-3 py-1.5 rounded-full text-[10px] font-bold uppercase transition-all flex items-center gap-1.5 ${isTranslatedMode ? 'bg-[#007AFF]/18 border border-[#007AFF]/35 text-white/90' : 'bg-white/3 border border-white/5 text-gray-400 hover:bg-white/5'}`}>
            <Languages size={12} />
            <span>{isTranslatedMode ? 'Originale' : 'Traduci'}</span>
          </button>

          <button
            onClick={onToggleManualMode}
            className={`ml-1 px-3 py-1.5 rounded-full text-[10px] font-bold uppercase transition-all flex items-center gap-2 border ${isManualMode
              ? 'bg-orange-500/20 border-orange-500/40 text-orange-300'
              : 'bg-white/3 border-white/5 text-gray-500 hover:bg-white/5 hover:text-gray-400'
              }`}
            title={isManualMode ? "Modalità Manuale Attiva (Clicca sulle pagine per tradurle)" : "Passa a Modalità Manuale"}
          >
            <span>Manuale</span>
            <div className={`w-6 h-3.5 rounded-full relative transition-all ${isManualMode ? 'bg-orange-500' : 'bg-gray-600/50'}`}>
              <div className={`absolute top-[2px] w-2.5 h-2.5 rounded-full bg-white shadow-sm transition-all ${isManualMode ? 'left-[12px]' : 'left-[2px]'}`} />
            </div>
          </button>

          <button
            onClick={() => onOpenNotes(currentPage)}
            className="ml-1 w-8 h-8 flex items-center justify-center rounded-full transition-all bg-white/5 text-gray-300 hover:text-white hover:bg-white/10 border border-white/5 relative"
            title="Dubbi & Verifica"
          >
            <MessageSquare size={14} />
            {(currentVerification?.state && currentVerification?.state !== 'idle') && (
              <div className={`absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full border border-black/50 ${verificationUi.dotClass} ${currentVerification?.state === 'verifying' ? 'animate-pulse' : ''}`} />
            )}
            {(!currentVerification?.state || currentVerification?.state === 'idle') && (annotationMap[currentPage]?.length || 0) > 0 && (
              <div className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-amber-500 border border-black/50" />
            )}
          </button>
        </div>
      </Draggable>
    </div>
  );
};
