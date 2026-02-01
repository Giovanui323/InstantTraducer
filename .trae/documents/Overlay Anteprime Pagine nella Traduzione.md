## Contesto
- Navigazione con frecce e numero pagina: vedi barra in basso in [App.tsx:L3042-L3058](file:///Users/lucasicignano/Desktop/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/App.tsx#L3042-L3058); il numero centrale è a [App.tsx:L3045](file:///Users/lucasicignano/Desktop/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/App.tsx#L3045).
- Stato pagine: translationMap/errorMap/processingStatus/loadingStatus già gestiti e passati al lettore: [App.tsx:L3018-L3020](file:///Users/lucasicignano/Desktop/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/App.tsx#L3018-L3020). Render stati nel Reader: [ReaderView.tsx:L569-L576](file:///Users/lucasicignano/Desktop/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/components/ReaderView.tsx#L569-L576), [ReaderView.tsx:L599-L604](file:///Users/lucasicignano/Desktop/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/components/ReaderView.tsx#L599-L604).
- Generazione anteprime già disponibile via PDF.js: funzioni canvas→JPEG base64 in [usePdfDocument.ts:L149-L170](file:///Users/lucasicignano/Desktop/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/src/hooks/usePdfDocument.ts#L149-L170), [useImageManagement.ts:L112-L150](file:///Users/lucasicignano/Desktop/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/src/hooks/useImageManagement.ts#L112-L150), e utilità di downscale in [imageUtils.ts:L10-L35](file:///Users/lucasicignano/Desktop/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/src/utils/imageUtils.ts#L10-L35).

## Obiettivo
- Cliccando il numero pagina, aprire un overlay elegante con mini-anteprime orizzontali delle pagine, scorrevoli, cliccabili, con badge di stato: fatta, in corso, non fatta, errore.

## UI/UX
- Aggiungo uno state `showPreviewStrip` in App.tsx e un onClick sul numero centrale per togglare l’overlay.
- Overlay: pannello flottante sopra la barra (position fixed, bottom-16), larghezza centrata, sfondo semi-trasparente blur, contenuto con scorrimento orizzontale (overflow-x-auto, snap-x, scrollbar minimale). Stile con Tailwind (già presente via CDN).
- Tile miniatura: card 80–120px di larghezza, rapporto costante, angoli arrotondati, bordo, shadow, hover ring; evidenzia la pagina corrente.
- Animazione: transizione slide-up + fade (transition/transform/opacity).
- Chiusura overlay su click fuori, tasto Esc e al click su una miniatura.

## Stati sulle miniature
- Logica per ogni pagina:
  - errore: `errorMap[page]` → badge rosso con icona.
  - in corso: `processingStatus[page] === 'in_progress'` o `loadingStatus[page] === 'loading'` → badge ambra/spinner.
  - fatta: `translationMap[page]` non vuoto e nessun errore → badge verde check.
  - non fatta: nessuno dei precedenti → badge grigio.
- I badge sono in overlay in alto a destra della miniatura; tooltip opzionale con testo stato.

## Dati anteprime
- Sorgente immagine per miniatura:
  - Se esiste `croppedImages[page]`/`originalImages[page]` già usati dal Reader: vedi [ReaderView.tsx:L305-L323](file:///Users/lucasicignano/Desktop/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/components/ReaderView.tsx#L305-L323). Riutilizzo questi data URL.
  - Altrimenti, generazione lazy: uso `renderPageToJpegBase64(page)` (già in hook PDF) e faccio downscale con `downsampleDataUrlToJpeg`. Cache in `previewThumbnails: Map<number, string>` per evitare ricalcoli.
- Precarico le miniature per le pagine vicine alla corrente (es. ±10) e genero on-demand quando scorri.

## Integrazione con navigazione
- In modalità singola pagina: clic su miniatura → `setCurrentPage(page)`.
- In modalità affiancata: selezione imposta la pagina base coerente con la logica esistente (mostra coppia corretta); rispetto del calcolo visibile già in [App.tsx:L2116-L2121](file:///Users/lucasicignano/Desktop/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/App.tsx#L2116-L2121).
- Mantengo le frecce e scorciatoie da tastiera invariati.

## Performance
- Throttle della generazione (una alla volta, coda asincrona) e abort dei render se si cambia pagina rapidamente.
- Miniature a bassa risoluzione (es. qualità JPEG 0.6, max width ~200px) per memoria minima.
- Virtualizzazione semplice: renderizzo solo le tile visibili + buffer ridotto.

## Accessibilità
- Focus management: il bottone del numero pagina riceve aria-expanded e aria-controls; le tile sono bottoni con aria-label “Apri pagina X”.
- Supporto tastiera: frecce per scorrere strip, Invio per aprire pagina.

## Verifica
- Test manuale in sviluppo: aprire overlay, scorrere, controllare badge su esempi di stato (fatta/in corso/non fatta/errore), aprire pagina e chiusura overlay.
- Controllo regressioni: navigazione con frecce e affiancato continua a funzionare.

## Cambi richiesti
- Modifica in [App.tsx](file:///Users/lucasicignano/Desktop/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/App.tsx): stato/toggle, render overlay, selezione pagina.
- Facoltativo: piccolo componente `PagePreviewStrip` isolato (props: totalPages, currentPage, maps di stato, getter thumbnail, onSelect).