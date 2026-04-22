import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Loader2, RotateCw, X } from 'lucide-react';

interface CriticalRetryBannerProps {
  criticalErrorsCount: number;
  totalCriticalCount: number;
  pagesInRetry: number[];
  criticalErrorPagesLabel: string;
  criticalErrorPagesLabelShort: string;
  retryPagesLabelShort: string;
  onRetryAllCritical?: () => void;
}

export const CriticalRetryBanner: React.FC<CriticalRetryBannerProps> = ({
  criticalErrorsCount,
  totalCriticalCount,
  pagesInRetry,
  criticalErrorPagesLabel,
  criticalErrorPagesLabelShort,
  retryPagesLabelShort,
  onRetryAllCritical
}) => {
  const [dismissed, setDismissed] = useState(false);
  const [isExiting, setIsExiting] = useState(false);
  const [coolingDown, setCoolingDown] = useState(false);
  const cooldownRef = useRef<number | null>(null);
  const exitTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (cooldownRef.current != null) window.clearTimeout(cooldownRef.current);
      if (exitTimerRef.current != null) window.clearTimeout(exitTimerRef.current);
    };
  }, []);

  // Re-show when new errors appear after dismissal
  useEffect(() => {
    if (criticalErrorsCount === 0 && dismissed) setDismissed(false);
  }, [criticalErrorsCount, dismissed]);

  const isRetryInProgress = pagesInRetry.length > 0;

  const handleRetry = useCallback(() => {
    if (!onRetryAllCritical) return;
    if (isRetryInProgress || coolingDown) return;
    setCoolingDown(true);
    if (cooldownRef.current != null) window.clearTimeout(cooldownRef.current);
    cooldownRef.current = window.setTimeout(() => {
      setCoolingDown(false);
      cooldownRef.current = null;
    }, 1500);
    onRetryAllCritical();
  }, [onRetryAllCritical, isRetryInProgress, coolingDown]);

  const handleDismiss = useCallback(() => {
    setIsExiting(true);
    if (exitTimerRef.current != null) window.clearTimeout(exitTimerRef.current);
    exitTimerRef.current = window.setTimeout(() => {
      setDismissed(true);
      setIsExiting(false);
      exitTimerRef.current = null;
    }, 250);
  }, []);

  if (!onRetryAllCritical || totalCriticalCount === 0 || dismissed) return null;

  return (
    <div
      className={`fixed top-20 left-1/2 -translate-x-1/2 z-[200] pointer-events-auto transition-all duration-250 ${
        isExiting
          ? 'opacity-0 -translate-y-4 scale-95'
          : 'opacity-100 translate-y-0 scale-100'
      }`}
    >
      <div className="glass-panel flex items-center gap-2 pl-4 pr-2 py-2 rounded-2xl shadow-surface-2xl border-danger/30">
        <button
          onClick={handleRetry}
          disabled={isRetryInProgress || coolingDown}
          className={`flex items-center gap-3 transition-all duration-150 ${
            (isRetryInProgress || coolingDown)
              ? 'opacity-50 cursor-not-allowed'
              : 'hover:brightness-110 active:scale-[0.97]'
          }`}
        >
          <div className="w-7 h-7 rounded-full bg-danger/15 flex items-center justify-center">
            {isRetryInProgress ? (
              <Loader2 size={14} className="text-danger animate-spin" />
            ) : (
              <RotateCw size={14} className="text-danger" />
            )}
          </div>
          <div className="flex flex-col items-start leading-none">
            <span className="text-[9px] font-bold uppercase tracking-widest text-danger/70">
              {isRetryInProgress ? 'In corso...' : 'Attenzione'}
            </span>
            <span className="text-[12px] font-semibold text-txt-primary">
              {isRetryInProgress
                ? (pagesInRetry.length === 1
                    ? `Riprovo pagina ${pagesInRetry[0]}…`
                    : (pagesInRetry.length > 1 ? `Riprovo ${pagesInRetry.length} pagine…` : 'Riprovo…'))
                : `Riprova ${criticalErrorsCount} pagin${criticalErrorsCount === 1 ? 'a' : 'e'} con errori`}
            </span>
          </div>
        </button>
        {(criticalErrorsCount > 1 || pagesInRetry.length > 1) && (
          <div className="text-[9px] text-txt-muted bg-surface-3/60 px-2 py-1 rounded-md border border-border-muted leading-tight">
            {isRetryInProgress
              ? <>In ritraduzione: {retryPagesLabelShort}</>
              : <>Pagine: {criticalErrorPagesLabelShort}</>
            }
          </div>
        )}
        <div className="w-px h-6 bg-border-muted/60 ml-1" />
        <button
          onClick={handleDismiss}
          aria-label="Chiudi avviso"
          className="w-7 h-7 rounded-full hover:bg-white/[0.06] flex items-center justify-center transition-all duration-150 active:scale-90"
        >
          <X size={14} className="text-txt-muted hover:text-txt-primary" />
        </button>
      </div>
    </div>
  );
};
