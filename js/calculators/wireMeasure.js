// ╔══════════════════════════════════════════════════════════════╗
// ║  SKICA – Kalkulačka: měření přes drátky a válečky            ║
// ╚══════════════════════════════════════════════════════════════╝
//
// Záložky: Závit (tři drátky) · Kužel (dva válečky + měrky) · Rybina.

import { showToast } from '../state.js';
import { makeOverlay } from '../dialogFactory.js';
import {
  THREAD_TYPES, bestWire, nearestWire, threadWireM, threadD2FromM,
  taperFromRollers, rollersForTaper, dovetailM, dovetailWidth,
} from './wireMeasureMath.js';
import {
  fmt, numVal as val, numField, selectField, tabsHtml, wireTabs,
  outRow, outWarn, outHint, outMain, outFormula, copyText, svgEl, svgClear, fitView, svgPoints, svgDimH,
} from './calcKit.js';

const show = (tab, html) => '<div data-tab-body="' + tab + '">' + html + '</div>';

export function openWireMeasureCalc() {
  const body =
    tabsHtml([['thread', 'Závit – 3 drátky'], ['taper', 'Kužel'], ['dove', 'Rybina']]) +
    show('thread',
      '<div class="cnc-fields">' +
        '<span class="cnc-field-full">' + selectField('tType', 'Závit', [...THREAD_TYPES.map(t => [t.id, t.name]), ['custom', 'Vlastní úhel profilu']]) + '</span>' +
        numField('tD', 'd', 'mm jmenovitý', 'např. 10') +
        numField('tP', 'P', 'mm stoupání', 'UN: 25,4 / TPI') +
        '<span data-custom="1">' + numField('tA', 'α', '° profilu', '60') + '</span>' +
        numField('tD2', 'd₂', 'mm (prázdné = z d, P)', 'střední Ø') +
        numField('tW', 'd_w', 'mm drátek', 'ze sady') +
        numField('tM', 'M', 'mm naměřeno', 'volitelně') +
      '</div>') +
    show('taper',
      '<div class="cnc-fields">' +
        '<span class="cnc-field-full">' + selectField('kMode', 'Výpočet', [['meas', 'Z naměřených M1, M2'], ['draw', 'Kontrolní míry z výkresu']]) + '</span>' +
        numField('kDv', 'd_v', 'mm válečky', 'Ø válečků') +
        numField('kH', 'h', 'mm měrky', 'Výška měrek') +
        '<span data-kmode="meas">' + numField('kM1', 'M1', 'mm na desce', 'naměřeno') + '</span>' +
        '<span data-kmode="meas">' + numField('kM2', 'M2', 'mm na měrkách', 'naměřeno') + '</span>' +
        '<span data-kmode="draw" class="cnc-field-full">' + selectField('kStand', 'Kužel stojí na', [['small', 'menším průměru'], ['large', 'větším průměru']]) + '</span>' +
        '<span data-kmode="draw">' + numField('kDb', 'Ø u desky', 'mm', 'průměr v rovině desky') + '</span>' +
        '<span data-kmode="draw">' + numField('kA', 'α', '° vrcholový', 'nebo 1:x →') + '</span>' +
        '<span data-kmode="draw">' + numField('kR', '1:x', 'kuželovitost', 'např. 20') + '</span>' +
      '</div>') +
    show('dove',
      '<div class="cnc-fields">' +
        selectField('rKind', 'Rybina', [['ext', 'Vnější (čep)'], ['int', 'Vnitřní (drážka)']]) +
        numField('rA', 'α', '° bok × základna', '60', ' value="60"') +
        numField('rDv', 'd_v', 'mm válečky', 'Ø válečků') +
        numField('rB', 'B', 'mm šířka u paty', 'z výkresu') +
        numField('rM', 'M', 'mm přes válečky', 'naměřeno') +
      '</div>' +
      '<div class="calc-note" style="margin-bottom:8px">Zadej šířku nebo naměřenou míru – druhá se dopočítá.</div>') +
    '<svg class="calc-svg" viewBox="0 0 340 190" id="wmSvg" role="img" aria-label="Náčrt měření"></svg>' +
    '<div class="calc-out" id="wmResult"></div>' +
    '<div class="cnc-actions">' +
      '<button class="cnc-btn cnc-btn-clear">🗑 Vymazat</button>' +
      '<button class="cnc-btn cnc-btn-copy">📋 Kopírovat</button>' +
    '</div>' +
    '<div class="calc-note" id="wmNote"></div>';

  const overlay = makeOverlay('wireMeasure', '⦶ Měření přes drátky a válečky', body);
  if (!overlay) return;

  const q = (id) => overlay.querySelector('[data-id="' + id + '"]');
  const ids = ['tType', 'tD', 'tP', 'tA', 'tD2', 'tW', 'tM', 'kMode', 'kDv', 'kH', 'kM1', 'kM2', 'kStand', 'kDb', 'kA', 'kR',
    'rKind', 'rA', 'rDv', 'rB', 'rM'];
  const f = {};
  ids.forEach(id => { f[id] = q(id); });
  const svg = overlay.querySelector('#wmSvg');
  const resultEl = overlay.querySelector('#wmResult');
  const noteEl = overlay.querySelector('#wmNote');
  let tab = 'thread';
  let doveSrc = null;     // 'rB' | 'rM' – které pole rybiny zadal uživatel
  let copyLine = '';

  const NOTES = {
    thread: 'Dva drátky do sousedních drážek na jedné straně, jeden na druhé; M přes vnější strany drátků. ' +
      'Optimální drátek se dotýká boků na středním průměru. Korekce na úhel stoupání je zanedbaná.',
    taper: 'Kužel stojí na rovinné desce; dva válečky na desce → M1, pak na stejných měrkách výšky h → M2. ' +
      'Kužel může stát na menším i větším průměru (pozná se z M2 > M1 / M2 < M1).',
    dove: 'Válečky v rozích u paty (vnější) / u dna (vnitřní); úhel α mezi bokem a základnou (běžně 55° nebo 60°). ' +
      'Váleček se musí dotknout boku pod jeho horní hranou.',
  };

  function showTab() {
    overlay.querySelectorAll('[data-tab-body]').forEach(e => { e.style.display = e.dataset.tabBody === tab ? '' : 'none'; });
    overlay.querySelectorAll('[data-custom]').forEach(e => { e.style.display = f.tType.value === 'custom' ? '' : 'none'; });
    overlay.querySelectorAll('[data-kmode]').forEach(e => { e.style.display = e.dataset.kmode === f.kMode.value ? '' : 'none'; });
    noteEl.textContent = NOTES[tab];
  }

  function solve() {
    svgClear(svg);
    copyLine = '';
    if (tab === 'thread') solveThread();
    else if (tab === 'taper') solveTaper();
    else solveDove();
  }

  // ── Závit ──
  function solveThread() {
    const type = THREAD_TYPES.find(t => t.id === f.tType.value);
    const angle = type ? type.angle : val(f.tA);
    const d = val(f.tD), P = val(f.tP), d2in = val(f.tD2), dwIn = val(f.tW), Min = val(f.tM);
    if (!type && !(angle > 0 && angle < 180)) { resultEl.innerHTML = outHint('Zadej úhel profilu α (0–180°).'); return; }
    if (P === null) { resultEl.innerHTML = outHint('Zadej stoupání P.'); return; }
    if (!(P > 0)) { resultEl.innerHTML = outWarn('Neplatné stoupání P.'); return; }
    let d2 = d2in;
    if (d2 === null) {
      if (!type) { resultEl.innerHTML = outHint('U vlastního profilu zadej střední průměr d₂.'); return; }
      if (d === null) { resultEl.innerHTML = outHint('Zadej jmenovitý průměr d (nebo přímo d₂).'); return; }
      d2 = d > 0 ? type.d2(d, P) : NaN;
    }
    if (!(d2 > 0)) { resultEl.innerHTML = outWarn('Neplatný průměr d / d₂.'); return; }
    if (dwIn !== null && !(dwIn > 0)) { resultEl.innerHTML = outWarn('Neplatný průměr drátku.'); return; }
    const opt = bestWire(P, angle);
    const dw = dwIn ?? nearestWire(opt);
    const M = threadWireM(d2, P, angle, dw);
    f.tW.placeholder = 'sada ' + fmt(nearestWire(opt)) + ' (opt. ' + fmt(opt) + ')';
    drawThread(P, angle, dw);
    let html = outMain('M = ' + fmt(M) + ' mm', 'míra přes drátky d_w ' + fmt(dw) + (dwIn === null ? ' (nejbližší ze sady)' : '')) +
      outRow('Střední průměr d₂' + (d2in === null ? ' (jmenovitý)' : ''), fmt(d2) + ' mm') +
      outRow('Optimální drátek', fmt(opt) + ' mm');
    if (Min !== null) {
      if (!(Min > 0)) html += outWarn('Neplatná naměřená míra M.');
      else {
        const d2m = threadD2FromM(Min, P, angle, dw);
        html += outRow('d₂ skutečný (z naměřeného M)', fmt(d2m) + ' mm') +
          outRow('Odchylka d₂', (d2m - d2 >= 0 ? '+' : '') + fmt((d2m - d2) * 1000, 0) + ' µm');
      }
    }
    html += outFormula('M = d₂ + d_w·(1 + 1/sin(α/2)) − (P/2)·cot(α/2), α = ' + fmt(angle, 2) + '°');
    resultEl.innerHTML = html;
    copyLine = 'Závit ' + (type ? type.id : 'α' + fmt(angle, 2) + '°') + (d ? ' d' + fmt(d) : '') + ' P' + fmt(P) +
      ': d2=' + fmt(d2) + ' dw=' + fmt(dw) + ' M=' + fmt(M);
  }

  function drawThread(P, angle, dw) {
    const h = angle * Math.PI / 360, H = (P / 2) / Math.tan(h), rho = dw / 2;
    const yc = -H / 2 + rho / Math.sin(h);                 // střed drátku nad roztečnou přímkou
    const prof = [];
    for (let k = -1; k <= 2; k++) prof.push([k * P - P / 2, H / 2], [k * P, -H / 2]);
    prof.push([2.5 * P, H / 2]);
    const top = yc + rho;
    const map = fitView([[-1.5 * P, -H / 2 - 0.3 * P], [2.5 * P, Math.max(top, H / 2) + 0.35 * P]], 340, 190);
    const mat = [...prof, [2.5 * P, -H / 2 - 2 * P], [-1.5 * P, -H / 2 - 2 * P]];
    svg.appendChild(svgEl('polygon', { points: svgPoints(map, mat), class: 'cs-mat' }));
    svg.appendChild(svgEl('polyline', { points: svgPoints(map, prof), class: 'cs-contour' }));
    const [x0, y0] = map(-1.5 * P, 0), [x1] = map(2.5 * P, 0);
    svg.appendChild(svgEl('line', { x1: x0, y1: y0, x2: x1, y2: y0, class: 'cs-axis' }));
    svg.appendChild(svgEl('text', { x: x0 + 4, y: y0 - 4, class: 'cs-txt-s' }, 'd₂/2'));
    [0, P].forEach(x => {
      const [cx, cy] = map(x, yc);
      svg.appendChild(svgEl('circle', { cx, cy, r: rho * map.scale, class: 'cs-roller' }));
    });
    const [ax, ay] = map(-1.2 * P, top), [bx] = map(2.2 * P, top);
    svg.appendChild(svgEl('line', { x1: ax, y1: ay, x2: bx, y2: ay, class: 'cs-dim' }));
    svg.appendChild(svgEl('text', { x: bx, y: ay - 5, class: 'cs-txt', 'text-anchor': 'end' }, 'dotyk mikrometru → M'));
  }

  // ── Kužel ──
  function solveTaper() {
    const dv = val(f.kDv), h = val(f.kH);
    if (dv === null || h === null) { resultEl.innerHTML = outHint('Zadej Ø válečků d_v a výšku měrek h.'); return; }
    if (!(dv > 0) || !(h > 0)) { resultEl.innerHTML = outWarn('Ø válečků i výška měrek musí být kladné.'); return; }
    if (f.kMode.value === 'meas') {
      const M1 = val(f.kM1), M2 = val(f.kM2);
      if (M1 === null || M2 === null) { resultEl.innerHTML = outHint('Zadej naměřené M1 (na desce) a M2 (na měrkách).'); return; }
      const r = taperFromRollers(M1, M2, h, dv);
      if (!r) { resultEl.innerHTML = outWarn('Míry nedávají kužel – zkontroluj M1, M2, d_v a h.'); return; }
      drawTaper(r.dBase, r.half, r.widening, h, dv, M1, M2);
      resultEl.innerHTML =
        outMain('α = ' + fmt(r.angle, 4) + '°', 'vrcholový úhel (α/2 = ' + fmt(r.half, 4) + '°)') +
        outRow('Kuželovitost', Number.isFinite(r.ratio) ? '1 : ' + fmt(r.ratio, 3) : 'válec') +
        outRow('Ø v rovině desky', fmt(r.dBase) + ' mm') +
        outRow('Ø ve výšce h = ' + fmt(h), fmt(r.dTop) + ' mm') +
        outRow('Kužel stojí na', r.widening ? 'menším průměru' : 'větším průměru') +
        outFormula('tan(α/2) = |M2 − M1| / (2h) · Ø = M1 − d_v·(1 + tan(45° ' + (r.widening ? '+' : '−') + ' α/4))');
      copyLine = 'Kužel přes válečky dv' + fmt(dv) + ' h' + fmt(h) + ': α=' + fmt(r.angle, 4) + '° (1:' + fmt(r.ratio, 3) + '), Ø desky ' + fmt(r.dBase);
      return;
    }
    const Db = val(f.kDb);
    let a = val(f.kA);
    const ratio = val(f.kR);
    if (a === null && ratio !== null) a = ratio > 0 ? 2 * Math.atan(1 / (2 * ratio)) * 180 / Math.PI : NaN;
    if (Db === null || a === null) { resultEl.innerHTML = outHint('Zadej Ø u desky a úhel α (nebo kuželovitost 1:x).'); return; }
    if (!(Db > 0) || !(a >= 0 && a < 180)) { resultEl.innerHTML = outWarn('Neplatný průměr nebo úhel.'); return; }
    const widening = f.kStand.value === 'small';
    const r = rollersForTaper(Db, a, widening, h, dv);
    if (!r) { resultEl.innerHTML = outWarn('Kužel by se ve výšce h zúžil na nulu – zmenši h.'); return; }
    drawTaper(Db, a / 2, widening, h, dv, r.M1, r.M2);
    resultEl.innerHTML =
      outMain('M1 = ' + fmt(r.M1) + ' · M2 = ' + fmt(r.M2), 'míra přes válečky na desce · na měrkách h = ' + fmt(h)) +
      outRow('Rozdíl M2 − M1', (r.M2 - r.M1 >= 0 ? '+' : '') + fmt(r.M2 - r.M1) + ' mm') +
      outRow('Vrcholový úhel α', fmt(a, 4) + '°') +
      outFormula('M1 = Ø + d_v·(1 + tan(45° ' + (widening ? '+' : '−') + ' α/4)) · M2 = M1 ' + (widening ? '+' : '−') + ' 2h·tan(α/2)');
    copyLine = 'Kužel Ø' + fmt(Db) + ' α' + fmt(a, 4) + '° dv' + fmt(dv) + ' h' + fmt(h) + ': M1=' + fmt(r.M1) + ' M2=' + fmt(r.M2);
  }

  function drawTaper(Db, halfDeg, widening, h, dv, M1, M2) {
    const t = Math.tan(halfDeg * Math.PI / 180) * (widening ? 1 : -1), rho = dv / 2;
    const top = h + dv + Math.max(dv, h * 0.4);
    const rTop = Db / 2 + top * t;
    const W = Math.max(M1, M2) / 2 + dv * 0.6;
    const map = fitView([[-W, -dv * 0.4], [W, top + dv * 0.9]], 340, 190);
    svg.appendChild(svgEl('line', { x1: map(-W, 0)[0], y1: map(0, 0)[1], x2: map(W, 0)[0], y2: map(0, 0)[1], class: 'cs-contour' }));
    svg.appendChild(svgEl('polygon', { points: svgPoints(map, [[-Db / 2, 0], [Db / 2, 0], [rTop, top], [-rTop, top]]), class: 'cs-mat' }));
    svg.appendChild(svgEl('polygon', { points: svgPoints(map, [[-Db / 2, 0], [Db / 2, 0], [rTop, top], [-rTop, top]]), class: 'cs-thin' }));
    for (const s of [-1, 1]) {
      const [x1, y1] = map(s * (M1 / 2 - rho), rho);
      svg.appendChild(svgEl('circle', { cx: x1, cy: y1, r: rho * map.scale, class: 'cs-roller' }));
      const bx = s * (M2 / 2 - rho);
      const blk = [[bx - rho * 0.9, 0], [bx + rho * 0.9, 0], [bx + rho * 0.9, h], [bx - rho * 0.9, h]];
      svg.appendChild(svgEl('polygon', { points: svgPoints(map, blk), class: 'cs-thin' }));
      const [x2, y2] = map(bx, h + rho);
      svg.appendChild(svgEl('circle', { cx: x2, cy: y2, r: rho * map.scale, class: 'cs-roller', 'stroke-dasharray': '3 2' }));
    }
    const yM1 = map(0, 0)[1] + 12, yM2 = map(0, h + dv)[1] - 6;
    svgDimH(svg, map(-M1 / 2, 0)[0], map(M1 / 2, 0)[0], yM1, 'M1');
    svgDimH(svg, map(-M2 / 2, 0)[0], map(M2 / 2, 0)[0], yM2, 'M2');
  }

  // ── Rybina ──
  function solveDove() {
    const internal = f.rKind.value === 'int';
    const a = val(f.rA), dv = val(f.rDv);
    f.rB.closest('label').querySelector('span').innerHTML = (internal ? 'A' : 'B') + ' <small>mm šířka ' + (internal ? 'u dna' : 'u paty') + '</small>';
    f.rM.closest('label').querySelector('span').innerHTML = (internal ? 'X' : 'M') + ' <small>mm ' + (internal ? 'mezi válečky' : 'přes válečky') + '</small>';
    if (!(a > 0 && a < 180)) { resultEl.innerHTML = outHint('Zadej úhel α (bok × základna, 0–180°).'); return; }
    if (dv === null) { resultEl.innerHTML = outHint('Zadej Ø válečků d_v.'); return; }
    if (!(dv > 0)) { resultEl.innerHTML = outWarn('Neplatný Ø válečků.'); return; }
    if (!doveSrc) { resultEl.innerHTML = outHint('Zadej šířku z výkresu nebo naměřenou míru.'); drawDove(null, a, dv, internal); return; }
    const src = val(f[doveSrc]);
    const dst = f[doveSrc === 'rB' ? 'rM' : 'rB'];
    const out = !(src > 0) ? NaN : doveSrc === 'rB' ? dovetailM(src, a, dv, internal) : dovetailWidth(src, a, dv, internal);
    if (!(out > 0)) {
      dst.value = ''; dst.classList.remove('computed');
      resultEl.innerHTML = outWarn(!(src > 0) ? 'Neplatná hodnota.' : 'Válečky se do rybiny nevejdou – zmenši d_v.');
      return;
    }
    dst.value = fmt(out); dst.classList.add('computed');
    const width = doveSrc === 'rB' ? src : out, M = doveSrc === 'rB' ? out : src;
    drawDove(width, a, dv, internal, M);
    const k = dv * (1 + 1 / Math.tan(a * Math.PI / 360));
    resultEl.innerHTML =
      outMain((internal ? 'X = ' : 'M = ') + fmt(M) + ' mm', (internal ? 'mezi válečky' : 'přes válečky') + ' · šířka ' + (internal ? 'A' : 'B') + ' = ' + fmt(width)) +
      outRow('Přídavek válečků d_v·(1 + cot(α/2))', fmt(k) + ' mm') +
      outFormula(internal ? 'X = A − d_v·(1 + cot(α/2))' : 'M = B + d_v·(1 + cot(α/2))');
    copyLine = 'Rybina ' + (internal ? 'vnitřní A=' : 'vnější B=') + fmt(width) + ' α' + fmt(a, 2) + '° dv' + fmt(dv) + ': ' + (internal ? 'X=' : 'M=') + fmt(M);
  }

  function drawDove(width, a, dv, internal, M) {
    const rho = dv / 2, ct = 1 / Math.tan(a * Math.PI / 180), cHalf = 1 / Math.tan(a * Math.PI / 360);
    const Wd = width ?? (internal ? 6 * dv : 4 * dv);
    const Hd = Math.max(1.8 * dv, Wd * 0.25);
    const off = rho * cHalf;                              // vodorovná vzdálenost středu válečku od rohu
    const ext = Wd / 2 + Hd * ct + dv * 1.5;
    const map = fitView([[-ext, -dv * 0.8], [ext, Hd + dv * 0.8]], 340, 190);
    if (!internal) {
      svg.appendChild(svgEl('line', { x1: map(-ext, 0)[0], y1: map(0, 0)[1], x2: map(ext, 0)[0], y2: map(0, 0)[1], class: 'cs-contour' }));
      const body = [[-Wd / 2, 0], [Wd / 2, 0], [Wd / 2 + Hd * ct, Hd], [-Wd / 2 - Hd * ct, Hd]];
      svg.appendChild(svgEl('polygon', { points: svgPoints(map, body), class: 'cs-mat' }));
      svg.appendChild(svgEl('polygon', { points: svgPoints(map, body), class: 'cs-contour' }));
      for (const s of [-1, 1]) {
        const [cx, cy] = map(s * (Wd / 2 + off), rho);
        svg.appendChild(svgEl('circle', { cx, cy, r: rho * map.scale, class: 'cs-roller' }));
      }
    } else {
      const groove = [[-ext, Hd], [-Wd / 2 + Hd * ct, Hd], [-Wd / 2, 0], [Wd / 2, 0], [Wd / 2 - Hd * ct, Hd], [ext, Hd], [ext, -dv * 0.8], [-ext, -dv * 0.8]];
      svg.appendChild(svgEl('polygon', { points: svgPoints(map, groove), class: 'cs-mat' }));
      svg.appendChild(svgEl('polyline', { points: svgPoints(map, groove.slice(0, 6)), class: 'cs-contour' }));
      for (const s of [-1, 1]) {
        const [cx, cy] = map(s * (Wd / 2 - off), rho);
        svg.appendChild(svgEl('circle', { cx, cy, r: rho * map.scale, class: 'cs-roller' }));
      }
    }
    if (M > 0) {
      const y = map(0, rho)[1];
      svgDimH(svg, map(-M / 2, 0)[0], map(M / 2, 0)[0], y, (internal ? 'X' : 'M') + ' = ' + fmt(M));
    }
  }

  // ── Události ──
  wireTabs(overlay, (t) => { tab = t; showTab(); solve(); });
  ids.forEach(id => {
    const el = f[id];
    el.addEventListener(el.tagName === 'SELECT' ? 'change' : 'input', () => {
      if (id === 'rB' || id === 'rM') {
        el.classList.remove('computed');
        if (el.value.trim() === '') { doveSrc = null; const o = f[id === 'rB' ? 'rM' : 'rB']; o.value = ''; o.classList.remove('computed'); }
        else doveSrc = id;
      }
      if (id === 'kA' && el.value.trim() !== '') f.kR.value = '';
      if (id === 'kR' && el.value.trim() !== '') f.kA.value = '';
      showTab();
      solve();
    });
  });

  overlay.querySelector('.cnc-btn-clear').addEventListener('click', () => {
    ids.forEach(id => { if (f[id].tagName !== 'SELECT' && id !== 'rA') { f[id].value = ''; f[id].classList.remove('computed'); } });
    doveSrc = null;
    solve();
  });
  overlay.querySelector('.cnc-btn-copy').addEventListener('click', () => {
    if (!copyLine) { showToast('Zadej hodnoty'); return; }
    copyText(copyLine);
  });

  showTab();
  solve();
}
