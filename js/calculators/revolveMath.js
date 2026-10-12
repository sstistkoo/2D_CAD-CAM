// ╔══════════════════════════════════════════════════════════════╗
// ║  SKICA – Rotační objem a těžiště z profilu (čistý výpočet)   ║
// ╚══════════════════════════════════════════════════════════════╝
//
// Profil v rovině (z, r): z = osa rotace, r = vzdálenost od osy. Oblast mezi
// profilem a osou se otočí kolem osy:
//   V   = π·|∮ r² dz|          (Pappus / Greenova věta)
//   z̄  = ∮ z·r² dz / ∮ r² dz  (těžiště tělesa na ose)
// Uzavření otevřeného profilu kolmicemi k ose a osou nic nepřidá (dz = 0, r = 0),
// proto stačí součet přes segmenty profilu samotného. r² je sudé, takže nezáleží
// na tom, na které straně osy je profil nakreslen – jen nesmí osu přecházet.

const TAU = 2 * Math.PI;

/**
 * Segmenty z plátna (line {p1,p2}, arc {p1,p2,cx,cy,r,ccw}) → rovina (z, r).
 * Soustruh: z = x, r = y. Karusel má osy prohozené: z = y, r = x (a tím se
 * obrací smysl oblouků).
 */
export function toZR(segs, swapAxes) {
  const m = (p) => (swapAxes ? { z: p.y, r: p.x } : { z: p.x, r: p.y });
  return segs.map(s => {
    const a = m(s.p1), b = m(s.p2);
    if (s.type !== 'arc') return { type: 'line', z1: a.z, r1: a.r, z2: b.z, r2: b.r };
    const c = m({ x: s.cx, y: s.cy });
    return {
      type: 'arc', z1: a.z, r1: a.r, z2: b.z, r2: b.r,
      zc: c.z, rc: c.r, R: s.r, ccw: swapAxes ? !s.ccw : !!s.ccw,
    };
  });
}

/** Počáteční úhel a (znaménkový) rozsah oblouku v rovině (z, r); ccw = kladný. */
function arcSweep(s) {
  const t1 = Math.atan2(s.r1 - s.rc, s.z1 - s.zc);
  const t2 = Math.atan2(s.r2 - s.rc, s.z2 - s.zc);
  const mod = (x) => ((x % TAU) + TAU) % TAU;
  if (Math.hypot(s.z2 - s.z1, s.r2 - s.r1) < 1e-9) return { t1, sweep: s.ccw ? TAU : -TAU };   // celý kruh
  return { t1, sweep: s.ccw ? mod(t2 - t1) : -mod(t1 - t2) };
}

/** ∫ r² dz po segmentu. */
function intR2dz(s) {
  if (s.type === 'line') return (s.z2 - s.z1) * (s.r1 * s.r1 + s.r1 * s.r2 + s.r2 * s.r2) / 3;
  const { t1, sweep } = arcSweep(s);
  const { rc, R } = s;
  const F = (t) => -rc * rc * Math.cos(t) + 2 * rc * R * (t / 2 - Math.sin(2 * t) / 4) + R * R * (-Math.cos(t) + Math.cos(t) ** 3 / 3);
  return -R * (F(t1 + sweep) - F(t1));
}

/** ∫ z·r² dz po segmentu (oblouk numericky – Simpson, hladká funkce). */
function intZR2dz(s) {
  if (s.type === 'line') {
    const dz = s.z2 - s.z1, dr = s.r2 - s.r1, z1 = s.z1, r1 = s.r1;
    return dz * (z1 * r1 * r1 + (2 * z1 * r1 * dr + dz * r1 * r1) / 2 + (z1 * dr * dr + 2 * dz * r1 * dr) / 3 + dz * dr * dr / 4);
  }
  const { t1, sweep } = arcSweep(s);
  const n = 400, h = sweep / n;
  const f = (t) => {
    const z = s.zc + s.R * Math.cos(t), r = s.rc + s.R * Math.sin(t);
    return z * r * r * (-s.R * Math.sin(t));
  };
  let sum = f(t1) + f(t1 + sweep);
  for (let i = 1; i < n; i++) sum += f(t1 + h * i) * (i % 2 ? 4 : 2);
  return sum * h / 3;
}

/** Rozsah profilu v z a r (včetně vrcholů oblouků). */
function bounds(segs) {
  const b = { zMin: Infinity, zMax: -Infinity, rMin: Infinity, rMax: -Infinity };
  const add = (z, r) => {
    b.zMin = Math.min(b.zMin, z); b.zMax = Math.max(b.zMax, z);
    b.rMin = Math.min(b.rMin, r); b.rMax = Math.max(b.rMax, r);
  };
  for (const s of segs) {
    add(s.z1, s.r1); add(s.z2, s.r2);
    if (s.type !== 'arc') continue;
    const { t1, sweep } = arcSweep(s);
    for (let k = 0; k < 4; k++) {                               // 0°, 90°, 180°, 270°
      const t = k * Math.PI / 2;
      const d = sweep >= 0 ? (((t - t1) % TAU) + TAU) % TAU : (((t1 - t) % TAU) + TAU) % TAU;
      if (d <= Math.abs(sweep) + 1e-12) add(s.zc + s.R * Math.cos(t), s.rc + s.R * Math.sin(t));
    }
  }
  return b;
}

/**
 * Objem [mm³] a těžiště na ose z profilu (řetěz segmentů v (z, r) navazujících
 * po sobě ve směru řetězu).
 * @returns {{volume:number, zCentroid:number|null, zMin:number, zMax:number,
 *   rMin:number, rMax:number, crossesAxis:boolean}|null}  null = prázdný profil
 */
export function revolveProps(segs) {
  if (!segs.length) return null;
  let I = 0, M = 0;
  for (const s of segs) { I += intR2dz(s); M += intZR2dz(s); }
  const b = bounds(segs);
  const tol = 1e-6 * Math.max(1, Math.abs(b.rMax), Math.abs(b.rMin));
  return {
    volume: Math.PI * Math.abs(I),
    zCentroid: Math.abs(I) > 1e-12 ? M / I : null,
    ...b,
    crossesAxis: b.rMin < -tol && b.rMax > tol,
  };
}

/** Body profilu pro náčrt (oblouky vzorkované). @returns {number[][]} [[z, r], …] */
export function profilePoints(segs, perArc = 24) {
  const pts = [];
  for (const s of segs) {
    if (s.type === 'line') { pts.push([s.z1, s.r1], [s.z2, s.r2]); continue; }
    const { t1, sweep } = arcSweep(s);
    for (let i = 0; i <= perArc; i++) { const t = t1 + sweep * i / perArc; pts.push([s.zc + s.R * Math.cos(t), s.rc + s.R * Math.sin(t)]); }
  }
  return pts;
}

/** Objem válce Ø D × délka L [mm³]. */
export const cylinderVolume = (D, L) => Math.PI * (D / 2) ** 2 * L;
