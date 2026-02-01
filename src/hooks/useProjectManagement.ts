
import { useCallback, useRef } from 'react';
import type React from 'react';
import { AISettings, PDFMetadata, ReadingProgress, PageAnnotation, PageStatus } from '../types';
import { log } from '../services/logger';
import { extractPdfMetadata } from '../services/geminiService';
import { computeFileId } from '../utils/fileUtils';

interface UseProjectManagementProps {
    pdfDoc: any;
    setPdfDoc: (doc: any) => void;
    metadata: PDFMetadata | null;
    setMetadata: React.Dispatch<React.SetStateAction<PDFMetadata | null>>;
    recentBooks: Record<string, ReadingProgress>;
    setRecentBooks: React.Dispatch<React.SetStateAction<Record<string, ReadingProgress>>>;
    aiSettings: AISettings;
    refreshLibrary: () => void;
    updateLibrary: (fileName: string, data: Partial<ReadingProgress>) => Promise<string | null>;
    setTranslationMap: React.Dispatch<React.SetStateAction<Record<number, string>>>;
    setAnnotationMap: React.Dispatch<React.SetStateAction<Record<number, PageAnnotation[]>>>;
    setVerificationMap: React.Dispatch<React.SetStateAction<Record<number, any>>>;
    setPageStatus: React.Dispatch<React.SetStateAction<Record<number, PageStatus>>>;
    setGeminiLogs: React.Dispatch<React.SetStateAction<Record<number, string>>>;
    enqueueTranslation: (page: number, options?: any) => void;
    setIsTranslatedMode: (v: boolean) => void;
    setIsPaused: (v: boolean) => void;
    readProjectImageBase64: (args: { fileId: string; relPath: string }) => Promise<string | null>;
    translationMapRef: React.MutableRefObject<Record<number, string>>;
    annotationMapRef: React.MutableRefObject<Record<number, PageAnnotation[]>>;
    pageStatusRef: React.MutableRefObject<Record<number, PageStatus>>;
    verificationMapRef: React.MutableRefObject<Record<number, any>>;
    ensurePageImageSaved?: (page: number) => Promise<string | null>;
    showConfirm?: (title: string, message: string, onConfirm: () => void, type?: 'danger' | 'info' | 'alert') => void;
}

export const useProjectManagement = ({
    pdfDoc,
    setPdfDoc,
    metadata,
    setMetadata,
    recentBooks,
    setRecentBooks,
    aiSettings,
    refreshLibrary,
    updateLibrary,
    setTranslationMap,
    setAnnotationMap,
    setVerificationMap,
    setPageStatus,
    setGeminiLogs,
    enqueueTranslation,
    setIsTranslatedMode,
    setIsPaused,
    readProjectImageBase64,
    translationMapRef,
    annotationMapRef,
    pageStatusRef,
    verificationMapRef,
    ensurePageImageSaved,
    showConfirm
}: UseProjectManagementProps) => {

    const fileIdCacheRef = useRef<Record<string, string>>({});
    const recentBooksRef = useRef(recentBooks);
    recentBooksRef.current = recentBooks;

    const redoAllPages = useCallback(async () => {
        let doc = pdfDoc;

        // AUTO-RELOAD logic if PDF is missing
        if (!doc && metadata?.name) {
            let originalPath = '';

            // 1. Try to find by name in recentBooks
            const bookByFileName = Object.values(recentBooksRef.current).find(b => b.fileName === metadata.name);
            if (bookByFileName?.originalFilePath) {
                originalPath = bookByFileName.originalFilePath;
            }

            // 2. Try to find by cached ID
            if (!originalPath) {
                const cachedId = fileIdCacheRef.current[metadata.name];
                if (cachedId && recentBooksRef.current[cachedId]) {
                    originalPath = recentBooksRef.current[cachedId].originalFilePath || '';
                }
            }

            if (originalPath) {
                try {
                    log.step(`Tentativo ricaricamento PDF da: ${originalPath}`);
                    if (!window.electronAPI) throw new Error("No electron API");
                    const buffer = await window.electronAPI.readPdfFile(originalPath);
                    const pdf = await (window as any).pdfjsLib.getDocument({
                        data: buffer,
                        cMapUrl: './pdfjs/cmaps/',
                        cMapPacked: true,
                        standardFontDataUrl: './pdfjs/standard_fonts/'
                    }).promise;
                    setPdfDoc(pdf);
                    doc = pdf;
                    log.success("PDF ricaricato con successo.");
                } catch (e) {
                    log.warning("Impossibile ricaricare il PDF automaticamente.", e);
                }
            }
        }

        const total = doc?.numPages || metadata?.totalPages || 0;

        if (total <= 0) {
            const msg = "Nessun documento caricato o numero pagine non valido. Per favore riapri il file PDF dalla Home.";
            if (showConfirm) {
                showConfirm("Documento Mancante", msg, () => {}, 'alert');
            } else {
                alert(msg);
            }
            return;
        }

        const proceed = () => {
            // Reset state but keep Session
            log.step("Reset totale richiesto. Cancellazione dati...");
            setTranslationMap({});
            setAnnotationMap({});
            setVerificationMap({});
            setPageStatus({});
            setGeminiLogs({});

            // Clear refs
            translationMapRef.current = {};
            annotationMapRef.current = {};

            // Enqueue all pages
            log.step(`Riavvio traduzione per ${total} pagine...`);
            for (let p = 1; p <= total; p++) {
                enqueueTranslation(p, { priority: 'back', force: true });
            }
            setIsTranslatedMode(true);
            setIsPaused(false);
        };

        if (showConfirm) {
            showConfirm(
                "Conferma Reset", 
                "ATTENZIONE: Questo cancellerà tutte le traduzioni correnti e riavvierà il processo da zero.\n\nSei sicuro?", 
                proceed, 
                'danger'
            );
        } else {
            proceed();
        }
    }, [pdfDoc, enqueueTranslation, setTranslationMap, setAnnotationMap, setVerificationMap, setPageStatus, setGeminiLogs, setIsTranslatedMode, setIsPaused, translationMapRef, annotationMapRef, metadata, setPdfDoc, showConfirm]);

    const scanAndRenameOldFiles = useCallback(async () => {
        const legacyFiles = Object.values(recentBooks).filter((b: ReadingProgress) => {
            // Basic check: if name doesn't start with 4 digits (Year), might be legacy name
            // Or if name is just filename.pdf
            const name = b.fileName;
            return !/^\d{4}_/.test(name);
        });

        if (legacyFiles.length === 0) {
            if (showConfirm) {
                showConfirm("Scansione Rinomina", "Nessun file con nome 'vecchio' (senza Anno iniziale) trovato nella libreria.", () => {}, 'alert');
            } else {
                alert("Nessun file con nome 'vecchio' (senza Anno iniziale) trovato nella libreria.");
            }
            return;
        }

        const proceed = async () => {
            log.step(`Avvio scansione rinomina per ${legacyFiles.length} file...`);
            let renamed = 0;
            let skipped = 0;
            const apiKey = aiSettings.gemini.apiKey;

            if (!apiKey) {
                if (showConfirm) {
                    showConfirm("API Mancante", "Configura prima la chiave API Gemini.", () => {}, 'alert');
                } else {
                    alert("Configura prima la chiave API Gemini.");
                }
                return;
            }

            for (const rawBook of legacyFiles) {
                const book = rawBook as ReadingProgress;
                try {
                    const fileId = book.fileId || book.fileName;
                    let base64: string | null = null;

                    const sourcePath = book.pageImages?.sources?.[1];
                    if (sourcePath) {
                        base64 = await readProjectImageBase64({ fileId, relPath: sourcePath });
                    }

                    if (!base64 && ensurePageImageSaved && pdfDoc && metadata?.name === book.fileName) {
                        // If we are currently opening THIS book, we can generate it
                        try { base64 = await ensurePageImageSaved(1); } catch { }
                    }

                    if (!base64) {
                        log.warning(`Saltato ${book.fileName}: impossibile recuperare immagine pag 1.`);
                        skipped++;
                        continue;
                    }

                    // Extract meta
                    const meta = await extractPdfMetadata(apiKey, aiSettings.gemini.model, [base64]);
                    if (meta.year && meta.author && meta.title) {
                        const sanitize = (s: string) => s.replace(/[^a-zA-Z0-9\s]/g, '').trim();
                        const newName = `${sanitize(meta.year)}_${sanitize(meta.author)}_${sanitize(meta.title)}`;

                        if (newName !== book.fileName && newName.length > 5) {
                            const res = await window.electronAPI.renameTranslation({ fileId, newFileName: newName });
                            if (res?.success) {
                                log.success(`Rinomina OK: ${book.fileName} -> ${newName}`);
                                renamed++;

                                setRecentBooks(prev => {
                                    const next = { ...prev };
                                    delete next[fileId];
                                    const newId = computeFileId(newName, book.originalFilePath || '');
                                    next[newId] = { ...book, fileName: newName, fileId: newId };
                                    fileIdCacheRef.current[newName] = newId;
                                    return next;
                                });

                            } else {
                                skipped++;
                            }
                        } else {
                            skipped++;
                        }
                    } else {
                        skipped++;
                    }
                } catch (e) {
                    log.error(`Errore rinomina ${book.fileName}`, e);
                    skipped++;
                }
            }
            log.success(`Operazione completata. Rinominati: ${renamed}, Saltati: ${skipped}.`);
            if (showConfirm) {
                showConfirm("Risultato Scansione", `Operazione completata.\nRinominati: ${renamed}\nSaltati/Falliti: ${skipped}`, () => {}, 'alert');
            } else {
                alert(`Operazione completata.\nRinominati: ${renamed}\nSaltati/Falliti: ${skipped}`);
            }
            refreshLibrary();
        };

        if (showConfirm) {
            showConfirm(
                "Conferma Rinomina", 
                `Trovati ${legacyFiles.length} file con nomi potenzialmente vecchi.\n\nVuoi provare a rinominarli automaticamente (se hanno metadati validi)?`, 
                proceed
            );
        } else {
            proceed();
        }

    }, [recentBooks, aiSettings.gemini.apiKey, aiSettings.gemini.model, readProjectImageBase64, refreshLibrary, setRecentBooks, ensurePageImageSaved, pdfDoc, metadata, showConfirm]);

    const scanAndRenameAllFiles = useCallback(async () => {
        const allFiles = Object.values(recentBooks);
        if (allFiles.length === 0) {
            if (showConfirm) {
                showConfirm("Scansione Completa", "Nessun file presente nella libreria.", () => {}, 'alert');
            } else {
                alert("Nessun file presente nella libreria.");
            }
            return;
        }

        const proceed = async () => {
            log.step(`Avvio scansione completa su ${allFiles.length} file...`);
            let renamed = 0;
            let skipped = 0;
            const apiKey = aiSettings.gemini.apiKey;
            if (!apiKey) {
                if (showConfirm) {
                    showConfirm("API Mancante", "Configura prima la chiave API Gemini.", () => {}, 'alert');
                } else {
                    alert("Configura prima la chiave API Gemini.");
                }
                return;
            }
            for (const rawBook of allFiles) {
                const book = rawBook as ReadingProgress;
                try {
                    const fileId = book.fileId || book.fileName;
                    let base64: string | null = null;
                    const sourcePath = book.pageImages?.sources?.[1];
                    if (sourcePath) {
                        base64 = await readProjectImageBase64({ fileId, relPath: sourcePath });
                    }

                    if (!base64 && ensurePageImageSaved && pdfDoc && metadata?.name === book.fileName) {
                        // If we are currently opening THIS book, we can generate it
                        try { base64 = await ensurePageImageSaved(1); } catch { }
                    }

                    if (!base64) {
                        log.warning(`Saltato ${book.fileName}: impossibile leggere immagine pag 1.`);
                        skipped++;
                        continue;
                    }

                    const meta = await extractPdfMetadata(apiKey, aiSettings.gemini.model, [base64]);
                    if (meta.year && meta.author && meta.title) {
                        const sanitize = (s: string) => s.replace(/[^a-zA-Z0-9\s]/g, '').trim();
                        const newName = `${sanitize(meta.year)}_${sanitize(meta.author)}_${sanitize(meta.title)}`;
                        if (newName !== book.fileName && newName.length > 5) {
                            const res = await window.electronAPI.renameTranslation({ fileId, newFileName: newName });
                            if (res?.success) {
                                log.success(`Rinomina OK: ${book.fileName} -> ${newName}`);
                                renamed++;
                                setRecentBooks(prev => {
                                    const next = { ...prev };
                                    delete next[fileId];
                                    const newId = computeFileId(newName, book.originalFilePath || '');
                                    next[newId] = { ...book, fileName: newName, fileId: newId };
                                    fileIdCacheRef.current[newName] = newId;
                                    return next;
                                });
                            } else {
                                skipped++;
                            }
                        } else {
                            skipped++;
                        }
                    } else {
                        skipped++;
                    }
                } catch (e) {
                    log.error(`Errore rinomina ${book.fileName}`, e);
                    skipped++;
                }
            }
            log.success(`Operazione completata. Rinominati: ${renamed}, Saltati: ${skipped}.`);
            if (showConfirm) {
                showConfirm("Risultato Scansione", `Operazione completata.\nRinominati: ${renamed}\nSaltati/Falliti: ${skipped}`, () => {}, 'alert');
            } else {
                alert(`Operazione completata.\nRinominati: ${renamed}\nSaltati/Falliti: ${skipped}`);
            }
            refreshLibrary();
        };

        if (showConfirm) {
            showConfirm(
                "Conferma Scansione Completa", 
                `Scansionare tutti i ${allFiles.length} file per estrarre Anno/Autore/Titolo e rinominare se necessario?`, 
                proceed
            );
        } else {
            proceed();
        }
    }, [recentBooks, aiSettings.gemini.apiKey, aiSettings.gemini.model, readProjectImageBase64, refreshLibrary, setRecentBooks, ensurePageImageSaved, pdfDoc, metadata, showConfirm]);

    const retryAllErrors = useCallback(() => {
        const total = pdfDoc?.numPages || metadata?.totalPages || 0;
        if (total <= 0) return;

        const proceed = async () => {
            log.step("Riprova pagine con errori richiesto...");
            let count = 0;
            const pagesToRetry: number[] = [];

            for (let p = 1; p <= total; p++) {
                const hasError = pageStatusRef.current[p]?.error;
                const verification = verificationMapRef.current[p];
                const isSevere = verification?.severity === 'severe';
                const isFailed = verification?.state === 'failed';

                if (hasError || isSevere || isFailed) {
                    pagesToRetry.push(p);
                    count++;
                }
            }

            if (count > 0) {
                // 1. Pulizia stato locale per le pagine interessate
                setTranslationMap(prev => {
                    const next = { ...prev };
                    pagesToRetry.forEach(p => delete next[p]);
                    translationMapRef.current = next;
                    return next;
                });

                setAnnotationMap(prev => {
                    const next = { ...prev };
                    pagesToRetry.forEach(p => delete next[p]);
                    annotationMapRef.current = next;
                    return next;
                });

                setVerificationMap(prev => {
                    const next = { ...prev };
                    pagesToRetry.forEach(p => delete next[p]);
                    return next;
                });

                setPageStatus(prev => {
                    const next = { ...prev };
                    pagesToRetry.forEach(p => delete next[p]);
                    return next;
                });

                // 2. Persistenza su disco (rimozione traduzioni errate)
                if (metadata?.name) {
                    try {
                        await updateLibrary(metadata.name, {
                            translations: translationMapRef.current,
                            annotations: annotationMapRef.current
                        });
                    } catch (e) {
                        log.error("Errore salvataggio durante riprova errori", e);
                    }
                }

                // 3. Accodamento
                pagesToRetry.forEach(p => {
                    enqueueTranslation(p, { priority: 'front', force: true });
                });

                setIsTranslatedMode(true);
                setIsPaused(false);
                log.success(`Accodate ${count} pagine per ri-elaborazione.`);
            }
        };

        proceed();
    }, [pdfDoc, metadata, enqueueTranslation, setIsTranslatedMode, setIsPaused, pageStatusRef, verificationMapRef, setTranslationMap, setAnnotationMap, setVerificationMap, setPageStatus, updateLibrary, translationMapRef, annotationMapRef]);

    return {
        updateLibrary,
        redoAllPages,
        retryAllErrors,
        scanAndRenameOldFiles,
        scanAndRenameAllFiles,
        fileIdCacheRef
    };
};
