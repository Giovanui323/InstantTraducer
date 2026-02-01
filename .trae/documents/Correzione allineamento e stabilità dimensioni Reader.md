# Correzione Problemi di Visualizzazione nel Reader

## Problemi Identificati:
1. **Spostamento e Ridimensionamento Pagina**: Passando da "Originale" a "Traduzione", la dimensione della pagina cambia leggermente a causa del calcolo dinamico della scala (`effectiveScale`) che reagisce a piccoli cambiamenti nella larghezza del contenitore (es. comparsa/scomparsa di barre di scorrimento). Inoltre, una transizione CSS (`transition-transform`) rende visibile questo piccolo aggiustamento come un "salto" o un'animazione indesiderata.
2. **Allineamento a Sinistra**: Il contenitore delle pagine non è centrato correttamente quando ci sono più pagine o quando la larghezza disponibile è superiore a quella delle pagine, a causa dell'uso di `inline-block` e di una condizione che applica `justify-center` solo se c'è una singola pagina.

## Interventi Tecnici:

### 1. Stabilizzazione delle Dimensioni e Rimozione Salti Visivi
*   Nel file [ReaderView.tsx](file:///Users/lucasicignano/Lavoro%20temporaneo/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/src/components/ReaderView.tsx), rimuoverò la proprietà `transition-transform` dal contenitore della pagina (linea 708). Poiché non viene applicata alcuna trasformazione reale (`transform`), questa transizione è superflua e causa l'effetto di "ridimensionamento" visibile quando la scala calcolata varia di pochi pixel.
*   Arrotonderò il calcolo di `effectiveScale` per evitare micro-variazioni dovute a calcoli in virgola mobile.

### 2. Correzione Allineamento (Centratura)
*   Modificherò la struttura del layout in [ReaderView.tsx](file:///Users/lucasicignano/Lavoro%20temporaneo/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/src/components/ReaderView.tsx):
    *   Sostituirò `inline-block min-w-full mx-auto` (linea 680) con un layout flex più robusto che garantisca la centratura del contenuto.
    *   Rimuoverò il vincolo `pages.length === 1` per la classe `justify-center` (linea 681), in modo che le pagine siano sempre centrate rispetto al visualizzatore, indipendentemente dal loro numero.

## Passaggi di Implementazione:
1.  **Modifica Layout**: Aggiornamento delle classi CSS e degli stili inline nel componente `ReaderView`.
2.  **Ottimizzazione Scala**: Affinamento del calcolo di `effectiveScale` per una maggiore stabilità.
3.  **Pulizia CSS**: Rimozione delle transizioni inutilizzate che causano artefatti visivi.

Desideri che proceda con queste modifiche?