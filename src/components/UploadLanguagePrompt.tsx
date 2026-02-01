import React, { useState, useEffect } from 'react';
import { X, Check, Tag } from 'lucide-react';
import { InputLanguageSelector } from './InputLanguageSelector';

interface UploadLanguagePromptProps {
  isOpen: boolean;
  defaultValue?: string;
  availableGroups?: string[];
  defaultSelectedGroups?: string[];
  onConfirm: (language: string, selectedGroups: string[]) => void;
  onCancel: () => void;
}

export const UploadLanguagePrompt: React.FC<UploadLanguagePromptProps> = ({
  isOpen,
  defaultValue = 'tedesco',
  availableGroups = [],
  defaultSelectedGroups,
  onConfirm,
  onCancel
}) => {
  const [lang, setLang] = useState(defaultValue);
  const [selectedGroups, setSelectedGroups] = useState<string[]>(defaultSelectedGroups || []);

  if (!isOpen) return null;

  const canConfirm = lang.trim().length > 0;

  const toggleGroup = (g: string) => {
    setSelectedGroups(prev => 
      prev.includes(g) ? prev.filter(x => x !== g) : [...prev, g]
    );
  };

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-[#1a1a1a] w-full max-w-md rounded-2xl border border-white/10 shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col">
        <div className="p-6 border-b border-white/5 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-white">Configura nuovo progetto</h2>
            <p className="text-xs text-gray-400">Lingua e Gruppi</p>
          </div>
          <button onClick={onCancel} className="p-2 hover:bg-white/5 rounded-lg text-gray-400 hover:text-white transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="p-6 space-y-6">
          <InputLanguageSelector
            value={lang}
            onChange={setLang}
            label="Lingua di input"
          />

          {availableGroups.length > 0 && (
            <div className="space-y-2">
              <label className="text-xs font-bold text-gray-500 uppercase tracking-wider flex items-center gap-2">
                <Tag size={12} />
                Assegna Gruppi
              </label>
              <div className="flex flex-wrap gap-2 max-h-[120px] overflow-y-auto custom-scrollbar p-1">
                {availableGroups.map(g => (
                  <button
                    key={g}
                    onClick={() => toggleGroup(g)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all flex items-center gap-1.5 ${
                      selectedGroups.includes(g)
                        ? 'bg-[#007AFF]/20 border-[#007AFF]/50 text-[#007AFF]'
                        : 'bg-white/5 border-white/10 text-gray-400 hover:bg-white/10'
                    }`}
                  >
                    {g}
                    {selectedGroups.includes(g) && <Check size={12} />}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="flex items-center gap-3 pt-2">
            <button
              onClick={() => onConfirm(lang.trim(), selectedGroups)}
              disabled={!canConfirm}
              className={`flex-1 px-4 py-2 rounded-xl text-sm font-bold transition-colors ${
                canConfirm
                  ? 'bg-blue-500 text-white hover:bg-blue-600'
                  : 'bg-white/10 text-gray-500 cursor-not-allowed'
              }`}
            >
              <span className="inline-flex items-center gap-2">
                <Check size={16} />
                Conferma
              </span>
            </button>
            <button
              onClick={onCancel}
              className="px-4 py-2 rounded-xl text-sm font-bold bg-white/5 text-gray-300 hover:text-white hover:bg-white/10 transition-colors"
            >
              Annulla
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

