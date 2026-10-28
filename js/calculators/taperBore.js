// ╔══════════════════════════════════════════════════════════════╗
// ║  SKICA – Kužel v díře / na čepu (UI + náčrt)                 ║
// ╚══════════════════════════════════════════════════════════════╝
// Sekce kalkulačky Kužel: jeden zadaný průměr s tolerancí v určité hloubce,
// kuželovitost a délka → průměry v libovolných hloubkách od obou stran.

import { safeEvalMath } from '../utils.js';
import { showToast } from '../state.js';
import { computeTaperBore, taperC, isoTolerance, f3, fmtDev } from './taperBoreMath.js';

const LS_KEY = 'skica.taperBore';
const NAMES = {
  vs: { A: 'Spodek', B: 'Vrch', a: 'od spodu', b: 'od vrchu' },
  zk: { A: 'Začátek', B: 'Konec', a: 'od začátku', b: 'od konce' },
};

const fld = (id, label, unit, ph, cls = '') =>
  '<label class="cnc-field ' + cls + '"><span>' + label + (unit ? ' <small>' + unit + '</small>' : '') + '</span>' +
  '<input type="text" inputmode="decimal" data-tb="' + id + '" placeholder="' + ph + '" autocomplete="off"></label>';
const sel = (id, label, opts, cls = '') =>
  '<label class="cnc-field ' + cls + '"><span>' + label + '</span><select data-tb="' + id + '">' +
  opts.map(o => '<option value="' + o[0] + '">' + o[1] + '</option>').join('') + '</select></label>';

/** HTML sekce (rozbalovací). */
export function taperBoreHTML() {
  return '<details class="calc-details tb-sec" id="tbSection" open>' +
    '<summary>📐 Kužel s tolerancí – průměry v hloubce</summary>' +
    '<div class="cnc-fields">' +
      sel('kind', 'Typ', [['hole', 'Díra'], ['shaft', 'Čep / hřídel']]) +
      sel('names', 'Strany', [['vs', 'Spodek / Vrch'], ['zk', 'Začátek / Konec']]) +
      fld('D', 'Zadaný Ø', 'mm', 'např. 211') +
      fld('iso', 'Tolerance ISO', '', 'H7, h6… (nebo ručně)') +
      fld('es', 'Horní úchylka', 'mm', '+0.046') +
      fld('ei', 'Dolní úchylka', 'mm', '0') +
      fld('ref', 'Hloubka Ø', 'mm', '0 = na hraně') +
      sel('refSide', 'Hloubka měřena', [['A', 'od spodu'], ['B', 'od vrchu']]) +
      fld('L', 'Délka kužele', 'mm', 'např. 34+135+25') +
      '<label class="cnc-field"><span>Větší Ø je</span><div class="tb-row">' +
        '<select data-tb="big"><option value="A">dole</option><option value="B">nahoře</option></select>' +
        '<button type="button" class="tb-swap" title="Prohodit větší ↔ menší">⇅</button></div></label>' +
      sel('cmode', 'Kuželovitost zadána', [['ratio', '1 : x (poměr)'], ['half', 'α polovrcholový °'], ['full', '2α vrcholový °'], ['c', 'C – změna Ø na 1 mm']]) +
      fld('cval', 'Hodnota', '', 'např. 300') +
    '</div>' +
    '<div class="cnc-table-label">Měřicí místa <small>(hloubka od zvolené strany)</small></div>' +
    '<div class="tb-points"></div>' +
    '<div class="cnc-actions tb-pt-actions">' +
      '<button type="button" class="cnc-btn tb-add">➕ Místo</button>' +
      '<button type="button" class="cnc-btn tb-step" title="Rozepsat rovnoměrně po celé délce">≡ Po krocích</button>' +
    '</div>' +
    '<div class="cnc-info tb-forms"></div>' +
    '<div class="tb-err"></div>' +
    '<div class="cnc-table-wrap cnc-table-tall tb-res"></div>' +
    '<svg class="calc-svg tb-svg" viewBox="0 0 340 350" role="img" aria-label="Náčrt kužele"></svg>' +
    '<div class="cnc-actions">' +
      '<button type="button" class="cnc-btn cnc-btn-clear tb-clear">🗑 Vymazat</button>' +
      '<button type="button" class="cnc-btn cnc-btn-copy tb-copy">📋 Kopírovat</button>' +
    '</div>' +
  '</details>';
}

/** Oživení sekce uvnitř overlaye. */
export function initTaperBore(overlay) {
  const root = overlay.querySelector('#tbSection');
  if (!root) return;
  const $ = id => root.querySelector('[data-tb="' + id + '"]');
  const ptsEl = root.querySelector('.tb-points');
  const resEl = root.querySelector('.tb-res');
  const formsEl = root.querySelector('.tb-forms');
  const errEl = root.querySelector('.tb-err');
  const svg = root.querySelector('.tb-svg');
  const esEl = $('es'), eiEl = $('ei');
  let lastText = '';

  const num = el => { const s = el.value.trim(); if (!s) return null; const v = safeEvalMath(s); return isFinite(v) ? v : NaN; };
  const names = () => NAMES[$('names').value] || NAMES.vs;

  function sideOpts(val) {
    const n = names();
    return [['A', n.a], ['B', n.b], ['AB', 'z obou stran']]
      .map(o => '<option value="' + o[0] + '"' + (o[0] === val ? ' selected' : '') + '>' + o[1] + '</option>').join('');
  }
  function addPoint(depth = '', side = 'AB') {
    const row = document.createElement('div');
    row.className = 'tb-pt';
    row.innerHTML = '<input type="text" inputmode="decimal" class="tb-pt-d" placeholder="hloubka mm" value="' + depth + '">' +
      '<select class="tb-pt-s">' + sideOpts(side) + '</select>' +
      '<button type="button" class="tb-pt-del" title="Odebrat">✕</button>';
    row.querySelector('.tb-pt-del').addEventListener('click', () => { row.remove(); update(); });
    row.querySelectorAll('input,select').forEach(e => e.addEventListener('input', update));
    ptsEl.appendChild(row);
  }
  function relabel() {
    const n = names();
    const rs = $('refSide');
    rs.options[0].textContent = n.a; rs.options[1].textContent = n.b;
    const vertical = $('names').value === 'vs';
    const big = $('big');
    big.options[0].textContent = vertical ? 'dole' : 'na začátku';
    big.options[1].textContent = vertical ? 'nahoře' : 'na konci';
    ptsEl.querySelectorAll('.tb-pt-s').forEach(s => { const v = s.value; s.innerHTML = sideOpts(v); });
  }

  // ISO → úchylky (vyplněné žlutě, dají se přepsat ručně)
  function applyIso() {
    const D = num($('D'));
    const t = isoTolerance($('iso').value, D > 0 ? D : 0);
    $('iso').classList.toggle('tb-bad', !!(t && t.error));
    if (t && !t.error) {
      esEl.value = f3(t.es).replace(/\.?0+$/, '') || '0'; eiEl.value = f3(t.ei).replace(/\.?0+$/, '') || '0';
      esEl.classList.add('computed'); eiEl.classList.add('computed');
    }
    return t;
  }

  function readParams() {
    const pts = [];
    ptsEl.querySelectorAll('.tb-pt').forEach(r => {
      const d = safeEvalMath(r.querySelector('.tb-pt-d').value);
      if (isFinite(d)) pts.push({ depth: d, side: r.querySelector('.tb-pt-s').value });
    });
    return {
      D: num($('D')), es: num(esEl) || 0, ei: num(eiEl) || 0,
      L: num($('L')), refDepth: num($('ref')) || 0, refSide: $('refSide').value,
      C: taperC($('cmode').value, num($('cval'))), bigSide: $('big').value, points: pts,
    };
  }

  function update() {
    relabel();
    save();
    const p = readParams();
    const n = names();
    if (p.D === null && p.L === null) { errEl.textContent = ''; resEl.innerHTML = ''; formsEl.textContent = ''; svg.innerHTML = ''; return; }
    const r = computeTaperBore(p);
    if (r.error) { errEl.textContent = r.error; resEl.innerHTML = ''; formsEl.textContent = ''; svg.innerHTML = ''; return; }
    errEl.textContent = '';
    const fm = r.forms;
    formsEl.textContent = (fm.C > 0 ? '1:' + fm.ratio.toFixed(fm.ratio < 100 ? 3 : 1) : 'válec') +
      '  │  α ' + fm.half.toFixed(5) + '°  │  2α ' + fm.full.toFixed(5) + '°  │  C ' + fm.C.toFixed(6) + '/mm';

    const dev = fmtDev(r.es, r.ei);
    let h = '<table class="cnc-table"><thead><tr><th>#</th><th>Místo</th><th>Ø jmen.</th><th>min</th><th>max</th></tr></thead><tbody>';
    h += '<tr class="tb-end"><td></td><td>' + n.A + ' (hrana)</td><td>' + f3(r.endA) + '</td><td>' + f3(r.endA + r.ei) + '</td><td>' + f3(r.endA + r.es) + '</td></tr>';
    r.rows.forEach((row, i) => {
      h += '<tr' + (row.outside ? ' class="tb-out" title="Mimo délku kužele"' : '') + '><td>' + (i + 1) + '</td><td>' + row.depth + ' ' + (row.side === 'A' ? n.a : n.b) +
        '</td><td><strong>' + f3(row.nom) + '</strong></td><td>' + f3(row.min) + '</td><td>' + f3(row.max) + '</td></tr>';
    });
    h += '<tr class="tb-end"><td></td><td>' + n.B + ' (hrana)</td><td>' + f3(r.endB) + '</td><td>' + f3(r.endB + r.ei) + '</td><td>' + f3(r.endB + r.es) + '</td></tr>';
    h += '</tbody></table>';
    if (r.diffs.length) {
      h += '<div class="tb-diffs">' + r.diffs.map(d => 'Rozdíl ' + n.B.toLowerCase() + ' − ' + n.A.toLowerCase() + ' v hl. ' + d.depth + ': <strong>' + f3(Math.abs(d.diff)) + '</strong> (rozteč ' + f3(d.span) + ' mm)').join('<br>') + '</div>';
    }
    resEl.innerHTML = h;

    const lines = ['Kužel ' + formsEl.textContent, 'Zadáno Ø' + f3(p.D) + ' ' + dev + ' v hl. ' + p.refDepth + ' ' + (p.refSide === 'A' ? n.a : n.b) + ', L=' + f3(p.L)];
    r.rows.forEach(row => lines.push('Ø v hl. ' + row.depth + ' ' + (row.side === 'A' ? n.a : n.b) + ' = ' + f3(row.nom) + ' ' + dev));
    r.diffs.forEach(d => lines.push('Rozdíl v hl. ' + d.depth + ' = ' + f3(Math.abs(d.diff))));
    lastText = lines.join('\n');
    drawSketch(svg, r, p, n, dev, $('kind').value === 'shaft');
  }

  // ── uložení vstupů
  const IDS = ['kind', 'names', 'D', 'iso', 'es', 'ei', 'ref', 'refSide', 'L', 'big', 'cmode', 'cval'];
  function save() {
    try {
      const o = {}; IDS.forEach(id => { o[id] = $(id).value; });
      o.pts = [...ptsEl.querySelectorAll('.tb-pt')].map(r => [r.querySelector('.tb-pt-d').value, r.querySelector('.tb-pt-s').value]);
      o.open = root.open;
      localStorage.setItem(LS_KEY, JSON.stringify(o));
    } catch (e) { /* localStorage nedostupné */ }
  }
  let st = null;
  try { st = JSON.parse(localStorage.getItem(LS_KEY) || 'null'); } catch (e) { /* ignorovat */ }
  if (st) {
    IDS.forEach(id => { if (st[id] !== undefined) $(id).value = st[id]; });
    (st.pts || []).forEach(p => addPoint(p[0], p[1]));
    if (st.open === false) root.open = false;
    if ($('iso').value) applyIso();
  }
  if (!ptsEl.children.length) addPoint();

  IDS.forEach(id => {
    const el = $(id);
    el.addEventListener('input', () => {
      if (id === 'iso' || id === 'D') applyIso();
      if (id === 'es' || id === 'ei') { el.classList.remove('computed'); }
      update();
    });
  });
  root.addEventListener('toggle', save);
  root.querySelector('.tb-swap').addEventListener('click', () => {
    $('big').value = $('big').value === 'A' ? 'B' : 'A'; update();
  });
  root.querySelector('.tb-add').addEventListener('click', () => { addPoint(); ptsEl.lastChild.querySelector('input').focus(); });
  root.querySelector('.tb-step').addEventListener('click', () => {
    const L = num($('L'));
    if (!(L > 0)) { showToast('Nejdřív zadej délku kužele'); return; }
    const s = prompt('Krok mezi měřicími místy [mm]:', String(Math.round(L / 4)));
    const step = s ? safeEvalMath(s) : NaN;
    if (!(step > 0)) return;
    ptsEl.innerHTML = '';
    for (let d = 0; d <= L + 1e-9 && ptsEl.children.length < 60; d += step) addPoint(String(Math.round(d * 1000) / 1000), 'A');
    update();
  });
  root.querySelector('.tb-clear').addEventListener('click', () => {
    IDS.forEach(id => { const el = $(id); if (el.tagName === 'INPUT') { el.value = ''; el.classList.remove('computed'); } });
    ptsEl.innerHTML = ''; addPoint(); update();
  });
  root.querySelector('.tb-copy').addEventListener('click', () => {
    if (!lastText) return;
    navigator.clipboard.writeText(lastText).then(() => showToast('Zkopírováno'));
  });
  update();
}

// ── Náčrt: podélný řez, kuželovitost zveličená ─────────────────
function drawSketch(svg, r, p, n, dev, shaft) {
  const W = 340, top = 50, bot = 318, cx = 170;
  const L = r.L;
  const y = z => bot - (z / L) * (bot - top);           // strana A dole
  const range = Math.abs(r.endB - r.endA) || 1;
  const base = shaft ? 62 : 58;                          // poloviční šířka v místě zadaného Ø
  const hw = z => {
    const d = (r.endA + (r.endB - r.endA) * z / L) - p.D;
    return base + (r.C > 0 ? d / range * 22 : 0);
  };
  const outer = 128;
  const t = (x, yy, s, cls = 'cs-txt', anchor = 'middle') =>
    '<text class="' + cls + '" x="' + x.toFixed(1) + '" y="' + yy.toFixed(1) + '" text-anchor="' + anchor + '">' + s + '</text>';
  const ln = (x1, y1, x2, y2, cls) => '<line class="' + cls + '" x1="' + x1.toFixed(1) + '" y1="' + y1.toFixed(1) + '" x2="' + x2.toFixed(1) + '" y2="' + y2.toFixed(1) + '"/>';
  const arrowV = (x, ya, yb, cls) => {
    const k = ya < yb ? 1 : -1, a = 'cs-arrow-y';
    return ln(x, ya, x, yb, cls) +
      '<path class="' + a + '" d="M' + x + ' ' + ya + ' l-3 ' + 7 * k + ' h6z"/>' +
      '<path class="' + a + '" d="M' + x + ' ' + yb + ' l-3 ' + -7 * k + ' h6z"/>';
  };
  let s = '<defs><pattern id="tbHatch" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">' +
    '<line x1="0" y1="0" x2="0" y2="7" class="tb-hatch"/></pattern></defs>';

  const yA = y(0), yB = y(L);
  if (shaft) {
    s += '<path class="tb-mat" d="M' + (cx - hw(0)) + ' ' + yA + ' L' + (cx - hw(L)) + ' ' + yB + ' L' + (cx + hw(L)) + ' ' + yB + ' L' + (cx + hw(0)) + ' ' + yA + 'Z"/>';
  } else {
    s += '<path class="tb-mat" d="M' + (cx - outer) + ' ' + yA + ' L' + (cx - hw(0)) + ' ' + yA + ' L' + (cx - hw(L)) + ' ' + yB + ' L' + (cx - outer) + ' ' + yB + 'Z"/>';
    s += '<path class="tb-mat" d="M' + (cx + outer) + ' ' + yA + ' L' + (cx + hw(0)) + ' ' + yA + ' L' + (cx + hw(L)) + ' ' + yB + ' L' + (cx + outer) + ' ' + yB + 'Z"/>';
  }
  s += ln(cx, yB - 10, cx, yA + 10, 'cs-axis');

  // Názvy stran + Ø na hranách
  s += t(cx, yB - 12, n.B + ' Ø' + f3(r.endB), 'cs-txt-s');
  s += t(cx, yA + 24, n.A + ' Ø' + f3(r.endA), 'cs-txt-s');

  // Celková délka (vpravo)
  const xL = shaft ? cx + base + 60 : cx + outer + 10;
  s += ln(cx + Math.max(hw(0), hw(L)) + 2, yA, xL + 4, yA, 'cs-ext') + ln(cx + Math.max(hw(0), hw(L)) + 2, yB, xL + 4, yB, 'cs-ext');
  s += arrowV(xL, yB, yA, 'cs-dim');
  s += '<text class="cs-txt-s" transform="translate(' + (xL - 4) + ' ' + ((yA + yB) / 2) + ') rotate(-90)" text-anchor="middle">L ' + f3(L) + '</text>';

  // Zadaný průměr + jeho hloubka (vlevo)
  const zr = r.zRef, yr = y(zr);
  s += ln(cx - hw(zr), yr, cx + hw(zr), yr, 'tb-ref');
  const xR = shaft ? cx - base - 50 : cx - outer - 12;
  const yEdge = p.refSide === 'A' ? yA : yB;
  if (Math.abs(yr - yEdge) > 0.5) {
    s += ln(xR - 4, yr, cx - hw(zr), yr, 'cs-ext');
    s += arrowV(xR, yEdge, yr, 'cs-dim');
    s += '<text class="cs-txt-s" transform="translate(' + (xR - 4) + ' ' + ((yr + yEdge) / 2) + ') rotate(-90)" text-anchor="middle">' + p.refDepth + '</text>';
  }

  // Měřicí místa + zadaný Ø: čáry v pravé výšce, štítky rozložené bez překryvu
  const items = r.rows.filter(x => !x.outside).map(row => ({
    yy: y(row.z), z: row.z, cls: 'tb-pt-t', line: 'tb-pt-l',
    txt: (r.rows.indexOf(row) + 1) + ') \u00D8' + f3(row.nom),
  }));
  items.push({ yy: yr, z: zr, cls: 'tb-ref-t', ref: true, txt: '\u00D8' + f3(p.D).replace(/\.?0+$/, '') + ' ' + dev });
  items.sort((a, b) => a.yy - b.yy);
  const gap = 13, yMin = yB + 14, yMax = yA - 5;
  let prev = -1e9;
  items.forEach(it => { it.ly = Math.max(it.yy + 4, prev + gap, yMin); prev = it.ly; });
  const over = prev - yMax;
  if (over > 0) {   // posunout nahoru, ale ne přes horní okraj
    items.forEach(it => { it.ly -= over; });
    for (let k = 0; k < items.length; k++) items[k].ly = Math.max(items[k].ly, yMin + k * gap);
  }
  const lx = cx - Math.min(hw(0), hw(L)) + 22;
  items.forEach(it => {
    const w = hw(it.z);
    if (!it.ref) s += ln(cx - w, it.yy, cx + w, it.yy, it.line);
    s += ln(cx - w + 2, it.yy, lx - 2, it.ly - 4, it.ref ? 'tb-ref-lead' : it.line);
    s += t(lx, it.ly, it.txt, it.cls, 'start');
  });

  s += t(cx, 12, (r.C > 0 ? 'Kuželovitost 1:' + (r.forms.ratio < 100 ? r.forms.ratio.toFixed(2) : r.forms.ratio.toFixed(0)) + ' (zveličeno)' : 'Válec'), 'cs-txt-s');
  svg.innerHTML = s;
  svg.setAttribute('viewBox', '0 0 ' + W + ' 350');
}
