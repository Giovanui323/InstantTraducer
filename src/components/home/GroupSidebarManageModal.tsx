import React, { useState, useMemo } from 'react';
import { X, Trash2, Plus, Check, Tag, ChevronDown, ChevronRight } from 'lucide-react';
import { useLibrary } from '../../contexts/LibraryContext';

interface GroupSidebarManageModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const GroupSidebarManageModal: React.FC<GroupSidebarManageModalProps> = ({ isOpen, onClose }) => {
  const { availableGroups, recentBooks, createGroup, deleteGroup, addBookToGroup } = useLibrary();
  const [newGroupName, setNewGroupName] = useState('');
  const [selectedBookIds, setSelectedBookIds] = useState<string[]>([]);
  const [showBookPicker, setShowBookPicker] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [expandedGroupId, setExpandedGroupId] = useState<string | null>(null);

  const allBooks = useMemo(() =>
    Object.values(recentBooks || {})
      .filter(b => !!(b && b.fileId))
      .sort((a, b) => b.timestamp - a.timestamp),
    [recentBooks]
  );

  const getBooksInGroup = (groupId: string) =>
    allBooks.filter(b => b.groups?.includes(groupId));

  if (!isOpen) return null;

  const handleCreate = () => {
    const trimmed = newGroupName.trim();
    if (!trimmed) return;
    const newGroup = createGroup(trimmed);
    if (newGroup) {
      selectedBookIds.forEach(fileId => addBookToGroup(fileId, newGroup.id));
    }
    setNewGroupName('');
    setSelectedBookIds([]);
    setShowBookPicker(false);
  };

  const handleDelete = (groupId: string) => {
    deleteGroup(groupId);
    setDeleteConfirmId(null);
    if (expandedGroupId === groupId) setExpandedGroupId(null);
  };

  const toggleBookInGroup = (groupId: string, fileId: string) => {
    addBookToGroup(fileId, groupId);
  };

  const toggleNewBookSelection = (fileId: string) => {
    setSelectedBookIds(prev =>
      prev.includes(fileId)
        ? prev.filter(id => id !== fileId)
        : [...prev, fileId]
    );
  };

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
      <div className="bg-surface-2 border border-border-muted rounded-2xl shadow-surface-2xl w-full max-w-md overflow-hidden flex flex-col max-h-[80vh] animate-fade-in-scale">
        {/* Header */}
        <div className="px-5 py-4 border-b border-border-muted flex items-center justify-between shrink-0">
          <h3 className="text-[14px] font-bold text-txt-primary flex items-center gap-2">
            <Tag size={16} className="text-accent" />
            Gestisci Gruppi
          </h3>
          <button onClick={onClose} className="p-1.5 hover:bg-white/[0.04] rounded-lg text-txt-muted hover:text-txt-primary transition-all duration-200">
            <X size={18} />
          </button>
        </div>

        {/* Group list */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-5 space-y-2">
          {availableGroups.length === 0 && (
            <p className="text-[12px] text-txt-muted italic text-center py-4">Nessun gruppo creato.</p>
          )}
          {availableGroups.map(group => {
            const booksInGroup = getBooksInGroup(group.id);
            const count = booksInGroup.length;
            const confirming = deleteConfirmId === group.id;
            const expanded = expandedGroupId === group.id;
            return (
              <div key={group.id} className="rounded-lg bg-white/[0.02] border border-border-muted/60 overflow-hidden">
                {/* Group header row */}
                <div className="flex items-center justify-between gap-3 px-3 py-2.5 hover:border-border transition-colors duration-150">
                  <button
                    type="button"
                    onClick={() => setExpandedGroupId(expanded ? null : group.id)}
                    className="min-w-0 flex items-center gap-2 text-left flex-1"
                  >
                    <span className="text-txt-muted shrink-0">
                      {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                    </span>
                    <span className="text-[12px] font-medium text-txt-primary truncate">{group.name}</span>
                    <span className="text-[10px] text-txt-muted shrink-0 tabular-nums">{count} {count === 1 ? 'libro' : 'libri'}</span>
                  </button>
                  {confirming ? (
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        onClick={() => handleDelete(group.id)}
                        className="text-[10px] font-semibold text-danger hover:bg-danger/10 px-2 py-1 rounded-md transition-colors"
                      >
                        Elimina
                      </button>
                      <button
                        onClick={() => setDeleteConfirmId(null)}
                        className="text-[10px] font-semibold text-txt-muted hover:bg-white/[0.04] px-2 py-1 rounded-md transition-colors"
                      >
                        Annulla
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setDeleteConfirmId(group.id)}
                      className="p-1.5 text-txt-muted hover:text-danger hover:bg-danger/10 rounded-md transition-all duration-150 shrink-0"
                      title={`Elimina gruppo ${group.name}`}
                    >
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>

                {/* Expanded: book picker for existing group */}
                {expanded && (
                  <div className="px-3 pb-3 pt-1 border-t border-border-muted/40">
                    <div className="max-h-48 overflow-y-auto custom-scrollbar space-y-0.5">
                      {allBooks.map(book => {
                        const fid = book.fileId || '';
                        const isInGroup = fid && book.groups?.includes(group.id);
                        return (
                          <button
                            key={fid}
                            type="button"
                            onClick={() => fid && toggleBookInGroup(group.id, fid)}
                            className={`flex items-center gap-2.5 w-full px-2.5 py-1.5 rounded-md text-left text-[11px] transition-all duration-150 ${
                              isInGroup
                                ? 'bg-accent/10 text-accent'
                                : 'text-txt-secondary hover:bg-white/[0.03]'
                            }`}
                          >
                            <div className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors ${
                              isInGroup ? 'bg-accent border-accent' : 'border-border-muted'
                            }`}>
                              {isInGroup && <Check size={10} className="text-white" />}
                            </div>
                            <span className="truncate">{book.fileName}</span>
                          </button>
                        );
                      })}
                      {allBooks.length === 0 && (
                        <span className="text-[11px] text-txt-muted italic px-2">Nessun libro nella libreria.</span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Create section */}
        <div className="px-5 py-4 border-t border-border-muted bg-surface-3/30 shrink-0 space-y-3">
          <div>
            <label className="block text-[10px] font-bold text-txt-muted uppercase tracking-wider mb-2">Nuovo gruppo</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={newGroupName}
                onChange={(e) => setNewGroupName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && newGroupName.trim()) handleCreate(); }}
                placeholder="Nome del gruppo..."
                className="flex-1 bg-surface-4/50 border border-border-muted rounded-lg px-3 py-2.5 text-[13px] text-txt-primary focus:outline-none focus:border-accent/40 transition-all duration-200 placeholder:text-txt-faint"
              />
              <button
                onClick={handleCreate}
                disabled={!newGroupName.trim()}
                className="bg-accent text-white px-3 py-2.5 rounded-lg hover:bg-accent-hover disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-200 active:scale-95"
              >
                <Plus size={18} />
              </button>
            </div>
          </div>

          {/* Book picker for new group */}
          {newGroupName.trim() && allBooks.length > 0 && (
            <div>
              <button
                type="button"
                onClick={() => setShowBookPicker(!showBookPicker)}
                className="flex items-center gap-1.5 text-[10px] font-semibold text-txt-muted hover:text-txt-secondary uppercase tracking-wider transition-colors"
              >
                {showBookPicker ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                Seleziona libri ({selectedBookIds.length > 0 ? selectedBookIds.length : 'opzionale'})
              </button>
              {showBookPicker && (
                <div className="mt-2 max-h-40 overflow-y-auto custom-scrollbar space-y-1 rounded-lg bg-surface-4/30 border border-border-muted/50 p-2">
                  {allBooks.map(book => {
                    const fid = book.fileId || '';
                    const selected = fid && selectedBookIds.includes(fid);
                    return (
                      <button
                        key={fid}
                        type="button"
                        onClick={() => fid && toggleNewBookSelection(fid)}
                        className={`flex items-center gap-2.5 w-full px-2.5 py-1.5 rounded-md text-left text-[11px] transition-all duration-150 ${
                          selected
                            ? 'bg-accent/10 text-accent'
                            : 'text-txt-secondary hover:bg-white/[0.03]'
                        }`}
                      >
                        <div className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors ${
                          selected ? 'bg-accent border-accent' : 'border-border-muted'
                        }`}>
                          {selected && <Check size={10} className="text-white" />}
                        </div>
                        <span className="truncate">{book.fileName}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
