## Diagnosi (perché succede)
- La verifica qualità, quando trova `SEVERE`, mette in coda una ritraduzione e poi fa `return` senza mai “finalizzare” lo stato: la pagina resta `state: 'verifying'`, quindi UI mostra “Verifica in corso…” anche se il report (annotazioni) è già arrivato.
- La ritraduzione automatica può non partire se il verifier non fornisce `retryHint`: in quel caso `extraInstruction` è `undefined` e la pipeline di traduzione salta la pagina perché è già tradotta (`shouldSkipTranslation(...) && !extraInstruction`). Risultato: niente retry + verifica che rimane “in corso”.

## Modifiche previste
### 1) Rendere il retry sempre effettivo
- In `useAppQuality.verifyAndMaybeFixTranslation` quando `severity === 'severe'` e scatta l’auto-retry:
  - Generare un `extraInstruction` di fallback quando `report.retryHint` è vuoto/null.
  - Il fallback includerà regole esplicite anti-omissione (non saltare titoli/sezioni/elenchi/tabelle/equazioni; se illeggibile usare `[ILLEGIBILE]`; mantenere numerazione e heading).
  - Se disponibili, includere sinteticamente le parti “mancanti” usando `report.evidence`/annotazioni (limitando lunghezza).

### 2) Sbloccare lo stato “Verifica in corso…”
- Nello stesso ramo (auto-retry), prima del `return`:
  - Aggiornare `verificationMap[page]` a `state: 'verified'` con `severity: 'severe'` e una `summary` che dica chiaramente “Ritraduzione automatica in coda (tentativo X/Y)”.
  - Salvare anche il report (opzionale ma consigliato) in `updateLibrary` come stato intermedio, così non si perde l’evidenza se l’app viene chiusa.

### 3) Migliorare l’affidabilità di `retryHint` lato verifier
- In `getVerifyQualitySystemPrompt` rafforzare le istruzioni: se `severity` è `severe`, `retryHint` deve essere una stringa non vuota con istruzioni pratiche e specifiche (soprattutto su omissioni di sezioni/titoli/metriche).

## Verifica (come controllo che è risolto)
- Riprodurre lo scenario: pagina con omissioni → verifica `SEVERE` → auto-retry.
- Atteso:
  - La UI non resta più su “Verifica in corso…” dopo che la verifica ha risposto.
  - La ritraduzione parte sempre (anche se il modello di verifica non fornisce `retryHint`).
  - Dopo la nuova traduzione, parte una nuova verifica automatica e lo stato si aggiorna correttamente.

## File coinvolti
- src/hooks/useAppQuality.ts
- src/services/prompts.ts
- (eventuale) src/services/geminiService.ts e/o openaiService.ts solo se serve normalizzare ulteriormente `retryHint`