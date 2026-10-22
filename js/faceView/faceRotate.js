// ╔══════════════════════════════════════════════════════════════╗
// ║  SKICA – Bokorys: posuvník natočení pohledu (osa C)           ║
// ╚══════════════════════════════════════════════════════════════╝
// Svislý posuvník u bokorysu (uživatel 22. 10. 2026: „jako
// posuvník u nárysu, aby se dalo pootočit") nastavuje, který úhel C je
// v nárysu nahoře (faceLayer.faceViewC). Nárys pak ukáže díry čel i díry
// v plášti tak, jak při tomto natočení dílu leží (faceFrontView.js,
// shellHoleView.js); v bokorysu je natočení vidět jako průměr s trojúhelníkem
// (shellHoleView.drawViewCut). Tažením nahoru úhel roste (proti směru
// hodinových ručiček jako C v bokorysu); přichytí se k úhlům děr v čele
// i v plášti a k násobkům 45°. Pod bokorysem políčko pro přesný úhel
// (i výpočet, ✔ = potvrdit — exprField.js) a ⟲ zpět na výchozí. Prvek leží v liště čela (#faceBar, faceBar.js —
// ta ho umísťuje po každém vykreslení), skrývá se s ní.
//
// Poloha napevno u bokorysu, posouvá se s ním (okraj plátna ho ořízne):
// dráha VLEVO (mezi nárysem a bokorysem), nevejde-li se tam při oddálení
// a vpravo je volno, přeskočí VPRAVO — nesmí ležet přes nárys. Políčko je
// pod bokorysem, ať vlevo stačí úzká dráha (uživatel 22. 10. 2026:
// přisouvání k okraji plátna ujíždělo, při oddálení zasahoval do nárysu).
import { state, showToast } from '../state.js';
import { worldToScreen } from '../canvas.js';
import { wireExprField } from './exprField.js';
import { renderAll } from '../render.js';
import { getFaceLayer, faceViewC, setFaceViewC, profileObjects } from './faceLayer.js';
import { faceDiscGeom, profileBounds } from './faceReference.js';
import { snapViewC } from './shellHoleView.js';

const TRACK_W = 22;      // šířka dráhy včetně plochy pro prst [px]
const PAD = 8;           // mezera od kruhu bokorysu [px]
const MARGIN = 4;        // odstup od nárysu [px]

let el = null;
let lastKey = '';

function build() {
  const bar = document.getElementById('faceBar');
  if (!bar) return null;
  el = document.createElement('div');
  el.id = 'faceRot';
  el.innerHTML = `
    <div class="fr-track" title="Natočení dílu: úhel C nahoře v nárysu — táhněte (přichytí se k dírám a po 45°)"><div class="fr-thumb"></div></div>
    <div class="fr-ctl">
      <label title="Úhel C, který je v nárysu nahoře — lze zadat i výpočet (např. 90+60); potvrdit ✔ nebo Enter">C<input data-fr="c" type="text" inputmode="decimal" autocomplete="off">°</label>
      <button data-fr="ok" class="fr-ok" title="Potvrdit úhel (Enter) — výpočet se spočítá">✔</button>
      <button data-fr="reset" title="Zpět na výchozí natočení">⟲</button>
    </div>`;
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
  wireExprField(inp, el.querySelector('[data-fr="ok"]'), { apply, current: () => +faceViewC().toFixed(1) });
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

const overlaps = (a, b) => a.x0 < b.x1 + MARGIN && a.x1 > b.x0 - MARGIN
  && a.y0 < b.y1 + MARGIN && a.y1 > b.y0 - MARGIN;
const hitsAny = (a, obs) => obs.some(b => overlaps(a, b));

/**
 * Rozložení u bokorysu [px plátna]: dráha vlevo / vpravo od kruhu, políčko
 * pod ním (vodorovně na střed; přes nárys a lištu Z nesmí — odsune se).
 * @param c střed bokorysu, R největší kružnice bokorysu (obrys dílu) [px]
 * @param obs překážky { x0, x1, y0, y1 } — nárys, posuvník a řádek lišty Z
 * @param cw, ch rozměry políčka s tlačítky
 * @returns {{ side:'left'|'right', track:{x0,x1,y0,y1}, ctl:{x0,y0} }}
 */
export function rotateLayout(c, R, obs, cw, ch) {
  const H = Math.max(90, 2 * R);
  const y0 = c[1] - H / 2, y1 = c[1] + H / 2;
  const left = { x0: c[0] - R - PAD - TRACK_W, x1: c[0] - R - PAD, y0, y1 };
  const right = { x0: c[0] + R + PAD, x1: c[0] + R + PAD + TRACK_W, y0, y1 };
  const side = hitsAny(left, obs) && !hitsAny(right, obs) ? 'right' : 'left';
  const ty = c[1] + Math.max(R, H / 2) + 6;
  let cx = c[0] - cw / 2;
  // Od překážky na její vzdálenější stranu (nárys je vlevo → doprava).
  for (let i = 0; i < obs.length; i++) {
    const ctl = { x0: cx, x1: cx + cw, y0: ty, y1: ty + ch };
    const b = obs.find(o => overlaps(ctl, o));
    if (!b) break;
    cx = (b.x0 + b.x1) / 2 < c[0] ? b.x1 + MARGIN + 1 : b.x0 - MARGIN - 1 - cw;
  }
  return { side, track: side === 'left' ? left : right, ctl: { x0: cx, y0: ty } };
}

/**
 * Překážky na plátně: nárys (profil s kótami; v režimu „jen bokorys" není)
 * a posuvník s řádkem lišty Z (faceBar.js je umístil před námi).
 */
function obstacles(cur, w2s) {
  const out = [];
  const b = cur.solo ? null : profileBounds(profileObjects(), true);
  if (b) {
    const p = w2s(b.minX, b.minY), q = w2s(b.maxX, b.maxY);
    out.push({ x0: Math.min(p[0], q[0]), x1: Math.max(p[0], q[0]), y0: Math.min(p[1], q[1]), y1: Math.max(p[1], q[1]) });
  }
  const bar = document.getElementById('faceBar');
  const o = bar && bar.getBoundingClientRect();
  ['[data-fb="range"]', '.fb-row'].forEach(s => {
    const r = bar && bar.querySelector(s)?.getBoundingClientRect();
    if (r && r.width) out.push({ x0: r.left - o.left, x1: r.right - o.left, y0: r.top - o.top, y1: r.bottom - o.top });
  });
  return out;
}

/**
 * Umístit posuvník u bokorysu (volá faceBar.js po vykreslení).
 * @param visible lišta čela je vidět
 */
export function placeRotate(visible, w2s = worldToScreen) {
  const disc = faceDiscGeom();
  const cur = getFaceLayer();
  if (!el && visible) build();
  if (!el) return;
  if (!visible || !disc || !cur || !cur.origin) { el.style.display = 'none'; lastKey = ''; return; }
  // Vedle obrysu dílu (největší kružnice), ne vedle pomocného kruhu bokorysu
  // (disc.R/r = i přesah os) — mezi nárysem a bokorysem je pak víc místa.
  const rv = Math.max(0, ...disc.radii.filter(Number.isFinite)) || disc.R;
  const c = w2s(disc.x, disc.y), e = w2s(disc.x + rv, disc.y);
  const R = Math.abs(e[0] - c[0]);
  el.style.display = '';
  sync();
  const ctl = el.querySelector('.fr-ctl');
  const obs = obstacles(cur, w2s);
  // Šířka bez ✔ (ukáže se při psaní) — políčko pod prstem neuskočí.
  const ok = el.querySelector('[data-fr="ok"]');
  const cw = ctl.offsetWidth - (ok.offsetWidth ? ok.offsetWidth + 4 : 0), ch = ctl.offsetHeight;
  const key = [c[0], c[1], R, cw, ch, ...obs.flatMap(b => [b.x0, b.x1, b.y0, b.y1])].map(v => v.toFixed(1)).join();
  if (key === lastKey) return;
  lastKey = key;
  const g = rotateLayout(c, R, obs, cw, ch);
  Object.assign(el.querySelector('.fr-track').style, {
    left: `${g.track.x0}px`, top: `${g.track.y0}px`, height: `${g.track.y1 - g.track.y0}px`,
  });
  Object.assign(ctl.style, { left: `${g.ctl.x0}px`, top: `${g.ctl.y0}px` });
}

export const FACE_ROT_CSS = `
/* Kotva bez rozměru — dráha a políčko se umísťují samy (px plátna). */
#faceRot { position: absolute; left: 0; top: 0; width: 0; height: 0; }
#faceRot .fr-ctl { position: absolute; display: flex; align-items: center; gap: 4px; white-space: nowrap; }
#faceRot .fr-track {
  position: absolute; width: ${TRACK_W}px; cursor: ns-resize; touch-action: none;
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
/* #faceRot input[type=text]: jinak vyhraje šířka 64 px políčka Z (#faceBar input[type=text]). */
#faceRot input[type=text] { width: 38px; background: var(--ctp-surface0); color: var(--ctp-text); border: 1px solid var(--ctp-surface1); border-radius: 4px; padding: 1px 3px; font-size: 11px; }
#faceRot button { background: var(--ctp-surface0); color: var(--ctp-text); border: 1px solid var(--ctp-surface1); border-radius: 5px; padding: 1px 6px; cursor: pointer; font-size: 12px; }
#faceRot button.fr-ok { color: var(--ctp-green); border-color: var(--ctp-green); font-weight: 700; }`;
