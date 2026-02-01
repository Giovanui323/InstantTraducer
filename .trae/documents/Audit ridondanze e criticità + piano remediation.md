## Stato dell’audit (lettura)
Ho analizzato in dettaglio i file core (servizi AI, utilità async/rendering, Electron main/preload, config) e ho trovato alcune criticità vere (bug logici/runtime) + ridondanze che possono creare drift.

## Criticità e ridondanze per file (con riferimenti)
- [aiService.ts](file:///Users/lucasicignano/Lavoro%20temporaneo/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/src/services/aiService.ts)
  - Cache readiness non include l’API key: la chiave della cache è `${provider}:${model}` ([aiService.ts:L21-L26](file:///Users/lucasicignano/Lavoro%20temporaneo/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/src/services/aiService.ts#L21-L26)). Se l’utente cambia API key, per ~5 minuti puoi considerare “ready” una key diversa (bug logico, non security).
  - Cache negativa non ha TTL: se `valid=false` non c’è early-return, quindi può martellare `test*Connection` ad ogni chiamata quando la key è errata.
  - Parametro `translationModelOverride?: GeminiModel` esiste solo per Gemini; per OpenAI non c’è override.
  - `useSearch` viene sempre passato `true` ma in Gemini è ignorato (ridondanza a cascata).

- [aiServiceOffline.ts](file:///Users/lucasicignano/Lavoro%20temporaneo/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/src/services/aiServiceOffline.ts)
  - Implementazione stub: `ensure*Ready` sempre `false`, `translatePage` lancia sempre errore (coerente con offline, ok).

- [async.ts](file:///Users/lucasicignano/Lavoro%20temporaneo/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/src/utils/async.ts)
  - Semantica `retry(retries)` ambigua: il loop è `for (i < retries)` ([async.ts:L27-L41](file:///Users/lucasicignano/Lavoro%20temporaneo/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/src/utils/async.ts#L27-L41)). Con `retries=1` fai 1 solo tentativo (nessun retry), ma altrove i log parlano di “/2”.
  - Firma `onRetry` è `(error, attempt)` ([async.ts:L23-L24](file:///Users/lucasicignano/Lavoro%20temporaneo/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/src/utils/async.ts#L23-L24)). In OpenAI viene usata invertita (vedi sotto) → log/progress fuorvianti.

- [openaiService.ts](file:///Users/lucasicignano/Lavoro%20temporaneo/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/src/services/openaiService.ts)
  - Retry “finto”: `retry(..., 1, ...)` ([openaiService.ts:L159-L167](file:///Users/lucasicignano/Lavoro%20temporaneo/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/src/services/openaiService.ts#L159-L167)) non riprova mai.
  - `onRetry` passato come `(attempt, err)` ma `retry` invoca `(err, attempt)` → `attempt` diventa un oggetto errore e viceversa (log tipo `tentativo [object Object]/2`).
  - Parsing JSON fragile nella verifica qualità: `JSON.parse(rawJson)` senza try/catch ([openaiService.ts:L253-L263](file:///Users/lucasicignano/Lavoro%20temporaneo/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/src/services/openaiService.ts#L253-L263)) può crashare se il modello non produce JSON valido nonostante `response_format`.

- [geminiService.ts](file:///Users/lucasicignano/Lavoro%20temporaneo/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/src/services/geminiService.ts)
  - Ridondanza/drift: importa `getTranslateSystemPrompt/getTranslateUserInstruction/...` ma usa prompt duplicati locali (`TRANSLATE_PROMPT` + `userInstruction`) ([geminiService.ts:L12-L18](file:///Users/lucasicignano/Lavoro%20temporaneo/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/src/services/geminiService.ts#L12-L18), [geminiService.ts:L55-L106](file:///Users/lucasicignano/Lavoro%20temporaneo/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/src/services/geminiService.ts#L55-L106), [geminiService.ts:L204-L225](file:///Users/lucasicignano/Lavoro%20temporaneo/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/src/services/geminiService.ts#L204-L225)).
  - Retry “finto” come OpenAI: `retry(..., 1, ...)` ([geminiService.ts:L333-L346](file:///Users/lucasicignano/Lavoro%20temporaneo/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/src/services/geminiService.ts#L333-L346)). Qui la firma `onRetry(err, attempt)` è corretta, ma non avviene alcun secondo tentativo.
  - Parametro `useSearch` è attualmente inutilizzato (ridondanza API) ([geminiService.ts:L129-L145](file:///Users/lucasicignano/Lavoro%20temporaneo/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/src/services/geminiService.ts#L129-L145)).

- [prompts.ts](file:///Users/lucasicignano/Lavoro%20temporaneo/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/src/services/prompts.ts)
  - Contiene prompt “canonici”, ma oggi non sono realmente la source-of-truth perché Gemini usa stringhe duplicate nel servizio.

- [textClean.ts](file:///Users/lucasicignano/Lavoro%20temporaneo/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/src/services/textClean.ts)
  - Regex aggressive: rimuove righe che iniziano con “Ecco/Qui di seguito/Certamente…” ([textClean.ts:L4-L6](file:///Users/lucasicignano/Lavoro%20temporaneo/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/src/services/textClean.ts#L4-L6)). Rischio: se il testo reale del libro inizia così, lo tronchi.

- [SimplifiedReader.tsx](file:///Users/lucasicignano/Lavoro%20temporaneo/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/src/components/SimplifiedReader.tsx)
  - Usa `dangerouslySetInnerHTML` ([SimplifiedReader.tsx:L28-L38](file:///Users/lucasicignano/Lavoro%20temporaneo/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/src/components/SimplifiedReader.tsx#L28-L38)). In pratica è OK perché l’HTML viene generato da funzioni che fanno escaping, ma va considerato “punto sensibile”.

- [renderText.ts](file:///Users/lucasicignano/Lavoro%20temporaneo/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/src/utils/renderText.ts)
  - Escape HTML fatto correttamente per testo e note (bene).
  - Possibile CSS injection: `h.color` finisce in `style="background:${h.color}"` senza whitelist ([renderText.ts:L46-L49](file:///Users/lucasicignano/Lavoro%20temporaneo/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/src/utils/renderText.ts#L46-L49)). Se `h.color` è controllabile, conviene restringere a hex/rgba.
  - Variabile inutilizzata: `rightOffset` calcolato ma mai usato ([renderText.ts:L216-L218](file:///Users/lucasicignano/Lavoro%20temporaneo/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/src/utils/renderText.ts#L216-L218)). Indizio forte che l’offset per highlight sulla pagina destra non è gestito come previsto.

- [MarkdownText.tsx](file:///Users/lucasicignano/Lavoro%20temporaneo/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/src/components/MarkdownText.tsx)
  - Possibile bug footnotes: `isFootnoteMarkerContext` termina con `return false` ([MarkdownText.tsx:L430-L445](file:///Users/lucasicignano/Lavoro%20temporaneo/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/src/components/MarkdownText.tsx#L430-L445)), quindi accetta quasi solo casi speciali e spesso non parserà note numerate.
  - Possibile bug offset evidenziazioni: in `renderPart`, nel caso “normale” l’offset passato non tiene conto del progresso dentro i “parts” (rischio: highlight disallineati dopo il primo segmento).

- [electron/main.js](file:///Users/lucasicignano/Lavoro%20temporaneo/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/electron/main.js)
  - Path traversal check fragile: `absPath.startsWith(assetsDir)` ([main.js:L289-L299](file:///Users/lucasicignano/Lavoro%20temporaneo/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/electron/main.js#L289-L299)) può dare falsi positivi (es. `/a/b_evil/...`). Meglio `path.relative` o aggiungere `path.sep`.
  - IPC `read-pdf-file` legge qualunque path che il renderer passa ([main.js:L892-L906](file:///Users/lucasicignano/Lavoro%20temporaneo/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/electron/main.js#L892-L906)). Se il renderer fosse compromesso, è una primitive di lettura file.

- [electron/preload.cjs](file:///Users/lucasicignano/Lavoro%20temporaneo/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/electron/preload.cjs)
  - Espone direttamente `readPdfFile(filePath)` al renderer ([preload.cjs:L5-L10](file:///Users/lucasicignano/Lavoro%20temporaneo/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/electron/preload.cjs#L5-L10)). Da valutare con hardening IPC.

- [package.json](file:///Users/lucasicignano/Lavoro%20temporaneo/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/package.json)
  - Dev con `--no-sandbox` ([package.json:L13-L16](file:///Users/lucasicignano/Lavoro%20temporaneo/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/package.json#L13-L16)); build Mac con `hardenedRuntime: false` ([package.json:L41-L51](file:///Users/lucasicignano/Lavoro%20temporaneo/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/package.json#L41-L51)). Non è “errore” ma è una scelta di sicurezza importante.

- [tsconfig.json](file:///Users/lucasicignano/Lavoro%20temporaneo/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/tsconfig.json)
  - `strict` non abilitato ([tsconfig.json:L2-L28](file:///Users/lucasicignano/Lavoro%20temporaneo/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/tsconfig.json#L2-L28)) → bug di firma (tipo `onRetry`) passano più facilmente.

- [gitignore](file:///Users/lucasicignano/Lavoro%20temporaneo/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/.gitignore)
  - Non ignora `.local-userdata/` (directory molto grande/rumorosa). `*.local` copre `.env.local`, ma non questa cartella.

## Piano di intervento (quando esci dalla plan mode)
### 1) Correggere bug critici di retry e parsing
- Rendere chiara la semantica di `retry`: rinominarlo a `retryAttempts(maxAttempts)` oppure cambiare implementazione perché `retries=1` significhi “1 retry” (2 tentativi totali).
- Uniformare la firma `onRetry` e correggere l’uso in OpenAI.
- Rendere robusto il parsing JSON in OpenAI verifier (try/catch + fallback tipo `safeParseJsonObject` come in Gemini).
- Aggiungere `shouldRetry` per evitare retry su `AbortError` anche in OpenAI.

### 2) Rimuovere ridondanze prompt e parametri inutilizzati
- Far diventare [prompts.ts](file:///Users/lucasicignano/Lavoro%20temporaneo/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/src/services/prompts.ts) la source-of-truth e rimuovere/accorpare `TRANSLATE_PROMPT` + `userInstruction` duplicati in Gemini.
- Eliminare o implementare `useSearch` (oggi non fa nulla).

### 3) Hardening Electron (security)
- Fix robusto di `safeJoinAssets` usando `path.relative()` e check `..`/assoluti.
- Limitare `read-pdf-file`: accettare solo path ottenuti da dialog Electron o solo dentro una directory allowlist (es. assets progetto) + validare estensione `.pdf`.
- Opzionale: ridurre API esposte dal preload o introdurre token di sessione/controllo origin.

### 4) Hardening rendering HTML
- In [renderText.ts](file:///Users/lucasicignano/Lavoro%20temporaneo/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/src/utils/renderText.ts) fare whitelist dei colori highlight (hex/rgba) e correggere la logica offset pagina destra (attualmente `rightOffset` è calcolato ma non usato).
- In [MarkdownText.tsx](file:///Users/lucasicignano/Lavoro%20temporaneo/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/src/components/MarkdownText.tsx) sistemare parser footnotes e offset per highlights/notes.

### 5) Repo hygiene e typing incrementale
- Aggiungere `.local-userdata/` a gitignore.
- Attivare TypeScript strict in modo incrementale (almeno `strictNullChecks` e `noImplicitAny`) per prevenire regressioni.

### 6) Verifica
- Aggiornare/aggiungere unit test (Vitest) per:
  - semantica `retry`
  - parsing JSON verifier OpenAI
  - `safeJoinAssets` path traversal
- Eseguire suite test esistente e smoke test flussi di traduzione.

Se confermi questo piano, passo a implementare i fix in repo e a verificare con test.