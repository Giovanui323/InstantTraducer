## Cosa sta succedendo
- Il tool “Nota” oggi funziona solo sul testo renderizzato in HTML (componente [MarkdownText.tsx](file:///Users/lucasicignano/Lavoro%20temporaneo/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/src/components/MarkdownText.tsx#L164-L203)).
- Quando clicchi sul testo senza selezione, la selezione è “collassata” (`sel.isCollapsed`) e il codice esce subito: quindi non apre nessuna modale.
- Se invece stai cliccando sul PDF (canvas/immagine) non può funzionare perché lì non esiste un “testo DOM” selezionabile.

## Fix UX (consigliato)
### 1) In modalità Nota, click singolo = seleziona parola e apre la modale
- Modificare [handleMouseUp](file:///Users/lucasicignano/Lavoro%20temporaneo/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/src/components/MarkdownText.tsx#L164-L203) così:
  - Se `sel.isCollapsed` e `isNoteToolActive` (e `onAddNote` presente), usare le coordinate del click (`e.clientX/Y`) per ottenere un caret range (`document.caretRangeFromPoint` / `caretPositionFromPoint`).
  - Espandere quel range alla “parola” (scorrendo a sinistra/destra nel `TextNode` con un set di caratteri tipo lettere/numeri/apostrofi).
  - Riutilizzare `computeOffsets(root, range)` per calcolare start/end e chiamare `onAddNote(start, end, word, "")`.

### 2) Rendere esplicito quando il tool Nota non può funzionare
- In [ReaderView.tsx](file:///Users/lucasicignano/Lavoro%20temporaneo/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/src/components/ReaderView.tsx#L1273-L1315) disabilitare (o rendere “non attivabile”) il bottone Nota quando il testo tradotto non è visibile per la pagina corrente (es. `!isTranslatedMode` o `!translationMap[currentPage]`).
- Aggiornare `title` del bottone per spiegare: “Le note si aggiungono sul testo tradotto”.

## Verifica
- Caso 1: tool Nota attivo, click su una parola nel testo tradotto → si apre la modale con la parola selezionata.
- Caso 2: tool Nota attivo, selezione drag di una frase → continua a funzionare come prima.
- Caso 3: non c’è testo tradotto (solo PDF) → il bottone Nota risulta disabilitato/esplicativo e non crea aspettative.

## File coinvolti
- [MarkdownText.tsx](file:///Users/lucasicignano/Lavoro%20temporaneo/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/src/components/MarkdownText.tsx)
- [ReaderView.tsx](file:///Users/lucasicignano/Lavoro%20temporaneo/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/src/components/ReaderView.tsx)