import React, { useState } from 'react';
import { X, Plus, Check, Tag } from 'lucide-react';
import { Group } from '../types';

interface GroupManagementModalProps {
  isOpen: boolean;
  onClose: () => void;
  fileName: string;
  availableGroups: Group[];
  assignedGroups: string[]; // IDs
  onToggleGroup: (groupId: string) => void;
  onCreateGroup: (groupName: string) => void;
}

export const GroupManagementModal: React.FC<GroupManagementModalProps> = ({
  isOpen,
  onClose,
  fileName,
  availableGroups,
  assignedGroups,
  onToggleGroup,
  onCreateGroup
}) => {
  const [newGroupInput, setNewGroupInput] = useState('');

  if (!isOpen) return null;

  const handleCreate = () => {
    const trimmed = newGroupInput.trim();
    if (!trimmed) return;

    const existingGroup = availableGroups.find(g => g.name.toLowerCase() === trimmed.toLowerCase());

    if (existingGroup) {
      if (!assignedGroups.includes(existingGroup.id)) {
        onToggleGroup(existingGroup.id);
      }
    } else {
      onCreateGroup(trimmed);
    }
    setNewGroupInput('');
  };

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
      <div className="bg-surface-2 border border-border-muted rounded-2xl shadow-surface-2xl w-full max-w-md overflow-hidden flex flex-col max-h-[80vh] animate-fade-in-scale">
        <div className="px-5 py-4 border-b border-border-muted flex items-center justify-between">
          <h3 className="text-[14px] font-bold text-txt-primary flex items-center gap-2">
            <Tag size={16} className="text-accent" />
            Gestisci Gruppi
          </h3>
          <button onClick={onClose} className="p-1.5 hover:bg-white/[0.04] rounded-lg text-txt-muted hover:text-txt-primary transition-all duration-200">
            <X size={18} />
          </button>
        </div>

        <div className="p-5 overflow-y-auto custom-scrollbar">
          <p className="text-[12px] text-txt-secondary mb-4">
            Assegna gruppi a <span className="text-txt-primary font-semibold">{fileName}</span>
          </p>

          <div className="flex flex-wrap gap-2 mb-6">
            {availableGroups.map(group => {
              const isAssigned = assignedGroups.includes(group.id);
              return (
                <button
                  key={group.id}
                  onClick={() => onToggleGroup(group.id)}
                  className={`px-3 py-1.5 rounded-lg text-[11px] font-medium border transition-all duration-200 flex items-center gap-1.5 active:scale-95 ${
                    isAssigned
                      ? 'bg-accent/10 border-accent/25 text-accent hover:bg-accent/20 shadow-glow-accent'
                      : 'bg-surface-3/50 border-border-muted text-txt-muted hover:bg-surface-4 hover:text-txt-secondary hover:border-border'
                  }`}
                >
                  {group.name}
                  {isAssigned && <Check size={12} />}
                </button>
              );
            })}
            {availableGroups.length === 0 && (
              <span className="text-[11px] text-txt-muted italic">Nessun gruppo disponibile. Creane uno sotto.</span>
            )}
          </div>

          <div className="mt-4 pt-4 border-t border-border-muted">
            <label className="block text-[10px] font-bold text-txt-muted uppercase tracking-wider mb-2">Crea Nuovo Gruppo</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={newGroupInput}
                onChange={(e) => setNewGroupInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
                placeholder="Nome del gruppo..."
                className="flex-1 bg-surface-4/50 border border-border-muted rounded-lg px-3 py-2.5 text-[13px] text-txt-primary focus:outline-none focus:border-accent/40 transition-all duration-200 placeholder:text-txt-faint"
              />
              <button
                onClick={handleCreate}
                disabled={!newGroupInput.trim()}
                className="bg-accent text-white px-3 py-2.5 rounded-lg hover:bg-accent-hover disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-200 active:scale-95"
              >
                <Plus size={18} />
              </button>
            </div>
          </div>
        </div>

        <div className="px-5 py-3.5 border-t border-border-muted bg-surface-3/30 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-surface-4/50 hover:bg-surface-4 text-txt-primary rounded-lg text-[11px] font-semibold transition-all duration-200 active:scale-95"
          >
            Fatto
          </button>
        </div>
      </div>
    </div>
  );
};
