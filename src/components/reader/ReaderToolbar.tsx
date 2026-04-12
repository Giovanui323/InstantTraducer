import React from 'react';
import { Hand, MessageSquare, Highlighter, Eraser, Eye, EyeOff, FileDown, Loader2, ShieldCheck } from 'lucide-react';
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
  return (
    <div className="fixed bottom-8 right-8 z-[100] flex flex-col items-end gap-3 pointer-events-auto">
      {isCriticalRetryDismissed && totalCriticalCount > 0 && (
        <div className="relative group flex items-center mb-2">
          <div className="absolute right-full mr-3 top-1/2 -translate-y-1/2 px-3 py-1.5 bg-surface-0/95 text-white text-xs font-medium rounded-lg backdrop-blur-md border border-border-muted opacity-0 group-hover:opacity-100 pointer-events-none transition-all duration-200 whitespace-nowrap z-[200] shadow-xl">
            {totalCriticalCount} avvis{totalCriticalCount === 1 ? 'o critico' : 'i critici'}
          </div>
          <button
            onClick={onRestoreCriticalRetry}
            className={`relative flex items-center justify-center w-12 h-12 rounded-full shadow-surface-2xl transition-all border ${(pageForTools !== null && criticalErrorPagesAll.includes(pageForTools))
              ? 'bg-red-600 text-white border-red-400 shadow-glow-danger'
              : 'bg-surface-4 text-txt-muted border-border-muted shadow-[0_0_16px_rgba(248,81,73,0.25)]'
              } hover:scale-105 active:scale-95 hover:text-white hover:border-border`}
            title="Riapri avvisi critici"
          >
            <ShieldCheck size={20} />
            <span className="absolute -top-1.5 -right-1.5 min-w-[20px] h-[20px] flex items-center justify-center px-1 bg-red-500 text-white text-[10px] font-black rounded-full border-2 border-surface-0 shadow-lg">
              {totalCriticalCount}
            </span>
          </button>
        </div>
      )}

      <div className="relative group flex items-center">
        <div className="absolute right-full mr-3 top-1/2 -translate-y-1/2 px-3 py-1.5 bg-surface-0/95 text-white text-xs font-medium rounded-lg backdrop-blur-md border border-border-muted opacity-0 group-hover:opacity-100 pointer-events-none transition-all duration-200 whitespace-nowrap z-[200] shadow-xl">
          {isHandToolActive ? "Disattiva Mano" : "Strumento Mano (Sposta)"}
        </div>
        <button
          onClick={() => onToolChange('hand')}
          className={`flex items-center justify-center w-12 h-12 rounded-full shadow-surface-2xl transition-all border ${isHandToolActive
            ? 'bg-accent text-white border-accent/50 shadow-glow-accent'
            : 'bg-surface-4 text-txt-muted border-border-muted'
            } hover:scale-105 active:scale-95 hover:text-white hover:border-border`}
        >
          <Hand size={20} />
        </button>
      </div>

      <div className="relative group flex items-center">
        <div className="absolute right-full mr-3 top-1/2 -translate-y-1/2 px-3 py-1.5 bg-surface-0/95 text-white text-xs font-medium rounded-lg backdrop-blur-md border border-border-muted opacity-0 group-hover:opacity-100 pointer-events-none transition-all duration-200 whitespace-nowrap z-[200] shadow-xl">
          {canUseNoteTool ? (isNoteToolActive ? "Disattiva Note" : "Aggiungi Nota") : "Le note si aggiungono sul testo tradotto"}
        </div>
        <button
          disabled={!canUseNoteTool}
          onClick={() => onToolChange('note')}
          className={`flex items-center justify-center w-12 h-12 rounded-full shadow-surface-2xl transition-all border ${isNoteToolActive
            ? 'bg-amber-500 text-black border-amber-400 shadow-glow-warning'
            : 'bg-surface-4 text-txt-muted border-border-muted'
            } ${canUseNoteTool ? 'hover:scale-105 active:scale-95 hover:text-white hover:border-border' : 'opacity-40 cursor-not-allowed'}`}
        >
          <MessageSquare size={20} />
        </button>
      </div>

      <div className="relative group flex items-center">
        <div className="absolute right-full top-1/2 -translate-y-1/2 pr-3 opacity-0 group-hover:opacity-100 pointer-events-none group-hover:pointer-events-auto transition-all scale-95 group-hover:scale-100 origin-right z-[200]">
          <div className="flex flex-col gap-2 bg-surface-0/90 p-2 rounded-xl backdrop-blur-sm border border-border-muted">
            <span className="text-[10px] font-bold text-txt-primary uppercase tracking-wider text-center mb-1">Evidenziatore</span>
            <div className="grid grid-cols-2 gap-2">
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
          className={`flex items-center justify-center w-12 h-12 rounded-full shadow-surface-2xl transition-all hover:scale-105 active:scale-95 border ${isHighlightToolActive
            ? (() => {
              const c = HIGHLIGHT_COLORS.find(c => c.id === highlightColor) || HIGHLIGHT_COLORS[0];
              return `${c.twClass} text-black border-border-muted0`;
            })()
            : 'bg-surface-4 text-txt-muted hover:text-white border-border-muted hover:border-border'
            }`}
          style={isHighlightToolActive ? {
            boxShadow: `0 0 20px ${HIGHLIGHT_COLORS.find(c => c.id === highlightColor)?.hex}66`
          } : undefined}
        >
          <Highlighter size={20} />
        </button>
      </div>

      <div className="relative group flex items-center">
        <div className="absolute right-full mr-3 top-1/2 -translate-y-1/2 px-3 py-1.5 bg-surface-0/95 text-white text-xs font-medium rounded-lg backdrop-blur-md border border-border-muted opacity-0 group-hover:opacity-100 pointer-events-none transition-all duration-200 whitespace-nowrap z-[200] shadow-xl">
          {showThumbnail ? "Nascondi miniatura originale" : "Mostra miniatura originale"}
        </div>
        <button
          onClick={onToggleThumbnail}
          className={`flex items-center justify-center w-12 h-12 rounded-full shadow-surface-2xl transition-all hover:scale-105 active:scale-95 border ${showThumbnail
            ? 'bg-accent text-white border-accent/50 shadow-glow-accent-lg'
            : 'bg-surface-4 text-txt-muted hover:text-white border-border-muted hover:border-border'
            }`}
        >
          {showThumbnail ? <Eye size={20} /> : <EyeOff size={20} />}
        </button>
      </div>

      <div className="relative group flex items-center">
        <div className="absolute right-full mr-3 top-1/2 -translate-y-1/2 px-3 py-1.5 bg-surface-0/95 text-white text-xs font-medium rounded-lg backdrop-blur-md border border-border-muted opacity-0 group-hover:opacity-100 pointer-events-none transition-all duration-200 whitespace-nowrap z-[200] shadow-xl">
          {isExporting ? `Esportando...` : 'Esporta PDF'}
        </div>
        <button
          onClick={onExport}
          disabled={isExporting}
          className={`flex items-center justify-center w-12 h-12 rounded-full shadow-surface-2xl transition-all hover:scale-105 active:scale-95 border ${isExporting
            ? 'bg-emerald-600 text-white border-emerald-400 shadow-glow-success'
            : 'bg-surface-4 text-txt-muted hover:text-white border-border-muted hover:border-border'
            }`}
        >
          {isExporting ? <Loader2 size={20} className="animate-spin" /> : <FileDown size={20} />}
        </button>
      </div>

      <div className="relative group flex items-center">
        <div className="absolute right-full mr-3 top-1/2 -translate-y-1/2 px-3 py-1.5 bg-surface-0/95 text-white text-xs font-medium rounded-lg backdrop-blur-md border border-border-muted opacity-0 group-hover:opacity-100 pointer-events-none transition-all duration-200 whitespace-nowrap z-[200] shadow-xl">
          {isEraserToolActive ? "Disattiva Gomma" : "Gomma (Cancella)"}
        </div>
        <button
          onClick={() => onToolChange('eraser')}
          className={`flex items-center justify-center w-12 h-12 rounded-full shadow-surface-2xl transition-all hover:scale-105 active:scale-95 border ${isEraserToolActive
            ? 'bg-rose-500 text-white border-rose-400 shadow-[0_0_20px_rgba(244,63,94,0.3)]'
            : 'bg-surface-4 text-txt-muted hover:text-white border-border-muted hover:border-border'
            }`}
        >
          <Eraser size={20} />
        </button>
      </div>
    </div>
  );
};
