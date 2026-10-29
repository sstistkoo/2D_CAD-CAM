// CNC Editor – dialog ⌒ Oblouk: obsluha dialogu (cncArcModal.js) nad zástupnými
// DOM prvky – otevření, zadání údajů, přepnutí tečně, vložení řádku.
import { describe, it, expect } from 'vitest';
import { createArcModal, ARC_MODAL_HTML } from '../js/calculators/cncArcModal.js';

function fakeEl(dataset = {}) {
  const handlers = {};
  const cls = new Set();
  return {
    value: '', textContent: '', hidden: false, checked: false, style: {}, dataset,
    classList: {
      toggle(c, on) { if (on === undefined ? !cls.has(c) : on) cls.add(c); else cls.delete(c); },
      add(c) { cls.add(c); }, remove(c) { cls.delete(c); }, contains: (c) => cls.has(c),
    },
    addEventListener(t, fn) { (handlers[t] ||= []).push(fn); },
    fire(t, ev = {}) { (handlers[t] || []).forEach((fn) => fn(ev)); },
  };
}

function setup(code, caret, optsIn = {}) {
  const els = {};
  const ids = ['arcModal', 'arcFrom', 'arcLinkRow', 'arcHint', 'arcX', 'arcZ', 'arcR', 'arcA', 'arcBig', 'arcBigRow', 'arcRes', 'arcInfo'];
  ids.forEach((id) => { els[id] = fakeEl(); });
  const gBtns = [2, 3].map((n) => fakeEl({ arc: 'g', g: String(n) }));
  const linkBtns = ['0', '1'].map((t) => fakeEl({ arc: 'link', tangent: t }));
  const okBtn = fakeEl({ arc: 'ok' });
  const cancelBtn = fakeEl({ arc: 'cancel' });
  els.arcModal.querySelectorAll = (sel) => (sel === '[data-arc="g"]' ? gBtns : sel === '[data-arc="link"]' ? linkBtns : []);
  const editor = { value: code, selectionStart: caret, selectionEnd: caret };
  const inserted = [];
  let backdrop = null;
  const modal = createArcModal({
    $: (id) => els[id] || null,
    editor,
    getOpts: () => ({ diam: false, karusel: false, flip: false, ...optsIn }),
    caretLine: () => code.slice(0, caret).split('\n').length - 1,
    insertLines: (text, label, detail) => inserted.push({ text, label, detail, caret: editor.selectionStart }),
    closeOnBackdropClick: (el, fn) => { backdrop = fn; },
  });
  const click = (b) => els.arcModal.fire('click', { target: { closest: () => b } });
  const type = (id, v) => { els[id].value = v; els.arcModal.fire('input'); };
  return { els, gBtns, linkBtns, okBtn, cancelBtn, modal, inserted, click, type, editor, backdrop: () => backdrop };
}

const LINE = 'G90 G00 X0 Z0\nG01 X0 Z-20';

describe('ARC_MODAL_HTML', () => {
  it('obsahuje všechna pole a používá data-arc (ne data-act)', () => {
    for (const id of ['arcModal', 'arcX', 'arcZ', 'arcR', 'arcA', 'arcBig', 'arcRes', 'arcInfo', 'arcLinkRow']) {
      expect(ARC_MODAL_HTML).toContain(`data-el="${id}"`);
    }
    expect(ARC_MODAL_HTML).not.toContain('data-act=');
  });
});

describe('dialog Oblouk', () => {
  it('netečný oblouk: konec + R → vloží řádek za řádek s kurzorem', () => {
    const t = setup('G90 G00 X0 Z0\nG01 X5 Z-5\nG01 X9 Z-9', 'G90 G00 X0 Z0\nG01 X5 Z-5'.length);
    t.modal.open();
    expect(t.els.arcModal.style.display).toBe('flex');
    expect(t.els.arcFrom.textContent).toContain('konec řádku 2');
    t.click(t.gBtns[1]);                       // G3
    t.type('arcX', '10'); t.type('arcZ', '-10'); t.type('arcR', '10');
    expect(t.els.arcRes.textContent).toBe('→ G3 X10 Z-10 R10');
    t.click(t.okBtn);
    expect(t.inserted).toHaveLength(1);
    expect(t.inserted[0].text).toMatch(/^G3 X10 Z-10 R10 ; ⌒ R10 ∠41.41°$/);
    expect(t.els.arcModal.style.display).toBe('none');
    // kurzor se před vložením přesune na konec řádku, ze kterého oblouk vychází
    expect(t.inserted[0].caret).toBe('G90 G00 X0 Z0\nG01 X5 Z-5'.length);
  });

  it('úhel rozevření místo R dopočte R', () => {
    const t = setup(LINE, LINE.length);
    t.modal.open();
    t.type('arcX', '10'); t.type('arcZ', '-30'); t.type('arcA', '90');
    expect(t.els.arcRes.textContent).toMatch(/^→ G2 X10 Z-30 R10$/);
    expect(t.els.arcInfo.textContent).toContain('úhel 90°');
  });

  it('tečně: řádek Netečně/Tečně je dostupný, smysl určí napojení, vloží T', () => {
    const t = setup(LINE, LINE.length);
    t.modal.open();
    expect(t.els.arcLinkRow.hidden).toBe(false);
    t.click(t.linkBtns[1]);
    expect(t.els.arcBigRow.hidden).toBe(true);
    t.type('arcX', '10'); t.type('arcZ', '-30');
    expect(t.els.arcRes.textContent).toMatch(/^→ G[23] X10 Z-30 T$/);
    expect(t.els.arcInfo.textContent).toContain('smysl určen napojením');
    t.click(t.okBtn);
    expect(t.inserted[0].text).toMatch(/^G[23] X10 Z-30 T ; ⌒ R10 ∠90° tečně$/);
  });

  it('tečně + R + úhel dopočte konec', () => {
    const t = setup(LINE, LINE.length);
    t.modal.open();
    t.click(t.linkBtns[1]);
    t.type('arcR', '10'); t.type('arcA', '90');
    expect(t.els.arcRes.textContent).toMatch(/^→ G2 X-?10 Z-30 T$/);
  });

  it('za G0 se řádek Netečně/Tečně schová a v nápovědě je důvod', () => {
    const t = setup('G90 G00 X0 Z0', 'G90 G00 X0 Z0'.length);
    t.modal.open();
    expect(t.els.arcLinkRow.hidden).toBe(true);
    expect(t.els.arcHint.textContent).toContain('G0');
    t.click(t.linkBtns[1]);                    // tečně se nezapne
    expect(t.els.arcBigRow.hidden).toBe(false);
  });

  it('chybný zápis se jen ohlásí, nic nevloží; prázdné pole chybu nehlásí', () => {
    const t = setup(LINE, LINE.length);
    t.modal.open();
    expect(t.els.arcInfo.textContent).toBe('');
    t.type('arcX', '10'); t.type('arcZ', '-30'); t.type('arcR', '1');
    expect(t.els.arcInfo.textContent).toMatch(/⚠.*menší než půlka/);
    expect(t.els.arcInfo.classList.contains('cne-arc-err')).toBe(true);
    t.click(t.okBtn);
    expect(t.inserted).toHaveLength(0);
    expect(t.els.arcModal.style.display).toBe('flex');
  });

  it('neplatné číslo se ohlásí', () => {
    const t = setup(LINE, LINE.length);
    t.modal.open();
    t.type('arcX', 'abc');
    expect(t.els.arcInfo.textContent).toContain('Neplatné číslo');
  });

  it('výrazy v polích (10+5) fungují', () => {
    const t = setup(LINE, LINE.length);
    t.modal.open();
    t.type('arcX', '5+5'); t.type('arcZ', '-20-10'); t.type('arcR', '10');
    expect(t.els.arcRes.textContent).toMatch(/G2 X10 Z-30 R10/);
  });

  it('velký oblouk (zaškrtávátko) zapíše záporné R', () => {
    const t = setup('G90 G00 X0 Z0', 'G90 G00 X0 Z0'.length);
    t.modal.open();
    t.els.arcBig.checked = true;
    t.type('arcX', '10'); t.type('arcZ', '-10'); t.type('arcR', '10');
    expect(t.els.arcRes.textContent).toBe('→ G2 X10 Z-10 R-10');
  });

  it('Enter potvrdí, Zrušit zavře, otevření dialogu vymaže pole', () => {
    const t = setup(LINE, LINE.length);
    t.modal.open();
    t.type('arcX', '10'); t.type('arcZ', '-30'); t.type('arcR', '10');
    t.els.arcModal.fire('keydown', { key: 'Enter', preventDefault() {} });
    expect(t.inserted).toHaveLength(1);
    t.modal.open();
    expect(t.els.arcX.value).toBe('');
    t.click(t.cancelBtn);
    expect(t.els.arcModal.style.display).toBe('none');
    expect(t.inserted).toHaveLength(1);
  });

  it('bez prvků dialogu (CAM editor) je open() prázdná operace', () => {
    const m = createArcModal({ $: () => null, editor: {}, getOpts: () => ({}), caretLine: () => 0, insertLines() {}, closeOnBackdropClick() {} });
    expect(() => m.open()).not.toThrow();
  });
});
