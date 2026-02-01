## Implementazione Overlay Dinamico "Riprovo..."

### 1. Modifica Logica in ReaderView.tsx
- Aggiungere un `useMemo` chiamato `pagesCurrentlyRetrying` che filtra `criticalErrorPages` mantenendo solo quelle dove `pageStatus[p]?.processing` o `pageStatus[p]?.loading` è vero.
- Questo permetterà di avere una lista sempre aggiornata delle pagine che l'AI sta effettivamente scrivendo o analizzando in quel momento.

### 2. Aggiornamento UI in ReaderView.tsx
- Individuare il blocco di codice intorno alla riga 1336.
- Sostituire il testo statico `{isRetryAllCriticalInProgress ? 'Riprovo…' : ...}` con una struttura JSX che includa la lista delle pagine se presente.
- Formattazione prevista: `Riprovo (pag. 3, 4)...` utilizzando `.map(p => p + 1).join(', ')`.

### 3. Verifica Coerenza
- Confermare che i numeri di pagina visualizzati siano corretti (aggiungendo +1 all'indice zero-based).
- Verificare che l'overlay si aggiorni correttamente man mano che le pagine vengono completate.

**Nota tecnica sull'errore di pagina 3**: 
Dai log si vede chiaramente che il sistema ha rilevato: `SEVERE — La traduzione presenta un'omissione grave: è stato saltato l'intero secondo paragrafo`. Per questo motivo, cliccando "Riprova", il sistema ha giustamente incluso anche la 3 nel processo di correzione.
