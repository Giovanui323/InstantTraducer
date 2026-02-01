## Diagnosi
- La pipeline non “ricostruisce” il layout del PDF: renderizza ogni pagina a immagine (pdf.js su canvas) e chiede al modello AI la traduzione.
- L’app supporta la resa a due colonne solo tramite un marcatore nel testo: `[[PAGE_SPLIT]]`.
- I prompt attuali non impongono al modello di emettere `[[PAGE_SPLIT]]` quando la pagina è a due colonne, quindi l’output arriva quasi sempre “linearizzato” e viene renderizzato/esportato in colonna singola.

## Modifiche ai prompt (traduzione)
- Aggiornare [prompts.ts](file:///Users/lucasicignano/Lavoro%20temporaneo/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/src/services/prompts.ts) in `getTranslateSystemPrompt` e/o `getTranslateUserInstruction` aggiungendo una regola esplicita:
  - Se la pagina nell’immagine è impaginata in 2 colonne, trascrivere/tradurre prima tutta la colonna sinistra, poi inserire su una riga a sé `[[PAGE_SPLIT]]`, poi tutta la colonna destra.
  - Mantenere l’ordine di lettura (alto→basso dentro ciascuna colonna), senza mischiare righe tra colonne.
  - Note a piè di pagina: continuare a riportarle dopo `---` come oggi.

## Modifiche ai prompt (verifica)
- Aggiornare [prompts.ts](file:///Users/lucasicignano/Lavoro%20temporaneo/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/src/services/prompts.ts) in `getVerifyQualitySystemPrompt` per far controllare anche la struttura a colonne:
  - Se l’immagine mostra 2 colonne e nella traduzione manca `[[PAGE_SPLIT]]` (o compare più di una volta, o l’ordine è invertito), classificare `severity: "severe"`.
  - Compilare `retryHint` con istruzioni operative per ritradurre rispettando “sinistra → `[[PAGE_SPLIT]]` → destra”.
- Questo si integra col flusso esistente di auto-retry (che già usa `retryHint`).

## Hardening del retry (opzionale ma consigliato)
- Rinforzare [useAppQuality.ts](file:///Users/lucasicignano/Lavoro%20temporaneo/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/src/hooks/useAppQuality.ts) in `buildRetryInstruction`/chiamante per preservare `[[PAGE_SPLIT]]` quando è già presente (evita regressioni durante ritraduzioni per altri motivi).

## Test automatici
- Aggiungere test Vitest per:
  - Presenza delle nuove regole nei prompt (traduzione/verifica) in [prompts.ts](file:///Users/lucasicignano/Lavoro%20temporaneo/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/src/services/prompts.ts).
  - Funzione `splitColumns` in [textUtils.ts](file:///Users/lucasicignano/Lavoro%20temporaneo/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/src/utils/textUtils.ts) (marker singolo, marker assente, marker duplicato) per garantire la resa a due colonne lato UI/export.

## Verifica manuale
- Tradurre una pagina campione a due colonne e confermare:
  - In lettura: due colonne affiancate (ReaderView/renderText).
  - In export PDF: layout a due colonne quando `[[PAGE_SPLIT]]` è presente.
  - In verifica qualità: la pagina viene marcata SEVERE se manca il marker su una pagina a due colonne, attivando il retry con hint corretto.