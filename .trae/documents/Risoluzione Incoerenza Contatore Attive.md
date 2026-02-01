## Problema Identificato
L'incoerenza tra i log di elaborazione (che mostrano attività) e il contatore "0 attive" nella toolbar è causata da una race condition in `useTranslationQueue`. Il contatore viene decrementato nel blocco `finally` di un task che potrebbe essere terminato prematuramente o rimpiazzato, mentre il motore AI sta ancora emettendo log di progresso o sta completando la fase di connessione.

## Azioni Risolutive

### 1. Robustezza del Contatore in `useTranslationQueue.ts`
- Implementazione di una funzione `syncStats()` che calcola `active` e `queued` direttamente dallo stato reale dei riferimenti (`inFlightTranslationRef` e `translationQueueRef`), invece di affidarsi a incrementi/decrementi manuali che possono sfasarsi.
- Assicurare che `setQueueStats` rifletta sempre il numero effettivo di chiavi in `inFlightTranslationRef`.

### 2. Correzione Race Condition in `useAppTranslation.ts`
- Aggiornamento di `shouldSkipTranslation` per rimuovere il rischio di controlli su dati obsoleti durante l'apertura rapida di un progetto.
- Sincronizzazione del `translationMapRef` per garantire che il controllo di salto sia coerente con lo stato appena caricato dal disco.

### 3. Miglioramento Feedback UI in `MainToolbar.tsx`
- Aggiunta di un controllo di sicurezza: se `queueStats.active` è 0 ma ci sono pagine con stato `processing` o `loading` in `pageStatus`, mostrare comunque l'indicatore di attività per coerenza visiva.

## Verifica
- Test di caricamento progetto con traduzioni parziali.
- Verifica che durante la fase "In attesa del primo chunk", il contatore "attive" segni correttamente almeno 1.
