## Problema Attuale
- La traduzione di una scansione in formato “libro aperto” (sinistra bianca, destra testo) viene esportata come UNA sola pagina larga con due colonne.
- La pipeline tratta il marcatore [[PAGE_SPLIT]] come layout a due colonne dentro una singola pagina di output A4, non come due pagine separate.
- File coinvolti: export HTML in [main.js:buildExportHtml](file:///Users/lucasicignano/Desktop/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/electron/main.js#L245-L265) e stili pagina in [main.js:L292-L316](file:///Users/lucasicignano/Desktop/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/electron/main.js#L292-L316). La visualizzazione UI segue lo stesso approccio a colonne in [ReaderView.tsx:L605-L613](file:///Users/lucasicignano/Desktop/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/components/ReaderView.tsx#L605-L613).

## Obiettivo
- Mantenere la fedeltà dell’impaginazione originale: gli spread devono diventare DUE pagine separate in export.
- Se la metà sinistra è vuota, generare una pagina bianca dedicata.
- Preservare proporzioni/rapporto della pagina sorgente o fornire opzioni di formato, evitando fusioni in una pagina larga.

## Modifiche Tecniche
### 1) Export: due pagine separate per [[PAGE_SPLIT]]
- In [buildExportHtml](file:///Users/lucasicignano/Desktop/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/electron/main.js#L245-L265):
  - Quando il testo contiene [[PAGE_SPLIT]], generare due elementi .page separati: “sinistra” e “destra”.
  - Se una metà è vuota, emettere comunque una pagina .page vuota per mantenere la fedeltà.
  - Gestire note a piè di pagina per ciascuna pagina (o condivise, secondo attuale logica).
- Aggiornare gli stili per .page in [main.js:L292-L316](file:///Users/lucasicignano/Desktop/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/electron/main.js#L292-L316) per evitare la griglia 2-colonne e mantenere una pagina per blocco.

### 2) Dimensioni e proporzioni pagina
- Recuperare per ogni pagina le dimensioni originali (pageDims da [usePdfDocument.ts](file:///Users/lucasicignano/Desktop/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/src/hooks/usePdfDocument.ts#L69-L85)).
- Opzioni di export:
  - “Formato: A4” (scala il contenuto mantenendo rapporto originale all’interno di A4).
  - “Formato: Originale” (adatta CSS .page al rapporto del sorgente; se necessario, valutare uso alternativo di jspdf per pageSize personalizzate).
- Applicare scaling coerente in HTML/CSS per contenuti tradotti e immagini.

### 3) UI (opzionale, per coerenza visiva)
- Reader: continuare a mostrare due colonne in lettura, ma aggiungere una modalità “Anteprima export” che mostra due pagine separate.
- Punto d’intervento: [ReaderView.tsx](file:///Users/lucasicignano/Desktop/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/components/ReaderView.tsx) e [renderText.ts:buildReaderHtml](file:///Users/lucasicignano/Desktop/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/src/utils/renderText.ts#L144-L165).

### 4) Impostazioni
- Aggiungere una preferenza “Fedeltà impaginazione originale” con tre opzioni:
  - Mantieni spread come due pagine separate (predefinito: ON).
  - Inserisci pagine bianche quando una metà è vuota (ON/OFF).
  - Formato output: A4 o Originale (rapporto sorgente).
- L’impostazione influenza sia la generazione HTML di export sia l’anteprima.

## Validazione
- Caso di test: pagina con [[PAGE_SPLIT]] e sinistra vuota.
- Verificare che l’export produca due pagine: una bianca (sinistra) e una con testo (destra).
- Controllare numero pagine, impaginazione e proporzioni coerenti.
- Verificare che una scansione senza [[PAGE_SPLIT]] continui a generare una pagina singola corretta.

## Impatto & Rischi
- Aumento del numero di pagine nell’export quando presente [[PAGE_SPLIT]].
- Possibile variazione di posizionamenti se si sceglie “Formato: Originale”; mitigare con scaling.
- Nessun impatto sulla traduzione (prompt e streaming restano invariati in [geminiService.ts](file:///Users/lucasicignano/Desktop/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/services/geminiService.ts#L143-L182)).

## Deliverable
- Export aggiornato con pagine separate per spread e gestione pagine bianche.
- Impostazioni di fedeltà impaginazione.
- Anteprima coerente dell’export in UI (opzionale).