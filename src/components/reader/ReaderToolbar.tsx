import React, { useRef } from 'react';
import { Hand, MessageSquare, Highlighter, Eraser, Eye, EyeOff, FileDown, Loader2, ShieldCheck, GripVertical } from 'lucide-react';
import Draggable from 'react-draggable';
import { HIGHLIGHT_COLORS, getHighlightButtonStyles } from '../../utils/highlightStyles';

interface ReaderToolbarProps {
  isHandToolActive: boolean;
  isNoteToolActive: boolean;
  isHighlightToolActive: boolean;
  isEraserToolActive: boolean;
  highlightColor: string;
  showThumbnail: boolean;
  canUseNoteTool: boolean;
  isExporting: boolean;
  isCriticalRetryDismissed: boolean;
  totalCriticalCount: number;
  pageForTools: number | null;
  criticalErrorPagesAll: number[];
  onToolChange: (tool: 'highlight' | 'note' | 'eraser' | 'hand' | null) => void;
  onHighlightColorChange: (color: string) => void;
  onToggleThumbnail: () => void;
  onExport: () => void;
  onRestoreCriticalRetry: () => void;
}

const TOOLTIP_BASE = "absolute bottom-full mb-2 left-1/2 -translate-x-1/2 px-2.5 py-1 bg-surface-0/95 text-white text-[11px] font-medium rounded-md backdrop-blur-md border border-border-muted opacity-0 group-hover:opacity-100 pointer-events-none transition-all duration-150 whitespace-nowrap z-[200] shadow-lg";
const BUTTON_BASE = "relative flex items-center justify-center w-9 h-9 rounded-full transition-all duration-150 ease-out-expo hover:scale-110 active:scale-95";
const BUTTON_INACTIVE = "text-txt-muted hover:text-white hover:bg-white/5";

export const ReaderToolbar: React.FC<ReaderToolbarProps> = ({
  isHandToolActive,
  isNoteToolActive,
  isHighlightToolActive,
  isEraserToolActive,
  highlightColor,
  showThumbnail,
  canUseNoteTool,
  isExporting,
  isCriticalRetryDismissed,
  totalCriticalCount,
  pageForTools,
  criticalErrorPagesAll,
  onToolChange,
  onHighlightColorChange,
  onToggleThumbnail,
  onExport,
  onRestoreCriticalRetry
}) => {
  const nodeRef = useRef<HTMLDivElement>(null);
  const activeHighlight = HIGHLIGHT_COLORS.find(c => c.id === highlightColor) || HIGHLIGHT_COLORS[0];

  return (
    <div className="fixed inset-0 z-[160] pointer-events-none animate-fade-in-up flex items-end justify-center pb-24">
      <Draggable nodeRef={nodeRef} bounds="parent" handle=".drag-handle">
        <div ref={nodeRef} className="flex items-center gap-1 px-2 py-1.5 bg-surface-1/85 backdrop-blur-xl border border-border-muted rounded-full shadow-surface-2xl pointer-events-auto h-fit">
          
          <div className="drag-handle cursor-move px-1.5 text-txt-muted hover:text-white flex items-center justify-center transition-colors" title="Sposta barra">
            <GripVertical size={18} />
          </div>
          
          <div className="w-px h-6 bg-border-muted/60 mx-0.5" />

          {isCriticalRetryDismissed && totalCriticalCount > 0 && (
          <>
            <div className="relative group">
              <div className={TOOLTIP_BASE}>
                {totalCriticalCount} avvis{totalCriticalCount === 1 ? 'o critico' : 'i critici'}
              </div>
              <button
                onClick={onRestoreCriticalRetry}
                className={`${BUTTON_BASE} ${(pageForTools !== null && criticalErrorPagesAll.includes(pageForTools))
                  ? 'bg-danger text-white shadow-glow-danger'
                  : 'text-danger hover:text-white hover:bg-danger/20'}`}
                title="Riapri avvisi critici"
              >
                <ShieldCheck size={18} />
                <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-[16px] flex items-center justify-center px-1 bg-danger text-white text-[9px] font-black rounded-full border border-surface-1 shadow">
                  {totalCriticalCount}
                </span>
              </button>
            </div>
            <div className="w-px h-6 bg-border-muted/60" />
          </>
        )}

        <div className="relative group">
          <div className={TOOLTIP_BASE}>
            {isHandToolActive ? "Disattiva Mano" : "Strumento Mano"}
          </div>
          <button
            onClick={() => onToolChange('hand')}
            className={`${BUTTON_BASE} ${isHandToolActive
              ? 'bg-accent text-white shadow-glow-accent'
              : BUTTON_INACTIVE}`}
          >
            <Hand size={18} />
          </button>
        </div>

        <div className="w-px h-6 bg-border-muted/60" />

        <div className="relative group">
          <div className={TOOLTIP_BASE}>
            {canUseNoteTool ? (isNoteToolActive ? "Disattiva Note" : "Aggiungi Nota") : "Solo sul testo tradotto"}
          </div>
          <button
            disabled={!canUseNoteTool}
            onClick={() => onToolChange('note')}
            className={`${BUTTON_BASE} ${isNoteToolActive
              ? 'bg-accent text-white shadow-glow-accent'
              : BUTTON_INACTIVE} ${!canUseNoteTool ? 'opacity-30 cursor-not-allowed hover:scale-100' : ''}`}
          >
            <MessageSquare size={18} />
          </button>
        </div>

        <div className="relative group">
          <div className="absolute bottom-full left-1/2 -translate-x-1/2 pb-2 opacity-0 group-hover:opacity-100 pointer-events-none group-hover:pointer-events-auto transition-all duration-150 scale-95 group-hover:scale-100 origin-bottom z-[200]">
            <div className="flex flex-col gap-2 bg-surface-0/95 px-3 py-2.5 rounded-xl backdrop-blur-md border border-border-muted shadow-surface-xl">
              <span className="text-[9px] font-bold text-txt-secondary uppercase tracking-wider text-center">Marker</span>
              <div className="flex gap-1.5">
                {HIGHLIGHT_COLORS.map(color => (
                  <button
                    key={color.id}
                    onClick={() => onHighlightColorChange(color.id)}
                    className={getHighlightButtonStyles(highlightColor === color.id, color)}
                    style={{ backgroundColor: color.hex }}
                    title={color.label}
                  />
                ))}
              </div>
            </div>
          </div>
          <button
            onClick={() => onToolChange('highlight')}
            className={`${BUTTON_BASE} ${isHighlightToolActive ? 'text-reader-light-text' : BUTTON_INACTIVE}`}
            style={isHighlightToolActive ? {
              backgroundColor: activeHighlight.hex,
              boxShadow: `0 0 16px ${activeHighlight.hex}99`
            } : undefined}
          >
            <Highlighter size={18} />
          </button>
        </div>

        <div className="relative group">
          <div className={TOOLTIP_BASE}>
            {isEraserToolActive ? "Disattiva Gomma" : "Gomma"}
          </div>
          <button
            onClick={() => onToolChange('eraser')}
            className={`${BUTTON_BASE} ${isEraserToolActive
              ? 'bg-danger text-white shadow-glow-danger'
              : BUTTON_INACTIVE}`}
          >
            <Eraser size={18} />
          </button>
        </div>

        <div className="w-px h-6 bg-border-muted/60" />

        <div className="relative group">
          <div className={TOOLTIP_BASE}>
            {showThumbnail ? "Nascondi miniatura" : "Mostra miniatura"}
          </div>
          <button
            onClick={onToggleThumbnail}
            className={`${BUTTON_BASE} ${showThumbnail
              ? 'bg-accent text-white shadow-glow-accent'
              : BUTTON_INACTIVE}`}
          >
            {showThumbnail ? <Eye size={18} /> : <EyeOff size={18} />}
          </button>
        </div>

        <div className="relative group">
          <div className={TOOLTIP_BASE}>
            {isExporting ? "Esportando..." : "Esporta PDF"}
          </div>
          <button
            onClick={onExport}
            disabled={isExporting}
            className={`${BUTTON_BASE} ${isExporting
              ? 'bg-success text-white shadow-glow-success'
              : BUTTON_INACTIVE}`}
          >
            {isExporting ? <Loader2 size={18} className="animate-spin" /> : <FileDown size={18} />}
          </button>
        </div>
      </div>
      </Draggable>
    </div>
  );
};
