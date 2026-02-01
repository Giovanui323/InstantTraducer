import React, { useState, useEffect } from 'react';
import { X, Check } from 'lucide-react';

interface PageSelectionModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: (page: number) => void;
    total: number;
    defaultPage?: number;
}

export const PageSelectionModal: React.FC<PageSelectionModalProps> = ({ isOpen, onClose, onConfirm, total, defaultPage }) => {
    const [page, setPage] = useState<number>(defaultPage || 1);

    useEffect(() => {
        if (isOpen && defaultPage) {
            setPage(Math.max(1, Math.min(total, defaultPage)));
        }
    }, [isOpen, defaultPage, total]);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onConfirm(page);
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <div className="bg-[#1e1e1e] border border-white/10 rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden animate-in fade-in zoom-in duration-200">
                <div className="flex items-center justify-between p-4 border-b border-white/5 bg-white/5">
                    <h3 className="font-bold text-white">Seleziona Pagina</h3>
                    <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
                        <X size={20} />
                    </button>
                </div>

                <div className="p-4">
                    <p className="text-gray-400 text-sm mb-4">
                        Il PDF selezionato ha {total} pagine. Quale pagina vuoi utilizzare come sostituzione?
                    </p>
                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div>
                            <label className="block text-xs font-medium text-gray-400 mb-1.5">Numero Pagina (1-{total})</label>
                            <input
                                type="number"
                                min={1}
                                max={total}
                                value={page}
                                onChange={(e) => setPage(Math.max(1, Math.min(total, Number(e.target.value))))}
                                className="w-full bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/20 transition-all placeholder:text-gray-600"
                                autoFocus
                            />
                        </div>

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
                                className="flex items-center gap-2 px-6 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-lg shadow-lg shadow-indigo-500/20 transition-all"
                            >
                                <Check size={14} /> Conferma
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    );
};
