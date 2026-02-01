Ho analizzato approfonditamente il codice del reader e dei relativi hook. Sebbene il sistema sia funzionale, ho riscontrato alcuni errori di logica e potenziali problemi di stabilità che dovrebbero essere corretti:

## **Errori Gravi Riscontrati**

1.  **Race Condition e Side Effects (Critico):** In [useAppTranslation.ts](file:///Users/lucasicignano/Lavoro temporaneo/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/src/hooks/useAppTranslation.ts), la funzione asincrona `updateLibrary` viene chiamata all'interno di un aggiornamento di stato funzionale (`setTranslationMap`). Questo viola le regole di React e può causare comportamenti imprevedibili, perdite di dati o loop infiniti.
2.  **Gestione del Layout e Resize (Serio):** In [ReaderView.tsx](file:///Users/lucasicignano/Lavoro temporaneo/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/src/components/ReaderView.tsx), il calcolo della scala (`effectiveScale`) non reagisce al ridimensionamento della finestra del browser, portando a un layout errato dopo un resize finché non si cambia pagina o zoom.
3.  **Race Condition nella Coda di Traduzione (Serio):** In [useTranslationQueue.ts](file:///Users/lucasicignano/Lavoro temporaneo/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/src/hooks/useTranslationQueue.ts), il meccanismo di lock `isPumpingQueueRef` presenta una vulnerabilità logica nelle chiamate ricorsive che potrebbe permettere l'esecuzione di più "pump" contemporanei, sovraccaricando il sistema.
4.  **Sincronizzazione Stato Props/Internal (Medio):** La gestione di `previewPage` e `notesPage` in [ReaderView.tsx](file:///Users/lucasicignano/Lavoro temporaneo/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/src/components/ReaderView.tsx) è inutilmente complessa e soggetta a inconsistenze tra stato interno e props.

## **Piano di Intervento**

### **1. Correzione Side Effects in `useAppTranslation`**
- Rimuovere la chiamata a `updateLibrary` dall'interno di `setTranslationMap`.
- Implementare un meccanismo (es. `useEffect` o callback post-update) per persistere i dati in modo sicuro.

### **2. Ottimizzazione Layout in `ReaderView`**
- Aggiungere un listener per l'evento `resize` (o un `ResizeObserver`) per ricalcolare la scala del documento in tempo reale.
- Ottimizzare il rendering del testo Markdown pre-calcolando lo split delle pagine (`[[PAGE_SPLIT]]`).

### **3. Consolidamento della Coda (Queue)**
- Rifattorizzare `pumpQueue` per garantire che il lock sia gestito correttamente anche in scenari di alta concorrenza.

### **4. Miglioramenti Funzionali**
- Estendere la logica di **Undo (Annulla)** in `ReaderView` per supportare anche l'eliminazione delle ultime note aggiunte, non solo degli highlight.
- Aggiungere un limite alla cache dei documenti PDF sostitutivi in [App.tsx](file:///Users/lucasicignano/Lavoro temporaneo/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/src/App.tsx) per prevenire eccessivo consumo di memoria.

Sei d'accordo con questo piano d'azione per procedere alle correzioni?