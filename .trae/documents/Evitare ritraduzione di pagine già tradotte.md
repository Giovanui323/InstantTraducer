## Stato Attuale
- Le traduzioni salvate vengono caricate in memoria quando si apre un progetto: viene valorizzato `translationMap` con i dati dal disco [loadProjectFromDisk](file:///Users/lucasicignano/Desktop/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/App.tsx#L1610-L1705).
- Esiste già un controllo per evitare la ritraduzione, ma è presente solo in `processPageTranslation` (non usato dalla coda): se la pagina ha testo non vuoto, esce subito [processPageTranslation](file:///Users/lucasicignano/Desktop/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/App.tsx#L1221-L1226).
- La coda attuale usa `processPage` [useTranslationQueue init](file:///Users/lucasicignano/Desktop/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/App.tsx#L821-L824) che non verifica `translationMap` all’inizio: può ritradurre pagine già tradotte se vengono messe in coda.
- L’enqueue automatico delle pagine visibili evita l’enqueue se la pagina è già tradotta [visible pages enqueue](file:///Users/lucasicignano/Desktop/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/App.tsx#L2560-L2567), ma il prefetch e il batch “Traduci tutto” attualmente mettono in coda anche pagine già tradotte [prefetch enqueue](file:///Users/lucasicignano/Desktop/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/App.tsx#L2576-L2585), [batch enqueue](file:///Users/lucasicignano/Desktop/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/App.tsx#L2628-L2633).

## Obiettivo
- Non ritradurre mai pagine che hanno già una traduzione in memoria (caricata dal disco o prodotta nella sessione), salvo quando l’utente richiede esplicitamente la ritraduzione.

## Modifiche Proposte
1. Guard in `processPage`
   - Aggiungere un early-return: se `translationMapRef.current[page]` è una stringa non vuota e non è stato richiesto `force`, non tradurre.
   - Posizionare il controllo all’inizio di `processPage` [processPage](file:///Users/lucasicignano/Desktop/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/App.tsx#L647-L716).

2. Prefetch: evitare enqueue di pagine già tradotte
   - Prima di `enqueueTranslation(p, ...)` verificare che `translationMap[p]` sia vuoto; se non lo è, saltare [prefetch effect](file:///Users/lucasicignano/Desktop/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/App.tsx#L2569-L2585).

3. Batch “Traduci tutto”: enqueuing solo delle pagine mancanti
   - Sostituire `order.forEach(p => enqueueTranslation(p, ...))` con un filtro: enqueue solo pagine dove `translationMapRef.current[p]` è vuoto e non c’è errore [batch enqueue](file:///Users/lucasicignano/Desktop/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/App.tsx#L2628-L2633) e logica di conteggio mancantI già presente [missingPages calc](file:///Users/lucasicignano/Desktop/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/App.tsx#L2615-L2624).

4. Unificazione (opzionale ma consigliata)
   - Allineare la coda a usare `processPageTranslation` (che già include il guard) al posto di `processPage`, oppure estrarre una funzione comune `shouldSkipTranslation(page)` usata da entrambi per mantenere coerenza.

5. Ritraduzione esplicita
   - Lasciare invariata `retranslatePage`: pulisce stato e usa `force: true` per ritradurre intenzionalmente [retranslatePage](file:///Users/lucasicignano/Desktop/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/App.tsx#L838-L886).

## Verifica
- Aprire un progetto con pagine già tradotte e:
  - Scorrere tra le pagine: verificare che non vengano messi in coda né tradotti elementi già tradotti (log “Inizio traduzione AI…” assente per quelle pagine).
  - Attivare “Traduci tutto”: confermare che il numero di pagine enqueued corrisponde alle sole mancanti e che le già tradotte restano intatte.
  - Prefetch: muovere la pagina base e osservare che le pagine avanti già tradotte non vengono enqueued.
  - Provare “Ritraduci pagina”: confermare che ritraduce solo su richiesta esplicita.

## Impatto
- Nessuna modifica al formato su disco; solo logica di orchestrazione. Riduzione costi API e tempi, con comportamento allineato alla richiesta: nulla viene ritradotto se già presente in memoria, salvo azione esplicita dell’utente.