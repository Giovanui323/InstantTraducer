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

    const isAlert = type === 'alert';

    return (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={onClose}>
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-200" onClick={e => e.stopPropagation()}>
                <div className={`px-6 py-4 border-b ${type === 'danger' ? 'bg-red-50 border-red-100' : 'bg-blue-50 border-blue-100'}`}>
                    <h3 className={`text-lg font-bold ${type === 'danger' ? 'text-red-700' : 'text-blue-700'}`}>
                        {title}
                    </h3>
                </div>
                <div className="px-6 py-6">
                    <p className="text-gray-600 whitespace-pre-wrap leading-relaxed">
                        {message}
                    </p>
                </div>
                <div className="px-6 py-4 bg-gray-50 flex justify-end gap-3">
                    {!isAlert && (
                        <button
                            onClick={onClose}
                            className="px-4 py-2 text-gray-600 hover:bg-gray-200 rounded-lg transition-colors font-medium"
                        >
                            {cancelText}
                        </button>
                    )}
                    <button
                        onClick={() => {
                            onConfirm();
                            onClose();
                        }}
                        className={`px-4 py-2 rounded-lg text-white shadow-sm transition-opacity hover:opacity-90 font-medium ${
                            type === 'danger' ? 'bg-red-600' : 'bg-blue-600'
                        }`}
                    >
                        {confirmText}
                    </button>
                </div>
            </div>
        </div>
    );
};
