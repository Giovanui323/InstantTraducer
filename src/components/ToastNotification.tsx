import React, { useEffect, useState } from 'react';
import { AlertCircle, CheckCircle, Info, X } from 'lucide-react';

export type ToastType = 'info' | 'success' | 'warning' | 'error';

export interface ToastProps {
    message: string;
    type?: ToastType;
    duration?: number;
    onClose: () => void;
}

export const ToastNotification: React.FC<ToastProps> = ({ message, type = 'info', duration = 3000, onClose }) => {
    const [isVisible, setIsVisible] = useState(false);
    const [isRemoving, setIsRemoving] = useState(false);

    useEffect(() => {
        // Trigger enter animation
        requestAnimationFrame(() => setIsVisible(true));

        const timer = setTimeout(() => {
            handleClose();
        }, duration);
        return () => clearTimeout(timer);
    }, [duration]);

    const handleClose = () => {
        setIsVisible(false);
        setIsRemoving(true);
        setTimeout(onClose, 300); // Wait for transition
    };

    const styles = {
        info: { bg: 'bg-surface-2 border-accent/30', dot: 'bg-accent', text: 'text-accent' },
        success: { bg: 'bg-surface-2 border-success/30', dot: 'bg-success', text: 'text-success' },
        warning: { bg: 'bg-surface-2 border-warning/30', dot: 'bg-warning', text: 'text-warning' },
        error: { bg: 'bg-surface-2 border-danger/30', dot: 'bg-danger', text: 'text-danger' }
    };

    const icons = {
        info: <Info className="w-4 h-4" />,
        success: <CheckCircle className="w-4 h-4" />,
        warning: <AlertCircle className="w-4 h-4" />,
        error: <AlertCircle className="w-4 h-4" />
    };

    const s = styles[type];

    return (
        <div
            role={type === 'error' ? 'alert' : 'status'}
            aria-live={type === 'error' ? 'assertive' : 'polite'}
            className={`fixed bottom-6 right-6 z-[200] flex items-center gap-3 px-4 py-3 rounded-xl border backdrop-blur-xl shadow-surface-2xl transition-all duration-300 ease-out-expo transform ${s.bg} ${isVisible && !isRemoving ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0'}`}
            style={{ maxWidth: '400px' }}
        >
            <div className={`flex-shrink-0 ${s.text}`}>
                {icons[type]}
            </div>
            <span className="text-[12px] font-medium text-txt-primary leading-snug">{message}</span>
            <button
                onClick={handleClose}
                className="ml-auto p-1 text-txt-muted hover:text-txt-primary hover:bg-white/[0.06] rounded-md transition-all duration-150 flex-shrink-0"
                aria-label="Chiudi notifica"
            >
                <X className="w-3.5 h-3.5" />
            </button>
        </div>
    );
};
