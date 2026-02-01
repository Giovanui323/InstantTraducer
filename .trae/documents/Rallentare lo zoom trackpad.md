## Analisi
- Lo zoom da trackpad/pinch viene intercettato come evento `wheel` con `ctrlKey: true` in [ReaderView.tsx](file:///Users/lucasicignano/Lavoro%20temporaneo/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/src/components/ReaderView.tsx) (reader + miniatura) e in [OriginalPreviewModal.tsx](file:///Users/lucasicignano/Lavoro%20temporaneo/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/src/components/OriginalPreviewModal.tsx).
- Oggi ogni evento applica un fattore fisso `1.05/0.95` ignorando la magnitudine di `deltaY`; col trackpad arrivano molti eventi ravvicinati, quindi l’effetto cumulativo è “troppo veloce”.

## Modifica proposta
- Introdurre una funzione riusabile in `src/utils/` (es. `zoomUtils.ts`) che calcola il prossimo `scale` a partire da `WheelEvent`:
  - Normalizzare `deltaY` considerando `deltaMode`.
  - Limitare l’impatto per singolo evento (clamp del delta) per evitare “salti” con input anomali.
  - Convertire `deltaY` in un fattore moltiplicativo continuo, es. `factor = exp(-delta * intensity)` con un’`intensity` più bassa (tunable), e poi clampare `scale` in `[min,max]`.
  - Evitare la quantizzazione aggressiva a 2 decimali sullo zoom da trackpad (portare a 3 decimali o non arrotondare), per mantenere uno zoom più fluido anche con delta piccoli.

## Applicazione nei componenti
- Sostituire il blocco attuale `factor = delta > 0 ? 1.05 : 0.95` con la funzione comune in:
  - `ReaderView` (zoom delle pagine: clamp 0.3–5)
  - `OriginalThumbnail` (zoom miniatura: clamp 0.75–2)
  - `OriginalPreviewModal` (zoom anteprima: clamp 0.5–8)

## Verifica
- Aggiungere un test Vitest in `src/utils/__tests__/` per la funzione di calcolo (direzioni zoom in/out, clamp min/max, deltaMode).
- Eseguire `npm test` e verificare manualmente in Electron che il pinch/trackpad abbia uno zoom più controllabile (senza accelerazioni eccessive).

## Parametri (tuning rapido)
- Se dopo la prima passata risultasse ancora troppo veloce/lento, regolare solo l’`intensity` (unico punto centrale) senza toccare i componenti.