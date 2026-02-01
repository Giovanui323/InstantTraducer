**Cosa fa oggi**

* È una card “Sessione attiva” con nome progetto e icona Play: [App.tsx](file:///Users/lucasicignano/Desktop/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/App.tsx#L2923-L2937)

* Il click sulla card chiude la sessione corrente e torna alla Home: handler [closeActiveSession](file:///Users/lucasicignano/Desktop/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/App.tsx#L2443-L2495)

* La card compare solo se esiste una sessione: [hasSession/showHome](file:///Users/lucasicignano/Desktop/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/App.tsx#L2609-L2611)

**Problema UX**

* L’icona “Play” può far pensare a “riprendi”, ma il click in realtà chiude la sessione.

**Proposta di miglioramento (scegli una opzione)**

* Opzione A: rendere l’azione esplicita

  * Sostituire l’icona Play con un’icona “Chiudi” o “Stop” e aggiungere tooltip “Chiudi sessione”.

* Opzione B: ripensare il comportamento

  * Fare in modo che il click sulla card apra/“riprenda” la sessione (uscendo dalla Home), e spostare “Chiudi sessione” su un pulsante secondario.

* Opzione C: separare le azioni

  * Rendere la card non cliccabile e mostrare due pulsanti: “Riprendi” e “Chiudi”.

**Implementazione prevista (una volta confermata)**

* Aggiornare l’UI della card in [App.tsx](file:///Users/lucasicignano/Desktop/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/App.tsx) seguendo l’opzione scelta.

* Aggiungere tooltip/testo esplicativo per evitare ambiguità.

* Verificare che le condizioni di rendering (hasSession/showHome) restino invariati e che il flusso di navigazione sia chiaro.

