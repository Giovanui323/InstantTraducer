L'utente desidera sostituire il pulsante "MAN" nella barra degli strumenti principale con un toggle (interruttore) etichettato come "Manuale".

Ecco i passaggi che seguirò:

1. **Modifica di [MainToolbar.tsx](file:///Users/lucasicignano/Lavoro%20temporaneo/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/src/components/MainToolbar.tsx)**:
    - Individuerò il pulsante che attualmente visualizza il testo "MAN" (linee 99-108).
    - Sostituirò il contenuto del pulsante con una label "Manuale" e un componente visuale che simuli un interruttore (toggle switch).
    - Aggiornerò le classi Tailwind per garantire che il toggle si integri perfettamente con lo stile esistente della toolbar, mantenendo i colori arancioni per lo stato attivo della modalità manuale.
    - Il nuovo pulsante includerà:
        - Il testo "Manuale" (invece di "MAN").
        - Un piccolo switch animato che cambia posizione e colore in base allo stato `isManualMode`.
        - Manterrà la funzionalità `onToggleManualMode` e il tooltip informativo.

2. **Verifica visiva**:
    - Una volta applicata la modifica, verificherò che il layout della toolbar rimanga armonioso nonostante l'aumento della lunghezza del pulsante (da "MAN" a "Manuale" + toggle).

Procedo con l'implementazione?