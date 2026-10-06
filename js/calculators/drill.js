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
  let presetIdx = 0;      // naposledy zvolená předvolba z tabulky
  let activePreset = 0;   // -1 = úhel neodpovídá zvolené předvolbě (vlastní)
  let edgeSrc = null;     // 'd' | 'h' – které z dvojice zadal uživatel (druhé se dopočítá)
  let last = null;        // poslední platný výsledek – pro Kopírovat

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

  const row = (label, value) => '<div class="drill-row"><span>' + label + '</span><strong>' + value + '</strong></div>';
  const warn = (msg) => '<div class="drill-warn">' + msg + '</div>';
  const hint = (msg) => '<div class="drill-hint">' + msg + '</div>';

  function solve() {
    const D = val(inp.D), a = val(inp.a), H = val(inp.H);
    const angleOk = Number.isFinite(a) && a >= 1 && a <= 180;
    const Dok = Number.isFinite(D) && D > 0;
    const L = Dok && angleOk ? drillTipLength(D, a) : NaN;
    let notes = '';

    // Dvojice d ↔ h: zadaná hodnota je zdroj, druhá se dopočítá (žlutě).
    // Hlubší než špička → vrták tam už řeže plným Ø D (ne větším).
    let dEdge = null, hEdge = null, full = false;
    if (edgeSrc) {
      const dst = inp[edgeSrc === 'd' ? 'h' : 'd'];
      const s = val(inp[edgeSrc]);
      let out = NaN;
      if (!(Number.isFinite(s) && s >= 0)) {
        notes += warn('Neplatná hodnota ' + (edgeSrc === 'd' ? 'Ø d' : 'h') + '.');
      } else if (angleOk && edgeSrc === 'd') {
        if (Dok && s > D + 1e-9) notes += warn('Ø d = ' + fmt(s) + ' je větší než vrták – špička na něj nezabere.');
        else out = drillTipLength(s, a);
      } else if (angleOk) {
        const raw = a === 180 ? Infinity : drillDiameterAtDepth(s, a);
        if (Dok && raw > D) { out = D; full = true; }
        else if (Number.isFinite(raw)) out = raw;
        else notes += hint('Rovné čelo zabírá hned celým průměrem – zadej D.');
      }
      if (Number.isFinite(out)) { dst.value = fmt(out); dst.classList.add('computed'); }
      else { dst.value = ''; dst.classList.remove('computed'); }
      if (Number.isFinite(out)) {
        dEdge = edgeSrc === 'd' ? s : out;
        hEdge = edgeSrc === 'd' ? out : s;
      }
    }

    draw(Dok ? D : null, angleOk ? a : null, dEdge, hEdge);
    last = null;

    let html;
    if (!angleOk) {
      resultEl.innerHTML = hint('Úhel špičky σ musí být v rozsahu 1–180°.');
      return;
    }
    if (!Dok) {
      html = hint(D === null ? 'Zadej průměr vrtáku D.' : 'Průměr D musí být kladné číslo.') +
        '<div class="drill-formula">L = D / (2·tan(σ/2)) ≈ ' + fmt(drillTipLength(1, a), 4) + '·D pro σ = ' + fmt(a, 2) + '°</div>';
    } else {
      html =
        '<div class="drill-main">L = ' + fmt(L) + ' mm</div>' +
        '<div class="drill-sub">vzdálenost hrot → hrana plného Ø' + fmt(D) + '</div>' +
        row('Poměr L / D', fmt(L / D, 4)) +
        row('Délka hlavního břitu', fmt(drillLipLength(D, a)) + ' mm');
    }
    html += notes;
    if (dEdge !== null) {
      html += full
        ? row('V hloubce ' + fmt(hEdge) + ' už plný Ø', fmt(D) + ' mm')
        : row('Ø ' + fmt(dEdge) + ' v hloubce od hrotu', fmt(hEdge) + ' mm');
    }
    let tipDepth = null;
    if (H !== null) {
      if (!(Number.isFinite(H) && H >= 0)) html += warn('Neplatná hloubka H.');
      else if (Dok) { tipDepth = H + L; html += row('Hloubka hrotu (H + L)', fmt(tipDepth) + ' mm'); }
    }
    if (Dok) {
      html += '<div class="drill-formula">' + (a < 180
        ? 'L = D / (2·tan(σ/2)) = ' + fmt(D) + ' / (2·tan ' + fmt(a / 2, 2) + '°)'
        : 'Rovné čelo (σ = 180°) – žádná špička, L = 0') + '</div>';
      last = { D, a, L, dEdge, hEdge, full, H, tipDepth };
    }
    resultEl.innerHTML = html;
  }

  // ── Náčrt: vrták vodorovně, hrot vlevo (jako vrtání v ose Z na soustruhu) ──
  function el(tag, attrs, text) {
    const e = document.createElementNS(SVG_NS, tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (text != null) e.textContent = text;
    return e;
  }

  // Šipka kóty jako trojúhelník (marker s orient="auto-start-reverse" starší
  // Safari neumí – šipka na začátku by mířila opačně). Hrot v (x, y), směr (dx, dy).
  function arrow(x, y, dx, dy, cls) {
    const bx = x - dx * 7, by = y - dy * 7;
    return el('polygon', { points: x + ',' + y + ' ' + (bx - dy * 3) + ',' + (by + dx * 3) + ' ' + (bx + dy * 3) + ',' + (by - dx * 3), class: cls });
  }

  function dimH(g, x1, x2, y, label, cls, arrowCls) {
    g.appendChild(el('line', { x1, y1: y, x2, y2: y, class: cls }));
    g.appendChild(arrow(x1, y, -1, 0, arrowCls));
    g.appendChild(arrow(x2, y, 1, 0, arrowCls));
    const narrow = x2 - x1 < 70;
    g.appendChild(el('text', {
      x: narrow ? x2 + 6 : (x1 + x2) / 2, y: narrow ? y + 4 : y - 4,
      class: 'dr-txt', 'text-anchor': narrow ? 'start' : 'middle',
    }, label));
  }

  function draw(D, a, dEdge, hEdge) {
    while (svg.firstChild) svg.removeChild(svg.firstChild);

    // Bez platného vstupu kreslíme nominální tvar, ale BEZ čísel z něj
    // (popisky by jinak ukazovaly hodnoty, které uživatel nezadal).
    const sigma = a ?? 118;
    const Dd = D ?? (dEdge > 0 ? dEdge * 1.5 : 10);
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
    svg.appendChild(el('text', { x: x0 - 8, y: cy - 6, class: 'dr-txt', 'text-anchor': 'end' }, a != null ? fmt(a, 2) + '°' : 'σ'));

    // Kóta D
    svg.appendChild(el('line', { x1: x1 + 16, y1: cy - r, x2: x1 + 16, y2: cy + r, class: 'dr-dim' }));
    svg.appendChild(arrow(x1 + 16, cy - r, 0, -1, 'dr-arrow-y'));
    svg.appendChild(arrow(x1 + 16, cy + r, 0, 1, 'dr-arrow-y'));
    svg.appendChild(el('text', { x: x1 + 32, y: cy, class: 'dr-txt', 'text-anchor': 'middle', transform: 'rotate(-90 ' + (x1 + 32) + ' ' + cy + ')' },
      'Ø' + (D != null ? fmt(D) : 'D')));

    // Kóta L
    const yL = cy + r + 22;
    svg.appendChild(el('line', { x1: x0, y1: cy + 4, x2: x0, y2: yL + 4, class: 'dr-ext' }));
    svg.appendChild(el('line', { x1: xs, y1: cy + r + 2, x2: xs, y2: yL + 4, class: 'dr-ext' }));
    if (Lp > 0.5) dimH(svg, x0, xs, yL, 'L' + (D != null && a != null ? ' = ' + fmt(L) : ''), 'dr-dim', 'dr-arrow-y');
    else svg.appendChild(el('text', { x: x0 + 6, y: yL + 4, class: 'dr-txt' }, 'L = 0 (rovné čelo)'));

    // Záběr na průměr d v hloubce h (h > L = plný průměr za špičkou)
    const xh = hEdge > 0 ? x0 + s * hEdge : NaN;
    if (dEdge !== null && dEdge <= Dd + 1e-9 && xh < x1 - 4) {
      const rd = s * dEdge / 2, yh = yL + 22;
      svg.appendChild(el('line', { x1: xh, y1: cy - rd, x2: xh, y2: cy + rd, class: 'dr-d' }));
      svg.appendChild(el('line', { x1: xh, y1: cy + rd, x2: xh, y2: yh + 4, class: 'dr-ext' }));
      svg.appendChild(el('line', { x1: x0, y1: yL + 4, x2: x0, y2: yh + 4, class: 'dr-ext' }));
      dimH(svg, x0, xh, yh, 'h = ' + fmt(hEdge) + ' (Ø' + fmt(dEdge) + ')', 'dr-dim-g', 'dr-arrow-g');
    }
  }

  // ── Události ──
  inp.D.addEventListener('input', solve);
  inp.H.addEventListener('input', solve);
  inp.a.addEventListener('input', () => {
    // Návrat na úhel zvolené předvolby (překlep a oprava) ji znovu označí.
    activePreset = val(inp.a) === DRILL_PRESETS[presetIdx].angle ? presetIdx : -1;
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
      presetIdx = activePreset = parseInt(tr.dataset.idx, 10);
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
    if (!last) { showToast('Zadej průměr vrtáku a úhel špičky'); return; }
    const p = ['Vrták Ø' + fmt(last.D), 'σ=' + fmt(last.a, 2) + '°', 'L=' + fmt(last.L) + ' mm'];
    if (last.dEdge !== null) p.push('Ø' + fmt(last.dEdge) + ' v h=' + fmt(last.hEdge) + ' mm' + (last.full ? ' (plný Ø)' : ''));
    if (last.tipDepth !== null) p.push('H=' + fmt(last.H) + ' → hrot ' + fmt(last.tipDepth) + ' mm');
    if (!navigator.clipboard?.writeText) { showToast('Schránka není v tomto prohlížeči dostupná'); return; }
    navigator.clipboard.writeText(p.join('  '))
      .then(() => showToast('Zkopírováno'), () => showToast('Kopírování se nezdařilo'));
  });

  showPreset();
  solve();
}
