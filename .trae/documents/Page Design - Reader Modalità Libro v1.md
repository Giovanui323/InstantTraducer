# Page Design - Reader Modalità Libro (desktop-first)

## Global Styles (Design tokens)
- Background app: `--app-bg` (dipende dal preset “paper/sepia/gray/black”).
- Surface pagina: `--page-bg` (leggermente diverso da `--app-bg` per stacco), bordo `--page-border`.
- Text: `--text-primary`, `--text-secondary`.
- Accent: `--accent` (azioni primarie, slider, focus ring).
- Focus: `outline: 2px solid var(--accent)` + `outline-offset: 2px` (solo `:focus-visible`).
- Typography (scala): 12/14/16/20/24; font UI sans; numeri pagina monospaced opzionale.
- Motion: transizioni 120–180ms; disattivare/semplificare con `prefers-reduced-motion`.

## Page: Libreria
### Meta Information
- Title: “Libreria”
- Description: “Seleziona un documento e riprendi la lettura.”
- Open Graph: titolo + descrizione essenziali.

### Layout
- CSS Grid: 1 colonna contenuto + (opzionale) colonna laterale info su schermi XL.
- Spacing: 24px padding desktop; card gap 16px.

### Page Structure
1. **Header**
   - Titolo pagina “Libreria”.
   - Campo ricerca (input con label visibile o aria-label, placeholder non sostitutivo della label).
2. **Grid documenti**
   - Card documento: titolo + CTA “Apri”.
   - Badge “Continua” quando esiste stato salvato (es. “Pag. 120”).
3. **Empty / Loading states**
   - Messaggio chiaro; pulsanti sempre raggiungibili da tastiera.

### Interaction & Accessibility
- Navigazione: Tab/Shift+Tab tra ricerca e card; Enter su card/CTA apre.
- Stati: hover discreto; focus ring evidente; card con `role="link"` solo se semanticamente corretto (preferire `<a>`/`<button>`).

## Page: Lettore (Modalità Libro)
### Meta Information
- Title: “Lettore” + nome documento
- Description: “Lettura in modalità libro con controlli di comfort.”
- Open Graph: opzionale, non fondamentale per app interna.

### Layout
- Struttura principale: Flex verticale.
  - Top: toolbar (altezza fissa).
  - Center: area lettura (flex: 1) con canvas/render.
  - Overlay: pannello impostazioni (drawer laterale destro su desktop).
- Area lettura: contenitore centrato con max-width; background app dietro.

### Page Structure & Components
1. **Toolbar (sempre visibile su desktop)**
   - Sinistra: “Torna alla libreria”.
   - Centro: indicatore pagina (es. “120 / 350”) e controlli pagina Prev/Next.
   - Destra: Zoom - / +, Reset zoom, toggle 1 pagina / 2 pagine, pulsante “Aspetto”.
   - Accessibilità: ogni icona ha label testuale (visibile o aria-label), tooltip non essenziale.

2. **Area Lettura (book stage)**
   - “Pagina” come card elevata: ombra leggera, bordo sottile, padding interno che simula margini.
   - Modalità 2 pagine (spread): due superfici pagina affiancate con gutter centrale; allineamento verticale; stessa altezza.
   - Panning: drag sul contenuto quando zoom > 1 (cursore “grab/grabbing”); su tastiera, pan non obbligatorio ma consentire reset.
   - Zoom: mantenere punto focale (zoom verso centro o verso puntatore se definito).

3. **Pannello “Aspetto” (drawer)**
   - Sezione “Sfondo”: preset (paper/sepia/gray/black) come radio card.
   - Sezione “Temperatura”: slider freddo↔caldo (con step e valori etichettati).
   - Sezione “Luminosità”: slider chiaro↔scuro (o 3 step: light/dim/dark).
   - Azioni: “Ripristina predefiniti” (con conferma non distruttiva).
   - A11y: focus trap; `Esc` chiude; click outside chiude; descrizioni per slider con `aria-valuetext`.

4. **Persistenza e feedback**
   - Salvataggio stato silenzioso; mostrare feedback solo su errori.
   - In caso di ripristino: breve toast “Ripreso da Pag. X” (auto-dismiss, annunciato con `aria-live="polite"`).

### Responsive behavior (desktop-first)
- ≥1280px: spread di default se spazio sufficiente.
- 768–1279px: spread solo se leggibile; altrimenti singola pagina.
- <768px (se supportato): toolbar compatta, pannello impostazioni full-screen.

### Accessibility checklist (da rispettare in UI)
- Tutte le azioni principali eseguibili da tastiera (prev/next, zoom, apri/chiudi pannello).
- Focus visibile e non rimosso.
- Contrasto: garantire leggibilità dei testi UI su tutti i preset.
- Riduzione movimento: transizioni pagina e auto-hide controlli disattivati o minimizzati.
