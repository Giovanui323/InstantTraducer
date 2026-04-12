import React from 'react';
import { MessageSquare, Trash2 } from 'lucide-react';
import { UserNote, ReaderAction } from './readerReducer';

interface NewNoteModalProps {
  noteModal: { page: number, start: number, end: number, text: string } | null;
  onAddNote: (page: number, start: number, end: number, text: string, content: string) => void;
  onClose: () => void;
  onToolChange: (tool: 'highlight' | 'note' | 'eraser' | 'hand' | null) => void;
}

export const NewNoteModal: React.FC<NewNoteModalProps> = ({
  noteModal,
  onAddNote,
  onClose,
  onToolChange
}) => {
  if (!noteModal) return null;

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const content = formData.get('content') as string;
    if (content.trim()) {
      onAddNote(noteModal.page, noteModal.start, noteModal.end, noteModal.text, content.trim());
      onClose();
      onToolChange(null);
    }
  };

  return (
    <div className="fixed inset-0 z-[250] flex items-center justify-center bg-surface-0/80 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-surface-2 border border-border-muted p-6 rounded-2xl w-[400px] shadow-surface-2xl" onClick={e => e.stopPropagation()}>
        <h3 className="text-sm font-bold text-white mb-2">Aggiungi Nota</h3>
        <p className="text-xs text-txt-muted mb-4 italic line-clamp-2">"{noteModal.text}"</p>
        <form onSubmit={handleSubmit}>
          <textarea
            name="content"
            autoFocus
            className="w-full bg-surface-0/30 border border-border-muted rounded-xl p-3 text-sm text-white focus:outline-none focus:border-amber-500/50 min-h-[100px]"
            placeholder="Scrivi qui il tuo commento..."
          />
          <div className="flex justify-end gap-2 mt-4">
            <button type="button" onClick={onClose} className="px-4 py-2 text-xs font-medium text-txt-muted hover:text-white">Annulla</button>
            <button type="submit" className="px-4 py-2 bg-amber-500 text-black text-xs font-bold rounded-lg hover:bg-amber-400">Salva Nota</button>
          </div>
        </form>
      </div>
    </div>
  );
};

interface ViewNoteModalProps {
  viewingNoteId: { page: number, id: string } | null;
  userNotes: Record<number, UserNote[]>;
  onRemoveNote: (page: number, id: string) => void;
  onClose: () => void;
  showConfirm?: (title: string, message: string, onConfirm: () => void, type?: 'danger' | 'info' | 'alert') => void;
}

export const ViewNoteModal: React.FC<ViewNoteModalProps> = ({
  viewingNoteId,
  userNotes,
  onRemoveNote,
  onClose,
  showConfirm
}) => {
  if (!viewingNoteId) return null;

  const note = userNotes[viewingNoteId.page]?.find(n => n.id === viewingNoteId.id);
  if (!note) return null;

  const handleRemove = () => {
    const proceed = () => {
      onRemoveNote(viewingNoteId.page, viewingNoteId.id);
      onClose();
    };

    if (showConfirm) {
      showConfirm("Elimina Nota", "Sei sicuro di voler eliminare questa nota?", proceed, 'danger');
    } else if (confirm('Eliminare questa nota?')) {
      proceed();
    }
  };

  return (
    <div className="fixed inset-0 z-[250] flex items-center justify-center bg-surface-0/80 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-surface-2 border border-border-muted p-6 rounded-2xl w-[400px] shadow-surface-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-start mb-4">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <MessageSquare size={14} className="text-amber-500" /> Nota Utente
          </h3>
          <button onClick={handleRemove} className="text-red-400 hover:text-red-300">
            <Trash2 size={14} />
          </button>
        </div>
        <div className="space-y-4 select-text">
          <div className="p-3 bg-white/5 rounded-xl border border-border-muted text-xs text-txt-muted italic">
            "{note.text}"
          </div>
          <div className="text-sm text-white whitespace-pre-wrap">{note.content}</div>
          <div className="text-[10px] text-txt-muted pt-2 border-t border-border-muted">
            {new Date(note.createdAt).toLocaleString()}
          </div>
        </div>
      </div>
    </div>
  );
};
