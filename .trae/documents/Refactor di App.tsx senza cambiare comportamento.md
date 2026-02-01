## Obiettivi
- Ridurre App.tsx (~3169 righe) a ~800–1100 righe senza modificare il comportamento.
- Migliorare leggibilità, separazione delle responsabilità e testabilità.

## Strategia di Alto Livello
- Estrarre logiche lunghe in servizi e custom hooks.
- Spostare handler inline in funzioni memoizzate.
- Suddividere la UI in componenti dedicati (Home, Reader, BottomBar, Modali, Header, ControlsBar).
- Centralizzare costanti e tipi.
- Mantenere invariati i nomi di props e la struttura JSX percepita dall’utente.

## Estrazioni Principali (Servizi)
- pdfRenderingService: renderDocPageToJpeg, renderPageToJpegBase64, thumbnails, rotazioni.
- projectService: caricamento/salvataggio progetto, gestione libreria, update atomici.
- verificationService: verifySingle/All, verifyAndMaybeFixTranslation, metriche.
- translationService: processPageTranslation, code di traduzione, prefetch/batch.

## Custom Hooks
- usePdfRendering: API per render, rotate, ensureThumb; stato e effetti correlati.
- useProjectLibrary: recenti, rename/delete/open, updateLibrary.
- useVerification: verifySingle/All, stato verifyAllState e derivati.
- useTranslationQueue: enqueue/pump/pause/resume/retry critici; refs e effetti.
- useAISettings: persistenza e caricamento impostazioni AI.

## Componenti da Estrarre
- Header: spostare onSaveProject/onImportProject in callback stabili.
- ControlsBar: opzioni UI (brightness/temperature/theme/scale/showControls).
- HomeView: upload, recenti, open project.
- ReaderContainer: incapsula ReaderView con handler verify/ reanalyze/ toggle.
- BottomBar: azioni di ritraduzione, toggle originale/tradotto, navigazione.
- Modali: SettingsModal (mantenere entrambe le istanze se servono), UploadLanguagePrompt, ImageCropModal, RenameModal.

## Utils e Config
- constants/config: timeout, qualità JPEG, scale, percorsi pdf.js, limiti coda.
- helpers comuni: salvataggi su disco (update combinati), debounce uniforme.

## Tipi
- Tipizzare window.electronAPI e strutture progetto/traduzione.
- Tipi pdf.js (Page, RenderTask) e stato (Record) dedicati.

## Organizzazione Cartelle
- src/services/: pdfRenderingService.ts, projectService.ts, verificationService.ts, translationService.ts
- src/hooks/: usePdfRendering.ts, useProjectLibrary.ts, useVerification.ts, useTranslationQueue.ts, useAISettings.ts
- src/components/: Header/, ControlsBar/, HomeView/, Reader/, BottomBar/, Modals/
- src/utils/: constants.ts, helpers.ts
- src/types/: electron.d.ts, pdf.d.ts, project.d.ts

## Invarianti Comportamentali
- Nessuna modifica a flussi utente, hotkeys, risultati di traduzione/verifica.
- Stessi props e stessa UI percepita (ordine, visibilità, condizioni).
- Stessi side-effect su disco e su window.electronAPI.

## Passi Operativi
1) Mappare sezioni e dipendenze in [App.tsx](file:///Users/lucasicignano/Desktop/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/App.tsx).
2) Estrarre servizi: pdfRendering, project, verification, translation (copiando funzioni lunghe e loro dipendenze).
3) Creare hooks per stato/effetti; sostituire inline handler con useCallback.
4) Estrarre componenti UI (Home, ReaderContainer, BottomBar, Modali, Header, ControlsBar).
5) Centralizzare config/costanti e tipi condivisi.
6) Ripulire import inutilizzati e risolvere shadowing (es. projectFileIdFromName).
7) Ricomporre App con le nuove unità mantenendo la stessa logica di render.

## Verifica
- Dev server/electron: avvio e uso completo senza regressioni.
- Test manuale: upload, traduzione, verifica, rotazioni, ritraduzioni, salvataggi.
- Controllo rendering (thumbnails, JPEG) e prestazioni (re-render ridotti).

## Rischi e Mitigazioni
- Dipendenze incrociate tra effetti: isolare in hooks e documentare dipendenze.
- Race conditions in code/prefetch: serializzare/queue interna nello useTranslationQueue.
- Doppie istanze delle modali: mantenere entrambe finché la logica lo richiede.

## Risultato Atteso
- App.tsx ridotto a ~1k righe, con responsabilità chiare, stessa UX e funzionalità.