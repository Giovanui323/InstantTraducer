# Piano di Completamento Ottimizzazione e Verifica

Ho analizzato le modifiche apportate e lo stato attuale del progetto. Il lavoro di ottimizzazione è a buon punto, ma richiede alcuni interventi finali per risolvere errori di compilazione e migliorare ulteriormente l'efficienza.

## 1. Risoluzione Errori di Compilazione (Linter)
A seguito dell'accorpamento degli stati in `pageStatus`, alcuni file (principalmente `App.tsx`) presentano errori perché cercano ancora i vecchi stati (`errorMap`, `loadingStatus`, `processingStatus`).
- **Aggiornamento `App.tsx`**: Sostituirò tutti i riferimenti ai vecchi stati con la nuova struttura `pageStatus`.
- **Sincronizzazione `ReaderView.tsx`**: Verificherò che tutte le proprietà passate corrispondano all'interfaccia aggiornata.

## 2. Ottimizzazione Avanzata Scansione PDF
La scansione delle dimensioni delle pagine in background può essere resa più intelligente:
- **Pausa se Inattivo**: Sospendere la scansione se la scheda del browser non è visibile (`document.hidden`).
- **Priorità alla Traduzione**: Rallentare o sospendere la scansione se ci sono traduzioni attive in coda, per dedicare tutta la banda e la CPU al processo principale.

## 3. Consolidamento `useAppTranslation`
- **Gestione Atomica dello Stato**: Assicurerò che `updatePageStatus` sia utilizzato ovunque per evitare stati incoerenti.
- **Pulizia Risorse**: Verificherò che i `canvas` temporanei vengano distrutti correttamente per evitare memory leak durante sessioni lunghe.

## 4. Verifica Finale
- **Test di Caricamento**: Verifica della fluidità dell'interfaccia con un PDF reale.
- **Controllo Bundle**: Verifica che non siano rimasti file inutilizzati (es. i componenti rimossi precedentemente).

**Procedo con il completamento di questi punti?** Inizierò correggendo gli errori in `App.tsx` per ripristinare la corretta compilazione del progetto.
