import React, { useState } from 'react';
import { useTranslationSnapshot } from '../../hooks/useTranslationSnapshot';
import { translationManager } from '../../services/translation/TranslationManager';
import { XCircle, FileText, ExternalLink, Loader2 } from 'lucide-react';

interface Props {
  onOpenProject: (fileId: string) => void;
}

export const BackgroundTranslationSlotCard: React.FC<Props> = ({ onOpenProject }) => {
  const { backgroundJob } = useTranslationSnapshot();
  const [isOpening, setIsOpening] = useState(false);
  const isMounted = React.useRef(true);

  React.useEffect(() => {
    return () => { isMounted.current = false; };
  }, []);

  if (!backgroundJob || backgroundJob.status === 'completed') return null;

  const { fileName, progress, status, error, fileId } = backgroundJob;
  const percent = progress.total > 0
    ? Math.round((progress.translated / progress.total) * 100)
    : 0;

  const handleStop = (e: React.MouseEvent) => {
    e.stopPropagation();
    translationManager.stopBackground();
  };

  const handleOpen = async () => {
    if (isOpening) return;
    setIsOpening(true);
    try {
      await onOpenProject(fileId);
    } finally {
      if (isMounted.current) {
        setIsOpening(false);
      }
    }
  };

  const statusColor = status === 'running' ? 'bg-accent text-accent' : status === 'error' ? 'bg-danger text-danger' : 'bg-txt-muted text-txt-secondary';

  return (
    <div className="mb-6 glass-panel-sm rounded-xl p-4 flex items-center justify-between animate-fade-in-up">
      <div className="flex items-center gap-4 flex-1 min-w-0">
        <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center flex-shrink-0 border border-accent/15">
          <FileText className="w-5 h-5 text-accent" />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1.5">
            <h3 className="text-sm font-semibold text-txt-primary truncate max-w-[220px]" title={fileName}>
              {fileName}
            </h3>
            <span className={`text-[9px] px-1.5 py-0.5 rounded-md uppercase font-bold tracking-wider bg-current/10 border border-current/15 ${statusColor}`}>
              {status === 'running' ? 'Background' : status}
            </span>
          </div>

          <div className="flex items-center gap-3 text-[11px] text-txt-secondary">
            <div className="flex-1 max-w-[140px] h-1 bg-surface-5 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-700 ease-out ${status === 'error' ? 'bg-danger' : 'bg-accent'}`}
                style={{ width: `${percent}%` }}
              />
            </div>
            <span className="tabular-nums">{progress.translated}/{progress.total} pag · {percent}%</span>
          </div>

          {error && <div className="text-[11px] text-danger mt-1 truncate">{error}</div>}
        </div>
      </div>

      <div className="flex items-center gap-1 ml-4">
        <button
          onClick={handleOpen}
          disabled={isOpening}
          className={`p-2.5 hover:bg-white/[0.04] rounded-lg text-txt-secondary hover:text-txt-primary transition-all duration-150 ${isOpening ? 'opacity-50 cursor-not-allowed' : ''}`}
          title="Apri progetto"
        >
          {isOpening ? <Loader2 className="w-4 h-4 animate-spin" /> : <ExternalLink className="w-4 h-4" />}
        </button>

        <button
          onClick={handleStop}
          className="p-2.5 hover:bg-danger/10 rounded-lg text-txt-muted hover:text-danger transition-all duration-150"
          title="Ferma e chiudi"
        >
          <XCircle className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
