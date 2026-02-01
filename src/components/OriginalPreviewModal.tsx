import React from 'react';
import { X, RotateCw, Crop, FileCode } from 'lucide-react';

interface OriginalPreviewModalProps {
  pdfDoc: any;
  src?: string;
  page: number;
  onClose: () => void;
  onCrop?: (p: number) => void;
  onRotate?: (p: number) => void;
  onReplace?: (p: number) => void;
}

export const OriginalPreviewModal: React.FC<OriginalPreviewModalProps> = ({
  src,
  page,
  onClose,
  onCrop,
  onRotate,
  onReplace
}) => {
  return (
    <div className="fixed top-12 left-0 right-0 bottom-0 z-[250] relative flex items-center justify-center bg-black/90 backdrop-blur-md" onClick={onClose}>
      <div className="absolute top-4 right-4 flex gap-2" onClick={(e) => e.stopPropagation()}>
        {onRotate && (
          <button
            onClick={() => onRotate(page)}
            className="p-2 bg-white/10 hover:bg-white/20 text-white rounded-full transition-colors"
            title="Ruota"
          >
            <RotateCw size={20} />
          </button>
        )}
        {onCrop && (
          <button
            onClick={() => onCrop(page)}
            className="p-2 bg-white/10 hover:bg-white/20 text-white rounded-full transition-colors"
            title="Ritaglia"
          >
            <Crop size={20} />
          </button>
        )}
        {onReplace && (
          <button
            onClick={() => onReplace(page)}
            className="p-2 bg-white/10 hover:bg-white/20 text-white rounded-full transition-colors"
            title="Sostituisci"
          >
            <FileCode size={20} />
          </button>
        )}
        <button
          onClick={onClose}
          className="p-2 bg-white/10 hover:bg-white/20 text-white rounded-full transition-colors"
          title="Chiudi"
        >
          <X size={20} />
        </button>
      </div>
      <div 
        className="relative max-w-[90vw] max-h-[90vh] flex flex-col items-center gap-4"
        onClick={e => e.stopPropagation()}
      >
        <div className="bg-white rounded-lg shadow-2xl overflow-hidden">
          {src ? (
            <img
              src={src}
              alt={`Pagina ${page}`}
              className="max-w-full max-h-[80vh] object-contain"
            />
          ) : (
            <div className="w-[70vw] h-[60vh] bg-gray-100 flex items-center justify-center">
              <span className="text-gray-500 text-sm font-medium">Immagine non disponibile</span>
            </div>
          )}
        </div>
        
        <div className="text-white/60 text-sm font-medium">
          Pagina {page} (Originale)
        </div>
      </div>
    </div>
  );
};
