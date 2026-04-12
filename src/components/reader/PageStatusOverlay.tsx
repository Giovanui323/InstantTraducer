import React, { useState } from 'react';
import { Loader2, Pause, Settings, CirclePlay, RotateCw, Copy, ShieldCheck } from 'lucide-react';
import { safeCopy } from '../../utils/clipboard';
import { READER_STYLES } from '../../styles/readerStyles';
import { PageStatus } from '../../types';

interface PageStatusOverlayProps {
  pageForTools: number | null;
  isTranslatedMode: boolean;
  isManualMode: boolean;
  isPaused: boolean;
  isAutodetecting: boolean;
  isApiConfigured: boolean;
  translationMap: Record<number, string>;
  pageStatus: Record<number, PageStatus>;
  partialTranslations?: Record<number, string>;
  translationLogs?: Record<number, string>;
  autodetectLogs?: string;
  onRetry: (p: number) => void;
  onStop?: (p: number) => void;
  onOpenSettings?: () => void;
}

export const PageStatusOverlay: React.FC<PageStatusOverlayProps> = ({
  pageForTools,
  isTranslatedMode,
  isManualMode,
  isPaused,
  isAutodetecting,
  isApiConfigured,
  translationMap,
  pageStatus,
  partialTranslations,
  translationLogs,
  autodetectLogs,
  onRetry,
  onStop,
  onOpenSettings
}) => {
  const [copiedErrorPages, setCopiedErrorPages] = useState<Record<number, boolean>>({});
  const [copiedLogPages, setCopiedLogPages] = useState<Record<number, boolean>>({});
  const [copiedAutodetectLog, setCopiedAutodetectLog] = useState(false);

  if (pageForTools === null) return null;

  const hasTranslation = typeof translationMap[pageForTools] === 'string' && translationMap[pageForTools].trim().length > 0;

  // Error State
  if (pageStatus[pageForTools]?.error) {
    const errorMsg = String((typeof pageStatus[pageForTools]?.error === 'string' ? pageStatus[pageForTools]?.error : pageStatus[pageForTools]?.loading) || 'Errore durante la traduzione.');
    const errorTitle = (() => {
      const t = errorMsg;
      if (t.includes('Rendering PDF')) return 'Errore Rendering PDF';
      if (t.includes('Timeout globale AI') || t.includes(' AI')) return 'Errore Critico AI';
      return 'Errore Critico';
    })();

    return (
      <div className="fixed inset-0 z-[140] pointer-events-none flex items-center justify-center pb-40">
        <div className="bg-red-50/95 backdrop-blur-xl border border-red-200/50 shadow-surface-2xl rounded-2xl p-8 flex flex-col items-center justify-center pointer-events-auto max-w-[90vw] max-h-[90vh] overflow-y-auto overscroll-contain">
          <div className="text-red-600 font-black uppercase text-[10px] tracking-widest select-text">
            {errorTitle}
          </div>
          <div className="mt-2.5 max-w-[320px] w-full">
            <div className="flex justify-end mb-1">
              <button
                onClick={async () => {
                  const ok = await safeCopy(errorMsg);
                  if (ok) {
                    setCopiedErrorPages(prev => ({ ...prev, [pageForTools]: true }));
                    window.setTimeout(() => setCopiedErrorPages(prev => ({ ...prev, [pageForTools]: false })), 1500);
                  }
                }}
                className="flex items-center gap-1 text-[8px] px-2 py-1 rounded bg-white hover:bg-white text-red-700 border border-red-200"
                title="Copia errore"
                aria-live="polite"
              >
                <Copy size={10} /> {copiedErrorPages[pageForTools] ? 'Copiato' : 'Copia'}
              </button>
            </div>
            <div className="text-red-700/80 text-[10px] font-semibold text-center select-text selection:bg-red-100 selection:text-red-800">
              {errorMsg}
            </div>
          </div>

          {partialTranslations?.[pageForTools] && (
            <div className="mt-4 w-[320px] flex flex-col gap-1.5 pointer-events-auto">
              <div className="flex justify-between items-center px-1">
                <span className="text-[9px] font-bold text-red-600 uppercase tracking-wider">Ultimo testo ricevuto</span>
                <span className="text-[9px] text-txt-muted">{partialTranslations[pageForTools].length} caratteri</span>
              </div>
              <div className="p-3 bg-red-50 border border-red-200/50 rounded-xl text-[10px] font-serif text-red-900/80 h-[100px] overflow-y-auto overscroll-contain whitespace-pre-wrap select-text cursor-text leading-relaxed shadow-inner">
                {partialTranslations[pageForTools].length > 1000 ? `...${partialTranslations[pageForTools].slice(-1000)}` : partialTranslations[pageForTools]}
              </div>
            </div>
          )}

          {translationLogs?.[pageForTools] && (
            <div className="mt-4 w-[320px] bg-surface-2 rounded-xl border border-red-500/20 shadow-surface-2xl overflow-hidden pointer-events-auto flex flex-col">
              <div className="flex items-center justify-between px-3 py-2 bg-red-500/10 border-b border-red-500/10">
                <div className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-red-500" />
                  <span className="text-[9px] font-bold text-red-400/80 uppercase tracking-tighter">Log di Errore</span>
                </div>
                <button
                  onClick={async () => {
                    const logTxt = translationLogs?.[pageForTools];
                    if (logTxt) {
                      const ok = await safeCopy(logTxt);
                      if (ok) {
                        setCopiedLogPages(prev => ({ ...prev, [pageForTools]: true }));
                        window.setTimeout(() => setCopiedLogPages(prev => ({ ...prev, [pageForTools]: false })), 1500);
                      }
                    }
                  }}
                  className="text-[9px] px-2 py-0.5 rounded bg-white/5 hover:bg-white/10 text-txt-muted transition-colors"
                >
                  {copiedLogPages[pageForTools] ? 'Copiato' : 'Copia'}
                </button>
              </div>
              <div className="p-3 text-[9px] font-mono text-txt-muted/80 max-h-[140px] overflow-y-auto overscroll-contain whitespace-pre-wrap select-text cursor-text leading-relaxed custom-scrollbar-dark">
                {translationLogs?.[pageForTools]}
              </div>
            </div>
          )}
          <button onClick={() => onRetry(pageForTools)} className="mt-4 px-8 py-3 bg-red-600 text-white rounded-xl text-xs font-black uppercase shadow-xl hover:bg-red-700 transition-colors">Ricarica Pagina</button>
        </div>
      </div>
    );
  }

  // Loading/Processing State
  if (isTranslatedMode && !hasTranslation) {
    return (
      <div className="fixed inset-0 z-[140] pointer-events-none flex items-center justify-center pb-40">
        <div className="bg-white/95 backdrop-blur-xl border border-border shadow-surface-2xl rounded-2xl p-8 flex flex-col items-center justify-center pointer-events-auto min-w-[320px]">
          {!pageStatus[pageForTools]?.loading && !pageStatus[pageForTools]?.processing ? (
            isManualMode ? (
              <div className="flex flex-col items-center gap-4">
                <button
                  onClick={() => onRetry(pageForTools)}
                  className={READER_STYLES.buttons.manual}
                  title="Traduci questa pagina"
                >
                  <CirclePlay size={40} className="group-hover/manual-btn:scale-110 transition-transform" />
                </button>
                <span className="text-[10px] font-bold uppercase tracking-wider text-accent/70">Clicca per tradurre</span>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-4">
                {isAutodetecting ? (
                  <Loader2 className="animate-spin text-accent w-12 h-12" />
                ) : isPaused ? (
                  <Pause size={40} className="text-orange-500 opacity-50" />
                ) : !isApiConfigured ? (
                  <Settings size={40} className="text-red-500 opacity-80" />
                ) : (
                  <Loader2 className="animate-spin text-accent w-12 h-12" />
                )}
                <div className="flex flex-col items-center gap-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-accent/70">
                    {isAutodetecting
                      ? 'Ricerca nome libro in corso'
                      : isPaused
                        ? 'In Pausa'
                        : !isApiConfigured
                          ? 'API Key mancante'
                          : 'Preparazione traduzione automatica'}
                  </span>
                  <button
                    onClick={() => (!isApiConfigured && onOpenSettings) ? onOpenSettings() : onRetry(pageForTools)}
                    className={`${READER_STYLES.buttons.secondary} pointer-events-auto`}
                  >
                    {isAutodetecting
                      ? 'Avvia comunque'
                      : isPaused
                        ? 'Riprendi'
                        : !isApiConfigured
                          ? 'Configura'
                          : 'Avvia subito'}
                  </button>
                </div>
                {isAutodetecting && autodetectLogs && (
                  <div className="mt-4 w-full bg-surface-2 rounded-xl border border-border-muted shadow-surface-2xl overflow-hidden pointer-events-auto flex flex-col">
                    <div className="flex items-center justify-between px-3 py-2 bg-white/5 border-b border-border-muted">
                      <div className="flex items-center gap-2">
                        <div className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
                        <span className="text-[9px] font-bold text-txt-muted uppercase tracking-tighter">Log AI: Ricerca Nome</span>
                      </div>
                      <button
                        onClick={async () => {
                          const ok = await safeCopy(autodetectLogs);
                          if (ok) {
                            setCopiedAutodetectLog(true);
                            window.setTimeout(() => setCopiedAutodetectLog(false), 1500);
                          }
                        }}
                        className="text-[9px] px-2 py-0.5 rounded bg-white/5 hover:bg-white/10 text-txt-muted transition-colors"
                      >
                        {copiedAutodetectLog ? 'Copiato' : 'Copia'}
                      </button>
                    </div>
                    <div className="p-3 text-[9px] font-mono text-accent/80 max-h-[140px] overflow-y-auto overscroll-contain whitespace-pre-wrap select-text cursor-text leading-relaxed custom-scrollbar-dark">
                      {autodetectLogs.split('\n').slice(-15).join('\n')}
                      <div className="animate-pulse inline-block w-1 h-3 bg-accent/50 ml-1 translate-y-0.5" />
                    </div>
                  </div>
                )}
              </div>
            )
          ) : (
            <>
              {isPaused ? <Pause size={40} className="text-orange-500 opacity-50 mb-4" /> : <Loader2 className="animate-spin text-accent w-12 h-12 mb-4" />}
              <div className="flex flex-col items-center gap-3 w-full max-w-[320px]">
                <span className="text-[11px] font-black uppercase tracking-widest text-txt-muted text-center px-4 leading-relaxed drop-shadow-sm">
                  {isPaused ? 'Traduzione in Pausa' : (pageStatus[pageForTools]?.loading || pageStatus[pageForTools]?.processing || 'Preparazione traduzione...')}
                </span>
                {!isPaused && (
                  <div className="w-48 h-1 bg-gray-100 rounded-full overflow-hidden shadow-inner">
                    <div className="h-full bg-accent animate-progress w-full origin-left shadow-[0_0_8px_rgba(59,130,246,0.5)]" style={{ animationDuration: '2.5s' }} />
                  </div>
                )}

                {translationLogs?.[pageForTools] && (
                  <div className={`mt-4 w-full bg-surface-2 rounded-xl border border-border-muted shadow-surface-2xl overflow-hidden pointer-events-auto flex flex-col ${isPaused ? 'opacity-60 grayscale' : ''}`}>
                    <div className="flex items-center justify-between px-3 py-2 bg-white/5 border-b border-border-muted">
                      <div className="flex items-center gap-2">
                        <div className={`w-1.5 h-1.5 rounded-full bg-accent ${!isPaused ? 'animate-pulse' : ''}`} />
                        <span className="text-[9px] font-bold text-txt-muted uppercase tracking-tighter">Log di Elaborazione</span>
                      </div>
                      <button
                        onClick={async () => {
                          const ok = await safeCopy(translationLogs[pageForTools]);
                          if (ok) {
                            setCopiedLogPages(prev => ({ ...prev, [pageForTools]: true }));
                            window.setTimeout(() => setCopiedLogPages(prev => ({ ...prev, [pageForTools]: false })), 1500);
                          }
                        }}
                        className="text-[9px] px-2 py-0.5 rounded bg-white/5 hover:bg-white/10 text-txt-muted transition-colors"
                      >
                        {copiedLogPages[pageForTools] ? 'Copiato' : 'Copia'}
                      </button>
                    </div>
                    <div className="p-3 text-[9px] font-mono text-accent/80 max-h-[140px] overflow-y-auto overscroll-contain whitespace-pre-wrap select-text cursor-text leading-relaxed custom-scrollbar-dark">
                      {translationLogs[pageForTools].split('\n').slice(-15).join('\n')}
                      <div className="animate-pulse inline-block w-1 h-3 bg-accent/50 ml-1 translate-y-0.5" />
                    </div>
                  </div>
                )}

                {partialTranslations?.[pageForTools] && (
                  <div className="mt-2 w-full flex flex-col gap-1.5 pointer-events-auto">
                    <div className="flex justify-between items-center px-1">
                      <span className="text-[9px] font-bold text-accent uppercase tracking-wider">Streaming Anteprima</span>
                      <span className="text-[9px] text-txt-muted">{partialTranslations[pageForTools].length} caratteri</span>
                    </div>
                    <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-[10px] font-serif text-slate-700 h-[100px] overflow-y-auto overscroll-contain whitespace-pre-wrap select-text cursor-text leading-relaxed shadow-inner">
                      {partialTranslations[pageForTools].length > 1000
                        ? `...${partialTranslations[pageForTools].slice(-1000)}`
                        : partialTranslations[pageForTools]}
                    </div>
                  </div>
                )}

                {!isPaused && (
                  <div className="mt-4 flex gap-2 pointer-events-auto">
                    <button
                      onClick={() => onStop?.(pageForTools)}
                      className={READER_STYLES.buttons.danger}
                    >
                      Stop
                    </button>
                    <button
                      onClick={() => onRetry(pageForTools)}
                      disabled={!!(pageStatus[pageForTools]?.loading || pageStatus[pageForTools]?.processing)}
                      className={`${READER_STYLES.buttons.primary} ${(pageStatus[pageForTools]?.loading || pageStatus[pageForTools]?.processing)
                        ? 'opacity-50 cursor-not-allowed grayscale'
                        : ''
                        }`}
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
      </div>
    );
  }

  return null;
};
