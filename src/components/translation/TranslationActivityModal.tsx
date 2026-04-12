import React, { useState } from 'react';
import { useTranslationSnapshot } from '../../hooks/useTranslationSnapshot';
import { translationManager } from '../../services/translation/TranslationManager';
import { X, XCircle, Activity, Loader2, FileText } from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onOpenProject: (fileId: string) => void;
}

export const TranslationActivityModal: React.FC<Props> = ({ isOpen, onClose, onOpenProject }) => {
  const { backgroundJob } = useTranslationSnapshot();
  const [isOpening, setIsOpening] = useState(false);
  const isMounted = React.useRef(true);

  React.useEffect(() => {
    return () => { isMounted.current = false; };
  }, []);

  if (!isOpen) return null;

  const handleOpen = async () => {
    if (isOpening || !backgroundJob) return;
    setIsOpening(true);
    try {
      await onOpenProject(backgroundJob.fileId);
      if (isMounted.current) {
        onClose();
      }
    } catch (e) {
      if (isMounted.current) {
        setIsOpening(false);
      }
    }
  };

  const statusStyles: Record<string, { bg: string; text: string }> = {
    running: { bg: 'bg-accent/10', text: 'text-accent' },
    error: { bg: 'bg-danger/10', text: 'text-danger' },
    completed: { bg: 'bg-success/10', text: 'text-success' },
  };
  const currentStatus = statusStyles[backgroundJob?.status || ''] || { bg: 'bg-surface-4', text: 'text-txt-muted' };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in">
      <div className="bg-surface-2 border border-border-muted rounded-2xl shadow-surface-2xl w-[500px] max-w-[90vw] overflow-hidden animate-fade-in-scale">

        {/* Header */}
        <div className="px-6 py-4 border-b border-border-muted flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-accent/10 border border-accent/15 flex items-center justify-center">
              <Activity className="w-4 h-4 text-accent" />
            </div>
            <h2 className="text-[14px] font-bold text-txt-primary">Attività Traduzioni</h2>
          </div>
          <button onClick={onClose} className="p-1.5 text-txt-muted hover:text-txt-primary hover:bg-white/[0.04] rounded-lg transition-all duration-200">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6">
          {!backgroundJob ? (
            <div className="text-center py-10">
              <FileText size={32} className="mx-auto mb-3 text-txt-faint" strokeWidth={1.5} />
              <p className="text-[12px] text-txt-muted">Nessuna traduzione in background attiva.</p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-start justify-between">
                <div className="min-w-0">
                  <h3 className="text-[14px] font-semibold text-txt-primary mb-1 truncate">{backgroundJob.fileName}</h3>
                  <div className="text-[10px] text-txt-faint font-mono">{backgroundJob.fileId}</div>
                </div>
                <div className={`px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider shrink-0 ml-3 ${currentStatus.bg} ${currentStatus.text}`}>
                  {backgroundJob.status}
                </div>
              </div>

              {/* Progress Bar */}
              <div className="bg-surface-5 rounded-full h-1.5 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-700 ease-out-expo ${backgroundJob.status === 'error' ? 'bg-danger' : 'bg-accent'}`}
                  style={{ width: `${(backgroundJob.progress.translated / Math.max(1, backgroundJob.progress.total)) * 100}%` }}
                />
              </div>
              <div className="flex justify-between text-[11px] text-txt-muted tabular-nums">
                <span>Tradotte: {backgroundJob.progress.translated} / {backgroundJob.progress.total}</span>
                <span>Pagina corrente: {backgroundJob.progress.current}</span>
              </div>

              {/* Error Message */}
              {backgroundJob.error && (
                <div className="p-3 bg-danger/5 border border-danger/15 rounded-lg text-[11px] text-danger leading-relaxed">
                  {backgroundJob.error}
                </div>
              )}

              {/* Actions */}
              <div className="flex items-center gap-3 mt-4 pt-4 border-t border-border-muted">
                <button
                  onClick={handleOpen}
                  disabled={isOpening}
                  className={`flex-1 px-4 py-2.5 bg-accent hover:bg-accent-hover text-white rounded-lg text-[11px] font-bold transition-all duration-200 flex items-center justify-center gap-2 active:scale-95 shadow-surface hover:shadow-glow-accent ${isOpening ? 'opacity-60 cursor-not-allowed' : ''}`}
                >
                  {isOpening && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  {isOpening ? 'Apertura...' : 'Apri Progetto'}
                </button>

                {backgroundJob.status === 'running' && (
                  <button
                    onClick={() => translationManager.stopBackground()}
                    className="px-4 py-2.5 bg-danger/5 hover:bg-danger/10 text-danger border border-danger/15 rounded-lg text-[11px] font-bold transition-all duration-200 flex items-center gap-2 active:scale-95"
                  >
                    <XCircle className="w-3.5 h-3.5" /> Stop & Chiudi
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
