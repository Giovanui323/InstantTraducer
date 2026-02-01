## Diagnosi (cosa sta succedendo)
- In Home il “pallino rosso” si accende quando `!book.hasSafePdf` ([HomeView.tsx:L210-L216](file:///Users/lucasicignano/Lavoro%20temporaneo/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/src/components/HomeView.tsx#L210-L216)).
- `hasSafePdf` viene popolato solo quando la libreria viene ricaricata dal disco, via `get-translations` nel main process; lì oggi si controlla solo `assets/<fileId>/original.pdf` ([main.js:L799-L804](file:///Users/lucasicignano/Lavoro%20temporaneo/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/electron/main.js#L799-L804)).
- Subito dopo un upload, però, la lista “Recenti” viene aggiornata in memoria con `updateLibrary(...)`, che non imposta `hasSafePdf`; quindi vale `undefined` e `!undefined` diventa `true` ⇒ pallino rosso anche se il PDF è stato copiato correttamente.
- La finestra Finder compare quando, aprendo un progetto, non si trova né una copia “safe” in assets (`getOriginalPdfPath`) né un `originalFilePath` nel JSON; in quel caso si chiama `openFileDialog()` ([App.tsx:L640-L652](file:///Users/lucasicignano/Lavoro%20temporaneo/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/src/App.tsx#L640-L652)).

## Correzioni proposte
1) **Eliminare i falsi “mancante” subito dopo upload**
- In `continueUploadWithLanguage` (App e AppOffline), dopo che `copyOriginalPdf` o `saveOriginalPdfBuffer` riesce, aggiornare la libreria includendo esplicitamente `hasSafePdf: true` (oltre a `originalFilePath`).
- In alternativa/aggiunta: in UI Home mostrare il pallino rosso solo quando `hasSafePdf === false` (non quando è `undefined`).

2) **Rendere `hasSafePdf` coerente e più robusto quando arriva dal disco**
- In `electron/main.js` dentro `get-translations`, sostituire il check “solo original.pdf” con la stessa logica di `get-original-pdf-path` ([main.js:L1008-L1025](file:///Users/lucasicignano/Lavoro%20temporaneo/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/electron/main.js#L1008-L1025)) così non ci sono mismatch futuri.

3) **Ridurre ulteriormente i casi in cui compare Finder**
- In `handleOpenProject` (App e AppOffline), se `getOriginalPdfPath(fileId)` ha successo ma `data.originalFilePath` è vuoto/mancante, salvare subito `originalFilePath` nel progetto (auto-riparazione) così nelle aperture successive non si finisce nel ramo Finder.

## Verifica (come controllo che sia risolto)
- Scenario A: carico un PDF e torno subito in Home ⇒ nessun pallino rosso.
- Scenario B: chiudo/riapro il progetto da Home ⇒ non deve aprirsi Finder e il PDF deve essere trovato via copia safe.
- Scenario C (retrocompatibilità): progetto vecchio senza `originalFilePath` ma con `assets/.../original*.pdf` ⇒ si apre senza Finder e viene auto-riparato.

Se confermi, applico una patch mirata su: [App.tsx](file:///Users/lucasicignano/Lavoro%20temporaneo/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/src/App.tsx), [AppOffline.tsx](file:///Users/lucasicignano/Lavoro%20temporaneo/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/src/AppOffline.tsx), [HomeView.tsx](file:///Users/lucasicignano/Lavoro%20temporaneo/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/src/components/HomeView.tsx), e `electron/main.js`.