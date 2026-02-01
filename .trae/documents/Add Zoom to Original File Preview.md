# Implementazione dello Zoom nell'anteprima originale (Modulo separato)

Per rispondere alla richiesta di non appesantire `App.tsx` e mantenere il codice modulare, creerò un nuovo componente dedicato per l'anteprima del file originale con funzionalità di zoom.

## Passaggi del Piano:

1.  **Creazione di un nuovo componente**: 
    Creerò il file [OriginalPreviewModal.tsx](file:///Users/lucasicignano/Lavoro%20temporaneo/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/src/components/OriginalPreviewModal.tsx) che conterrà:
    - Logica interna per lo stato dello zoom (`scale`).
    - Controlli UI per Ingrandire/Ridurre (+/-) e visualizzazione della percentuale.
    - Contenitore ottimizzato per lo scorrimento dell'immagine quando ingrandita.
    - Pulsanti esistenti per Ritaglio, Rotazione e Sostituzione pagina.

2.  **Refactoring di `ReaderView.tsx`**:
    - Rimuoverò il blocco di codice relativo al modal di anteprima (circa 80 righe).
    - Importerò e utilizzerò il nuovo componente `OriginalPreviewModal`.
    - Questo renderà [ReaderView.tsx](file:///Users/lucasicignano/Lavoro%20temporaneo/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/src/components/ReaderView.tsx) più leggibile e manutenibile.

3.  **Dettagli Tecnici dello Zoom**:
    - Range di zoom: da 50% a 500%.
    - Transizioni fluide tra i livelli di zoom.
    - Supporto per lo scorrimento sia verticale che orizzontale tramite il mouse/trackpad.
    - Chiusura rapida con il tasto ESC o cliccando fuori dall'immagine.

Questa soluzione evita di modificare `App.tsx` e migliora la struttura del progetto separando le responsabilità dei componenti.

Procedo con l'implementazione?