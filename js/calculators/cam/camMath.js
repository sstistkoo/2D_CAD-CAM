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
