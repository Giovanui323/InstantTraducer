## Obiettivo
- Rendere automatica la verifica della chiave API di Gemini e bloccare le funzioni LLM finché la chiave non è valida.
- Mantenere automatica la verifica di qualità delle traduzioni (già presente) e migliorarne la resilienza.

## Stato attuale
- La chiave è gestita in UI via localStorage e impostata in [useAiSettings.ts](file:///Users/lucasicignano/Desktop/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/src/hooks/useAiSettings.ts) e [SettingsModal.tsx](file:///Users/lucasicignano/Desktop/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/components/SettingsModal.tsx). Le chiamate LLM passano la chiave da [aiService.ts](file:///Users/lucasicignano/Desktop/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/services/aiService.ts).
- È disponibile un helper per testare la connessione: [testGeminiConnection](file:///Users/lucasicignano/Desktop/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/services/geminiService.ts#L522-L529).
- La verifica qualità è già automatica dopo ogni traduzione, con auto‑retry sui casi severi: vedi [App.tsx:L1633-L1642](file:///Users/lucasicignano/Desktop/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/App.tsx#L1633-L1642) e flusso in [App.tsx:L975-L1167](file:///Users/lucasicignano/Desktop/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/App.tsx#L975-L1167).

## Interventi UI e flusso
- Avvio app: eseguire preflight automatico della chiave.
  - Se assente o placeholder, mostrare banner “Chiave Gemini mancante/errata” e aprire Settings.
  - Se presente, chiamare testGeminiConnection con timeout; salvare stato (valida/invalida) e timestamp.
- Salvataggio chiave: trigger automatico del test.
  - Bloccare il pulsante “Salva” fino a conclusione del test; feedback immediato (OK/errore specifico).
- Gating azioni LLM: disabilitare “Traduci”, “Verifica qualità”, “Estrai metadati” finché API key non è valida.
  - Badge di stato nell’header: “Gemini OK” (verde) / “Errore” (rosso).

## Logica servizi
- Aggiungere un preflight in [aiService.ts](file:///Users/lucasicignano/Desktop/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/services/aiService.ts):
  - Funzione `ensureGeminiReady()` che usa [testGeminiConnection](file:///Users/lucasicignano/Desktop/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/services/geminiService.ts#L522-L529) e aggiorna uno store `geminiStatus`.
  - Prima di `translateWithGemini`, `verifyTranslationQualityWithGemini`, `extractPdfMetadata`, richiedere `geminiStatus === 'valid'`.
- Resilienza runtime: su 401/403 dalle API, invalidare `geminiStatus`, riproporre Settings e ritentare il test.

## Test automatici
- Aggiungere test con runner leggero (Vitest) e mocking di `@google/genai`.
  - Test `ensureGeminiReady` (OK/errore, timeout, caching del risultato).
  - Test gating: azioni LLM disabilitate quando la chiave è invalida.
  - Test UI: SettingsModal esegue autoverifica su salvataggio e mostra feedback.
- Evitare chiamate di rete reali; usare mock del client Gemini.

## CI
- Aggiungere workflow GitHub Actions per eseguire i test su push/PR.
  - Node setup, install, `npm run test`.

## Modifiche ai file
- [App.tsx](file:///Users/lucasicignano/Desktop/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/App.tsx): preflight su mount, badge di stato e gating dei pulsanti.
- [components/SettingsModal.tsx](file:///Users/lucasicignano/Desktop/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/components/SettingsModal.tsx): autoverifica al salvataggio e blocco fino a esito.
- [services/aiService.ts](file:///Users/lucasicignano/Desktop/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/services/aiService.ts): `ensureGeminiReady` e controllo prima delle chiamate.
- [services/geminiService.ts](file:///Users/lucasicignano/Desktop/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/services/geminiService.ts): usare `testGeminiConnection` come fonte unica per la verifica.
- Test: nuova cartella `tests/` con unit test e mock.

## Sicurezza
- Non inserire chiavi reali nel repo; mantenere la chiave solo in localStorage/UI.
- Nessun logging del valore della chiave; log solo esiti e codici errore.

## Verifica esito
- All’avvio, la UI mostra subito lo stato “Gemini OK/Errore”.
- Tutte le azioni LLM restano disabilitate finché la chiave non è valida.
- I test automatici verificano i casi di successo/errore senza rete.

Confermi che procediamo con queste modifiche?