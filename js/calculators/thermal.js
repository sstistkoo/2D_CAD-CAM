// ╔══════════════════════════════════════════════════════════════╗
// ║  SKICA – Kalkulačka: tepelná roztažnost                      ║
// ╚══════════════════════════════════════════════════════════════╝
//
// 1) rozměr při teplotě ↔ rozměr při 20 °C (měření teplého dílu)
// 2) teplota pro nalisování za tepla / za studena
// 3) změna vůle spoje z různých materiálů při změně teploty

import { showToast } from '../state.js';
import { makeOverlay } from '../dialogFactory.js';
import { THERMAL_MATERIALS, REF_TEMP, sizeAtTemp, sizeAtRef, shrinkFit, gapChange } from './thermalMath.js';
import {
  fmt, numVal as val, numField, selectField, tabsHtml, wireTabs,
  outRow, outWarn, outHint, outMain, outFormula, copyText,
} from './calcKit.js';

const matOptions = () => [...THERMAL_MATERIALS.map(([k, n, a]) => [k, n + ' (' + a + ')']), ['custom', 'Vlastní α…']];
const matField = (id, label) =>
  selectField(id, label, matOptions()) +
  '<span data-custom-for="' + id + '" style="display:none">' + numField(id + 'A', 'α', '10⁻⁶/K', 'vlastní α') + '</span>';

export function openThermalCalc() {
  const body =
    tabsHtml([['size', 'Rozměr při teplotě'], ['fit', 'Nalisování'], ['gap', 'Vůle spoje']]) +
    '<div data-tab-body="size">' +
      '<div class="cnc-fields">' +
        '<span class="cnc-field-full">' + matField('m1', 'Materiál <small>α v 10⁻⁶/K</small>') + '</span>' +
        selectField('mode', 'Co mám', [['meas', 'Naměřeno při teplotě T → rozměr při 20 °C'], ['nom', 'Rozměr při 20 °C → rozměr při teplotě T']]) +
        numField('L', 'Rozměr', 'mm', 'Ø nebo délka') +
        numField('T', 'Teplota T', '°C', 'teplota dílu') +
      '</div>' +
    '</div>' +
    '<div data-tab-body="fit" style="display:none">' +
      '<div class="cnc-fields">' +
        '<span class="cnc-field-full">' + matField('m2', 'Materiál ohřívané / chlazené součásti') + '</span>' +
        numField('d', 'Ø spoje', 'mm', 'jmenovitý průměr') +
        numField('ov', 'Přesah', 'mm', 'např. 0,08') +
        numField('cl', 'Montážní vůle', 'mm', '0,1–0,2 typicky', ' value="0.1"') +
        numField('t0', 'Teplota okolí', '°C', '20', ' value="20"') +
      '</div>' +
    '</div>' +
    '<div data-tab-body="gap" style="display:none">' +
      '<div class="cnc-fields">' +
        '<span class="cnc-field-full">' + matField('mh', 'Materiál s otvorem (pouzdro, těleso)') + '</span>' +
        '<span class="cnc-field-full">' + matField('ms', 'Materiál hřídele (čep)') + '</span>' +
        numField('dg', 'Ø spoje', 'mm', 'jmenovitý průměr') +
        numField('Tg', 'Provozní teplota', '°C', 'teplota spoje') +
      '</div>' +
    '</div>' +
    '<div class="calc-out" id="thResult"></div>' +
    '<div class="cnc-actions">' +
      '<button class="cnc-btn cnc-btn-clear">🗑 Vymazat</button>' +
      '<button class="cnc-btn cnc-btn-copy">📋 Kopírovat</button>' +
    '</div>' +
    '<div class="calc-note">Lineární model s referenční teplotou 20 °C (ISO 1). α jsou orientační střed pro 20–100 °C, ' +
      'u přesných dílů ji vezmi z materiálového listu. Pro změny stovek K je výpočet jen přibližný (α s teplotou roste).</div>';

  const overlay = makeOverlay('thermal', '🌡️ Tepelná roztažnost', body);
  if (!overlay) return;

  const q = (id) => overlay.querySelector('[data-id="' + id + '"]');
  const inp = {};
  ['m1A', 'L', 'T', 'm2A', 'd', 'ov', 'cl', 't0', 'mhA', 'msA', 'dg', 'Tg'].forEach(k => { inp[k] = q(k); });
  const sel = { m1: q('m1'), mode: q('mode'), m2: q('m2'), mh: q('mh'), ms: q('ms') };
  const resultEl = overlay.querySelector('#thResult');
  let tab = 'size';
  let copyLine = '';

  /** α vybraného materiálu: číslo, null = prázdné vlastní, NaN = neplatné. */
  function alphaOf(id) {
    const custom = sel[id].value === 'custom';
    overlay.querySelector('[data-custom-for="' + id + '"]').style.display = custom ? '' : 'none';
    if (!custom) return THERMAL_MATERIALS.find(m => m[0] === sel[id].value)[2];
    const a = val(inp[id + 'A']);
    return a !== null && !(a > 0) ? NaN : a;
  }
  const matName = (id) => sel[id].selectedOptions[0].textContent;
  const bad = (msg) => { resultEl.innerHTML = outWarn(msg); };
  const um = (mm) => (mm >= 0 ? '+' : '−') + fmt(Math.abs(mm) * 1000, 1) + ' µm';

  function solve() {
    copyLine = '';
    resultEl.innerHTML = '';
    if (tab === 'size') return solveSize();
    if (tab === 'fit') return solveFit();
    return solveGap();
  }

  function solveSize() {
    const a = alphaOf('m1'), L = val(inp.L), T = val(inp.T);
    if (Number.isNaN(a)) return bad('Vlastní α musí být kladné číslo.');
    if ([L, T].some(Number.isNaN) || (L !== null && !(L > 0))) return bad('Neplatný rozměr nebo teplota.');
    if (a === null || L === null || T === null) { resultEl.innerHTML = outHint('Zadej rozměr a teplotu dílu.'); return; }
    const meas = sel.mode.value === 'meas';
    const res = meas ? sizeAtRef(L, a, T) : sizeAtTemp(L, a, T);
    const diff = res - L;
    const perK = L * a * 1e-6 * 1000;                              // µm na 1 K
    resultEl.innerHTML = outMain(fmt(res, 4) + ' mm', meas ? 'rozměr při ' + REF_TEMP + ' °C' : 'rozměr při ' + fmt(T) + ' °C') +
      outRow('Rozdíl proti zadanému', um(diff)) +
      outRow('Roztažnost', fmt(perK, 2) + ' µm na 1 K (' + fmt(perK * 10, 1) + ' µm na 10 K)') +
      (Math.abs(T - REF_TEMP) < 1e-9 ? outHint('Teplota je referenční (20 °C) – rozměr se nemění.') : '') +
      outFormula('L(T) = L₀·(1 + α·(T − 20))');
    copyLine = matName('m1') + ': ' + (meas ? fmt(L, 4) + ' mm při ' + fmt(T) + ' °C = ' + fmt(res, 4) + ' mm při 20 °C'
      : fmt(L, 4) + ' mm při 20 °C = ' + fmt(res, 4) + ' mm při ' + fmt(T) + ' °C');
  }

  function solveFit() {
    const a = alphaOf('m2'), d = val(inp.d), ov = val(inp.ov), cl = val(inp.cl) ?? 0, t0 = val(inp.t0) ?? 20;
    if (Number.isNaN(a)) return bad('Vlastní α musí být kladné číslo.');
    if ([d, ov, cl, t0].some(Number.isNaN)) return bad('Neplatná hodnota.');
    if (a === null || d === null || ov === null) { resultEl.innerHTML = outHint('Zadej materiál, Ø spoje a přesah.'); return; }
    const r = shrinkFit({ d, interference: ov, clearance: cl, alpha: a, T0: t0 });
    if (!r) return bad('Ø spoje musí být kladný, přesah a vůle nesmí být záporné.');
    let html = outMain('ohřev na ' + fmt(r.heated, 0) + ' °C', 'ΔT = ' + fmt(r.dT, 0) + ' K, průměr naroste o ' + fmt(r.dD, 3) + ' mm') +
      outRow('Nebo chlazení na', fmt(r.cooled, 0) + ' °C');
    if (r.heated > 200) html += outWarn('Nad ~200 °C hrozí popuštění kalené oceli a změna struktury; u hliníku a plastů hlídej mez teploty materiálu.');
    if (r.cooled < -196) html += outWarn('Chlazení nelze: potřebná teplota je pod bodem varu dusíku (−196 °C). Použij ohřev.');
    else if (r.cooled < -78) html += outHint('Pod −78 °C (suchý led) je třeba kapalný dusík (−196 °C).');
    else if (r.cooled < -20) html += outHint('Chlazení dosáhne suchý led (−78 °C) nebo kapalný dusík.');
    html += outHint('Ohřívá se součást s otvorem, chladí se hřídel (nebo obojí).') +
      outFormula('ΔT = (přesah + vůle) / (α·d)');
    resultEl.innerHTML = html;
    copyLine = 'Nalisování Ø' + fmt(d) + ', přesah ' + fmt(ov, 3) + ', vůle ' + fmt(cl, 3) + ', ' + matName('m2') + ': ohřev na ' + fmt(r.heated, 0) + ' °C (ΔT ' + fmt(r.dT, 0) + ' K)';
  }

  function solveGap() {
    const ah = alphaOf('mh'), as = alphaOf('ms'), d = val(inp.dg), T = val(inp.Tg);
    if (Number.isNaN(ah) || Number.isNaN(as)) return bad('Vlastní α musí být kladné číslo.');
    if ([d, T].some(Number.isNaN) || (d !== null && !(d > 0))) return bad('Neplatný průměr nebo teplota.');
    if (ah === null || as === null || d === null || T === null) { resultEl.innerHTML = outHint('Zadej materiály, Ø spoje a provozní teplotu.'); return; }
    const g = gapChange({ d, alphaHole: ah, alphaShaft: as, T });
    const dh = sizeAtTemp(d, ah, T) - d, ds = sizeAtTemp(d, as, T) - d;
    resultEl.innerHTML = outMain('vůle ' + (g >= 0 ? 'roste o ' : 'klesá o ') + fmt(Math.abs(g) * 1000, 1) + ' µm', 'při ' + fmt(T) + ' °C proti 20 °C (průměrově)') +
      outRow('Otvor (' + fmt(ah) + ')', um(dh)) + outRow('Hřídel (' + fmt(as) + ')', um(ds)) +
      (g < 0 ? outWarn('Vůle se zmenšuje – u spoje s malou vůlí hrozí zadření.') : '') +
      outFormula('Δvůle = d·(α_otvor − α_hřídel)·(T − 20)');
    copyLine = 'Spoj Ø' + fmt(d) + ' při ' + fmt(T) + ' °C: ' + matName('mh') + ' / ' + matName('ms') + ' → vůle ' + (g >= 0 ? '+' : '−') + fmt(Math.abs(g) * 1000, 1) + ' µm';
  }

  wireTabs(overlay, (id) => {
    tab = id;
    overlay.querySelectorAll('[data-tab-body]').forEach(e => { e.style.display = e.dataset.tabBody === id ? '' : 'none'; });
    solve();
  });
  Object.values(inp).forEach(i => i.addEventListener('input', solve));
  Object.values(sel).forEach(s => s.addEventListener('change', solve));
  overlay.querySelector('.cnc-btn-clear').addEventListener('click', () => {
    ['L', 'T', 'd', 'ov', 'dg', 'Tg'].forEach(k => { inp[k].value = ''; });
    solve();
  });
  overlay.querySelector('.cnc-btn-copy').addEventListener('click', () => {
    if (!copyLine) { showToast('Zadej hodnoty výpočtu'); return; }
    copyText(copyLine);
  });
  solve();
}
