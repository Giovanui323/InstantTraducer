import { useCallback, useRef } from 'react';
import type React from 'react';

// Types
import { AISettings, PDFMetadata, ReadingProgress, PageAnnotation, PageVerification, PageStatus } from '../types';

// Services
import { log, extractMetadataAdapter, buildRetryInstruction } from '../services';

// Utils
import { isUuidV4FileId, normalizeProjectFileId, sanitizeMetadataField } from '../utils';

interface UseProjectManagementProps {
    pdfDoc: any;
    setPdfDoc: (doc: any) => void;
    metadata: PDFMetadata | null;
    setMetadata: React.Dispatch<React.SetStateAction<PDFMetadata | null>>;
    currentProjectFileId: string | null;
    recentBooks: Record<string, ReadingProgress>;
    setRecentBooks: React.Dispatch<React.SetStateAction<Record<string, ReadingProgress>>>;
    aiSettings: AISettings;
    refreshLibrary: () => Promise<void>;
    flushSaves: () => Promise<boolean>;
    cancelPendingSaves: (fileId: string) => void;
    blockSave: (fileId: string) => void;
    unblockSave: (fileId: string) => void;
    registerRename: (oldId: string, newId: string) => void;
    updateLibrary: (fileId: string, data: Partial<ReadingProgress>) => Promise<string | null>;
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
    isConsultationMode: boolean;
}

export const useProjectManagement = ({
    pdfDoc,
    setPdfDoc,
    metadata,
    setMetadata,
    currentProjectFileId,
    recentBooks,
    setRecentBooks,
    aiSettings,
    refreshLibrary,
    flushSaves,
    cancelPendingSaves,
    blockSave,
    unblockSave,
    registerRename,
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
    showConfirm,
    isConsultationMode
}: UseProjectManagementProps) => {

    const recentBooksRef = useRef(recentBooks);
    recentBooksRef.current = recentBooks;

    const redoAllPages = useCallback(async () => {
        if (isConsultationMode) return;
        let doc = pdfDoc;

        // AUTO-RELOAD logic if PDF is missing
        if (!doc && metadata?.name) {
            let originalPath = '';

            // 1. Try to find by current session ID
            if (currentProjectFileId && recentBooksRef.current[currentProjectFileId]?.originalFilePath) {
                originalPath = recentBooksRef.current[currentProjectFileId].originalFilePath || '';
            }

            // 2. Recovery fallback: try to find by display name
            if (!originalPath) {
                const matches = Object.values(recentBooksRef.current).filter(b => b.fileName === metadata.name);
                if (matches.length === 1 && matches[0]?.originalFilePath) {
                    originalPath = matches[0].originalFilePath;
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
                showConfirm("Documento Mancante", msg, () => { }, 'alert');
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
        if (isConsultationMode) return;
        const legacyFiles = Object.values(recentBooks).filter((b: ReadingProgress) => {
            // Basic check: if name doesn't start with 4 digits (Year), might be legacy name
            // Or if name is just filename.pdf
            const name = b.fileName;
            return !/^\d{4}_/.test(name);
        });

        if (legacyFiles.length === 0) {
            if (showConfirm) {
                showConfirm("Scansione Rinomina", "Nessun file con nome 'vecchio' (senza Anno iniziale) trovato nella libreria.", () => { }, 'alert');
            } else {
                alert("Nessun file con nome 'vecchio' (senza Anno iniziale) trovato nella libreria.");
            }
            return;
        }

        const proceed = async () => {
            log.step(`Avvio scansione rinomina per ${legacyFiles.length} file...`);

            // Forziamo il salvataggio di tutto prima di iniziare operazioni massive sui file
            await flushSaves();
            await refreshLibrary(); // Assicura di avere i dati più recenti

            let renamed = 0;
            let skipped = 0;
            const apiKey = aiSettings.gemini.apiKey;

            if (!apiKey) {
                if (showConfirm) {
                    showConfirm("API Mancante", "Configura prima la chiave API Gemini.", () => { }, 'alert');
                } else {
                    alert("Configura prima la chiave API Gemini.");
                }
                return;
            }

            for (const rawBook of legacyFiles) {
                const book = rawBook as ReadingProgress;
                const fileId = book.fileId;
                try {
                    const normalizedFileId = normalizeProjectFileId(fileId);
                    if (!normalizedFileId) {
                        log.warning(`Saltato ${book.fileName}: ID non valido.`);
                        skipped++;
                        continue;
                    }
                    let base64: string | null = null;

                    const sourcePath = book.pageImages?.sources?.[1];
                    if (sourcePath) {
                        base64 = await readProjectImageBase64({ fileId: normalizedFileId, relPath: sourcePath });
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
                    const meta = await extractMetadataAdapter([base64], aiSettings, { targetLanguage: book.inputLanguage });
                    const y = sanitizeMetadataField(meta.year || "");
                    const a = sanitizeMetadataField(meta.author || "");
                    const t = sanitizeMetadataField(meta.title || "");

                    if (t && t !== 'Untitled' && t.length > 2) {
                        const yearPart = y && y !== '0000' && y !== 'Unknown' ? `${y}_` : "";
                        const authorPart = a && a !== 'Unknown' ? `${a}_` : "";
                        const newName = `${yearPart}${authorPart}${t}`;

                        if (newName !== book.fileName && newName.length > 5) {
                            const isStableId = isUuidV4FileId(normalizedFileId);

                            blockSave(normalizedFileId);

                            const res = isStableId
                                ? await window.electronAPI.setDisplayName({ fileId: normalizedFileId, displayName: newName })
                                : await window.electronAPI.renameTranslation({ fileId: normalizedFileId, newFileName: newName });

                            if (res?.success) {
                                log.success(`Rinomina OK: ${book.fileName} -> ${newName}`);
                                renamed++;

                                // For UUIDs, ID never changes. For legacy, it might.
                                const finalId = isStableId ? normalizedFileId : (res as any)?.newFileId || normalizedFileId;
                                
                                unblockSave(finalId);

                                setRecentBooks(prev => {
                                    const next = { ...prev };
                                    // If ID changed (legacy), remove old key
                                    if (finalId !== normalizedFileId) delete next[normalizedFileId];
                                    
                                    // Update the record with new name and (potentially) new ID
                                    next[finalId] = { 
                                        ...book, 
                                        fileName: newName, 
                                        fileId: finalId 
                                    };
                                    return next;
                                });

                                // Register redirection if ID changed
                                if (finalId !== normalizedFileId) {
                                    registerRename(normalizedFileId, finalId);
                                }

                                // Aggiorniamo anche la libreria globale dopo ogni rinomina riuscita
                                await refreshLibrary();

                            } else {
                                // If rename fails, we MUST unblock the old ID so the user can continue working/saving
                                unblockSave(normalizedFileId);
                                skipped++;

                                // CRITICAL FIX: Stop the queue if a rename fails (IO Error safety)
                                log.error(`Rename failed for ${book.fileName}: ${res?.error}`);
                                setIsPaused(true);
                                if (showConfirm) {
                                    showConfirm(
                                        "Errore Critico Rinomina",
                                        `La rinomina del file "${book.fileName}" è fallita: ${res?.error}\n\nIl sistema è stato messo in PAUSA per prevenire perdita di dati. Verifica che il file non sia aperto altrove.`,
                                        () => { },
                                        'danger'
                                    );
                                }
                                break; // Stop the batch process
                            }
                        } else {
                            skipped++;
                        }
                    } else {
                        skipped++;
                    }
                } catch (e) {
                    // If rename errors, we MUST unblock the old ID
                    const normalizedFileId = normalizeProjectFileId(fileId);
                    if (normalizedFileId) unblockSave(normalizedFileId);
                    log.error(`Errore rinomina ${book.fileName}`, e);
                    skipped++;

                    // CRITICAL FIX: Stop on exception
                    setIsPaused(true);
                    if (showConfirm) {
                        showConfirm(
                            "Errore Critico Rinomina",
                            `Si è verificato un errore imprevisto durante la rinomina di "${book.fileName}".\n\nIl sistema è stato messo in PAUSA.`,
                            () => { },
                            'danger'
                        );
                    }
                    break;
                }
            }
            log.success(`Operazione completata. Rinominati: ${renamed}, Saltati: ${skipped}.`);
            if (showConfirm) {
                showConfirm("Risultato Scansione", `Operazione completata.\nRinominati: ${renamed}\nSaltati/Falliti: ${skipped}`, () => { }, 'alert');
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
        if (isConsultationMode) return;
        const allFiles = Object.values(recentBooks);
        if (allFiles.length === 0) {
            if (showConfirm) {
                showConfirm("Scansione Completa", "Nessun file presente nella libreria.", () => { }, 'alert');
            } else {
                alert("Nessun file presente nella libreria.");
            }
            return;
        }

        const proceed = async () => {
            log.step(`Avvio scansione completa su ${allFiles.length} file...`);

            // Forziamo il salvataggio di tutto prima di iniziare operazioni massive sui file
            await flushSaves();
            await refreshLibrary(); // Assicura di avere i dati più recenti

            let renamed = 0;
            let skipped = 0;
            const apiKey = aiSettings.gemini.apiKey;
            if (!apiKey) {
                if (showConfirm) {
                    showConfirm("API Mancante", "Configura prima la chiave API Gemini.", () => { }, 'alert');
                } else {
                    alert("Configura prima la chiave API Gemini.");
                }
                return;
            }
            for (const rawBook of allFiles) {
                const book = rawBook as ReadingProgress;
                // Safe ID: use the one in the book object or re-compute it, never use fileName directly
                const fileId = book.fileId;
                try {
                    const normalizedFileId = normalizeProjectFileId(fileId);
                    if (!normalizedFileId) {
                        log.warning(`Saltato ${book.fileName}: ID non valido.`);
                        skipped++;
                        continue;
                    }

                    let base64: string | null = null;
                    const sourcePath = book.pageImages?.sources?.[1];
                    if (sourcePath) {
                        base64 = await readProjectImageBase64({ fileId: normalizedFileId, relPath: sourcePath });
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
// Extract meta
                    const meta = await extractMetadataAdapter([base64], aiSettings, { targetLanguage: book.inputLanguage });
                    const y = sanitizeMetadataField(meta.year || "");
                    const a = sanitizeMetadataField(meta.author || "");
                    const t = sanitizeMetadataField(meta.title || "");

                    if (t && t !== 'Untitled' && t.length > 2) {
                        const yearPart = y && y !== '0000' && y !== 'Unknown' ? `${y}_` : "";
                        const authorPart = a && a !== 'Unknown' ? `${a}_` : "";
                        const newName = `${yearPart}${authorPart}${t}`;
                        if (newName !== book.fileName && newName.length > 5) {
                            const isStableId = isUuidV4FileId(normalizedFileId);

                            blockSave(normalizedFileId);

                            const res = isStableId
                                ? await window.electronAPI.setDisplayName({ fileId: normalizedFileId, displayName: newName })
                                : await window.electronAPI.renameTranslation({ fileId: normalizedFileId, newFileName: newName });

                            if (res?.success) {
                                log.success(`Rinomina OK: ${book.fileName} -> ${newName}`);
                                renamed++;

                                const finalId = isStableId ? normalizedFileId : (res as any)?.newFileId || normalizedFileId;
                                unblockSave(finalId);

                                setRecentBooks(prev => {
                                    const next = { ...prev };
                                    if (finalId !== normalizedFileId) delete next[normalizedFileId];
                                    next[finalId] = { ...book, fileName: newName, fileId: finalId };
                                    return next;
                                });

                                if (finalId !== normalizedFileId) {
                                    registerRename(normalizedFileId, finalId);
                                }

                                // Aggiorniamo anche la libreria globale dopo ogni rinomina riuscita
                                await refreshLibrary();
                            } else {
                                unblockSave(normalizedFileId);
                                skipped++;

                                // CRITICAL FIX: Stop on rename failure
                                log.error(`Rename failed for ${book.fileName}: ${res?.error}`);
                                setIsPaused(true);
                                if (showConfirm) {
                                    showConfirm(
                                        "Errore Critico Rinomina",
                                        `La rinomina del file "${book.fileName}" è fallita: ${res?.error}\n\nIl sistema è stato messo in PAUSA.`,
                                        () => { },
                                        'danger'
                                    );
                                }
                                break;
                            }
                        } else {
                            skipped++;
                        }
                    } else {
                        skipped++;
                    }
                } catch (e) {
                    const normalizedFileId = normalizeProjectFileId(fileId);
                    if (normalizedFileId) unblockSave(normalizedFileId);
                    log.error(`Errore rinomina ${book.fileName}`, e);
                    skipped++;

                    // CRITICAL FIX: Stop on exception
                    setIsPaused(true);
                    if (showConfirm) {
                        showConfirm(
                            "Errore Critico Rinomina",
                            `Si è verificato un errore imprevisto durante la rinomina di "${book.fileName}".\n\nIl sistema è stato messo in PAUSA.`,
                            () => { },
                            'danger'
                        );
                    }
                    break;
                }
            }
            log.success(`Operazione completata. Rinominati: ${renamed}, Saltati: ${skipped}.`);
            if (showConfirm) {
                showConfirm("Risultato Scansione", `Operazione completata.\nRinominati: ${renamed}\nSaltati/Falliti: ${skipped}`, () => { }, 'alert');
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
        if (isConsultationMode) return;
        const total = pdfDoc?.numPages || metadata?.totalPages || 0;
        if (total <= 0) return;

        const proceed = async () => {
            log.step("Riprova pagine con errori richiesto...");
            let count = 0;
            const pagesToRetry: number[] = [];

            for (let p = 1; p <= total; p++) {
                const hasError = pageStatusRef.current[p]?.error;
                const verification = verificationMapRef.current[p];
                const isFailed = verification?.state === 'failed';
                const postRetryFailed = Boolean(verification?.postRetryFailed);
                const isSevere = verification?.severity === 'severe';
                const isAutoRetrying = Boolean(verification?.autoRetryActive);

                if (hasError || (!isAutoRetrying && (isFailed || postRetryFailed || isSevere))) {
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
                    pagesToRetry.forEach(p => {
                        delete next[p];
                        next[p] = { error: false, loading: undefined, processing: "In coda per ritraduzione…" } as any;
                    });
                    return next;
                });

                // 2. Persistenza su disco (rimozione traduzioni errate)
                if (currentProjectFileId) {
                    try {
                        const fileId = currentProjectFileId;
                        await updateLibrary(fileId, {
                            fileId,
                            translations: translationMapRef.current,
                            annotations: annotationMapRef.current
                        });
                    } catch (e) {
                        log.error("Errore salvataggio durante riprova errori", e);
                    }
                }

                // 3. Accodamento
                pagesToRetry.forEach(p => {
                    // Try to generate specific instructions from verification reports if available
                    const report = verificationMapRef.current[p];
                    const currentText = translationMapRef.current[p] || '';

                    const specificInstruction = report && report.severity === 'severe'
                        ? buildRetryInstruction(report, { preservePageSplit: currentText.includes('[[PAGE_SPLIT]]') })
                        : undefined;

                    enqueueTranslation(p, {
                        priority: 'front',
                        force: true,
                        extraInstruction: specificInstruction || "Rileggi l'immagine con attenzione massima. Hai omesso dei contenuti. EFFETTUA UNA TRADUZIONE INTEGRALE."
                    });
                });

                setIsTranslatedMode(true);
                setIsPaused(false);
                log.success(`Accodate ${count} pagine per ri-elaborazione.`);
            }
        };

        proceed();
    }, [pdfDoc, metadata, enqueueTranslation, setIsTranslatedMode, setIsPaused, pageStatusRef, verificationMapRef, setTranslationMap, setAnnotationMap, setVerificationMap, setPageStatus, updateLibrary, translationMapRef, annotationMapRef]);

    const validateProjectIntegrity = useCallback(() => {
        if (!metadata) return { valid: false, issues: ["Nessun metadata caricato"] };
        const issues: string[] = [];

        // Find the current book in recentBooks to check full metadata (ReadingProgress)
        const book = currentProjectFileId ? recentBooks[currentProjectFileId] : undefined;

        // Check for empty translations if we have pages
        const total = metadata.totalPages || 0;
        const translationsCount = Object.keys(translationMapRef.current).length;

        if (total > 0 && translationsCount === 0) {
            issues.push("Il progetto non ha traduzioni salvate nonostante abbia pagine.");
        }

        if (book) {
            // Check for missing core metadata in ReadingProgress
            if (!book.pageDims || Object.keys(book.pageDims).length === 0) issues.push("Metadati pageDims mancanti o vuoti.");
            if (!book.originalFilePath) issues.push("Metadati originalFilePath mancanti.");
            if (book.hasSafePdf === undefined) issues.push("Flag hasSafePdf mancante.");
        } else {
            issues.push("Impossibile trovare il record del libro nella libreria recente.");
        }

        return {
            valid: issues.length === 0,
            issues
        };
    }, [metadata, recentBooks, currentProjectFileId, translationMapRef]);

    return {
        updateLibrary,
        redoAllPages,
        retryAllErrors,
        validateProjectIntegrity,
        scanAndRenameOldFiles,
        scanAndRenameAllFiles
    };
};
