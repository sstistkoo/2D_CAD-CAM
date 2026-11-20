// ╔══════════════════════════════════════════════════════════════╗
// ║  SKICA – Kužel: tvarový přechod R (vrch / spodek) – UI          ║
// ╚══════════════════════════════════════════════════════════════╝
// Skupina polí v kalkulačce Kužel (taperBore.js). Na každé hraně kužele jde
// zadat rádius tečně napojený na čelo. Výsledek: průsečík, začátek R na čele,
// konec R na kuželu, střed R a krajní Ø na oblouku (místo pro posuvku) –
// v Ø a hloubce od vrchu, se zadaným Z čela vrchu i v absolutním Z.

import { safeEvalMath } from '../utils.js';
import { taperFillets } from './taperFilletMath.js';
import { f3 } from './taperBoreMath.js';
import { openInlineEdit, setField, wireSvgEditing } from './svgInlineEdit.js';
import { drawFilletSketch } from './taperFilletSketch.js';

const LS_KEY = 'skica.taperFillet';
const SIDES = ['B', 'A'];                               // shora dolů
const SIDE_NAME = { B: 'Vrch', A: 'Spodek' };

const fld = (id, label, unit, ph) =>
  '<label class="cnc-field" data-tfw="' + id + '"><span>' + label + (unit ? ' <small>' + unit + '</small>' : '') + '</span>' +
  '<input type="text" inputmode="decimal" data-tf="' + id + '" placeholder="' + ph + '" autocomplete="off"></label>';
const sel = (id, label, opts) =>
  '<label class="cnc-field"><span>' + label + '</span><select data-tf="' + id + '">' +
  opts.map(o => '<option value="' + o[0] + '">' + o[1] + '</option>').join('') + '</select></label>';

function edgeHTML(side) {
  return '<div class="tp-hint" style="margin:6px 0 2px"><strong>' + SIDE_NAME[side] + '</strong></div><div class="cnc-fields">' +
    fld('R' + side, 'R', 'mm', side === 'B' ? 'např. 12' : 'např. 5') +
    sel('face' + side, 'Čelo pokračuje', [['out', 'k většímu Ø'], ['in', 'k ose (menší Ø)']]) +
    fld('ang' + side, 'Úhel čela', '° (0 = kolmo k ose, + k vrchu, − ke spodku)', '0, např. -15') +
    sel('given' + side, 'Zadávám', [['corner', 'průsečík = hrana kužele'], ['start', 'začátek R na čele']]) +
    fld('dia' + side, 'Ø začátku R', 'na čele, mm', 'např. 306') +
    '</div>';
}

/** HTML skupiny. */
export function taperFilletHTML() {
  return '<fieldset class="tb-group" id="tfSection"><legend>Tvarový přechod R <small>(nepovinné – rádius kužel ↔ čelo)</small></legend>' +
    '<div class="tp-hint">Klepni v detailu na hodnotu a zadej ji – R, průsečík nebo začátek R na čele, směr a úhel čela. Nahoře přepínáš vrch / spodek.</div>' +
    '<svg class="calc-svg tf-svg" viewBox="0 0 340 300" role="img" aria-label="Detail přechodu R – klikací kóty"></svg>' +
    edgeHTML('B') + edgeHTML('A') +
    '<div class="cnc-fields">' + fld('zTop', 'Z čela vrchu', 'nepovinné', 'pro souřadnice Z') + '</div>' +
    '</fieldset>';
}

/** HTML místa pro výsledky (pod tabulkou kužele). */
export function taperFilletResHTML() {
  return '<div class="tb-err tf-err"></div><div class="cnc-table-wrap tf-res"></div>';
}

/**
 * @param {HTMLElement} root  #tbSection
 * @param {{ onChange: () => void, setConeDia: (side: 'A'|'B', dia: number) => void }} cb
 */
export function initTaperFillet(root, cb) {
  const box = root.querySelector('#tfSection');
  if (!box) return null;
  const $ = id => box.querySelector('[data-tf="' + id + '"]');
  const resEl = root.querySelector('.tf-res');
  const errEl = root.querySelector('.tf-err');
  const num = el => { const s = el.value.trim(); if (!s) return null; const v = safeEvalMath(s); return Number.isFinite(v) ? v : NaN; };
  const IDS = ['RB', 'faceB', 'angB', 'givenB', 'diaB', 'RA', 'faceA', 'angA', 'givenA', 'diaA', 'zTop'];
  let last = null;
  let curSide = 'B';                                    // hrana v detailu
  let lastArgs = null;                                  // poslední vstup update() pro překreslení
  const svg = box.querySelector('.tf-svg');

  function syncVisibility() {
    SIDES.forEach(side => {
      const w = box.querySelector('[data-tfw="dia' + side + '"]');
      if (w) w.style.display = $('given' + side).value === 'start' ? '' : 'none';
    });
  }
  function save() {
    try { const o = {}; IDS.forEach(id => { o[id] = $(id).value; }); localStorage.setItem(LS_KEY, JSON.stringify(o)); } catch { /* bez úložiště */ }
  }
  function restore(bigSide) {
    let st = null;
    try { st = JSON.parse(localStorage.getItem(LS_KEY) || 'null'); } catch { /* ignorovat */ }
    if (st) IDS.forEach(id => { if (st[id] != null) $(id).value = st[id]; });
    else {
      // výchozí: na větším Ø čelo ven (osazení), na menším k ose (čelo konce)
      $('face' + bigSide).value = 'out';
      $('face' + (bigSide === 'A' ? 'B' : 'A')).value = 'in';
    }
    syncVisibility();
  }
  IDS.forEach(id => $(id).addEventListener('input', () => { syncVisibility(); save(); cb.onChange(); }));
  IDS.filter(id => $(id).tagName === 'SELECT').forEach(id => $(id).addEventListener('change', () => { syncVisibility(); save(); cb.onChange(); }));

  /** Vstupy hran (null = bez rádiusu). */
  function readEdges() {
    const e = {};
    SIDES.forEach(side => {
      const R = num($('R' + side));
      e[side] = R > 0 ? { R, face: $('face' + side).value, beta: num($('ang' + side)) || 0, given: $('given' + side).value, dia: num($('dia' + side)) } : null;
    });
    return e;
  }

  /**
   * Přepočet po změně kužele.
   * @param {{D:number,d:number,L:number,C:number}|null} sol  vyřešený kužel (null = neúplný)
   * @param {'A'|'B'} bigSide
   * @param {{C?:number|null, coneDia?:{A:number|null,B:number|null}, coneSt?:{A:string,B:string}}} [cone] i neúplný kužel (pro detail)
   * @returns {{ sketch: Record<string, any>, text: string[], nc: string[] }}
   */
  function update(sol, bigSide, cone = {}) {
    lastArgs = [sol, bigSide, cone];
    const out = compute(sol, bigSide);
    drawDetail(sol, bigSide, cone);
    return out;
  }

  function drawDetail(sol, bigSide, cone) {
    if (!svg) return;
    const edges = readEdges();
    const zTop = num($('zTop'));
    const inputRaw = { R: num($('R' + curSide)) || 0, face: $('face' + curSide).value, beta: num($('ang' + curSide)) || 0,
      given: $('given' + curSide).value, dia: num($('dia' + curSide)) };
    const res = last && last.edges[curSide] && edges[curSide] ? last.edges[curSide] : null;
    drawFilletSketch(svg, {
      side: curSide, input: inputRaw, res, C: Number.isFinite(cone.C) ? cone.C : sol ? sol.C : null, bigSide,
      coneDia: cone.coneDia ? cone.coneDia[curSide] : null, coneSt: cone.coneSt ? cone.coneSt[curSide] : 'empty',
      zTop: Number.isFinite(zTop) ? zTop : null, raw: { face: $('face' + curSide).value, ang: $('ang' + curSide).value },
    });
  }

  function compute(sol, bigSide) {
    const edges = readEdges();
    const bad = [];
    SIDES.forEach(side => {
      ['R', 'dia'].forEach(k => { const el = $(k + side); if (el.value.trim() && !(num(el) >= 0)) bad.push(k === 'R' ? 'R ' + SIDE_NAME[side].toLowerCase() : 'Ø začátku R'); });
      const a = $('ang' + side);
      if (a.value.trim() && !(Math.abs(num(a)) < 90)) bad.push('úhel čela ' + SIDE_NAME[side].toLowerCase() + ' (−90 … 90°)');
    });
    const zTop = num($('zTop'));
    if ($('zTop').value.trim() && !Number.isFinite(zTop)) bad.push('Z čela vrchu');
    const sketch = {};
    SIDES.forEach(side => { if (edges[side]) sketch[side] = { R: edges[side].R, face: edges[side].face, beta: edges[side].beta }; });
    const out = { sketch, text: [], nc: [] };
    resEl.innerHTML = '';
    errEl.textContent = bad.length ? 'Neplatný zápis: ' + bad.join(', ') + '.' : '';
    if (!edges.A && !edges.B) { last = null; return out; }
    if (!sol) { last = null; if (!bad.length) errEl.textContent = 'Pro přechod R nejdřív doplň kužel (D, d, délka, kuželovitost).'; return out; }

    const r = taperFillets({ ...sol, bigSide, edges });
    last = r;
    const L = sol.L;
    const hasZ = Number.isFinite(zTop);
    const depth = z => L - z;
    const zAbs = z => zTop - depth(z);
    const zTxt = z => hasZ ? f3(zAbs(z)) : f3(depth(z));
    const msgs = [];
    if (r.error) msgs.push(r.error);

    let h = '<table class="cnc-table tb-table"><thead><tr><th>Bod <small>(shora dolů)</small></th><th>Ø</th><th>' +
      (hasZ ? 'Z' : 'hl. od vrchu') + '</th></tr></thead><tbody>';
    const row = (name, p, cls = '') => {
      h += '<tr' + (cls ? ' class="' + cls + '"' : '') + '><td>' + name + '</td><td><strong>' + f3(p.dia) + '</strong></td><td>' + zTxt(p.z) + '</td></tr>';
    };
    const text = out.text, nc = out.nc;
    const line = (name, p) => {
      const s = name + ': Ø' + f3(p.dia) + (hasZ ? ' Z' + f3(zAbs(p.z)) : ' hl. ' + f3(depth(p.z)) + ' od vrchu');
      text.push(s); nc.push(s);
    };
    SIDES.forEach(side => {
      const e = r.edges[side];
      if (!e) return;
      const nm = SIDE_NAME[side];
      if (e.error && !e.corner) { msgs.push(nm + ': ' + e.error); return; }
      if (e.error) msgs.push(nm + ' R' + f3(e.R) + ': ' + e.error);
      h += '<tr class="tb-end"><td colspan="3"><strong>' + nm + ' R' + f3(e.R).replace(/\.?0+$/, '') + '</strong> <small>(čelo ' +
        (e.face === 'in' ? 'k ose' : 'k většímu Ø') + ', tečná délka ' + f3(e.t) + ')</small></td></tr>';
      text.push(nm + ' R' + f3(e.R).replace(/\.?0+$/, ''));
      nc.push(nm + ' R' + f3(e.R).replace(/\.?0+$/, ''));
      // pořadí po profilu shora dolů: na vrchu čelo → R → kužel, na spodku kužel → R → čelo
      const seq = side === 'B'
        ? [['Začátek R na čele', e.onFace], ['Konec R na kuželu', e.onCone]]
        : [['Konec kužele / začátek R', e.onCone], ['Konec R na čele', e.onFace]];
      row('Průsečík (ostrá hrana)', e.corner, 'tb-end');
      seq.forEach(([n, p]) => { row(n, p); line(n, p); });
      row('Střed R', e.center, 'tb-end');
      line('Střed R', e.center);
      if (e.maxDia) { row('★ Největší Ø na R (posuvka)', e.maxDia, 'tb-refrow'); line('Největší \u00D8 na R', e.maxDia); }
      if (e.minDia) { row('★ Nejmenší Ø na R', e.minDia, 'tb-refrow'); line('Nejmenší \u00D8 na R', e.minDia); }
      if (Math.abs(e.mismatch) > 5e-4) {
        msgs.push(nm + ': ze začátku R vychází průsečík Ø' + f3(e.corner.dia) + ', kužel má na hraně Ø' +
          f3(e.corner.dia - e.mismatch) + '.');
        h += '<tr><td colspan="3"><button type="button" class="cnc-btn tf-take" data-side="' + side + '">↦ Průsečík Ø' +
          f3(e.corner.dia) + ' převzít do kužele</button></td></tr>';
      }
    });
    h += '</tbody></table>';
    if (!hasZ) h += '<div class="tp-hint">Zadej „Z čela vrchu" a hloubky se přepočtou na souřadnice Z.</div>';
    resEl.innerHTML = h;
    errEl.textContent = bad.length ? 'Neplatný zápis: ' + bad.join(', ') + '.' : msgs.join(' ');
    resEl.querySelectorAll('.tf-take').forEach(b => b.addEventListener('click', () => {
      const e = r.edges[b.dataset.side];
      if (e) cb.setConeDia(b.dataset.side, +e.corner.dia.toFixed(4));
    }));
    return out;
  }

  /** Klepnutí na R v náčrtu. */
  function editR(ev, side) {
    openInlineEdit(ev, {
      label: 'Rádius – ' + SIDE_NAME[side].toLowerCase(), unit: 'mm', value: $('R' + side).value,
      hint: 'Prázdné = bez rádiusu',
      choices: [{ value: 'out', text: 'čelo k většímu Ø' }, { value: 'in', text: 'čelo k ose' }], choice: $('face' + side).value,
      onCommit: (v, ch, raw) => { $('face' + side).value = ch; setField($('R' + side), raw); },
    });
  }

  // ── Klikání do detailu
  const redraw = () => { if (lastArgs) drawDetail(...lastArgs); };
  const commitField = (id, raw) => setField($(id), raw);       // input → přepočet celé kalkulačky
  if (svg) wireSvgEditing(svg, (key, ev) => {
    const side = curSide, nm = SIDE_NAME[side].toLowerCase();
    if (key.startsWith('side:')) { curSide = /** @type {'A'|'B'} */ (key.slice(5)); redraw(); return; }
    if (key === 'R') { editR(ev, side); return; }
    if (key === 'face') {
      $('face' + side).value = $('face' + side).value === 'in' ? 'out' : 'in';
      save(); cb.onChange(); return;
    }
    if (key === 'ang') {
      openInlineEdit(ev, {
        label: 'Úhel čela – ' + nm, unit: '°', value: $('ang' + side).value,
        hint: '0 = kolmo k ose, + stoupá k vrchu, − klesá ke spodku (−90 … 90)',
        onCommit: (v, ch, raw) => commitField('ang' + side, raw),
      });
      return;
    }
    if (key === 'corner') {
      openInlineEdit(ev, {
        label: 'Průsečík – ostrá hrana (' + nm + ')', unit: 'Ø mm',
        value: (() => { const v = lastArgs?.[2]?.coneDia?.[side]; return Number.isFinite(v) ? String(+v.toFixed(4)) : ''; })(),
        hint: 'Zapíše se jako Ø kužele na hraně; R se pak počítá od průsečíku',
        onCommit: (v) => {
          if (!(v > 0)) return;
          $('given' + side).value = 'corner'; syncVisibility(); save();
          cb.setConeDia(side, v);
        },
      });
      return;
    }
    if (key === 'start') {
      openInlineEdit(ev, {
        label: 'Začátek R na čele (' + nm + ')', unit: 'Ø mm', value: $('dia' + side).value,
        hint: 'Ø, kde rádius z čela odbočí – průsečík se dopočítá',
        onCommit: (v, ch, raw) => {
          $('given' + side).value = raw ? 'start' : 'corner'; syncVisibility();
          commitField('dia' + side, raw);
        },
      });
      return;
    }
    if (key === 'zTop') {
      openInlineEdit(ev, {
        label: 'Z čela vrchu', unit: 'mm', value: $('zTop').value, hint: 'Prázdné = hloubky od vrchu',
        onCommit: (v, ch, raw) => commitField('zTop', raw),
      });
    }
  });

  function clear() {
    SIDES.forEach(side => { $('R' + side).value = ''; $('dia' + side).value = ''; $('ang' + side).value = ''; $('given' + side).value = 'corner'; });
    $('zTop').value = '';
    syncVisibility(); save();
  }

  return { restore, update, editR, clear, get last() { return last; } };
}
