## Sintesi del problema
- Nella vista lettura le note compaiono due volte: il componente rende sia il blocco note estratto dal PDF sia un secondo blocco per le note inline [[parola|commento]].
- Il rendering attuale in [MarkdownText.tsx](file:///Users/lucasicignano/Desktop/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/components/MarkdownText.tsx#L74-L118) mostra:
  - Note PDF: parse e rendering del blocco in fondo pagina
  - Note inline: secondo blocco basato su `registerNote` [MarkdownText.tsx:L101-L118](file:///Users/lucasicignano/Desktop/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/components/MarkdownText.tsx#L101-L118)
- La separazione corpo/note PDF avviene con euristiche in [splitByFootnoteSeparator](file:///Users/lucasicignano/Desktop/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/components/MarkdownText.tsx#L123-L168) e il parsing numerato in [parseFootnotes](file:///Users/lucasicignano/Desktop/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/components/MarkdownText.tsx#L170-L203).
- Nell’export HTML abbiamo già una fusione note condivise tra colonne tramite `sharedFootnotes` in [renderText.ts:buildReaderHtml](file:///Users/lucasicignano/Desktop/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/src/utils/renderText.ts#L144-L165), ma la vista React non applica la stessa logica.

## Piano di intervento
1. Evitare doppi blocchi
- Se sono presenti note PDF (`hasPdfFootnotes`), non renderizzare il blocco "note inline" per [[parola|commento]] in fondo pagina. Le superscript inline restano visibili nel testo.
- Motivazione: le note inline sono pensate come glosse del traduttore; quando il PDF ha già il proprio apparato, il doppio blocco confonde.

2. Fusione note su pagine a due colonne
- Riconoscere `[[PAGE_SPLIT]]` nel testo della traduzione.
- Applicare `splitByFootnoteSeparator` a ciascuna colonna; concatenare i due blocchi note e passare il risultato a `parseFootnotes` per produrre un unico elenco a fondo pagina.
- Salvaguardare i numeri originali (es. 482–492) usando `parseFootnotes` che preserva i marcatori.

3. Deduplica contenuti ripetuti
- Se la concatenazione produce voci identiche (stessa numerazione e testo uguale), filtrare con una Set normalizzata prima del rendering.

4. Test e verifica
- Aggiungere casi di test:
  - Pagina con solo note PDF → 1 blocco note
  - Pagina con solo note inline → 1 blocco note
  - Pagina con note PDF + inline → 1 blocco (PDF), inline solo come superscript
  - Pagina con `[[PAGE_SPLIT]]` e note su entrambe le colonne → blocco unico con lista fusa
- Verificare manualmente su 2–3 pagine campione.

5. Allineamento con export HTML
- Nessuna modifica necessaria in `renderText.ts` per ora: la logica di fusione esiste già; ci limitiamo a portarla nel componente React.

## Impatto e rischi
- Cambiamento non distruttivo: il testo nel corpo resta identico; si riduce il numero di blocchi note.
- Rischio minimo: se l’euristica non trova il separatore, si continua a mostrare solo le note inline.

Procedo con l’implementazione secondo questo piano?