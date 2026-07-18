// ╔══════════════════════════════════════════════════════════════╗
// ║  CAM – sdílené čisté geometrické helpery (bez DOM/stavu)       ║
// ╚══════════════════════════════════════════════════════════════╝
// Čisté funkce vytažené z camSimulator.js, aby je mohly sdílet i
// strategie generování drah (cam/roughingStrategies.js a další).
// Startovní množina — modul může postupně absorbovat další pure helpery.

// Efektivní úhel zanoření (ramp-in): auto z tvaru destičky (podélně =
// natočení, čelně = |natočení + vrchol − 90|), nebo ruční entryAngle.
// Pokud je nastaven úhel hřbetu α > 0, omezuje výsledek shora — hřbet destičky
// kontaktuje materiál při zanořování strmějším než α.
export function getEffectivePlungeAngle(prms) {
  // Upichovák smí zanořit kolmo k ose (přímo k Z) → strop 90° místo 89°.
  const parting = prms.toolShape === 'parting';
  const clampA = (v) => Math.max(0.5, Math.min(parting ? 90 : 89, v));
  if (!prms.entryAngleAuto) return clampA(parseFloat(prms.entryAngle) || 30);
  if (parting) return 90;               // auto = svislé zanoření (part-off)
  if (prms.toolShape !== 'polygon') return 45;
  const rot = parseFloat(prms.toolAngle) || 0;
  const tip = parseFloat(prms.toolTipAngle) || 90;
  const clearDeg = parseFloat(prms.toolClearanceAngle) || 0;
  const rawAngle = prms.roughingStrategy === 'face' ? Math.abs(rot + tip - 90) : Math.abs(rot);
  // clearDeg > 0 → pozitivní plátka, hřbet omezuje max. zanoření na α
  const a = clearDeg > 0 ? Math.min(rawAngle, clearDeg) : rawAngle;
  return clampA(a);
}

// Obálka dna upichováku: x(z) = max offsetu pod celou rovnou částí dna
// (span = šířka − 2·rádius), tělo na straně dir (+1 = +Z, zprava; −1 zleva).
// Programovaný bod = střed rádiusu pracovní strany; na stoupající kontuře
// tak po povrchu jede DRUHÝ rádius (kontakt na protějším rohu), na klesající
// se obálka kryje s offsetem. xAt(z) vrací max X offsetu v z, nebo null.
// Vrací lomenou čáru [{x,z}] v pořadí jízdy zFrom → zTo (kolineární body
// vyházené s tolerancí tol).
export function samplePartingEnvelope(xAt, zFrom, zTo, span, dir, h = 0.4, tol = 0.01) {
  const n = Math.max(1, Math.ceil(Math.abs(zTo - zFrom) / h));
  const inner = Math.max(1, Math.ceil(span / h));
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const z = zFrom + (zTo - zFrom) * (i / n);
    let m = null;
    for (let j = 0; j <= inner; j++) {
      const x = xAt(z + dir * span * (j / inner));
      if (x !== null && (m === null || x > m)) m = x;
    }
    if (m !== null) pts.push({ x: m, z });
  }
  // Kolineární redukce — drž jen body, kde se směr láme o víc než tol.
  const out = [];
  for (const p of pts) {
    while (out.length >= 2) {
      const a = out[out.length - 2], b = out[out.length - 1];
      const ux = p.x - a.x, uz = p.z - a.z;
      const len = Math.hypot(ux, uz) || 1;
      const d = Math.abs((b.x - a.x) * uz - (b.z - a.z) * ux) / len;
      if (d < tol) out.pop(); else break;
    }
    out.push(p);
  }
  return out;
}

// Kružnice třemi body v rovině (z, x); null pro kolineární body.
function _circum3(A, B, C) {
  const d = 2 * (A.z * (B.x - C.x) + B.z * (C.x - A.x) + C.z * (A.x - B.x));
  if (Math.abs(d) < 1e-9) return null;
  const a2 = A.z * A.z + A.x * A.x, b2 = B.z * B.z + B.x * B.x, c2 = C.z * C.z + C.x * C.x;
  const z = (a2 * (B.x - C.x) + b2 * (C.x - A.x) + c2 * (A.x - B.x)) / d;
  const x = (a2 * (C.z - B.z) + b2 * (A.z - C.z) + c2 * (B.z - A.z)) / d;
  return { z, x, r: Math.hypot(A.z - z, A.x - x) };
}

// Proloží lomenou čáru oblouky: hladové hledání nejdelších běhů bodů
// ležících (v toleranci tol) na kružnici s monotónním úhlem a rozvinem
// ≤ ~170° (R formát v G-kódu je jednoznačný jen pro menší oblouk).
// Vrací segmenty { type:'line', p1, p2 } | { type:'arc', p1, p2, cx, cz,
// r, dir:'G2'|'G3', startAngle, endAngle }; úhel = atan2(x−cx, z−cz),
// G3 = rostoucí úhel (konvence shodná s vykreslováním kontury).
// Krátké zbytky mezi oblouky se slévají do úseček (kolineární merge).
export function fitArcsToPolyline(pts, tol = 0.02) {
  const segs = [];
  const N = pts.length;
  const ang = (c, p) => Math.atan2(p.x - c.x, p.z - c.z);
  const pushLine = (a, b) => {
    const prev = segs[segs.length - 1];
    if (prev && prev.type === 'line') {
      const ux = b.x - prev.p1.x, uz = b.z - prev.p1.z;
      const len = Math.hypot(ux, uz) || 1;
      const d = Math.abs((prev.p2.x - prev.p1.x) * uz - (prev.p2.z - prev.p1.z) * ux) / len;
      if (d < tol * 0.7) { prev.p2 = b; return; }
    }
    segs.push({ type: 'line', p1: a, p2: b });
  };
  let i = 0;
  while (i < N - 1) {
    let best = null;
    for (let j = i + 3; j < N; j++) {
      const c = _circum3(pts[i], pts[(i + j) >> 1], pts[j]);
      if (!c || c.r > 5000 || c.r < 0.05) break;
      let ok = true, prevA = null, dirSign = 0, sweep = 0;
      for (let k = i; k <= j; k++) {
        if (Math.abs(Math.hypot(pts[k].x - c.x, pts[k].z - c.z) - c.r) > tol) { ok = false; break; }
        // Sagitta mezery: mezi vzdálenými body (kolineární merge vyhazuje
        // body na rovných úsecích) se oblouk prohne o L²/8R — nesmí se od
        // skutečné dráhy (úsečky mezi body) odchýlit víc než tol, jinak by
        // rovný úsek nahradil oblouk s obřím R prohnutý doprostřed.
        if (k > i) {
          const L = Math.hypot(pts[k].x - pts[k - 1].x, pts[k].z - pts[k - 1].z);
          if (L * L / (8 * c.r) > tol) { ok = false; break; }
        }
        const a = ang(c, pts[k]);
        if (prevA !== null) {
          let da = a - prevA;
          while (da > Math.PI) da -= 2 * Math.PI;
          while (da < -Math.PI) da += 2 * Math.PI;
          if (Math.abs(da) > Math.PI / 2) { ok = false; break; }
          if (da !== 0) {
            const s = Math.sign(da);
            if (dirSign === 0) dirSign = s;
            else if (s !== dirSign) { ok = false; break; }
          }
          sweep += da;
        }
        prevA = a;
      }
      if (!ok || dirSign === 0 || Math.abs(sweep) > Math.PI * 0.94) break;
      best = { c, j, dirSign };
    }
    if (best) {
      const { c, j, dirSign } = best;
      const p1 = pts[i], p2 = pts[j];
      // Když celý běh leží v toleranci i na TĚTIVĚ, je to prakticky rovný
      // úsek → úsečka místo oblouku s obřím R (čitelnější kód a nepadá na
      // konzervativních kontrolách pracujících s kružnicí).
      const chLen = Math.hypot(p2.x - p1.x, p2.z - p1.z) || 1;
      let chordOk = true;
      for (let k = i + 1; k < j && chordOk; k++) {
        const d = Math.abs((pts[k].x - p1.x) * (p2.z - p1.z) - (pts[k].z - p1.z) * (p2.x - p1.x)) / chLen;
        if (d > tol) chordOk = false;
      }
      if (chordOk) {
        pushLine(p1, p2);
      } else {
        segs.push({
          type: 'arc', p1, p2, cx: c.x, cz: c.z, r: c.r,
          dir: dirSign > 0 ? 'G3' : 'G2',
          startAngle: ang(c, p1), endAngle: ang(c, p2),
        });
      }
      i = j;
    } else { pushLine(pts[i], pts[i + 1]); i++; }
  }
  return segs;
}

// Leží úhel `target` v intervalu <start,end>? isG2 = směr CW (G2).
export function isAngleBetween(target, start, end, isG2) {
  if (isNaN(target) || isNaN(start) || isNaN(end)) return false;
  const pi2 = 2 * Math.PI;
  const t = ((target % pi2) + pi2) % pi2;
  const s = ((start % pi2) + pi2) % pi2;
  const e = ((end % pi2) + pi2) % pi2;
  if (isG2) { if (s >= e) return t <= s && t >= e; return t <= s || t >= e; }
  else { if (e >= s) return t >= s && t <= e; return t >= s || t <= e; }
}

// X průsečíku svislé čáry Z=zLine s úsečkou p1→p2 (null mimo Z-rozsah).
export function intersectVerticalLineSegment(zLine, p1, p2) {
  if (!p1 || !p2) return null;
  const minZ = Math.min(p1.z, p2.z), maxZ = Math.max(p1.z, p2.z);
  if (zLine < minZ || zLine > maxZ) return null;
  if (Math.abs(p2.z - p1.z) < 1e-6) return null;
  const t = (zLine - p1.z) / (p2.z - p1.z);
  return p1.x + t * (p2.x - p1.x);
}

// X-ové průsečíky svislé čáry Z=zLine s kružnicí (0 nebo 2 hodnoty).
export function intersectVerticalLineArc(zLine, center, radius) {
  if (!center) return [];
  const term = radius * radius - Math.pow(zLine - center.z, 2);
  if (term < 0) return [];
  const sqrtTerm = Math.sqrt(term);
  return [center.x - sqrtTerm, center.x + sqrtTerm];
}

// ── Základní geometrické primitivy (line/arc) ──────────────────
// Přesunuto z camSimulator.js, aby je sdílela i logika mezních čar
// (cam/interferenceGuides.js) i strategie generování drah.

// Normála úsečky p1→p2 (jednotková, otočená o +90°). {0,0} pro degenerát.
export function getNormal(p1, p2) {
  if (!p1 || !p2) return { x: 0, z: 0 };
  const dx = p2.x - p1.x, dz = p2.z - p1.z, l = Math.sqrt(dx * dx + dz * dz);
  if (l === 0 || isNaN(l)) return { x: 0, z: 0 };
  return { x: -dz / l, z: dx / l };
}

// Úhel směrového vektoru (x,z) ve stejné konvenci jako úhly oblouků (atan2(x,z)).
export function vecAngle(x, z) { return Math.atan2(x, z); }

// Normalizace úhlu do rozsahu (-PI, PI>.
export function normalizeAngle(a) {
  while (a > Math.PI) a -= 2 * Math.PI;
  while (a < -Math.PI) a += 2 * Math.PI;
  return a;
}

// Střed a poloměr oblouku ze dvou koncových bodů a zadaného poloměru r
// (r < 0 = velký oblouk). type 'G2'/'G3' určuje stranu středu. error=true,
// když body splývají nebo r < tětiva/2 (safeR se dopočítá).
export function getArcParams(p1, p2, r, type) {
  if (!p1 || !p2) return { error: true, cx: 0, cz: 0, r: 0 };
  const d2 = Math.pow(p2.x - p1.x, 2) + Math.pow(p2.z - p1.z, 2), d = Math.sqrt(d2);
  const isLongArc = r < 0;
  const absR = Math.abs(r);
  let safeR = absR, error = false;
  if (d2 === 0) return { error: true, cx: p1.x, cz: p1.z, r: 0 };
  if (absR < d / 2 - 0.001) { error = true; safeR = d / 2 + 0.001; }
  const mx = (p1.x + p2.x) / 2, mz = (p1.z + p2.z) / 2;
  const h = Math.sqrt(Math.max(0, safeR * safeR - d2 / 4));
  const dx = p2.x - p1.x, dz = p2.z - p1.z;
  const ox = -dz / d, oz = dx / d;
  let sign = (type === 'G3') ? -1 : 1;
  if (isLongArc) sign *= -1;
  const cx = mx + sign * h * ox, cz = mz + sign * h * oz;
  if (isNaN(cx) || isNaN(cz)) return { error: true, cx: 0, cz: 0, r: 0 };
  return { cx, cz, r: safeR, error };
}

// Průsečíky přímky p1→p2 s kružnicí (center, r). Vrací dva body [t1, t2]
// na PŘÍMCE (neomezeno na úsečku), nebo null pro míjení (s tolerancí pro
// tangentní případ). Body se řadí podle parametru t (menší první).
export function intersectLineCircle(p1, p2, center, r) {
  if (!p1 || !p2 || !center) return null;
  const dx = p2.x - p1.x, dz = p2.z - p1.z;
  const fx = p1.x - center.x, fz = p1.z - center.z;
  const a = dx * dx + dz * dz, b = 2 * (fx * dx + fz * dz), c = (fx * fx + fz * fz) - r * r;
  let discriminant = b * b - 4 * a * c;
  // Tolerance pro tangentní případ — bez ní by se line tečná k offset oblouku
  // vyhodnotila jako "no intersection" a bridge fallback v trimAndRemoveLoops
  // by zdegeneroval malý oblouk (radius při ostrém rohu) do bodu.
  const tangentTol = 1e-6 * Math.max(1, a, c < 0 ? -c : c);
  if (discriminant < -tangentTol) return null;
  if (discriminant < 0) discriminant = 0;
  discriminant = Math.sqrt(discriminant);
  const t1 = (-b - discriminant) / (2 * a), t2 = (-b + discriminant) / (2 * a);
  return [
    { x: p1.x + t1 * dx, z: p1.z + t1 * dz },
    { x: p1.x + t2 * dx, z: p1.z + t2 * dz }
  ];
}

// Z-souřadnice průsečíku vodorovné čáry X=xLine s úsečkou p1→p2
// (null mimo X-rozsah nebo pro vodorovnou úsečku).
export function intersectHorizontalLineSegment(xLine, p1, p2) {
  if (!p1 || !p2) return null;
  const minX = Math.min(p1.x, p2.x), maxX = Math.max(p1.x, p2.x);
  if (xLine < minX || xLine > maxX) return null;
  if (Math.abs(p2.x - p1.x) < 1e-6) return null;
  const t = (xLine - p1.x) / (p2.x - p1.x);
  return p1.z + t * (p2.z - p1.z);
}

// Lokalizace bodu na kontuře (segmenty result): vrátí {segIdx, key} kde
// key = segIdx + podíl 0..1 podél segmentu (pro řazení podél kontury).
// null = bod neleží na žádném segmentu (do TOL).
export function _locateOnContour(result, pt) {
  const TOL = 0.3;
  let best = null, bestD = Infinity;
  for (let i = 0; i < result.length; i++) {
    const s = result[i]; if (!s || s.isDegenerate) continue;
    if (s.type === 'line') {
      if (!s.p1 || !s.p2) continue;
      const dx = s.p2.x - s.p1.x, dz = s.p2.z - s.p1.z, L2 = dx * dx + dz * dz || 1e-9;
      let t = ((pt.x - s.p1.x) * dx + (pt.z - s.p1.z) * dz) / L2;
      if (t < -0.02 || t > 1.02) continue;
      t = Math.max(0, Math.min(1, t));
      const d = Math.hypot(pt.x - (s.p1.x + t * dx), pt.z - (s.p1.z + t * dz));
      if (d < bestD && d < TOL) { bestD = d; best = { segIdx: i, key: i + t }; }
    } else if (s.type === 'arc') {
      const d = Math.abs(Math.hypot(pt.x - s.cx, pt.z - s.cz) - s.r);
      if (d > TOL) continue;
      const a = Math.atan2(pt.x - s.cx, pt.z - s.cz);
      if (!isAngleBetween(a, s.startAngle, s.endAngle, s.dir === 'G2')) continue;
      let sA = s.startAngle, eA = s.endAngle;
      if (s.dir === 'G2' && eA > sA) eA -= 2 * Math.PI;
      if (s.dir === 'G3' && eA < sA) eA += 2 * Math.PI;
      let aa = a;
      if (s.dir === 'G2' && aa > sA) aa -= 2 * Math.PI;
      if (s.dir === 'G3' && aa < sA) aa += 2 * Math.PI;
      const t = Math.abs(eA - sA) > 1e-9 ? (aa - sA) / (eA - sA) : 0;
      if (d < bestD) { bestD = d; best = { segIdx: i, key: i + Math.max(0, Math.min(1, t)) }; }
    }
  }
  return best;
}

// ── Vůle nad polotovarem po osách ──────────────────────────────
// Odsazení hranice pracovního posuvu od polotovaru: stockClearX (radiálně)
// a stockClearZ (axiálně). null/undefined = převzít starou jednotnou
// „Vůli nad polotovarem" (rapidClearance) — staré projekty tak fungují
// beze změny, dokud uživatel hodnoty nerozdělí.
export function stockClearances(prms) {
  const legacy = parseFloat(prms.rapidClearance);
  const base = Number.isFinite(legacy) && legacy > 0 ? legacy : 1;
  const cx = parseFloat(prms.stockClearX);
  const cz = parseFloat(prms.stockClearZ);
  return {
    x: Math.max(0.05, Number.isFinite(cx) ? cx : base),
    z: Math.max(0.05, Number.isFinite(cz) ? cz : base),
  };
}

// Max X (vnější povrch) polotovaru na zadaném Z: válec = konstantní sRad,
// odlitek = největší průsečík svislice se segmenty obrysu. Vrací null,
// když v daném Z polotovar není.
export function stockOuterXAtZ(prms, sRad, stockPathSegments, z) {
  if (prms.stockMode !== 'casting' || !stockPathSegments || stockPathSegments.length === 0) return sRad;
  let maxX = null;
  for (const seg of stockPathSegments) {
    if (seg.isDegenerate) continue;
    if (seg.type === 'line') {
      const x = intersectVerticalLineSegment(z, seg.p1, seg.p2);
      if (x !== null && (maxX === null || x > maxX)) maxX = x;
    } else if (seg.type === 'arc') {
      for (const x of intersectVerticalLineArc(z, { x: seg.cx, z: seg.cz }, seg.r)) {
        const angle = Math.atan2(x - seg.cx, z - seg.cz);
        if (isAngleBetween(angle, seg.startAngle, seg.endAngle, seg.dir === 'G2')
          && (maxX === null || x > maxX)) maxX = x;
      }
    }
  }
  return maxX;
}

// ── Segmentové primitivy (line/arc kontury) ────────────────────
// Přesunuto z camSimulator.js (MATH HELPERS / shared offset trimming
// sekce) — čisté funkce nad segs bez závislosti na S/DOM.
export const EPSILON = 1e-9;
export const TRIM_TOL = 0.5;
// Minimální vzdálenost průsečíku od endpointu, kterou požadujeme pro
// global loop-removal. Nižší hodnota → loop-removal eliminuje legitimní
// malé oblouky mezi dlouhými segmenty (intersection padne těsně za
// trimnutý konec line, ale je to falešná smyčka, ne skutečné self-cross).
export const LOOP_INTERIOR_MIN = 0.1;

export function arcSteps(r, scale) {
  const rPix = Math.abs(r) * scale;
  if (!(rPix > 0.5)) return 8;
  const dTheta = 2 * Math.sqrt((2 * 0.4) / rPix);
  return Math.max(8, Math.min(720, Math.ceil((2 * Math.PI) / dTheta)));
}

export function dist(p1, p2) {
  if (!p1 || !p2) return 0;
  return Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.z - p1.z, 2));
}

export function intersectLines(p1, p2, p3, p4) {
  if (!p1 || !p2 || !p3 || !p4) return null;
  if (isNaN(p1.x) || isNaN(p1.z) || isNaN(p2.x) || isNaN(p2.z) ||
      isNaN(p3.x) || isNaN(p3.z) || isNaN(p4.x) || isNaN(p4.z)) return null;
  const d = (p1.x - p2.x) * (p3.z - p4.z) - (p1.z - p2.z) * (p3.x - p4.x);
  if (Math.abs(d) < 1e-9 || isNaN(d)) return null;
  const t = ((p1.x - p3.x) * (p3.z - p4.z) - (p1.z - p3.z) * (p3.x - p4.x)) / d;
  const ix = p1.x + t * (p2.x - p1.x);
  const iz = p1.z + t * (p2.z - p1.z);
  if (isNaN(ix) || isNaN(iz)) return null;
  return { x: ix, z: iz };
}
export function intersectLinesInfinite(p1, p2, p3, p4) {
  if (!p1 || !p2 || !p3 || !p4) return null;
  if (isNaN(p1.x) || isNaN(p1.z) || isNaN(p2.x) || isNaN(p2.z) ||
      isNaN(p3.x) || isNaN(p3.z) || isNaN(p4.x) || isNaN(p4.z)) return null;
  const d = (p1.x - p2.x) * (p3.z - p4.z) - (p1.z - p2.z) * (p3.x - p4.x);
  if (Math.abs(d) < 1e-9 || isNaN(d)) return null;
  const t = ((p1.x - p3.x) * (p3.z - p4.z) - (p1.z - p3.z) * (p3.x - p4.x)) / d;
  const px = p1.x + t * (p2.x - p1.x);
  const pz = p1.z + t * (p2.z - p1.z);
  if (isNaN(px) || isNaN(pz)) return null;
  return { x: px, z: pz };
}

export function intersectCircleCircle(c1x, c1z, r1, c2x, c2z, r2) {
  const dx = c2x - c1x, dz = c2z - c1z;
  const d = Math.sqrt(dx * dx + dz * dz);
  if (d < EPSILON || d > r1 + r2 + EPSILON || d < Math.abs(r1 - r2) - EPSILON) return null;
  const a = (r1 * r1 - r2 * r2 + d * d) / (2 * d);
  const h2 = r1 * r1 - a * a;
  if (h2 < 0) return null;
  const h = Math.sqrt(Math.max(0, h2));
  const mx = c1x + a * dx / d, mz = c1z + a * dz / d;
  const ox = -dz / d, oz = dx / d;
  return [
    { x: mx + h * ox, z: mz + h * oz },
    { x: mx - h * ox, z: mz - h * oz }
  ];
}

// Skutečné průsečíky dvou segmentů (line/arc) — body, kde se dvě čáry
// kříží (ne koncové body). Pro SNAP na průsečíku kontury/offsetu/
// konstrukční čáry. Vrací jen body ležící uvnitř OBOU segmentů.
export function segPairIntersections(s1, s2) {
  if (!s1 || !s2 || s1.isDegenerate || s2.isDegenerate) return [];
  const out = [];
  const onLine = (q, a, b) => {
    const dx = b.x - a.x, dz = b.z - a.z;
    const len2 = dx * dx + dz * dz;
    if (len2 < 1e-12) return false;
    const t = ((q.x - a.x) * dx + (q.z - a.z) * dz) / len2;
    return t > 0.001 && t < 0.999;
  };
  const onArc = (q, s) => isAngleBetween(Math.atan2(q.x - s.cx, q.z - s.cz), s.startAngle, s.endAngle, s.dir === 'G2');
  if (s1.type === 'line' && s2.type === 'line') {
    const p = intersectLines(s1.p1, s1.p2, s2.p1, s2.p2);
    if (p && onLine(p, s1.p1, s1.p2) && onLine(p, s2.p1, s2.p2)) out.push(p);
  } else if (s1.type === 'line' && s2.type === 'arc') {
    const hits = intersectLineCircle(s1.p1, s1.p2, { x: s2.cx, z: s2.cz }, s2.r) || [];
    for (const q of hits) if (onLine(q, s1.p1, s1.p2) && onArc(q, s2)) out.push(q);
  } else if (s1.type === 'arc' && s2.type === 'line') {
    const hits = intersectLineCircle(s2.p1, s2.p2, { x: s1.cx, z: s1.cz }, s1.r) || [];
    for (const q of hits) if (onLine(q, s2.p1, s2.p2) && onArc(q, s1)) out.push(q);
  } else if (s1.type === 'arc' && s2.type === 'arc') {
    const hits = intersectCircleCircle(s1.cx, s1.cz, s1.r, s2.cx, s2.cz, s2.r) || [];
    for (const q of hits) if (onArc(q, s1) && onArc(q, s2)) out.push(q);
  }
  return out;
}

export function getSegEnd(seg) {
  if (seg.type === 'line') return seg.p2;
  return { x: seg.cx + Math.sin(seg.endAngle) * seg.r, z: seg.cz + Math.cos(seg.endAngle) * seg.r };
}
export function getSegStart(seg) {
  if (seg.type === 'line') return seg.p1;
  return { x: seg.cx + Math.sin(seg.startAngle) * seg.r, z: seg.cz + Math.cos(seg.startAngle) * seg.r };
}

export function intersectHorizontalLineArc(xLine, center, radius) {
  if (!center) return [];
  const term = radius * radius - Math.pow(xLine - center.x, 2);
  if (term < 0) return [];
  const sqrtTerm = Math.sqrt(term);
  return [center.z - sqrtTerm, center.z + sqrtTerm];
}

// X-ové průsečíky segmentu (line/arc) se svislou čarou Z = zVal — pro
// nalezení bodu polotovaru na limitu čelistí/koníku.
export function intersectSegAtZ(seg, zVal) {
  if (seg.type === 'line') {
    const x = intersectVerticalLineSegment(zVal, seg.p1, seg.p2);
    return x === null ? [] : [x];
  }
  if (seg.type === 'arc') {
    return intersectVerticalLineArc(zVal, { x: seg.cx, z: seg.cz }, seg.r).filter(x => {
      const a = Math.atan2(x - seg.cx, zVal - seg.cz);
      return isAngleBetween(a, seg.startAngle, seg.endAngle, seg.dir === 'G2');
    });
  }
  return [];
}

// ── Shared offset trimming + loop removal ──────────────────────
export function findSegIntersection(s1, s2) {
  if (s1.type === 'line' && s2.type === 'line') {
    return intersectLines(s1.p1, s1.p2, s2.p1, s2.p2);
  }
  if (s1.type === 'line' && s2.type === 'arc') {
    const ints = intersectLineCircle(s1.p1, s1.p2, { x: s2.cx, z: s2.cz }, s2.r);
    if (ints && ints.length > 0) {
      const ref = getSegEnd(s1);
      const d0 = Math.hypot(ints[0].x - ref.x, ints[0].z - ref.z);
      const d1 = Math.hypot(ints[1].x - ref.x, ints[1].z - ref.z);
      return d0 < d1 ? ints[0] : ints[1];
    }
    return null;
  }
  if (s1.type === 'arc' && s2.type === 'line') {
    const ints = intersectLineCircle(s2.p1, s2.p2, { x: s1.cx, z: s1.cz }, s1.r);
    if (ints && ints.length > 0) {
      const ref = getSegStart(s2);
      const d0 = Math.hypot(ints[0].x - ref.x, ints[0].z - ref.z);
      const d1 = Math.hypot(ints[1].x - ref.x, ints[1].z - ref.z);
      return d0 < d1 ? ints[0] : ints[1];
    }
    return null;
  }
  if (s1.type === 'arc' && s2.type === 'arc') {
    const ints = intersectCircleCircle(s1.cx, s1.cz, s1.r, s2.cx, s2.cz, s2.r);
    if (ints && ints.length > 0) {
      const ref1 = getSegEnd(s1);
      const ref2 = getSegStart(s2);
      let best = null, bestD = Infinity;
      for (const pt of ints) {
        const d = Math.hypot(pt.x - ref1.x, pt.z - ref1.z) + Math.hypot(pt.x - ref2.x, pt.z - ref2.z);
        if (d < bestD) { bestD = d; best = pt; }
      }
      return best;
    }
    return null;
  }
  return null;
}
export function setSegEnd(seg, pt) {
  if (seg.type === 'line') seg.p2 = pt;
  else seg.endAngle = Math.atan2(pt.x - seg.cx, pt.z - seg.cz);
}
export function setSegStart(seg, pt) {
  if (seg.type === 'line') seg.p1 = pt;
  else seg.startAngle = Math.atan2(pt.x - seg.cx, pt.z - seg.cz);
}
export function isOnSegBounds(pt, seg) {
  if (seg.type === 'line') {
    return pt.x >= Math.min(seg.p1.x, seg.p2.x) - TRIM_TOL &&
      pt.x <= Math.max(seg.p1.x, seg.p2.x) + TRIM_TOL &&
      pt.z >= Math.min(seg.p1.z, seg.p2.z) - TRIM_TOL &&
      pt.z <= Math.max(seg.p1.z, seg.p2.z) + TRIM_TOL;
  }
  // Oblouk: průsečík (z protnutí line↔KRUŽNICE / circle↔circle) musí ležet na
  // samotném OBLOUKU — na kružnici (v toleranci) a v jeho úhlovém rozsahu.
  // Bez této kontroly projde i průsečík na prodloužení kružnice mimo oblouk
  // (falešná smyčka → vyříznutí reálné geometrie, např. stěn zápichu před
  // navazujícím rádiusem). Dřív funkce pro oblouk vracela vždy true.
  if (typeof seg.startAngle !== 'number' || typeof seg.endAngle !== 'number') return true;
  const d = Math.hypot(pt.x - seg.cx, pt.z - seg.cz);
  if (Math.abs(d - seg.r) > TRIM_TOL) return false;
  const a = Math.atan2(pt.x - seg.cx, pt.z - seg.cz);
  return isAngleBetween(a, seg.startAngle, seg.endAngle, seg.dir === 'G2');
}
// Striktní kontrola, že bod leží UVNITŘ úsečky (parametr t ∈ [0,1]), ne na
// jejím prodloužení. isOnSegBounds používá obdélníkovou toleranci TRIM_TOL
// (0.5 mm) kvůli offsetovým zaokrouhlením — na RAW kontuře ale `intersectLines`
// vrací průsečík NEKONEČNÝCH přímek, takže bod 0,1–0,5 mm za koncem úsečky
// (typicky prodloužení zkosení za čelo) projde jako falešná „smyčka" a
// removeContourSelfIntersections vyřízne reálnou geometrii (sražení). Tahle
// kontrola promítne bod na úsečku a ověří, že je opravdu mezi koncovými body.
export function isWithinSegStrict(pt, seg) {
  if (seg.type !== 'line') return isOnSegBounds(pt, seg);
  const dx = seg.p2.x - seg.p1.x, dz = seg.p2.z - seg.p1.z;
  const len2 = dx * dx + dz * dz;
  if (len2 < 1e-12) return false;
  const t = ((pt.x - seg.p1.x) * dx + (pt.z - seg.p1.z) * dz) / len2;
  return t >= -1e-6 && t <= 1 + 1e-6;
}
export function segEndPoint(seg) {
  if (seg.type === 'line') return seg.p2;
  return { x: seg.cx + Math.sin(seg.endAngle) * seg.r, z: seg.cz + Math.cos(seg.endAngle) * seg.r };
}
export function segStartPoint(seg) {
  if (seg.type === 'line') return seg.p1;
  return { x: seg.cx + Math.sin(seg.startAngle) * seg.r, z: seg.cz + Math.cos(seg.startAngle) * seg.r };
}
// Po úpravě startAngle/endAngle obloukového segmentu (setSegEnd/setSegStart)
// dosynchronizuje p1/p2 — u raw kontury slouží jako reference pro isOuter
// detekci offsetu i pro zobrazení, takže musí odpovídat novým úhlům.
export function syncArcEndpoints(seg) {
  if (seg.type !== 'arc') return;
  seg.p1 = segStartPoint(seg);
  seg.p2 = segEndPoint(seg);
}
// Obrátí směr průchodu segmentem (prohodí start↔konec). Geometrie zůstává,
// mění se jen orientace: u oblouku prohodí úhly a překlopí G2↔G3.
export function reverseSeg(seg) {
  const t = seg.p1; seg.p1 = seg.p2; seg.p2 = t;
  if (seg.type === 'arc') {
    const ta = seg.startAngle; seg.startAngle = seg.endAngle; seg.endAngle = ta;
    seg.dir = seg.dir === 'G2' ? 'G3' : 'G2';
  }
}
// Degenerovaný zbytkový oblouk (po ořezu/loop-removalu): jeho začátek a konec
// téměř splývají (malá tětiva). Buď nulový zlomek, nebo — což je horší — oblouk,
// kterému ořez nastavil úhly tak, že obíhá skoro DOKOLA (sweep ≈ 2π). V náhledu
// se kreslí jako PLNÁ KRUŽNICE a v G-kódu se start==konec (po zaokrouhlení) →
// „G2/G3 …CR=" z bodu do sebe = celá kružnice. U soustružnického profilu je
// splývající začátek/konec vždy chyba (reálné oblouky mají konce znatelně od
// sebe), tak ho nahradíme přímou úsečkou start→konec (zachová napojení).
export function dropTinyArcs(path) {
  if (!path) return path;
  for (let i = 0; i < path.length; i++) {
    const s = path[i];
    if (!s || s.type !== 'arc') continue;
    const a = segStartPoint(s), b = segEndPoint(s);
    if (Math.hypot(a.x - b.x, a.z - b.z) < 0.2) {
      const line = { type: 'line', p1: a, p2: b };
      if (s.chainBreak) line.chainBreak = true;
      if (s.unreachable) line.unreachable = true;
      if (s.isDegenerate) line.isDegenerate = true;
      path[i] = line;
    }
  }
  return path;
}
// Vrátí true, pokud bod leží uvnitř segmentu (ne na/blízko jeho koncových
// bodů) — používá se pro detekci "mostu": nově přidaného segmentu, jehož oba
// konce dopadají do vnitřku jiných segmentů kontury (ne na jejich konce).
export function pointOnSegInterior(pt, seg) {
  if (seg.type === 'line') {
    const { p1, p2 } = seg;
    const dx = p2.x - p1.x, dz = p2.z - p1.z;
    const len = Math.hypot(dx, dz);
    if (len < 1e-9) return false;
    const cross = Math.abs((pt.x - p1.x) * dz - (pt.z - p1.z) * dx) / len;
    if (cross > TRIM_TOL) return false;
    const t = ((pt.x - p1.x) * dx + (pt.z - p1.z) * dz) / (len * len);
    if (t * len < LOOP_INTERIOR_MIN || (1 - t) * len < LOOP_INTERIOR_MIN) return false;
    return true;
  } else {
    const d = Math.hypot(pt.x - seg.cx, pt.z - seg.cz);
    if (Math.abs(d - seg.r) > TRIM_TOL) return false;
    const a = Math.atan2(pt.x - seg.cx, pt.z - seg.cz);
    if (!isAngleBetween(a, seg.startAngle, seg.endAngle, seg.dir === 'G2')) return false;
    const sp = segStartPoint(seg), ep = segEndPoint(seg);
    if (Math.hypot(pt.x - sp.x, pt.z - sp.z) < LOOP_INTERIOR_MIN) return false;
    if (Math.hypot(pt.x - ep.x, pt.z - ep.z) < LOOP_INTERIOR_MIN) return false;
    return true;
  }
}
