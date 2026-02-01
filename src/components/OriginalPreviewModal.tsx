import React from 'react';
import { X, RotateCw, Crop, FileCode } from 'lucide-react';

interface OriginalPreviewModalProps {
  pdfDoc: any;
  src: string;
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
    <div className="fixed inset-0 z-[250] flex items-center justify-center bg-black/90 backdrop-blur-md" onClick={onClose}>
      <div 
        className="relative max-w-[90vw] max-h-[90vh] flex flex-col items-center gap-4"
        onClick={e => e.stopPropagation()}
      >
        <div className="absolute top-[-48px] right-0 flex gap-2">
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
        
        <div className="bg-white rounded-lg shadow-2xl overflow-hidden">
          <img 
            src={src} 
            alt={`Pagina ${page}`} 
            className="max-w-full max-h-[80vh] object-contain"
          />
        </div>
        
        <div className="text-white/60 text-sm font-medium">
          Pagina {page} (Originale)
        </div>
      </div>
    </div>
  );
};
