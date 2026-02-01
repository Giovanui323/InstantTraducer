L'analisi del problema ha rivelato che il messaggio "Riprovo..." visualizzato nell'interfaccia è spesso un "falso positivo" generato dal monitoraggio interno (heartbeat) del servizio Gemini, che segnala un timeout senza però interrompere la richiesta pendente o innescare un vero tentativo di recupero. Questo blocca la coda di traduzione e impedisce al pulsante "Riprova" di agire su quelle pagine perché non sono ancora tecnicamente in stato di "errore".

Ecco il piano per risolvere il problema:

## 1. Correzione del Timeout in Gemini Service
*   **Interruzione Reale**: Modificare [geminiService.ts](file:///Users/lucasicignano/Lavoro%20temporaneo/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/src/services/geminiService.ts) affinché l'heartbeat non si limiti a inviare un messaggio di testo, ma sollevi un errore di timeout effettivo se Gemini non risponde entro 120 secondi.
*   **Abort Interno**: Utilizzare un `AbortController` interno per terminare la richiesta di streaming quando viene rilevato il timeout, garantendo che lo slot nella coda venga liberato.
*   **Messaggistica**: Cambiare il messaggio fuorviante "Riprovo..." dell'heartbeat in qualcosa di più accurato come "Timeout: Gemini non risponde. Innesco riprovo...".

## 2. Robustezza della Logica di Retry
*   **Inclusione Pagine "Stallate"**: Aggiornare la funzione `retryAllErrors` in [useProjectManagement.ts](file:///Users/lucasicignano/Lavoro%20temporaneo/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/src/hooks/useProjectManagement.ts) affinché consideri per il riprovo non solo le pagine con errore esplicito, ma anche quelle che risultano in caricamento da un tempo eccessivo (es. > 150 secondi).
*   **Pulizia Stato**: Assicurarsi che la pulizia dello stato durante il retry sia completa, includendo i log di Gemini e le traduzioni parziali.
*   **Sincronizzazione Ref**: Garantire che i `Ref` (usati dalla logica di background) siano sincronizzati immediatamente con lo stato pulito per evitare race condition.

## 3. Miglioramento della Coda di Traduzione
*   **Logging**: Aggiungere log più dettagliati in [useTranslationQueue.ts](file:///Users/lucasicignano/Lavoro%20temporaneo/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/src/hooks/useTranslationQueue.ts) per monitorare lo stato di `activeTranslationsRef` e identificare se la coda si blocca a causa di task mai terminati.

Desideri che proceda con l'implementazione di queste modifiche?
