## Diagnosi
- In modalità due colonne (split) i due componenti [MarkdownText](file:///Users/lucasicignano/Lavoro%20temporaneo/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/src/components/ReaderView.tsx#L1056-L1093) vengono montati senza i flag degli strumenti (`isHighlightToolActive`, `isNoteToolActive`, `isEraserToolActive`) e senza `onNoteClick`.
- In [MarkdownText](file:///Users/lucasicignano/Lavoro%20temporaneo/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/src/components/MarkdownText.tsx#L28-L46) questi flag hanno default `false`, quindi la selezione non attiva né evidenziazioni né commenti (guardie in [MarkdownText.tsx](file:///Users/lucasicignano/Lavoro%20temporaneo/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/src/components/MarkdownText.tsx#L236-L293)).
- Nota UX: l’evidenziatore/commenti funzionano sul testo tradotto (HTML), non sul PDF “originale” che è un `<canvas>` e non è selezionabile come testo.

## Modifica prevista
- Aggiornare [ReaderView.tsx](file:///Users/lucasicignano/Lavoro%20temporaneo/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/src/components/ReaderView.tsx#L1056-L1093) nel ramo `isSplit` per passare a entrambi i `MarkdownText`:
  - `isHighlightToolActive={isHighlightToolActive}`
  - `isNoteToolActive={isNoteToolActive}`
  - `isEraserToolActive={isEraserToolActive}`
  - `onNoteClick={(id) => setViewingNoteId({ page: p, id })}`
- Allineare il comportamento del “Commento” tra split e non-split:
  - In split sostituire l’attuale `onAddNote={(start,end,text,content)=>onAddNote(...)}` con `onAddNote={(start,end,text)=>setNewNoteModal({ page: p, start, end, text })}` così si apre la stessa modal anche a due colonne.

## Verifica
- In modalità due colonne:
  - Attivo “Evidenziatore” → seleziono testo nella colonna tradotta → compare l’evidenziazione.
  - Attivo “Commento” → seleziono testo (o click su una parola) → si apre la modal e, salvando, compare l’icona nota.
  - Attivo “Gomma” → click su testo evidenziato o selezione su un range → l’evidenziazione viene rimossa.

## Risultato atteso
- Evidenziatore e Commento rispondono correttamente anche in modalità split, con UX coerente con la modalità a colonna singola.