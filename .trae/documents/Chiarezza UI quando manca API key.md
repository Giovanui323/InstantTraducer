## Problema attuale
- Nel reader, quando una pagina non ha ancora traduzione e non c’è un `pageStatus` attivo, l’overlay mostra comunque uno spinner con testo generico “Preparazione AI Pagina X…”, dando l’impressione che stia lavorando anche se non è partito.
- Se manca la API key, il controllo arriva tardi (o solo su alcuni flussi): per “Riprova”/traduzione singola non c’è pre-check UI e in `processPage` si fanno anche render/estrazioni prima di fallire.
- In Impostazioni, “Test connessione” con key vuota non dà alcun feedback (return silenzioso).

## Obiettivo UX
- Se manca la key: messaggio esplicito e azione guidata (“Apri Impostazioni”) prima di avviare qualunque lavorazione.
- Se la pagina non è in lavorazione: niente spinner “finto”; mostra stato “non avviata” con CTA chiara (Traduci pagina / Traduci tutto).
- Se la pagina è in lavorazione: mostra sempre una frase “reale” (almeno “Avvio…”), e continua a usare le stringhe granulari già prodotte dai log.

## Modifiche previste (senza cambiare architettura)
1. **Pre-check API key lato UI (App.tsx + AppOffline.tsx)**
   - Wrappare `onRetry` passato a ReaderView: se `!isApiConfigured` mostra `showConfirm` con testo chiaro e, su conferma, apre Impostazioni; altrimenti chiama `translation.retranslatePage(page)`.
   - Aggiornare `handleRetranslatePages` (usato dalla toolbar) con lo stesso comportamento.
   - Aggiornare il blocco “Traduci tutto” (oggi solo `log.warning`) per mostrare un dialog UI con bottone “Apri Impostazioni”.

2. **Guard early nel motore di traduzione (useAppTranslation.ts)**
   - All’inizio di `processPage`, prima di render/contesto, controllare che la key del provider selezionato sia presente.
   - Se manca: `updatePageStatus(page, { error: true, loading: 'API non configurate…', processing: 'Bloccato' })` + log pagina, e uscita immediata.
   - Risultato: niente “mezzo lavoro” e feedback immediato in pagina.

3. **Overlay ReaderView più “onesto” (ReaderView.tsx)**
   - Distinguere tre casi:
     - **Idle/pending** (nessun `loading/processing`): mostra testo tipo “Pagina non tradotta” + pulsante “Traduci ora” (che chiama `onRetry`).
     - **In progress** (`loading` o `processing`): mostra `loading`/`processing`; se entrambi vuoti, fallback a “Avvio traduzione…” (non “Preparazione AI…”).
     - **Errore**: continuare a mostrare l’overlay errore; in caso di errore riconducibile a key mancante, rendere il testo più diretto (“API key mancante: apri Impostazioni”).

4. **Feedback in Impostazioni (SettingsModal.tsx)**
   - Se premi “Test connessione” con key vuota: mostra stato/avviso (“Inserisci una API key”) invece di non fare nulla.

## Verifica (dopo implementazione)
- Avvio app senza API key:
  - “Riprova” e “Traduci tutto” aprono un messaggio chiaro e portano alle Impostazioni.
  - `processPage` non renderizza pagine inutilmente e la pagina mostra “API non configurate…”.
- Pagina non avviata:
  - niente spinner infinito; CTA “Traduci ora”.
- Con API key:
  - progress in pagina rispecchia i log (es. “Rendering pagina PDF…”, “In attesa di Gemini…”, ecc.).

Se confermi, applico le modifiche e faccio un giro rapido di test manuale nel reader con e senza key.