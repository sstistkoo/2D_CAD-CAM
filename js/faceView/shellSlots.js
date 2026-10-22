// ╔══════════════════════════════════════════════════════════════╗
// ║  SKICA – Drážky pro pero v plášti: data a geometrie            ║
// ╚══════════════════════════════════════════════════════════════╝
// Drážka pro pero se kreslí v NÁRYSU jako díra do pláště (shellHoles.js),
// uživatel 22. 10. 2026: nástroj Drážka, klepnutí na díl → okno Drážka pro
// pero (calculators/shellSlot.js). Ve výkresu je to úsečka podél osy vřetena
// na plášti od jednoho konce drážky ke druhému (vnější délka vč. zaoblení)
// ve vrstvě Díry v plášti, s daty `shellSlot`:
//   { w, depth: { mode: 'depth'|'dia', value }, count, angle, ref? }
//   w = šířka drážky = Ø frézy, hloubka od pláště / do Ø, count drážek po
//   obvodu od úhlu C `angle` (jako díry v plášti).
// Plášť se bere z AKTUÁLNÍHO profilu a musí být po celé délce drážky stejný
// (drážka přes osazení se odmítne). Do CAM jako frézování „Drážka pro pero"
// (cam/live: millType 'keyway', side 'radial'). Modul je bez UI.
import { state } from '../state.js';
import { profileObjects } from './faceLayer.js';
import { materialAt, shoulderZs } from './faceReference.js';
import { toWorldZR, shellAngles } from './shellHoles.js';

const r3 = v => +(+v).toFixed(3);
const fmt = v => String(r3(v));
const norm360 = a => ((a % 360) + 360) % 360;
const isCar = () => state.machineType === 'karusel';

/** Je objekt drážka pro pero v plášti? */
export function isShellSlot(o) {
  return !!o && !!o.shellSlot && o.type === 'line';
}

/** Drážky v plášti ve výkresu (podle dat, i bez vrstvy — jako díry v plášti). */
export function shellSlots() {
  return state.objects.filter(isShellSlot);
}

/** Konce drážky v ose vřetena { z1, z2 } (z1 > z2) z objektu. */
export function shellSlotSpan(o) {
  const a = isCar() ? o.y1 : o.x1, b = isCar() ? o.y2 : o.x2;
  return { z1: r3(Math.max(a, b)), z2: r3(Math.min(a, b)) };
}

/** Popisek hloubky drážky: „hl. 4" / „do Ø32". */
export function slotDepthLabel(dep) {
  if (!dep) return '';
  return dep.mode === 'dia' ? `do Ø${fmt(dep.value)}` : `hl. ${fmt(dep.value)}`;
}

/**
 * Plášť a hloubka drážky z1…z2 z profilu — plášť musí být po celé délce
 * stejný (vzorky po délce i těsně u zlomů profilu).
 * @returns {{ R, xTop, depth }} nebo { error }
 */
export function resolveShellSlot(spec, z1, z2, objects = profileObjects(), machineType = state.machineType) {
  const lo = Math.min(z1, z2), hi = Math.max(z1, z2);
  const w = +spec.w;
  if (!(w > 0)) return { error: 'zadejte šířku drážky' };
  if (hi - lo < w - 1e-9) return { error: `drážka (${fmt(hi - lo)} mm) je kratší než její šířka ${fmt(w)} — fréza Ø${fmt(w)} ji neudělá` };
  const zs = new Set([lo + 1e-3, hi - 1e-3]);
  for (let k = 1; k < 10; k++) zs.add(lo + (hi - lo) * k / 10);
  shoulderZs(objects, machineType).zs.forEach(b => { if (b > lo && b < hi) { zs.add(b - 1e-3); zs.add(b + 1e-3); } });
  let R = null;
  for (const z of zs) {
    const iv = materialAt(objects, machineType, z);
    if (!iv.length) return { error: `drážka přesahuje díl – v Z${fmt(z)} není materiál` };
    const r = iv[iv.length - 1][1];
    if (R === null) R = r;
    else if (Math.abs(r - R) > 1e-6) return { error: `drážka vede přes osazení / kužel (Ø${fmt(2 * Math.min(r, R))} až Ø${fmt(2 * Math.max(r, R))}) — plášť musí být po celé délce stejný` };
  }
  const dep = spec.depth || {};
  const depth = dep.mode === 'dia' ? R - dep.value / 2 : +dep.value;
  if (!(depth > 0)) return { R, xTop: r3(2 * R), error: `hloubka vychází ${fmt(depth || 0)} mm` };
  if (depth > R + 1e-6) return { R, xTop: r3(2 * R), error: `hloubka ${fmt(depth)} mm vede přes osu` };
  return { R, xTop: r3(2 * R), depth: r3(depth) };
}

/** Název: „Drážka pro pero 8×40 hl. 4 · 2× od C90°". */
export function shellSlotName(spec, len) {
  const n = Math.max(1, Math.round(spec.count) || 1);
  return `Drážka pro pero ${fmt(spec.w)}×${fmt(len)} ${slotDepthLabel(spec.depth)} · ${n > 1 ? `${n}× od ` : ''}C${fmt(spec.angle || 0)}°`;
}

/** Objekt drážky do výkresu: úsečka na plášti z1…z2 (vrstva layerId). */
export function shellSlotObject(spec, z1, z2, layerId) {
  const res = resolveShellSlot(spec, z1, z2);
  const R = res.R ?? 10;
  const a = toWorldZR(z1, R), b = toWorldZR(z2, R);
  return {
    type: 'line', layer: layerId, x1: a.x, y1: a.y, x2: b.x, y2: b.y,
    lineStyle: 'dashDot', dashed: true, skipIntersections: true,
    name: shellSlotName(spec, Math.abs(z1 - z2)),
    shellSlot: {
      w: r3(spec.w), depth: { mode: spec.depth.mode === 'dia' ? 'dia' : 'depth', value: spec.depth.value ?? null },
      count: Math.max(1, Math.round(spec.count) || 1), angle: r3(norm360(+spec.angle || 0)),
      ...(spec.ref ? { ref: String(spec.ref) } : {}),
    },
  };
}

/** Drážky pro 📥 Z CAD: [{ w, z1, z2, xTop, depth, tag, angles }] + chyby. */
export function shellSlotsForCam(objects = profileObjects(), machineType = state.machineType, list = shellSlots()) {
  const slots = [], errors = [];
  list.forEach(o => {
    const spec = o.shellSlot, { z1, z2 } = shellSlotSpan(o);
    const res = resolveShellSlot(spec, z1, z2, objects, machineType);
    if (res.error) { errors.push(`${o.name || 'Drážka pro pero'}: ${res.error}`); return; }
    slots.push({ w: r3(spec.w), z1, z2, xTop: res.xTop, depth: res.depth, tag: slotDepthLabel(spec.depth), angles: shellAngles(spec) });
  });
  return { slots, errors };
}
