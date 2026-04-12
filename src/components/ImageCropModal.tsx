import React from 'react';
import { X } from 'lucide-react';

interface ImageCropModalProps {
  isOpen: boolean;
  src: string;
  page: number;
  onClose: () => void;
  onConfirm: (result: { page: number; croppedDataUrl: string; rect: any }) => Promise<void>;
}

export const ImageCropModal: React.FC<ImageCropModalProps> = ({ isOpen, src, page, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/80 backdrop-blur-sm animate-fade-in">
      <div className="bg-surface-2 border border-border-muted p-6 rounded-2xl max-w-2xl w-full shadow-surface-2xl animate-fade-in-scale">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-[14px] font-bold text-txt-primary">Ritaglio Immagine — Pagina {page}</h3>
          <button onClick={onClose} className="p-1.5 text-txt-muted hover:text-txt-primary hover:bg-white/[0.04] rounded-lg transition-all duration-200">
            <X size={18} />
          </button>
        </div>
        <div className="relative aspect-video bg-surface-4/50 rounded-xl overflow-hidden mb-5 flex items-center justify-center border border-border-muted">
          <img src={src} alt="To crop" className="max-h-full max-w-full object-contain" />
          <div className="absolute inset-0 flex items-center justify-center bg-black/40 backdrop-blur-sm">
            <span className="text-white text-[12px] font-medium bg-surface-2/80 backdrop-blur-sm px-4 py-2 rounded-lg border border-border-muted">
              Funzionalità di ritaglio non disponibile in questa build
            </span>
          </div>
        </div>
        <div className="flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2 text-[11px] font-bold text-txt-secondary hover:text-txt-primary hover:bg-white/[0.04] rounded-lg transition-all duration-200"
          >
            Chiudi
          </button>
        </div>
      </div>
    </div>
  );
};
