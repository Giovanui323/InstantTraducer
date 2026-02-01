L'utente segnala che la regolazione "caldo o freddo" (temperatura colore) non funziona. Dall'analisi del codice è emerso che, sebbene lo stato `temperature` venga correttamente gestito e salvato in `localStorage`, non viene mai applicato visivamente alla vista principale, a differenza della `brightness` (luminosità).

Ecco i passaggi per risolvere il problema:

1. **Modifica di** **`src/App.tsx`**:

   * Aggiungerò un overlay visivo all'interno del tag `<main>` che reagisca al valore di `temperature`.

   * L'overlay utilizzerà un colore caldo (arancione/ambra) per valori positivi e un colore freddo (azzurro/blu) per valori negativi.

   * L'opacità dell'overlay sarà proporzionale all'intensità impostata dall'utente (da -100 a 100).

   * Verrà utilizzata la proprietà CSS `pointer-events-none` per garantire che l'overlay non interferisca con le interazioni dell'utente (click, selezione testo, ecc.).

   * Verrà aggiunta una transizione fluida (`transition-colors`) per rendere il cambio di temperatura più gradevole.

2. **Verifica**:

   * Verificherò che muovendo lo slider nella `ControlsBar`, il colore della pagina cambi effettivamente.

   * Verificherò che la luminosità continui a funzionare correttamente insieme alla temperatura.

