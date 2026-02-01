## Obiettivo
- Aggiungere la possibilità di scegliere un provider AI alternativo (OpenAI/ChatGPT) e configurarlo dalle Impostazioni, mantenendo Gemini come opzione.

## Stato Attuale (ricognizione)
- La traduzione pagina avviene renderizzando la pagina PDF in immagine e inviandola al modello (OCR+traduzione) in [App.tsx](file:///Users/lucasicignano/Desktop/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/App.tsx#L121-L188).
- Oggi l’app chiama direttamente Gemini via [translateWithGemini](file:///Users/lucasicignano/Desktop/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/services/geminiService.ts#L45-L98).
- Esiste già un client OpenAI in [openaiService.ts](file:///Users/lucasicignano/Desktop/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/services/openaiService.ts#L25-L66) ma non è collegato al flusso.
- Esiste un “router” [aiService.ts](file:///Users/lucasicignano/Desktop/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/services/aiService.ts#L5-L26) ma è fuori sync con la firma attuale di Gemini (manca apiKey, progress, ecc.).
- La UI Impostazioni è solo per Gemini in [SettingsModal.tsx](file:///Users/lucasicignano/Desktop/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/components/SettingsModal.tsx#L6-L107) e salva su localStorage.

## Modifiche Proposte (architettura)
1) **Introdurre un oggetto impostazioni AI unificato**
- In [types.ts](file:///Users/lucasicignano/Desktop/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/types.ts) aggiungere un tipo/interop `AISettings` con:
  - `provider: 'gemini' | 'openai'`
  - `gemini: { apiKey, model }`
  - `openai: { apiKey, model, reasoningEffort, verbosity }`

2) **Aggiornare il servizio di routing provider (aiService)**
- Riscrivere [aiService.ts](file:///Users/lucasicignano/Desktop/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/services/aiService.ts) per esporre una funzione unica `translatePage(settings, config, onProgress?)` che:
  - se `provider === 'gemini'` chiama `translateWithGemini(..., apiKey, onProgress)`
  - se `provider === 'openai'` chiama `translateWithOpenAI(...)` (progress non-streaming: opzionalmente scrive “chiamata in corso” una volta)

3) **Collegare il flusso di traduzione dell’UI al router**
- In [App.tsx](file:///Users/lucasicignano/Desktop/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/App.tsx#L121-L188) sostituire la chiamata diretta a Gemini con `translatePage(...)`.
- Rendere i testi UI dinamici (es. “Analisi e traduzione con …” in base al provider selezionato).

4) **Estendere il pannello Impostazioni**
- Aggiornare [SettingsModal.tsx](file:///Users/lucasicignano/Desktop/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/components/SettingsModal.tsx) per includere:
  - selettore provider (Gemini / OpenAI)
  - campi Gemini come oggi
  - campi OpenAI: API key + modello (string) + dropdown per reasoning effort e verbosity (con default sensati)
- Cambiare la firma `onSave` da `(apiKey, model)` a `(settings: AISettings)`.

5) **Persistenza impostazioni**
- In [App.tsx](file:///Users/lucasicignano/Desktop/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/App.tsx) caricare/salvare su localStorage:
  - provider selezionato
  - chiavi e opzioni Gemini/OpenAI
- Mantenere lo stesso approccio attuale: dati salvati localmente sul dispositivo.

## Correzioni Collaterali Necessarie
- Sistemare l’incoerenza nell’handler di salvataggio impostazioni (il componente passa `onSave={handleSaveSettings}` ma nel file c’è `handleSaveApiKey`): unificare con il nuovo `handleSaveSettings(settings)`.

## Verifica (dopo implementazione)
- Verificare build/TypeScript (assenza errori su tipi e props).
- Test manuale rapido:
  - seleziono Gemini → traduco una pagina
  - seleziono OpenAI → traduco una pagina
  - senza API key → errore chiaro e nessun crash

## Note di compatibilità
- OpenAI è integrata via `fetch` a `/v1/responses`; non richiede librerie nuove. Se vuoi “ChatGPT” come nome UI, lo mappo a provider OpenAI.
- Streaming progress: Gemini già lo supporta; per OpenAI resterà “non streaming” finché non aggiungiamo SSE/streaming.
