## Obiettivo
- Click sulla miniatura → **mostra solo quella pagina** nel lettore interno dell’app.
- Il PDF deve essere **integrato e senza bordi/ombre** (non il viewer “brutto”).

## Stato Attuale
- La miniatura “Vedi originale” in modalità tradotta apre una modal ([ReaderView.tsx](file:///Users/lucasicignano/Lavoro%20temporaneo/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/src/components/ReaderView.tsx#L1210-L1234)).
- La visualizzazione PDF “di base” nel reader usa un canvas dentro un contenitore con frame/ombra/bordo ([ReaderView.tsx](file:///Users/lucasicignano/Lavoro%20temporaneo/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/src/components/ReaderView.tsx#L889-L913)).

## Modifica Proposta (UX)
1. **Click miniatura**: chiude la preview e porta il reader alla pagina corrispondente, in modalità “lettura PDF” (solo quella pagina).
2. **PDF integrato**: in modalità lettura PDF, la pagina viene renderizzata dal canvas **senza frame** (niente bordo, niente ombra, niente “foglio incorniciato”).
3. **Fallback**: se l’app è in traduzione e vuoi ancora crop/rotate/replace, quelle azioni restano accessibili da un’azione dedicata (es. pulsante secondario o doppio click) che apre la modal attuale.

## Implementazione (file e interventi)
1. **Instradare il click della miniatura verso il reader (non modal)**
   - Estendere `ReaderViewProps` con una callback tipo `onOpenOriginalPage?: (page: number) => void`.
   - In [ReaderView.tsx](file:///Users/lucasicignano/Lavoro%20temporaneo/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/src/components/ReaderView.tsx#L1210-L1234), sostituire `setPreviewPage(floatingPage)` con:
     - se `onOpenOriginalPage` esiste → chiamarla
     - altrimenti → comportamento attuale (apri modal)
   - In [App.tsx](file:///Users/lucasicignano/Lavoro%20temporaneo/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/src/App.tsx#L1528-L1589), implementare `onOpenOriginalPage(page)` per:
     - `setCurrentPage(page)`
     - forzare vista a **pagina singola** (`setViewMode('single')`)
     - disattivare la modalità tradotta (`setIsTranslatedMode(false)`) così vedi il PDF nel reader interno

2. **Rendere il PDF “senza bordi” quando sei nel reader PDF**
   - In `ReaderView.tsx`, nel ramo dove si mostra il canvas (quando non stai mostrando la traduzione), cambiare le classi del contenitore pagina:
     - in modalità lettura (`isTranslatedMode === false`) rimuovere `bg/shadow/border/rounded/overflow-hidden` e rendere il canvas “edge-to-edge” rispetto al suo box.
   - Lasciare invariato lo stile “incorniciato” quando serve al flusso traduzione (es. pagine non ancora tradotte), così non si rompe la UX esistente.

3. **Tenere disponibile la modal per operazioni avanzate**
   - Aggiungere un trigger secondario sulla miniatura (es. `onDoubleClick` o un piccolo bottone) che continua ad aprire `OriginalPreviewModal`.

## Verifica
- Click sulla miniatura:
  - nessuna apertura di viewer esterno
  - il reader mostra **solo quella pagina**
  - la pagina appare **senza bordi/ombre**
- Trigger secondario:
  - la modal originale si apre ancora e le azioni crop/rotate/replace funzionano.

## Risultato Atteso
- Il PDF risulta visivamente integrato nell’app (look “pulito”), e la miniatura diventa un vero “vai a quella pagina” nel lettore interno.