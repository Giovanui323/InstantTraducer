import React, { useState, useEffect } from 'react';
import { AlertTriangle, X } from 'lucide-react';

interface PdfRenderErrorNotificationProps {
    corruptedPages: Set<number>;
    failedRenders: Record<number, number>;
    onDismiss?: () => void;
    onSkipPage?: (pageNum: number) => void;
}

export const PdfRenderErrorNotification: React.FC<PdfRenderErrorNotificationProps> = ({
    corruptedPages,
    failedRenders,
    onDismiss,
    onSkipPage
}) => {
    const [isVisible, setIsVisible] = useState(false);
    const [dismissedPages, setDismissedPages] = useState<Set<number>>(new Set());

    useEffect(() => {
        const newCorruptedPages = Array.from(corruptedPages).filter(page => !dismissedPages.has(page));
        setIsVisible(newCorruptedPages.length > 0);
    }, [corruptedPages, dismissedPages]);

    const handleDismiss = () => {
        setIsVisible(false);
        setDismissedPages(prev => new Set([...prev, ...corruptedPages]));
        onDismiss?.();
    };

    const handleSkipPage = (pageNum: number) => {
        onSkipPage?.(pageNum);
        setDismissedPages(prev => new Set([...prev, pageNum]));
    };

    if (!isVisible) return null;

    const corruptedPageList = Array.from(corruptedPages).filter(page => !dismissedPages.has(page));
    const totalFailedRenders = Object.values(failedRenders).reduce((sum, count) => sum + count, 0);

    return (
        <div className="fixed top-14 right-4 z-[1000] animate-fade-in">
            <div className="glass-panel rounded-xl p-4 max-w-sm border-warning/25">
                <div className="flex items-start gap-3">
                    <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-warning/10 border border-warning/15 flex items-center justify-center">
                        <AlertTriangle className="w-4 h-4 text-warning" />
                    </div>
                    <div className="flex-1 min-w-0">
                        <h3 className="text-[12px] font-bold text-txt-primary">
                            Problemi di rendering PDF rilevati
                        </h3>
                        <div className="mt-1.5 text-[11px] text-txt-secondary leading-relaxed">
                            <p>
                                Alcune pagine potrebbero contenere elementi corrotti o danneggiati.
                            </p>
                            {corruptedPageList.length > 0 && (
                                <p className="mt-1 tabular-nums">
                                    Pagine interessate: {corruptedPageList.join(', ')}
                                </p>
                            )}
                            {totalFailedRenders > 0 && (
                                <p className="mt-1 tabular-nums">
                                    Tentativi di rendering falliti: {totalFailedRenders}
                                </p>
                            )}
                        </div>
                        <div className="mt-3 flex items-center gap-2">
                            <button
                                onClick={handleDismiss}
                                className="inline-flex items-center px-3 py-1.5 text-[10px] font-semibold rounded-lg text-warning bg-warning/10 border border-warning/15 hover:bg-warning/20 transition-all duration-200"
                            >
                                Ho capito
                            </button>
                            {corruptedPageList.length === 1 && onSkipPage && (
                                <button
                                    onClick={() => handleSkipPage(corruptedPageList[0])}
                                    className="inline-flex items-center px-3 py-1.5 text-[10px] font-semibold rounded-lg text-txt-secondary bg-surface-4/50 border border-border-muted hover:bg-surface-4 hover:text-txt-primary transition-all duration-200"
                                >
                                    Salta pagina
                                </button>
                            )}
                        </div>
                    </div>
                    <button
                        onClick={handleDismiss}
                        className="flex-shrink-0 p-1 text-txt-muted hover:text-txt-primary transition-colors"
                        aria-label="Chiudi"
                    >
                        <X size={14} />
                    </button>
                </div>
            </div>
        </div>
    );
};
