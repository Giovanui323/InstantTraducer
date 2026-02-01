## Analisi del Problema
Attualmente, quando l'utente clicca sulla miniatura per visualizzare la pagina originale (passando dalla modalità "Tradotta" alla modalità "Originale"), la miniatura scompare giustamente, ma non compare un pulsante di chiusura immediato per tornare alla visualizzazione tradotta. L'utente si aspetta di trovare un pulsante "X" al posto della miniatura per "chiudere" la vista originale e tornare indietro.

## Interventi Proposti

### 1. Modifica delle Props di ReaderView
Aggiungerò la prop `onToggleTranslatedMode` all'interfaccia `ReaderViewProps` in [ReaderView.tsx](file:///Users/lucasicignano/Lavoro%20temporaneo/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/src/components/ReaderView.tsx) per consentire al componente di segnalare la volontà di cambiare modalità di visualizzazione.

### 2. Aggiornamento di App.tsx
Passerò la funzione `setIsTranslatedMode` (o una sua variante di toggle) alla `ReaderView` nel file [App.tsx](file:///Users/lucasicignano/Lavoro%20temporaneo/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/src/App.tsx), collegandola alla nuova prop.

### 3. Implementazione del Pulsante di Chiusura
In [ReaderView.tsx](file:///Users/lucasicignano/Lavoro%20temporaneo/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/src/components/ReaderView.tsx), aggiungerò un pulsante flottante condizionale:
- Sarà visibile solo quando `isTranslatedMode` è `false`.
- Sarà posizionato nell'angolo in alto a destra, dove solitamente risiede la miniatura.
- Utilizzerà l'icona `X` di `lucide-react`.
- Al click, chiamerà `onToggleTranslatedMode` per riportare l'utente alla vista tradotta.

## Verifiche
- Verificherò che cliccando sulla miniatura si passi alla vista originale e che compaia il pulsante "X".
- Verificherò che cliccando sul pulsante "X" si torni correttamente alla vista tradotta.
- Mi assicurerò che lo stile del pulsante sia coerente con il resto dell'interfaccia (sfondo scuro/blu, ombra, bordi arrotondati).
