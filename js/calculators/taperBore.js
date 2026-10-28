// ╔══════════════════════════════════════════════════════════════╗
// ║  SKICA – Kužel (sjednocený: čep i díra, tolerance, hloubky)  ║
// ╚══════════════════════════════════════════════════════════════╝
// Jedna záložka kalkulačky Kužel. Kužel se určí buď ze 3 údajů {D, d, L,
// kuželovitost}, nebo ze zadaného Ø v hloubce (z výkresu) + L + kuželovitosti.
// K tomu tolerance a libovolná měřicí místa od obou stran. Vše jde zadat
// polem i klepnutím do náčrtu (taperBoreSketch.js).

import { safeEvalMath } from '../utils.js';
import { showToast } from '../state.js';
import { computeTaperBore, solveTaper, taperC, taperForms, ratioToC, f3, fmtDev } from './taperBoreMath.js';
import { drawBoreSketch } from './taperBoreSketch.js';
import { openInlineEdit, wireSvgEditing, setField } from './svgInlineEdit.js';

const LS_KEY = 'skica.taperKuzel';
const LS_OLD = 'skica.taperBore';
const NAMES = {
  vs: { A: 'Spodek', B: 'Vrch', a: 'od spodu', b: 'od vrchu', bigA: 'dole', bigB: 'nahoře' },
  zk: { A: 'Začátek', B: 'Konec', a: 'od začátku', b: 'od konce', bigA: 'na začátku', bigB: 'na konci' },
};
const CF = { ratio: 'K', half: 'a' };                 // tvar kuželovitosti → pole (1:x nebo úhel α)
const SOLVE = ['D', 'd', 'L', 'C'];                     // veličiny, které se navzájem dopočítávají

const fld = (id, label, unit, ph) =>
  '<label class="cnc-field"><span>' + label + (unit ? ' <small>' + unit + '</small>' : '') + '</span>' +
  '<input type="text" inputmode="' + (id === 'K' ? 'text' : 'decimal') + '" data-tb="' + id + '" placeholder="' + ph + '" autocomplete="off"></label>';
const sel = (id, label, opts) =>
  '<label class="cnc-field"><span>' + label + '</span><select data-tb="' + id + '">' +
  opts.map(o => '<option value="' + o[0] + '">' + o[1] + '</option>').join('') + '</select></label>';
const group = (title, inner) => '<fieldset class="tb-group"><legend>' + title + '</legend><div class="cnc-fields">' + inner + '</div></fieldset>';

/** HTML záložky Kužel. */
export function taperBoreHTML() {
  return '<div class="tb-sec" id="tbSection">' +
    group('Zobrazení',
      sel('kind', 'Typ', [['hole', 'Díra'], ['shaft', 'Čep / hřídel']]) +
      sel('names', 'Názvy stran', [['vs', 'Spodek / Vrch (svisle, karusel)'], ['zk', 'Začátek / Konec (vodorovně, soustruh)']])) +
    '<div class="tp-hint">Klepni na kótu a zadej hodnotu – stačí 3 údaje (D, d, délka, kuželovitost), nebo Ø z výkresu v hloubce + délka + kuželovitost. Klepnutím do díry přidáš měřicí místo.</div>' +
    '<svg class="calc-svg tb-svg" viewBox="0 0 340 390" role="img" aria-label="Náčrt kužele – klikací kóty"></svg>' +
    '<div class="tb-err"></div>' +
    '<div class="cnc-info tb-forms"></div>' +
    '<div class="cnc-table-wrap cnc-table-tall tb-res"></div>' +
    '<div class="cnc-result tb-slide"></div>' +
    '<div class="cnc-actions">' +
      '<button type="button" class="cnc-btn cnc-btn-copy tb-copy" title="Čitelný přehled">📋 Kopírovat</button>' +
      '<button type="button" class="cnc-btn cnc-btn-copy tb-copy-nc" title="VELKÁ PÍSMENA BEZ DIAKRITIKY – jako komentář v programu">📝 Do programu</button>' +
    '</div>' +
    group('Kužel <small>(stačí 3 údaje)</small>',
      fld('D', 'D', 'velký Ø mm', 'např. 40') +
      fld('d', 'd', 'malý Ø mm', 'např. 37') +
      fld('L', 'L', 'délka mm', 'např. 34+135+25') +
      '<label class="cnc-field"><span>Větší Ø je</span><div class="tb-row">' +
        '<select data-tb="big"><option value="A">dole</option><option value="B">nahoře</option></select>' +
        '<button type="button" class="tb-swap" title="Prohodit větší ↔ menší">⇅</button></div></label>' +
      fld('K', 'Kuželovitost', '1:x nebo a:b', 'např. 300 nebo 7:24') +
      fld('a', 'Úhel \u03B1', '\u00B0 sklon k ose', 'např. 1.43')) +
    group('Ø z výkresu v hloubce <small>(nepovinné)</small>',
      fld('refD', 'Zadaný Ø', 'mm', 'např. 211') +
      fld('ref', 'V hloubce', 'mm', '0 = na hraně') +
      sel('refSide', 'Hloubka měřena', [['A', 'od spodu'], ['B', 'od vrchu']])) +
    group('Tolerance <small>(platí pro všechny průměry)</small>',
      fld('es', 'Horní úchylka', 'max mm', 'např. +0.046') +
      fld('ei', 'Dolní úchylka', 'min mm', 'např. 0')) +
    '<fieldset class="tb-group"><legend>Měřicí místa <small>(hloubka od strany)</small></legend>' +
      '<div class="tb-points"></div>' +
      '<div class="cnc-actions tb-pt-actions">' +
        '<button type="button" class="cnc-btn tb-add">➕ Místo</button>' +
        '<button type="button" class="cnc-btn tb-step" title="Rozepsat rovnoměrně po celé délce">≡ Po krocích</button>' +
      '</div></fieldset>' +
  '</div>';
}

/** Text bez diakritiky velkými písmeny (komentář do NC programu). */
const ncText = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/−/g, '-').replace(/Ø/g, '').toUpperCase();
const trim0 = x => f3(x).replace(/\.?0+$/, '') || '0';
const fmtN = (x, dec) => String(parseFloat(x.toFixed(dec)));

/** Oživení záložky uvnitř overlaye. Vrací API pro tabulky Morse / ISO. */
export function initTaperBore(overlay) {
  const root = overlay.querySelector('#tbSection');
  if (!root) return null;
  const $ = id => root.querySelector('[data-tb="' + id + '"]');
  const ptsEl = root.querySelector('.tb-points');
  const resEl = root.querySelector('.tb-res');
  const formsEl = root.querySelector('.tb-forms');
  const errEl = root.querySelector('.tb-err');
  const slideEl = root.querySelector('.tb-slide');
  const svg = root.querySelector('.tb-svg');
  const esEl = $('es'), eiEl = $('ei');
  let cform = 'ratio';                                  // ve kterém poli je ručně zadaná kuželovitost
  const fieldOf = k => $(k === 'C' ? CF[cform] : k);
  const cFields = () => Object.values(CF).map(id => $(id));
  function clearKey(k) {
    (k === 'C' ? cFields() : [$(k)]).forEach(el => { el.value = ''; el.classList.remove('computed'); });
  }
  let order = [];                                       // ručně zadané z SOLVE (nejnovější na konci)
  let lastText = '', lastNc = '', geo = null;

  const num = el => { const s = el.value.trim(); if (!s) return null; const v = safeEvalMath(s); return isFinite(v) ? v : NaN; };
  const names = () => NAMES[$('names').value] || NAMES.vs;
  const isEdited = k => order.includes(k);
  const okNum = x => x !== null && x !== undefined && Number.isFinite(x);

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
    return row;
  }
  const ptRows = () => [...ptsEl.querySelectorAll('.tb-pt')];
  function relabel() {
    const n = names();
    const rs = $('refSide');
    rs.options[0].textContent = n.a; rs.options[1].textContent = n.b;
    const big = $('big');
    big.options[0].textContent = n.bigA; big.options[1].textContent = n.bigB;
    ptsEl.querySelectorAll('.tb-pt-s').forEach(s => { const v = s.value; s.innerHTML = sideOpts(v); });
  }

  /** Nechá jen tolik ručně zadaných veličin, kolik je potřeba (nejnovější vyhrávají). */
  function trimOrder() {
    if (num($('refD')) > 0) {
      const others = order.filter(k => k !== 'L');
      while (others.length > 1) { const k = others.shift(); order = order.filter(x => x !== k); }
    } else {
      while (order.length > 3) order.shift();
    }
  }

  function writeComputed(k, val) {
    if (!okNum(val)) return;
    if (k === 'C') {
      // všechny tvary kromě toho, který uživatel zadal
      const fm = taperForms(val);
      const txt = { ratio: val > 0 ? fmtN(fm.ratio, 3) : '', half: fmtN(fm.half, 5) };
      Object.keys(CF).forEach(f => {
        if (isEdited('C') && f === cform) return;
        const el = $(CF[f]); el.value = txt[f]; el.classList.add('computed');
      });
      return;
    }
    const el = fieldOf(k);
    el.value = fmtN(val, 4);
    el.classList.add('computed');
  }

  /** Ručně zadaná kuželovitost → C (poměr 1:x nebo a:b, případně úhel α). */
  function cValue() {
    return cform === 'ratio' ? ratioToC($('K').value) : taperC(cform, num(fieldOf('C')));
  }

  function readPoints() {
    return ptRows().map(r => {
      const d = safeEvalMath(r.querySelector('.tb-pt-d').value);
      return { depth: isFinite(d) ? d : NaN, side: r.querySelector('.tb-pt-s').value };
    });
  }

  function taperLabel(C, st) {
    if (st === 'empty') return '1:x = ?';
    const raw = $('K').value.trim();
    if (isEdited('C') && cform === 'ratio' && raw.includes(':') && !/^1\s*:/.test(raw)) return raw.replace(/\s+/g, '') + ' = 1:' + fmtN(1 / C, 3);
    return C > 0 ? '1:x = 1:' + fmtN(1 / C, 2) : 'válec';
  }

  function update() {
    relabel();
    const n = names();
    const bigSide = $('big').value;
    const es = num(esEl) || 0, ei = num(eiEl) || 0;
    const refDia = num($('refD'));
    const ref = refDia > 0 ? { dia: refDia, depth: num($('ref')) || 0, side: $('refSide').value } : null;
    const k = {
      D: isEdited('D') ? num($('D')) : null, d: isEdited('d') ? num($('d')) : null,
      L: isEdited('L') ? num($('L')) : null, C: isEdited('C') ? cValue() : null,
    };
    SOLVE.forEach(key => { if (!isEdited(key)) clearKey(key); });
    if (isEdited('C')) cFields().forEach(el => { if (el !== fieldOf('C')) { el.value = ''; el.classList.remove('computed'); } });
    const sol = solveTaper(k, ref, bigSide);
    sol.computed.forEach(key => writeComputed(key, sol[key]));
    if (!sol.computed.has('C') && okNum(sol.C)) writeComputed('C', sol.C);   // ostatní tvary k ručně zadané kuželovitosti
    save();

    const done = !sol.error && okNum(sol.D) && okNum(sol.d) && okNum(sol.L) && okNum(sol.C);
    const anyInput = SOLVE.some(isEdited) || !!ref;
    const bad = SOLVE.filter(key => isEdited(key) && !Number.isFinite(key === 'C' ? cValue() : num(fieldOf(key))));
    errEl.textContent = bad.length ? 'Neplatný zápis: ' + bad.map(b => b === 'C' ? 'kuželovitost' : b).join(', ') + '.'
      : sol.error && anyInput ? sol.error : sol.warn || '';

    const pts = readPoints();
    const r = done ? computeTaperBore({ D: sol.D, es, ei, L: sol.L, refDepth: 0, refSide: bigSide, C: sol.C, bigSide, points: pts }) : null;
    const ok = r && !r.error;
    const dev = fmtDev(es, ei);

    // Kuželovitost ve všech tvarech + suport
    if (okNum(sol.C)) {
      const fm = taperForms(sol.C);
      formsEl.textContent = (fm.C > 0 ? '1:' + fm.ratio.toFixed(fm.ratio < 100 ? 3 : 1) : 'válec') +
        '  \u2502  \u03B1 ' + fm.half.toFixed(5) + '\u00B0  \u2502  změna \u00D8 ' + fm.C.toFixed(6) + ' mm/mm';
    } else formsEl.textContent = '';
    slideEl.innerHTML = done && sol.C > 0
      ? '🔧 <strong>Náklon suportu:</strong> ' + taperForms(sol.C).half.toFixed(4) + '°<br>' +
        'Příčný přísuv na stranu (= posun koníku na délce L): <strong>' + f3((sol.D - sol.d) / 2) + ' mm</strong>'
      : '';

    // Tabulka
    if (ok) {
      let h = '<table class="cnc-table tb-table"><thead><tr><th>#</th><th>Místo</th><th>Ø jmen.</th><th>min</th><th>max</th></tr></thead><tbody>';
      r.rows.forEach((row, i) => {
        h += '<tr' + (row.outside ? ' class="tb-out" title="Mimo délku kužele"' : '') + '><td>' + (i + 1) + '</td><td>' + row.depth + ' ' + (row.side === 'A' ? n.a : n.b) +
          '</td><td><strong>' + f3(row.nom) + '</strong></td><td>' + f3(row.min) + '</td><td>' + f3(row.max) + '</td></tr>';
      });
      h += '<tr class="tb-end"><td></td><td>' + n.A + ' (hrana)</td><td>' + f3(r.endA) + '</td><td>' + f3(r.endA + ei) + '</td><td>' + f3(r.endA + es) + '</td></tr>';
      h += '<tr class="tb-end"><td></td><td>' + n.B + ' (hrana)</td><td>' + f3(r.endB) + '</td><td>' + f3(r.endB + ei) + '</td><td>' + f3(r.endB + es) + '</td></tr>';
      h += '</tbody></table>';
      if (r.diffs.length) {
        h += '<div class="tb-diffs">' + r.diffs.map(dd => 'Rozdíl ' + n.B.toLowerCase() + ' − ' + n.A.toLowerCase() + ' v hl. ' + dd.depth +
          ': <strong>' + f3(Math.abs(dd.diff)) + '</strong> <small>(rozteč ' + trim0(dd.span) + ' mm)</small>').join('<br>') + '</div>';
      }
      resEl.innerHTML = h;
    } else resEl.innerHTML = '';

    // Texty ke kopírování
    lastText = lastNc = '';
    if (ok) {
      const ratioTxt = sol.C > 0 ? '1:' + trim0(1 / sol.C) : 'válec';
      const lines = ['Kužel ' + ratioTxt + ', D ' + f3(sol.D) + ', d ' + f3(sol.d) + ', L ' + trim0(sol.L) + (es || ei ? ', tolerance ' + dev : '')];
      if (ref) lines.push('Zadáno Ø' + trim0(ref.dia) + ' ' + dev + ' v hl. ' + ref.depth + ' ' + (ref.side === 'A' ? n.a : n.b));
      const nc = [($('kind').value === 'shaft' ? 'Kuželový čep ' : 'Kuželová díra ') + ratioTxt];
      r.rows.forEach(row => {
        lines.push('Ø v hl. ' + row.depth + ' ' + (row.side === 'A' ? n.a : n.b) + ' = ' + f3(row.nom) + ' ' + dev);
        nc.push('Rozměr v hloubce ' + row.depth + ' ' + (row.side === 'A' ? n.a : n.b) + ' je ' + f3(row.nom) + ' ' + dev);
      });
      if (!r.rows.length) nc.push('D ' + f3(sol.D) + ' d ' + f3(sol.d) + ' L ' + trim0(sol.L));
      r.diffs.forEach(dd => {
        lines.push('Rozdíl v hl. ' + dd.depth + ' = ' + f3(Math.abs(dd.diff)));
        nc.push('Rozdíl ' + n.B + ' - ' + n.A + ' v hloubce ' + dd.depth + ' = ' + f3(Math.abs(dd.diff)));
      });
      lastText = lines.join('\n');
      lastNc = ncText(nc.join('\n'));
    }

    // Náčrt (i neúplný – neznámé jako „?")
    const Ld = okNum(sol.L) && sol.L > 0 ? sol.L : 200;
    const stOf = key => isEdited(key) && okNum(k[key]) ? 'val' : okNum(sol[key]) ? 'calc' : 'empty';
    const rows = [];
    if (ok) r.rows.forEach((row, i) => { if (!row.outside) rows.push({ ...row, no: i + 1 }); });
    else {
      let no = 0;
      pts.forEach((pt, i) => {
        if (!(pt.depth >= 0)) return;
        (pt.side === 'AB' ? ['A', 'B'] : [pt.side]).forEach(side => {
          no++;
          const z = side === 'B' ? Ld - pt.depth : pt.depth;
          if (z >= 0 && z <= Ld) rows.push({ side, depth: pt.depth, z, nom: null, pt: i, no });
        });
      });
    }
    let refM = null;
    if (ref) {
      const zRaw = ref.side === 'B' ? Ld - ref.depth : ref.depth;
      refM = { ...ref, depthKnown: $('ref').value.trim() !== '', z: Math.max(0, Math.min(Ld, zRaw)) };
    }
    geo = drawBoreSketch(svg, {
      L: Ld, C: okNum(sol.C) ? sol.C : null, bigSide, names: n, shaft: $('kind').value === 'shaft',
      v: { D: okNum(sol.D) ? sol.D : null, d: okNum(sol.d) ? sol.d : null, L: okNum(sol.L) ? sol.L : null },
      st: { D: stOf('D'), d: stOf('d'), L: stOf('L'), C: stOf('C') },
      taperTxt: taperLabel(sol.C, stOf('C')),
      aTxt: '\u03B1 = ' + (okNum(sol.C) ? fmtN(taperForms(sol.C).half, 4) + '\u00B0' : '?'),
      stForm: f => stOf('C') === 'val' ? (f === cform ? 'val' : 'calc') : stOf('C'),
      ref: refM, rows,
    });
  }

  // ── Kliknutí do náčrtu
  const sideChoices = () => { const n = names(); return [{ value: 'A', text: n.a }, { value: 'B', text: n.b }, { value: 'AB', text: 'z obou' }]; };
  const LABELS = { D: 'D – velký průměr', d: 'd – malý průměr', L: 'Délka kužele L' };
  function editSolve(e, key) {
    if (key === 'C' || key === 'Ca') {
      const el = $(key === 'Ca' ? 'a' : 'K');
      openInlineEdit(e, {
        label: key === 'Ca' ? 'Úhel \u03B1 – sklon k ose' : 'Kuželovitost', unit: key === 'Ca' ? '\u00B0' : '1:x nebo a:b', value: el.value, text: key !== 'Ca',
        hint: key === 'Ca' ? 'Kuželovitost 1:x se dopočítá' : 'např. 300 (= 1:300) nebo libovolný poměr 7:24 – úhel \u03B1 se dopočítá',
        onCommit: (v, ch, raw) => setField(el, raw),
      });
    } else {
      const el = fieldOf(key);
      const hint = isEdited(key) ? 'Prázdné = smazat zadání' : el.value ? 'Dopočítáno – zadáním hodnotu zafixuješ' : '';
      openInlineEdit(e, {
        label: LABELS[key], unit: 'mm', value: el.value, hint: hint || (key === 'L' ? 'Lze i výraz, např. 34+135+25' : ''),
        onCommit: (v, ch, raw) => setField(el, raw),
      });
    }
  }
  wireSvgEditing(svg, (key, e) => {
    const n = names();
    if (SOLVE.includes(key) || key === 'Ca') editSolve(e, key);
    else if (key === 'refD' || key === 'refAdd') {
      openInlineEdit(e, {
        label: 'Ø z výkresu v hloubce', unit: 'mm', value: $('refD').value, hint: 'Prázdné = bez zadaného Ø. Hloubku pak nastavíš klepnutím na „hloubka Ø".',
        onCommit: (v, ch, raw) => setField($('refD'), raw),
      });
    } else if (key === 'ref') {
      openInlineEdit(e, {
        label: 'Hloubka zadaného průměru', unit: 'mm', value: $('ref').value, hint: '0 = průměr na hraně',
        choices: [{ value: 'A', text: n.a }, { value: 'B', text: n.b }], choice: $('refSide').value,
        onCommit: (v, ch, raw) => { $('refSide').value = ch; setField($('ref'), raw); },
      });
    } else if (key === 'swap') {
      $('big').value = $('big').value === 'A' ? 'B' : 'A'; update();
    } else if (key.startsWith('pt:')) {
      const row = ptRows()[+key.slice(3)];
      if (!row) return;
      const inp = row.querySelector('.tb-pt-d'), s = row.querySelector('.tb-pt-s');
      openInlineEdit(e, {
        label: 'Měřicí místo – hloubka', unit: 'mm', value: inp.value, choices: sideChoices(), choice: s.value,
        onCommit: (v, ch, raw) => { s.value = ch; setField(inp, raw); },
        onDelete: () => { row.remove(); update(); },
      });
    }
  }, (e, pt) => {
    // Klepnutí do díry → nové měřicí místo od bližší strany
    const z = geo && geo.zFromY(pt.y);
    if (z === null || z === undefined || Math.abs(pt.x - 170) > 126) return;
    const L = geo.L;
    const side = z < L / 2 ? 'A' : 'B';
    const depth = Math.round((side === 'A' ? z : L - z) * 10) / 10;
    openInlineEdit(e, {
      label: 'Nové měřicí místo – hloubka', unit: 'mm', value: String(depth), choices: sideChoices(), choice: side,
      onCommit: (v, ch, raw) => {
        if (!raw) return;
        const empty = ptRows().find(r => r.querySelector('.tb-pt-d').value.trim() === '');
        const row = empty || addPoint();
        row.querySelector('.tb-pt-s').value = ch;
        setField(row.querySelector('.tb-pt-d'), raw);
      },
    });
  });

  // ── Uložení vstupů (dopočítané hodnoty se neukládají)
  const IDS = ['kind', 'names', 'refD', 'es', 'ei', 'ref', 'refSide', 'big'];
  function save() {
    try {
      const o = { order, cform };
      IDS.forEach(id => { o[id] = $(id).value; });
      SOLVE.forEach(key => { o['v_' + key] = isEdited(key) ? fieldOf(key).value : ''; });
      o.pts = ptRows().map(r => [r.querySelector('.tb-pt-d').value, r.querySelector('.tb-pt-s').value]);
      localStorage.setItem(LS_KEY, JSON.stringify(o));
    } catch (e) { /* localStorage nedostupné */ }
  }
  function restore() {
    let st = null;
    try { st = JSON.parse(localStorage.getItem(LS_KEY) || 'null'); } catch (e) { /* ignorovat */ }
    if (!st) {   // převzít vstupy ze staré záložky „S tolerancí"
      let old = null;
      try { old = JSON.parse(localStorage.getItem(LS_OLD) || 'null'); } catch (e) { /* ignorovat */ }
      if (old) st = { ...old, refD: old.D, v_L: old.L, v_C: old.cval, cform: old.cmode, order: ['L', 'C'] };
    }
    if (!st) return;
    IDS.forEach(id => { if (st[id] !== undefined && st[id] !== null) $(id).value = st[id]; });
    if (st.cform === 'c' && st.v_C) { const c = safeEvalMath(st.v_C); st.v_C = c > 0 ? String(1 / c) : ''; st.cform = 'ratio'; }
    if (st.cform === 'full' && st.v_C) { const a2 = safeEvalMath(st.v_C); st.v_C = a2 > 0 ? String(a2 / 2) : ''; st.cform = 'half'; }
    if (CF[st.cform]) cform = st.cform;
    order = Array.isArray(st.order) ? st.order.filter(key => SOLVE.includes(key) && st['v_' + key]) : [];
    order.forEach(key => { fieldOf(key).value = st['v_' + key]; });
    (st.pts || []).forEach(p => addPoint(p[0], p[1]));
  }
  restore();
  if (!ptsEl.children.length) addPoint();

  const onSolveInput = (key, el, form) => {
    order = order.filter(x => x !== key);
    if (form) {                                         // jeden ze tvarů kuželovitosti
      cform = form;
      cFields().forEach(o => { if (o !== el) { o.value = ''; o.classList.remove('computed'); } });
    }
    if (el.value.trim() !== '') { order.push(key); el.classList.remove('computed'); }
    trimOrder();
    update();
  };
  ['D', 'd', 'L'].forEach(key => $(key).addEventListener('input', () => onSolveInput(key, $(key))));
  Object.entries(CF).forEach(([form, id]) => $(id).addEventListener('input', () => onSolveInput('C', $(id), form)));
  IDS.forEach(id => {
    $(id).addEventListener('input', () => {
      if (id === 'es' || id === 'ei') $(id).classList.remove('computed');
      if (id === 'refD') trimOrder();
      update();
    });
  });
  root.querySelector('.tb-swap').addEventListener('click', () => {
    $('big').value = $('big').value === 'A' ? 'B' : 'A'; update();
  });
  root.querySelector('.tb-add').addEventListener('click', () => { addPoint().querySelector('input').focus(); });
  root.querySelector('.tb-step').addEventListener('click', e => {
    const L = num($('L'));
    if (!(L > 0)) { showToast('Nejdřív zadej délku kužele'); return; }
    openInlineEdit(e, {
      label: 'Krok mezi měřicími místy', unit: 'mm', value: String(Math.round(L / 4)), hint: 'Nahradí současná místa (od spodu, 0 … L)',
      onCommit: step => {
        if (!(step > 0)) return;
        ptsEl.innerHTML = '';
        for (let d = 0; d <= L + 1e-9 && ptsEl.children.length < 60; d += step) addPoint(String(Math.round(d * 1000) / 1000), 'A');
        update();
      },
    });
  });
  function clearAll() {
    order = [];
    root.querySelectorAll('input[data-tb]').forEach(el => { el.value = ''; el.classList.remove('computed', 'tb-bad'); });
    ptsEl.innerHTML = ''; addPoint(); update();
  }
  const copy = t => {
    if (!t) { showToast('Není co kopírovat'); return; }
    navigator.clipboard?.writeText(t).then(() => showToast('Zkopírováno'), () => showToast('Schránka nedostupná'));
  };
  root.querySelector('.tb-copy').addEventListener('click', () => copy(lastText));
  root.querySelector('.tb-copy-nc').addEventListener('click', () => copy(lastNc));
  update();

  return {
    clearAll,
    /** Morse: D, d, L (bez Ø v hloubce). */
    setDdL(D, d, L) {
      $('refD').value = '';
      SOLVE.forEach(clearKey);
      $('D').value = D; $('d').value = d; $('L').value = L;
      order = ['D', 'd', 'L'];
      update();
    },
    /** Metrický / ISO kužel: poměr 1:x, případně velký Ø. */
    setRatio(ratio, D) {
      $('refD').value = '';
      SOLVE.forEach(clearKey);
      cform = 'ratio'; $('K').value = ratio; order = ['C'];
      if (D > 0) { $('D').value = D; order.push('D'); }
      update();
    },
  };
}
