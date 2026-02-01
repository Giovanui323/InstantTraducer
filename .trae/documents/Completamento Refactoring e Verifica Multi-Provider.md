Hai ragione, guardando meglio ho trovato molti altri "residui" e incongruenze che limitano il pieno supporto multi-provider e creano ridondanza nel codice.

### **Criticità e Ridondanze Identificate**
1.  **Hardcoded Gemini Key**: In `useAppQuality.ts` e `useProjectManagement.ts`, ci sono ancora molti punti dove si controlla solo `aiSettings.gemini.apiKey`, ignorando OpenAI anche se selezionato.
2.  **Duplicazione in `useProjectManagement.ts`**: Le funzioni `scanAndRenameOldFiles` e `scanAndRenameAllFiles` sono identiche al 95%. Possono essere unificate in un unico helper robusto.
3.  **Incongruenze di Naming**: La variabile `geminiLogs` è usata in tutto il progetto (da `App.tsx` a `ReaderView.tsx`), il che è fuorviante quando si usa OpenAI.
4.  **Mancanza di Astrazione per i Metadati**: L'estrazione dei metadati PDF (Anno/Autore/Titolo) è attualmente legata solo a Gemini. Serve una versione per OpenAI e un'astrazione in `aiService.ts`.
5.  **Linter Errors**: Ci sono alcuni import mancanti o inutilizzati nei servizi AI a seguito delle ultime modifiche.

---

### **Nuovo Piano d'Azione Raffinato**

#### **1. Centralizzazione Orchestratore (`src/services/aiService.ts`)**
- Implementare funzioni generiche `verifyTranslationQuality` e `extractPdfMetadata`.
- Queste funzioni gestiranno il routing tra Gemini e OpenAI in base al provider attivo.

#### **2. Allineamento OpenAI (`src/services/openaiService.ts`)**
- Migrare completamente all'uso di `src/services/prompts.ts`.
- Implementare `extractPdfMetadataWithOpenAI` per supportare la rinomina automatica dei file anche con questo provider.

#### **3. Refactoring Hooks e UI (Multi-Provider)**
- **`useAppQuality.ts`**: Sostituire i controlli specifici di Gemini con una logica basata sul provider attivo e usare l'orchestratore generico.
- **`useProjectManagement.ts`**: 
    - Unificare le funzioni di rinomina.
    - Usare l'estrazione metadati multi-provider.
    - Rimuovere i riferimenti hardcoded a Gemini.
- **Naming globale**: Rinominare `geminiLogs` in `translationLogs` in `App.tsx`, `ReaderView.tsx` e in tutti gli hook correlati per una maggiore coerenza.

#### **4. Pulizia e Verifica**
- Risolvere i linter errors in `geminiService.ts`.
- Assicurarsi che l'`AbortSignal` sia passato correttamente a tutte le chiamate AI per permettere l'annullamento delle richieste.

Ti sembra che questo copra tutti i punti che avevi notato nelle tue modifiche?