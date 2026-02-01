Il problema della visualizzazione "schiacciata" e "non lineare" del file originale è dovuto ad alcuni vincoli di layout CSS che forzano le immagini in contenitori con proporzioni fisse o che gestiscono in modo ambiguo il ridimensionamento (zoom).

Ecco i passaggi che seguirò per risolvere il problema:

## 1. Correzione dell'Anteprima Originale (Modal)
Modificherò il componente [OriginalPreviewModal.tsx](file:///Users/lucasicignano/Lavoro temporaneo/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/src/components/OriginalPreviewModal.tsx) per garantire che l'immagine mantenga sempre le sue proporzioni naturali:
- Rimuoverò `object-contain` che può causare distorsioni se combinato con larghezze percentuali su elementi flex.
- Assicurerò che l'altezza sia impostata su `auto` quando si applica lo zoom, permettendo all'immagine di espandersi correttamente.
- Ottimizzerò il contenitore per gestire meglio l'overflow durante lo zoom.

## 2. Adattamento della Miniatura Fluttuante
Aggiornerò [ReaderView.tsx](file:///Users/lucasicignano/Lavoro temporaneo/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/src/components/ReaderView.tsx) per passare le dimensioni reali della pagina alla miniatura originale (`OriginalThumbnail`):
- Invece di forzare un box fisso di 96x128 pixel (rapporto 3:4), la miniatura si adatterà all'aspect ratio reale della pagina PDF (es. A4, Letter, etc.).
- Questo eliminerà le bande vuote o il senso di "compressione" nel box fisso.

## 3. Ottimizzazione della Barra delle Anteprime
Modificherò [PagePreviewStrip.tsx](file:///Users/lucasicignano/Lavoro temporaneo/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/src/components/PagePreviewStrip.tsx):
- Cambierò la modalità di visualizzazione da `object-cover` (che taglia i bordi della pagina) a `object-contain`.
- In questo modo, l'utente potrà vedere l'intera pagina originale senza tagli, migliorando la "linearità" della visione.

Ti sembra corretto procedere con queste modifiche?