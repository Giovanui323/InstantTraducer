import React, { useState } from 'react';
import { X, Plus, Check, Tag } from 'lucide-react';

interface GroupManagementModalProps {
  isOpen: boolean;
  onClose: () => void;
  fileName: string;
  availableGroups: string[];
  assignedGroups: string[];
  onToggleGroup: (group: string) => void;
  onCreateGroup: (group: string) => void;
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

    // Se il gruppo esiste già globalmente (case-insensitive)
    const existingGroup = availableGroups.find(g => g.toLowerCase() === trimmed.toLowerCase());

    if (existingGroup) {
      // Se non è già assegnato al libro attuale, assegniamolo
      if (!assignedGroups.includes(existingGroup)) {
        onToggleGroup(existingGroup);
      }
    } else {
      // Se è un gruppo nuovo, crealo e assegnalo
      onCreateGroup(trimmed);
      onToggleGroup(trimmed);
    }
    setNewGroupInput('');
  };

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-[#1e1e1e] border border-white/10 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col max-h-[80vh]">
        <div className="p-4 border-b border-white/10 flex items-center justify-between bg-white/5">
          <h3 className="text-lg font-bold text-white flex items-center gap-2">
            <Tag size={18} />
            Gestisci Gruppi
          </h3>
          <button onClick={onClose} className="p-1.5 hover:bg-white/10 rounded-lg text-gray-400 hover:text-white transition-colors">
            <X size={20} />
          </button>
        </div>
        
        <div className="p-6 overflow-y-auto custom-scrollbar">
          <p className="text-sm text-gray-400 mb-4">
            Assegna gruppi a <span className="text-white font-medium">{fileName}</span>
          </p>

          <div className="flex flex-wrap gap-2 mb-6">
            {availableGroups.map(group => {
              const isAssigned = assignedGroups.includes(group);
              return (
                <button
                  key={group}
                  onClick={() => onToggleGroup(group)}
                  className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-all flex items-center gap-2 ${
                    isAssigned
                      ? 'bg-[#007AFF]/20 border-[#007AFF]/50 text-[#007AFF] hover:bg-[#007AFF]/30'
                      : 'bg-white/5 border-white/10 text-gray-400 hover:bg-white/10 hover:text-gray-200'
                  }`}
                >
                  {group}
                  {isAssigned && <Check size={14} />}
                </button>
              );
            })}
            {availableGroups.length === 0 && (
              <span className="text-xs text-gray-500 italic">Nessun gruppo disponibile. Creane uno sotto.</span>
            )}
          </div>

          <div className="mt-4 pt-4 border-t border-white/10">
            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Crea Nuovo Gruppo</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={newGroupInput}
                onChange={(e) => setNewGroupInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
                placeholder="Nome del gruppo..."
                className="flex-1 bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#007AFF]/50"
              />
              <button
                onClick={handleCreate}
                disabled={!newGroupInput.trim()}
                className="bg-[#007AFF] text-white px-3 py-2 rounded-lg hover:bg-[#0066CC] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <Plus size={18} />
              </button>
            </div>
          </div>
        </div>

        <div className="p-4 border-t border-white/10 bg-white/5 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-white/10 hover:bg-white/15 text-white rounded-lg text-sm font-medium transition-colors"
          >
            Fatto
          </button>
        </div>
      </div>
    </div>
  );
};
