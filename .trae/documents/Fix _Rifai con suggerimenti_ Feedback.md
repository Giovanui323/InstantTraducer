# Risoluzione problema "Rifai con suggerimenti" senza feedback

L'utente ha segnalato che cliccando su "Rifai con suggerimenti" l'operazione non sembrava avviarsi. Dall'analisi del codice è emerso che, sebbene la richiesta venisse effettivamente messa in coda, l'interfaccia utente non forniva un feedback immediato: la vecchia traduzione e il report di errore ("severe") rimanevano visibili fino al completamento (o fallimento) della nuova richiesta AI. Inoltre, dai log in console, si nota che la richiesta AI stava fallendo con un errore critico, rendendo ancora più difficile per l'utente capire se il click avesse avuto effetto.

## Interventi previsti:

### 1. Miglioramento del feedback in `useAppQuality.ts`
Aggiornerò la funzione `fixTranslation` per:
- **Resettare lo stato della pagina**: cancellare la traduzione esistente e i metadati associati per quella pagina.
- **Aggiornare lo stato UI**: impostare lo stato della pagina su "In coda per ritraduzione migliorata..." per mostrare un indicatore di caricamento immediato.
- **Pulire il report di verifica**: rimuovere il report "severe" corrente, in modo che l'utente veda che il sistema sta lavorando a una nuova versione.

### 2. Aggiornamento delle interfacce e dei collegamenti
- **`useAppTranslation.ts`**: Esporrò la funzione `updatePageStatus` nel valore di ritorno dell'hook, in modo che possa essere utilizzata da altri componenti/hook per gestire lo stato delle pagine.
- **`App.tsx`**: Passerò la funzione `updatePageStatus` a `useAppQuality` durante la sua inizializzazione.
- **`useAppQuality.ts`**: Aggiornerò l'interfaccia `UseAppQualityProps` per includere `updatePageStatus`.

### 3. Coerenza con `retranslatePage`
Assicurerò che `fixTranslation` segua la stessa logica di pulizia di `retranslatePage`, garantendo che la cancellazione della vecchia traduzione venga anche persistita nella libreria del progetto per evitare stati inconsistenti in caso di ricaricamento.

## Risultato atteso:
Al click su "Rifai con suggerimenti", il modal si chiuderà e la pagina nel lettore mostrerà immediatamente uno stato di caricamento ("In coda..."), confermando visivamente all'utente che l'azione è stata recepita ed è in corso di esecuzione.
