import React, { useState } from 'react';
import { X, Check, Tag } from 'lucide-react';

interface CreateGroupModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: (name: string) => void;
}

export const CreateGroupModal: React.FC<CreateGroupModalProps> = ({ isOpen, onClose, onConfirm }) => {
    const [name, setName] = useState('');

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (name.trim()) {
            onConfirm(name.trim());
            setName('');
            onClose();
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in">
            <div className="bg-surface-2 border border-border-muted rounded-2xl shadow-surface-2xl w-full max-w-sm overflow-hidden animate-fade-in-scale">
                <div className="flex items-center justify-between px-5 py-4 border-b border-border-muted">
                    <h3 className="text-[14px] font-bold text-txt-primary flex items-center gap-2">
                        <Tag size={16} className="text-accent" /> Nuovo Gruppo
                    </h3>
                    <button onClick={onClose} className="p-1.5 text-txt-muted hover:text-txt-primary hover:bg-white/[0.04] rounded-lg transition-all duration-200">
                        <X size={18} />
                    </button>
                </div>

                <div className="p-5">
                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div>
                            <label className="block text-[10px] font-bold text-txt-muted uppercase tracking-wider mb-1.5">Nome del gruppo</label>
                            <input
                                type="text"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                className="w-full bg-surface-4/50 border border-border-muted rounded-lg px-3 py-2.5 text-[13px] text-txt-primary focus:outline-none focus:border-accent/40 focus:ring-1 focus:ring-accent/20 transition-all duration-200 placeholder:text-txt-faint"
                                placeholder="Es. Narrativa, Studio..."
                                autoFocus
                            />
                        </div>

                        <div className="pt-2 flex justify-end gap-2">
                            <button
                                type="button"
                                onClick={onClose}
                                className="px-4 py-2 text-[10px] font-semibold text-txt-muted hover:text-txt-primary hover:bg-white/[0.04] rounded-lg transition-all duration-200"
                            >
                                Annulla
                            </button>
                            <button
                                type="submit"
                                disabled={!name.trim()}
                                className="flex items-center gap-2 px-5 py-2 bg-accent hover:bg-accent-hover text-white text-[10px] font-bold rounded-lg shadow-surface hover:shadow-glow-accent transition-all duration-200 disabled:opacity-40 active:scale-95"
                            >
                                <Check size={13} /> Crea
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    );
};
