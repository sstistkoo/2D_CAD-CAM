// ╔══════════════════════════════════════════════════════════════╗
// ║  SKICA – Kalkulačka: geometrie vrtáku (délka špičky)         ║
// ╚══════════════════════════════════════════════════════════════╝

import { showToast } from '../state.js';
import { safeEvalMath } from '../utils.js';
import { makeOverlay } from '../dialogFactory.js';
import { DRILL_PRESETS, drillTipLength, drillDiameterAtDepth, drillLipLength } from './drillGeometry.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

function fmt(x, dec = 3) { return parseFloat(x.toFixed(dec)).toString(); }

export function openDrillCalc() {
  let presetRows = '';
  DRILL_PRESETS.forEach((p, i) => {
    presetRows += '<tr data-idx="' + i + '"><td>' + p.name + '</td><td>' + p.angle + '°</td><td>' + (p.type || '–') + '</td></tr>';
  });

  const field = (id, label, unit, ph, extra = '') =>
    '<label class="cnc-field"><span>' + label + ' <small>' + unit + '</small></span>' +
    '<input type="text" inputmode="decimal" data-id="' + id + '" placeholder="' + ph + '"' + extra + '></label>';

  const body =
    '<div class="cnc-fields">' +
      field('D', 'Ø D', 'mm', 'Průměr vrtáku') +
      field('a', 'σ', '°', 'Úhel špičky', ' value="118"') +
    '</div>' +
    '<div class="cnc-info" id="drillPresetInfo"></div>' +
    '<svg class="drill-svg" viewBox="0 0 340 165" id="drillSvg" role="img" aria-label="Náčrt špičky vrtáku"></svg>' +
    '<div class="drill-result" id="drillResult"></div>' +
    '<div class="cnc-table-label">Záběr na menší průměr <small>(navrtání, sražení hrany – zadej jedno)</small></div>' +
    '<div class="cnc-fields">' +
      field('d', 'Ø d', 'mm', 'Průměr na hraně') +
      field('h', 'h', 'mm', 'Hloubka od hrotu') +
    '</div>' +
    '<div class="cnc-fields">' +
      field('H', 'H', 'mm', 'Hloubka plného Ø') +
    '</div>' +
    '<div class="cnc-actions">' +
      '<button class="cnc-btn cnc-btn-clear">🗑 Vymazat</button>' +
      '<button class="cnc-btn cnc-btn-copy">📋 Kopírovat</button>' +
    '</div>' +
    '<div class="cnc-table-label">Základní vrtáky <small>(klikni pro úhel špičky)</small></div>' +
    '<div class="cnc-table-wrap cnc-table-tall">' +
      '<table class="cnc-table" id="drillPresetTbl"><thead><tr><th>Vrták / materiál</th><th>σ</th><th>Typ</th></tr></thead>' +
      '<tbody>' + presetRows + '</tbody></table>' +
    '</div>' +
    '<div class="drill-note">Typ šroubovice: N normální (ocel, litina), H malé stoupání (mosaz, plasty), ' +
      'W velké stoupání (hliník, měď). Úhly jsou orientační – rozhoduje katalog výrobce.</div>';

  const overlay = makeOverlay('drill', '⬇ Vrták – geometrie špičky', body);
  if (!overlay) return;

  const inp = {};
  ['D', 'a', 'd', 'h', 'H'].forEach(id => { inp[id] = overlay.querySelector('[data-id="' + id + '"]'); });
  const svg = overlay.querySelector('#drillSvg');
  const resultEl = overlay.querySelector('#drillResult');
  const presetInfo = overlay.querySelector('#drillPresetInfo');
  const rows = overlay.querySelectorAll('#drillPresetTbl tbody tr');
  let activePreset = 0;
  let edgeSrc = null;   // 'd' | 'h' – které z dvojice zadal uživatel (druhé se dopočítá)

  function val(el) {
    if (el.value.trim() === '') return null;
    const x = safeEvalMath(el.value);
    return Number.isFinite(x) ? x : NaN;
  }

  function showPreset() {
    rows.forEach((r, i) => r.classList.toggle('drill-row-active', i === activePreset));
    if (activePreset < 0) { presetInfo.textContent = 'Vlastní úhel špičky'; return; }
    const p = DRILL_PRESETS[activePreset];
    presetInfo.textContent = 'Předvolba: ' + p.name + ' – ' + p.angle + '°' + (p.type ? ', typ ' + p.type : '');
  }

  function solve() {
    const D = val(inp.D), a = val(inp.a), H = val(inp.H);
    const angleOk = Number.isFinite(a) && a > 0 && a <= 180;

    // Dvojice d ↔ h: zadaná hodnota je zdroj, druhá se dopočítá (žlutě).
    const src = edgeSrc ? inp[edgeSrc] : null;
    const dst = edgeSrc === 'd' ? inp.h : edgeSrc === 'h' ? inp.d : null;
    let dEdge = null, hEdge = null;
    if (dst) {
      const s = val(src);
      let out = NaN;
      if (Number.isFinite(s) && s >= 0 && angleOk) {
        out = edgeSrc === 'd' ? drillTipLength(s, a) : drillDiameterAtDepth(s, a);
      }
      if (Number.isFinite(out)) { dst.value = fmt(out); dst.classList.add('computed'); }
      else { dst.value = ''; dst.classList.remove('computed'); }
      dEdge = edgeSrc === 'd' ? s : out;
      hEdge = edgeSrc === 'd' ? out : s;
      if (!Number.isFinite(dEdge) || !Number.isFinite(hEdge)) { dEdge = null; hEdge = null; }
    }

    const Dok = Number.isFinite(D) && D > 0;
    draw(Dok ? D : null, angleOk ? a : null, dEdge, hEdge);

    if (!angleOk) {
      resultEl.innerHTML = '<div class="drill-hint">Úhel špičky σ musí být v rozsahu 1–180°.</div>';
      return;
    }
    if (!Dok) {
      const k = drillTipLength(1, a);
      resultEl.innerHTML = '<div class="drill-hint">Zadej průměr vrtáku D.</div>' +
        '<div class="drill-formula">L = D / (2·tan(σ/2)) ≈ ' + fmt(k, 4) + '·D pro σ = ' + fmt(a, 2) + '°</div>';
      return;
    }

    const L = drillTipLength(D, a);
    const lip = drillLipLength(D, a);
    let html =
      '<div class="drill-main">L = ' + fmt(L) + ' mm</div>' +
      '<div class="drill-sub">vzdálenost hrot → hrana plného Ø' + fmt(D) + '</div>' +
      '<div class="drill-row"><span>Poměr L / D</span><strong>' + fmt(L / D, 4) + '</strong></div>' +
      '<div class="drill-row"><span>Délka hlavního břitu</span><strong>' + fmt(lip) + ' mm</strong></div>';
    if (dEdge !== null) {
      if (dEdge > D + 1e-9) {
        html += '<div class="drill-warn">Ø d = ' + fmt(dEdge) + ' je větší než vrták – špička na něj nezabere.</div>';
      } else {
        html += '<div class="drill-row"><span>Ø ' + fmt(dEdge) + ' v hloubce od hrotu</span><strong>' + fmt(hEdge) + ' mm</strong></div>';
      }
    }
    if (H !== null) {
      if (Number.isFinite(H) && H >= 0) {
        html += '<div class="drill-row"><span>Hloubka hrotu (H + L)</span><strong>' + fmt(H + L) + ' mm</strong></div>';
      } else {
        html += '<div class="drill-warn">Neplatná hloubka H.</div>';
      }
    }
    html += '<div class="drill-formula">L = D / (2·tan(σ/2)) = ' + fmt(D) + ' / (2·tan ' + fmt(a / 2, 2) + '°)</div>';
    resultEl.innerHTML = html;
  }

  // ── Náčrt: vrták vodorovně, hrot vlevo (jako vrtání v ose Z na soustruhu) ──
  function el(tag, attrs, text) {
    const e = document.createElementNS(SVG_NS, tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (text != null) e.textContent = text;
    return e;
  }

  function dimH(g, x1, x2, y, label, cls, marker) {
    g.appendChild(el('line', { x1, y1: y, x2, y2: y, class: cls, 'marker-start': 'url(#' + marker + ')', 'marker-end': 'url(#' + marker + ')' }));
    const narrow = x2 - x1 < 70;
    g.appendChild(el('text', {
      x: narrow ? x2 + 6 : (x1 + x2) / 2, y: narrow ? y + 4 : y - 4,
      class: 'dr-txt', 'text-anchor': narrow ? 'start' : 'middle',
    }, label));
  }

  function draw(D, a, dEdge, hEdge) {
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    const defs = el('defs', {});
    [['drArrY', 'dr-arrow-y'], ['drArrG', 'dr-arrow-g']].forEach(([id, cls]) => {
      const m = el('marker', { id, viewBox: '0 0 10 10', refX: 9, refY: 5, markerWidth: 7, markerHeight: 7, orient: 'auto-start-reverse' });
      m.appendChild(el('path', { d: 'M0,1 L10,5 L0,9 Z', class: cls }));
      defs.appendChild(m);
    });
    svg.appendChild(defs);

    const sigma = a ?? 118;
    const Dd = D ?? 10;                       // bez zadání kreslíme nominální tvar
    const L = drillTipLength(Dd, sigma);
    const x0 = 46, x1 = 296, cy = 68;
    const s = Math.min(40 / (Dd / 2), L > 0 ? 170 / L : Infinity);
    const r = s * Dd / 2, Lp = s * L, xs = x0 + Lp;

    svg.appendChild(el('line', { x1: x0 - 12, y1: cy, x2: x1 + 8, y2: cy, class: 'dr-axis' }));
    svg.appendChild(el('polygon', {
      points: [x0 + ',' + cy, xs + ',' + (cy - r), x1 + ',' + (cy - r), x1 + ',' + (cy + r), xs + ',' + (cy + r)].join(' '),
      class: 'dr-body',
    }));
    // Naznačené drážky šroubovice
    for (let xa = xs + 18; xa + r * 0.9 < x1 - 4; xa += 46) {
      svg.appendChild(el('line', { x1: xa, y1: cy - r, x2: xa + r * 0.9, y2: cy + r, class: 'dr-flute' }));
    }
    // Hrana plného průměru
    svg.appendChild(el('line', { x1: xs, y1: cy - r, x2: xs, y2: cy + r, class: 'dr-edge' }));

    // Úhel špičky
    if (sigma < 180) {
      const half = sigma * Math.PI / 360, ra = Math.min(24, Math.hypot(Lp, r) * 0.7);
      const ax = x0 + ra * Math.cos(half), ay = ra * Math.sin(half);
      svg.appendChild(el('path', { d: 'M' + ax + ',' + (cy - ay) + ' A' + ra + ',' + ra + ' 0 0 1 ' + ax + ',' + (cy + ay), class: 'dr-arc' }));
    }
    svg.appendChild(el('text', { x: x0 - 8, y: cy - 6, class: 'dr-txt', 'text-anchor': 'end' }, fmt(sigma, 2) + '°'));

    // Kóta D
    svg.appendChild(el('line', { x1: x1 + 16, y1: cy - r, x2: x1 + 16, y2: cy + r, class: 'dr-dim', 'marker-start': 'url(#drArrY)', 'marker-end': 'url(#drArrY)' }));
    svg.appendChild(el('text', { x: x1 + 32, y: cy, class: 'dr-txt', 'text-anchor': 'middle', transform: 'rotate(-90 ' + (x1 + 32) + ' ' + cy + ')' },
      'Ø' + (D != null ? fmt(D) : 'D')));

    // Kóta L
    const yL = cy + r + 22;
    svg.appendChild(el('line', { x1: x0, y1: cy + 4, x2: x0, y2: yL + 4, class: 'dr-ext' }));
    svg.appendChild(el('line', { x1: xs, y1: cy + r + 2, x2: xs, y2: yL + 4, class: 'dr-ext' }));
    if (Lp > 0.5) dimH(svg, x0, xs, yL, 'L' + (D != null ? ' = ' + fmt(L) : ''), 'dr-dim', 'drArrY');
    else svg.appendChild(el('text', { x: x0 + 6, y: yL + 4, class: 'dr-txt' }, 'L = 0 (rovné čelo)'));

    // Záběr na menší průměr d v hloubce h
    if (dEdge !== null && hEdge !== null && dEdge <= Dd + 1e-9 && hEdge > 0) {
      const xh = x0 + s * hEdge, rd = s * dEdge / 2, yh = yL + 22;
      svg.appendChild(el('line', { x1: xh, y1: cy - rd, x2: xh, y2: cy + rd, class: 'dr-d' }));
      svg.appendChild(el('line', { x1: xh, y1: cy + rd, x2: xh, y2: yh + 4, class: 'dr-ext' }));
      svg.appendChild(el('line', { x1: x0, y1: yL + 4, x2: x0, y2: yh + 4, class: 'dr-ext' }));
      dimH(svg, x0, xh, yh, 'h = ' + fmt(hEdge) + ' (Ø' + fmt(dEdge) + ')', 'dr-dim-g', 'drArrG');
    }
  }

  // ── Události ──
  inp.D.addEventListener('input', solve);
  inp.H.addEventListener('input', solve);
  inp.a.addEventListener('input', () => {
    const a = val(inp.a);
    if (activePreset >= 0 && a !== DRILL_PRESETS[activePreset].angle) activePreset = -1;
    showPreset();
    solve();
  });
  ['d', 'h'].forEach(id => {
    inp[id].addEventListener('input', () => {
      inp[id].classList.remove('computed');
      if (inp[id].value.trim() === '') {
        edgeSrc = null;
        const other = inp[id === 'd' ? 'h' : 'd'];
        other.value = ''; other.classList.remove('computed');
      } else {
        edgeSrc = id;
      }
      solve();
    });
  });
  rows.forEach(tr => {
    tr.addEventListener('click', () => {
      activePreset = parseInt(tr.dataset.idx, 10);
      inp.a.value = DRILL_PRESETS[activePreset].angle;
      showPreset();
      solve();
    });
  });

  overlay.querySelector('.cnc-btn-clear').addEventListener('click', () => {
    ['D', 'd', 'h', 'H'].forEach(id => { inp[id].value = ''; inp[id].classList.remove('computed'); });
    edgeSrc = null;
    solve();
  });
  overlay.querySelector('.cnc-btn-copy').addEventListener('click', () => {
    const D = val(inp.D), a = val(inp.a);
    if (!(Number.isFinite(D) && D > 0) || !(Number.isFinite(a) && a > 0 && a <= 180)) {
      showToast('Zadej průměr vrtáku a úhel špičky');
      return;
    }
    const L = drillTipLength(D, a);
    const p = ['Vrták Ø' + fmt(D), 'σ=' + fmt(a, 2) + '°', 'L=' + fmt(L) + ' mm'];
    if (edgeSrc && inp.d.value && inp.h.value) p.push('Ø' + inp.d.value + ' v h=' + inp.h.value + ' mm');
    const H = val(inp.H);
    if (Number.isFinite(H) && H >= 0) p.push('H=' + fmt(H) + ' → hrot ' + fmt(H + L) + ' mm');
    navigator.clipboard.writeText(p.join('  ')).then(() => showToast('Zkopírováno'));
  });

  showPreset();
  solve();
}
