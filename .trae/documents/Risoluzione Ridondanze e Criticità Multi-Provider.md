Ho analizzato il codice e ho riscontrato diverse ridondanze e alcune criticità che potrebbero influire sulla manutenibilità e sul corretto funzionamento del sistema (specialmente per quanto riguarda il supporto OpenAI).

### **Criticità Riscontrate**
1.  **Bug Logico in `useAppQuality.ts`**: La logica di verifica qualità controlla esclusivamente la presenza della chiave API di Gemini, ignorando OpenAI anche se selezionato come provider. Questo impedisce di usare OpenAI per la revisione.
2.  **Dipendenza Hardcoded da Gemini**: In `useProjectManagement.ts`, l'estrazione dei metadati PDF (Anno/Autore/Titolo) è vincolata a Gemini, ignorando la configurazione dell'utente.
3.  **Gestione Errori Debole**: La funzione `extractPdfMetadata` restituisce un oggetto vuoto in caso di errore dell'AI, il che può causare crash a valle (es. chiamate a `.trim()` su valori indefiniti). Inoltre, non gestisce correttamente l'annullamento della richiesta (`AbortSignal`).

### **Ridondanze Riscontrate**
1.  **Duplicazione dei Prompt**: `geminiService.ts` e `openaiService.ts` contengono prompt di sistema e istruzioni quasi identici.
2.  **Duplicazione Logica negli Hook**: `useProjectManagement.ts` contiene due funzioni di rinomina (`scanAndRenameOldFiles` e `scanAndRenameAllFiles`) che sono identiche al 95%.
3.  **Logica di Connessione e Qualità**: I servizi Gemini e OpenAI implementano separatamente logiche di test e revisione molto simili.

---

### **Piano di Intervento**

#### **1. Centralizzazione e Pulizia Servizi**
- **Creare `src/services/prompts.ts`**: Centralizzare tutti i prompt (traduzione, revisione, metadati) in un unico file per facilitarne la manutenzione.
- **Rifattorizzare `geminiService.ts` e `openaiService.ts`**: Utilizzare i prompt centralizzati e migliorare la gestione degli errori e del segnale di interruzione in `extractPdfMetadata`.

#### **2. Potenziamento di `aiService.ts` (Orchestratore)**
- Aggiungere funzioni generiche `verifyTranslationQuality` e `extractMetadata` che instradino correttamente la richiesta al provider attivo (Gemini o OpenAI), eliminando la logica specifica dagli hook.

#### **3. Refactoring degli Hooks**
- **`useAppQuality.ts`**: Sostituire i controlli hardcoded su Gemini con chiamate al nuovo orchestratore `aiService`, garantendo il supporto completo a OpenAI.
- **`useProjectManagement.ts`**: Unificare le funzioni di rinomina in un unico helper interno più robusto e configurabile.
- **`useAppTranslation.ts`**: Rinominare riferimenti specifici (es. `geminiLogs` -> `aiLogs`) per una maggiore coerenza multiprovider.

Ti sembra un piano corretto per procedere?