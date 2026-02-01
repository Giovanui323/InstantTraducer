# Correzione del comportamento di chiusura automatica (Click-Outside)

Il problema segnalato riguarda la barra di ricerca e i controlli di luminosità che rimangono aperti anche quando si clicca in altre aree dell'applicazione. Attualmente, questi componenti non hanno una logica di "click-outside" per la chiusura automatica.

Implementerò una soluzione coerente con il pattern già presente nel progetto (utilizzato per i menu della Home), estendendo il listener globale dei click in `App.tsx` e aggiungendo le classi di riferimento necessarie ai componenti coinvolti.

## Interventi previsti

### 1. Modifica dell'hook di ricerca
Aggiornerò [useSearch.ts](file:///Users/lucasicignano/Lavoro%20temporaneo/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/src/hooks/useSearch.ts) per esporre la funzione `setSearchOpen`, permettendo così al componente principale di chiudere la barra di ricerca programmaticamente.

### 2. Aggiornamento dei componenti UI
Aggiungerò delle classi CSS specifiche ("trigger" e "container") per identificare gli elementi ed evitare che il click sul pulsante di attivazione chiuda e riapra immediatamente il componente:
- In [Header.tsx](file:///Users/lucasicignano/Lavoro%20temporaneo/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/src/components/Header.tsx): aggiunta di `search-trigger`, `search-container` e `controls-trigger`.
- In [ControlsBar.tsx](file:///Users/lucasicignano/Lavoro%20temporaneo/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/src/components/ControlsBar.tsx): aggiunta di `controls-container`.

### 3. Logica di chiusura in App.tsx
Estenderò l'effetto `handleGlobalClick` in [App.tsx](file:///Users/lucasicignano/Lavoro%20temporaneo/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/src/App.tsx) per gestire lo stato di `showControls` e `searchOpen`. Se viene rilevato un click al di fuori del contenitore e del relativo pulsante di attivazione, lo stato verrà impostato a `false`.

### 4. Raffinamento filtri di ricerca
Aggiungerò una logica simile all'interno di [Header.tsx](file:///Users/lucasicignano/Lavoro%20temporaneo/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/src/components/Header.tsx) per gestire la chiusura del dropdown dei filtri di ricerca, garantendo un'esperienza utente fluida.

## Piano di Esecuzione

1. **[useSearch.ts](file:///Users/lucasicignano/Lavoro%20temporaneo/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/src/hooks/useSearch.ts)**: Esportare `setSearchOpen`.
2. **[Header.tsx](file:///Users/lucasicignano/Lavoro%20temporaneo/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/src/components/Header.tsx)**: 
    - Aggiungere classi identificative.
    - Implementare `useEffect` locale per la chiusura del dropdown filtri.
3. **[ControlsBar.tsx](file:///Users/lucasicignano/Lavoro%20temporaneo/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/src/components/ControlsBar.tsx)**: Aggiungere classe `controls-container`.
4. **[App.tsx](file:///Users/lucasicignano/Lavoro%20temporaneo/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/src/App.tsx)**: Aggiornare il listener globale dei click.

Posso procedere con queste modifiche?
