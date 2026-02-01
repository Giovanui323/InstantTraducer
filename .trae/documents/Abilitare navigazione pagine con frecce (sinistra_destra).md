## Diagnosi
- Nel reader non esiste alcun handler per `ArrowLeft`/`ArrowRight` (in [ReaderView.tsx](file:///Users/lucasicignano/Lavoro%20temporaneo/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/src/components/ReaderView.tsx#L497-L581) sono gestiti solo `Space` e `Ctrl/Cmd+Z`).
- Il cambio pagina oggi avviene solo dai pulsanti della toolbar (in [App.tsx](file:///Users/lucasicignano/Lavoro%20temporaneo/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/src/App.tsx#L1274-L1291)).

## Implementazione
- Aggiungere in [App.tsx](file:///Users/lucasicignano/Lavoro%20temporaneo/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/src/App.tsx) un `useEffect` globale che ascolta `window.keydown` e:
  - Se siamo in Home (`showHome`) non fa nulla.
  - Se il focus è su un campo editabile (`input/textarea/select` o `contenteditable`) non fa nulla.
  - Se sono aperti overlay/modali che devono “prendersi” la tastiera (es. settings, confirm, rename, crop, upload prompt, preview pagina, note, ecc.) non fa nulla.
  - Su `ArrowLeft` va a pagina precedente, su `ArrowRight` va alla successiva.
  - Step coerente con la toolbar: `1` in single, `2` in side-by-side, con clamp tra `1` e `totalPages`.
  - `preventDefault()` per evitare scroll orizzontale/behavior del browser.
- Replicare la stessa logica anche in [AppOffline.tsx](file:///Users/lucasicignano/Lavoro%20temporaneo/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/src/AppOffline.tsx) (stessa UX in modalità offline).

## Compatibilità
- Non toccare gli shortcut già esistenti in `ReaderView`:
  - `Space` per pan
  - `Ctrl/Cmd+Z` per undo
  - `Escape` per chiudere preview

## Verifica
- Avviare l’app in dev e verificare:
  - Frecce cambiano pagina in single e avanzano di 2 in side-by-side.
  - Nessuna interferenza quando si sta scrivendo in input (ricerca, modali, note).
  - Nessuna interferenza con `Space` pan e `Ctrl/Cmd+Z`.

## Extra (opzionale)
- Estendere anche a `PageUp/PageDown` (stesso comportamento delle frecce) se vuoi una navigazione “da lettore PDF” più completa.