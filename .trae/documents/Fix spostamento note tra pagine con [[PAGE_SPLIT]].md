## Perché Succede
- Su scansioni “doppie” (sinistra+destra) l’output è un unico testo con `[[PAGE_SPLIT]]`.
- Il prompt attuale richiede di mettere le note “in fondo alla pagina dopo `---`” ([prompts.ts](file:///Users/lucasicignano/Lavoro%20temporaneo/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/src/services/prompts.ts#L24-L29)). In presenza di `[[PAGE_SPLIT]]` questa indicazione è ambigua: il modello tende a mettere tutte le note alla fine, cioè dopo la parte destra.

## Obiettivo (come richiesto)
- Traduzione e collocazione NOTE affidate SOLO all’AI.
- La verifica deve SOLO segnalare (non forzare retry “SEVERE”).

## Modifiche Proposte
1. Rendere il prompt di traduzione non ambiguo su `[[PAGE_SPLIT]]`
   - In [getTranslateSystemPrompt](file:///Users/lucasicignano/Lavoro%20temporaneo/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/src/services/prompts.ts#L7-L34) aggiungere regola esplicita:
     - Se usi `[[PAGE_SPLIT]]`, le note della parte SINISTRA devono stare prima del marker (dopo `---`), e le note della parte DESTRA dopo il marker (dopo `---`).
     - Vietare esplicitamente di accorpare tutte le note in fondo dopo la parte destra.
2. Aggiornare la verifica qualità per SEGNALARE il problema
   - In [getVerifyQualitySystemPrompt](file:///Users/lucasicignano/Lavoro%20temporaneo/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/src/services/prompts.ts#L57-L82) aggiungere un controllo: se `[[PAGE_SPLIT]]` è presente e le note della sinistra risultano dopo il marker, impostare `severity: "minor"` e inserire evidenze/annotazioni chiare (ma senza `retryHint` e senza richiedere ritraduzione).
3. Eliminare la ricollocazione note lato codice
   - Rimuovere l’uso di `normalizePageSplitFootnotes(...)` in [useAppTranslation.ts](file:///Users/lucasicignano/Lavoro%20temporaneo/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/src/hooks/useAppTranslation.ts#L389-L396) (o renderlo no-op), così la collocazione finale dipende solo dall’AI.

## Verifica Manuale
- Tradurre una pagina doppia con note e controllare che:
  - l’AI posizioni le note nel lato corretto rispetto a `[[PAGE_SPLIT]]`;
  - se sbaglia, la verifica segnali MINOR con evidenza/annotazioni utili (senza auto-retry).

## Risultato Atteso
- Molta più coerenza nella collocazione delle note su doppia pagina.
- Se capita un caso “strano”, il verificatore lo evidenzia senza bloccare il flusso.