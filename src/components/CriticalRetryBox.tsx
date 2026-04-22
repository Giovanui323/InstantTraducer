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

  useEffect(() => {
    if (localPos.x !== position.x || localPos.y !== position.y) {
      setLocalPos(position);
    }
  }, [position.x, position.y]);

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
        <div className="glass-panel flex items-center gap-1.5 pl-3 pr-1.5 py-1.5 rounded-2xl shadow-surface-2xl border-danger/30">
          <div
            className="critical-retry-drag-handle w-6 h-6 rounded-lg hover:bg-white/[0.06] flex items-center justify-center cursor-move select-none transition-colors"
            title="Sposta avviso"
          >
            <GripVertical size={12} className="text-txt-muted" />
          </div>
          <button
            onClick={onRetry}
            disabled={isRetryInProgress || isRetryCoolingDown}
            className={`flex items-center gap-2 mr-1 transition-all duration-150 ${(isRetryInProgress || isRetryCoolingDown)
              ? 'opacity-50 cursor-not-allowed'
              : 'hover:brightness-110 active:scale-[0.97]'
            }`}
          >
            <div className="w-6 h-6 rounded-full bg-danger/15 flex items-center justify-center">
              {isRetryInProgress ? (
                <Loader2 size={12} className="text-danger animate-spin" />
              ) : (
                <RotateCw size={12} className="text-danger" />
              )}
            </div>
            <div className="flex flex-col items-start leading-none">
              <span className="text-[8px] font-bold uppercase tracking-widest text-danger/60">
                {isRetryInProgress ? 'In corso...' : 'Attenzione'}
              </span>
              <span className="text-[11px] font-semibold text-txt-primary">
                {isRetryInProgress
                  ? (pagesInRetry.length === 1 ? `Pag. ${pagesInRetry[0]}` : `${pagesInRetry.length} pag.`)
                  : (criticalErrorsCount === 1 ? `Riprova pag. ${criticalErrorPagesPending[0]}` : `Riprova ${criticalErrorsCount} err`)
                }
              </span>
            </div>
          </button>
          <div className="w-px h-5 bg-border-muted/60" />
          <button
            onClick={onDismiss}
            aria-label="Chiudi avviso"
            className="w-6 h-6 rounded-lg hover:bg-white/[0.06] flex items-center justify-center transition-all duration-150 active:scale-90"
            title="Ignora avvisi"
          >
            <X size={12} className="text-txt-muted" />
          </button>
        </div>

        {(criticalErrorsCount > 1 || pagesInRetry.length > 1) && (
          <div className="text-[9px] text-txt-muted bg-surface-3/60 backdrop-blur-sm px-2 py-1 rounded-lg border border-border-muted/50">
            {isRetryInProgress
              ? `In ritraduzione: ${retryPagesLabelShort || '...'}`
              : `Pagine: ${criticalErrorPagesLabelShort || 'varie'}`
            }
          </div>
        )}
      </div>
    </Draggable>
  );
});

CriticalRetryBox.displayName = 'CriticalRetryBox';
