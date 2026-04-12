import React, { useRef, useState, useEffect } from 'react';
import Draggable, { DraggableData, DraggableEvent } from 'react-draggable';
import { Loader2, RotateCw, X, GripVertical } from 'lucide-react';

interface CriticalRetryBoxProps {
  position: { x: number; y: number };
  onDragStop: (e: DraggableEvent, data: DraggableData) => void;
  onRetry: () => void;
  onDismiss: () => void;
  isRetryInProgress: boolean;
  isRetryCoolingDown: boolean;
  pagesInRetry: number[];
  criticalErrorsCount: number;
  criticalErrorPagesPending: number[];
  retryPagesLabelShort: string | null;
  criticalErrorPagesLabelShort: string | null;
}

export const CriticalRetryBox = React.forwardRef<HTMLDivElement, CriticalRetryBoxProps>(({
  position,
  onDragStop,
  onRetry,
  onDismiss,
  isRetryInProgress,
  isRetryCoolingDown,
  pagesInRetry,
  criticalErrorsCount,
  criticalErrorPagesPending,
  retryPagesLabelShort,
  criticalErrorPagesLabelShort
}, ref) => {
  const nodeRef = useRef<HTMLDivElement>(null);
  const [localPos, setLocalPos] = useState(position);

  // Sync position from parent if it changes (e.g. window resize clamping)
  useEffect(() => {
    if (localPos.x !== position.x || localPos.y !== position.y) {
      setLocalPos(position);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [position.x, position.y]);

  // Expose the div ref to parent (ReaderView uses it for clamping calculation)
  React.useImperativeHandle(ref, () => nodeRef.current as HTMLDivElement);

  const handleDrag = (_: DraggableEvent, data: DraggableData) => {
    setLocalPos({ x: data.x, y: data.y });
  };

  const handleStop = (e: DraggableEvent, data: DraggableData) => {
    onDragStop(e, data);
  };

  return (
    <Draggable
      nodeRef={nodeRef}
      handle=".critical-retry-drag-handle"
      position={localPos}
      onDrag={handleDrag}
      onStop={handleStop}
    >
      <div
        ref={nodeRef}
        onPointerDown={(e) => e.stopPropagation()}
        className="fixed top-52 right-6 z-[190] flex flex-col items-end gap-2 animate-fade-in-up pointer-events-auto"
      >
        <div className="glass-panel-sm flex items-center gap-2 p-1 pl-3 pr-1 bg-danger/85 text-white rounded-full shadow-[0_0_24px_rgba(248,81,73,0.35),0_8px_30px_rgba(0,0,0,0.3)] border border-danger/40">
          <div
            className="critical-retry-drag-handle w-6 h-6 rounded-full bg-black/20 hover:bg-black/30 flex items-center justify-center cursor-move select-none transition-colors"
            title="Sposta avviso"
          >
            <GripVertical size={14} className="text-white/80" />
          </div>
          <button
            onClick={onRetry}
            disabled={isRetryInProgress || isRetryCoolingDown}
            className={`flex items-center gap-2 mr-2 transition-all duration-150 ${(isRetryInProgress || isRetryCoolingDown)
              ? 'opacity-60 cursor-not-allowed'
              : 'hover:brightness-110 active:scale-95'
            }`}
          >
            {isRetryInProgress ? (
              <Loader2 size={14} className="text-white/90 animate-spin" />
            ) : (
              <RotateCw size={14} className="text-white/90" />
            )}
            <div className="flex flex-col items-start leading-none">
              <span className="text-[8px] font-black uppercase tracking-widest text-danger/70">
                {isRetryInProgress ? 'In corso...' : 'Attenzione'}
              </span>
              <span className="text-[11px] font-bold">
                {isRetryInProgress
                  ? (pagesInRetry.length === 1 ? `Pag. ${pagesInRetry[0]}` : `${pagesInRetry.length} pag.`)
                  : (criticalErrorsCount === 1 ? `Riprova pag. ${criticalErrorPagesPending[0]}` : `Riprova ${criticalErrorsCount} err`)
                }
              </span>
            </div>
          </button>
          <div className="h-6 w-px bg-white/15" />
          <button
            onClick={onDismiss}
            aria-label="Chiudi avviso"
            className="w-6 h-6 rounded-full bg-black/20 hover:bg-black/30 flex items-center justify-center transition-colors duration-150"
            title="Ignora avvisi"
          >
            <X size={12} className="text-white/80" />
          </button>
        </div>

        {(criticalErrorsCount > 1 || pagesInRetry.length > 1) && (
          <div className="text-[9px] text-txt-muted bg-surface-2/80 backdrop-blur-sm px-2 py-1 rounded-md border border-border-muted">
            {isRetryInProgress
              ? `Stato: ${retryPagesLabelShort || 'In corso...'}`
              : `Pagine: ${criticalErrorPagesLabelShort || 'varie'}`
            }
          </div>
        )}
      </div>
    </Draggable>
  );
});

CriticalRetryBox.displayName = 'CriticalRetryBox';
