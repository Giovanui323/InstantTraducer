import React from 'react';

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
    <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div className="bg-[#1e1e1e] border border-white/10 p-6 rounded-2xl max-w-2xl w-full">
        <h3 className="text-lg font-bold text-white mb-4">Ritaglio Immagine - Pagina {page}</h3>
        <div className="relative aspect-video bg-black/20 rounded-xl overflow-hidden mb-6 flex items-center justify-center">
          <img src={src} alt="To crop" className="max-h-full max-w-full object-contain" />
          <div className="absolute inset-0 flex items-center justify-center bg-black/40">
            <span className="text-white text-sm font-medium bg-black/60 px-4 py-2 rounded-full">
              Funzionalità di ritaglio non disponibile in questa build
            </span>
          </div>
        </div>
        <div className="flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-6 py-2 text-sm font-bold text-gray-400 hover:text-white transition-colors"
          >
            Chiudi
          </button>
        </div>
      </div>
    </div>
  );
};
