L'utente segnala che la rinomina automatica del PDF (basata sui metadati estratti dall'AI) è incostante: a volte funziona correttamente (modificando il titolo), altre volte no.

Dopo l'analisi del codice, ho identificato le seguenti cause probabili:
1. **Prompt AI limitato**: Il prompt attuale non chiede esplicitamente di tradurre il titolo nella lingua di destinazione, né di essere persistente nel trovarne uno se non è ovvio.
2. **Sanificazione troppo aggressiva**: La funzione `sanitize` rimuove caratteri utili (come trattini o due punti) che potrebbero far parte di un titolo valido, e a volte svuota eccessivamente i campi.
3. **Condizioni di rinomina rigide**: Se l'AI restituisce "Unknown" o "Untitled", il processo viene interrotto silenziosamente.
4. **Logica duplicata**: La logica di sanificazione e rinomina è ripetuta in modo incoerente tra `App.tsx` e `useProjectManagement.ts`.

**Piano di intervento:**

1. **Miglioramento dell'estrazione (AI)**:
   - Aggiornerò `getMetadataExtractionPrompt` in [prompts.ts](file:///Users/lucasicignano/Lavoro%20temporaneo/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/src/services/prompts.ts) per accettare la lingua di destinazione.
   - Istruirò l'AI a tradurre il titolo se necessario e a cercare di dedurlo anche se non è esplicito, evitando "Untitled".
   - Aggiornerò i servizi Gemini e OpenAI per passare questa lingua.

2. **Centralizzazione e miglioramento della sanificazione**:
   - Creerò una funzione `sanitizeMetadataField` in [textUtils.ts](file:///Users/lucasicignano/Lavoro%20temporaneo/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/src/utils/textUtils.ts) che permetta caratteri sicuri per i nomi file ma non sia distruttiva.

3. **Ottimizzazione della logica di rinomina**:
   - In [App.tsx](file:///Users/lucasicignano/Lavoro%20temporaneo/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/src/App.tsx), passerò la lingua selezionata dall'utente durante l'upload per ottenere un titolo già localizzato.
   - Renderò la rinomina più flessibile (es. procedendo anche se l'autore è ignoto, se il titolo è presente).
   - Aggiungerò log più chiari per capire perché una rinomina viene eventualmente saltata.

4. **Allineamento della gestione progetti**:
   - Aggiornerò [useProjectManagement.ts](file:///Users/lucasicignano/Lavoro%20temporaneo/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/src/hooks/useProjectManagement.ts) per usare le stesse logiche di sanificazione e prompt migliorate.

Vuoi che proceda con queste modifiche?