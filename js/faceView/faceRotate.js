// ╔══════════════════════════════════════════════════════════════╗
// ║  SKICA – Bokorys: posuvník natočení pohledu (osa C)           ║
// ╚══════════════════════════════════════════════════════════════╝
// Svislý posuvník VPRAVO od bokorysu (uživatel 22. 10. 2026: „jako
// posuvník u nárysu, aby se dalo pootočit") nastavuje, který úhel C je
// v nárysu nahoře (faceLayer.faceViewC). Nárys pak ukáže díry čel i díry
// v plášti tak, jak při tomto natočení dílu leží (faceFrontView.js,
// shellHoleView.js); v bokorysu je natočení vidět jako průměr s trojúhelníkem
// (shellHoleView.drawViewCut). Tažením nahoru úhel roste (proti směru
// hodinových ručiček jako C v bokorysu); přichytí se k úhlům děr v čele
// i v plášti a k násobkům 45°. Pod posuvníkem políčko pro přesný úhel
// a ⟲ zpět na výchozí. Prvek leží v liště čela (#faceBar, faceBar.js —
// ta ho umísťuje po každém vykreslení), skrývá se s ní.
import { state, showToast } from '../state.js';
import { safeEvalMath } from '../utils.js';
import { worldToScreen } from '../canvas.js';
import { renderAll } from '../render.js';
import { getFaceLayer, faceViewC, setFaceViewC } from './faceLayer.js';
import { faceDiscGeom } from './faceReference.js';
import { snapViewC } from './shellHoleView.js';

const TRACK_W = 22;      // šířka dráhy včetně plochy pro prst [px]

let el = null;
let lastKey = '';

function build() {
  const bar = document.getElementById('faceBar');
  if (!bar) return null;
  el = document.createElement('div');
  el.id = 'faceRot';
  el.innerHTML = `
    <div class="fr-track" title="Natočení dílu: úhel C nahoře v nárysu — táhněte (přichytí se k dírám a po 45°)"><div class="fr-thumb"></div></div>
    <label title="Úhel C, který je v nárysu nahoře">C<input data-fr="c" type="text" inputmode="decimal" autocomplete="off">°</label>
    <button data-fr="reset" title="Zpět na výchozí natočení">⟲</button>`;
  bar.appendChild(el);
  const track = el.querySelector('.fr-track');
  const inp = el.querySelector('[data-fr="c"]');
  let drag = null;
  const at = y => {
    const r = track.getBoundingClientRect();
    const f = Math.max(0, Math.min(1, (y - r.top) / Math.max(1, r.height)));
    apply(snapViewC(360 * (1 - f)));
  };
  track.addEventListener('pointerdown', e => {
    if (e.button !== 0) return;
    e.preventDefault();
    drag = e.pointerId;
    try { track.setPointerCapture(e.pointerId); } catch { /* bez zachycení jen nad dráhou */ }
    at(e.clientY);
  });
  track.addEventListener('pointermove', e => { if (e.pointerId === drag) { e.preventDefault(); at(e.clientY); } });
  ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(t => track.addEventListener(t, e => { if (e.pointerId === drag) drag = null; }));
  track.addEventListener('touchstart', e => e.preventDefault(), { passive: false });
  inp.addEventListener('change', () => {
    const v = safeEvalMath(inp.value);
    if (!Number.isFinite(v)) { showToast('Neplatný úhel'); sync(); return; }
    apply(v);
  });
  el.querySelector('[data-fr="reset"]').addEventListener('click', () => {
    apply(state.machineType === 'karusel' ? 0 : 90);
    showToast('Natočení pohledu: výchozí', 1500);
  });
  return el;
}

function apply(c) {
  if (!getFaceLayer()) return;
  setFaceViewC(c);
  sync();
  renderAll();
}

/** Jezdec a políčko podle aktuálního úhlu. */
function sync() {
  if (!el) return;
  const c = faceViewC();
  el.querySelector('.fr-thumb').style.top = `${(1 - c / 360) * 100}%`;
  const inp = el.querySelector('[data-fr="c"]');
  if (document.activeElement !== inp) inp.value = String(+c.toFixed(1));
}

/**
 * Umístit posuvník vpravo od bokorysu (volá faceBar.js po vykreslení).
 * @param visible lišta čela je vidět
 */
export function placeRotate(visible, w2s = worldToScreen) {
  const disc = faceDiscGeom();
  const cur = getFaceLayer();
  if (!el && visible) build();
  if (!el) return;
  if (!visible || !disc || !cur || !cur.origin) { el.style.display = 'none'; lastKey = ''; return; }
  const c = w2s(disc.x, disc.y), e = w2s(disc.x + disc.R, disc.y);
  const R = Math.abs(e[0] - c[0]);
  const key = [c[0], c[1], R].map(v => v.toFixed(1)).join();
  el.style.display = '';
  sync();
  if (key === lastKey) return;
  lastKey = key;
  const H = Math.max(90, 2 * R);
  el.querySelector('.fr-track').style.height = `${H}px`;
  // Vpravo od bokorysu, ale celý na plátně: na telefonu stojí bokorys u
  // pravého okraje a posuvník by z plátna vypadl (pak se přisune k okraji).
  const cv = document.getElementById('drawCanvas');
  const cw = cv ? cv.clientWidth : Infinity;
  const w = el.offsetWidth || 70;
  const left = Math.max(4, Math.min(c[0] + R * 1.15 + 14, cw - w - 4));
  Object.assign(el.style, { left: `${left}px`, top: `${c[1] - H / 2}px` });
}

export const FACE_ROT_CSS = `
#faceRot { position: absolute; display: flex; flex-direction: column; align-items: center; gap: 4px; }
#faceRot .fr-track {
  position: relative; width: ${TRACK_W}px; cursor: ns-resize; touch-action: none;
  background: linear-gradient(to right, transparent 9px, var(--ctp-surface1) 9px, var(--ctp-surface1) 13px, transparent 13px);
}
#faceRot .fr-thumb {
  position: absolute; left: 2px; width: 18px; height: 18px; margin-top: -9px; border-radius: 50%;
  background: var(--ctp-peach); box-shadow: 0 1px 4px rgba(0,0,0,0.4);
}
#faceRot label {
  display: flex; align-items: center; gap: 2px; font-size: 11px; color: var(--ctp-subtext0);
  background: var(--ctp-mantle); border: 1px solid var(--ctp-surface1); border-radius: 6px; padding: 2px 4px;
}
#faceRot input { width: 38px; background: var(--ctp-surface0); color: var(--ctp-text); border: 1px solid var(--ctp-surface1); border-radius: 4px; padding: 1px 3px; font-size: 11px; }
#faceRot button { background: var(--ctp-surface0); color: var(--ctp-text); border: 1px solid var(--ctp-surface1); border-radius: 5px; padding: 1px 6px; cursor: pointer; font-size: 12px; }`;
