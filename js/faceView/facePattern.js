// ╔══════════════════════════════════════════════════════════════╗
// ║  SKICA – Bokorys: díry z Rozmístění děr do kresby čela        ║
// ╚══════════════════════════════════════════════════════════════╝
// Kalkulačka ◎ Rozmístění děr (calculators/boltCircle.js, holePattern.js)
// počítá díry vůči středu čela (X vodorovně = C 0°, Y svisle = C 90° — stejně
// jako je čte 🛠 Operace → 📥 Z CAD). Tlačítko „◎ Do čela" je sem nakreslí:
//   díry           → kružnice plnou čarou (= díra pro CAM),
//   roztečná kruž. → kružnice ČERCHOVANĚ (pomocná, do CAM nejde — isAuxCircle).
// Každá díra nese hloubku `holeDepth` (skrz / hloubka / do Z, faceDepth.js),
// na číslo se převede až při 📥 Z CAD. Vše jedním krokem ↩. Kalkulačky sem
// jdou přes bridge.drawHolesToFace (faceView.js), ať nevzniká cyklický import.
import { state, showToast, withUndoBatch } from '../state.js';
import { addObject } from '../objects.js';
import { calculateAllIntersections } from '../geometry.js';
import { updateObjectList, updateProperties } from '../ui.js';
import { renderAll } from '../render.js';
import { getFaceLayer, getFaceLayers, faceLabel } from './faceLayer.js';
import { holeDepthLabel, resolveFaceHole } from './faceDepth.js';
import { saveSettings } from '../storage/settingsStore.js';
import { faceSlotPolyline, faceSlotForCam, stadiumOf } from './faceSlots.js';

const r3 = v => +(+v).toFixed(3);
const fmt = v => String(r3(v));
const fmtC = v => String(r3(v)).replace('.', ',');

/**
 * Objekty kresby čela pro dané rozmístění (bez zápisu do výkresu).
 * @param face vrstva čela s `origin` (střed bokorysu ve světě)
 * @param spec { holes: [{x, y}] vůči středu čela, d: Ø díry,
 *               pcd?: Ø roztečné kružnice, cx?, cy?: její střed vůči středu čela,
 *               depth?: { mode: 'through'|'depth'|'z', value } hloubka děr }
 * @returns objekty pro addObject (roztečná kružnice první)
 */
export function holePatternObjects(face, { holes, d, pcd = null, cx = 0, cy = 0, depth = null }) {
  const O = face.origin;
  const out = [];
  if (pcd > 0) {
    // Bez průsečíků (jako roztečná kružnice ozubení, gearClick.js) — 2 na
    // každé díře by ji zasypaly popisky souřadnic. SNAP na ni funguje dál.
    out.push({
      type: 'circle', layer: face.id, cx: O.x + cx, cy: O.y + cy, r: pcd / 2,
      lineStyle: 'dashDot', dashed: true, skipIntersections: true, name: `Roztečná kružnice Ø${fmt(pcd)}`,
    });
  }
  // dashed:false — díra je plná čára i při zapnutém „Typ čáry" (addObject
  // jinak převezme aktivní čárkování a z díry by byla pomocná kružnice).
  const tag = holeDepthLabel(depth);
  holes.forEach((h, i) => out.push({
    type: 'circle', layer: face.id, cx: O.x + h.x, cy: O.y + h.y, r: d / 2,
    dashed: false, name: `Díra Ø${fmt(d)}${tag ? ' ' + tag : ''} #${i + 1}`,
    ...(depth ? { holeDepth: { mode: depth.mode, value: depth.value ?? null, ...(depth.stock ? { stock: true } : {}) } } : {}),
  }));
  return out;
}

/**
 * Nakreslí díry (a roztečnou kružnici) do AKTUÁLNÍHO čela. Bokorys musí být
 * zapnutý (zapne ho volající, faceView.js).
 * @returns počet nakreslených děr (0 = nic)
 */
export function drawHolesToFace(spec) {
  const face = getFaceLayer();
  if (!face || !face.origin) { showToast('Nejdřív zapněte ◎ Čelo (bokorys)'); return 0; }
  if (!(spec.d > 0)) { showToast('Zadejte Ø díry — kružnice v čele je díra'); return 0; }
  if (!spec.holes || !spec.holes.length) return 0;
  const objs = holePatternObjects(face, spec);
  const info = depthInfo(face, objs, spec.depth);
  if (info.refuse) { showToast(info.refuse, 6000); return 0; }
  withUndoBatch(() => objs.forEach(o => addObject(o)));
  // Díry pod osou se v nárysu kreslí skrytou čarou (faceFrontView.js) — spodní
  // polovinu nárysu dokreslí ⇋ Zrcadlit kolem osy (uživatel 20. 10. 2026).
  const mirrorOn = state.machineType !== 'karusel' && !state.mirrorPreview;
  if (mirrorOn) { state.mirrorPreview = true; saveSettings(); }
  state.selected = null; state.multiSelected.clear();
  calculateAllIntersections();
  updateObjectList();
  updateProperties();
  renderAll();
  const n = spec.holes.length;
  showToast(`Čelo ${faceLabel(face)}: ${n} ${n === 1 ? 'díra' : n < 5 ? 'díry' : 'děr'} Ø${fmt(spec.d)}`
    + info.text
    + (spec.pcd > 0 ? ` na roztečné kružnici Ø${fmt(spec.pcd)} (čerchovaná = pomocná, do CAM nejde)` : '')
    + (mirrorOn ? '. Nárys zrcadlen pod osu (Nastavení → ⇋ Zrcadlit kolem osy)' : ''), 6000);
  return n;
}

/**
 * Hloubka děr pro hlášku po nakreslení (spočtená z dnešního profilu a čela).
 * „Do Z" na straně nástroje se odmítne (refuse); díra skrz bez materiálu se
 * nakreslí s upozorněním (čelo / profil se ještě může změnit).
 */
function depthInfo(face, objs, depth) {
  if (!depth) return { text: '' };
  const holes = objs.filter(o => o.holeDepth);
  const res = holes.map(o => resolveFaceHole(face, o, depth));
  const bad = res.find(r => r.error);
  if (depth.mode === 'z' && bad) return { refuse: `Díry nenakresleny: ${bad.error}.` };
  if (bad) return { text: ` ${holeDepthLabel(depth)} — POZOR: ${bad.error}` };
  const ds = res.map(r => r.depth);
  const lo = Math.min(...ds), hi = Math.max(...ds);
  const hl = lo === hi ? `hl. ${fmtC(lo)} mm` : `hl. ${fmtC(lo)}–${fmtC(hi)} mm`;
  if (depth.mode === 'through') {
    const t = res[0].thick;
    return { text: ` skrz (materiál ${fmtC(t)} mm + přesah ${fmtC(res[0].depth - t)} → ${hl})` };
  }
  return { text: ` ${holeDepthLabel(depth)} (${hl})` };
}

/**
 * Nakreslí drážku (ovál) do AKTUÁLNÍHO čela, nebo nahradí `replace`
 * (úprava). spec { cx, cy (vůči středu čela), len, w, angle, depth }.
 * @returns true = nakresleno
 */
export function drawFaceSlot(spec, replace = null) {
  const face = replace ? getFaceLayers().find(l => l.id === replace.layer) : getFaceLayer();
  if (!face || !face.origin) { showToast('Nejdřív zapněte ◎ Čelo (bokorys)'); return false; }
  if (!(spec.w > 0) || !(spec.len >= spec.w)) { showToast('Délka drážky musí být aspoň její šířka'); return false; }
  const obj = faceSlotPolyline(face, spec);
  const local = { ...obj, vertices: obj.vertices.map(v => ({ x: v.x - face.origin.x, y: v.y - face.origin.y })) };
  const cam = faceSlotForCam(local, Number.isFinite(face.faceZ) ? face.faceZ : 0, face.faceSide === 'left' ? 'left' : 'right');
  if (spec.depth && spec.depth.mode === 'z' && !(cam && cam.depth > 0)) { showToast('Drážka nenakreslena: Z konce leží na straně nástroje nebo před materiálem.', 6000); return false; }
  withUndoBatch(() => {
    if (replace) { const i = state.objects.indexOf(replace); if (i >= 0) state.objects.splice(i, 1); }
    addObject(obj);
  });
  state.selected = null; state.multiSelected.clear();
  calculateAllIntersections();
  updateObjectList();
  updateProperties();
  renderAll();
  const dep = cam && cam.depth > 0 ? ` hl. ${fmtC(cam.depth)} mm` : (spec.depth ? ` ${holeDepthLabel(spec.depth)} — POZOR: hloubku nejde určit (materiál pod drážkou?)` : '');
  showToast(`Čelo ${faceLabel(face)}: drážka ${fmtC(spec.len)}×${fmtC(spec.w)}${dep}${cam && cam.zTop != null ? ` od Z${fmtC(cam.zTop)}` : ''}${replace ? ' — upraveno' : ''}. V CAM: frézování Drážka (širší než fréza = víc průjezdů)`, 6000);
  return true;
}

/** Drážka (stadion) čela pod bodem (svět), nebo null — klepnutí ji otevře k úpravě. */
export function faceSlotAt(wx, wy, tolPx = 6) {
  const tol = tolPx / (state.zoom || 1);
  let best = null, bd = Infinity;
  getFaceLayers().forEach(l => {
    if (!l.visible) return;
    state.objects.forEach(o => {
      if (o.layer !== l.id) return;
      const s = stadiumOf(o);
      if (!s) return;
      const dx = s.x2 - s.x1, dy = s.y2 - s.y1, L2 = dx * dx + dy * dy;
      const t = L2 ? Math.max(0, Math.min(1, ((wx - s.x1) * dx + (wy - s.y1) * dy) / L2)) : 0;
      const d = Math.hypot(s.x1 + t * dx - wx, s.y1 + t * dy - wy) - s.w / 2;
      if (d <= tol && d < bd) { bd = d; best = o; }
    });
  });
  return best;
}
