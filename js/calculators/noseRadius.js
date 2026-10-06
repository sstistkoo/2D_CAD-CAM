// ╔══════════════════════════════════════════════════════════════╗
// ║  SKICA – Kalkulačka: korekce na rádius špičky nože rε        ║
// ╚══════════════════════════════════════════════════════════════╝

import { showToast } from '../state.js';
import { makeOverlay } from '../dialogFactory.js';
import { lineCorrection, chamferPoints, arcCorrection } from './noseRadiusMath.js';
import {
  fmt, numVal as val, numField, selectField, tabsHtml, wireTabs, quickButtonsHtml, wireQuickButtons,
  outRow, outWarn, outHint, outMain, outFormula, copyText, svgEl, svgClear, fitView, svgPoints,
} from './calcKit.js';

const R_VALUES = [0.2, 0.4, 0.8, 1.2, 1.6, 2.4];
const signed = (x) => (x > 0 ? '+' : '') + fmt(x);

export function openNoseRadiusCalc() {
  const body =
    tabsHtml([['line', 'Sražení / kužel'], ['arc', 'Rádius 90°']]) +
    '<div class="cnc-fields">' +
      selectField('side', 'Obrábění', [['ext', 'Vnější'], ['int', 'Vnitřní (díra)']]) +
      '<span data-show="line">' + selectField('orient', 'Obrys', [['std', 'Sražení / kužel'], ['rev', 'Zpětný kužel']]) + '</span>' +
      '<span data-show="arc">' + selectField('arcType', 'Rádius', [['convex', 'Vypouklý (hrana)'], ['concave', 'Vydutý (osazení)']]) + '</span>' +
    '</div>' +
    '<div class="cnc-info" id="nrOrientInfo"></div>' +
    '<div class="calc-section-title">Rádius špičky rε <small>mm</small></div>' +
    quickButtonsHtml(R_VALUES) +
    '<div class="cnc-fields">' +
      numField('r', 'rε', 'mm', 'Rádius špičky', ' value="0.8"') +
      '<span data-show="line">' + numField('a', 'α', '° od osy Z', 'Úhel', ' value="45"') + '</span>' +
      '<span data-show="arc">' + numField('R', 'R', 'mm', 'Rádius obrysu') + '</span>' +
    '</div>' +
    '<svg class="calc-svg" viewBox="0 0 340 190" id="nrSvg" role="img" aria-label="Náčrt: obrys, rádius nože a dráha teoretické špičky"></svg>' +
    '<div class="calc-out" id="nrResult"></div>' +
    '<div class="calc-section-title" id="nrPtsTitle">Body do programu <small>(volitelné)</small></div>' +
    '<div class="cnc-fields">' +
      numField('D', 'Ø D', 'mm', 'Průměr') +
      '<span data-show="line">' + numField('c', 'c', 'mm v Z', 'Délka sražení') + '</span>' +
      numField('z0', 'Z', 'mm', 'Z čela', ' value="0"') +
    '</div>' +
    '<div id="nrPts"></div>' +
    '<div class="cnc-actions">' +
      '<button class="cnc-btn cnc-btn-clear">🗑 Vymazat</button>' +
      '<button class="cnc-btn cnc-btn-copy">📋 Kopírovat</button>' +
    '</div>' +
    '<div class="calc-note">Bez G41/G42 vede řídicí systém <b>teoretickou špičku P</b> (průsečík tečen k rádiusu ' +
      'rovnoběžných s osami). Na válci a čele to nevadí, na sražení, kuželu a rádiusu ano – tyto posuny to vyrovnají. ' +
      'Platí pro soustružení ke sklíčidlu (−Z), nůž v poloze 3 (vnější) / 2 (vnitřní).</div>';

  const overlay = makeOverlay('noseRadius', '◢ Korekce na rádius špičky rε', body);
  if (!overlay) return;

  const q = (id) => overlay.querySelector('[data-id="' + id + '"]');
  const inp = { r: q('r'), a: q('a'), R: q('R'), D: q('D'), c: q('c'), z0: q('z0') };
  const sel = { side: q('side'), orient: q('orient'), arcType: q('arcType') };
  const svg = overlay.querySelector('#nrSvg');
  const resultEl = overlay.querySelector('#nrResult');
  const ptsEl = overlay.querySelector('#nrPts');
  const orientInfo = overlay.querySelector('#nrOrientInfo');
  let mode = 'line';
  let copyLines = [];

  function showMode() {
    overlay.querySelectorAll('[data-show]').forEach(e => { e.style.display = e.dataset.show === mode ? '' : 'none'; });
  }

  function describe(internal) {
    if (mode === 'line') {
      const grows = (sel.orient.value === 'std') !== internal;   // vnější std / vnitřní rev = Ø roste ke sklíčidlu
      const what = sel.orient.value === 'std'
        ? (internal ? 'sražení na vstupu díry, kužel do díry' : 'sražení na konci hřídele, kužel ke sklíčidlu')
        : 'zpětný kužel – nůž ho bere zadní stranou rádiusu';
      return 'Ø ' + (grows ? 'roste' : 'klesá') + ' ke sklíčidlu (−Z): ' + what;
    }
    return sel.arcType.value === 'convex'
      ? (internal ? 'Zaoblení hrany na vstupu díry Ø D' : 'Zaoblení hrany mezi čelem a válcem Ø D')
      : (internal ? 'Rádius v osazení díry Ø D (čelo osazení k +Z)' : 'Rádius v osazení u válce Ø D (čelo osazení k +Z)');
  }

  function ptsTable(rows) {
    return '<table class="calc-pts"><thead><tr><th>Bod</th><th>Z</th><th>Ø X</th></tr></thead><tbody>' +
      rows.map(([name, p, prog]) => '<tr' + (prog ? ' class="calc-pts-prog"' : '') + '><td>' + name + '</td><td>' +
        fmt(p.z) + '</td><td>' + fmt(p.d) + '</td></tr>').join('') + '</tbody></table>';
  }

  function solve() {
    const internal = sel.side.value === 'int';
    orientInfo.textContent = describe(internal);
    const r = val(inp.r), D = val(inp.D), z0 = val(inp.z0) ?? 0;
    copyLines = [];
    ptsEl.innerHTML = '';
    svgClear(svg);
    if (!(Number.isFinite(r) && r >= 0)) { resultEl.innerHTML = outHint('Zadej rádius špičky rε (0 a víc).'); return; }
    if (!Number.isFinite(z0)) { resultEl.innerHTML = outWarn('Neplatné Z.'); return; }
    if (mode === 'line') solveLine(r, internal, D, z0);
    else solveArc(r, internal, D, z0);
  }

  function solveLine(r, internal, D, z0) {
    const a = val(inp.a);
    const reverse = sel.orient.value === 'rev';
    const corr = Number.isFinite(a) ? lineCorrection(r, a, { internal, reverse }) : null;
    if (!corr) { resultEl.innerHTML = outHint('Úhel α musí být mezi 0° a 90° (od osy Z).'); return; }
    drawLine(r, corr, internal);
    const err = Math.abs(corr.delta);
    resultEl.innerHTML =
      outMain('ΔZ ' + signed(corr.dz) + ' · ΔØ ' + signed(2 * corr.dx), 'posun bodů na válci (Z) · na čele (X, průměr)') +
      outRow('Posun bodů na válci (Z)', signed(corr.dz) + ' mm') +
      outRow('Posun bodů na čele (X na průměr)', signed(2 * corr.dx) + ' mm') +
      outRow('Chyba bez korekce (kolmo k obrysu)', fmt(err) + ' mm') +
      (err > 1e-9 ? outRow('Bez korekce', corr.delta < 0 ? 'zůstane materiál' : 'podřízne obrys') : '') +
      outFormula(reverse ? 'ΔZ = rε·(1 + tan(α/2)), ΔX = rε·(tan(45° + α/2) − 1)' : 'ΔZ = rε·(1 − tan(α/2)), ΔX = rε·(1 − tan(45° − α/2))');
    copyLines.push('Korekce rε=' + fmt(r) + ' α=' + fmt(a, 2) + '° (' + (internal ? 'vnitřní' : 'vnější') + (reverse ? ', zpětný kužel' : '') + '): ΔZ=' +
      signed(corr.dz) + ' ΔØ=' + signed(2 * corr.dx));

    if (reverse) { ptsEl.innerHTML = outHint('Body sražení se počítají jen pro sražení / kužel, ne pro zpětný kužel.'); return; }
    const c = val(inp.c);
    if (D === null && c === null) return;
    const cp = Number.isFinite(D) && Number.isFinite(c) ? chamferPoints(r, a, D, c, z0, internal) : null;
    if (!cp) { ptsEl.innerHTML = outWarn('Zadej kladné Ø D a délku sražení c (sražení nesmí být větší než poloměr).'); return; }
    const code = 'G1 X' + fmt(cp.prog.a.d) + ' Z' + fmt(cp.prog.a.z) + '\nG1 X' + fmt(cp.prog.b.d) + ' Z' + fmt(cp.prog.b.z);
    ptsEl.innerHTML = ptsTable([
      ['Obrys – na čele', cp.contour.a], ['Program – na čele', cp.prog.a, true],
      ['Obrys – na ' + (internal ? 'díře' : 'válci'), cp.contour.b], ['Program – na ' + (internal ? 'díře' : 'válci'), cp.prog.b, true],
    ]) + '<pre class="calc-code">' + code + '</pre>';
    copyLines.push(code);
  }

  function solveArc(r, internal, D, z0) {
    const R = val(inp.R);
    const concave = sel.arcType.value === 'concave';
    if (!(Number.isFinite(R) && R > 0)) { resultEl.innerHTML = outHint('Zadej rádius obrysu R.'); return; }
    if (concave && R < r) {
      resultEl.innerHTML = outWarn('Rádius nože rε je větší než vydutý rádius R – nůž ho nevyrobí (podřízne).');
      return;
    }
    const Rp = concave ? R - r : R + r;
    const sx = internal ? -1 : 1;
    drawArc(r, R, concave, internal);
    resultEl.innerHTML =
      outMain("R' = " + fmt(Rp) + ' mm', 'programovaný rádius dráhy P (' + (concave ? 'R − rε' : 'R + rε') + ')') +
      outRow('Bod na čele: posun X na průměr', signed(-sx * 2 * r) + ' mm') +
      outRow('Bod na ' + (internal ? 'díře' : 'válci') + ': posun Z', signed(-r) + ' mm') +
      (Rp === 0 ? outHint("R' = 0 – špička P projede roh bez oblouku.") : '') +
      outFormula('Střed oblouku P = střed obrysu posunutý o rε ke sklíčidlu (−Z) a o rε ' + (internal ? 'od osy (+X)' : 'k ose (−X)') + '.');
    copyLines.push('Korekce rε=' + fmt(r) + ', ' + (concave ? 'vydutý' : 'vypouklý') + ' R=' + fmt(R) + " → R'=" + fmt(Rp));

    if (D === null) return;
    const ac = Number.isFinite(D) ? arcCorrection(r, R, D, z0, { internal, concave }) : null;
    if (!ac || ac.contour.face.d < 0 || ac.prog.face.d < 0) { ptsEl.innerHTML = outWarn('Zadej kladné Ø D (rádius se musí vejít do průměru).'); return; }
    const first = concave ? 'cyl' : 'face', second = concave ? 'face' : 'cyl';
    const nm = { face: 'na čele', cyl: internal ? 'na díře' : 'na válci' };
    ptsEl.innerHTML = ptsTable([
      ['Obrys – ' + nm[first], ac.contour[first]], ['Program – ' + nm[first], ac.prog[first], true],
      ['Obrys – ' + nm[second], ac.contour[second]], ['Program – ' + nm[second], ac.prog[second], true],
      ['Střed oblouku obrysu', ac.contour.center], ['Střed oblouku P', ac.prog.center, true],
    ]);
    copyLines.push('Program: ' + nm[first] + ' X' + fmt(ac.prog[first].d) + ' Z' + fmt(ac.prog[first].z) + ', ' + nm[second] + ' X' +
      fmt(ac.prog[second].d) + ' Z' + fmt(ac.prog[second].z) + ", R'=" + fmt(ac.Rp));
  }

  // ── Náčrt (z vodorovně, x = poloměr nahoru; vnitřní je zrcadlo) ──
  // Nůž: rádius + dvě tečny rovnoběžné s osami, které se protnou v P.
  function drawTool(map, C, r, qz, qx, L) {
    const T1 = [C[0], C[1] + r * qx], T2 = [C[0] + r * qz, C[1]];
    const arc = [];
    for (let i = 0; i <= 16; i++) {          // čtvrt rádiusu mezi T1 a T2 (strana k P)
      const t = Math.PI / 2 * i / 16;
      arc.push([C[0] + r * qz * Math.sin(t), C[1] + r * qx * Math.cos(t)]);
    }
    const body = [[T1[0] - qz * L, T1[1]], ...arc, [T2[0], T2[1] - qx * L], [T1[0] - qz * L, T2[1] - qx * L]];
    svg.appendChild(svgEl('polygon', { points: svgPoints(map, body), class: 'cs-tool' }));
    svg.appendChild(svgEl('circle', { cx: map(...C)[0], cy: map(...C)[1], r: r * map.scale, class: 'cs-nose' }));
    const P = [C[0] + r * qz, C[1] + r * qx];
    svg.appendChild(svgEl('polyline', { points: svgPoints(map, [T1, P, T2]), class: 'cs-thin' }));
    const [px, py] = map(...P);
    svg.appendChild(svgEl('circle', { cx: px, cy: py, r: 3, class: 'cs-tip' }));
    svg.appendChild(svgEl('text', { x: px - 6, y: py + (qx < 0 ? 14 : -6), class: 'cs-txt', 'text-anchor': 'end' }, 'P'));
    return P;
  }

  function clipHalfPlane(poly, n) {        // ponechá body s p·n ≤ 0
    const out = [];
    for (let i = 0; i < poly.length; i++) {
      const A = poly[i], B = poly[(i + 1) % poly.length];
      const da = A[0] * n.z + A[1] * n.x, db = B[0] * n.z + B[1] * n.x;
      if (da <= 0) out.push(A);
      if ((da < 0) !== (db < 0) && da !== db) { const t = da / (da - db); out.push([A[0] + t * (B[0] - A[0]), A[1] + t * (B[1] - A[1])]); }
    }
    return out;
  }

  function drawLine(r, corr, internal) {
    const u = r > 0 ? r : 1;                  // jednotka velikosti náčrtu (rε = 0 → ostrý roh, P na obrysu)
    const { n } = corr;
    const t = [n.x, -n.z];                    // směr obrysu
    const qz = -1, qx = internal ? 1 : -1;
    const C = [n.z * r, n.x * r];             // střed rádiusu – tečný k obrysu v počátku
    const P = [C[0] + r * qz, C[1] + r * qx];
    const L = 3 * u, S = 3.2 * u;
    const map = fitView([[t[0] * S, t[1] * S], [-t[0] * S, -t[1] * S], P, [C[0] - qz * (r + L), C[1] - qx * (r + L)], [C[0] + u, C[1] + u], [C[0] - u, C[1] - u]], 340, 190);
    const big = 20 * u;
    svg.appendChild(svgEl('polygon', { points: svgPoints(map, clipHalfPlane([[-big, -big], [big, -big], [big, big], [-big, big]], n)), class: 'cs-mat' }));
    svg.appendChild(svgEl('line', { x1: map(...t.map(v => v * big))[0], y1: map(...t.map(v => v * big))[1], x2: map(...t.map(v => -v * big))[0], y2: map(...t.map(v => -v * big))[1], class: 'cs-contour' }));
    const d = corr.delta;                     // dráha P = obrys posunutý o δ·n
    const p1 = [n.z * d + t[0] * big, n.x * d + t[1] * big], p2 = [n.z * d - t[0] * big, n.x * d - t[1] * big];
    svg.appendChild(svgEl('line', { x1: map(...p1)[0], y1: map(...p1)[1], x2: map(...p2)[0], y2: map(...p2)[1], class: 'cs-prog' }));
    drawTool(map, C, r, qz, qx, L);
    legend();
  }

  function arcPts(cz, cx, R, a0, a1, k = 24) {
    const pts = [];
    for (let i = 0; i <= k; i++) { const a = a0 + (a1 - a0) * i / k; pts.push([cz + R * Math.cos(a), cx + R * Math.sin(a)]); }
    return pts;
  }

  function drawArc(r, R, concave, internal) {
    const u = r > 0 ? r : R / 4;              // jednotka velikosti náčrtu
    const m = internal ? -1 : 1;              // vnitřní = zrcadlo podle osy z
    const M = (pts) => pts.map(([z, x]) => [z, m * x]);
    const qz = -1, qx = -m;
    const k = Math.SQRT1_2;
    let mat, contour, C, progC, Rp, a0, a1;
    const E = 3 * u + R;
    if (!concave) {                           // čelo z = 0, válec x = 0, střed (−R, −R)
      contour = arcPts(-R, -R, R, 0, Math.PI / 2);
      mat = [[0, -R - E], ...contour, [-R - E, 0], [-R - E, -R - E]];
      C = [-R + (R + r) * k, -R + (R + r) * k];
      progC = [-R - r, -R - r]; Rp = R + r; a0 = 0; a1 = Math.PI / 2;
    } else {                                  // válec x = 0 pro z ≥ R, čelo z = 0 pro x ≥ R, střed (R, R)
      contour = arcPts(R, R, R, -Math.PI / 2, -Math.PI);
      mat = [[R + E, 0], ...contour, [0, R + E], [-E, R + E], [-E, -E], [R + E, -E]];
      C = [R - (R - r) * k, R - (R - r) * k];
      progC = [R - r, R - r]; Rp = R - r; a0 = -Math.PI / 2; a1 = -Math.PI;
    }
    const prog = Rp > 0 ? arcPts(progC[0], progC[1], Rp, a0, a1) : [[progC[0], progC[1]]];
    const Cm = [C[0], m * C[1]];
    const L = 3 * u;
    const tip = [Cm[0] - qz * (r + L), Cm[1] - qx * (r + L)];   // vzdálený roh nože (už zrcadlený)
    const view = [...M([...contour, ...prog, [C[0] + u, C[1] + u], [C[0] - u, C[1] - u]]), tip];
    const map = fitView(view, 340, 190);
    svg.appendChild(svgEl('polygon', { points: svgPoints(map, M(mat)), class: 'cs-mat' }));
    const ext = concave ? [[R + E, 0], ...contour, [0, R + E]] : [[0, -R - E], ...contour, [-R - E, 0]];
    svg.appendChild(svgEl('polyline', { points: svgPoints(map, M(ext)), class: 'cs-contour' }));
    if (prog.length > 1) {
      // Na válci i čele jede P přímo po obrysu (posun jen podél nich)
      const pe = concave ? [[R + E, 0], ...prog, [0, R + E]] : [[0, -R - E], ...prog, [-R - E, 0]];
      svg.appendChild(svgEl('polyline', { points: svgPoints(map, M(pe)), class: 'cs-prog' }));
    }
    drawTool(map, Cm, r, qz, qx, L);
    legend();
  }

  function legend() {
    svg.appendChild(svgEl('text', { x: 6, y: 184, class: 'cs-txt-s' }, '— obrys   - - dráha P   ● P teoretická špička'));
  }

  // ── Události ──
  wireTabs(overlay, (t) => { mode = t; showMode(); updateLabels(); solve(); });
  wireQuickButtons(overlay, inp.r);
  Object.values(inp).forEach(i => i.addEventListener('input', solve));
  Object.values(sel).forEach(s => s.addEventListener('change', () => { updateLabels(); solve(); }));

  function updateLabels() {
    const internal = sel.side.value === 'int';
    const concave = sel.arcType.value === 'concave';
    const dLbl = inp.D.closest('label').querySelector('span');
    const zLbl = inp.z0.closest('label').querySelector('span');
    dLbl.innerHTML = 'Ø D <small>' + (internal ? 'díry' : 'válce') + (mode === 'arc' && concave ? ' u osazení' : '') + '</small>';
    zLbl.innerHTML = 'Z <small>' + (mode === 'arc' && concave ? 'osazení' : 'čela') + '</small>';
  }

  overlay.querySelector('.cnc-btn-clear').addEventListener('click', () => {
    ['R', 'D', 'c'].forEach(id => { inp[id].value = ''; });
    inp.z0.value = '0';
    solve();
  });
  overlay.querySelector('.cnc-btn-copy').addEventListener('click', () => {
    if (!copyLines.length) { showToast('Zadej hodnoty'); return; }
    copyText(copyLines.join('\n'));
  });

  showMode();
  updateLabels();
  solve();
}
