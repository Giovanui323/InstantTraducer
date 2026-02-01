import React, { useState, useEffect } from 'react';
import { X, Type, List, Check } from 'lucide-react';

interface RenameModalProps {
    isOpen: boolean;
    onClose: () => void;
    onRename: (newName: string) => Promise<void>;
    currentName: string;
}

export const RenameModal: React.FC<RenameModalProps> = ({ isOpen, onClose, onRename, currentName }) => {
    const [mode, setMode] = useState<'simple' | 'structured'>('simple');
    const [simpleName, setSimpleName] = useState(currentName);

    const [year, setYear] = useState('');
    const [author, setAuthor] = useState('');
    const [title, setTitle] = useState('');

    const [isSubmitting, setIsSubmitting] = useState(false);

    useEffect(() => {
        if (isOpen) {
            setSimpleName(currentName);
            // Try to parse structured data from current name
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
    }, [isOpen, currentName]);

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
            await onRename(finalName);
            onClose();
        } finally {
            setIsSubmitting(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <div className="bg-[#1e1e1e] border border-white/10 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-200">
                <div className="flex items-center justify-between p-4 border-b border-white/5 bg-white/5">
                    <h3 className="font-bold text-white">Rinomina Progetto</h3>
                    <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
                        <X size={20} />
                    </button>
                </div>

                <div className="p-4">
                    <div className="flex bg-black/20 rounded-lg p-1 mb-6">
                        <button
                            onClick={() => setMode('simple')}
                            className={`flex-1 flex items-center justify-center gap-2 py-1.5 text-xs font-medium rounded-md transition-all ${mode === 'simple' ? 'bg-indigo-500 text-white shadow-sm' : 'text-gray-400 hover:text-gray-200'
                                }`}
                        >
                            <Type size={14} /> Semplice
                        </button>
                        <button
                            onClick={() => setMode('structured')}
                            className={`flex-1 flex items-center justify-center gap-2 py-1.5 text-xs font-medium rounded-md transition-all ${mode === 'structured' ? 'bg-indigo-500 text-white shadow-sm' : 'text-gray-400 hover:text-gray-200'
                                }`}
                        >
                            <List size={14} /> Strutturato
                        </button>
                    </div>

                    <form onSubmit={handleSubmit} className="space-y-4">
                        {mode === 'simple' ? (
                            <div>
                                <label className="block text-xs font-medium text-gray-400 mb-1.5">Nuovo Nome</label>
                                <input
                                    type="text"
                                    value={simpleName}
                                    onChange={(e) => setSimpleName(e.target.value)}
                                    className="w-full bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/20 transition-all placeholder:text-gray-600"
                                    placeholder="Inserisci il nome..."
                                    autoFocus
                                />
                            </div>
                        ) : (
                            <div className="space-y-3">
                                <div className="grid grid-cols-3 gap-3">
                                    <div className="col-span-1">
                                        <label className="block text-xs font-medium text-gray-400 mb-1.5">Anno</label>
                                        <input
                                            type="text"
                                            value={year}
                                            onChange={(e) => setYear(e.target.value)}
                                            className="w-full bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/20 transition-all placeholder:text-gray-600"
                                            placeholder="YYYY"
                                            maxLength={4}
                                        />
                                    </div>
                                    <div className="col-span-2">
                                        <label className="block text-xs font-medium text-gray-400 mb-1.5">Autore</label>
                                        <input
                                            type="text"
                                            value={author}
                                            onChange={(e) => setAuthor(e.target.value)}
                                            className="w-full bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/20 transition-all placeholder:text-gray-600"
                                            placeholder="Cognome Nome"
                                        />
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-gray-400 mb-1.5">Titolo</label>
                                    <input
                                        type="text"
                                        value={title}
                                        onChange={(e) => setTitle(e.target.value)}
                                        className="w-full bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/20 transition-all placeholder:text-gray-600"
                                        placeholder="Titolo del libro"
                                    />
                                </div>

                                <div className="p-3 rounded-lg bg-indigo-500/10 border border-indigo-500/20">
                                    <div className="text-[10px] text-gray-400 mb-1">Anteprima nome file:</div>
                                    <div className="text-xs font-mono text-indigo-300 break-all">
                                        {getStructuredName(year, author, title, true)}
                                    </div>
                                </div>
                            </div>
                        )}

                        <div className="pt-2 flex justify-end gap-3">
                            <button
                                type="button"
                                onClick={onClose}
                                className="px-4 py-2 text-xs font-semibold text-gray-400 hover:text-white hover:bg-white/5 rounded-lg transition-colors"
                            >
                                Annulla
                            </button>
                            <button
                                type="submit"
                                disabled={isSubmitting || (mode === 'structured' && (!year || !title))}
                                className="flex items-center gap-2 px-6 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-lg shadow-lg shadow-indigo-500/20 transition-all disabled:opacity-50"
                            >
                                {isSubmitting ? 'Salvataggio...' : <><Check size={14} /> Rinomina</>}
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    );
};
