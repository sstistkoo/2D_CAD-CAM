// @vitest-environment happy-dom
// Klik na pozadí okna zavře okno jen tehdy, když i stisk začal na pozadí.
// Po tažení z okna (označování textu v poli, posuvník) puštěném nad pozadím
// vznikne `click` na společném předkovi — pozadí — a okna se dřív zavírala
// (nález č. 8 v docs/plan-refaktoringu-ui.md). Společný helper
// closeOnBackdropClick() v js/dialogFactory.js používají všechna okna.
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';
import { installUiDom } from './helpers/uiDom.mjs';

let ui, df;
const down = (el) => el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));

beforeAll(async () => {
  installUiDom();
  ui = await import('../js/ui.js');
  df = await import('../js/dialogFactory.js');
});
afterEach(() => { document.querySelectorAll('.calc-overlay, .input-overlay').forEach(o => o.remove()); });

/** Tažení z vnitřku puštěné nad pozadím okno nechá; stisk a puštění na pozadí ho zavře. */
function check(getBackdrop, inner, isClosed) {
  down(inner());
  getBackdrop().click();
  expect(isClosed(), 'tažení z okna ven nesmí okno zavřít').toBe(false);
  down(getBackdrop());
  getBackdrop().click();
  expect(isClosed(), 'klik na pozadí okno zavře').toBe(true);
}

describe('klik na pozadí zavře okno jen se stiskem na pozadí', () => {
  it('makeOverlay (okna kalkulaček, Nastavení, poznámky…)', () => {
    const ov = df.makeOverlay('testovaci', 'Test', '<input id="tInp">');
    check(() => ov, () => ov.querySelector('#tInp'), () => !document.body.contains(ov));
  });

  it('makeInputOverlay (vstupní dialogy)', () => {
    const ov = df.makeInputOverlay('<div class="input-dialog"><input id="tInp2"></div>');
    check(() => ov, () => ov.querySelector('#tInp2'), () => !document.body.contains(ov));
  });

  it('dialogy velikosti mřížky a kroku úhlu', () => {
    ui.showGridSizeDialog();
    let ov = document.querySelector('.input-overlay');
    check(() => ov, () => ov.querySelector('#dlgGridSize'), () => !document.body.contains(ov));
    ui.showAngleSnapDialog();
    ov = document.querySelector('.input-overlay');
    check(() => ov, () => ov.querySelector('#dlgAngleStep'), () => !document.body.contains(ov));
  });

  it('nápověda', () => {
    const help = document.getElementById('helpOverlay');
    ui.showHelp();
    check(() => help, () => help.firstElementChild, () => !help.classList.contains('visible'));
  });

  it('closeOnBackdropClick: zavírací funkce dostane událost', () => {
    const el = document.createElement('div');
    el.innerHTML = '<span></span>';
    document.body.appendChild(el);
    const calls = [];
    df.closeOnBackdropClick(el, (e) => calls.push(e.type));
    down(el.firstChild); el.click();
    down(el); el.firstChild.click();
    down(el); el.click();
    expect(calls).toEqual(['click']);
    el.remove();
  });

  it('v js/ už žádné okno nezavírá klikem na pozadí bez kontroly stisku', () => {
    // vzor `addEventListener('click', e => { if (e.target === X) …` na pozadí
    const root = join(import.meta.dirname, '..', 'js');
    const walk = (d, out = []) => { for (const n of readdirSync(d)) { const p = join(d, n); if (statSync(p).isDirectory()) { if (n !== 'lib') walk(p, out); } else if (n.endsWith('.js')) out.push(p); } return out; };
    const bad = [];
    for (const f of walk(root)) {
      const src = readFileSync(f, 'utf8').split('\n');
      src.forEach((line, i) => {
        const ctx = line + (src[i + 1] || '');
        if (/addEventListener\(\s*['"]click['"]/.test(line) && /if \(\s*e\.target(\.id)? === /.test(ctx) && !/downOnBackdrop/.test(ctx)
            && /\.remove\(\)|close|cleanup|hide|finish|cancel|display = 'none'/i.test(ctx)) {
          bad.push(`${relative(root, f)}:${i + 1}`);
        }
      });
    }
    expect(bad, 'použij closeOnBackdropClick() z js/dialogFactory.js').toEqual([]);
  });
});
