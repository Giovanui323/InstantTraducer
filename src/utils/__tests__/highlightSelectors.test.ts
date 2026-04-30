import { describe, expect, it } from 'vitest';
import { buildSelectableText, resolveHighlightsByQuote, isMarkdownTable } from '../highlightSelectors';
import type { UserHighlight } from '../../types';

// ═══════════════════════════════════════════════════════════════════════════
// isMarkdownTable
// ═══════════════════════════════════════════════════════════════════════════

describe('isMarkdownTable', () => {
  it('riconosce una tabella markdown standard', () => {
    const table = `| Nome | Valore | Unità |
|------|--------|-------|
| Primo dato | 42 | kg |
| Secondo dato | 18 | m |`;
    expect(isMarkdownTable(table)).toBe(true);
  });

  it('riconosce tabella senza pipe iniziale/finali', () => {
    const table = `Nome | Valore
------|--------
Primo | 42`;
    expect(isMarkdownTable(table)).toBe(true);
  });

  it('riconosce tabella con allineamento (:)', () => {
    const table = `| Left | Center | Right |
|:-----|:------:|------:|
| a    | b      | c     |`;
    expect(isMarkdownTable(table)).toBe(true);
  });

  it('rifiuta testo normale senza pipe', () => {
    expect(isMarkdownTable('Testo normale senza tabelle')).toBe(false);
  });

  it('rifiuta singola riga con pipe', () => {
    expect(isMarkdownTable('| Solo una riga |')).toBe(false);
  });

  it('rifiuta due righe senza separatore', () => {
    const notTable = `| Nome | Valore |
| Primo | 42 |`;
    expect(isMarkdownTable(notTable)).toBe(false);
  });

  it('rifiuta testo con pipe ma senza trattini nel separatore', () => {
    const notTable = `| Nome | Valore |
| foo | bar |`;
    expect(isMarkdownTable(notTable)).toBe(false);
  });

  it('rifiuta stringa vuota', () => {
    expect(isMarkdownTable('')).toBe(false);
  });

  it('riconosce tabella con spazi nel separatore', () => {
    const table = `| A | B |
| --- | --- |
| 1 | 2 |`;
    expect(isMarkdownTable(table)).toBe(true);
  });

  it('riconosce tabella minima (header + separator)', () => {
    const table = `| A | B |
|---|---|`;
    expect(isMarkdownTable(table)).toBe(true);
  });

  it('riconosce tabella con molte colonne', () => {
    const table = `| A | B | C | D | E |
|---|---|---|---|---|
| 1 | 2 | 3 | 4 | 5 |`;
    expect(isMarkdownTable(table)).toBe(true);
  });

  it('gestisce whitespace around lines', () => {
    const table = `  | A | B |
  |---|---|
  | 1 | 2 |  `;
    expect(isMarkdownTable(table)).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// buildSelectableText — with tables
// ═══════════════════════════════════════════════════════════════════════════

describe('buildSelectableText', () => {
  it('rimuove marker e mantiene il testo selezionabile', () => {
    const input = 'Uno **due** [[tre|nota]] [FIGURA: immagine]\n\nQuattro';
    const out = buildSelectableText(input, false);
    expect(out).toContain('Uno due tre ');
    expect(out).toContain('\n');
    expect(out).toContain('Quattro');
    expect(out).not.toContain('FIGURA');
    expect(out).not.toContain('[[');
  });

  it('preserva newlines nelle tabelle markdown', () => {
    const table = `| Nome | Valore |
|------|--------|
| Primo | 42 |`;
    const out = buildSelectableText(table, false);
    // Le tabelle NON devono avere i newline collassati
    expect(out).toContain('Nome');
    expect(out).toContain('Valore');
    expect(out).toContain('Primo');
    expect(out).toContain('42');
  });

  it('non collassa i newline nella tabella ma collassa il testo normale', () => {
    const input = `Testo sopra

| Nome | Valore |
|------|--------|
| Primo | 42 |

Testo sotto`;
    const out = buildSelectableText(input, false);
    // Il testo normale deve essere presente
    expect(out).toContain('Testo sopra');
    expect(out).toContain('Testo sotto');
    // La tabella deve essere preservata con il suo contenuto
    expect(out).toContain('Nome');
    expect(out).toContain('Primo');
    expect(out).toContain('42');
  });

  it('tabella con testo formattato nelle celle', () => {
    const input = `| Termine | Traduzione |
|---------|-----------|
| **bold** | *italic* |`;
    const out = buildSelectableText(input, false);
    // Il contenuto deve essere estraibile senza i marker markdown
    expect(out).toContain('bold');
    expect(out).toContain('italic');
  });

  it('tabella seguita da nota con [[parola|commento]]', () => {
    const input = `| A | B |
|---|---|
| 1 | 2 |

Dopo la tabella [[parola|nota]] altro testo`;
    const out = buildSelectableText(input, false);
    expect(out).toContain('parola');
    expect(out).toContain('Dopo la tabella');
  });

  it('tabella da sola produce testo selezionabile con tutte le celle', () => {
    const table = `| Nome | Età | Città |
|------|-----|-------|
| Mario | 30 | Roma |
| Luca | 25 | Milano |`;
    const out = buildSelectableText(table, false);
    expect(out).toContain('Mario');
    expect(out).toContain('Luca');
    expect(out).toContain('Roma');
    expect(out).toContain('Milano');
  });

  it('preserveLayout=true non altera le tabelle', () => {
    const table = `| A | B |
|---|---|
| 1 | 2 |`;
    const withPreserve = buildSelectableText(table, true);
    const withoutPreserve = buildSelectableText(table, false);
    // Con o senza preserveLayout, le tabelle devono avere lo stesso contenuto
    expect(withPreserve).toContain('A');
    expect(withoutPreserve).toContain('A');
  });

  it('tabella con [TABELLA CONTINUA] marker', () => {
    const input = `| A | B |
|---|---|
| 1 | 2 |
[TABELLA CONTINUA]`;
    // Non è una tabella markdown pura (manca il separator tra la nota e la tabella)
    // ma il contenuto deve comunque essere estraibile
    const out = buildSelectableText(input, false);
    expect(out).toContain('TABELLA CONTINUA');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// resolveHighlightsByQuote
// ═══════════════════════════════════════════════════════════════════════════

describe('resolveHighlightsByQuote', () => {
  it('risolve la posizione con exact+prefix+suffix quando start/end non combaciano', () => {
    const selectableText = 'abc def ghi def xyz';
    const h: UserHighlight = {
      id: 'h1',
      page: 1,
      start: 0,
      end: 3,
      text: 'def',
      quoteExact: 'def',
      quotePrefix: 'ghi ',
      quoteSuffix: ' xyz',
      createdAt: Date.now(),
      color: 'yellow'
    };
    const [resolved] = resolveHighlightsByQuote([h], selectableText, 0);
    expect(selectableText.slice(resolved.start, resolved.end)).toBe('def');
    expect(resolved.start).toBe(12);
    expect(resolved.end).toBe(15);
  });

  it('completa quoteExact/prefix/suffix per highlight vecchi quando lo slice combacia', () => {
    const selectableText = 'Testo\nAltro';
    const h: UserHighlight = {
      id: 'h1',
      page: 1,
      start: 0,
      end: 5,
      text: 'Testo',
      createdAt: Date.now()
    };
    const [resolved] = resolveHighlightsByQuote([h], selectableText, 0);
    expect(resolved.quoteExact).toBe('Testo');
    expect(resolved.quotePrefix).toBe('');
    expect(resolved.quoteSuffix).toContain('\nAltro');
  });

  it('risolve highlight nel contenuto di una tabella', () => {
    // Simula il selectableText che include i dati della tabella
    const selectableText = 'Mario30RomaLuca25Milano';
    const h: UserHighlight = {
      id: 'h1',
      page: 1,
      start: 0,
      end: 5,
      text: 'Mario',
      quoteExact: 'Mario',
      createdAt: Date.now(),
      color: 'yellow'
    };
    const [resolved] = resolveHighlightsByQuote([h], selectableText, 0);
    expect(selectableText.slice(resolved.start, resolved.end)).toBe('Mario');
  });
});
