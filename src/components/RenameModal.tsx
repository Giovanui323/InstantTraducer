import React, { useState, useEffect } from 'react';
import { X, Type, List, Check } from 'lucide-react';
import { InputLanguageSelector } from './InputLanguageSelector';

interface RenameModalProps {
    isOpen: boolean;
    onClose: () => void;
    onRename: (newName: string, newLanguage?: string) => Promise<void>;
    currentName: string;
    currentLanguage?: string;
}

export const RenameModal: React.FC<RenameModalProps> = ({ isOpen, onClose, onRename, currentName, currentLanguage }) => {
    const [mode, setMode] = useState<'simple' | 'structured'>('simple');
    const [simpleName, setSimpleName] = useState(currentName);
    const [language, setLanguage] = useState(currentLanguage || 'tedesco');

    const [year, setYear] = useState('');
    const [author, setAuthor] = useState('');
    const [title, setTitle] = useState('');

    const [isSubmitting, setIsSubmitting] = useState(false);

    useEffect(() => {
        if (isOpen) {
            setSimpleName(currentName);
            setLanguage(currentLanguage || 'tedesco');
            const parts = currentName.split('_');
            if (parts.length >= 3 && /^\d{4}$/.test(parts[0])) {
                setYear(parts[0]);
                setAuthor(parts[1]);
                setTitle(parts.slice(2).join('_'));
                setMode('structured');
            } else {
                setYear(new Date().getFullYear().toString());
                setAuthor('');
                setTitle(currentName);
                setMode('simple');
            }
        }
    }, [isOpen, currentName, currentLanguage]);

    const getStructuredName = (y: string, a: string, t: string, isPreview = false) => {
        const clean = (s: string) => s.replace(/[^a-zA-Z0-9\s]/g, '').trim();
        const cy = clean(y).replace(/\s+/g, '');
        const ca = clean(a).replace(/\s+/g, '');
        const ct = clean(t).replace(/\s+/g, ' ');

        if (isPreview) {
            return `${cy || 'YYYY'}_${ca || 'Autore'}_${ct || 'Titolo'}`;
        }
        return `${cy}_${ca}_${ct}`;
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (isSubmitting) return;

        let finalName = '';
        if (mode === 'simple') {
            finalName = simpleName.trim();
        } else {
            finalName = getStructuredName(year, author, title);
        }

        if (!finalName || finalName === '__') return;

        setIsSubmitting(true);
        try {
            await onRename(finalName, language);
            onClose();
        } finally {
            setIsSubmitting(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in">
            <div className="bg-surface-2 border border-border-muted rounded-2xl shadow-surface-2xl w-full max-w-md overflow-hidden animate-fade-in-scale">
                <div className="flex items-center justify-between px-5 py-4 border-b border-border-muted">
                    <h3 className="text-[14px] font-bold text-txt-primary">Rinomina Progetto</h3>
                    <button onClick={onClose} className="p-1.5 text-txt-muted hover:text-txt-primary hover:bg-white/[0.04] rounded-lg transition-all duration-200">
                        <X size={18} />
                    </button>
                </div>

                <div className="p-5">
                    <div className="flex bg-surface-4/50 rounded-lg p-0.5 mb-5 border border-border-muted">
                        <button
                            onClick={() => setMode('simple')}
                            className={`flex-1 flex items-center justify-center gap-2 py-1.5 text-[10px] font-semibold rounded-md transition-all duration-200 ${
                                mode === 'simple'
                                    ? 'bg-accent text-white shadow-surface'
                                    : 'text-txt-muted hover:text-txt-secondary'
                            }`}
                        >
                            <Type size={13} /> Semplice
                        </button>
                        <button
                            onClick={() => setMode('structured')}
                            className={`flex-1 flex items-center justify-center gap-2 py-1.5 text-[10px] font-semibold rounded-md transition-all duration-200 ${
                                mode === 'structured'
                                    ? 'bg-accent text-white shadow-surface'
                                    : 'text-txt-muted hover:text-txt-secondary'
                            }`}
                        >
                            <List size={13} /> Strutturato
                        </button>
                    </div>

                    <form onSubmit={handleSubmit} className="space-y-4">
                        {mode === 'simple' ? (
                            <div>
                                <label className="block text-[10px] font-bold text-txt-muted uppercase tracking-wider mb-1.5">Nuovo Nome</label>
                                <input
                                    type="text"
                                    value={simpleName}
                                    onChange={(e) => setSimpleName(e.target.value)}
                                    className="w-full bg-surface-4/50 border border-border-muted rounded-lg px-3 py-2.5 text-[13px] text-txt-primary focus:outline-none focus:border-accent/40 focus:ring-1 focus:ring-accent/20 transition-all duration-200 placeholder:text-txt-faint"
                                    placeholder="Inserisci il nome..."
                                    autoFocus
                                />
                            </div>
                        ) : (
                            <div className="space-y-3">
                                <div className="grid grid-cols-3 gap-3">
                                    <div className="col-span-1">
                                        <label className="block text-[10px] font-bold text-txt-muted uppercase tracking-wider mb-1.5">Anno</label>
                                        <input
                                            type="text"
                                            value={year}
                                            onChange={(e) => setYear(e.target.value)}
                                            className="w-full bg-surface-4/50 border border-border-muted rounded-lg px-3 py-2.5 text-[13px] text-txt-primary focus:outline-none focus:border-accent/40 focus:ring-1 focus:ring-accent/20 transition-all duration-200 placeholder:text-txt-faint"
                                            placeholder="YYYY"
                                            maxLength={4}
                                        />
                                    </div>
                                    <div className="col-span-2">
                                        <label className="block text-[10px] font-bold text-txt-muted uppercase tracking-wider mb-1.5">Autore</label>
                                        <input
                                            type="text"
                                            value={author}
                                            onChange={(e) => setAuthor(e.target.value)}
                                            className="w-full bg-surface-4/50 border border-border-muted rounded-lg px-3 py-2.5 text-[13px] text-txt-primary focus:outline-none focus:border-accent/40 focus:ring-1 focus:ring-accent/20 transition-all duration-200 placeholder:text-txt-faint"
                                            placeholder="Cognome Nome"
                                        />
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-[10px] font-bold text-txt-muted uppercase tracking-wider mb-1.5">Titolo</label>
                                    <input
                                        type="text"
                                        value={title}
                                        onChange={(e) => setTitle(e.target.value)}
                                        className="w-full bg-surface-4/50 border border-border-muted rounded-lg px-3 py-2.5 text-[13px] text-txt-primary focus:outline-none focus:border-accent/40 focus:ring-1 focus:ring-accent/20 transition-all duration-200 placeholder:text-txt-faint"
                                        placeholder="Titolo del libro"
                                    />
                                </div>

                                <div className="p-3 rounded-lg bg-accent/5 border border-accent/15">
                                    <div className="text-[9px] font-bold text-txt-muted uppercase tracking-wider mb-1">Anteprima nome file</div>
                                    <div className="text-[11px] font-mono text-accent break-all">
                                        {getStructuredName(year, author, title, true)}
                                    </div>
                                </div>
                            </div>
                        )}

                        <div>
                            <InputLanguageSelector
                                value={language}
                                onChange={setLanguage}
                                label="Lingua Progetto (Bandiera)"
                            />
                        </div>

                        <div className="pt-3 flex justify-end gap-2">
                            <button
                                type="button"
                                onClick={onClose}
                                className="px-4 py-2 text-[10px] font-semibold text-txt-muted hover:text-txt-primary hover:bg-white/[0.04] rounded-lg transition-all duration-200"
                            >
                                Annulla
                            </button>
                            <button
                                type="submit"
                                disabled={isSubmitting || (mode === 'structured' && (!year || !title))}
                                className="flex items-center gap-2 px-5 py-2 bg-accent hover:bg-accent-hover text-white text-[10px] font-bold rounded-lg shadow-surface hover:shadow-glow-accent transition-all duration-200 disabled:opacity-40 active:scale-95"
                            >
                                {isSubmitting ? 'Salvataggio...' : <><Check size={13} /> Rinomina</>}
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    );
};
