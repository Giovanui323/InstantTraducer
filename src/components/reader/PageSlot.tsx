import React, { useState } from 'react';
import { Loader2, Pause, Copy, Check, RotateCw, CirclePlay } from 'lucide-react';
import { MarkdownText } from '../MarkdownText';
import { IndexView } from '../IndexView';
import { PageVerification, UserHighlight, UserNote, PageStatus } from '../../types';
import { safeCopy } from '../../utils/clipboard';
import { toDisplayableImageSrc } from '../../utils/imageUtils';
import { PAGE_SPLIT, splitColumns } from '../../utils/textUtils';
import { getThemeClasses, READER_THEMES } from '../../styles/readerStyles';

interface PageSlotProps {
  page: number;
  idx: number;
  dims: { width: number; height: number };
  frameDims: { width: number; height: number };
  effectiveScale: number;
  isTranslatedMode: boolean;
  isManualMode: boolean;
  isPaused: boolean;
  navigationMode: 'scroll' | 'flip';
  translationTheme?: 'light' | 'sepia' | 'dark';
  searchTerm?: string;
  activeResultId?: string | null;
  showHighlights: boolean;
  showUserNotes: boolean;
  isHighlightToolActive: boolean;
  isNoteToolActive: boolean;
  isEraserToolActive: boolean;
  copiedPage: number | null;
  canvasRef?: React.RefObject<HTMLCanvasElement | null>;
  canvasRefs?: React.RefObject<HTMLCanvasElement | null>[];
  canvasRefsMap?: Record<number, React.RefObject<HTMLCanvasElement | null>>;
  originalImages?: Record<number, string>;
  croppedImages?: Record<number, string>;
  translationMap: Record<number, string>;
  verificationMap: Record<number, PageVerification>;
  pageStatus: Record<number, PageStatus>;
  translationLogs?: Record<number, string>;
  partialTranslations?: Record<number, string>;
  userHighlights: Record<number, UserHighlight[]>;
  userNotes: Record<number, UserNote[]>;
  onPageClick?: (page: number) => void;
  onCopy: (p: number) => void;
  onRetry: (p: number) => void;
  onStop?: (p: number) => void;
  onAddHighlight: (page: number, start: number, end: number, text: string, color?: string) => void;
  onRemoveHighlight: (page: number, id: string) => void;
  onAddNote: (page: number, start: number, end: number, text: string, content: string) => void;
  onUpdateNote: (page: number, id: string, content: string) => void;
  onRemoveNote: (page: number, id: string) => void;
  onOpenNoteModal: (page: number, start: number, end: number, text: string) => void;
  onViewNote: (page: number, id: string) => void;
  onSetNotesPage: (p: number | null) => void;
}

export const PageSlot: React.FC<PageSlotProps> = ({
  page: p,
  idx,
  dims,
  frameDims,
  effectiveScale,
  isTranslatedMode,
  isManualMode,
  isPaused,
  navigationMode,
  translationTheme,
  searchTerm,
  activeResultId,
  showHighlights,
  showUserNotes,
  isHighlightToolActive,
  isNoteToolActive,
  isEraserToolActive,
  copiedPage,
  canvasRefs,
  canvasRefsMap,
  originalImages,
  croppedImages,
  translationMap,
  verificationMap,
  pageStatus,
  translationLogs,
  partialTranslations,
  userHighlights,
  userNotes,
  onPageClick,
  onCopy,
  onRetry,
  onStop,
  onAddHighlight,
  onRemoveHighlight,
  onAddNote,
  onUpdateNote,
  onRemoveNote,
  onOpenNoteModal,
  onViewNote,
  onSetNotesPage
}) => {
  const [copiedErrorPages, setCopiedErrorPages] = useState<Record<number, boolean>>({});
  const [copiedLogPages, setCopiedLogPages] = useState<Record<number, boolean>>({});

  const cRef = canvasRefsMap ? canvasRefsMap[p] : canvasRefs?.[idx];
  
  // Normalization logic: every page is scaled to match the frameDims.width
  const pageScale = (dims.width > 0 && frameDims.width > 0) ? (frameDims.width / dims.width) : 1;
  const totalScale = pageScale * effectiveScale;

  const verification = verificationMap[p];
  const hasTranslation = typeof translationMap[p] === 'string' && translationMap[p].trim().length > 0;
  const translatedText = hasTranslation ? translationMap[p] : null;
  const splitText = translatedText ? splitColumns(translatedText) : null;
  const isSplit = Boolean(splitText && splitText.length > 1);
  const leftText = isSplit ? (splitText?.[0] ?? '') : null;
  const rightText = isSplit ? (splitText?.[1] ?? '') : null;
  const rightBaseOffset = isSplit ? ((leftText?.length ?? 0) + PAGE_SPLIT.length) : 0;
  const isIndexPage = Boolean(translatedText?.includes('[[INDEX]]'));

  const themeClass = translationTheme === 'dark' ? 'dark' : translationTheme === 'sepia' ? 'sepia' : 'light';
  const highlights = showHighlights ? (userHighlights[p] || []) : [];
  const notes = showUserNotes ? (userNotes[p] || []) : [];

  return (
    <div className="flex gap-4 items-start w-fit mx-auto">
      <div
        className={`relative group shrink-0 ${isTranslatedMode ? 'bg-white shadow-[0_2px_12px_rgba(0,0,0,0.15)] border border-black/[0.06] rounded-sm' : 'bg-transparent shadow-none border-0 rounded-none overflow-visible'}`}
        style={{
          width: (dims.width * totalScale),
          minHeight: (dims.height * totalScale),
          ...(navigationMode === 'flip' ? { height: (dims.height * totalScale), overflow: 'hidden' } : {}),
          maxWidth: 'none'
        }}
      >
        {/* PDF Canvas / Original Image */}
        <div className={(isTranslatedMode && hasTranslation) ? 'hidden' : 'flex items-center justify-center select-none h-full bg-white'}>
          {cRef ? (
            <canvas
              ref={cRef}
              style={{
                width: `${dims.width * totalScale}px`,
                height: `${dims.height * totalScale}px`
              }}
            />
          ) : (originalImages?.[p] || croppedImages?.[p]) ? (
            <img
              src={toDisplayableImageSrc(originalImages?.[p] || croppedImages?.[p])}
              alt={`Pagina ${p}`}
              className="w-full h-full object-contain"
              draggable={false}
            />
          ) : (
            <div className="flex flex-col items-center gap-2 text-gray-400">
              <Loader2 size={24} className="animate-spin" />
              <span className="text-[10px] font-bold uppercase tracking-widest">Caricamento PDF...</span>
            </div>
          )}
        </div>

        {/* Translated Text */}
        {isTranslatedMode && hasTranslation && (
          <>
            <div
              className={`${getThemeClasses(translationTheme)} ${navigationMode === 'flip' ? 'h-full overflow-auto' : 'min-h-full'} relative select-text custom-scrollbar-light shadow-inner ${isSplit ? 'px-[5%] py-[5.5%]' : 'px-[10%] py-[8%]'}`}
              style={{
                fontSize: `${13.5 * totalScale}px`,
                fontFamily: "Georgia, 'Times New Roman', serif",
                lineHeight: '1.65',
                backgroundImage: READER_THEMES[translationTheme ?? 'light']?.gradient || READER_THEMES.light.gradient
              }}
            >
              {isIndexPage ? (
                <IndexView text={translatedText!} onPageClick={onPageClick} />
              ) : isSplit ? (
                <div className="flex h-full gap-8">
                  <div className="flex-1 border-r border-black/10 pr-6">
                    <MarkdownText
                      align="justify"
                      text={leftText ?? ''}
                      theme={themeClass}
                      searchTerm={searchTerm}
                      activeResultId={activeResultId}
                      pageNumber={p}
                      baseOffset={0}
                      highlights={highlights}
                      userNotes={notes}
                      onAddHighlight={(start, end, text, color) => onAddHighlight(p, start, end, text, color)}
                      onRemoveHighlight={(id) => onRemoveHighlight(p, id)}
                      onAddNote={(start, end, text) => onOpenNoteModal(p, start, end, text)}
                      onUpdateNote={(id, content) => onUpdateNote(p, id, content)}
                      onRemoveNote={(id) => onRemoveNote(p, id)}
                      isHighlightToolActive={isHighlightToolActive}
                      isNoteToolActive={isNoteToolActive}
                      isEraserToolActive={isEraserToolActive}
                      onNoteClick={(id) => onViewNote(p, id)}
                    />
                  </div>
                  <div className="flex-1 pl-2">
                    <MarkdownText
                      align="justify"
                      text={rightText ?? ''}
                      theme={themeClass}
                      searchTerm={searchTerm}
                      activeResultId={activeResultId}
                      pageNumber={p}
                      baseOffset={rightBaseOffset}
                      highlights={highlights}
                      userNotes={notes}
                      onAddHighlight={(start, end, text, color) => onAddHighlight(p, start, end, text, color)}
                      onRemoveHighlight={(id) => onRemoveHighlight(p, id)}
                      onAddNote={(start, end, text) => onOpenNoteModal(p, start, end, text)}
                      onUpdateNote={(id, content) => onUpdateNote(p, id, content)}
                      onRemoveNote={(id) => onRemoveNote(p, id)}
                      isHighlightToolActive={isHighlightToolActive}
                      isNoteToolActive={isNoteToolActive}
                      isEraserToolActive={isEraserToolActive}
                      onNoteClick={(id) => onViewNote(p, id)}
                    />
                  </div>
                </div>
              ) : (
                <div className="mx-auto max-w-[70ch]">
                  <MarkdownText
                    align="justify"
                    text={translatedText!}
                    theme={themeClass}
                    searchTerm={searchTerm}
                    activeResultId={activeResultId}
                    pageNumber={p}
                    highlights={highlights}
                    userNotes={notes}
                    onAddHighlight={(start, end, text, color) => onAddHighlight(p, start, end, text, color)}
                    onRemoveHighlight={(id) => onRemoveHighlight(p, id)}
                    onAddNote={(start, end, text) => onOpenNoteModal(p, start, end, text)}
                    onUpdateNote={(id, content) => onUpdateNote(p, id, content)}
                    onRemoveNote={(id) => onRemoveNote(p, id)}
                    isHighlightToolActive={isHighlightToolActive}
                    isNoteToolActive={isNoteToolActive}
                    isEraserToolActive={isEraserToolActive}
                    onNoteClick={(id) => onViewNote(p, id)}
                  />
                </div>
              )}
            </div>

            {/* Copy button */}
            <button
              onClick={() => onCopy(p)}
              className="absolute top-4 right-4 p-2.5 bg-white/80 hover:bg-white backdrop-blur-sm rounded-xl opacity-0 group-hover:opacity-100 transition-all z-10 shadow-sm border border-black/5 text-gray-500 hover:text-blue-600"
              title="Copia traduzione"
            >
              {copiedPage === p ? <Check size={16} className="text-green-600" /> : <Copy size={16} />}
            </button>

            {/* Disclaimer buttons */}
            {verification?.state === 'verified' && (verification?.severity === 'severe' || verification?.postRetryFailed) && (
              <button
                onClick={() => onSetNotesPage(p)}
                className="absolute bottom-4 left-4 z-10 px-3 py-2 rounded-xl bg-red-600 text-white text-[11px] font-semibold shadow-lg hover:bg-red-700 hover:scale-105 active:scale-95 transition-all cursor-pointer"
              >
                Disclaimer: possibili omissioni o pezzi non tradotti
              </button>
            )}
            {verification?.state === 'failed' && (
              <button
                onClick={() => onSetNotesPage(p)}
                className="absolute bottom-4 left-4 z-10 px-3 py-2 rounded-xl bg-red-600 text-white text-[11px] font-semibold shadow-lg hover:bg-red-700 hover:scale-105 active:scale-95 transition-all cursor-pointer"
              >
                Disclaimer: verifica qualità non riuscita
              </button>
            )}
            {verification?.state === 'verified' && verification?.severity === 'minor' && (
              <button
                onClick={() => onSetNotesPage(p)}
                className="absolute bottom-4 left-4 z-10 px-3 py-2 rounded-xl bg-amber-500 text-amber-950 text-[11px] font-semibold shadow-lg hover:bg-amber-600 hover:scale-105 active:scale-95 transition-all cursor-pointer"
              >
                Nota: dubbi interpretativi
              </button>
            )}
          </>
        )}

        {/* No translation yet - waiting overlay */}
        {isTranslatedMode && !hasTranslation && !pageStatus[p]?.error && (
          <div className="absolute inset-0 bg-white/95 flex flex-col items-center justify-center backdrop-blur-xl z-50">
            {!pageStatus[p]?.loading && !pageStatus[p]?.processing ? (
              isManualMode ? (
                <div className="flex flex-col items-center gap-4">
                  <button
                    onClick={() => onRetry(p)}
                    className="group/manual-btn relative flex items-center justify-center w-20 h-20 rounded-full bg-accent/10 border-2 border-accent/30 text-accent hover:bg-accent hover:text-white hover:border-accent transition-all duration-300 shadow-lg hover:shadow-glow-accent pointer-events-auto"
                    title="Traduci questa pagina"
                  >
                    <CirclePlay size={40} className="group-hover/manual-btn:scale-110 transition-transform" />
                  </button>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-accent/70">Clicca per tradurre</span>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-4">
                  {isPaused ? <Pause size={40} className="text-orange-500 opacity-50" /> : <Loader2 className="animate-spin text-accent w-12 h-12" />}
                  <div className="flex flex-col items-center gap-2">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-accent/70">Traduzione automatica in avvio</span>
                    <button
                      onClick={() => onRetry(p)}
                      className="px-4 py-2 bg-white border border-gray-200 text-gray-700 hover:text-accent hover:border-accent/30 rounded-xl text-[10px] font-bold uppercase transition-all shadow-sm hover:shadow-md pointer-events-auto"
                    >
                      Avvia subito
                    </button>
                  </div>
                </div>
              )
            ) : (
              <>
                {isPaused ? <Pause size={40} className="text-orange-500 opacity-50 mb-4" /> : <Loader2 className="animate-spin text-[#007AFF] w-12 h-12 mb-4" />}
                <div className="flex flex-col items-center gap-3 w-full max-w-[320px]">
                  <span className="text-[11px] font-black uppercase tracking-widest text-txt-muted text-center px-4 leading-relaxed drop-shadow-sm">
                    {isPaused ? 'Traduzione in Pausa' : (pageStatus[p]?.loading || pageStatus[p]?.processing || 'Avvio traduzione...')}
                  </span>
                  {!isPaused && (
                    <div className="w-48 h-1 bg-surface-5 rounded-full overflow-hidden shadow-inner">
                      <div className="h-full bg-accent animate-progress w-full origin-left shadow-[0_0_8px_rgba(245,158,11,0.5)]" style={{ animationDuration: '2.5s' }} />
                    </div>
                  )}

                  {translationLogs?.[p] && (
                    <div className="mt-4 w-full bg-zinc-900 rounded-xl border border-white/10 shadow-2xl overflow-hidden pointer-events-auto flex flex-col">
                      <div className="flex items-center justify-between px-3 py-2 bg-white/5 border-b border-white/5">
                        <div className="flex items-center gap-2">
                          <div className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
                          <span className="text-[9px] font-bold text-gray-400 uppercase tracking-tighter">Log di Elaborazione</span>
                        </div>
                        <button
                          onClick={async () => {
                            const ok = await safeCopy(translationLogs[p]);
                            if (ok) {
                              setCopiedLogPages(prev => ({ ...prev, [p]: true }));
                              window.setTimeout(() => setCopiedLogPages(prev => ({ ...prev, [p]: false })), 1500);
                            }
                          }}
                          className="text-[9px] px-2 py-0.5 rounded bg-white/5 hover:bg-white/10 text-gray-400 transition-colors"
                        >
                          {copiedLogPages[p] ? 'Copiato' : 'Copia'}
                        </button>
                      </div>
                      <div className="p-3 text-[9px] font-mono text-accent/80 max-h-[140px] overflow-y-auto whitespace-pre-wrap select-text cursor-text leading-relaxed custom-scrollbar-dark">
                        {translationLogs[p].split('\n').slice(-15).join('\n')}
                        <div className="animate-pulse inline-block w-1 h-3 bg-accent/50 ml-1 translate-y-0.5" />
                      </div>
                    </div>
                  )}

                  {partialTranslations?.[p] && (
                    <div className="mt-2 w-full flex flex-col gap-1.5 pointer-events-auto">
                      <div className="flex justify-between items-center px-1">
                        <span className="text-[9px] font-bold text-accent uppercase tracking-wider">Streaming Anteprima</span>
                        <span className="text-[9px] text-gray-400">{partialTranslations[p].length} caratteri</span>
                      </div>
                      <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-[10px] font-serif text-slate-700 h-[100px] overflow-y-auto whitespace-pre-wrap select-text cursor-text leading-relaxed shadow-inner">
                        {partialTranslations[p].length > 1000 ? `...${partialTranslations[p].slice(-1000)}` : partialTranslations[p]}
                      </div>
                    </div>
                  )}

                  {!isPaused && (
                    <div className="mt-4 flex gap-2 pointer-events-auto">
                      <button
                        onClick={() => onStop?.(p)}
                        className="px-4 py-2 bg-white border border-gray-200 text-gray-600 hover:text-red-600 hover:border-red-200 rounded-xl text-[10px] font-bold uppercase transition-all shadow-sm hover:shadow-md"
                      >
                        Stop
                      </button>
                      <button
                        onClick={() => onRetry(p)}
                        className="px-4 py-2 bg-[#007AFF] text-white hover:bg-blue-600 rounded-xl text-[10px] font-bold uppercase transition-all shadow-md hover:shadow-lg flex items-center gap-2"
                      >
                        <RotateCw size={12} />
                        Riprova
                      </button>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        )}

        {/* Error overlay */}
        {pageStatus[p]?.error && (
          <div className="absolute inset-0 bg-red-50 flex flex-col items-center justify-center p-8 z-50">
            <div className="text-red-600 font-black uppercase text-[10px] tracking-widest select-text">
              {(() => {
                const t = String((typeof pageStatus[p]?.error === 'string' ? pageStatus[p]?.error : pageStatus[p]?.loading) || '');
                if (t.includes('Rendering PDF')) return 'Errore Rendering PDF';
                if (t.includes('Timeout globale AI') || t.includes(' AI')) return 'Errore Critico AI';
                return 'Errore Critico';
              })()}
            </div>
            <div className="mt-2.5 max-w-[320px] w-full">
              <div className="flex justify-end mb-1">
                <button
                  onClick={async () => {
                    const ok = await safeCopy(String((typeof pageStatus[p]?.error === 'string' ? pageStatus[p]?.error : pageStatus[p]?.loading) || 'Errore durante la traduzione.'));
                    if (ok) {
                      setCopiedErrorPages(prev => ({ ...prev, [p]: true }));
                      window.setTimeout(() => setCopiedErrorPages(prev => ({ ...prev, [p]: false })), 1500);
                    }
                  }}
                  className="flex items-center gap-1 text-[8px] px-2 py-1 rounded bg-white hover:bg-white text-red-700 border border-red-200"
                  title="Copia errore"
                  aria-live="polite"
                >
                  <Copy size={10} /> {copiedErrorPages[p] ? 'Copiato' : 'Copia'}
                </button>
              </div>
              <div className="text-red-700/80 text-[10px] font-semibold text-center select-text selection:bg-red-100 selection:text-red-800">
                {String((typeof pageStatus[p]?.error === 'string' ? pageStatus[p]?.error : pageStatus[p]?.loading) || 'Errore durante la traduzione.')}
              </div>
            </div>

            {partialTranslations?.[p] && (
              <div className="mt-4 w-[320px] flex flex-col gap-1.5">
                <div className="text-[9px] font-bold text-red-600 uppercase tracking-wider">Ultimo testo ricevuto ({partialTranslations[p].length} ch)</div>
                <div className="p-3 bg-red-50/50 border border-red-200/50 rounded-lg text-[10px] font-serif text-red-900/80 h-[100px] overflow-y-auto whitespace-pre-wrap select-text cursor-text pointer-events-auto leading-relaxed">
                  {partialTranslations[p].length > 1000 ? `...${partialTranslations[p].slice(-1000)}` : partialTranslations[p]}
                </div>
              </div>
            )}

            {translationLogs?.[p] && (
              <div className="mt-4 p-2 bg-white/80 rounded text-[8px] font-mono text-gray-700 max-w-[320px] max-h-[180px] overflow-y-auto whitespace-pre-wrap border border-red-200 select-text cursor-text pointer-events-auto">
                <div className="flex justify-end mb-1">
                  <button
                    onClick={async () => {
                      const ok = await safeCopy(translationLogs[p]);
                      if (ok) {
                        setCopiedLogPages(prev => ({ ...prev, [p]: true }));
                        window.setTimeout(() => setCopiedLogPages(prev => ({ ...prev, [p]: false })), 1500);
                      }
                    }}
                    className="flex items-center gap-1 text-[8px] px-2 py-1 rounded bg-white hover:bg-white text-gray-700 border border-red-200"
                    title="Copia log"
                    aria-live="polite"
                  >
                    <Copy size={10} /> {copiedLogPages[p] ? 'Copiato' : 'Copia'}
                  </button>
                </div>
                {translationLogs[p]}
              </div>
            )}
            <button onClick={() => onRetry(p)} className="mt-4 px-8 py-3 bg-red-600 text-white rounded-xl text-xs font-black uppercase shadow-xl hover:bg-red-700 transition-colors">Ricarica Pagina</button>
          </div>
        )}
      </div>
    </div>
  );
};
