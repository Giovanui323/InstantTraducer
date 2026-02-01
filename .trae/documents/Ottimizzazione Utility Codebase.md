# Ottimizzazione e Pulizia Utility

## Obiettivo:
Eliminare le duplicazioni di codice, migliorare la tipizzazione e garantire coerenza tra i vari moduli utility del progetto.

## Azioni Tecniche:
### 1. Centralizzazione Funzioni Asincrone
- Rimuovere la definizione duplicata di `withTimeout` da [pdfUtils.ts](file:///Users/lucasicignano/Lavoro%20temporaneo/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/src/utils/pdfUtils.ts).
- Aggiornare gli import in [App.tsx](file:///Users/lucasicignano/Lavoro%20temporaneo/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/src/App.tsx) e [useAppTranslation.ts](file:///Users/lucasicignano/Lavoro%20temporaneo/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/src/hooks/useAppTranslation.ts) per puntare a [async.ts](file:///Users/lucasicignano/Lavoro%20temporaneo/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/src/utils/async.ts).

### 2. Refactoring pdfUtils.ts
- Importare e utilizzare `dataUrlToBase64` da [imageUtils.ts](file:///Users/lucasicignano/Lavoro%20temporaneo/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/src/utils/imageUtils.ts).
- Sostituire i tipi `any` con `PDFDocumentProxy` e `PDFPageProxy` per una migliore robustezza.

### 3. Pulizia App.tsx e fileUtils.ts
- Sostituire la funzione `safeCopy` locale in [App.tsx](file:///Users/lucasicignano/Lavoro%20temporaneo/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/src/App.tsx) con l'importazione da [clipboard.ts](file:///Users/lucasicignano/Lavoro%20temporaneo/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/src/utils/clipboard.ts).
- Rimuovere `estimateBytesFromBase64` da [fileUtils.ts](file:///Users/lucasicignano/Lavoro%20temporaneo/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/src/utils/fileUtils.ts) (già presente in imageUtils).

## Verifica:
- Controllo assenza errori di compilazione/import.
- Test rapido di caricamento e traduzione pagina per confermare che i timeout e le utility funzionino correttamente.
