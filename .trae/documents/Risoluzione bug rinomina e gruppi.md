# Risoluzione Problemi Rinomina, Selezione e Gruppi

## 1. Correzione Visualizzazione Gruppi (Backend)
- Modifica di `electron/main.js` per includere il campo `groups` nella lista dei progetti restituiti da `get-translations`.
- Senza questa modifica, la UI riceve una lista di libri senza informazioni sui gruppi, rendendo impossibile il filtraggio.

## 2. Sincronizzazione Selezione dopo Rinomina (Frontend)
- Aggiornamento di `performAutoRename` in `App.tsx` per chiamare `setCurrentProjectFileId(newId)` dopo una rinomina automatica riuscita.
- Questo risolverà il problema del "quadratino verde" che rimane sul file sbagliato o scompare.

## 3. Miglioramento Rinomina Automatica
- Estensione dell'analisi alle prime 3 pagine del PDF per una migliore estrazione dei metadati.
- Logica di generazione del nome più robusta (gestione dei casi con Anno o Autore mancante).
- Aggiunta di log in tempo reale nella console dell'app per monitorare l'esito dell'analisi metadati.

## 4. Verifica Finale
- Test del flusso di upload con assegnazione gruppo.
- Verifica che la rinomina avvenga e che il file rimanga selezionato correttamente.
- Verifica che il filtro per gruppo nella Home mostri correttamente i file assegnati.
