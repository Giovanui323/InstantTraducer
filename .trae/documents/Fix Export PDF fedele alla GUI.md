## Diagnosi
- L’handler del bottone è [exportAsPDF](file:///Users/lucasicignano/Desktop/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/App.tsx#L398-L444): oggi crea un PDF “testo-only” con jsPDF e prova a salvarlo con `doc.save(...)`.
- Ci sono 2 motivi concreti per cui “non esporta niente”:
  - Blocco immediato: `if (!pdfDoc || Object.keys(translationMap).length === 0) return;` quindi se sei in Reader Mode (pdfDoc nullo) non esporta mai, anche se vedi le traduzioni in GUI. Vedi [App.tsx:L399-L402](file:///Users/lucasicignano/Desktop/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/App.tsx#L399-L402).
  - Possibile eccezione sul nome file: `metadata?.name.split('.')[0]` può andare in errore quando `metadata` non esiste o `metadata.name` non è stringa, interrompendo l’export prima del salvataggio. Vedi [App.tsx:L442](file:///Users/lucasicignano/Desktop/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/App.tsx#L442).
- Anche quando funziona, l’output non può essere “esattamente quello che vedo”: il PDF attuale non usa il layout della GUI (ReaderView/MarkdownText), ma reimpagina testo su A4 e rimuove parte della formattazione.

## Obiettivo
- Far sì che “Esporta” generi **un file PDF su disco** (con finestra “Salva con nome”) che riproduca **la grafica della vista tradotta** come in GUI.

## Strategia
- Spostare il salvataggio PDF su Electron main via IPC (così controlliamo percorso, permessi e UX) e generare il PDF con `webContents.printToPDF` partendo da un HTML “stile ReaderView”.
- Generare l’HTML a partire da `translationMap` applicando lo stesso parsing base di [MarkdownText](file:///Users/lucasicignano/Desktop/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/components/MarkdownText.tsx) (**bold**, *italic*, blocchi `[FIGURA: ...]`, annotazioni rese come evidenziazione semplice).

## Modifiche previste (codice)
1. Renderer (React)
   - Cambiare `exportAsPDF` in async e:
     - Rimuovere il vincolo `!pdfDoc` (consentire export anche in Reader Mode).
     - Preparare payload: nome libro, pagine da esportare, testo tradotto, opzionalmente `originalImages[page]`.
     - Chiamare `ipcRenderer.invoke('export-translations-pdf', payload)` e mostrare log di successo/errore.
     - Rendere sicuro il nome file (fallback a "Libro" e sanitizzazione).
2. Electron main
   - Aggiungere `ipcMain.handle('export-translations-pdf', ...)`:
     - Aprire `dialog.showSaveDialog` con defaultPath basato sul nome libro.
     - Creare una BrowserWindow invisibile (show:false) che carica un HTML generato al volo con CSS che replica la pagina tradotta (sfondo, margini/padding, font serif, size/line-height).
     - Quando la pagina è pronta, chiamare `win.webContents.printToPDF({ pageSize: 'A4', printBackground: true })`.
     - Scrivere il buffer su disco con `fs.writeFileSync(savePath, pdfBuffer)`.
     - Chiudere la finestra e restituire `{ success: true, path }`.

## Verifica
- Test manuale in DEV:
  - Export con PDF aperto (pdfDoc presente) e con Reader Mode (pdfDoc assente ma traduzioni caricate): deve sempre produrre un file.
  - Verificare che il PDF abbia la stessa resa della vista tradotta (font, spaziature, blocchi figura).
  - Verificare nome file e gestione di metadata mancante.

## Fallback (se necessario)
- Se per qualche motivo `printToPDF` non rendesse come atteso, implementare alternativa rapida: generare PDF con jsPDF ma salvarlo via IPC (`doc.output('arraybuffer')`) + `showSaveDialog` (almeno “esporta davvero”, anche se meno fedele graficamente).