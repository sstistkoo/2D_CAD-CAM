// ╔══════════════════════════════════════════════════════════════╗
// ║  SKICA – Fotka výkresu jako podklad: plovoucí panel             ║
// ╚══════════════════════════════════════════════════════════════╝
// 📷 Načíst fotku → leží pod výkresem poloprůhledně přes celý pohled.
// 📏 Měřítko: klepni na 2 body známé kóty na fotce a zadej skutečnou
//    vzdálenost (fotka se zvětší a srovná do osy).
// ✛ Umístit: klepni na bod na fotce a zadej jeho souřadnice (např. 0,0).
// Pak se přes fotku kreslí běžnými nástroji. Panel je plovoucí, plátno pod
// ním zůstává ovladatelné (posun, zoom, klepnutí).

import { state, showToast, coordHelpers, inputX } from '../state.js';
import { renderAll } from '../render.js';
import { drawCanvas, screenToWorld, hSign, vSign } from '../canvas.js';
import { makeOverlay, makeInputOverlay, onOverlayRemoved } from '../dialogFactory.js';
import { setTool } from '../ui.js';
import { safeEvalMath } from '../utils.js';
import { UL, saveUnderlay, updateUnderlay, calibrate, moveTo, transformAbout, mmPerPx } from './underlayDraw.js';

const MAX_PX = 2400;                                   // delší strana uložené fotky
UL.redraw = () => renderAll();                         // fotka načtená z úložiště po startu

/** Zmenší fotku a vrátí JPEG data URL + rozměry. */
function loadImageFile(file) {
  return new Promise((resolve, reject) => {
    const rd = new FileReader();
    rd.onerror = () => reject(new Error('Fotku se nepodařilo přečíst'));
    rd.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Soubor není obrázek'));
      img.onload = () => {
        const k = Math.min(1, MAX_PX / Math.max(img.width, img.height));
        const w = Math.round(img.width * k), h = Math.round(img.height * k);
        const cv = document.createElement('canvas');
        cv.width = w; cv.height = h;
        cv.getContext('2d').drawImage(img, 0, 0, w, h);
        resolve({ src: cv.toDataURL('image/jpeg', 0.85), w, h });
      };
      img.src = /** @type {string} */ (rd.result);
    };
    rd.readAsDataURL(file);
  });
}

/** Počáteční poloha: fotka přes 90 % aktuálního pohledu, nezrcadlená na obrazovce. */
function fitToView(w, h) {
  const r = drawCanvas.getBoundingClientRect();
  const W = r.width || 800, H = r.height || 600;
  const s = Math.min(0.9 * W / w, 0.9 * H / h);         // px obrazovky na px fotky
  const z = state.zoom || 1;
  const [ox, oy] = screenToWorld((W - w * s) / 2, (H - h * s) / 2);
  return { ox, oy, ux: hSign() * s / z, uy: 0, vx: 0, vy: vSign() * s / z };
}

// ── Klepnutí na plátno (bez zásahu do nástrojů: tap, ne posun / zoom) ──
let pick = null;                                       // { n, pts, done, prevTool }
let down = null;
function onDown(e) {
  if (!pick) return;
  down = down && down.id !== e.pointerId ? { ...down, multi: true } : { id: e.pointerId, x: e.clientX, y: e.clientY, t: Date.now(), multi: false };
}
function onUp(e) {
  if (!pick || !down || down.id !== e.pointerId) return;
  const d = down; down = null;
  if (d.multi || Math.hypot(e.clientX - d.x, e.clientY - d.y) > 10 || Date.now() - d.t > 900) return;
  const r = drawCanvas.getBoundingClientRect();
  const [x, y] = screenToWorld(e.clientX - r.left, e.clientY - r.top);
  pick.pts.push({ x, y });
  UL.marks = pick.pts.slice();
  renderAll();
  if (pick.pts.length >= pick.n) {
    const p = pick; endPick();
    p.done(p.pts);
  } else if (pick.onStep) pick.onStep(pick.pts.length);
}
function startPick(n, done, onStep) {
  endPick();
  pick = { n, pts: [], done, onStep, prevTool: state.tool };
  if (state.tool !== 'select') setTool('select');      // klepnutí nesmí kreslit
  drawCanvas.addEventListener('pointerdown', onDown, true);
  drawCanvas.addEventListener('pointerup', onUp, true);
}
function endPick() {
  if (!pick) return;
  const prev = pick.prevTool;
  pick = null; down = null;
  drawCanvas.removeEventListener('pointerdown', onDown, true);
  drawCanvas.removeEventListener('pointerup', onUp, true);
  if (prev && prev !== state.tool) setTool(prev);
}

const num = s => { const v = safeEvalMath(String(s).trim()); return Number.isFinite(v) ? v : NaN; };

/** Otevře panel podkladu. */
export function showUnderlayPanel() {
  const body = `
    <div class="ul-panel">
      <div class="ul-row">
        <label class="calc-btn ul-btn ul-load">📷 Načíst fotku<input type="file" accept="image/*" id="ulFile" hidden></label>
        <button class="calc-btn ul-btn" id="ulVis">👁 Skrýt</button>
      </div>
      <div class="ul-row">
        <button class="calc-btn ul-btn" id="ulScale" title="Klepni na 2 body známé kóty na fotce a zadej skutečnou vzdálenost">📏 Měřítko (2 body)</button>
        <button class="calc-btn ul-btn" id="ulPlace" title="Klepni na bod na fotce a zadej jeho souřadnice">✛ Umístit bod</button>
      </div>
      <div class="ul-row">
        <button class="calc-btn ul-btn" id="ulRotM" title="Natočit o 0,5° (kolem středu pohledu)">⟲ 0,5°</button>
        <button class="calc-btn ul-btn" id="ulRotP" title="Natočit o 0,5° (kolem středu pohledu)">⟳ 0,5°</button>
        <button class="calc-btn ul-btn ul-del" id="ulDel" title="Odstranit fotku z tohoto výkresu">🗑</button>
      </div>
      <label class="ul-op">Průhlednost <input type="range" id="ulOp" min="10" max="100" step="5"></label>
      <div class="ul-info" id="ulInfo"></div>
    </div>`;
  const ov = makeOverlay('photoUnderlay', '🖼️ Fotka výkresu – podklad', body, 'ul-window', { float: true, closeOnEsc: false });
  if (!ov) return;
  const $ = id => /** @type {HTMLElement} */ (ov.querySelector('#' + id));
  const info = $('ulInfo'), op = /** @type {HTMLInputElement} */ ($('ulOp'));

  function refresh(msg) {
    const u = UL.u;
    ov.querySelectorAll('#ulVis, #ulScale, #ulPlace, #ulRotM, #ulRotP, #ulDel, #ulOp').forEach(b => { /** @type {any} */ (b).disabled = !u; });
    $('ulVis').textContent = u && !u.visible ? '👁 Zobrazit' : '👁 Skrýt';
    if (u) op.value = String(Math.round((u.opacity ?? 0.5) * 100));
    info.textContent = msg || (u
      ? `Měřítko ${mmPerPx(u).toFixed(4)} mm/px · fotka ${u.w}×${u.h} px. Kresli přes ni běžnými nástroji.`
      : 'Načti fotku výkresu (vyfoť ji nebo vyber z galerie). Pak 📏 Měřítko podle známé kóty a ✛ Umístit nulový bod.');
  }
  UL.onChange = () => { refresh(); renderAll(); };
  onOverlayRemoved(ov, () => { endPick(); UL.marks = null; UL.onChange = null; renderAll(); });

  $('ulFile').addEventListener('change', async (e) => {
    const f = /** @type {HTMLInputElement} */ (e.target).files?.[0];
    if (!f) return;
    try {
      refresh('Načítám fotku…');
      const im = await loadImageFile(f);
      await saveUnderlay({ ...im, ...fitToView(im.w, im.h), opacity: 0.5, visible: true });
      refresh('Fotka načtená. Teď 📏 Měřítko: klepni na 2 body známé kóty (např. konce Ø).');
      renderAll();
    } catch (err) { refresh(String(err.message || err)); }
    /** @type {HTMLInputElement} */ (e.target).value = '';
  });

  $('ulVis').addEventListener('click', () => {
    if (!UL.u) return;
    updateUnderlay({ ...UL.u, visible: !UL.u.visible }); refresh(); renderAll();
  });
  op.addEventListener('input', () => {
    if (!UL.u) return;
    UL.u = { ...UL.u, opacity: +op.value / 100 };
    renderAll();
  });
  op.addEventListener('change', () => { if (UL.u) updateUnderlay(UL.u); });

  const rotate = (deg) => {
    if (!UL.u) return;
    const r = drawCanvas.getBoundingClientRect();
    const [cx, cy] = screenToWorld(r.width / 2, r.height / 2);
    // natočení na obrazovce: při zrcadleném pohledu má svět opačný smysl
    const sgn = hSign() * vSign() < 0 ? -1 : 1;           // ⟳ = po směru hodin na obrazovce
    updateUnderlay(transformAbout(UL.u, { x: cx, y: cy }, 1, sgn * deg * Math.PI / 180)); refresh(); renderAll();
  };
  $('ulRotM').addEventListener('click', () => rotate(-0.5));
  $('ulRotP').addEventListener('click', () => rotate(0.5));

  $('ulDel').addEventListener('click', () => {
    if (!UL.u || !confirm('Odstranit fotku z tohoto výkresu?')) return;
    saveUnderlay(null); refresh(); renderAll();
  });

  // 📏 Měřítko
  $('ulScale').addEventListener('click', () => {
    if (!UL.u) return;
    refresh('📏 Klepni na fotce na 1. bod známé kóty (můžeš přiblížit / posunout).');
    startPick(2, (pts) => {
      const d = makeInputOverlay(`
        <div class="input-dialog">
          <h3>📏 Měřítko fotky</h3>
          <label>Skutečná vzdálenost mezi body [mm] <small>(lze výraz, např. 480/2)</small></label>
          <input type="text" inputmode="decimal" id="ulReal" autocomplete="off">
          <label>Srovnat fotku</label>
          <select id="ulAlign">
            <option value="auto">podle nejbližší osy (vodorovně / svisle)</option>
            <option value="h">úsečka je vodorovná</option>
            <option value="v">úsečka je svislá</option>
            <option value="keep">nenatáčet</option>
          </select>
          <div class="btn-row"><button class="btn-cancel btn-cancel-overlay">Zrušit</button><button class="btn-ok" id="ulRealOk">Použít</button></div>
        </div>`);
      const inp = /** @type {HTMLInputElement} */ (d.querySelector('#ulReal'));
      const ok = () => {
        const real = num(inp.value);
        if (!(real > 0)) { inp.classList.add('svg-pop-bad'); inp.focus(); return; }
        const align = /** @type {any} */ (/** @type {HTMLSelectElement} */ (d.querySelector('#ulAlign')).value);
        updateUnderlay(calibrate(UL.u, pts[0], pts[1], real, align));
        d.remove(); UL.marks = null;
        refresh(`Měřítko nastavené (${real} mm). Teď ✛ Umístit: klepni na bod, jehož souřadnice znáš.`);
        renderAll();
      };
      d.querySelector('#ulRealOk').addEventListener('click', ok);
      inp.addEventListener('keydown', e => { if (e.key === 'Enter') ok(); });
      onOverlayRemoved(d, () => { UL.marks = null; renderAll(); });
      inp.focus();
    }, () => refresh('📏 Klepni na 2. bod kóty.'));
  });

  // ✛ Umístit bod
  $('ulPlace').addEventListener('click', () => {
    if (!UL.u) return;
    refresh('✛ Klepni na fotce na bod, jehož souřadnice znáš (např. průsečík osy s čelem).');
    startPick(1, (pts) => {
      const { H, V, Hp, Vp } = coordHelpers();
      const isK = state.machineType === 'karusel';
      const d = makeInputOverlay(`
        <div class="input-dialog">
          <h3>✛ Umístit fotku</h3>
          <p style="font-size:12px;margin:0 0 6px">Zadej skutečné souřadnice klepnutého bodu – fotka se posune.</p>
          <label>${Hp}${H}</label><input type="text" inputmode="decimal" id="ulH" value="0" autocomplete="off">
          <label>${Vp}${V}</label><input type="text" inputmode="decimal" id="ulV" value="0" autocomplete="off">
          <div class="btn-row"><button class="btn-cancel btn-cancel-overlay">Zrušit</button><button class="btn-ok" id="ulPlaceOk">Posunout</button></div>
        </div>`);
      const iH = /** @type {HTMLInputElement} */ (d.querySelector('#ulH')), iV = /** @type {HTMLInputElement} */ (d.querySelector('#ulV'));
      const ok = () => {
        const h = num(iH.value), v = num(iV.value);
        if (!Number.isFinite(h) || !Number.isFinite(v)) { (Number.isFinite(h) ? iV : iH).classList.add('svg-pop-bad'); return; }
        const to = { x: isK ? inputX(h) : h, y: isK ? v : inputX(v) };
        updateUnderlay(moveTo(UL.u, pts[0], to));
        d.remove(); UL.marks = null;
        refresh('Fotka umístěná. Kresli přes ni; průhlednost nastavíš posuvníkem.');
        renderAll();
      };
      d.querySelector('#ulPlaceOk').addEventListener('click', ok);
      [iH, iV].forEach(i => i.addEventListener('keydown', e => { if (e.key === 'Enter') ok(); }));
      onOverlayRemoved(d, () => { UL.marks = null; renderAll(); });
      iH.focus(); iH.select();
    });
  });

  refresh();
  if (!UL.u) showToast('Načti fotku výkresu – 📷');
}
