import React, { useEffect, useRef, useState } from 'react';
import Draggable, { DraggableData, DraggableEvent } from 'react-draggable';
import { PDFDocumentProxy } from 'pdfjs-dist';
import { Plus, Minus, Pencil, Loader2 } from 'lucide-react';
import { useZoomSystem } from '../../hooks/useZoomSystem';
import { READER_STYLES, dynamicStyles } from '../../styles/readerStyles';

interface OriginalThumbnailProps {
  src: string;
  pdfDoc?: PDFDocumentProxy | null;
  page?: number;
  isCropped?: boolean;
  onOpen: () => void;
  onEdit: () => void;
  scale: number;
  onScaleChange: (s: number) => void;
  pageRatio?: number;
}

export const OriginalThumbnail: React.FC<OriginalThumbnailProps> = ({
  src,
  pdfDoc,
  page,
  isCropped,
  onOpen,
  onEdit,
  scale,
  onScaleChange,
  pageRatio
}) => {
  const nodeRef = useRef<HTMLDivElement>(null);
  const dragStart = useRef<{ x: number; y: number } | null>(null);
  const [suppressClick, setSuppressClick] = useState(false);
  const [defaultPosition, setDefaultPosition] = useState<{ x: number; y: number } | null>(null);
  const [naturalRatio, setImgNaturalRatio] = useState<number | null>(null);

  const effectiveRatio = pageRatio || naturalRatio || 1.41;

  const { handleWheel, zoomIn, zoomOut } = useZoomSystem({
    value: scale,
    onChange: onScaleChange,
    minScale: 0.5,
    maxScale: 3,
    precision: 4
  });

  useEffect(() => {
    const margin = 24;
    const baseW = 96;
    const thumbW = Math.round(baseW * Math.max(0.5, Math.min(3, scale || 1)));
    setDefaultPosition({
      x: Math.max(margin, window.innerWidth - thumbW - margin),
      y: margin
    });
  }, []);

  useEffect(() => {
    const node = nodeRef.current;
    if (!node) return;

    node.addEventListener('wheel', handleWheel, { passive: false });
    return () => node.removeEventListener('wheel', handleWheel);
  }, [handleWheel]);

  if (!defaultPosition) return null;

  const baseW = 96;
  const currentW = Math.round(baseW * scale);
  const currentH = Math.round(currentW * effectiveRatio);

  return (
    <Draggable
      nodeRef={nodeRef}
      bounds="parent"
      defaultPosition={defaultPosition}
      onStart={(_: DraggableEvent, data: DraggableData) => {
        dragStart.current = { x: data.x, y: data.y };
        setSuppressClick(false);
      }}
      onDrag={(_: DraggableEvent, data: DraggableData) => {
        const start = dragStart.current;
        if (!start) return;
        const distance = Math.sqrt(Math.pow(data.x - start.x, 2) + Math.pow(data.y - start.y, 2));
        if (distance > 15 && !suppressClick) setSuppressClick(true);
      }}
      onStop={() => {
        dragStart.current = null;
        if (suppressClick) {
          window.setTimeout(() => setSuppressClick(false), 100);
        } else {
          setSuppressClick(false);
        }
      }}
    >
      <div
        ref={nodeRef}
        className="absolute top-0 left-0 z-20 select-none touch-none cursor-pointer active:cursor-grabbing will-change-transform pointer-events-auto"
        onClick={(e) => {
          if (suppressClick) {
            e.preventDefault();
            e.stopPropagation();
            return;
          }
          onOpen();
        }}
        title="Vedi originale"
      >
        <div
          className={READER_STYLES.thumbnail.wrapper}
          style={dynamicStyles.thumbnail(currentW, currentH)}
        >
          {src ? (
            <img
              src={src}
              draggable={false}
              className="w-full h-full object-contain opacity-90 group-hover/thumb:opacity-100"
              onLoad={(e) => {
                const img = e.currentTarget;
                if (img.naturalWidth && img.naturalHeight) {
                  setImgNaturalRatio(img.naturalHeight / img.naturalWidth);
                }
              }}
            />
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center bg-gray-50 text-txt-muted gap-2">
              <div className="w-5 h-5 border-2 border-gray-200 border-t-blue-500 rounded-full animate-spin" />
              <span className="text-[8px] font-bold uppercase tracking-tighter">Caricamento...</span>
            </div>
          )}
          <div className="absolute top-2 left-2 z-[30] opacity-0 group-hover/thumb:opacity-100 transition-opacity">
            <button
              type="button"
              aria-label="Modifica originale"
              className="pointer-events-auto p-2 bg-white text-black rounded-full shadow-lg hover:scale-110 transition-all border border-black/10"
              onClick={(e) => {
                e.stopPropagation();
                onEdit();
              }}
              title="Modifica"
            >
              <Pencil size={16} className="text-gray-900" />
            </button>
          </div>
          <div className="absolute bottom-2 right-2 flex gap-1.5 opacity-0 group-hover/thumb:opacity-100 transition-opacity pointer-events-auto z-[30]">
            <button
              type="button"
              aria-label="Rimpicciolisci miniatura"
              className={READER_STYLES.thumbnail.button}
              onClick={(e) => {
                e.stopPropagation();
                zoomOut();
              }}
            >
              <Minus size={14} />
            </button>
            <button
              type="button"
              aria-label="Ingrandisci miniatura"
              className={READER_STYLES.thumbnail.button}
              onClick={(e) => {
                e.stopPropagation();
                zoomIn();
              }}
            >
              <Plus size={14} />
            </button>
          </div>
        </div>
      </div>
    </Draggable>
  );
};
