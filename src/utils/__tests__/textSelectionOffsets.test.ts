import { describe, expect, it } from 'vitest';
import { JSDOM } from 'jsdom';
import { computeOffsets } from '../textSelection';

describe('computeOffsets', () => {
  it('conta un separatore tra paragrafi anche con wrapper esterno', () => {
    const dom = new JSDOM('<!doctype html><html><body></body></html>');
    const { document } = dom.window;
    (globalThis as any).document = document;
    (globalThis as any).Node = dom.window.Node;
    (globalThis as any).NodeFilter = dom.window.NodeFilter;

    const root = document.createElement('div');
    const body = document.createElement('div');
    const p1 = document.createElement('p');
    const p2 = document.createElement('p');
    p1.textContent = 'Ciao';
    p2.textContent = 'Mondo';
    root.append(p1, p2);
    document.body.append(root);

    const r = document.createRange();
    const t2 = p2.firstChild as Text;
    r.setStart(t2, 0);
    r.setEnd(t2, 5);

    const { start, end, text } = computeOffsets(root, r);
    expect(start).toBe(5);
    expect(end).toBe(10);
    expect(text).toBe('Mondo');
  });

  it('usa il contenitore interno corretto anche con sezioni sibling', () => {
    const dom = new JSDOM('<!doctype html><html><body></body></html>');
    const { document } = dom.window;
    (globalThis as any).document = document;
    (globalThis as any).Node = dom.window.Node;
    (globalThis as any).NodeFilter = dom.window.NodeFilter;

    const root = document.createElement('div');
    const body = document.createElement('div');
    const footnotes = document.createElement('div');
    const p1 = document.createElement('p');
    const p2 = document.createElement('p');
    p1.textContent = 'Uno';
    p2.textContent = 'Due';
    root.append(p1, p2, footnotes);
    document.body.append(root);

    const r = document.createRange();
    const t2 = p2.firstChild as Text;
    r.setStart(t2, 0);
    r.setEnd(t2, 3);

    const { start, end, text } = computeOffsets(root, r);
    expect(start).toBe(4);
    expect(end).toBe(7);
    expect(text).toBe('Due');
  });

  it('ignora contenuti select-none/data-ignore-offset nel calcolo degli offset', () => {
    const dom = new JSDOM('<!doctype html><html><body></body></html>');
    const { document } = dom.window;
    (globalThis as any).document = document;
    (globalThis as any).Node = dom.window.Node;
    (globalThis as any).NodeFilter = dom.window.NodeFilter;

    const root = document.createElement('div');
    const p = document.createElement('p');
    p.append(document.createTextNode('Testo'));
    const sup = document.createElement('sup');
    sup.setAttribute('class', 'select-none');
    sup.setAttribute('data-ignore-offset', 'true');
    sup.append(document.createTextNode('1'));
    p.append(sup);
    p.append(document.createTextNode('Fine'));
    root.append(p);
    document.body.append(root);

    const r = document.createRange();
    const tFine = p.childNodes[p.childNodes.length - 1] as Text;
    r.setStart(tFine, 0);
    r.setEnd(tFine, 4);

    const { start, end, text } = computeOffsets(root, r);
    expect(start).toBe(5);
    expect(end).toBe(9);
    expect(text).toBe('Fine');
  });
});
