// ╔══════════════════════════════════════════════════════════════╗
// ║  SKUTEČNÝ POLOTOVAR (pravidlo 9) pro hloubkový cyklus          ║
// ╚══════════════════════════════════════════════════════════════╝
// Hloubková smyčka `genLongPasses` hledá intervaly na PLÁNOVACÍ siluetě
// (polotovar + vůle, tečkovaná čára). Pravidlo 9 (docs/cam-pravidla.md) ale
// říká, že plánovací obrys určuje jen, kde končí rychloposuv — jestli kus
// vrstvy něco ubere, rozhoduje SKUTEČNÝ (nakreslený) polotovar. Kulatá to
// měří v ops/long/rule7Layers.js (`rawTab`, `realInside`); tohle je totéž
// měřítko pro starý cyklus (klíč plátku `realStockLayers`).
//
// Nález 7. 10. 2026 (hřídel r 5 × 60 s osazením r 10 = r polotovaru, polygon
// rε 0,4, Vůle 1): pásmo vůle před čelem (Z 0…1) je širší než odsazení čela
// (Přídavek Z + rε = 0,5), takže hloubky POD nejmenším průměrem v něm našly
// „materiál" — vrstvy X 3,5 / 2,0 / 0,5 / 0 jely celé ve vzduchu. A dojezd
// první vrstvy jel posuvem po vršku osazení (r 10 = polotovar) až za konec
// polotovaru `G1 Z-62.712`.
//
// STOPA = PŘESNÝ OBRYS DESTIČKY (`toolFootprintVisual`), týž jako v modelu
// úběru (simulace, scripts/cam_rules_check.mjs). Samotná kružnice nosu
// nestačí: na part-11 (zleva, natočení 15°) vezme hlavní ostří před nosem
// klín 0,26 mm², na který kružnice nedosáhne — průchod s ní vyšel „prázdný"
// a zahozením zůstal klín stát.
//
// Měří se SLOUPCOVĚ (krok `H`) jako v alreadyCut.js: v každém sloupci Z
// nejnižší bod stopy a nad ním skutečný polotovar. Pod osou materiál není
// (destička smí osu přejet).

import { topXOnLoop } from '../../camMath.js';

const H = 0.1;      // krok sloupců [mm]
const HF = H / 4;   // krok tabulky spodní obálky stopy [mm]

// Spodní obálka obrysu stopy: pro posun `dz` od programovaného bodu nejnižší
// x obrysu (relativně), mimo obrys null.
function lowerEnvelope(foot) {
  let zMin = Infinity, zMax = -Infinity;
  for (const p of foot) { if (p.z < zMin) zMin = p.z; if (p.z > zMax) zMax = p.z; }
  const k0 = Math.floor(zMin / HF), k1 = Math.ceil(zMax / HF);
  const tab = new Array(k1 - k0 + 1).fill(null);
  for (let k = k0; k <= k1; k++) {
    const z = Math.min(Math.max(k * HF, zMin), zMax);
    let low = null;
    for (let i = 0; i < foot.length; i++) {
      const a = foot[i], b = foot[(i + 1) % foot.length];
      if (Math.abs(a.z - b.z) < 1e-12) {
        if (Math.abs(a.z - z) < 1e-9) { const m = Math.min(a.x, b.x); if (low === null || m < low) low = m; }
        continue;
      }
      if ((a.z <= z && b.z >= z) || (b.z <= z && a.z >= z)) {
        const x = a.x + (b.x - a.x) * ((z - a.z) / (b.z - a.z));
        if (low === null || x < low) low = x;
      }
    }
    tab[k - k0] = low;
  }
  return { zMin, zMax, at: (dz) => (dz < zMin - 1e-9 || dz > zMax + 1e-9 ? null : tab[Math.round(dz / HF) - k0] ?? null) };
}

/**
 * @param rawLoop    uzavřená silueta SKUTEČNÉHO polotovaru (bez vůle)
 * @param footprint  obrys stopy nástroje relativně k programovanému bodu
 * @returns null bez siluety/stopy; jinak { cutArea(segs, floorSegs) }
 */
export function makeRealStock({ rawLoop, footprint }) {
  if (!Array.isArray(rawLoop) || rawLoop.length < 3) return null;
  if (!Array.isArray(footprint) || footprint.length < 3) return null;
  const env = lowerEnvelope(footprint);
  let zLo = Infinity, zHi = -Infinity;
  for (const p of rawLoop) { if (p.z < zLo) zLo = p.z; if (p.z > zHi) zHi = p.z; }
  const z0 = zLo - H;
  const n = Math.ceil((zHi + H - z0) / H) + 1;
  const top = new Array(n);
  for (let i = 0; i < n; i++) top[i] = topXOnLoop(rawLoop, z0 + i * H);

  // Body dráhy po nejvýš H/2 — oblouk po úhlu, úsečka lineárně.
  const samplePath = (segs) => {
    const pts = [];
    for (const s of segs || []) {
      if (!s) continue;
      if (s.type === 'arc' && [s.startAngle, s.endAngle, s.cx, s.cz, s.r].every(Number.isFinite)) {
        const k = Math.max(1, Math.ceil(Math.abs(s.endAngle - s.startAngle) * s.r / (H / 2)));
        for (let j = 0; j <= k; j++) {
          const a = s.startAngle + (s.endAngle - s.startAngle) * (j / k);
          pts.push({ x: s.cx + Math.sin(a) * s.r, z: s.cz + Math.cos(a) * s.r });
        }
      } else if ([s.x1, s.z1, s.x2, s.z2].every(Number.isFinite)) {
        const k = Math.max(1, Math.ceil(Math.hypot(s.x2 - s.x1, s.z2 - s.z1) / (H / 2)));
        for (let j = 0; j <= k; j++) {
          const t = j / k;
          pts.push({ x: s.x1 + (s.x2 - s.x1) * t, z: s.z1 + (s.z2 - s.z1) * t });
        }
      }
    }
    return pts;
  };
  // Nejnižší bod stopy v každém sloupci polotovaru, kam dráha dosáhne.
  const lowMap = (segs) => {
    const m = new Map();
    for (const p of samplePath(segs)) {
      const iA = Math.max(0, Math.ceil((p.z + env.zMin - z0) / H - 1e-9));
      const iB = Math.min(n - 1, Math.floor((p.z + env.zMax - z0) / H + 1e-9));
      for (let i = iA; i <= iB; i++) {
        const off = env.at(z0 + i * H - p.z);
        if (off === null) continue;
        const low = p.x + off;
        const cur = m.get(i);
        if (cur === undefined || low < cur) m.set(i, low);
      }
    }
    return m;
  };

  // Plocha (mm²) SKUTEČNÉHO polotovaru, kterou dráha `segs` ubere a kterou
  // nevzala už dráha `floorSegs` (vlastní dřívější kus téhož průchodu).
  const cutArea = (segs, floorSegs = null) => {
    const own = lowMap(segs);
    const floor = floorSegs && floorSegs.length ? lowMap(floorSegs) : null;
    let area = 0;
    for (const [i, low] of own) {
      const t = top[i];
      if (t === null || t === undefined) continue;
      let ceil = t;
      if (floor) { const f = floor.get(i); if (f !== undefined && f < ceil) ceil = f; }
      const thick = ceil - Math.max(low, 0);
      if (thick > 0) area += thick * H;
    }
    return area;
  };
  return { cutArea };
}

// Délka dráhy (úsečky i oblouky po tětivě — na prah stačí).
export const pathLen = (segs) => (segs || []).reduce((a, s) =>
  a + (s && [s.x1, s.z1, s.x2, s.z2].every(Number.isFinite) ? Math.hypot(s.x2 - s.x1, s.z2 - s.z1) : 0), 0);

// Celá dráha průchodu v pořadí jízdy: rampa, nájezd, tělo, dojezd.
export function passPath(p, { leadOut = true } = {}) {
  const segs = [];
  if (p.ramp && Number.isFinite(p.ramp.x0) && Number.isFinite(p.ramp.z0))
    segs.push({ type: 'line', x1: p.ramp.x0, z1: p.ramp.z0, x2: p.x, z2: p.zStart });
  for (const sg of p.contourLeadIn || []) segs.push(sg);
  if (Number.isFinite(p.x) && Number.isFinite(p.zStart) && Number.isFinite(p.zEnd))
    segs.push({ type: 'line', x1: p.x, z1: p.zStart, x2: p.x, z2: p.zEnd });
  if (leadOut) for (const sg of p.contourLeadOut || []) segs.push(sg);
  return segs;
}
