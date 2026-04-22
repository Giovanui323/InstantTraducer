import React, { useState, useRef, useEffect } from 'react';
import { Play, Pause, Square, Loader2 } from 'lucide-react';
import { Tooltip } from '../Tooltip';

interface Props {
  isPaused: boolean;
  onTogglePause: () => void;
  onStop: () => void;
  queueStats?: {
    active: number;
    queued: number;
    details?: Array<{ page: number; type: 'translation' | 'verification'; status: 'active' | 'queued' }>
  };
  variant?: 'toolbar' | 'compact';
}

const QueueItem: React.FC<{
  item: { page: number; type: 'translation' | 'verification'; status: 'active' | 'queued' };
}> = React.memo(({ item }) => (
  <div className="flex items-center gap-3 px-2.5 py-2 rounded-xl hover:bg-white/[0.03] transition-colors">
    <div className={`w-1.5 h-1.5 rounded-full transition-colors ${
      item.type === 'translation'
        ? 'bg-accent shadow-[0_0_6px_rgba(245,158,11,0.35)]'
        : 'bg-success shadow-[0_0_6px_rgba(63,185,80,0.35)]'
    }`} />
    <span className="text-[11px] font-semibold font-mono tabular-nums text-txt-secondary">P.{item.page}</span>
    <span className={`text-[8px] ml-auto uppercase font-bold px-1.5 py-0.5 rounded-md ${
      item.type === 'translation'
        ? 'bg-accent/10 text-accent'
        : 'bg-success/10 text-success'
    }`}>
      {item.type === 'translation' ? 'Trad' : 'Check'}
    </span>
  </div>
));
QueueItem.displayName = 'QueueItem';

export const ActiveProjectTranslationControls: React.FC<Props> = ({
  isPaused,
  onTogglePause,
  onStop,
  queueStats,
  variant = 'compact'
}) => {
  const [showList, setShowList] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const activeCount = queueStats?.active ?? 0;
  const queuedCount = queueStats?.queued ?? 0;
  const isWorking = activeCount > 0 || queuedCount > 0;
  const allItems = queueStats?.details || [];
  const activeItems = allItems.filter((item) => item.status === 'active');
  const queuedItems = allItems.filter((item) => item.status === 'queued');

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (listRef.current && !listRef.current.contains(event.target as Node)) {
        setShowList(false);
      }
    };
    if (showList) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showList]);

  if (!isWorking && !(isPaused && queuedCount > 0)) {
    return null;
  }

  if (variant === 'toolbar') {
    return (
      <div className="flex items-center gap-0.5 bg-white/[0.03] rounded-xl p-0.5 border border-border-muted">
        <Tooltip content={isPaused ? "Riprendi" : "Pausa"}>
          <button
            type="button"
            onClick={onTogglePause}
            aria-label={isPaused ? 'Riprendi traduzioni' : 'Metti in pausa traduzioni'}
            className={`p-2 rounded-lg transition-all duration-200 ${
              isPaused
                ? 'bg-warning/15 text-warning hover:bg-warning/25'
                : 'hover:bg-white/[0.06] text-txt-secondary hover:text-txt-primary'
            }`}
          >
            {isPaused ? <Play className="w-4 h-4 fill-current" /> : <Pause className="w-4 h-4 fill-current" />}
          </button>
        </Tooltip>

        {isWorking && (
          <Tooltip content="Stop">
            <button
              type="button"
              onClick={onStop}
              aria-label="Ferma e svuota la coda"
              className="p-2 rounded-lg hover:bg-danger/15 text-txt-secondary hover:text-danger transition-all duration-200"
            >
              <Square className="w-4 h-4 fill-current" />
            </button>
          </Tooltip>
        )}

        {isWorking && (
          <div className="relative">
            <button
              onClick={() => setShowList(!showList)}
              className="flex items-center gap-2 px-2.5 border-l border-border-muted ml-1 rounded-lg hover:bg-white/[0.04] transition-all duration-200 py-1.5"
            >
              <Loader2 className="w-3.5 h-3.5 text-accent animate-spin" />
              <div className="flex flex-col leading-none">
                <span className="text-[10px] font-bold text-txt-primary tabular-nums">{queueStats?.active}</span>
                <span className="text-[8px] text-txt-secondary tabular-nums">/{queueStats?.queued}</span>
              </div>
            </button>

            {showList && queueStats?.details && queueStats.details.length > 0 && (
              <div ref={listRef} className="absolute bottom-full mb-3 left-1/2 -translate-x-1/2 glass-panel rounded-xl p-2 min-w-[180px] max-h-[300px] overflow-y-auto z-[300] animate-fade-in-scale custom-scrollbar">
                {activeItems.length > 0 && (
                  <>
                    <div className="text-[9px] text-txt-secondary mb-1 px-2 font-bold uppercase tracking-wider flex items-center justify-between sticky top-0 bg-surface-2/95 backdrop-blur-xl pb-1 border-b border-border-muted">
                      <span>Attive</span>
                      <span className="bg-accent/15 text-accent px-1.5 rounded text-[8px] tabular-nums font-black">{activeItems.length}</span>
                    </div>
                    <div className="flex flex-col gap-0.5 mb-2">
                      {activeItems.map((item, i) => (
                        <QueueItem key={`a-${item.page}-${item.type}-${i}`} item={item} />
                      ))}
                    </div>
                  </>
                )}
                {queuedItems.length > 0 && (
                  <>
                    <div className="text-[9px] text-txt-secondary mb-1 px-2 font-bold uppercase tracking-wider flex items-center justify-between sticky top-0 bg-surface-2/95 backdrop-blur-xl pb-1 border-b border-border-muted">
                      <span>In Coda</span>
                      <span className="bg-surface-4 text-txt-secondary px-1.5 rounded text-[8px] tabular-nums font-black">{queuedItems.length}</span>
                    </div>
                    <div className="flex flex-col gap-0.5">
                      {queuedItems.map((item, i) => (
                        <QueueItem key={`q-${item.page}-${item.type}-${i}`} item={item} />
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  // Compact variant for Home/List
  return (
    <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
      <Tooltip content={isPaused ? "Riprendi" : "Pausa"}>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onTogglePause(); }}
          aria-label={isPaused ? 'Riprendi traduzioni' : 'Metti in pausa traduzioni'}
          className={`p-1.5 rounded-lg transition-all duration-200 ${
            isPaused
              ? 'bg-warning/15 text-warning hover:bg-warning/25'
              : 'bg-surface-4/50 text-txt-muted hover:bg-surface-5 hover:text-txt-primary'
          }`}
        >
          {isPaused ? <Play className="w-3 h-3 fill-current" /> : <Pause className="w-3 h-3 fill-current" />}
        </button>
      </Tooltip>

      {isWorking && (
        <Tooltip content="Stop">
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onStop(); }}
            aria-label="Ferma e svuota la coda"
            className="p-1.5 rounded-lg bg-surface-4/50 hover:bg-danger/15 text-txt-muted hover:text-danger transition-all duration-200"
          >
            <Square className="w-3 h-3 fill-current" />
          </button>
        </Tooltip>
      )}

      {isWorking && (
        <div className="ml-1">
          <Loader2 className="w-3 h-3 text-accent animate-spin" />
        </div>
      )}
    </div>
  );
};
