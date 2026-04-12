import React, { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';

interface GlobalLoadingOverlayProps {
    isVisible: boolean;
    message?: string;
}

export const GlobalLoadingOverlay: React.FC<GlobalLoadingOverlayProps> = ({ isVisible, message = 'Caricamento in corso...' }) => {
    const [show, setShow] = useState(isVisible);
    const [animate, setAnimate] = useState(false);

    useEffect(() => {
        if (isVisible) {
            setShow(true);
            requestAnimationFrame(() => setAnimate(true));
        } else {
            setAnimate(false);
            const timer = setTimeout(() => setShow(false), 300);
            return () => clearTimeout(timer);
        }
    }, [isVisible]);

    if (!show) return null;

    return (
        <div
            className={`fixed inset-0 z-[9999] flex items-center justify-center bg-surface-0/90 backdrop-blur-xl transition-opacity duration-300 ease-out-expo ${animate ? 'opacity-100' : 'opacity-0'}`}
        >
            <div className={`flex flex-col items-center gap-6 transform transition-all duration-300 ease-out-expo ${animate ? 'scale-100 translate-y-0' : 'scale-95 translate-y-4'}`}>
                <div className="relative">
                    <div className="absolute inset-0 bg-accent/20 blur-2xl rounded-full animate-pulse-glow" />
                    <Loader2 size={56} className="text-accent animate-spin relative z-10" />
                </div>
                <div className="flex flex-col items-center gap-1.5">
                    <h2 className="text-[16px] font-bold text-txt-primary tracking-tight">{message}</h2>
                    <p className="text-[12px] text-txt-muted">Attendere prego...</p>
                </div>
            </div>
        </div>
    );
};
