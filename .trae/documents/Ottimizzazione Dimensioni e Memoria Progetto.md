## Ottimizzazione Memoria e Archiviazione

### 1. Ottimizzazione della Libreria (RAM)
- Modificare [useAppLibrary.ts](file:///Users/lucasicignano/Lavoro%20temporaneo/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/src/hooks/useAppLibrary.ts) per caricare solo i metadati (titolo, autore, progresso) di tutti i libri, caricando i dati pesanti (traduzioni, annotazioni) solo per il libro attualmente aperto.

### 2. Gestione Intelligente delle Immagini (RAM)
- Implementare un sistema di pulizia automatica (sliding window o LRU) per `originalImages` e `croppedImages` in [App.tsx](file:///Users/lucasicignano/Lavoro%20temporaneo/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/src/App.tsx).
- Mantenere in memoria solo le immagini delle pagine vicine a quella corrente, ricaricando le altre dal disco (o rigenerandole dal PDF) solo quando necessario.

### 3. Riduzione Ridondanza Scrittura (Disco)
- In [useAppTranslation.ts](file:///Users/lucasicignano/Lavoro%20temporaneo/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/src/hooks/useAppTranslation.ts), aggiungere un controllo preventivo su `pageImagesIndexRef` prima di chiamare `saveSourceForPage`, evitando di riscrivere file già esistenti e corretti.

### 4. Pulizia Dati Temporanei
- Verificare che i log di debug non vengano persistiti inutilmente nel file JSON del progetto.
