Il piano prevede la modifica del componente `HomeView` e del file principale `App.tsx` per separare le azioni di "apertura sessione" e "chiusura sessione" nel banner della sessione attiva.

## Modifiche ai componenti

### 1. src/components/HomeView\.tsx

* Aggiungerò una nuova prop `onReturnToSession` all'interfaccia `HomeViewProps`.

* Modificherò il banner "Sessione attiva":

  * Il click sull'intero banner chiamerà `onReturnToSession` invece di `onCloseSession`.

  * Cambierò il testo del `title` e `aria-label` in "Torna alla sessione".

  * Il pulsante con la "X" verrà aggiornato:

    * Diventerà di colore rosso (usando classi `red` o `rose` come richiesto).

    * Avrà un proprio gestore `onClick` che chiama `onCloseSession`.

    * Utilizzerà `e.stopPropagation()` per evitare che il click sulla X attivi anche l'apertura della sessione.

    * Avrà un `title` specifico "Chiudi sessione".

### 2. src/App.tsx

* Passerò la funzione `() => setIsHomeView(false)` alla nuova prop `onReturnToSession` del componente `HomeView`. Questo permetterà di tornare alla visualizzazione del lettore senza ricaricare il file se una sessione è già attiva.

## Risultato atteso

* Cliccando su qualsiasi parte del banner della sessione attiva, l'utente tornerà al libro che stava leggendo.

* Cliccando specificamente sulla "X" rossa, la sessione verrà chiusa e il banner scomparirà.

