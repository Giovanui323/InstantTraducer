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
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in">
            <div className="bg-surface-2 border border-border-muted rounded-2xl shadow-surface-2xl w-full max-w-sm overflow-hidden animate-fade-in-scale">
                <div className="flex items-center justify-between px-5 py-4 border-b border-border-muted">
                    <h3 className="text-[14px] font-bold text-txt-primary">Seleziona Pagina</h3>
                    <button onClick={onClose} className="p-1.5 text-txt-muted hover:text-txt-primary hover:bg-white/[0.04] rounded-lg transition-all duration-200">
                        <X size={18} />
                    </button>
                </div>

                <div className="p-5">
                    <p className="text-txt-secondary text-[12px] mb-4 leading-relaxed">
                        Il PDF selezionato ha <span className="text-txt-primary font-semibold tabular-nums">{total}</span> pagine. Quale pagina vuoi utilizzare come sostituzione?
                    </p>
                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div>
                            <label className="block text-[10px] font-bold text-txt-muted uppercase tracking-wider mb-1.5">Numero Pagina (1-{total})</label>
                            <input
                                type="number"
                                min={1}
                                max={total}
                                value={page}
                                onChange={(e) => setPage(Math.max(1, Math.min(total, Number(e.target.value))))}
                                className="w-full bg-surface-4/50 border border-border-muted rounded-lg px-3 py-2.5 text-[13px] text-txt-primary focus:outline-none focus:border-accent/40 focus:ring-1 focus:ring-accent/20 transition-all duration-200 tabular-nums"
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
                                className="flex items-center gap-2 px-5 py-2 bg-accent hover:bg-accent-hover text-white text-[10px] font-bold rounded-lg shadow-surface hover:shadow-glow-accent transition-all duration-200 active:scale-95"
                            >
                                <Check size={13} /> Conferma
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    );
};
