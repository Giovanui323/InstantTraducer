## Fase 1: Stabilità e Integrità Dati (Priorità Assoluta)
1.  **Gestione Ciclo di Vita PDF**: Implementare una pulizia rigorosa in [App.tsx](file:///Users/lucasicignano/Lavoro%20temporaneo/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/src/App.tsx) chiamando `pdfDoc.destroy()` prima di caricare nuovi documenti per eliminare i memory leak.
2.  **Rifacimento Sistema Offset**: Riscrivere la logica di calcolo in [MarkdownText.tsx](file:///Users/lucasicignano/Lavoro%20temporaneo/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/src/components/MarkdownText.tsx) per essere ricorsiva e allineata al `textContent` reale del DOM, risolvendo lo sfasamento di highlight e note.
3.  **Sequenzialità Intelligente**: Modificare la coda in [useAppTranslation.ts](file:///Users/lucasicignano/Lavoro%20temporaneo/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/src/hooks/useAppTranslation.ts) per garantire che le pagine vengano tradotte in ordine se il contesto della pagina precedente è necessario per la coerenza.

## Fase 2: Performance e Scalabilità
1.  **Ottimizzazione IPC**: Sostituire il passaggio di immagini giganti in Base64 con un sistema di scrittura diretta su disco dal processo Main o l'uso di buffer binari più efficienti.
2.  **Unificazione Impostazioni**: Eliminare la discrepanza tra `localStorage` e `settings.json`, centralizzando tutto in un unico hook che comunica in modo atomico con Electron.
3.  **Cache PDF Sostitutivi**: Implementare un meccanismo di cache per i PDF di sostituzione per evitare di ri-leggerli e ri-parsali ad ogni render di pagina.

## Fase 3: Qualità e Rifiniture
1.  **Sincronizzazione Prompt**: Allineare i prompt OpenAI e Gemini per includere tutte le istruzioni di layout e il `legalContext`.
2.  **Interactive Index**: Rendere i numeri di pagina nell' `IndexView` cliccabili per navigare rapidamente nel libro.

Ti sembra che questo piano affronti ora tutti i problemi "gravi" che avevi individuato? Procedo con l'attuazione?