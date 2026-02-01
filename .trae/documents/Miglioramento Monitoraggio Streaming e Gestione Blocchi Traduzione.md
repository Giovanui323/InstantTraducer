## Obiettivo
Migliorare il monitoraggio dello streaming delle traduzioni e la gestione dei blocchi, adattandosi alla nuova architettura refactorizzata e correggendo le incongruenze tra le diverse modalità di traduzione (automatica vs manuale).

## Analisi e Modifiche Tecniche

### 1. Sincronizzazione Feedback Streaming
Ho rilevato che attualmente la traduzione "manuale" (`processPageTranslation`) aggiorna solo i log di console, mentre quella "automatica" aggiorna lo stato visibile a schermo. Sincronizzerò entrambi per fornire un feedback coerente.

### 2. Servizi Core (src/services)
- **[geminiService.ts](file:///Users/lucasicignano/Lavoro%20temporaneo/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/src/services/geminiService.ts)**:
    - Aggiornerò `translateWithGemini` per inviare l'intero testo parziale accumulato (`fullText`) alla callback `onProgress`.
    - Firma: `onProgress?: (message: string, partialText?: string) => void`.
- **[aiService.ts](file:///Users/lucasicignano/Lavoro%20temporaneo/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/src/services/aiService.ts)**:
    - Aggiornerò `translatePage` per supportare il nuovo parametro `partialText`.

### 3. Stato e Hook (src/hooks)
- **[useAppTranslation.ts](file:///Users/lucasicignano/Lavoro%20temporaneo/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/src/hooks/useAppTranslation.ts)**:
    - Aggiungerò lo stato `partialTranslations` per memorizzare il testo ricevuto in tempo reale.
    - Uniformerò le callback `onProgress` in `processPage` e `processPageTranslation` affinché entrambe aggiornino sia `loadingStatus` (per il feedback testuale principale) che `partialTranslations` (per l'anteprima del testo).
    - Implementerò `stopTranslation` per permettere l'annullamento pulito di una richiesta.

### 4. Interfaccia Utente
- **[ReaderView.tsx](file:///Users/lucasicignano/Lavoro%20temporaneo/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/components/ReaderView.tsx)**:
    - Aggiungerò la visualizzazione del testo parziale nell'overlay di caricamento (un'area scrollabile che mostra gli ultimi caratteri ricevuti).
    - Inserirò i pulsanti **"Interrompi"** (per fermare senza riprovare) e **"Riprova"** (per abortire e riavviare).
    - In caso di errore, manterrò visibile l'ultimo testo parziale ricevuto per facilitare la comprensione del punto di blocco.

## Verifica
- Test dello streaming in tempo reale: il contatore dei caratteri e l'anteprima del testo devono aggiornarsi simultaneamente.
- Test dei blocchi: verificherò che il pulsante di interruzione fermi immediatamente la richiesta API e pulisca lo stato.
- Verifica post-refactor: assicurerò che tutte le importazioni e i flussi tra i nuovi hook siano corretti.

Procedo con queste correzioni?
