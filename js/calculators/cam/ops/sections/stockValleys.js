// ╔══════════════════════════════════════════════════════════════╗
// ║  HRANICE ÚSEKU NA ÚDOLÍ POLOTOVARU (pravidlo 1, doplněk)        ║
// ╚══════════════════════════════════════════════════════════════╝
//
// Uživatel 4. 11. 2026 (karusel po X, odlitek s údolím S8–S7 nad konturou):
// „zprava doleva by první úsek měl být z S7 X557 a pak ta druhá část".
// Čára zanoření od hrbu tam vede celou cestou v materiálu (dno údolí
// polotovaru leží nad ní), takže hranici nedá — a vrstvy pak nad dnem
// údolí přejíždějí rychloposuvem z jednoho bloku polotovaru do druhého.
//
// Údolí polotovaru = vrch polotovaru (offsetová čára) klesne a zase stoupne
// víc než o ap (polotovar se nad dnem rozpadne na dva bloky). Hranice leží
// na KONCI DNA na straně začátku obrábění (vyšší z — svět jako v
// sectionPlan.js), tj. u paty stěny, ze které se do údolí sjíždí. Údolí,
// ve kterém už hranice od čáry zanoření je (odlitek kopíruje díl), se
// nechá, jak je.

/**
 * @param top      z → vrch polotovaru (offsetová čára) nebo null
 * @param zLo,zHi  rozsah dílu
 * @param minDepth nejmenší hloubka údolí [mm] (ap)
 * @param existing z hranic od čar zanoření
 * @returns hranice `{ z, x, line, stockValley: true }`
 */
export function stockValleyEdges(top, zLo, zHi, minDepth, existing = [], DZ = 0.5) {
  const zs = [], ts = [];
  for (let z = zHi; z >= zLo - 1e-9; z -= DZ) {
    const t = top(z);
    zs.push(z); ts.push(t === null || !Number.isFinite(t) ? NaN : t);
  }
  const n = zs.length;
  // Hladina „vody" v každém místě = nižší z nejvyšších vrchů po obou
  // stranách (v souvislém kusu polotovaru); údolí = kde stojí hlouběji.
  const pre = new Array(n), suf = new Array(n);
  for (let i = 0; i < n; i++) pre[i] = Number.isNaN(ts[i]) ? NaN : Math.max(ts[i], i > 0 && !Number.isNaN(pre[i - 1]) ? pre[i - 1] : -Infinity);
  for (let i = n - 1; i >= 0; i--) suf[i] = Number.isNaN(ts[i]) ? NaN : Math.max(ts[i], i < n - 1 && !Number.isNaN(suf[i + 1]) ? suf[i + 1] : -Infinity);
  const deep = (i) => !Number.isNaN(ts[i]) && Math.min(pre[i], suf[i]) - ts[i] > minDepth;

  const out = [];
  for (let i = 0; i < n; i++) {
    if (!deep(i)) continue;
    let j = i;
    while (j + 1 < n && deep(j + 1)) j++;
    const zA = zs[i], zB = zs[j];   // zA > zB
    if (!existing.some((z) => z <= zA + DZ && z >= zB - DZ)) {
      let floor = Infinity;
      for (let k = i; k <= j; k++) floor = Math.min(floor, ts[k]);
      // Konec dna na straně začátku obrábění (nejvyšší z na dně), upřesněný půlením.
      let k = i;
      while (k <= j && ts[k] > floor + 0.5) k++;
      let a = k > 0 ? zs[k - 1] : zs[k], b = zs[k];
      for (let q = 0; q < 30; q++) {
        const m = (a + b) / 2, t = top(m);
        if (t !== null && t <= floor + 0.05) b = m; else a = m;
      }
      const x = top(b) ?? floor;
      out.push({ z: b, x, line: { x1: x, z1: b, x2: x, z2: b }, stockValley: true });
    }
    i = j;
  }
  return out;
}
