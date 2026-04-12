## Diagnosi
- I timeout a 30s che vedi non sono solo “lenti”: oggi il `WriteSequencer` usa `Promise.race()` e, allo scattare del timeout, **rilascia la coda** anche se la scrittura reale può continuare in background. Questo permette **scritture sovrapposte sullo stesso fileId**, aumentando contesa e rischio di perdita dati.
- In più, `withFileLock()` oggi **prosegue anche se non ottiene il lock entro 5s** e prova comunque a rimuovere il `.lock`, quindi il lock non garantisce mutua esclusione.

## Interventi Prioritari (anti-perdita-dati)
- Correggere `WriteSequencer.enqueue()` in [state.js](file:///Users/lucasicignano/Lavoro%20temporaneo/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/electron/state.js) per:
  - Restituire al caller un errore “timeout” dopo 30s (come oggi), ma **non liberare la catena interna** finché il `task()` reale non termina.
  - Evitare che più scritture per lo stesso `id` possano sovrapporsi dopo un timeout.
- Correggere `withFileLock()` in [fileUtils.js](file:///Users/lucasicignano/Lavoro%20temporaneo/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/electron/fileUtils.js) per:
  - Se non acquisisce il lock entro `maxWait`, **fallire** (throw) e non eseguire `task()`.
  - Rimuovere il `.lock` **solo se** il lock è stato realmente acquisito.
  - (Opzionale ma consigliato) gestire lock “stale” (vecchi) in modo sicuro.

## Hardening delle scritture
- Usare `safeWriteFile()` anche per settings (oggi `save-settings` fa `writeFile` diretto) in [settingsLogic.js](file:///Users/lucasicignano/Lavoro%20temporaneo/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/electron/settingsLogic.js), così da avere atomic write + lock coerenti.
- Rendere atomica anche la persistenza del PDF originale (buffer/copy) in [projectHandlers.js](file:///Users/lucasicignano/Lavoro%20temporaneo/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/electron/projectHandlers.js) usando lo stesso pattern `.tmp + rename`.

## Diagnostica mirata (per capire “dove” si mangiano i 30s)
- Aggiungere timing (readFile/parse/merge/stringify/write/rename) nel task di `save-translation` in [projectHandlers.js](file:///Users/lucasicignano/Lavoro%20temporaneo/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/electron/projectHandlers.js) e arricchire il log di timeout in [state.js](file:///Users/lucasicignano/Lavoro%20temporaneo/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/electron/state.js) con metadati utili (bytes stimati, fase corrente se disponibile).

## Continuazione “3 issue” già pianificate
- Prompt anti-hallucination “Page 150” in [verifierPrompts.ts](file:///Users/lucasicignano/Lavoro%20temporaneo/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/src/services/verifierPrompts.ts) (ignorare riferimenti bibliografici).
- Anti “ghost writes” su cambio progetto: aggiungere `blockSave(oldId, 2000)` nel project switcher in [useAppLibrary.ts](file:///Users/lucasicignano/Lavoro%20temporaneo/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/src/hooks/useAppLibrary.ts).
- Spezzare retry loop: se esauriti i retry anche con severity `severe`, **salvare comunque** marcando “Needs Review” in [TranslationExecutor.ts](file:///Users/lucasicignano/Lavoro%20temporaneo/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/src/services/translation/TranslationExecutor.ts), e rendere più robusta la detection in [useAppQuality.ts](file:///Users/lucasicignano/Lavoro%20temporaneo/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/src/hooks/useAppQuality.ts).

## Verifica
- Riprodurre scenario: avvio traduzioni + salvataggi BACKGROUND, verificare assenza di timeout ripetuti “a cascata”, assenza di sovrascritture anomale e integrità JSON.
- Aggiungere un test/manual check: forzare lock contention e verificare che `withFileLock` non scriva senza lock.
