## Cosa succede adesso
- Quando apri l’anteprima “Originale” cliccando la miniatura, si monta una modal a schermo intero con `fixed inset-0 z-[250]` che sta sopra all’header (`z-[100]`). Quindi i bottoni in alto possono risultare visibili (perché lo sfondo della modal è semi-trasparente) ma **non ricevono click/hover** perché sono “sotto” la modal. Vedi [OriginalPreviewModal.tsx](file:///Users/lucasicignano/Lavoro%20temporaneo/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/src/components/OriginalPreviewModal.tsx#L23-L23) e [Header.tsx](file:///Users/lucasicignano/Lavoro%20temporaneo/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/src/components/Header.tsx#L82-L84).
- Inoltre la toolbar della modal è posizionata con `top-[-48px]` e può finire fisicamente sopra l’header, “coprendo” i bottoni a destra. Vedi [OriginalPreviewModal.tsx](file:///Users/lucasicignano/Lavoro%20temporaneo/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/src/components/OriginalPreviewModal.tsx#L28-L63).

## Tooltip (hover)
- I bottoni tondi della modal (Ruota/Ritaglia/Sostituisci/Chiudi) hanno già `title=...`, quindi dovrebbero mostrare il tooltip quando sono cliccabili. Vedi [OriginalPreviewModal.tsx](file:///Users/lucasicignano/Lavoro%20temporaneo/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/src/components/OriginalPreviewModal.tsx#L30-L62).
- Nell’header alcuni bottoni hanno `title` (es. Home, Ritraduci, Verifica, Cerca), ma non tutti (es. “Traduci Tutto” e “Esporta” non hanno `title`). Vedi [Header.tsx](file:///Users/lucasicignano/Lavoro%20temporaneo/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/src/components/Header.tsx#L145-L195).

## Obiettivo
- Fare in modo che, quando la modal è aperta, **l’header non sia coperto** e i bottoni in alto **funzionino davvero** (click + tooltip).
- Evitare che la toolbar della modal vada “sopra” l’header.

## Modifiche che applico
1. Spostare la modal sotto l’header
   - Cambiare il contenitore della modal da `fixed inset-0` a `fixed top-12 left-0 right-0 bottom-0` (12 = 48px, altezza header) così non intercetta eventi nell’area dell’header.
2. Riposizionare i bottoni della modal
   - Eliminare `top-[-48px]` e mettere la toolbar **dentro** la modal (es. `absolute top-3 right-3` oppure `fixed top-16 right-4`), così non copre più i bottoni dell’header.
3. Completare i tooltip nell’header
   - Aggiungere `title` a “Traduci Tutto” e “Esporta” (e, se serve, agli altri pulsanti senza tooltip) per coerenza con la UX che ti aspetti.

## Verifica
- Aprire l’anteprima originale da miniatura e verificare:
  - i bottoni dell’header sono interamente visibili e cliccabili;
  - i tooltip compaiono passando il mouse;
  - i bottoni della modal restano cliccabili e non chiudono la modal per bubbling.
