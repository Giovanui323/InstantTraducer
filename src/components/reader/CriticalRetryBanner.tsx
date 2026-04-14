import React, { useEffect, useRef, useState } from 'react';
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
  const [isCriticalRetryDismissed, setIsCriticalRetryDismissed] = useState(false);
  const [isRetryAllCriticalCoolingDown, setIsRetryAllCriticalCoolingDown] = useState(false);
  const cooldownTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (cooldownTimerRef.current != null) window.clearTimeout(cooldownTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (criticalErrorsCount === 0 && isCriticalRetryDismissed) setIsCriticalRetryDismissed(false);
  }, [criticalErrorsCount, isCriticalRetryDismissed]);

  const isRetryAllCriticalInProgress = pagesInRetry.length > 0;

  const handleClick = () => {
    if (!onRetryAllCritical) return;
    if (isRetryAllCriticalInProgress || isRetryAllCriticalCoolingDown) return;
    setIsRetryAllCriticalCoolingDown(true);
    if (cooldownTimerRef.current != null) window.clearTimeout(cooldownTimerRef.current);
    cooldownTimerRef.current = window.setTimeout(() => {
      setIsRetryAllCriticalCoolingDown(false);
      cooldownTimerRef.current = null;
    }, 1500);
    onRetryAllCritical();
  };

  if (!onRetryAllCritical || totalCriticalCount === 0 || isCriticalRetryDismissed) return null;

  return (
    <div className="fixed top-20 left-1/2 -translate-x-1/2 z-[200] animate-in slide-in-from-top-4 fade-in duration-300 pointer-events-auto">
      <div className="flex items-center gap-2">
        <button
          onClick={handleClick}
          disabled={isRetryAllCriticalInProgress || isRetryAllCriticalCoolingDown}
          className={`flex items-center gap-3 px-6 py-3 bg-red-500/90 text-white rounded-full shadow-lg transition-all border border-red-300/20 backdrop-blur-sm ${
            (isRetryAllCriticalInProgress || isRetryAllCriticalCoolingDown)
              ? 'opacity-70 cursor-not-allowed'
              : 'hover:bg-red-600 hover:scale-[1.02] active:scale-[0.98]'
          }`}
        >
          {isRetryAllCriticalInProgress ? (
            <Loader2 size={18} className="text-white/90 animate-spin" />
          ) : (
            <RotateCw size={18} className="text-white/90" />
          )}
          <div className="flex flex-col items-start leading-none">
            <span className="text-[10px] font-semibold uppercase tracking-widest text-red-100/80">Attenzione</span>
            <span className="text-sm font-bold">
              {isRetryAllCriticalInProgress
                ? (pagesInRetry.length === 1
                    ? `Riprovo pagina ${pagesInRetry[0]}…`
                    : (pagesInRetry.length > 1 ? `Riprovo ${pagesInRetry.length} pagine…` : 'Riprovo…'))
                : `Riprova ${criticalErrorsCount} pagine con errori`}
            </span>
            {criticalErrorsCount > 0 && criticalErrorPagesLabelShort && (
              <span className="mt-1 text-[10px] font-semibold text-red-100/90" title={criticalErrorPagesLabel}>
                Pagine: {criticalErrorPagesLabelShort}
              </span>
            )}
            {pagesInRetry.length > 0 && retryPagesLabelShort && (
              <span className="mt-1 text-[10px] font-semibold text-red-100/90">
                In ritraduzione: {retryPagesLabelShort}
              </span>
            )}
          </div>
        </button>
        <button
          onClick={() => setIsCriticalRetryDismissed(true)}
          aria-label="Chiudi avviso"
          className="w-8 h-8 rounded-full bg-black/25 flex items-center justify-center border border-white/10 hover:bg-black/40 transition-colors"
        >
          <X size={16} className="text-white/90" />
        </button>
      </div>
    </div>
  );
};
