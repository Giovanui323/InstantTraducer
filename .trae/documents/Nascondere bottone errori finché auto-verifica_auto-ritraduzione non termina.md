## Problema Attuale
- Il bottone rosso “Riprova … pagine con errori” in [ReaderView.tsx](file:///Users/lucasicignano/Lavoro%20temporaneo/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/src/components/ReaderView.tsx#L1376-L1429) appare anche quando l’“errore” è solo una severità `severe` appena rilevata, mentre la verifica ha già messo in coda una ritraduzione automatica.
- Questo succede perché la lista `criticalErrorPagesAll` include **sempre** `verification.severity === 'severe'` (oltre agli errori di traduzione reali `pageStatus[p].error`).

## Obiettivo
- Mostrare il bottone di retry **solo** quando c’è bisogno di intervento manuale, cioè quando:
  - c’è un errore di traduzione reale (`pageStatus[p].error`), oppure
  - la verifica è fallita (`verification.state === 'failed'`), oppure
  - la verifica ha concluso che la pagina resta “severe” **dopo** aver tentato (o non potendo tentare) la ritraduzione automatica.

## Modifiche Previste
### 1) Tracciare “auto-ritraduzione attiva” nello stato verifica
- Estendere `PageVerification` in [types.ts](file:///Users/lucasicignano/Lavoro%20temporaneo/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/src/types.ts) con un flag tipo `autoRetryActive?: boolean` (senza cambiare i campi esistenti).

### 2) Impostare/azzerare i flag durante verify→auto-retry
- In [useAppQuality.ts](file:///Users/lucasicignano/Lavoro%20temporaneo/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/src/hooks/useAppQuality.ts):
  - Quando la verifica decide `severity === 'severe'` e **accoda** la ritraduzione automatica: impostare `autoRetryActive: true` e `postRetryFailed: false`.
  - Quando `severity === 'severe'` ma **non** ci sono più retry disponibili (incluso `maxAutoRetries === 0`): impostare `autoRetryActive: false` e `postRetryFailed: true`.
  - Quando la verifica finisce con `ok/minor`: impostare `autoRetryActive: false` e `postRetryFailed: false`.
  - Nel pre-check “testo non italiano” (che oggi accoda e ritorna senza aggiornare lo stato): impostare `autoRetryActive: true` per evitare che UI mostri il bottone se esiste già una severità precedente.

### 3) Cambiare la definizione di “errore critico” lato UI
- In [ReaderView.tsx](file:///Users/lucasicignano/Lavoro%20temporaneo/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/src/components/ReaderView.tsx#L729-L756):
  - Considerare “critiche” solo le pagine con `pageStatus.error` **oppure** `verification.state==='failed'` **oppure** `verification.postRetryFailed===true`.
  - Escludere esplicitamente le pagine dove `verification.autoRetryActive===true` (stanno già cercando di autorisolversi).
  - Aggiornare la condizione di render del banner per non mostrare il bottone quando `criticalErrorsCount === 0` (evita il caso attuale “Riprova 0 pagine”).

### 4) Allineare l’azione “Riprova tutte” alla nuova logica
- In [useProjectManagement.ts](file:///Users/lucasicignano/Lavoro%20temporaneo/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/src/hooks/useProjectManagement.ts#L360-L379):
  - Selezionare per il retry solo pagine con errore reale, verifica fallita, o `postRetryFailed===true`.
  - Escludere le pagine con `autoRetryActive===true`.

## Verifica (Cosa Controllerò)
- Caso A: pagina marcata `severe` → auto-ritraduzione in coda → il bottone non appare.
- Caso B: dopo N tentativi automatici la pagina resta `severe` → `postRetryFailed` true → il bottone appare.
- Caso C: errore di traduzione (`pageStatus.error`) → il bottone appare (come prima).
- Caso D: verifica fallita (`state: 'failed'`) → il bottone appare.

Se confermi questo piano, applico le modifiche nei file indicati e verifico il comportamento in UI.