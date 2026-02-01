## Contesto attuale
- In Home, la lista “Recenti” mostra i progetti con nome, pagina e data.
- È già presente un’azione di rinomina: icona matita nella card che apre un modale e chiama la logica esistente. Vedi [App.tsx](file:///Users/lucasicignano/Desktop/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/App.tsx#L2911-L2960) e il modale [App.tsx](file:///Users/lucasicignano/Desktop/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/App.tsx#L3145-L3217).
- Backend Electron gestisce la rinomina aggiornando JSON, cartella assets e originalFilePath. Vedi [main.js](file:///Users/lucasicignano/Desktop/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/electron/main.js#L670-L718).

## Obiettivo
- Rendere la rinomina “disponibile e evidente” dalla Home, evitando che sia nascosta solo su hover.

## Modifiche UI/UX
- Mostrare sempre l’icona matita accanto al nome nella card dei “Recenti”, non solo su hover.
- Aggiungere un menu “Altro” (⋯) nella card con le voci: Rinomina, Rimuovi dalla cronologia.
- Abilitare doppio click sul nome per avviare la rinomina (riusa `renameProject`).
- Migliorare accessibilità: label/titoli ARIA, tasti Enter/Escape già supportati.

## Logica & Integrazione
- Riutilizzare lo stato `renameState` e le funzioni esistenti: `renameProject`, `submitRename`, `refreshLibrary`. Vedi [App.tsx](file:///Users/lucasicignano/Desktop/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/App.tsx#L654-L688).
- Continuare a chiamare `electronAPI.renameTranslation({ fileId, newFileName })` per garantire coerenza di JSON, cartella assets e percorso del PDF copiato. Vedi [main.js](file:///Users/lucasicignano/Desktop/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/electron/main.js#L670-L718).

## Validazione
- Nome non vuoto; gestione conflitti: il backend già rifiuta duplicati ed effettua normalizzazione dell’ID file.
- Test manuale: rinominare un progetto, verificare aggiornamento lista, apertura progetto, assets e PDF originale copiato coerenti.

## Consegna
- Aggiornare la Home per rendere la rinomina sempre visibile e attivabile anche da menu e doppio click, senza introdurre nuova logica lato backend.
