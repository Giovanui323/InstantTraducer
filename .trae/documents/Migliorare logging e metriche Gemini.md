## Stato Attuale
- Il messaggio “Prima risposta ricevuta dopo 4s” è generato nello streaming di Gemini e misura il tempo dal momento in cui parte la richiesta allo *stream* fino al primo chunk ([geminiService.ts:L120-L180](file:///Users/lucasicignano/Lavoro%20temporaneo/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/src/services/geminiService.ts#L120-L180)). 4s è plausibile/“ok” per modelli Pro + thinking HIGH.
- Il “+3667ms” che vedi su “Selezionato provider Gemini …” arriva prima dell’invio vero e proprio: è il tempo speso in `ensureGeminiReady()` (test chiave API con chiamata reale) dentro [translatePage](file:///Users/lucasicignano/Lavoro%20temporaneo/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/src/services/aiService.ts#L56-L107). Al primo giro può costare qualche secondo; poi è cache TTL 5 minuti.
- Il trace in UI è già buono: traceId/seq/elapsed e messaggi progressivi vengono creati in [processPage](file:///Users/lucasicignano/Lavoro%20temporaneo/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/src/hooks/useAppTranslation.ts#L156-L200) e appesi in [appendPageConsole](file:///Users/lucasicignano/Lavoro%20temporaneo/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/src/App.tsx#L400-L418).

## Migliorie Proposte (senza cambiare UX)
1. Rendere esplicito nel log il costo della “verifica provider” (cache-hit vs chiamata reale) e quanto dura.
2. Unificare le metriche temporali: usare `performance.now()` anche in Gemini (oggi c’è mix `Date.now()`/`performance.now()`), così i tempi sono più coerenti.
3. Propagare `traceId` nei log strutturati del renderer/main (così correlazione UI ↔ file log è immediata).
4. Aggiungere 1–2 eventi progress più “diagnostici”:
   - “Avvio streaming/iteratore creato”
   - “TTFT/TTFB” più preciso (oggi è a secondi interi).

## Modifiche Tecniche
- [aiService.ts](file:///Users/lucasicignano/Lavoro%20temporaneo/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/src/services/aiService.ts):
  - Cambiare `ensureProviderReady/ensureGeminiReady` per restituire anche `fromCache`.
  - Loggare via `onProgress` una riga “Verifica API key… OK/KO (Xms, cache/test)”.
- [geminiService.ts](file:///Users/lucasicignano/Lavoro%20temporaneo/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/src/services/geminiService.ts):
  - Passare a `performance.now()` per requestStartedAt/firstChunkAt/lastChunkAt.
  - Rendere “Prima risposta ricevuta” in ms (o decimi) e includere `model`.
- [useAppTranslation.ts](file:///Users/lucasicignano/Lavoro%20temporaneo/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/src/hooks/useAppTranslation.ts):
  - Includere `traceId` nel callback progress (es. come meta `data`) così `appendPageConsole` può inoltrarlo al logger strutturato.

## Verifica
- Aggiornare/aggiungere test Vitest su `ensureGeminiReady` per coprire “cache hit” e “cache miss” + ritorno `fromCache` (estendendo [aiService.test.ts](file:///Users/lucasicignano/Lavoro%20temporaneo/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/tests/aiService.test.ts)).
- Eseguire suite test e verificare che i log mostrino:
  - durata verifica provider
  - TTFT in ms
  - correlazione traceId coerente tra UI e logger
