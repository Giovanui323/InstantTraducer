## Consolidamento Totale Home Page

### 1. Fix Gestione Conferme (Progetti e Gruppi)
- **Progetti**: Trasformare `deleteProject` in [useAppLibrary.ts](file:///Users/lucasicignano/Lavoro%20temporaneo/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/src/hooks/useAppLibrary.ts) in una funzione async che attende la conferma prima di ritornare `true`.
- **Gruppi**: In `handleDeleteGroup`, cambiare il tipo modal da `'alert'` a `'danger'` per riabilitare il tasto **Annulla** e migliorare la chiarezza visiva.

### 2. Separazione Eventi (Apertura vs Rinomina)
- In [HomeView.tsx](file:///Users/lucasicignano/Lavoro%20temporaneo/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/src/components/HomeView.tsx), aggiungere `e.stopPropagation()` all'evento `onDoubleClick` del titolo.
- Questo impedirà al doppio click di propagarsi al contenitore padre e di attivare erroneamente l'apertura del progetto.

### 3. Ottimizzazione Rendering e Performance
- Sostituire `key={i}` con `key={book.fileId}` nella lista dei libri recenti.
- Ottimizzare `onDragOver` in [App.tsx](file:///Users/lucasicignano/Lavoro%20temporaneo/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/src/App.tsx) per evitare aggiornamenti di stato ridondanti se `isDragging` è già true.

## Richiesta di conferma
Questo piano copre ora tutti i bug, sia quelli evidenti che quelli nascosti (doppio click e performance). Posso procedere?
