# Risoluzione distorsione visualizzazione PDF ("stretto e lungo")

Il problema della visualizzazione distorta all'apertura di un progetto è dovuto al fatto che le dimensioni delle pagine (pageDims) non vengono persistite e inizialmente hanno un valore predefinito di A4 (595x842). Se il PDF originale ha un rapporto d'aspetto diverso, viene "schiacciato" nel contenitore A4 finché non viene completato il rendering della prima pagina.

## Interventi previsti:

### 1. Persistenza delle dimensioni delle pagine
*   Modificare `App.tsx` per includere `pageDims` nel salvataggio del progetto tramite `updateLibrary`.
*   Modificare `handleOpenProject` in `App.tsx` per caricare `pageDims` dal file JSON del progetto.
*   Aggiornare `electron/translationMerge.js` per gestire correttamente l'unione dei dati di `pageDims` durante il salvataggio.

### 2. Pre-scansione delle dimensioni all'apertura
*   In `App.tsx`, aggiungere un effetto che, non appena il documento PDF è caricato, esegua una scansione veloce (senza rendering) delle dimensioni di tutte le pagine per popolare `pageDims` immediatamente.

### 3. Miglioramento della logica di scaling in ReaderView
*   Modificare `ReaderView.tsx` per evitare di forzare un rapporto d'aspetto predefinito (A4) se le dimensioni reali non sono ancora note, o utilizzare un valore più neutro.
*   Assicurarsi che `effectiveScale` e il contenitore della pagina non causino distorsioni durante la transizione tra lo stato "caricamento" e "caricato".

### 4. Ottimizzazione rendering iniziale
*   Garantire che la prima pagina venga renderizzata con priorità assoluta per aggiornare i riferimenti visivi il prima possibile.

## Milestone:
*   [ ] Verifica salvataggio/caricamento `pageDims` nel file di progetto.
*   [ ] Implementazione scansione automatica dimensioni in `App.tsx`.
*   [ ] Test con PDF in formato landscape e formati non standard per verificare l'assenza di distorsione all'apertura.

Confermi di procedere con queste modifiche?