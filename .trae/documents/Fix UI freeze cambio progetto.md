## Risposta diretta alle tue paure (sovrascritture / sovrapposizioni / ID)

* “Sicuro sicuro al 100%” non posso prometterlo senza implementazione + test, ma posso progettare la modifica in modo che **riduca** il rischio rispetto all’attuale e che fallisca in modo “safe”.

* Oggi il rischio principale non è tanto la concorrenza sul disco (in main c’è `safeWriteFile` con lock + tmp+rename) quanto:

  * inviare snapshot enormi via IPC (freeze),

  * e la possibilità di scritture “stale” se arrivano salvataggi fuori contesto.

* Lato ID, ci sono già protezioni forti:

  * in main c’è controllo mismatch (`ID_MISMATCH`) e rifiuto su mismatch critico in [projectHandlers.js](file:///Users/lucasicignano/Lavoro%20temporaneo/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/electron/projectHandlers.js#L313-L327);

  * in renderer `updateLibrary` blocca collisioni “ID appartiene a un altro fileName” e gestisce redirezioni rename.

## Diagnosi (perché freeza)

* `await library.flushSaves()` in [App.tsx](file:///Users/lucasicignano/Lavoro%20temporaneo/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/src/App.tsx#L1162-L1169) forza il flush prima di caricare il nuovo progetto.

* `flushSaves()` in [useAppLibrary.ts](file:///Users/lucasicignano/Lavoro%20temporaneo/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/src/hooks/useAppLibrary.ts#L676-L721) invia a IPC l’oggetto completo `recentBooksRef.current[fileId]` (molto grande).

* `ipcRenderer.invoke` (vedi [preload.cjs](file:///Users/lucasicignano/Lavoro%20temporaneo/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/electron/preload.cjs#L13-L18)) serializza il payload in modo sincrono nel renderer: qui nasce il freeze.

## Piano (con “safety rails” anti-sovrascrittura)

1. **Delta-based saving + accumulo sicuro (zero data-loss tra update consecutivi)**

   * In `useAppLibrary.updateLibrary`, quando esiste già una request per `fileId` in `saveQueueRef`, invece di rimpiazzare `existing.data = data`, fare **merge dei delta** (stesso approccio già usato nel `TranslationJobRunner`):

     * scalari: ultimo valore vince;

     * mappe page-indexed: merge per chiave.

   * Questo elimina il rischio “ho fatto due modifiche diverse prima del flush e la seconda mi cancella la prima”.

2. **Payload minimo e sempre valido (anti-freeze, anti-errori validazione)**

   * Costruire un payload minimo per IPC che includa sempre `fileName` e `fileId` (richiesti da [validateProjectData](file:///Users/lucasicignano/Lavoro%20temporaneo/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/electron/validation.js#L9-L36)) e solo i campi realmente cambiati.

   * `processSaveQueue()` usa questo payload (non lo snapshot completo).

3. **`flushSaves()`** **mirato e senza snapshot completo**

   * Rifare `flushSaves` per prendere i delta già accumulati nella queue (o costruire un payload minimale se necessario).

   * Aggiungere `flushSaves([fileId])` così durante lo switch flushiamo solo il progetto che si sta lasciando.

4. **Guardia anti-stale write (extra sicurezza “sovrascritture”)**

   * Aggiungere un campo opzionale `revision` ai payload di salvataggio generati dal renderer (monotono per fileId).

   * In main (`projectHandlers.js`) mantenere `lastAppliedRevisionByFileId` in memoria e **scartare** salvataggi con revision più vecchia.

   * Questo chiude anche l’ultima classe di “sovrascrittura” possibile: arrivo fuori ordine o retry tardivo.

5. **Cambio progetto: flush solo del vecchio ID + preservo le protezioni esistenti**

   * In `handleOpenProject`, flush solo `currentProjectFileId` (se presente) e poi mantenere `cancelPendingSaves` + `blockSave` (già presenti) per evitare ghost writes durante l’handoff.

6. **Test automatici (per darti certezza pratica)**

   * Aggiungere test Vitest che simulano:

     * due update consecutivi su campi diversi prima del flush → dopo merge/flush su disco, entrambi presenti;

     * `revision` più vecchia non sovrascrive una più nuova;

     * protezione ID mismatch continua a funzionare.

## Esito atteso

* Switch progetto: UI reattiva perché IPC invia pochi KB/MB invece di decine di MB.

* Integrità: nessuna perdita tra update ravvicinati (merge delta) e nessuna sovrascrittura “stale” (revision guard).

