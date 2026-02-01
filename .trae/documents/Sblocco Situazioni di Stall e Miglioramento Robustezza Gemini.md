Le modifiche proposte sono ottime e colpiscono esattamente il punto debole del sistema attuale: la discrepanza tra ciò che il monitoraggio (heartbeat) vede e ciò che la logica di controllo (la coda) effettivamente gestisce.

Ecco il piano dettagliato per l'implementazione:

### 1. Correzione del Timeout in Gemini Service
- **Abort Attivo**: In [geminiService.ts](file:///Users/lucasicignano/Lavoro%20temporaneo/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/src/services/geminiService.ts), implementerò un `AbortController` locale. Se l'heartbeat rileva un silenzio superiore a 120 secondi senza alcun dato ricevuto, forzerà l'abort della richiesta e solleverà un'eccezione esplicita. Questo garantirà che la richiesta non rimanga "appesa" indefinitamente.
- **Messaggio Chiaro**: Aggiornerò il log di progresso in "Timeout: Gemini non risponde dopo 120s. Innesco riprovo..." per dare feedback immediato all'utente.

### 2. Robustezza della Logica di Retry
- **Rilevamento Stall**: Modificherò [useProjectManagement.ts](file:///Users/lucasicignano/Lavoro%20temporaneo/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/src/hooks/useProjectManagement.ts) per ricevere `pageTraceRef`. La funzione `retryAllErrors` includerà ora le pagine "stallate" (in caricamento da oltre 150 secondi), permettendo al tasto "Riprova errori" di sbloccare anche quelle situazioni che non sono ancora tecnicamente errori ma sono chiaramente ferme.
- **Cleanup Profondo**: Assicurerò che il retry pulisca non solo la traduzione, ma anche i log di Gemini e le traduzioni parziali, riportando la pagina a uno stato "vergine" prima del nuovo tentativo.

### 3. Monitoraggio della Coda
- **Tracciabilità**: Aggiungerò log granulari in [useTranslationQueue.ts](file:///Users/lucasicignano/Lavoro%20temporaneo/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/src/hooks/useTranslationQueue.ts) per vedere in tempo reale quanti task sono attivi e quando vengono effettivamente rimossi dalla coda. Questo aiuterà a diagnosticare eventuali futuri blocchi della concorrenza.

### 4. Integrazione in App.tsx
- Passerò i riferimenti necessari (`pageTraceRef`) tra i vari hook per garantire che la logica di gestione progetto abbia tutte le informazioni temporali necessarie.

Cosa ne pensi? Procedo con l'applicazione di queste correzioni?