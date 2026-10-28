// ╔══════════════════════════════════════════════════════════════╗
// ║  SKICA – Kužel s tolerancí: průměry v hloubce (UI)           ║
// ╚══════════════════════════════════════════════════════════════╝
// Záložka kalkulačky Kužel: jeden zadaný průměr s tolerancí v určité hloubce,
// kuželovitost a délka → průměry v libovolných hloubkách od obou stran.
// Hodnoty jdou zadat polem i kliknutím do náčrtu (taperBoreSketch.js).

import { safeEvalMath } from '../utils.js';
import { showToast } from '../state.js';
import { computeTaperBore, taperC, isoTolerance, f3, fmtDev } from './taperBoreMath.js';
import { drawBoreSketch } from './taperBoreSketch.js';
import { openInlineEdit, wireSvgEditing, setField } from './svgInlineEdit.js';

const LS_KEY = 'skica.taperBore';
const NAMES = {
  vs: { A: 'Spodek', B: 'Vrch', a: 'od spodu', b: 'od vrchu', bigA: 'dole', bigB: 'nahoře' },
  zk: { A: 'Začátek', B: 'Konec', a: 'od začátku', b: 'od konce', bigA: 'na začátku', bigB: 'na konci' },
};
const CMODES = [['ratio', '1 : x'], ['half', 'α °'], ['full', '2α °'], ['c', 'C /mm']];

const fld = (id, label, unit, ph) =>
  '<label class="cnc-field"><span>' + label + (unit ? ' <small>' + unit + '</small>' : '') + '</span>' +
  '<input type="text" inputmode="decimal" data-tb="' + id + '" placeholder="' + ph + '" autocomplete="off"></label>';
const sel = (id, label, opts) =>
  '<label class="cnc-field"><span>' + label + '</span><select data-tb="' + id + '">' +
  opts.map(o => '<option value="' + o[0] + '">' + o[1] + '</option>').join('') + '</select></label>';
const group = (title, inner) => '<fieldset class="tb-group"><legend>' + title + '</legend><div class="cnc-fields">' + inner + '</div></fieldset>';

/** HTML záložky. */
export function taperBoreHTML() {
  return '<div class="tb-sec" id="tbSection">' +
    '<div class="tp-hint">Klepni na kótu a zadej hodnotu. Klepnutím do díry přidáš měřicí místo, klepnutím na místo ho upravíš.</div>' +
    '<svg class="calc-svg tb-svg" viewBox="0 0 340 396" role="img" aria-label="Náčrt kužele – klikací kóty"></svg>' +
    '<div class="tb-err"></div>' +
    '<div class="cnc-table-wrap cnc-table-tall tb-res"></div>' +
    '<div class="cnc-actions">' +
      '<button type="button" class="cnc-btn cnc-btn-copy tb-copy" title="Čitelný přehled">📋 Kopírovat</button>' +
      '<button type="button" class="cnc-btn cnc-btn-copy tb-copy-nc" title="VELKÁ PÍSMENA BEZ DIAKRITIKY – jako komentář v programu">📝 Do programu</button>' +
    '</div>' +
    group('Zadaný průměr',
      fld('D', 'Ø', 'mm', 'např. 211') +
      fld('iso', 'Tolerance ISO', '', 'H7, h6…') +
      fld('es', 'Horní úchylka', 'mm', '+0.046') +
      fld('ei', 'Dolní úchylka', 'mm', '0') +
      fld('ref', 'V hloubce', 'mm', '0 = na hraně') +
      sel('refSide', 'Hloubka měřena', [['A', 'od spodu'], ['B', 'od vrchu']])) +
    group('Kužel',
      fld('L', 'Délka kužele', 'mm', 'např. 34+135+25') +
      '<label class="cnc-field"><span>Větší Ø je</span><div class="tb-row">' +
        '<select data-tb="big"><option value="A">dole</option><option value="B">nahoře</option></select>' +
        '<button type="button" class="tb-swap" title="Prohodit větší ↔ menší">⇅</button></div></label>' +
      sel('cmode', 'Kuželovitost jako', CMODES) +
      fld('cval', 'Hodnota', '', 'např. 300') +
      '<div class="cnc-info tb-forms cnc-field-full"></div>') +
    '<fieldset class="tb-group"><legend>Měřicí místa <small>(hloubka od strany)</small></legend>' +
      '<div class="tb-points"></div>' +
      '<div class="cnc-actions tb-pt-actions">' +
        '<button type="button" class="cnc-btn tb-add">➕ Místo</button>' +
        '<button type="button" class="cnc-btn tb-step" title="Rozepsat rovnoměrně po celé délce">≡ Po krocích</button>' +
      '</div></fieldset>' +
    group('Zobrazení',
      sel('kind', 'Typ', [['hole', 'Díra'], ['shaft', 'Čep / hřídel']]) +
      sel('names', 'Strany', [['vs', 'Spodek / Vrch'], ['zk', 'Začátek / Konec']])) +
    '<div class="cnc-actions"><button type="button" class="cnc-btn cnc-btn-clear tb-clear">🗑 Vymazat vše</button></div>' +
  '</div>';
}

/** Text bez diakritiky velkými písmeny (komentář do NC programu). */
const ncText = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/−/g, '-').replace(/Ø/g, '').toUpperCase();

/** Oživení záložky uvnitř overlaye. */
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
  let lastText = '', lastNc = '', geo = null;

  const num = el => { const s = el.value.trim(); if (!s) return null; const v = safeEvalMath(s); return isFinite(v) ? v : NaN; };
  const names = () => NAMES[$('names').value] || NAMES.vs;
  const trim0 = x => f3(x).replace(/\.?0+$/, '') || '0';

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

  // ISO → úchylky (vyplněné žlutě, dají se přepsat ručně)
  function applyIso() {
    const D = num($('D'));
    const t = isoTolerance($('iso').value, D > 0 ? D : 0);
    $('iso').classList.toggle('tb-bad', !!(t && t.error));
    if (t && !t.error) {
      esEl.value = trim0(t.es); eiEl.value = trim0(t.ei);
      esEl.classList.add('computed'); eiEl.classList.add('computed');
    }
    return t;
  }

  function readParams() {
    const pts = [];
    ptRows().forEach(r => {
      const d = safeEvalMath(r.querySelector('.tb-pt-d').value);
      pts.push({ depth: isFinite(d) ? d : NaN, side: r.querySelector('.tb-pt-s').value });
    });
    return {
      D: num($('D')), es: num(esEl) || 0, ei: num(eiEl) || 0,
      L: num($('L')), refDepth: num($('ref')) || 0, refSide: $('refSide').value,
      C: taperC($('cmode').value, num($('cval'))), bigSide: $('big').value, points: pts,
    };
  }

  function taperLabel() {
    const v = num($('cval'));
    if (v === null || !(v >= 0)) return 'kuželovitost ?';
    const m = $('cmode').value;
    return m === 'ratio' ? '1 : ' + v + ' (zveličeno)' : m === 'half' ? 'α ' + v + '°' : m === 'full' ? '2α ' + v + '°' : 'C ' + v + ' /mm';
  }
  function tolLabel(p) {
    const iso = $('iso').value.trim();
    if (!iso && esEl.value.trim() === '' && eiEl.value.trim() === '') return 'tol ?';
    return (iso && !$('iso').classList.contains('tb-bad') ? iso + ' ' : '') + fmtDev(p.es, p.ei);
  }

  function update() {
    relabel();
    save();
    const p = readParams();
    const n = names();
    const r = computeTaperBore(p);
    const bad = !!r.error;
    const anyInput = p.D !== null || p.L !== null;
    errEl.textContent = bad && anyInput ? r.error : '';

    if (!bad) {
      const fm = r.forms;
      formsEl.textContent = (fm.C > 0 ? '1:' + fm.ratio.toFixed(fm.ratio < 100 ? 3 : 1) : 'válec') +
        '  │  α ' + fm.half.toFixed(5) + '°  │  2α ' + fm.full.toFixed(5) + '°  │  C ' + fm.C.toFixed(6) + '/mm';
    } else formsEl.textContent = '';

    // Tabulka výsledků
    const dev = fmtDev(p.es, p.ei);
    if (!bad && r.rows.length) {
      let h = '<table class="cnc-table tb-table"><thead><tr><th>#</th><th>Místo</th><th>Ø jmen.</th><th>min</th><th>max</th></tr></thead><tbody>';
      r.rows.forEach((row, i) => {
        h += '<tr' + (row.outside ? ' class="tb-out" title="Mimo délku kužele"' : '') + '><td>' + (i + 1) + '</td><td>' + row.depth + ' ' + (row.side === 'A' ? n.a : n.b) +
          '</td><td><strong>' + f3(row.nom) + '</strong></td><td>' + f3(row.min) + '</td><td>' + f3(row.max) + '</td></tr>';
      });
      h += '<tr class="tb-end"><td></td><td>' + n.A + ' (hrana)</td><td>' + f3(r.endA) + '</td><td>' + f3(r.endA + r.ei) + '</td><td>' + f3(r.endA + r.es) + '</td></tr>';
      h += '<tr class="tb-end"><td></td><td>' + n.B + ' (hrana)</td><td>' + f3(r.endB) + '</td><td>' + f3(r.endB + r.ei) + '</td><td>' + f3(r.endB + r.es) + '</td></tr>';
      h += '</tbody></table>';
      if (r.diffs.length) {
        h += '<div class="tb-diffs">' + r.diffs.map(d => 'Rozdíl ' + n.B.toLowerCase() + ' − ' + n.A.toLowerCase() + ' v hl. ' + d.depth +
          ': <strong>' + f3(Math.abs(d.diff)) + '</strong> <small>(rozteč ' + trim0(d.span) + ' mm)</small>').join('<br>') + '</div>';
      }
      resEl.innerHTML = h;
    } else resEl.innerHTML = '';

    // Texty ke kopírování (čitelný + komentář do programu ve stylu dílny)
    lastText = lastNc = '';
    if (!bad) {
      const ratioTxt = r.forms.C > 0 ? '1:' + trim0(r.forms.ratio) : 'válec';
      const lines = ['Kužel ' + ratioTxt + ', Ø' + trim0(p.D) + ' ' + dev + ' v hl. ' + p.refDepth + ' ' + (p.refSide === 'A' ? n.a : n.b) + ', L ' + trim0(p.L)];
      const nc = [($('kind').value === 'shaft' ? 'Kuželový čep ' : 'Kuželová díra ') + ratioTxt];
      r.rows.forEach(row => {
        lines.push('Ø v hl. ' + row.depth + ' ' + (row.side === 'A' ? n.a : n.b) + ' = ' + f3(row.nom) + ' ' + dev);
        nc.push('Rozměr v hloubce ' + row.depth + ' ' + (row.side === 'A' ? n.a : n.b) + ' je ' + f3(row.nom) + ' ' + dev);
      });
      r.diffs.forEach(d => {
        lines.push('Rozdíl v hl. ' + d.depth + ' = ' + f3(Math.abs(d.diff)));
        nc.push('Rozdíl ' + n.B + ' - ' + n.A + ' v hloubce ' + d.depth + ' = ' + f3(Math.abs(d.diff)));
      });
      lastText = lines.join('\n');
      lastNc = ncText(nc.join('\n'));
    }

    // Náčrt (i neúplný – neznámé hodnoty jako „?")
    const Lk = p.L > 0, Ld = Lk ? p.L : 200;
    const zRefRaw = p.refSide === 'B' ? Ld - p.refDepth : p.refDepth;
    const rows = [];
    if (!bad) r.rows.forEach((row, i) => { if (!row.outside) rows.push({ ...row, no: i + 1 }); });
    else {
      let no = 0;
      p.points.forEach((pt, i) => {
        if (!(pt.depth >= 0)) return;
        (pt.side === 'AB' ? ['A', 'B'] : [pt.side]).forEach(side => {
          no++;
          const z = side === 'B' ? Ld - pt.depth : pt.depth;
          if (z >= 0 && z <= Ld) rows.push({ side, depth: pt.depth, z, nom: null, pt: i, no });
        });
      });
    }
    geo = drawBoreSketch(svg, {
      L: Ld, zRef: Math.max(0, Math.min(Ld, zRefRaw)), refDepth: p.refDepth, refSide: p.refSide,
      bigSide: p.bigSide, C: Number.isFinite(p.C) ? p.C : null, D: p.D,
      endA: bad ? null : r.endA, endB: bad ? null : r.endB,
      taperTxt: taperLabel(), tolTxt: tolLabel(p), rows, names: n, shaft: $('kind').value === 'shaft',
      known: { D: p.D > 0, L: Lk, ref: $('ref').value.trim() !== '', C: Number.isFinite(p.C) },
    });
  }

  // ── Kliknutí do náčrtu
  const sideChoices = () => { const n = names(); return [{ value: 'A', text: n.a }, { value: 'B', text: n.b }, { value: 'AB', text: 'z obou' }]; };
  function editField(e, id, label, unit, hint, extra = {}) {
    openInlineEdit(e, { label, unit, hint, value: $(id).value, onCommit: (v, ch, raw) => setField($(id), raw), ...extra });
  }
  wireSvgEditing(svg, (key, e) => {
    const n = names();
    if (key === 'D') editField(e, 'D', 'Zadaný průměr', 'mm');
    else if (key === 'L') editField(e, 'L', 'Délka kužele', 'mm', 'Lze i výraz, např. 34+135+25');
    else if (key === 'ref') {
      openInlineEdit(e, {
        label: 'Hloubka zadaného průměru', unit: 'mm', value: $('ref').value, hint: '0 = průměr na hraně',
        choices: [{ value: 'A', text: n.a }, { value: 'B', text: n.b }], choice: $('refSide').value,
        onCommit: (v, ch, raw) => { $('refSide').value = ch; setField($('ref'), raw); },
      });
    } else if (key === 'tol') {
      const cur = $('iso').value.trim() || (esEl.value || '0') + ' / ' + (eiEl.value || '0');
      openInlineEdit(e, {
        label: 'Tolerance', text: true, value: cur, hint: 'ISO (H7, h6…) nebo úchylky „+0.046 / 0"',
        onCommit: (v, ch, raw) => {
          if (!raw) { $('iso').value = ''; esEl.value = ''; eiEl.value = ''; update(); return; }
          if (/^[a-zA-Z]{1,2}\s*\d{1,2}$/.test(raw)) { setField($('iso'), raw); return; }
          const parts = raw.replace(/,/g, '.').replace(/−/g, '-').split(/[\s/;]+/).filter(Boolean).map(Number);
          if (parts.length < 1 || parts.some(x => !Number.isFinite(x))) { showToast('Nerozumím zápisu tolerance'); return; }
          const [a, b = 0] = parts;
          $('iso').value = '';
          esEl.value = String(Math.max(a, b)); eiEl.value = String(Math.min(a, b));
          esEl.classList.remove('computed'); eiEl.classList.remove('computed');
          update();
        },
      });
    } else if (key === 'C') {
      openInlineEdit(e, {
        label: 'Kuželovitost', value: $('cval').value, hint: 'např. 300 pro 1:300',
        choices: CMODES.map(c => ({ value: c[0], text: c[1] })), choice: $('cmode').value,
        onCommit: (v, ch, raw) => { $('cmode').value = ch; setField($('cval'), raw); },
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
    // Klik do díry → nové měřicí místo od bližší strany
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

  // ── uložení vstupů
  const IDS = ['kind', 'names', 'D', 'iso', 'es', 'ei', 'ref', 'refSide', 'L', 'big', 'cmode', 'cval'];
  function save() {
    try {
      const o = {}; IDS.forEach(id => { o[id] = $(id).value; });
      o.pts = ptRows().map(r => [r.querySelector('.tb-pt-d').value, r.querySelector('.tb-pt-s').value]);
      localStorage.setItem(LS_KEY, JSON.stringify(o));
    } catch (e) { /* localStorage nedostupné */ }
  }
  let st = null;
  try { st = JSON.parse(localStorage.getItem(LS_KEY) || 'null'); } catch (e) { /* ignorovat */ }
  if (st) {
    IDS.forEach(id => { if (st[id] !== undefined) $(id).value = st[id]; });
    (st.pts || []).forEach(p => addPoint(p[0], p[1]));
    if ($('iso').value) applyIso();
  }
  if (!ptsEl.children.length) addPoint();

  IDS.forEach(id => {
    const el = $(id);
    el.addEventListener('input', () => {
      if (id === 'iso' || id === 'D') applyIso();
      if (id === 'es' || id === 'ei') { el.classList.remove('computed'); $('iso').value = ''; }
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
  root.querySelector('.tb-clear').addEventListener('click', () => {
    IDS.forEach(id => { const el = $(id); if (el.tagName === 'INPUT') { el.value = ''; el.classList.remove('computed'); } });
    ptsEl.innerHTML = ''; addPoint(); update();
  });
  const copy = t => {
    if (!t) { showToast('Není co kopírovat'); return; }
    navigator.clipboard?.writeText(t).then(() => showToast('Zkopírováno'), () => showToast('Schránka nedostupná'));
  };
  root.querySelector('.tb-copy').addEventListener('click', () => copy(lastText));
  root.querySelector('.tb-copy-nc').addEventListener('click', () => copy(lastNc));
  update();
}
