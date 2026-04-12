import React, { useState, useEffect } from 'react';
import { X, Check, Tag } from 'lucide-react';
import { InputLanguageSelector } from './InputLanguageSelector';
import { Group } from '../types';

interface UploadLanguagePromptProps {
  isOpen: boolean;
  defaultValue?: string;
  availableGroups?: Group[];
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

  useEffect(() => {
    if (isOpen) {
      setLang(defaultValue);
      setSelectedGroups(defaultSelectedGroups || []);
    }
  }, [isOpen, defaultValue, defaultSelectedGroups]);

  if (!isOpen) return null;

  const canConfirm = lang.trim().length > 0;

  const toggleGroup = (g: string) => {
    setSelectedGroups(prev =>
      prev.includes(g) ? prev.filter(x => x !== g) : [...prev, g]
    );
  };

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in">
      <div className="bg-surface-2 w-full max-w-md rounded-2xl border border-border-muted shadow-surface-2xl overflow-hidden animate-fade-in-scale flex flex-col">
        <div className="px-5 py-4 border-b border-border-muted flex items-center justify-between">
          <div>
            <h2 className="text-[14px] font-bold text-txt-primary">Configura nuovo progetto</h2>
            <p className="text-[10px] text-txt-muted mt-0.5">Lingua e Gruppi</p>
          </div>
          <button onClick={onCancel} className="p-1.5 hover:bg-white/[0.04] rounded-lg text-txt-muted hover:text-txt-primary transition-all duration-200">
            <X size={18} />
          </button>
        </div>

        <div className="p-5 space-y-5">
          <InputLanguageSelector
            value={lang}
            onChange={setLang}
            label="Lingua di input"
          />

          {availableGroups.length > 0 && (
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-txt-muted uppercase tracking-wider flex items-center gap-2">
                <Tag size={11} />
                Assegna Gruppi
              </label>
              <div className="flex flex-wrap gap-2 max-h-[120px] overflow-y-auto custom-scrollbar p-1">
                {availableGroups.map(g => (
                  <button
                    key={g.id}
                    onClick={() => toggleGroup(g.id)}
                    className={`px-3 py-1.5 rounded-lg text-[11px] font-medium border transition-all duration-200 flex items-center gap-1.5 active:scale-95 ${
                      selectedGroups.includes(g.id)
                        ? 'bg-accent/10 border-accent/25 text-accent'
                        : 'bg-surface-3/50 border-border-muted text-txt-muted hover:bg-surface-4 hover:text-txt-secondary'
                    }`}
                  >
                    {g.name}
                    {selectedGroups.includes(g.id) && <Check size={12} />}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="flex items-center gap-2 pt-2">
            <button
              onClick={() => onConfirm(lang.trim(), selectedGroups)}
              disabled={!canConfirm}
              className={`flex-1 px-4 py-2.5 rounded-xl text-[11px] font-bold transition-all duration-200 active:scale-95 ${
                canConfirm
                  ? 'bg-accent text-white hover:bg-accent-hover shadow-surface hover:shadow-glow-accent'
                  : 'bg-surface-4/50 text-txt-faint cursor-not-allowed'
              }`}
            >
              <span className="inline-flex items-center justify-center gap-2">
                <Check size={14} />
                Conferma
              </span>
            </button>
            <button
              onClick={onCancel}
              className="px-4 py-2.5 rounded-xl text-[11px] font-bold bg-surface-3/50 text-txt-secondary hover:text-txt-primary hover:bg-surface-4 transition-all duration-200 active:scale-95"
            >
              Annulla
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
