## Correzione dello spostamento di evidenziazioni e note

### 1. Analisi e Identificazione del Bug
*   Il "drift" (spostamento) è causato da una discrepanza tra il calcolo della lunghezza del testo visibile e il rendering effettivo.
*   Le note (numeri in apice) aggiungono caratteri al DOM che non sono presenti nel testo sorgente. Se una nota è annidata in grassetto/corsivo, il calcolo attuale la ignora, causando uno sfasamento di 1 o più caratteri per ogni nota precedente.

### 2. Modifiche Tecniche
*   **In [MarkdownText.tsx](file:///Users/lucasicignano/Lavoro%20temporaneo/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/src/components/MarkdownText.tsx)**:
    - Riscrivere `calculateRecursiveVisibleLength` per accettare il numero corrente della nota e restituire la lunghezza esatta che verrà renderizzata nel DOM.
    - Sincronizzare la logica di `globalVisibleOffset` nel loop dei paragrafi per riflettere esattamente il comportamento di `range.toString()` del browser.
    - Assicurarsi che la logica di `renderPart` e quella di calcolo degli offset utilizzino la stessa sequenza di numerazione per le note.
*   **In [textSelection.ts](file:///Users/lucasicignano/Lavoro%20temporaneo/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/src/utils/textSelection.ts)**:
    - Verificare che `computeOffsets` sia robusto rispetto ai limiti dei blocchi HTML (<p>, <div>) per corrispondere alla logica di rendering.

### 3. Risultato Atteso
*   Le evidenziazioni appariranno esattamente sulle parole selezionate.
*   Le icone delle note appariranno alla fine della selezione corretta, senza "tagliare" a metà le parole.
