// ╔══════════════════════════════════════════════════════════════╗
// ║  CAM – mezní čáry ZAVALENÍ DESTIČKY (zadní hrana × polotovar) ║
// ╚══════════════════════════════════════════════════════════════╝
//
// Hlídání geometrie destičky mělo dosud jediný zdroj: KONTURU
// (`interferenceGuides.js`). Čára se kotvila tam, kam hrot ještě dosáhne,
// a říkala „pod tuhle přímku už destička tvarem nesmí".
//
// Při ČELNÍM hrubování ale nastane mez dřív a jinde. Destička jede shora
// (−X) a zabírat má PŘEDNÍ hranou; jak ale klesá, opře se ZADNÍ (druhou)
// hranou o dosud neobrobený polotovar. Od té chvíle nezabírá hrot, ale
// CELÝ PLÁTEK — a to není řez, to je zajetí do materiálu. Průchod se tam
// musí zastavit a odjet pro další dráhu.
//
// Mezní poloha je tedy ta, kde ZADNÍ ROH destičky sedí přesně na hranici
// materiálu. Hranicí je pro plánování drah OFFSETOVÁ ČÁRA polotovaru
// (vůlí posunutá silueta, `offsetStockLoop`) — ne syrový obrys: odlitek
// může být až po ni, takže se plánuje pesimisticky (viz
// [[project_cam-stock-is-offset-line]] a docs/geometry-libs-migration.md).
//
// Konstrukce (potvrzeno proti čarám, které uživatel dokreslil do výkresu —
// odchylka 0,26 a 0,51 mm):
//   1. hrot destičky C klouže po KONTUŘE,
//   2. zadní roh B = C + délka_zadní_hrany · (sin φ, cos φ), φ = natočení,
//   3. hledá se C, kde B PROTNE offsetovou čáru polotovaru.
//   Mezní čára = úsečka C→B, tj. přesně zadní hrana destičky v mezní poloze.
// Jedno takové místo vzniká na každém „rameni" siluety, kde se polotovar
// odklání od směru hrany.
//
// ── CO TATO ČÁRA NEDĚLÁ ────────────────────────────────────────
// NEPŘEMOSŤUJE konturu. Mostem (buildMachinableContour) se nahrazují úseky,
// kam destička NEDOSÁHNE TVAREM — tady je kontura dosažitelná, jen se k ní
// nesmí jet napřímo shora. Proto se tyhle čáry přidávají do
// `interferenceGuides` AŽ ZA stavbou obrobitelné kontury a nesou
// `kind: 'polotovar'`; konzumenti tvarové nedosažitelnosti filtrují
// na `kind === 'zanoreni'`.
//
// Souřadnice: CAM svět {x = poloměr, z = axiálně} v mm.


import { buildStockLoop, offsetStockLoop, insertWorldLoop } from './materialRemoval.js';
import { camRayIntersection } from './interferenceGuides.js';

/** Leží bod uvnitř uzavřené smyčky? (parita přes vodorovné řezy v X) */
function insideLoop(loop, x, z) {
  let parity = 0;
  for (let i = 0; i < loop.length; i++) {
    const p = loop[i], q = loop[(i + 1) % loop.length];
    if ((p.x <= x) === (q.x <= x)) continue;
    const zc = p.z + ((x - p.x) / (q.x - p.x)) * (q.z - p.z);
    if (zc > z) parity ^= 1;
  }
  return parity === 1;
}

/** Kontura z worldPoints navzorkovaná po ~`step` mm (G0 skoky se přeskočí). */
function sampleContour(worldPoints, step) {
  const pts = [];
  const push = (x, z) => {
    const l = pts[pts.length - 1];
    if (!l || Math.hypot(l.x - x, l.z - z) > 1e-6) pts.push({ x, z });
  };
  for (let i = 1; i < worldPoints.length; i++) {
    const p1 = worldPoints[i - 1], p2 = worldPoints[i];
    if (p2.type === 'G1') {
      const n = Math.max(1, Math.ceil(Math.hypot(p2.xReal - p1.xReal, p2.zReal - p1.zReal) / step));
      for (let k = 0; k <= n; k++)
        push(p1.xReal + (p2.xReal - p1.xReal) * (k / n), p1.zReal + (p2.zReal - p1.zReal) * (k / n));
    } else if (p2.type === 'G2' || p2.type === 'G3') {
      const arc = getArcParams({ x: p1.xReal, z: p1.zReal }, { x: p2.xReal, z: p2.zReal }, p2.rVal, p2.type);
      if (arc.error) continue;
      let sA = Math.atan2(p1.xReal - arc.cx, p1.zReal - arc.cz);
      let eA = Math.atan2(p2.xReal - arc.cx, p2.zReal - arc.cz);
      if (p2.type === 'G2' && eA > sA) eA -= 2 * Math.PI;
      if (p2.type === 'G3' && eA < sA) eA += 2 * Math.PI;
      const n = Math.max(2, Math.ceil(arc.r * Math.abs(eA - sA) / step));
      for (let k = 0; k <= n; k++) {
        const a = sA + (eA - sA) * (k / n);
        push(arc.cx + Math.sin(a) * arc.r, arc.cz + Math.cos(a) * arc.r);
      }
    }
    // G0 = mezera v kontuře → jen přeruší vzorkování (nic se nepřidá)
  }
  return pts;
}

/**
 * Mezní čáry zavalení destičky pro ČELNÍ hrubování.
 *
 * @param {object} prms              CAM parametry (toolAngle, toolShape, vůle…)
 * @param {Array}  stockPathSegments segmenty obrysu polotovaru
 * @param {Array}  worldPoints       body kontury
 * @returns {Array<{x1,z1,x2,z2,kind}>} x1/z1 = hrot na kontuře, x2/z2 = zadní
 *          roh na offsetové čáře polotovaru. Prázdné pole, když mez nedává
 *          smysl (kulatá destička, chybí polotovar, jiná strategie).
 */
export function computeStockEntryGuides(prms, stockPathSegments, worldPoints) {
  const out = [];
  // Kulatá destička nemá rovnou zadní hranu, která by se mohla opřít;
  // upichovák má vlastní (širokou) geometrii a hlídá si ji sám.
  if (prms.toolShape !== 'polygon') return out;
  // Zatím jen čelní hrubování — „jede shora a zabere celým plátkem" je jeho
  // vlastnost. U podélného je zavalení jiná úloha (jiná hrana, jiný směr
  // posuvu) a čáry odsud by tam nic neomezovaly.
  if ((prms.roughingStrategy || 'longitudinal') !== 'face') return out;
  if (!worldPoints || worldPoints.length < 2) return out;

  const loop = offsetStockLoop(buildStockLoop(prms, stockPathSegments), prms);
  if (!loop || loop.length < 3) return out;
  const insLoop = insertWorldLoop(prms, false);
  if (!insLoop || insLoop.length < 3) return out;

  // Zadní roh destičky vůči špičce: o `dX` NÍŽ a o `dZ` k obrobené straně.
  // U natočení −15° a dosahu 9,2 mm je to 2,38 mm pod hrotem — hrot tedy
  // NENÍ nejnižší bod nástroje.
  const b = (parseFloat(prms.toolAngle) || 0) * Math.PI / 180;
  const sb = Math.sin(b), cb = Math.cos(b);
  const reach = Math.max(...insLoop.map(p => p.x * sb + p.z * cb));
  if (!(reach > 0.5)) return out;
  const dX = -reach * sb, dZ = reach * cb;
  if (!(dZ > 0.5) || !(dX > 0.01)) return out;
  const tanPhi = dX / dZ;
  const dir = (prms.roughingSide === 'left') ? -1 : 1;   // k obrobené straně

  // Výška offsetové čáry polotovaru v daném Z (nejvyšší průsečík svislice).
  const n = loop.length;
  const offXAt = (z) => {
    let mx = -Infinity;
    for (let i = 0; i < n; i++) {
      const a = loop[i], q = loop[(i + 1) % n];
      if ((a.z <= z) === (q.z <= z)) continue;
      const x = a.x + ((z - a.z) / (q.z - a.z)) * (q.x - a.x);
      if (x > mx) mx = x;
    }
    return mx === -Infinity ? null : mx;
  };

  // Mez hloubky hrotu na daném Z: zadní hrana nesmí pod offsetovou čáru, tedy
  //   mez(z) = max_{Δz∈(0,dZ]} [ offset(z + dir·Δz) + Δz·tanφ ].
  // Bod, na kterém se maximum realizuje, je místo DOTYKU. Když leží UVNITŘ
  // dosahu (ne až na konci hrany), je to RAMENO siluety — a právě tam má
  // smysl mezní čáru nakreslit: pod ni se destička na tomhle rameni nedostane.
  const bindingAt = (z) => {
    let best = -Infinity, w = null;
    for (let d = 0.1; d <= dZ + 1e-9; d += 0.1) {
      const ox = offXAt(z + dir * d);
      if (ox === null) continue;
      const v = ox + d * tanPhi;
      if (v > best) { best = v; w = z + dir * d; }
    }
    return w === null ? null : { lim: best, w, interior: Math.abs(w - z) < dZ - 0.15 };
  };

  // Průsečík paprsku (od dotykového bodu podél hrany dolů) s KONTUROU —
  // obrys polotovaru není obráběná plocha, tam by čára skončila hned vedle.
  const calcLoc = { worldPoints, stockWorldPoints: [] };
  const ux = -sb, uz = -cb;
  let zLo = Infinity, zHi = -Infinity;
  for (const p of loop) { if (p.z < zLo) zLo = p.z; if (p.z > zHi) zHi = p.z; }
  const seen = [], cand = [];
  for (let z = zLo; z <= zHi; z += 0.25) {
    const bind = bindingAt(z);
    if (!bind || !bind.interior) continue;
    const ox = offXAt(bind.w);
    if (ox === null || ox < 0.5) continue;   // osa / záporná X = uzavírací hrana smyčky
    const B = { x: ox, z: bind.w };
    // Táž mez váže celý běh Z — a všechny ty polohy leží na TÉŽE přímce
    // (procházející dotykovým bodem). Stačí tedy jedna čára na rameno.
    if (seen.some(q => Math.hypot(q.x - B.x, q.z - B.z) < 0.25)) continue;
    seen.push(B);
    const hit = camRayIntersection(B.x, B.z, ux, uz, null, calcLoc);
    if (!hit) continue;
    const len = Math.hypot(hit.x - B.x, hit.z - B.z);
    if (len < 0.5) continue;
    cand.push({ x1: hit.x, z1: hit.z, x2: B.x, z2: B.z, kind: 'polotovar', len });
  }
  // ── Jedna čára na místo, ne na každé vzorkované Z ──
  // Mez existuje pro KAŽDÉ Z (je to offsetová čára posunutá o zadní roh),
  // takže vzorkování vydá desítky rovnoběžek přes tentýž útvar. Vykreslit
  // se má ta, kde se destička právě CELÁ zabere: délka úsečky od dotyku
  // na offsetu k hrotu na kontuře ≈ délka zadní hrany. Kratší = destička
  // se ještě vejde, delší = hrot je až za jejím dosahem a mez drží držák.
  const near = (a, b) => Math.hypot(a.x1 - b.x1, a.z1 - b.z1) < 15;
  const groups = [];
  for (const c of cand) {
    const g = groups.find(gg => gg.some(x => near(x, c)));
    if (g) g.push(c); else groups.push([c]);
  }
  for (const g of groups) {
    let best = null;
    for (const c of g) if (!best || Math.abs(c.len - reach) < Math.abs(best.len - reach)) best = c;
    if (best && Math.abs(best.len - reach) < 1.5) {
      delete best.len;
      out.push(best);
    }
  }
  return out;
}
