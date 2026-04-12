## Diagnosi (basata sul codice attuale)
- La ritraduzione automatica su report "SEVERE" è gestita in [useAppQuality.ts](file:///Users/lucasicignano/Lavoro%20temporaneo/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/src/hooks/useAppQuality.ts#L221-L263): costruisce un’istruzione di retry ([buildRetryInstruction](file:///Users/lucasicignano/Lavoro%20temporaneo/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/src/services/prompts.ts#L129-L173)) e rimette la pagina in coda con `force:true`.
- Oggi però **il modello di traduzione NON viene mai cambiato durante i retry**: arriva solo `extraInstruction`. Il backend supporta già `translationModelOverride` in [aiService.translatePage](file:///Users/lucasicignano/Lavoro%20temporaneo/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/src/services/aiService.ts#L66-L130), ma non viene propagato da queue/executor.
- La conseguenza è che, se stai usando `gemini-3-flash-preview`, anche la correzione continua con flash e può reiterare omissioni su layout complessi.

## Vincolo aggiuntivo: “Pro può finire i crediti”
- La parte positiva: **il client Gemini ha già una catena di fallback + cooldown**. In caso di quota/hard limit/timeout, [geminiService.ts](file:///Users/lucasicignano/Lavoro%20temporaneo/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/src/services/geminiService.ts#L614-L659) passa automaticamente al modello successivo (es. 3 Pro → 2.5 Pro → 3 Flash → 2.5 Flash) e mette il modello in cooldown.
- Quindi “Forza Pro” deve essere implementato come: **prova Pro come prima scelta**, ma **lascia attivo il fallback automatico** per non bloccare l’utente quando i crediti Pro sono esauriti.

## Obiettivo
- Rendere il recovery deterministico: niente retry “a vuoto” sullo stesso modello quando la QC segnala omissioni.
- Dare all’utente un comando esplicito “Forza Pro” e farlo usare anche in automatico sui SEVERE.
- Rendere trasparente quale modello è stato realmente usato (Pro o fallback) quando Pro è in quota/cooldown.

## Modifiche principali (implementazione)
1. **Propagare un override di modello lungo tutta la pipeline (UI → queue → executor → aiService)**
   - Estendere le opzioni di `enqueueTranslation` in [useTranslationQueue.ts](file:///Users/lucasicignano/Lavoro%20temporaneo/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/src/hooks/useTranslationQueue.ts#L384-L455) per includere `translationModelOverride?: GeminiModel` (in alternativa un boolean `preferPro`).
   - Far arrivare questo campo a [TranslationExecutor.ts](file:///Users/lucasicignano/Lavoro%20temporaneo/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/src/services/translation/TranslationExecutor.ts#L386-L406) e passarlo a [translatePage](file:///Users/lucasicignano/Lavoro%20temporaneo/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/src/services/aiService.ts#L66-L130).

2. **Azione esplicita in UI: “Forza traduzione con Modello Pro (se disponibile)”**
   - Nella modale “Dubbi & verifica” (sezione SEVERE) in [ReaderView.tsx](file:///Users/lucasicignano/Lavoro%20temporaneo/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/src/components/ReaderView.tsx#L445-L466), aggiungere un secondo bottone accanto a “Rifai con suggerimenti” che accoda la stessa pagina con:
     - `extraInstruction` (come oggi)
     - `translationModelOverride = GEMINI_TRANSLATION_MODEL`.
   - Etichetta chiara: “Forza con Pro (se disponibile)” per riflettere che, se Pro è in quota/cooldown, scatterà il fallback.

3. **Escalation automatica su SEVERE (senza loop)**
   - In [useAppQuality.ts](file:///Users/lucasicignano/Lavoro%20temporaneo/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/src/hooks/useAppQuality.ts#L221-L263), quando si accoda la ritraduzione automatica perché `severity === 'severe'`:
     - se il provider è Gemini e il modello corrente è un flash, accodare il retry con `translationModelOverride = GEMINI_TRANSLATION_MODEL`.
   - Mantenere invariato `maxAutoRetries` per prevenire cicli.

4. **Gestione “crediti finiti” (quota/hard limit) e trasparenza del modello usato**
   - Non aggiungere nuovi retry: affidarsi al fallback interno già presente in [geminiService.ts](file:///Users/lucasicignano/Lavoro%20temporaneo/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/src/services/geminiService.ts#L614-L659).
   - Rendere accurati i metadati: estendere `TranslationResult` per includere `modelUsed` e salvare quello in `translationsMeta` (oggi usa `aiSettings.gemini.model`, che diventerebbe fuorviante quando Pro fallbacka).
   - In caso di fallback, l’utente vedrà anche i messaggi di progress già esistenti (“Quota… Provo con …”).

5. **Hardening leggero del prompt di retry**
   - Rafforzare [buildRetryInstruction](file:///Users/lucasicignano/Lavoro%20temporaneo/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/src/services/prompts.ts#L129-L173) con vincoli mirati anti-omissione (due colonne, note, “non fermarti prima dell’ultima riga visibile”).

## Verifica
- Caso 1: fast mode attivo → pagina SEVERE → auto-retry deve partire con Pro (e se Pro è in quota deve ripiegare su fallback senza crash).
- Caso 2: click “Forza con Pro” → la pagina viene ritradotta, e `translationsMeta.model` mostra il modello realmente usato (Pro o fallback).
- Controllo: nessun retry infinito; `maxAutoRetries` resta l’unico driver.

## Estensione opzionale (se ancora ci sono omissioni)
- Recovery “chunked/2 colonne”: tradurre crop sinistro e destro separatamente e comporre con `[[PAGE_SPLIT]]`, attivabile solo se la pagina resta SEVERE anche dopo escalation.