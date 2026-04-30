import React, { useState } from 'react';
import { X, FilePlus, CopyPlus } from 'lucide-react';
import { ReadingProgress } from '../types';

interface AddPagesModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAppendPdf: (file: File) => void;
  onMergeTranslation: (sourceFileId: string) => void;
  recentBooks: Record<string, ReadingProgress>;
  currentFileId: string;
}

export const AddPagesModal: React.FC<AddPagesModalProps> = ({
  isOpen,
  onClose,
  onAppendPdf,
  onMergeTranslation,
  recentBooks,
  currentFileId
}) => {
  const [tab, setTab] = useState<'pdf' | 'merge'>('pdf');

  if (!isOpen) return null;

  const availableBooks = Object.values(recentBooks).filter(
    b => b.fileId && b.fileId !== currentFileId && b.totalPages && b.totalPages > 0
  );

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div 
        className="absolute inset-0 bg-surface-0/60 backdrop-blur-sm transition-opacity" 
        onClick={onClose}
      />
      
      <div className="relative glass-panel rounded-xl shadow-surface-2xl w-full max-w-md overflow-hidden flex flex-col max-h-[85vh] animate-scale-up">
        <div className="px-5 py-4 border-b border-white/[0.08] flex items-center justify-between">
          <h2 className="text-[14px] font-semibold text-txt-primary flex items-center gap-2">
            <FilePlus size={16} className="text-accent" />
            Aggiungi Pagine
          </h2>
          <button 
            onClick={onClose}
            className="p-1.5 rounded-md text-txt-muted hover:bg-white/10 hover:text-txt-primary transition-colors focus:outline-none"
          >
            <X size={14} />
          </button>
        </div>

        <div className="flex px-5 pt-3 gap-4 border-b border-white/[0.08]">
          <button
            onClick={() => setTab('pdf')}
            className={`pb-2 text-[12px] font-medium transition-colors border-b-2 ${
              tab === 'pdf' 
                ? 'text-accent border-accent' 
                : 'text-txt-muted border-transparent hover:text-txt-secondary'
            }`}
          >
            Da nuovo PDF
          </button>
          <button
            onClick={() => setTab('merge')}
            className={`pb-2 text-[12px] font-medium transition-colors border-b-2 ${
              tab === 'merge' 
                ? 'text-accent border-accent' 
                : 'text-txt-muted border-transparent hover:text-txt-secondary'
            }`}
          >
            Unisci Traduzione Esistente
          </button>
        </div>

        <div className="p-5 overflow-y-auto">
          {tab === 'pdf' && (
            <div className="space-y-4">
              <p className="text-[12px] text-txt-secondary leading-relaxed">
                Aggiungi un nuovo PDF al progetto corrente. Le pagine verranno accodate a quelle esistenti e potrai tradurle mantenendo il contesto del documento originale.
              </p>
              
              <div className="mt-4 flex justify-center">
                <label className="cursor-pointer group flex flex-col items-center gap-3 p-8 border-2 border-dashed border-border-muted rounded-xl hover:border-accent/40 hover:bg-accent/5 transition-colors w-full">
                  <div className="p-3 bg-surface-2 rounded-full group-hover:bg-accent/20 group-hover:text-accent transition-colors">
                    <FilePlus size={24} className="text-txt-muted group-hover:text-accent" />
                  </div>
                  <div className="text-center">
                    <span className="text-[13px] font-semibold text-accent group-hover:text-accent-hover block mb-1">
                      Seleziona il PDF da aggiungere
                    </span>
                    <span className="text-[11px] text-txt-muted">
                      Supporta tutti i formati PDF
                    </span>
                  </div>
                  <input 
                    type="file" 
                    className="hidden" 
                    accept="application/pdf"
                    onChange={(e) => {
                      if (e.target.files && e.target.files[0]) {
                        onAppendPdf(e.target.files[0]);
                        onClose();
                      }
                    }}
                  />
                </label>
              </div>
            </div>
          )}

          {tab === 'merge' && (
            <div className="space-y-4">
              <p className="text-[12px] text-txt-secondary leading-relaxed">
                Seleziona una traduzione esistente da unire al progetto corrente. 
                Tutte le pagine, traduzioni e note verranno accodate in fondo. 
                <br /><br />
                <span className="text-warning-hover font-medium">Attenzione:</span> Dopo l'unione, il progetto sorgente verrà spostato nel cestino per evitare duplicati.
              </p>
              
              <div className="mt-4 flex flex-col gap-2 max-h-[250px] overflow-y-auto custom-scrollbar pr-1">
                {availableBooks.length === 0 ? (
                  <div className="text-center py-6 text-[12px] text-txt-muted bg-surface-1 rounded-lg border border-border-muted/50">
                    Nessun'altra traduzione disponibile da unire.
                  </div>
                ) : (
                  availableBooks.map(book => (
                    <button
                      key={book.fileId}
                      onClick={() => {
                        onMergeTranslation(book.fileId!);
                        onClose();
                      }}
                      className="flex items-center justify-between p-3 rounded-lg border border-border-muted bg-surface-1 hover:bg-surface-2 hover:border-accent/30 transition-all text-left group"
                    >
                      <div className="flex-1 min-w-0 pr-3">
                        <h4 className="text-[12px] font-medium text-txt-primary truncate">
                          {book.fileName}
                        </h4>
                        <div className="text-[10px] text-txt-muted mt-0.5 flex gap-2">
                          <span>{book.totalPages} pagine</span>
                          {book.inputLanguage && <span>• {book.inputLanguage}</span>}
                        </div>
                      </div>
                      <CopyPlus size={16} className="text-txt-faint group-hover:text-accent shrink-0" />
                    </button>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
