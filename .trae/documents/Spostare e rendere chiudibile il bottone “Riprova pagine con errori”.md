## Problema
- Il banner rosso “Attenzione / Riprova … pagine con errori” è renderizzato in [ReaderView.tsx](file:///Users/lucasicignano/Lavoro%20temporaneo/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/src/components/ReaderView.tsx#L1237-L1258) con posizione `fixed bottom-8`.
- La toolbar principale è `fixed bottom-24` e *draggable* ([MainToolbar.tsx](file:///Users/lucasicignano/Lavoro%20temporaneo/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/src/components/MainToolbar.tsx#L67-L148)); quando i controlli sono vicini al fondo, il banner finisce “sotto”/in competizione visiva.
- Rimane sempre cliccabile perché la visibilità dipende da `criticalErrorsCount` (errori/severity severe), che non viene azzerato istantaneamente dopo il click.
- Non esiste una chiusura manuale.

## Modifiche UI (ReaderView)
- Spostare il banner in una zona sempre visibile (proposta: `fixed top-*` centrato con animazione dall’alto), così non compete con i controlli in basso e resta immediato da notare.
- Aggiungere un pulsante “X” per chiuderlo (dismiss locale in `ReaderView`).
- Resettare automaticamente il dismiss quando `criticalErrorsCount` torna a 0 (così, se in futuro ricompaiono nuovi errori, il banner può tornare).

## Stato “cliccato” / anti-spam
- Calcolare l’elenco delle pagine critiche e un flag `criticalIsProcessing` usando `pageStatus[p]?.processing/loading`.
- Quando `criticalIsProcessing` è true (o subito dopo il click), disabilitare il retry e mostrare feedback (spinner/testo tipo “Riprovo…”), evitando click ripetuti che accodano più volte.

## Fix in modalità Offline
- In [AppOffline.tsx](file:///Users/lucasicignano/Lavoro%20temporaneo/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/src/AppOffline.tsx#L677-L710) oggi viene passato `onRetryAllCritical={() => { }}`: è truthy e quindi il banner compare ma non fa nulla.
- Cambiare la prop a `undefined`/rimuoverla, così in offline il banner non viene mostrato.

## Verifica
- Avviare l’app e forzare un caso con `criticalErrorsCount > 0` (errori/severity severe) per verificare:
  - banner in alto e ben visibile;
  - chiusura con X e riapparizione solo quando gli errori tornano dopo essere scesi a 0;
  - disabilitazione/feedback durante retry;
  - in offline il banner non compare.
