# Page Design – Redesign Home (Libreria)
Approccio desktop-first: priorità a chiarezza, scansione visiva e stati di sistema (API, sessione, traduzioni).

## Global Styles (design tokens)
- Background: #121212 (app body), surface: #1e1e1e, border: bianco 10% (rgba)
- Accent primario: Blue “#007AFF”; Success: Emerald; Danger: Red; Warning: Amber
- Tipografia: base 13–14px; titoli 18–24px; microcopy 10–11px (uppercase solo per label)
- Focus: ring 2px accent + outline visibile (mai solo colore);
- Interazioni: hover +1 livello di contrasto; disabled con opacità + descrizione testuale (no “solo grigio”).

## Pagina: Home (Libreria)

### Layout
- Griglia 12 colonne (max-width 1100–1200px, centrata).
- Colonna sinistra (5/12): “Azioni” (caricamento/import + guida rapida).
- Colonna destra (7/12): “Libreria” (gruppi + recenti + stato API/attività).
- Sticky micro-header nella colonna destra: titolo “Libreria”, chip stato API, pulsante attività.
- Breakpoint: sotto ~1024px stack verticale (azioni sopra, libreria sotto). Mantieni CTA primarie always-on-top.

### Meta Information
- Title: “Home – InstantTraducer”
- Description: “Carica un PDF, riprendi un progetto o gestisci la tua libreria.”
- Open Graph: non prioritario (app desktop), ma mantenere coerente per build web.

### Struttura & Componenti (nuova gerarchia)
1) **Banner Stato Sessione (solo se sessione esiste)**
   - Card prominente full-width (prima della griglia) con:
     - Label “Sessione attiva” + titolo progetto (truncate) + lingua (badge) + “Ultima pagina letta”.
     - CTA primaria: “Riprendi” (stessa azione di click card).
     - CTA secondaria/distruttiva: “Chiudi sessione” (con conferma).
   - Accessibilità: card cliccabile deve essere anche focusable (role="button"/button reale), con descrizione ARIA (“Torna alla sessione del libro …”).

2) **Pannello Azioni (colonna sinistra)**
   - **Card “Carica nuovo PDF” (Primary)**
     - Dropzone grande con:
       - Titolo, microcopy (formato supportato), hint drag&drop.
       - Bottone interno “Sfoglia file” (keyboard-first).
     - Stati:
       - Default, Hover/Focus, Drag-over (bordo accent), Disabled in consultazione (con testo “disabilitato”).
     - Error handling UI:
       - File non PDF: toast + inline helper “Solo PDF supportati” (non bloccare UI).
   - **Button “Importa progetto (.gpt)” (Secondary)**
     - Testo + icona; sotto microcopy “Riprende un backup progetto”.

3) **Pannello Libreria (colonna destra)**
   - Header riga:
     - Titolo “Libreria”/“Recenti”
     - Chip stato API (verde “API configurate” / rosso “Configura API”) → apre Impostazioni.
     - Bottone “Attività traduzioni” (summary) → apre modale esistente.
   - **Sezione Gruppi**
     - Chips selezionabili (multi-select); pulsante “+” crea gruppo.
     - Rimozione gruppo su hover (X) ma con target ≥ 24px e aria-label “Elimina gruppo …”.
   - **Lista Recenti (scroll interno)**
     - Prima riga: card “BackgroundTranslationSlot” (se presente).
     - Ogni item:
       - Miniatura, lingua, titolo, pagina, data, gruppi (max 2 + “+n”).
       - Indicatori: PDF mancante (alert), job traduzione (dot), stato attivo (accent + barra laterale).
       - Azioni rapide: rinomina, rimuovi, menu “Altro” (menu contestuale).
       - Loading: overlay/spinner quando “apertura progetto in corso”.

### Stati Vuoti (empty states)
- **Nessun libro recente**: card illustrativa + CTA “Carica nuovo PDF” (rimanda alla dropzone via focus/scroll).
- **Nessun gruppo**: testo “Nessun gruppo” + CTA “Crea gruppo”.
- **API non configurate**: chip rosso + helper “Per tradurre serve una API key” (CTA “Apri impostazioni”).
- **Modalità consultazione**: disabilita upload/import/azioni AI; mostra banner informativo persistente (già presente a livello app) + copy contestuale nelle CTA disabilitate.

### Stati Errore (pattern)
- Pattern coerente: Titolo breve + dettaglio + azione primaria + secondaria.
- Errori Home principali:
  - Import .gpt fallito → “Impossibile importare progetto” + “Riprova / Apri Impostazioni” (se correlato a permessi).
  - Apertura progetto fallita → toast + item resta cliccabile; non lasciare overlay bloccante.
  - PDF originale mancante (flag) → icona alert con tooltip + azione suggerita nel Lettore (ricollega quando necessario).

## Accessibilità (criteri minimi)
- Navigazione tastiera completa: ordine tab logico (Sessione → Carica → Importa → Gruppi → Lista → Menu).
- Focus visibile su tutti i controlli; niente “outline: none” senza alternativa.
- Contrasto: testo secondario mai sotto AA su surface #1e1e1e; usare opacità con cautela.
- Target min: 24px (ideale 32px) per icone (rinomina/elimina/menu).
- Menu contestuale: aria-haspopup="menu", aria-expanded, focus trap nel menu, chiusura con ESC e click-out.
- Annunci di stato: usare aria-live per toast/“apertura progetto…” e per errori file drop.
- Drag&drop: dropzone con istruzioni testuali; supportare alternativa equivalente (bottone file).

---
Nota: questo redesign riordina e rende più espliciti elementi già presenti (sessione, upload/import, gruppi, recenti, stato API/attività) senza introdurre nuove capability.