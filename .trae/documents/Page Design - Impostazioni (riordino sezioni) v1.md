# Page Design — Impostazioni (desktop-first)

## Layout
- Modale centrata max-w ~ 960–1100px, max-h viewport, overlay scuro + blur.
- Griglia 2 colonne: **Nav sinistra (240–280px)** + **contenuto destra (scroll)**.
- Footer sticky con azioni (Annulla / Test / Salva) sempre visibili.
- Responsive: sotto ~900px, nav collassa in dropdown “Sezioni”.

## Meta Information
- Title: `Impostazioni — InstantTraducer`
- Description: `Configura provider AI, traduzione, export e diagnostica.`
- OG: titolo/descrizione come sopra (no immagine obbligatoria).

## Global Styles (token)
- Background: #1a1a1a / surface: rgba(0,0,0,0.30)
- Border: rgba(255,255,255,0.10), radius: 12–16
- Typography: base 12–14px; label uppercase 10px; monospace per chiavi/modelli.
- Primary: #007AFF (hover: #1e66ff). Danger: red-500. Warning: amber-500.
- Focus: ring 1px primary 20% + border primary 50%.

## Page Structure
1) Header: titolo “Impostazioni”, sottotitolo contestuale, close (X).
2) Colonna sinistra: raggruppi con separatori + stato (•) se modifiche pendenti.
3) Colonna destra: sezioni come card stack (1–3 card max per sezione).
4) Footer: validazione (errori/avvisi) + bottoni.

## Sections & Components

### A) Navigazione (sinistra)
**Raggruppi proposti (ordine):**
1. AI & Provider
2. Traduzione
3. Qualità
4. Libreria & Progetti
5. Export
6. Diagnostica
7. Avanzate (Zona Pericolo)

**Comportamenti:**
- Evidenzia sezione attiva; scroll-to-top della colonna destra al cambio sezione.
- Se provider = Gemini mostra “Gemini” sotto “AI & Provider”; se OpenAI mostra “OpenAI”.

### B) Sezione: AI & Provider
**Componenti:**
- Provider switch (2 card: Gemini / OpenAI) con microcopy.
- Sottosezione Provider attivo:
  - Campo API key mascherato + pulsante “Modifica/Annulla”.
  - CTA “Test connessione” con badge stato + messaggio inline.
  - Campo modello: select (Gemini) / input monospace (OpenAI).
  - Parametri: (Gemini) toggle “Modalità Veloce” + sync modello; (OpenAI) select “Ragionamento” e “Dettaglio”.

**Best practice / stati:**
- Non mostrare la chiave in chiaro; in modalità non-edit mostra solo prefisso + pallini.
- Quando passi da “Modifica” a “Annulla”, ripristina valore precedente.
- Se test è “success” mostra pill verde fino a nuova modifica di provider/chiave/modello.

### C) Sezione: Traduzione
**Componenti:**
- Select “Lingua input (default)”.
- Card “Opzioni Traduzione”: toggle contesto legale; select parallelismo; toggle continuità narrativa.
- Card “Prompt di Sistema (Avanzato)”: textarea + CTA “Carica Default” e “Reset”.

**Comportamenti:**
- Il tooltip/info su parallelismo spiega interazione con continuità.
- Testo help sempre sotto controlli (10px) per ridurre ambiguità.

### D) Sezione: Qualità
**Componenti:**
- Toggle “Abilita verifica”.
- Select “Modello verifica” + select “Auto-ritraduzioni (0–2)” disabilitati se verifica OFF.
- Toggle “Verifica Pro” (se applicabile) sincronizzato col modello verifica.

**Comportamenti:**
- Se “Verifica Pro” ON: imposta modello verifica Pro; se selezioni manualmente un modello non-Pro: spegni “Verifica Pro”.

### E) Sezione: Libreria & Progetti
**Componenti:**
- Card “Cartella progetti”: preview path monospace + CTA “Cambia cartella” + “Ripristina default”.
- Card “Cestino”: lista scrollabile; CTA “Ripristina tutto”, “Svuota”; per item: “Ripristina”, “Elimina definitivo”.

**Comportamenti:**
- Azioni distruttive richiedono conferma esplicita; durante operazione: disable bottoni + spinner.

### F) Sezione: Export
**Componenti:**
- Toggle split spread; toggle pagine bianche; select formato; toggle anteprima nel reader.

### G) Sezione: Diagnostica
**Componenti:**
- Toggle “Log di Debug”.
- CTA: Visualizza log / Apri cartella / Pulisci vecchi / Elimina tutto / Test diagnostico.
- Card “Integrità Libreria”: legenda (Info) + grid metriche; azione “pulisci orfani” solo se >0.

**Comportamenti:**
- Per cleanup log: conferma per “Elimina tutto”; per “Pulisci vecchi” feedback con conteggio.

### H) Sezione: Avanzate (Zona Pericolo)
**Componenti:**
- Toggle “Modalità consultazione (offline)”.
- Pulsanti azioni avanzate condizionali (reset/ritraduci, consolida, unisci duplicati, rinomina retroattiva) con colori semantici.

**Comportamenti:**
- Le azioni “pericolose” hanno copy descrittiva + conferma + stato “in corso…”.

## Footer (azioni)
- Area messaggi: mostra errori (rosso) e avvisi (ambra) di validazione.
- Bottoni: Annulla (secondary), Test connessione (secondary), Salva (primary).
- Salva disabilitato se: chiave assente per provider attivo, validazione KO, o operazione in corso.
- Chiusura modale con modifiche non salvate: mostra conferma (Salva / Esci senza salvare / Annulla).
