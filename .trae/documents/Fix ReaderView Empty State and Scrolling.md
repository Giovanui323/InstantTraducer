## **Correzione ReaderView e Visualizzazione Pagine**

### **Obiettivo**
Risolvere il problema della "finestra vuota" e permettere la visualizzazione/scorrimento di tutte le pagine (tradotte e non) all'interno della ReaderView.

### **Passaggi Tecnici**

#### **1. App.tsx: Gestione Modalità Solo Testo**
- Correggere la logica in `handleOpenProject`: se il PDF non viene caricato con successo, impostare `isReaderMode(true)` per forzare l'uso di `SimplifiedReader`.
- Creare una variabile `allPages` che contenga l'elenco di tutte le pagine (1..totalPages).
- Passare `allPages` al componente `ReaderView` invece di `currentPages` (che conteneva solo la pagina attiva).

#### **2. App.tsx: Ottimizzazione Canvas**
- Modificare il passaggio dei `canvasRefs` a `ReaderView`. Poiché non possiamo avere centinaia di canvas attivi, passeremo un array di refs dove solo le pagine vicine a quella corrente hanno un riferimento valido.

#### **3. ReaderView.tsx: Layout Verticale e Scrolling**
- Cambiare la classe del contenitore principale delle pagine da `flex` (orizzontale) a `flex-col` (verticale) per permettere lo scrolling del documento.
- Aggiornare il calcolo di `effectiveScale` per basarsi sulla larghezza del contenitore e della singola pagina, evitando che diventi troppo piccolo quando ci sono molte pagine.
- Aggiungere un controllo di sicurezza: renderizzare il `<canvas>` del PDF solo se il riferimento `canvasRefs[idx]` è presente.

#### **4. Verifica e Feedback Visivo**
- Assicurarsi che lo stato di caricamento ("Preparazione AI...") sia sempre visibile e centrato per le pagine non ancora tradotte, evitando che appaiano come spazi vuoti durante lo scrolling.

Ti confermo che queste modifiche renderanno la navigazione molto più fluida e risolveranno il bug della pagina "sparita" o vuota. Posso procedere?