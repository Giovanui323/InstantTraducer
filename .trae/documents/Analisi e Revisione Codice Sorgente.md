# Piano di Revisione e Ottimizzazione del Codice

Ho analizzato in dettaglio la struttura del progetto e i singoli file. Di seguito riporto le criticità riscontrate e il piano d'azione per risolverle.

## Analisi delle Criticità Riscontrate

### 1. Servizi AI ([geminiService.ts](file:///Users/lucasicignano/Lavoro temporaneo/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/src/services/geminiService.ts))
- **Integrazione SDK non standard**: L'attuale utilizzo dell'SDK `@google/genai` è obsoleto o non standard (uso di `ai.models.generateContent` invece di `getGenerativeModel`).
- **Accesso ai dati potenzialmente errato**: L'accesso diretto a `result.text` potrebbe fallire; lo standard prevede `result.response.text()`.
- **Lacuna nel Contesto Legale**: La funzione di revisione della qualità (`verifyTranslationQualityWithGemini`) ignora l'impostazione `legalContext`, rendendo i controlli meno efficaci per documenti giuridici.

### 2. Tipi e Modelli ([types.ts](file:///Users/lucasicignano/Lavoro temporaneo/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/src/types.ts))
- **Nomenclatura Modelli**: Vengono usati nomi come `gemini-3-flash-preview` che non corrispondono ai modelli pubblici di Google (es. `gemini-1.5-flash`, `gemini-2.0-flash`).

### 3. Interfaccia e Persistenza ([SettingsModal.tsx](file:///Users/lucasicignano/Lavoro temporaneo/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/src/components/SettingsModal.tsx))
- **Gestione Salvataggio**: La logica di salvataggio in caso di errore del test di connessione è complessa. Sebbene `customProjectsPath` sembri preservato, la struttura del codice può indurre in errore durante future manutenzioni.

### 4. Coerenza Provider ([openaiService.ts](file:///Users/lucasicignano/Lavoro temporaneo/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/src/services/openaiService.ts))
- **Annotazioni Mancanti**: A differenza di Gemini, OpenAI non restituisce mai annotazioni, creando un'incoerenza nell'interfaccia `TranslationResult`.

---

## Technical Implementation Plan

### Fase 1: Rifattorizzazione Core AI
1.  **Aggiornamento Gemini SDK**: Modificare `geminiService.ts` per utilizzare `genAI.getGenerativeModel` e `result.response.text()`.
2.  **Integrazione legalContext**: Aggiornare `verifyTranslationQualityWithGemini` per includere istruzioni specifiche sul contesto giuridico nel prompt di revisione.
3.  **Ottimizzazione Prompt**: Rimuovere le ridondanze tra `TRANSLATE_PROMPT` e `userInstruction` in `geminiService.ts`.

### Fase 2: Allineamento Tipi e Provider
1.  **Aggiornamento Modelli**: Inserire in `types.ts` i modelli ufficiali (Gemini 1.5 e 2.0).
2.  **Uniformità OpenAI**: Assicurarsi che `openaiService.ts` gestisca correttamente il tipo di ritorno e preveda un placeholder per future annotazioni.

### Fase 3: Verifica e Test
1.  **Controllo Persistenza**: Verificare manualmente che il salvataggio in `SettingsModal.tsx` mantenga tutti i campi nel `localStorage`.
2.  **Test di Traduzione**: Eseguire una traduzione di prova con entrambi i provider per confermare la stabilità.

---

## Milestone
- **M1: AI Service Stability**: Risoluzione dei problemi di integrazione con gli SDK.
- **M2: Context Alignment**: Piena integrazione del `legalContext` in tutto il flusso di traduzione e revisione.
- **M3: Final Verification**: Conferma della corretta persistenza e funzionamento dell'interfaccia.

**Desideri che proceda con l'attuazione di questo piano?**