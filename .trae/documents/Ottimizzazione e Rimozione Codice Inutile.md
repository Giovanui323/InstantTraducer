# Analisi Approfondita e Piano di Ottimizzazione

Oltre ai problemi precedentemente individuati, ho riscontrato ulteriori inefficienze che possono appesantire il programma, specialmente con PDF di grandi dimensioni o sessioni prolungate.

## Nuovi Problemi Individuati
- **Duplicazione Logica (Offline vs Online)**: I file `AppOffline.tsx`, `aiServiceOffline.ts` e `index-offline.tsx` contengono molta logica duplicata. Questo non solo appesantisce il progetto ma aumenta il rischio di bug quando si aggiorna una versione e non l'altra.
- **Inefficienza Elaborazione Immagini**: La funzione `ensureBase64` esegue una pulizia degli spazi tramite regex su stringhe potenzialmente enormi (pagine PDF ad alta risoluzione). Questo può causare blocchi temporanei dell'interfaccia (jank).
- **Scansione PDF non Ottimizzata**: In `App.tsx`, l'effetto che recupera le dimensioni di tutte le pagine non ha limiti di concorrenza stringenti o meccanismi di pausa se il PDF è molto lungo, consumando CPU e memoria inutilmente in background.
- **Gestione Risorse Canvas**: Molteplici funzioni creano e distruggono `canvas` HTML in modo non coordinato. Una gestione centralizzata o un pool di canvas ridurrebbe la pressione sul Garbage Collector.

## Piano di Intervento Dettagliato

### Fase 1: Pulizia e Consolidamento
- **Rimozione Dead Code**: Eliminazione di `LogPanel.tsx` e `ErrorBoundary.tsx`.
- **Refactoring Offline**: Valutare se è possibile unificare la logica online/offline usando flag di configurazione invece di duplicare interi file.

### Fase 2: Ottimizzazione Prestazioni "Core"
- **Logger Efficiente**: Riscrivere `sanitize` in `logger.ts` per essere pigro (lazy) o per agire solo su campioni di dati, evitando deep clone inutili di grandi oggetti.
- **Ottimizzazione Base64**: Modificare `ensureBase64` in `imageUtils.ts` per evitare regex costose su stringhe già pulite o gestire la pulizia in modo più performante.
- **Istanza AI Singleton**: In `geminiService.ts`, implementare un pattern singleton per `GoogleGenAI` basato sulla API Key.

### Fase 3: Ottimizzazione Risorse e Stato
- **Batching Stato Traduzione**: In `useAppTranslation.ts`, unificare `loadingStatus`, `processingStatus` ed `errorMap` in un unico record `pageStatus` per ridurre il numero di aggiornamenti di stato React.
- **Throttling Scansione Background**: Aggiungere un limite più severo e un meccanismo di interruzione alla scansione delle dimensioni delle pagine in `App.tsx`.

### Fase 4: Verifica
- Test di caricamento con un PDF di grandi dimensioni (>100 pagine) per verificare la fluidità dell'interfaccia durante la scansione e la traduzione.

**Desideri che inizi con queste ottimizzazioni?** Posso procedere per fasi per permetterti di verificare i miglioramenti passo dopo passo.
