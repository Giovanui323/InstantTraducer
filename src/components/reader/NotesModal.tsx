import React, { useEffect, useRef, useState } from 'react';
import Draggable from 'react-draggable';
import { MessageSquare, Loader2, ShieldCheck, Check, Settings, Wand2 } from 'lucide-react';
import { PageAnnotation, PageVerification } from '../../types';
import { getVerificationDisplayData, getVerificationUiState } from '../../utils/verificationUi';

interface NotesModalProps {
  page: number;
  verificationMap: Record<number, PageVerification>;
  annotationMap: Record<number, PageAnnotation[]>;
  translationMap: Record<number, string>;
  onClose: () => void;
  onReanalyzePage?: (p: number) => void;
  onVerifyPage?: (p: number) => void;
  onForceVerifyPage?: (p: number) => void;
  onFixPage?: (p: number, opts?: { forcePro?: boolean }) => void;
  translationsMeta?: Record<number, { model: string; savedAt: number }>;
  verificationsMeta?: Record<number, { model: string; savedAt: number }>;
  showConfirm?: (title: string, message: string, onConfirm: () => void, type?: 'danger' | 'info' | 'alert') => void;
  onOpenSettings?: () => void;
}

export const NotesModal: React.FC<NotesModalProps> = ({
  page,
  verificationMap,
  annotationMap,
  translationMap,
  onClose,
  onReanalyzePage,
  onVerifyPage,
  onForceVerifyPage,
  onFixPage,
  translationsMeta,
  verificationsMeta,
  showConfirm,
  onOpenSettings
}) => {
  const nodeRef = useRef<HTMLDivElement>(null);

  const display = getVerificationDisplayData({
    translatedText: translationMap[page],
    verification: verificationMap[page],
    annotations: annotationMap[page]
  });
  const hasText = display.hasText;
  const v = display.verification;
  const state = v?.state || 'idle';
  const isSevere = v?.severity === 'severe';
  const [elapsedSec, setElapsedSec] = useState(0);
  const [isFixing, setIsFixing] = useState(false);

  useEffect(() => {
    if (state !== 'verifying' || !v?.startedAt) {
      setElapsedSec(0);
      return;
    }
    const id = setInterval(() => {
      setElapsedSec(Math.max(0, Math.floor((Date.now() - v.startedAt!) / 1000)));
    }, 500);
    return () => clearInterval(id);
  }, [state, v?.startedAt]);
  const ui = getVerificationUiState(v);
  const dot = ui.dotClass;
  const label = ui.label;
  const severity = ui.severityLabel;
  const canReanalyze = Boolean(onReanalyzePage) && hasText && state !== 'verifying';
  const canVerify = Boolean(onVerifyPage) && hasText && state !== 'verifying' && state !== 'verified';
  const evidence = v?.evidence || [];
  const showDisclaimer = Boolean(v) && (state === 'failed' || v?.postRetryFailed || v?.severity === 'severe');
  const disclaimerTitle = state === 'failed' ? 'Verifica non riuscita' : (v?.postRetryFailed ? 'Qualità insufficiente' : 'Disclaimer');
  const disclaimerBody = state === 'failed'
    ? 'Non è stato possibile completare la verifica qualità. Il testo potrebbe contenere omissioni.'
    : v?.postRetryFailed
      ? 'La ritraduzione automatica non è riuscita a correggere tutti i problemi rilevati. È necessario un intervento manuale.'
      : 'La verifica segnala problemi gravi (es. omissioni o pezzi non tradotti).';
  const tooltipReanalyze = !hasText
    ? 'Serve una traduzione per rianalizzare.'
    : !onReanalyzePage
      ? 'Configura Gemini per rianalizzare.'
      : state === 'verifying'
        ? 'Verifica già in corso.'
        : 'Rianalizza';
  const tooltipVerify = !hasText
    ? 'Serve una traduzione per verificare.'
    : !onVerifyPage
      ? 'Configura Gemini per verificare.'
      : state === 'verifying'
        ? 'Verifica già in corso.'
        : state === 'verified'
          ? 'Già verificata. Usa Rianalizza.'
          : 'Verifica';
  const tmeta = translationsMeta?.[page];
  const vmeta = verificationsMeta?.[page];
  const progressLine = state === 'verifying'
    ? `${v?.progress || 'In corso…'}${v?.startedAt ? ` • ${elapsedSec}s` : ''}${typeof v?.runId === 'number' ? ` • run ${v.runId}` : ''}`
    : '';
  const visibleAnnotations = display.annotations;

  return (
    <div className="fixed inset-0 z-[260] flex items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-surface-0/50 backdrop-blur-sm" />
      <Draggable nodeRef={nodeRef} cancel=".modal-content, button, [role='button'], a, input, textarea, select" bounds="parent">
        <div
          ref={nodeRef}
          className="w-[600px] max-w-[calc(100vw-48px)] max-h-[90vh] flex flex-col bg-surface-1/70 backdrop-blur-xl border border-border rounded-2xl shadow-surface-2xl overflow-hidden relative"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/40 via-black/10 to-transparent" />
          <div className="modal-header shrink-0 p-4 border-b border-border-muted flex items-center justify-between cursor-move select-none hover:bg-white/5 transition-colors">
            <div className="flex items-center gap-2">
              <MessageSquare size={16} className="text-txt-primary" />
              <div className="text-sm font-semibold text-white drop-shadow-md">Dubbi & verifica — Pagina {page}</div>
            </div>
            <button
              onClick={onClose}
              className="p-2 text-txt-secondary hover:text-white hover:bg-white/5 rounded-lg cursor-pointer"
              aria-label="Chiudi"
              onMouseDown={(e) => e.stopPropagation()}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 6L6 18" />
                <path d="M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="modal-content p-4 space-y-3 overflow-y-auto custom-scrollbar select-text">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 flex flex-col items-start gap-2">
                <span title={tooltipReanalyze}>
                  <button
                    type="button"
                    onClick={() => onReanalyzePage?.(page)}
                    disabled={!canReanalyze}
                    aria-label="Rianalizza"
                    className={`relative w-8 h-8 flex items-center justify-center rounded-full border transition-all ${canReanalyze
                      ? 'bg-white/5 hover:bg-white/10 text-txt-primary border-border-muted hover:border-border'
                      : 'bg-white/5 text-txt-faint border-border-muted opacity-60 cursor-not-allowed'
                      }`}
                  >
                    <Loader2 size={14} className={state === 'verifying' ? 'animate-spin' : ''} />
                    <span className={`absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full ${dot} ${state === 'verifying' ? 'animate-pulse' : ''}`} />
                  </button>
                </span>

                <div className="relative flex flex-col items-center">
                  <div className="relative flex flex-col items-center">
                    <span title={tooltipVerify}>
                      <button
                        type="button"
                        onClick={() => onVerifyPage?.(page)}
                        disabled={!canVerify}
                        aria-label="Verifica"
                        className={`flex items-center gap-1.5 px-3 py-2 rounded-full text-[11px] font-semibold border transition-all ${canVerify
                          ? 'bg-accent/80 hover:bg-accent text-white border-border-muted'
                          : 'bg-white/5 text-txt-faint border-border-muted opacity-60 cursor-not-allowed'
                          }`}
                      >
                        <ShieldCheck size={14} />
                        <span>{state === 'failed' ? 'Riprova Verifica' : 'Verifica'}</span>
                      </button>
                    </span>
                    {state === 'verifying' && (
                      <span className="absolute top-full mt-1 text-[9px] text-txt-muted whitespace-nowrap animate-pulse">
                        {v?.progress === 'In coda...' ? 'In coda...' : 'In corso...'}
                      </span>
                    )}
                  </div>
                </div>

                {isSevere && onFixPage && (
                  <button
                    type="button"
                    disabled={isFixing}
                    onClick={() => {
                      setIsFixing(true);
                      setTimeout(() => {
                        onFixPage(page);
                        onClose();
                      }, 800);
                    }}
                    className={`flex items-center gap-1.5 px-3 py-2 rounded-full text-[11px] font-bold border transition-all shadow-lg ${isFixing
                      ? 'bg-amber-500/50 text-black/50 cursor-not-allowed scale-95'
                      : 'bg-amber-500 hover:bg-amber-400 text-black border-border-muted hover:scale-105 active:scale-95'
                      }`}
                  >
                    {isFixing ? <Loader2 size={14} className="animate-spin" /> : <Wand2 size={14} />}
                    <span>{isFixing ? 'Accodamento...' : 'Rifai con suggerimenti'}</span>
                  </button>
                )}

                {isSevere && onFixPage && (
                  <button
                    type="button"
                    disabled={isFixing}
                    onClick={() => {
                      setIsFixing(true);
                      setTimeout(() => {
                        onFixPage(page, { forcePro: true });
                        onClose();
                      }, 800);
                    }}
                    className={`flex items-center gap-1.5 px-3 py-2 rounded-full text-[11px] font-bold border transition-all shadow-lg ${isFixing
                      ? 'bg-fuchsia-500/30 text-txt-muted cursor-not-allowed scale-95'
                      : 'bg-fuchsia-500/90 hover:bg-fuchsia-500 text-white border-border-muted hover:scale-105 active:scale-95'
                      }`}
                  >
                    {isFixing ? <Loader2 size={14} className="animate-spin" /> : <ShieldCheck size={14} />}
                    <span>{isFixing ? 'Accodamento...' : 'Forza con Modello'}</span>
                  </button>
                )}

                {(state === 'failed' || v?.postRetryFailed || v?.severity === 'severe') && onForceVerifyPage && (
                  <button
                    type="button"
                    onClick={() => {
                      const proceed = () => {
                        onForceVerifyPage(page);
                        onClose();
                      };

                      if (showConfirm) {
                        showConfirm(
                          "Forza Verifica Positiva",
                          "Confermi che la traduzione è corretta? Questo rimuoverà tutte le segnalazioni di errore.",
                          proceed,
                          'info'
                        );
                      } else if (confirm("Confermi che la traduzione è corretta? Questo rimuoverà tutte le segnalazioni di errore.")) {
                        proceed();
                      }
                    }}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-full text-[11px] font-bold border transition-all shadow-lg bg-green-600 hover:bg-green-500 text-white border-border-muted hover:scale-105 active:scale-95 mt-1"
                  >
                    <Check size={14} />
                    <span>Forza OK</span>
                  </button>
                )}

                {state === 'failed' && onOpenSettings && (
                  <button
                    type="button"
                    onClick={() => {
                      onOpenSettings();
                      onClose();
                    }}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-full text-[11px] font-bold border transition-all shadow-lg bg-orange-600 hover:bg-orange-500 text-white border-border-muted hover:scale-105 active:scale-95 mt-1"
                  >
                    <Settings size={14} />
                    <span>Cambia Modello</span>
                  </button>
                )}
              </div>
              <div className="flex-1">
                <div className="text-xs font-semibold text-txt-primary drop-shadow">
                  {label}{severity ? ` • ${severity}` : ''}{v?.changed ? ' • testo aggiornato' : ''}
                </div>
                <div className="text-[10px] text-txt-secondary mt-1 leading-tight">
                  <div>Traduzione: {tmeta ? `${new Date(tmeta.savedAt).toLocaleString()} • Modello: ${tmeta.model}` : 'N/D'}</div>
                  <div>Verifica: {vmeta ? `${new Date(vmeta.savedAt).toLocaleString()} • Modello: ${vmeta.model}` : 'N/D'}</div>
                </div>
                {state === 'verifying' && <div className="text-[11px] text-accent font-bold mt-2 flex items-center gap-2 animate-pulse">
                  <Loader2 size={12} className="animate-spin" />
                  {progressLine}
                </div>}
                {state !== 'verifying' && v?.summary && <div className="text-[11px] text-txt-secondary mt-1 leading-snug drop-shadow-sm">{v.summary}</div>}
              </div>
            </div>

            {state !== 'verifying' && showDisclaimer && (
              <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3">
                <div className="text-[10px] font-black uppercase tracking-widest text-red-300">{disclaimerTitle}</div>
                <div className="mt-1 text-[11px] text-red-200/90 leading-snug">{disclaimerBody}</div>
              </div>
            )}

            {state !== 'verifying' && evidence.length > 0 && (
              <div className="bg-white/5 border border-border-muted rounded-xl p-3">
                <div className="text-[10px] font-black uppercase tracking-widest text-txt-secondary">Evidenze</div>
                <div className="mt-2 space-y-1">
                  {evidence.slice(0, 8).map((ev, i) => (
                    <div key={i} className="text-[11px] text-txt-secondary leading-snug">• {ev}</div>
                  ))}
                </div>
              </div>
            )}

            {visibleAnnotations.length === 0 ? (
              <div className="text-[11px] text-txt-muted">Nessun dubbio segnalato.</div>
            ) : (
              <div className="space-y-2">
                {visibleAnnotations.map((ann) => (
                  <div key={ann.id} className="bg-white/5 border border-border-muted rounded-xl p-3">
                    {ann.originalText && <div className="text-[11px] text-white font-semibold">"{ann.originalText}"</div>}
                    {ann.comment && <div className="text-[11px] text-txt-secondary mt-1 leading-snug">{ann.comment}</div>}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </Draggable>
    </div>
  );
};
