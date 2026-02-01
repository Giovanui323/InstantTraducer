## Sintesi Migliorie Aggiuntive
- Abort e cleanup
  - Doppio controllo di abort da rimuovere in testGeminiConnection ([geminiService.ts](file:///Users/lucasicignano/Lavoro%20temporaneo/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/src/services/geminiService.ts#L380-L383)).
  - Allineare testOpenAIConnection per supportare AbortSignal come Gemini ([openaiService.ts](file:///Users/lucasicignano/Lavoro%20temporaneo/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/src/services/openaiService.ts#L230-L268)).
- PageNumber hardcoded in OpenAI
  - Aggiungere `pageNumber` a `translateWithOpenAI`, usare `getTranslateUserInstruction(pageNumber, ...)` e messaggio “Pagina ${pageNumber}” invece di "pagina corrente" ([openaiService.ts](file:///Users/lucasicignano/Lavoro%20temporaneo/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/src/services/openaiService.ts#L63-L71), [openaiService.ts](file:///Users/lucasicignano/Lavoro%20temporaneo/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/src/services/openaiService.ts#L127-L131)).
  - Aggiornare la chiamata in `aiService.translatePage` per passare `config.pageNumber` a OpenAI ([aiService.ts](file:///Users/lucasicignano/Lavoro%20temporaneo/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/src/services/aiService.ts#L117-L133)).
- Assunzioni sul provider nei hook
  - In `verifySingleTranslatedPage`, usare `checkApiConfiguration(aiSettings)` invece di `aiSettings.gemini.apiKey` ([useAppQuality.ts](file:///Users/lucasicignano/Lavoro%20temporaneo/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/src/hooks/useAppQuality.ts#L270-L287)).
- Streaming/heartbeat
  - Confermare cleanup già presente; nessuna modifica necessaria, solo revisione (link: [geminiService.ts](file:///Users/lucasicignano/Lavoro%20temporaneo/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/src/services/geminiService.ts#L98-L121), [geminiService.ts](file:///Users/lucasicignano/Lavoro%20temporaneo/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/src/services/geminiService.ts#L256-L259)).
- Parsing JSON
  - Migliorare `safeParseJsonObject` con una verifica semplice di schema (chiavi attese) e fallback più robusto; mantenere prompt JSON per Gemini e `response_format` per OpenAI ([json.ts](file:///Users/lucasicignano/Lavoro%20temporaneo/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/src/utils/json.ts#L1-L13)).
- Duplicazioni di codice
  - Unificare la logica di render PDF→canvas in un util condiviso riusato da App.tsx e AppOffline.tsx ([App.tsx](file:///Users/lucasicignano/Lavoro%20temporaneo/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/src/App.tsx#L713-L767), [AppOffline.tsx](file:///Users/lucasicignano/Lavoro%20temporaneo/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/src/AppOffline.tsx#L356-L408)).
  - Valutare un adapter unico per “verifica qualità” e “estrazione metadati” che astragga provider (Gemini/OpenAI) riducendo duplicazioni ([geminiService.ts](file:///Users/lucasicignano/Lavoro%20temporaneo/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/src/services/geminiService.ts#L270-L372), [openaiService.ts](file:///Users/lucasicignano/Lavoro%20temporaneo/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/src/services/openaiService.ts#L157-L228); [geminiService.ts](file:///Users/lucasicignano/Lavoro%20temporaneo/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/src/services/geminiService.ts#L417-L463), [openaiService.ts](file:///Users/lucasicignano/Lavoro%20temporaneo/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/src/services/openaiService.ts#L270-L325)).
- pdfjs-dist e asset path
  - Sostituire l’uso di `window.pdfjsLib` con import esplicito e validare i path per `cMapUrl` e `standardFontDataUrl` in build ([useProjectManagement.ts](file:///Users/lucasicignano/Lavoro%20temporaneo/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/src/hooks/useProjectManagement.ts#L93-L99), [pdfUtils.ts](file:///Users/lucasicignano/Lavoro%20temporaneo/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/src/utils/pdfUtils.ts#L12-L17)).
- File ops/IPC
  - Aggiungere try/catch con messaggio chiaro e fallback su JSON parse lato main per robustezza (salvataggi libreria) ([electron/main.js](file:///Users/lucasicignano/Lavoro%20temporaneo/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/electron/main.js#L291-L305), [electron/main.js](file:///Users/lucasicignano/Lavoro%20temporaneo/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/electron/main.js#L342-L358)).

## Piano di Intervento (ordine esecuzione)
1) Fix critici
- Correggere `translateWithOpenAI` (firma + uso pageNumber) e aggiornare la chiamata in `aiService.translatePage`.
- Rimuovere il check abort duplicato in `testGeminiConnection`.
- Sistemare `verifySingleTranslatedPage` per usare `checkApiConfiguration`.
- Allineare `testOpenAIConnection` al supporto AbortSignal.
2) Migliorie di robustezza
- Potenziare `safeParseJsonObject` con una validazione minima di schema.
- Aggiungere try/catch a parse JSON in Electron main.
3) Riduzione ridondanze (facoltativo in pass successivi)
- Estrarre util di render PDF→canvas.
- Introdurre un adapter per verifica/metadati cross-provider.

## Verifica
- Eseguire `vitest run` e verifiche manuali su traduzione OpenAI per pagina diversa da 1.
- Testare annullamento richieste in entrambe le connessioni.

Confermi di procedere con questi interventi (partendo dai fix critici)?