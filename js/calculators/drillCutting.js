// ╔══════════════════════════════════════════════════════════════╗
// ║  SKICA – Vrták: sekce Řezné podmínky vrtání (UI)             ║
// ╚══════════════════════════════════════════════════════════════╝
//
// Vkládá se do okna Vrták (drill.js); průměr D, úhel σ, délku špičky L
// a hloubku H dostává z geometrie přes update().

import { DRILL_CUT_MATERIALS, recommendedVc, recommendedFeed, drillCutting } from './drillCuttingMath.js';
import { fmt, numVal as val, numField, selectField, outRow, outHint, outWarn, outFormula } from './calcKit.js';

export function drillCuttingHtml() {
  return '<details class="calc-details" id="dcSection">' +
    '<summary>⚙️ Řezné podmínky vrtání</summary>' +
    '<div class="cnc-fields">' +
      '<span class="cnc-field-full">' + selectField('dcMat', 'Materiál', DRILL_CUT_MATERIALS.map((m, i) => [i, m.name])) + '</span>' +
      selectField('dcTool', 'Vrták', [['hss', 'HSS'], ['sk', 'SK (tvrdokov)']]) +
      numField('dcVc', 'vc', 'm/min', 'Řezná rychlost') +
      numField('dcF', 'f', 'mm/ot', 'Posuv') +
      numField('dcApp', 'Nájezd', 'mm', '0', ' value="2"') +
      numField('dcOver', 'Přejezd', 'mm', '0 = slepá díra') +
    '</div>' +
    '<div class="calc-out" id="dcOut"></div>' +
    '<div class="calc-note">Prázdné vc a f = doporučená hodnota pro materiál a vrták (orientačně, rozhoduje katalog). ' +
      'Dráha = nájezd + H + L + přejezd.</div>' +
    '</details>';
}

/**
 * @param {HTMLElement} overlay
 * @returns {{update: (g: {D:number|null, a:number|null, L:number|null, H:number|null}) => void, summary: () => string[]}}
 */
export function wireDrillCutting(overlay) {
  const q = (id) => overlay.querySelector('[data-id="' + id + '"]');
  const inp = { vc: q('dcVc'), f: q('dcF'), app: q('dcApp'), over: q('dcOver') };
  const sel = { mat: q('dcMat'), tool: q('dcTool') };
  const out = overlay.querySelector('#dcOut');
  let geom = { D: null, a: null, L: null, H: null };
  let lines = [];

  function render() {
    lines = [];
    const mat = DRILL_CUT_MATERIALS[parseInt(sel.mat.value, 10)];
    const tool = sel.tool.value;
    const D = geom.D;
    const recVc = recommendedVc(mat, tool);
    const recF = D > 0 ? recommendedFeed(mat, tool, D) : NaN;
    inp.vc.placeholder = 'doporučeno ' + recVc;
    inp.f.placeholder = Number.isFinite(recF) ? 'doporučeno ' + fmt(recF, 3) : 'Posuv';

    if (!(D > 0)) { out.innerHTML = outHint('Zadej průměr vrtáku D nahoře.'); return; }
    if (geom.a === null) { out.innerHTML = outHint('Zadej platný úhel špičky σ nahoře.'); return; }
    const vcIn = val(inp.vc), fIn = val(inp.f), app = val(inp.app), over = val(inp.over);
    const bad = [];                                   // null = prázdné pole → doporučená / nulová hodnota
    if (vcIn !== null && !(vcIn > 0)) bad.push('vc');
    if (fIn !== null && !(fIn > 0)) bad.push('f');
    if (app !== null && !(app >= 0)) bad.push('nájezd');
    if (over !== null && !(over >= 0)) bad.push('přejezd');
    if (bad.length) { out.innerHTML = outWarn('Neplatná hodnota: ' + bad.join(', ') + '.'); return; }
    const vc = vcIn ?? recVc, f = fIn ?? recF;
    const r = drillCutting({
      D, vc, f, kc: mat.kc, sigma: geom.a ?? 118,
      depth: geom.H, tipLen: geom.L ?? 0, approach: app ?? 0, overrun: over ?? 0,
    });
    if (!r) { out.innerHTML = outWarn('Nelze spočítat – zkontroluj vstupy.'); return; }
    const tag = (isRec) => isRec ? ' <small>(doporučeno)</small>' : '';
    let html =
      outRow('vc' + tag(vcIn === null), fmt(vc, 1) + ' m/min') +
      outRow('f' + tag(fIn === null), fmt(f, 3) + ' mm/ot') +
      outRow('Otáčky n', fmt(r.n, 0) + ' min⁻¹') +
      outRow('Posuvová rychlost vf', fmt(r.vf, 0) + ' mm/min');
    if (r.t !== null) {
      html += outRow('Dráha (nájezd + H + L + přejezd)', fmt(r.path, 2) + ' mm') +
        outRow('Strojní čas', fmt(r.t, 2) + ' min (' + fmt(r.t * 60, 0) + ' s)');
    } else {
      html += outHint('Pro strojní čas zadej hloubku H nahoře.');
    }
    html += outRow('Řezný výkon Pc', fmt(r.Pc, 2) + ' kW') +
      outRow('Krouticí moment Mc', fmt(r.Mc, 1) + ' N·m') +
      outRow('Osová síla Ff (≈)', fmt(r.Ff, 0) + ' N') +
      outFormula('kc = ' + mat.kc + ' N/mm² · Pc = f·vc·D·kc / 240 000 · Mc = f·D²·kc / 8 000');
    out.innerHTML = html;
    lines.push('vc=' + fmt(vc, 1) + ' f=' + fmt(f, 3) + ' n=' + fmt(r.n, 0) + ' vf=' + fmt(r.vf, 0) +
      (r.t !== null ? ' t=' + fmt(r.t * 60, 0) + ' s' : '') + ' Pc=' + fmt(r.Pc, 2) + ' kW Mc=' + fmt(r.Mc, 1) + ' Nm');
  }

  Object.values(inp).forEach(i => i.addEventListener('input', render));
  Object.values(sel).forEach(s => s.addEventListener('change', render));

  return {
    update(g) { geom = g; render(); },
    summary() { return lines.slice(); },
  };
}
