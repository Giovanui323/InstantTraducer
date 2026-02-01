## Diagnosi
- Il click sulla miniatura imposta `previewPage` e apre `OriginalPreviewModal`.
- In `OriginalPreviewModal` la modalità “PDF” usa un `iframe` con `src={pdfUrl}#page=<n>`: questo porta alla pagina giusta, ma il PDF rimane completo, quindi si può scorrere su altre pagine.

## Soluzione
- Cambiare la modalità “PDF” della modal per mostrare **un PDF generato al volo con una sola pagina** (quella cliccata), invece del PDF intero.
- Pipeline proposta:
  1. `pdfDoc.getPage(page)`
  2. render della pagina su canvas (pdfjs) ad alta qualità (es. scale 2)
  3. creazione di un nuovo PDF 1-pagina via `jspdf` (pagina dimensionata in px al viewport)
  4. `URL.createObjectURL(blob)` e `iframe` puntato a questo URL
- Fallback: se la generazione fallisce, mantenere il comportamento attuale (`pdfUrl#page=<n>`) o ripiegare sulla vista “Immagine”.

## Modifiche previste
- [OriginalPreviewModal.tsx](file:///Users/lucasicignano/Lavoro%20temporaneo/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/src/components/OriginalPreviewModal.tsx)
  - Aggiungere stato `singlePagePdfUrl` + loader dedicato.
  - Aggiungere `useEffect` che rigenera il PDF 1-pagina quando cambiano `pdfDoc` o `page` (con revoke URL in cleanup).
  - Usare `singlePagePdfUrl` come `src` dell’`iframe` in modalità PDF.
  - (Opzionale) aggiungere un toggle “PDF (tutto)” per chi vuole ancora il documento completo.

## Verifica
- Aprire l’app in dev, cliccare varie miniature:
  - La modal deve aprirsi sulla pagina cliccata.
  - Scorrendo non si deve mai passare a pagine successive/precedenti (perché il PDF ha 1 pagina).
  - Chiudendo e riaprendo non devono restare URL non revocati (niente leak evidente).
- Eseguire la suite `npm test` per assicurare che TypeScript/Vitest non segnalino regressioni.