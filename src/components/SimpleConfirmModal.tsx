import React from 'react';

interface SimpleConfirmModalProps {
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
    onClose: () => void;
    confirmText?: string;
    cancelText?: string;
    type?: 'danger' | 'info' | 'alert';
}

export const SimpleConfirmModal: React.FC<SimpleConfirmModalProps> = ({
    isOpen,
    title,
    message,
    onConfirm,
    onClose,
    confirmText = 'Conferma',
    cancelText = 'Annulla',
    type = 'info'
}) => {
    if (!isOpen) return null;

    const isAlert = type === 'danger';

    return (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in" onClick={onClose}>
            <div className="bg-surface-2 border border-border-muted rounded-2xl shadow-surface-2xl w-full max-w-md overflow-hidden animate-fade-in-scale" onClick={e => e.stopPropagation()}>
                <div className={`px-6 py-4 border-b ${type === 'danger' ? 'bg-danger/5 border-danger/15' : 'bg-accent/5 border-accent/15'}`}>
                    <h3 className={`text-[15px] font-bold ${type === 'danger' ? 'text-danger' : 'text-accent'}`}>
                        {title}
                    </h3>
                </div>
                <div className="px-6 py-5">
                    <p className="text-[13px] text-txt-secondary whitespace-pre-wrap leading-relaxed">
                        {message}
                    </p>
                </div>
                <div className="px-6 py-4 bg-surface-3/50 border-t border-border-muted flex justify-end gap-3">
                    {!isAlert && (
                        <button
                            onClick={onClose}
                            className="px-4 py-2 text-[11px] font-semibold text-txt-muted hover:text-txt-primary hover:bg-white/[0.04] rounded-lg transition-all duration-200"
                        >
                            {cancelText}
                        </button>
                    )}
                    <button
                        onClick={() => {
                            onConfirm();
                            onClose();
                        }}
                        className={`px-4 py-2 rounded-lg text-white text-[11px] font-semibold transition-all duration-200 active:scale-95 ${
                            type === 'danger' ? 'bg-danger hover:bg-danger/80' : 'bg-accent hover:bg-accent-hover'
                        } shadow-surface`}
                    >
                        {confirmText}
                    </button>
                </div>
            </div>
        </div>
    );
};
