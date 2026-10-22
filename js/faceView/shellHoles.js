// ╔══════════════════════════════════════════════════════════════╗
// ║  SKICA – Díry v plášti (radiální vrtání): data a geometrie    ║
// ╚══════════════════════════════════════════════════════════════╝
// Radiální díra se kreslí v NÁRYSU (uživatel 22. 10. 2026): nástroj Díra,
// klepnutí mimo bokorys na obrys v místě díry → okno Díra do pláště
// (calculators/shellHole.js). Ve výkresu je to OSA díry (úsečka napříč osou
// vřetena, čerchovaně) ve vrstvě „Díry v plášti" (`isShell`, není profil —
// faceLayer.profileObjects) s daty `shellHole`:
//   { d, depth: { mode, value }, count, angle, ref? }
//   mode 'depth' = hloubka od pláště, 'dia' = do Ø, 'through' = skrz stěnu
//   do vývrtu (+ přesah, prázdný = 0,3·Ø + 1). count děr po obvodu
//   rovnoměrně od úhlu C `angle` (C 0° = X bokorysu, C 90° = Y — jako díry
//   v čele); `ref` = popis díry v čele, podle které se úhel natočil.
// Z díry = poloha osy podél osy vřetena (soustruh x, karusel y). Ø pláště
// a hloubka se počítají z AKTUÁLNÍHO profilu (vykreslení i 📥 Z CAD) — po
// úpravě kontury díra „sedí" sama. Víc děr podél osy = Lin.pole (kopie nesou
// data díry). Modul je bez UI (čte ho vykreslování i CAM).
import { state } from '../state.js';
import { profileObjects } from './faceLayer.js';
import { materialAt } from './faceReference.js';
import { throughOverrun } from './faceDepth.js';

const r3 = v => +(+v).toFixed(3);
const fmt = v => String(r3(v));
const norm360 = a => ((a % 360) + 360) % 360;
export const AXIS_EXT = 3;   // [mm] přesah osy díry za plášť a za dno

const isCar = () => state.machineType === 'karusel';

/** Je objekt díra v plášti? */
export function isShellHole(o) {
  return !!o && !!o.shellHole && o.type === 'line';
}

/**
 * Díry v plášti ve výkresu (podle dat `shellHole`, i bez vrstvy — po ↩
 * smazání vrstvy; tu založí znovu další díra, shellHoleDraw.ensureShellLayer).
 */
export function shellHoles() {
  return state.objects.filter(isShellHole);
}

/** Z díry (poloha osy podél osy vřetena) z objektu osy. */
export function shellHoleZ(o) {
  return r3(isCar() ? (o.y1 + o.y2) / 2 : (o.x1 + o.x2) / 2);
}

/** Bod nárysu (z, r) → svět; obráceně svět → { z, r }. */
export function toWorldZR(z, r) { return isCar() ? { x: r, y: z } : { x: z, y: r }; }
export function zrOfWorld(wx, wy) { return isCar() ? { z: wy, r: Math.abs(wx) } : { z: wx, r: Math.abs(wy) }; }

/** Úhly C děr po obvodu (rovnoměrně od `angle`). */
export function shellAngles(spec) {
  const n = Math.max(1, Math.round(spec.count) || 1);
  return Array.from({ length: n }, (_, i) => r3(norm360((+spec.angle || 0) + i * 360 / n)));
}

/** Popisek hloubky do názvu: „hl. 10" / „do Ø40" / „skrz". */
export function shellDepthLabel(dep) {
  if (!dep) return '';
  if (dep.mode === 'through') return 'skrz';
  if (dep.mode === 'dia') return `do Ø${fmt(dep.value)}`;
  return `hl. ${fmt(dep.value)}`;
}

/**
 * Plášť a hloubka díry v rovině z z profilu.
 * @returns {{ R, xTop, depth, inner }} nebo { error }
 *   R = poloměr pláště, inner = poloměr vývrtu pod stěnou (0 = plný materiál)
 */
export function resolveShellHole(spec, z, objects = profileObjects(), machineType = state.machineType) {
  // V rovině osazení je průsečík s profilem dvojznačný (SNAP chytí roh) —
  // plášť se bere těsně vedle; liší-li se po stranách, díra na osazení stojí.
  const outer = zz => { const v = materialAt(objects, machineType, zz); return v.length ? v[v.length - 1] : null; };
  const L = outer(z - 1e-3), Rt = outer(z + 1e-3);
  if (!L && !Rt) return { error: `v Z${fmt(z)} není materiál dílu` };
  if (!L || !Rt || Math.abs(L[1] - Rt[1]) > 1e-6 || Math.abs(L[0] - Rt[0]) > 1e-6) {
    const ds = [L, Rt].filter(Boolean).map(v => `Ø${fmt(2 * v[1])}`).join(' / ');
    return { error: `Z${fmt(z)} leží na osazení (${ds}) — posuňte díru na plášť` };
  }
  const [inner, R] = L;
  const d = +spec.d;
  if (!(d > 0)) return { error: 'zadejte Ø díry' };
  const dep = spec.depth || {};
  let depth;
  if (dep.mode === 'through') {
    if (inner < 1e-6) return { R, xTop: r3(2 * R), inner: 0, error: `skrz stěnu: v Z${fmt(z)} je plný materiál (bez vývrtu) — zadejte hloubku` };
    const over = dep.value != null && dep.value >= 0 ? +dep.value : throughOverrun(d);
    depth = R - inner + over;
  } else if (dep.mode === 'dia') {
    if (!(dep.value >= 0)) return { error: 'zadejte Ø, do kterého se vrtá' };
    depth = R - dep.value / 2;
  } else {
    depth = +dep.value;
  }
  if (!(depth > 0)) return { R, xTop: r3(2 * R), inner, error: `hloubka vychází ${fmt(depth || 0)} mm — díra by nic nevrtala` };
  if (depth > R + 1e-6) return { R, xTop: r3(2 * R), inner, error: `hloubka ${fmt(depth)} mm vede přes osu (poloměr pláště ${fmt(R)}) — radiálně se vrtá nejvýš do osy` };
  return { R, xTop: r3(2 * R), depth: r3(depth), inner };
}

/**
 * Název objektu díry: „Díra v plášti Ø8 hl. 10 · 4× od C0°". Bez Z — kopie
 * z Lin.pole název převezmou a Z by v nich nesedělo.
 */
export function shellHoleName(spec) {
  const n = Math.max(1, Math.round(spec.count) || 1);
  return `Díra v plášti Ø${fmt(spec.d)} ${shellDepthLabel(spec.depth)} · ${n > 1 ? `${n}× od ` : ''}C${fmt(spec.angle || 0)}°`;
}

/**
 * Objekt osy díry pro výkres (svět): napříč osou vřetena v Z, od pláště
 * (+ přesah) ke dnu (+ přesah). Bez profilu v Z jen krátká značka.
 */
export function shellHoleObject(spec, z, layerId) {
  const res = resolveShellHole(spec, z);
  const R = res.R ?? 10;
  const depth = res.depth ?? Math.min(R, 5);
  const a = toWorldZR(z, R + AXIS_EXT), b = toWorldZR(z, Math.max(0, R - depth - AXIS_EXT));
  return {
    type: 'line', layer: layerId, x1: a.x, y1: a.y, x2: b.x, y2: b.y,
    lineStyle: 'dashDot', dashed: true, skipIntersections: true,
    name: shellHoleName(spec),
    shellHole: {
      d: r3(spec.d), depth: { mode: spec.depth.mode, value: spec.depth.value ?? null },
      count: Math.max(1, Math.round(spec.count) || 1), angle: r3(norm360(+spec.angle || 0)),
      ...(spec.ref ? { ref: String(spec.ref) } : {}),
    },
  };
}

/**
 * Díry v plášti pro 📥 Z CAD: [{ kind: 'shell', holes, errors }]
 *   holes: [{ d, z, xTop, depth, tag, angles }] — z aktuálního profilu,
 *   errors: díry, jejichž plášť / hloubku nejde určit (do CAM nejdou).
 * Bez děr prázdné pole.
 */
export function shellHolesForCam(objects = profileObjects(), machineType = state.machineType, list = shellHoles()) {
  if (!list.length) return [];
  const holes = [], errors = [];
  list.forEach(o => {
    const spec = o.shellHole, z = shellHoleZ(o);
    const res = resolveShellHole(spec, z, objects, machineType);
    if (res.error) { errors.push(`${o.name || 'Díra v plášti'}: ${res.error}`); return; }
    holes.push({ d: r3(spec.d), z, xTop: res.xTop, depth: res.depth, tag: shellDepthLabel(spec.depth), angles: shellAngles(spec) });
  });
  return [{ kind: 'shell', holes, errors }];
}

const TOL_PX = 15;   // klepnutí kousek nad obrys se ještě počítá na plášť

/** Klepnutí v nárysu na díl (do materiálu nebo těsně nad plášť)? → Z, jinak null. */
export function shellZAt(wx, wy) {
  const { z, r } = zrOfWorld(wx, wy);
  const iv = materialAt(profileObjects(), state.machineType, z);
  if (!iv.length) return null;
  const R = iv[iv.length - 1][1];
  return r <= R + TOL_PX / (state.zoom || 1) ? r3(z) : null;
}
