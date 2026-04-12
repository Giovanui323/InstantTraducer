## Cosa sta succedendo (e perché è pericoloso)
- Confermo il rischio: i messaggi “ORPHANED ASSET FOLDER … does not belong to any active project” sono fuorvianti e possono indurre l’utente a cancellare cartelle che contengono `original.pdf` e altri asset indispensabili.
- Dai log sembra una race (“0 progetti” e subito dopo `get-translations` ne carica 12), ma nel codice il Deep Health Check non dipende dalla libreria “in memoria”: scansiona direttamente il disco.
- Il vero bug logico è che `performDeepHealthCheck()` (e anche `cleanupOrphanedAssets()`) cercano solo progetti con nome `id_*.json` ([fileUtils.js](file:///Users/lucasicignano/Lavoro%20temporaneo/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/electron/fileUtils.js#L308-L384)). Nella tua versione i progetti sono salvati come `*.json` senza prefisso `id_` (come dimostra `get-translations` in [projectHandlers.js](file:///Users/lucasicignano/Lavoro%20temporaneo/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/electron/projectHandlers.js#L450-L515)).
- Risultato: il check “vede 0 progetti”, quindi marca come “orfane” tutte le cartelle in `translations/assets/*`.

## Obiettivo
- Eliminare i falsi positivi nel Deep Health Check.
- Impedire che una funzione di cleanup possa spostare/cancellare asset validi per errore.
- Rendere i log non ambigui (non suggerire che siano “spazzatura” quando non siamo certi).

## Correzioni tecniche (main)
- Allineare la scansione progetti in `performDeepHealthCheck()` a `get-translations`:
  - considerare tutti i file `*.json` in `translations` (escludendo `undefined.json` e file nascosti/temporanei), invece di `id_*.json`.
  - calcolare gli asset attesi con `projectAssetsDirFromFileId(projFile, false)` usando direttamente il filename `.json` completo (senza `replace('id_', '')`).
- Applicare lo stesso fix a `cleanupOrphanedAssets()` (oggi usa la stessa logica errata e può fare danni).

## Protezioni anti-perdita-dati (hardening)
- In `cleanupOrphanedAssets()` aggiungere una guardia: se `projectFiles.length === 0` allora abort (return/throw) senza spostare nulla, e loggare un warning chiaro.
- Aggiungere una guardia anche nel Deep Health Check: se il numero di progetti trovati è 0, non emettere una lista di “ORPHANED …” che sembra definitiva; al massimo loggare che “non è stato possibile determinare i progetti, skip orphan scan”.

## Miglioramento messaggi log (UX)
- Cambiare la stringa del warning da “does not belong to any active project” a qualcosa di non ingannevole tipo “not matched to any project file on disk” e aggiungere “NON cancellare manualmente, usa la funzione di pulizia” (senza cambiare il comportamento).
- (Opzionale) Loggare i dettagli per-cartella solo in verbose/debug, lasciando sempre un riepilogo con il conteggio.

## Verifica
- Avvio app: il Deep Health Check deve riportare un numero di progetti coerente (es. 12) e il conteggio “orphanedAssets” deve riflettere solo orfani reali.
- Trigger manuale di cleanup assets orfani: deve muovere solo cartelle realmente non referenziate; in caso di 0 progetti trovati deve rifiutarsi di operare.
- Controllo UI “Stato integrità libreria”: “Asset orfani” non deve essere falsamente alto.

## Nota per l’utente (comportamento attuale)
- Fino al fix: non cancellare a mano `…/translations/assets/*` anche se compare “ORPHANED” nei log: al momento è un falso positivo generato dal pattern `id_*.json`.