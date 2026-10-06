// ╔══════════════════════════════════════════════════════════════╗
// ║  SKICA – Řezné podmínky: sekce G96 (konstantní vc)           ║
// ╚══════════════════════════════════════════════════════════════╝
//
// Vkládá se do okna Řezné podmínky (cutting.js); vc, f a výchozí průměr
// dostává z hlavních polí přes update().

import { g96Time } from './g96Math.js';
import { fmt, numVal as val, numField, outRow, outHint, outWarn, outMain, outFormula } from './calcKit.js';

export function g96Html() {
  return '<details class="calc-details" id="g96Section">' +
    '<summary>🔁 G96 – konstantní řezná rychlost</summary>' +
    '<div class="cnc-fields">' +
      numField('g96D1', 'Ø od', 'mm', 'Ø D nahoře') +
      numField('g96D2', 'Ø do', 'mm', '0 = do osy') +
      numField('g96L', 'L', 'mm osově', '0 = čelení') +
      numField('g96N', 'n max', 'min⁻¹ (LIMS / G50)', 'bez omezení') +
    '</div>' +
    '<div class="calc-out" id="g96Out"></div>' +
    '<div class="calc-note">Vc a f se berou z polí nahoře. Pod mezním průměrem jedou otáčky na limitu ' +
      'a řezná rychlost klesá. Srovnání s G97 = stálé otáčky pro vc na větším průměru.</div>' +
    '</details>';
}

/** @returns {{update: (p: {vc:number|null, f:number|null, D:number|null}) => void, summary: () => string}} */
export function wireG96(overlay) {
  const q = (id) => overlay.querySelector('[data-id="' + id + '"]');
  const inp = { D1: q('g96D1'), D2: q('g96D2'), L: q('g96L'), n: q('g96N') };
  const out = overlay.querySelector('#g96Out');
  let main = { vc: null, f: null, D: null };
  let line = '';

  const rpm = (n) => (Number.isFinite(n) ? fmt(n, 0) : '∞');
  const time = (t) => fmt(t, 2) + ' min (' + fmt(t * 60, 0) + ' s)';

  function render() {
    line = '';
    const { vc, f } = main;
    if (!(vc > 0) || !(f > 0)) { out.innerHTML = outHint('Zadej nahoře Vc a f (posuv) – nebo D + n a f.'); return; }
    const D1in = val(inp.D1), D2in = val(inp.D2), Lin = val(inp.L), nIn = val(inp.n);
    const bad = [];
    if (D1in !== null && !(D1in > 0)) bad.push('Ø od');
    if (D2in !== null && !(D2in >= 0)) bad.push('Ø do');
    if (Lin !== null && !(Lin >= 0)) bad.push('L');
    if (nIn !== null && !(nIn > 0)) bad.push('n max');
    if (bad.length) { out.innerHTML = outWarn('Neplatná hodnota: ' + bad.join(', ') + '.'); return; }
    const D1 = D1in ?? main.D;
    if (!(D1 > 0)) { out.innerHTML = outHint('Zadej Ø od (nebo D nahoře).'); return; }
    const D2 = D2in ?? 0, L = Lin ?? 0;
    const r = g96Time({ vc, f, D1, D2, L, nMax: nIn });
    if (!r) { out.innerHTML = outHint('Zadej dráhu: různé Ø od a do, nebo délku L.'); return; }
    const hi = Math.max(D1, D2), lo = Math.min(D1, D2);
    const save = r.t97 > 0 ? (1 - r.t / r.t97) * 100 : 0;
    let html = outMain('t = ' + time(r.t), 'strojní čas s G96 (dráha ' + fmt(r.s, 2) + ' mm)');
    if (nIn !== null) {
      html += outRow('Mezní průměr (n = n max)', 'Ø ' + fmt(r.Dlim, 2) + ' mm');
      if (r.Dlim > lo) html += outRow('Z toho na limitu otáček', time(r.tLimit));
    }
    html += outRow('Otáčky na Ø ' + fmt(hi), rpm(r.nHi) + ' min⁻¹') +
      outRow('Otáčky na Ø ' + fmt(lo), rpm(r.nLo) + ' min⁻¹') +
      (lo > 0 && r.vcLo < vc - 1e-9 ? outRow('Skutečná vc na Ø ' + fmt(lo), fmt(r.vcLo, 1) + ' m/min') : '') +
      outRow('G97 (stálé ' + rpm(r.nHi) + ' min⁻¹)', time(r.t97)) +
      (save > 0.05 ? outRow('G96 ušetří', fmt(save, 0) + ' %') : '');
    if (nIn === null && lo === 0) html += outWarn('Bez omezení otáček by u osy otáčky rostly nade všechny meze – zadej n max.');
    html += outFormula('t = π·(D₁² − D₂²) / (4000·vc·f) pro čelení bez omezení');
    out.innerHTML = html;
    line = 'G96 Ø' + fmt(hi) + '→Ø' + fmt(lo) + (L ? ' L=' + fmt(L) : '') + ': t=' + fmt(r.t * 60, 0) + ' s' +
      (nIn !== null ? ', Ø lim=' + fmt(r.Dlim, 2) : '') + ', G97 ' + fmt(r.t97 * 60, 0) + ' s';
  }

  Object.values(inp).forEach(i => i.addEventListener('input', render));
  render();

  return {
    update(p) {
      main = p;
      inp.D1.placeholder = p.D > 0 ? 'Ø ' + fmt(p.D) + ' (nahoře)' : 'Ø D nahoře';
      render();
    },
    summary() { return line; },
  };
}
