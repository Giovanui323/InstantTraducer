## Obiettivo
Consentire di ingrandire/ridurre la miniatura dell’originale nella vista di traduzione.

## Contesto
- La miniatura flottante è gestita da OriginalThumbnail in ReaderView: vedi [ReaderView.tsx:L50-L110](file:///Users/lucasicignano/Desktop/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/components/ReaderView.tsx#L50-L110) e la sua istanziazione: [ReaderView.tsx:L642-L647](file:///Users/lucasicignano/Desktop/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/components/ReaderView.tsx#L642-L647).
- Attualmente ha dimensioni fisse (w-24, h-32 ≈ 96×128 px).

## Modifiche proposte
1. Stato di scala della miniatura
- Aggiungere in ReaderView uno stato thumbnailScale (default 1.0) con persistenza in localStorage (chiave "thumbnailScale").
- Passare thumbnailScale a OriginalThumbnail come prop.

2. Dimensionamento dinamico in OriginalThumbnail
- Sostituire le classi fisse w-24/h-32 con stile inline calcolato: width = 96 * thumbnailScale, height = 128 * thumbnailScale.
- Mantenere border, hover e transizioni esistenti.
- Calcolare la posizione iniziale (defaultPosition) usando le dimensioni correnti della miniatura; non riposizionare quando cambia la scala per evitare salti.

3. Controlli +/− sulla miniatura
- Aggiungere due pulsanti sovrapposti (visibili al hover) per aumentare/diminuire la scala in step (es. 0.75 → 2.0).
- Gestire correttamente gli eventi: stopPropagation per evitare l’apertura dell’anteprima, integrare con la logica drag/click esistente.

4. UX e accessibilità
- Tooltip/aria-label appropriati ("Ingrandisci", "Rimpicciolisci").
- Conservare il click sulla miniatura per aprire l’anteprima grande (modal già presente).

## Verifica
- Testare che:
- Il drag continui a funzionare e non interferisca con i pulsanti.
- Il click apra l’anteprima; i pulsanti non la aprono.
- La scala venga ricordata tra sessioni.
- La miniatura non superi i limiti della viewport.

## File toccati
- ReaderView.tsx: stato, passaggio prop, overlay dei controlli.
- Nessun altro file previsto.

Se confermi, implemento e verifico end-to-end.