// ╔══════════════════════════════════════════════════════════════╗
// ║  SKICA – Kužel: tvarový přechod R (vrch i spodek) – UI          ║
// ╚══════════════════════════════════════════════════════════════╝
// Záložka „Přechod R" kalkulačky Kužel (taperBore.js). Na obou hranách kužele
// jde naráz zadat rádius tečně napojený na čelo (např. Ø se zápichem s R).
// Kužel (Ø nahoře, Ø dole, L, α) se zadává přímo tady – pole jsou zrcadlem
// polí záložky Kužel. Výsledek: průsečík, začátek a konec R, střed R a krajní
// Ø na oblouku (místo pro posuvku) – v Ø a hloubce od vrchu / absolutním Z.

import { safeEvalMath } from '../utils.js';
import { taperFillets } from './taperFilletMath.js';
import { f3 } from './taperBoreMath.js';
import { openInlineEdit, setField, wireSvgEditing } from './svgInlineEdit.js';
import { drawFilletProfile, SK_W, SK_H } from './taperFilletSketch.js';

const LS_KEY = 'skica.taperFillet';
const SIDES = ['B', 'A'];                               // shora dolů
const SIDE_NAME = { B: 'Vrch', A: 'Spodek' };
const FACE = [['out', 'k většímu Ø'], ['in', 'k ose']];
const GIVEN = [['corner', 'průsečík'], ['start', 'začátek R']];

const inp = (attr, id, ph) => '<input type="text" inputmode="decimal" ' + attr + '="' + id + '" placeholder="' + ph + '" autocomplete="off">';
const cell = (id, ph) => '<td>' + inp('data-tf', id, ph) + '</td>';
const cellSel = (id, opts) => '<td><select data-tf="' + id + '">' + opts.map(o => '<option value="' + o[0] + '">' + o[1] + '</option>').join('') + '</select></td>';
const cfld = (id, label, unit, ph) => '<label class="cnc-field"><span>' + label + ' <small>' + unit + '</small></span>' + inp('data-tfc', id, ph) + '</label>';

/** HTML záložky Přechod R. */
export function taperFilletHTML() {
  return '<fieldset class="tb-group tb-r-only" id="tfSection"><legend>Tvarový přechod R <small>(rádius kužel ↔ čelo, vrch i spodek)</small></legend>' +
    '<div class="tp-hint">Klepni v profilu na hodnotu a zadej ji, nebo vyplň pole. Kužel stačí 3 údaje (stejné jako v záložce Kužel).</div>' +
    '<svg class="calc-svg tf-svg" viewBox="0 0 ' + SK_W + ' ' + SK_H + '" role="img" aria-label="Profil s přechody R – klikací kóty"></svg>' +
    '<div class="cnc-fields tf-conef">' +
      cfld('cB', 'Ø nahoře', 'průsečík', 'např. 330') + cfld('cA', 'Ø dole', 'průsečík', '') +
      cfld('cL', 'L', 'délka mm', 'např. 50') + cfld('ca', 'Úhel α', '° sklon k ose', 'např. 10') +
      '<label class="cnc-field"><span>Větší Ø je</span><select data-tfc="cbig"><option value="A">dole</option><option value="B">nahoře</option></select></label>' +
    '</div>' +
    '<table class="tf-grid"><thead><tr><th></th><th>▲ Vrch</th><th>▼ Spodek</th></tr></thead><tbody>' +
      '<tr><th>R <small>mm</small></th>' + cell('RB', 'např. 12') + cell('RA', 'např. 5') + '</tr>' +
      '<tr><th>Čelo od hrany</th>' + cellSel('faceB', FACE) + cellSel('faceA', FACE) + '</tr>' +
      '<tr><th>Úhel čela <small>°</small></th>' + cell('angB', '0 = kolmo') + cell('angA', '0 = kolmo') + '</tr>' +
      '<tr><th>Zadávám</th>' + cellSel('givenB', GIVEN) + cellSel('givenA', GIVEN) + '</tr>' +
      '<tr><th>Ø začátku R <small>na čele</small></th>' + cell('diaB', '—') + cell('diaA', '—') + '</tr>' +
      '<tr><th></th><td><button type="button" class="cnc-btn tf-flip" data-side="B">⇄ Otočit R</button></td>' +
        '<td><button type="button" class="cnc-btn tf-flip" data-side="A">⇄ Otočit R</button></td></tr>' +
    '</tbody></table>' +
    '<div class="tp-hint">Úhel čela: 0 = kolmo k ose, + stoupá k vrchu, − klesá ke spodku. „Zadávám začátek R" = Ø, kde R z čela odbočí – průsečík se dopočítá.</div>' +
    '<div class="cnc-fields">' + cfld('zTop', 'Z čela vrchu', 'nepovinné', 'pro souřadnice Z').replace('data-tfc="zTop"', 'data-tf="zTop"') + '</div>' +
    '<div class="tb-err tf-err"></div><div class="cnc-table-wrap tf-res"></div>' +
    '</fieldset>';
}

/**
 * @param {HTMLElement} root  #tbSection
 * @param {{ onChange: () => void, setConeDia: (side: 'A'|'B', dia: number) => void,
 *           coneField: (key: 'D'|'d'|'L'|'a'|'big') => HTMLInputElement|HTMLSelectElement }} cb
 */
export function initTaperFillet(root, cb) {
  const box = root.querySelector('#tfSection');
  if (!box) return null;
  const $ = id => box.querySelector('[data-tf="' + id + '"]');
  const resEl = box.querySelector('.tf-res');
  const errEl = box.querySelector('.tf-err');
  const svg = box.querySelector('.tf-svg');
  const num = el => { const s = el.value.trim(); if (!s) return null; const v = safeEvalMath(s); return Number.isFinite(v) ? v : NaN; };
  const IDS = ['RB', 'faceB', 'angB', 'givenB', 'diaB', 'RA', 'faceA', 'angA', 'givenA', 'diaA', 'zTop'];
  let last = null;
  let lastArgs = null;                                  // poslední vstup update() pro překreslení

  // ── Zrcadlo polí kužele (záložka Kužel ↔ tady)
  /** @param {string} id */
  function coneEl(id) {
    const big = cb.coneField('big').value;
    if (id === 'cB') return cb.coneField(big === 'B' ? 'D' : 'd');
    if (id === 'cA') return cb.coneField(big === 'A' ? 'D' : 'd');
    if (id === 'cL') return cb.coneField('L');
    if (id === 'ca') return cb.coneField('a');
    return cb.coneField('big');
  }
  const minis = [...box.querySelectorAll('[data-tfc]')];
  function mirrorCone() {
    minis.forEach(el => {
      if (el === document.activeElement) return;
      const src = coneEl(el.dataset.tfc);
      if (!src) return;
      el.value = src.value;
      el.classList.toggle('computed', src.classList.contains('computed'));
    });
  }
  const mini = id => box.querySelector('[data-tfc="' + id + '"]');
  minis.forEach(el => el.addEventListener(el.tagName === 'SELECT' ? 'change' : 'input', () => {
    const id = el.dataset.tfc;
    // Zadané oba Ø (nahoře i dole): kde je větší, se pozná samo – jinak by
    // D vyšlo menší než d a úhel záporný.
    if (id === 'cB' || id === 'cA') {
      const o = mini(id === 'cB' ? 'cA' : 'cB');
      const v = num(el), ov = o.classList.contains('computed') ? null : num(o);
      if (v > 0 && ov > 0 && Math.abs(v - ov) > 1e-9) {
        const top = id === 'cB' ? v : ov, bot = id === 'cB' ? ov : v;
        const want = top > bot ? 'B' : 'A';
        const bigEl = cb.coneField('big');
        if (bigEl.value !== want) {
          bigEl.value = want;
          bigEl.dispatchEvent(new Event('input', { bubbles: true }));
          const D = cb.coneField('D'), d = cb.coneField('d');
          D.value = String(Math.max(v, ov)); D.dispatchEvent(new Event('input', { bubbles: true }));
          d.value = String(Math.min(v, ov)); d.dispatchEvent(new Event('input', { bubbles: true }));
          return;
        }
      }
    }
    const src = coneEl(id);
    if (!src) return;
    src.value = el.value;
    src.dispatchEvent(new Event('input', { bubbles: true }));
  }));

  function syncVisibility() {
    SIDES.forEach(side => {
      const d = $('dia' + side), start = $('given' + side).value === 'start';
      d.disabled = !start;
      d.placeholder = start ? 'Ø na čele' : '—';
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
  /** Otočí rádius na druhou stranu čela (čelo k ose ↔ k většímu Ø). */
  function flip(side) {
    $('face' + side).value = $('face' + side).value === 'in' ? 'out' : 'in';
    save(); cb.onChange();
  }
  box.querySelectorAll('.tf-flip').forEach(b => b.addEventListener('click', () => flip(b.dataset.side)));
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
   * @param {{C?:number|null, L?:number|null, coneDia?:Record<string, number|null>, coneSt?:Record<string, string>, aSt?:string, LSt?:string, err?:string}} [cone] i neúplný kužel (pro profil)
   * @returns {{ sketch: Record<string, any>, text: string[], nc: string[] }}
   */
  function update(sol, bigSide, cone = {}) {
    lastArgs = [sol, bigSide, cone];
    mirrorCone();
    const out = compute(sol, bigSide);
    // Chyba kužele (záložka Kužel je skrytá) – ukázat i tady
    if (cone.err) errEl.textContent = 'Kužel: ' + cone.err + (errEl.textContent ? ' ' + errEl.textContent : '');
    drawProfile(sol, bigSide, cone);
    return out;
  }

  function drawProfile(sol, bigSide, cone) {
    if (!svg) return;
    const zTop = num($('zTop'));
    const inpOf = side => ({
      R: num($('R' + side)) || 0, face: $('face' + side).value, beta: num($('ang' + side)) || 0,
      given: $('given' + side).value, dia: num($('dia' + side)), angRaw: $('ang' + side).value,
    });
    const edges = readEdges();
    const resOf = side => (last && edges[side] && last.edges[side]) || null;
    drawFilletProfile(svg, {
      C: Number.isFinite(cone.C) ? cone.C : sol ? sol.C : null,
      L: Number.isFinite(cone.L) ? cone.L : sol ? sol.L : null,
      bigSide, inp: { A: inpOf('A'), B: inpOf('B') }, res: { A: resOf('A'), B: resOf('B') },
      coneDia: cone.coneDia || { A: null, B: null }, coneSt: cone.coneSt || { A: 'empty', B: 'empty' },
      aSt: cone.aSt || 'empty', LSt: cone.LSt || 'empty', zTop: Number.isFinite(zTop) ? zTop : null,
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
    if (!sol) { last = null; if (!bad.length) errEl.textContent = 'Doplň kužel: stačí 3 údaje z Ø nahoře, Ø dole, L a α (nebo klepni v profilu).'; return out; }

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
        (e.face === 'in' ? 'k ose' : 'k většímu Ø') + (e.beta ? ' pod ' + String(+e.beta.toFixed(3)) + '°' : '') +
        ', tečná délka ' + f3(e.t) + ')</small></td></tr>';
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

  /** Inline editace R (z profilu). */
  function editR(ev, side) {
    openInlineEdit(ev, {
      label: 'Rádius – ' + SIDE_NAME[side].toLowerCase(), unit: 'mm', value: $('R' + side).value,
      hint: 'Prázdné = bez rádiusu (ostrá hrana)',
      choices: [{ value: 'out', text: 'čelo k většímu Ø' }, { value: 'in', text: 'čelo k ose' }], choice: $('face' + side).value,
      onCommit: (v, ch, raw) => { $('face' + side).value = ch; setField($('R' + side), raw); },
    });
  }

  // ── Klikání do profilu
  const commitField = (id, raw) => setField($(id), raw);       // input → přepočet celé kalkulačky
  const coneCommit = (id, raw) => { const src = coneEl(id); if (src) setField(src, raw); };
  if (svg) wireSvgEditing(svg, (key, ev) => {
    const [kind, sideRaw] = key.split(':');
    const side = /** @type {'A'|'B'} */ (sideRaw);
    const nm = side ? SIDE_NAME[side].toLowerCase() : '';
    if (kind === 'R') { editR(ev, side); return; }
    if (kind === 'face') { flip(side); return; }
    if (kind === 'ang') {
      openInlineEdit(ev, {
        label: 'Úhel čela – ' + nm, unit: '°', value: $('ang' + side).value,
        hint: '0 = kolmo k ose, + stoupá k vrchu, − klesá ke spodku (−90 … 90)',
        onCommit: (v, ch, raw) => commitField('ang' + side, raw),
      });
      return;
    }
    if (kind === 'corner') {
      openInlineEdit(ev, {
        label: 'Průsečík – ostrá hrana (' + nm + ')', unit: 'Ø mm',
        value: (() => { const v = lastArgs?.[2]?.coneDia?.[side]; return Number.isFinite(v) ? String(+v.toFixed(4)) : ''; })(),
        hint: 'Ø kužele na hraně; R se počítá od průsečíku',
        onCommit: (v) => {
          if (!(v > 0)) return;
          $('given' + side).value = 'corner'; syncVisibility(); save();
          cb.setConeDia(side, v);
        },
      });
      return;
    }
    if (kind === 'start') {
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
    if (kind === 'alpha') {
      openInlineEdit(ev, {
        label: 'Úhel α kužele', unit: '° sklon k ose', value: coneEl('ca')?.value || '',
        hint: 'Sklon površky k ose (polovina vrcholového úhlu)',
        onCommit: (v, ch, raw) => coneCommit('ca', raw),
      });
      return;
    }
    if (kind === 'L') {
      openInlineEdit(ev, {
        label: 'Délka kužele L', unit: 'mm', value: coneEl('cL')?.value || '',
        hint: 'Podél osy, mezi průsečíky (ostrými hranami)',
        onCommit: (v, ch, raw) => coneCommit('cL', raw),
      });
      return;
    }
    if (kind === 'zTop') {
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
