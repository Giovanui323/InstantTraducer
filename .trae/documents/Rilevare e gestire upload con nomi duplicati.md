## Problema attuale
- In upload il progetto viene identificato da `fileId` calcolato con `computeFileId(fileName, file.path)`.
- Se `file.path` non è disponibile (alcuni drag&drop / picker), due PDF con lo stesso nome generano lo stesso `fileId` e il secondo upload può sovrascrivere/riusare il progetto senza alcun avviso.
- Non esiste un controllo “nome già presente” prima di creare/salvare il progetto.

## Obiettivo
- Quando carichi un secondo file con lo stesso nome, l’app deve avvisarti almeno una volta, ed evitare sovrascritture silenziose.

## Modifiche previste (frontend upload)
- Aggiungere una normalizzazione nome (case-insensitive, trim, e gestione `.pdf` finale) per confrontare i “titoli” in modo coerente.
- Prima di avviare `continueUploadWithLanguage(...)`:
  - Cercare nei progetti già in libreria (`library.recentBooks`) se esiste già un libro con lo stesso nome normalizzato.
  - Se esiste:
    - Mostrare un popup (modale già esistente) con messaggio tipo “Esiste già un progetto con questo nome”.
    - Generare automaticamente un nome unico per il nuovo progetto (`Titolo (2)`, `Titolo (3)`, …) e proseguire usando quel nome.
  - Se non esiste: proseguire normalmente.
- In aggiunta (difesa in profondità): se il `fileId` calcolato risultasse già presente, forzare un `fileId` alternativo coerente col nome unico (così non si può mai sovrascrivere in silenzio).

## Modifiche previste (import pacchetto)
- Mettere in sicurezza `import-project-package` su Electron:
  - Generare un `fileId` coerente col resto dell’app (incluso `.json`).
  - Se il target esiste già, scegliere un nome/id alternativo con suffix incrementale invece di sovrascrivere.
  - Aggiornare `projectData.fileName` al nome finale scelto e restituire al renderer il `fileId` corretto (quello che poi viene passato a `loadTranslation`).

## Verifica
- Verifica manuale guidata:
  - Caricare due PDF diversi con lo stesso nome e controllare che compaia l’avviso e che il secondo venga salvato come `(...)(2)` senza perdere il primo.
  - Ripetere con un terzo file per verificare `(...)(3)`.
  - Importare due volte lo stesso pacchetto `.gpt` e verificare che non sovrascriva e che l’apertura del progetto importato funzioni.

## Conferma richiesta
- Procedo con questa policy: avviso + auto-rinomina (`(2)`, `(3)`) per evitare ambiguità e sovrascritture.