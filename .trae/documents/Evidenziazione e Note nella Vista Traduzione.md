## Obiettivo
- Aggiungere evidenziazione testuale e inserimento di note nella GUI della traduzione, con interazioni simili ad Adobe Reader (selezione → azione, popover, lista note, esportazione).

## Contesto Attuale
- Rendering PDF originale su canvas (pdf.js): [usePdfDocument.ts](file:///Users/lucasicignano/Desktop/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/src/hooks/usePdfDocument.ts), vista: [ReaderView.tsx](file:///Users/lucasicignano/Desktop/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/components/ReaderView.tsx)
- Vista Tradotta: testo markdown con note inline e highlight di ricerca: [MarkdownText.tsx](file:///Users/lucasicignano/Desktop/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/components/MarkdownText.tsx)
- Stato globale e salvataggio: [App.tsx](file:///Users/lucasicignano/Desktop/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/App.tsx)
- Export PDF: [electron/main.js](file:///Users/lucasicignano/Desktop/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/electron/main.js), helpers: [renderText.ts](file:///Users/lucasicignano/Desktop/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/src/utils/renderText.ts)

## Funzionalità da Implementare
- Evidenziazione nella vista Tradotta: selezione testo → crea highlight colorato, clic → selezione/gestione.
- Inserimento note: selezione testo → aggiungi nota collegata (popover con editor), nota mostrata come apice e in lista a piè di pagina.
- Gestione: modifica/elimina highlight/note; palette colori; toggle mostra/nascondi; scorciatoie (es. Cmd+H per evidenziare, Cmd+N per nota).
- Persistenza per pagina e progetto; esportazione opzionale delle evidenziazioni e note nel PDF finale.

## Modello Dati
- Aggiunta tipi in [types.ts](file:///Users/lucasicignano/Desktop/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/types.ts):
  - UserHighlight: { id, page, start, end, text, color, createdAt }
  - UserNote: { id, page, start, end, text, content, createdAt }
- Ancoraggio tramite offset carattere sul testo tradotto della pagina (start/end), con fallback di riallineamento su "text" se la traduzione cambia leggermente.
- Stato in [App.tsx](file:///Users/lucasicignano/Desktop/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/App.tsx): userHighlightsMap, userNotesMap per pagina; funzioni add/update/remove.

## Interazione e UI
- In [MarkdownText.tsx](file:///Users/lucasicignano/Desktop/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/components/MarkdownText.tsx):
  - Rilevamento selezione con Range → calcolo offset globale (linearizzazione dei nodi testo), conversione a {start,end} rispetto alla stringa renderizzata.
  - Popover contestuale (mini-toolbar) vicino alla selezione: "Evidenzia", "Nota", colori.
  - Rendering highlight: suddivisione della stringa tradotta in segmenti e wrappare gli intervalli con <span> (classi Tailwind) colorati; click/hover mostra dettagli.
  - Rendering note: apice numerato nel punto di selezione, contenuto nota in sezione footnotes sotto la pagina (riutilizzando la logica già presente per note inline).
- In [ReaderView.tsx](file:///Users/lucasicignano/Desktop/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/components/ReaderView.tsx):
  - Toggle UI per modalità "Evidenzia/Note" e per mostra/nascondi.
  - Pannello laterale opzionale con elenco note della pagina (filtrabile/cercabile) e azioni modifica/elimina.

## Persistenza e Esportazione
- Persistenza: serializzare userHighlightsMap e userNotesMap insieme ai dati progetto (riutilizzando i meccanismi di salvataggio già in [App.tsx](file:///Users/lucasicignano/Desktop/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/App.tsx)).
- Export PDF: in [electron/main.js](file:///Users/lucasicignano/Desktop/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/electron/main.js) e [renderText.ts](file:///Users/lucasicignano/Desktop/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/src/utils/renderText.ts):
  - Integrare highlight come <span> con background (palette stampabile) nel flusso HTML di export.
  - Integrare le note come footnotes numerate a fine pagina; opzione toggle "includi evidenziazioni/ note".

## Algoritmo Offset Selezione
- Linearizzare i nodi testo del container traduzione, accumulare lunghezze per mappare Range start/end a offset globali.
- Salvare anche la substring selezionata (text) per riallineamento: se il testo cambia, cercare il primo match della substring per ricostruire start/end.
- Gestire selezioni multi-nodo, normalizzare spazi/markdown renderizzato.

## Accessibilità e Sicurezza
- Tastiera: scorciatoie e focus management per popover.
- A11y: ruoli ARIA per note e highlight, contrasto colori.
- Sanitizzazione contenuti nota (escape HTML) per prevenire XSS.

## Performance e Edge Cases
- Rendering efficiente: precomputare segmenti e usare key stabili per span.
- Gestione sovrapposizioni: consentire più highlight sovrapposti con z-index e bordo.
- Scale font/zoom: usare offset basati su testo renderizzato, indipendenti dal zoom del container.

## File da Aggiornare
- types.ts: nuovi tipi UserHighlight/UserNote
- App.tsx: stato userHighlightsMap/userNotesMap, azioni CRUD, persistenza
- components/MarkdownText.tsx: selezione, popover, rendering highlight/footnotes
- components/ReaderView.tsx: toggle modalità, pannello note
- src/utils/renderText.ts: inserzione highlight e footnotes in HTML di export
- electron/main.js: opzioni export e inclusione CSS per highlight

## Verifica
- Test manuale: selezione → highlight/nota, modifica/elimina, toggle visibilità, persistenza dopo riavvio.
- Export: generare PDF con/ senza evidenziazioni e note, verifica resa a stampa.
- Unit test di utilità mapping Offset Range → {start,end} con casi multi-nodo e cambi minori di testo.

## Estensioni Future
- Evidenziazioni/annotazioni anche sul PDF originale (text layer pdf.js) come overlay sopra il canvas.
- Sincronizzazione highlight tra Originale e Tradotta usando mapping testo.
