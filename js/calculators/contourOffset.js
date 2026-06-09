// ╔══════════════════════════════════════════════════════════════╗
// ║  SKICA – Offset kontury (přídavek na plochu) – pure modul    ║
// ╚══════════════════════════════════════════════════════════════╝
//
// Algoritmus extrahovaný z camSimulator.handleStockFromContourAllowance.
// Pracuje v 2D souřadnicích pojmenovaných (x, z) — historická konvence
// CAMu (z = osa rotace / horizontální, x = poloměr / vertikální).
// Volající z CAD strany použije adaptér:
//    canvas (cx, cy)  →  algoritmus (z = cx, x = cy)
//
// Vstup:  pole {type:'line', p1:{x,z}, p2:{x,z}}
//                | {type:'arc', cx, cz, r, dir:'G2'|'G3', startAngle, endAngle, p1, p2}
//         allowance, chamfer, fillet  (mm)
// Výstup: pole stejných objektů — ofset s odřezanými/přemostěnými rohy
//         + sražení/zaoblení vrcholů. Bez koncových uzávěrů (volající doplní).

const EPSILON = 1e-6;
const TRIM_TOL = 0.02;
const LOOP_INTERIOR_MIN = 0.1;

// ── Základní 2D geometrie ──────────────────────────────────────
function getNormal(p1, p2) {
  if (!p1 || !p2) return { x: 0, z: 0 };
  const dx = p2.x - p1.x, dz = p2.z - p1.z, l = Math.sqrt(dx * dx + dz * dz);
  if (l === 0 || isNaN(l)) return { x: 0, z: 0 };
  return { x: -dz / l, z: dx / l };
}

function intersectLines(p1, p2, p3, p4) {
  if (!p1 || !p2 || !p3 || !p4) return null;
  const d = (p1.x - p2.x) * (p3.z - p4.z) - (p1.z - p2.z) * (p3.x - p4.x);
  if (Math.abs(d) < 1e-9) return null;
  const t = ((p1.x - p3.x) * (p3.z - p4.z) - (p1.z - p3.z) * (p3.x - p4.x)) / d;
  const ix = p1.x + t * (p2.x - p1.x);
  const iz = p1.z + t * (p2.z - p1.z);
  if (isNaN(ix) || isNaN(iz)) return null;
  return { x: ix, z: iz };
}

function intersectLinesInfinite(p1, p2, p3, p4) {
  if (!p1 || !p2 || !p3 || !p4) return null;
  const d = (p1.x - p2.x) * (p3.z - p4.z) - (p1.z - p2.z) * (p3.x - p4.x);
  if (Math.abs(d) < 1e-9) return null;
  const t = ((p1.x - p3.x) * (p3.z - p4.z) - (p1.z - p3.z) * (p3.x - p4.x)) / d;
  const px = p1.x + t * (p2.x - p1.x);
  const pz = p1.z + t * (p2.z - p1.z);
  if (isNaN(px) || isNaN(pz)) return null;
  return { x: px, z: pz };
}

function intersectLineCircle(p1, p2, center, r) {
  if (!p1 || !p2 || !center) return null;
  const dx = p2.x - p1.x, dz = p2.z - p1.z;
  const fx = p1.x - center.x, fz = p1.z - center.z;
  const a = dx * dx + dz * dz, b = 2 * (fx * dx + fz * dz), c = (fx * fx + fz * fz) - r * r;
  let discriminant = b * b - 4 * a * c;
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

function intersectCircleCircle(c1x, c1z, r1, c2x, c2z, r2) {
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

function getSegEnd(seg) {
  if (seg.type === 'line') return seg.p2;
  return { x: seg.cx + Math.sin(seg.endAngle) * seg.r, z: seg.cz + Math.cos(seg.endAngle) * seg.r };
}

function getSegStart(seg) {
  if (seg.type === 'line') return seg.p1;
  return { x: seg.cx + Math.sin(seg.startAngle) * seg.r, z: seg.cz + Math.cos(seg.startAngle) * seg.r };
}

function setSegEnd(seg, pt) {
  if (seg.type === 'line') seg.p2 = pt;
  else seg.endAngle = Math.atan2(pt.x - seg.cx, pt.z - seg.cz);
}

function setSegStart(seg, pt) {
  if (seg.type === 'line') seg.p1 = pt;
  else seg.startAngle = Math.atan2(pt.x - seg.cx, pt.z - seg.cz);
}

function isOnSegBounds(pt, seg) {
  if (seg.type !== 'line') return true;
  return pt.x >= Math.min(seg.p1.x, seg.p2.x) - TRIM_TOL &&
    pt.x <= Math.max(seg.p1.x, seg.p2.x) + TRIM_TOL &&
    pt.z >= Math.min(seg.p1.z, seg.p2.z) - TRIM_TOL &&
    pt.z <= Math.max(seg.p1.z, seg.p2.z) + TRIM_TOL;
}

function findSegIntersection(s1, s2) {
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

// ── Surový ofset jednoho segmentu ──────────────────────────────
// Pro line: posun o `allowance` ve směru normály (CCW od směru segmentu).
// Pro arc: změna poloměru — buď zvětšení (vnější roh) nebo zmenšení (vnitřní).
//   isOuter určuje se podle vztahu středu oblouku k poloze midpointu vůči ose
//   rotace (z=0 zde reprezentuje horizontální osu, takže u soustruhu, kde se
//   pracuje v (x_radius, z_length), porovnáváme |cx| < |midX|).
function rawOffsetSegment(seg, allowance) {
  if (seg.type === 'line') {
    const n = getNormal(seg.p1, seg.p2);
    const tx = n.x * allowance, tz = n.z * allowance;
    return {
      type: 'line',
      p1: { x: seg.p1.x + tx, z: seg.p1.z + tz },
      p2: { x: seg.p2.x + tx, z: seg.p2.z + tz }
    };
  }
  // arc
  const midAbsX = Math.abs((seg.p1.x + seg.p2.x) / 2);
  const centerAbsX = Math.abs(seg.cx);
  const isOuter = centerAbsX < midAbsX;
  const rNew = isOuter ? seg.r + allowance : seg.r - allowance;
  if (rNew <= 0.5) return null;
  const startAngle = Math.atan2(seg.p1.x - seg.cx, seg.p1.z - seg.cz);
  const endAngle   = Math.atan2(seg.p2.x - seg.cx, seg.p2.z - seg.cz);
  return { type: 'arc', cx: seg.cx, cz: seg.cz, r: rNew, dir: seg.dir, startAngle, endAngle };
}

// ── Pre-connect (manhattan rohy mezi arc/line) ─────────────────
function preConnectOffsets(rawOffsets) {
  if (rawOffsets.length < 2) return rawOffsets;
  const endOf = (s) => s.type === 'line'
    ? s.p2
    : { x: s.cx + Math.sin(s.endAngle) * s.r, z: s.cz + Math.cos(s.endAngle) * s.r };
  const startOf = (s) => s.type === 'line'
    ? s.p1
    : { x: s.cx + Math.sin(s.startAngle) * s.r, z: s.cz + Math.cos(s.startAngle) * s.r };
  const tangentAtEnd = (a) => {
    const sign = a.dir === 'G2' ? -1 : 1;
    return { x: sign * Math.cos(a.endAngle), z: -sign * Math.sin(a.endAngle) };
  };
  const tangentAtStart = (a) => {
    const sign = a.dir === 'G2' ? -1 : 1;
    return { x: sign * Math.cos(a.startAngle), z: -sign * Math.sin(a.startAngle) };
  };
  const lineDir = (l) => {
    const dx = l.p2.x - l.p1.x, dz = l.p2.z - l.p1.z;
    const len = Math.hypot(dx, dz);
    return len > 1e-9 ? { x: dx / len, z: dz / len } : { x: 0, z: 0 };
  };
  const intersectInf = (P1, d1, P2, d2) => {
    const det = d1.x * d2.z - d1.z * d2.x;
    if (Math.abs(det) < 1e-9) return null;
    const t = ((P2.x - P1.x) * d2.z - (P2.z - P1.z) * d2.x) / det;
    return { x: P1.x + t * d1.x, z: P1.z + t * d1.z };
  };
  const result = [rawOffsets[0]];
  for (let i = 1; i < rawOffsets.length; i++) {
    const prev = result[result.length - 1];
    const cur = rawOffsets[i];
    if (prev.type !== 'arc' && cur.type !== 'arc') { result.push(cur); continue; }
    const pe = endOf(prev);
    const cs = startOf(cur);
    const gap = Math.hypot(cs.x - pe.x, cs.z - pe.z);
    if (gap <= 0.1) { result.push(cur); continue; }
    const dPrev = prev.type === 'arc' ? tangentAtEnd(prev) : lineDir(prev);
    const dCur  = cur.type === 'arc'  ? tangentAtStart(cur) : lineDir(cur);
    const corner = intersectInf(pe, dPrev, cs, dCur);
    const tFromPrev = corner ? (corner.x - pe.x) * dPrev.x + (corner.z - pe.z) * dPrev.z : -1;
    const tToNext   = corner ? (cs.x - corner.x) * dCur.x + (cs.z - corner.z) * dCur.z : -1;
    if (corner && tFromPrev > 0.01 && tToNext > 0.01) {
      result.push({ type: 'line', p1: { x: pe.x, z: pe.z }, p2: { x: corner.x, z: corner.z } });
      result.push({ type: 'line', p1: { x: corner.x, z: corner.z }, p2: { x: cs.x, z: cs.z } });
    } else {
      result.push({ type: 'line', p1: { x: pe.x, z: pe.z }, p2: { x: cs.x, z: cs.z }, isConnector: true });
    }
    result.push(cur);
  }
  return result;
}

// ── Trim sousedů + global loop removal + (opt-in) collinear bridging ──
function trimAndRemoveLoops(rawSegs, opts = {}) {
  if (rawSegs.length === 0) return [];
  const result = [structuredClone(rawSegs[0])];
  for (let i = 0; i < rawSegs.length - 1; i++) {
    const prevOff = result[result.length - 1];
    const nextOff = structuredClone(rawSegs[i + 1]);
    const intersection = findSegIntersection(prevOff, nextOff);
    if (intersection) {
      setSegEnd(prevOff, intersection);
      setSegStart(nextOff, intersection);
      result.push(nextOff);
    } else {
      let corner = null;
      if (prevOff.type === 'line' && nextOff.type === 'line') {
        corner = intersectLinesInfinite(prevOff.p1, prevOff.p2, nextOff.p1, nextOff.p2);
      }
      if (corner) {
        prevOff.p2 = corner; nextOff.p1 = corner;
      } else {
        const pStart = getSegEnd(prevOff);
        const pEnd = getSegStart(nextOff);
        result.push({ type: 'line', p1: pStart, p2: { x: pEnd.x, z: pStart.z } });
        if (Math.abs(pEnd.z - pStart.z) > 0.001)
          result.push({ type: 'line', p1: { x: pEnd.x, z: pStart.z }, p2: pEnd });
      }
      result.push(nextOff);
    }
  }
  // global loop removal
  if (result.length > 2) {
    let loopFound = true, iterations = 0;
    while (loopFound && iterations < 5) {
      loopFound = false; iterations++;
      outerLoop:
      for (let i = 0; i < result.length - 2; i++) {
        for (let j = i + 2; j < result.length; j++) {
          const s1 = result[i], s2 = result[j];
          const pt = findSegIntersection(s1, s2);
          if (pt && isOnSegBounds(pt, s1) && isOnSegBounds(pt, s2)) {
            const s1End = getSegEnd(s1);
            const s2Start = getSegStart(s2);
            const d1 = Math.hypot(pt.x - s1End.x, pt.z - s1End.z);
            const d2 = Math.hypot(pt.x - s2Start.x, pt.z - s2Start.z);
            if (d1 < LOOP_INTERIOR_MIN || d2 < LOOP_INTERIOR_MIN) continue;
            const exitDir = (seg) => {
              if (seg.type === 'line') {
                const dx = seg.p2.x - seg.p1.x, dz = seg.p2.z - seg.p1.z;
                const l = Math.hypot(dx, dz);
                return l > 1e-6 ? { x: dx / l, z: dz / l } : null;
              }
              const sign = seg.dir === 'G2' ? -1 : 1;
              return { x: sign * Math.cos(seg.endAngle), z: -sign * Math.sin(seg.endAngle) };
            };
            const entryDir = (seg) => {
              if (seg.type === 'line') {
                const dx = seg.p2.x - seg.p1.x, dz = seg.p2.z - seg.p1.z;
                const l = Math.hypot(dx, dz);
                return l > 1e-6 ? { x: dx / l, z: dz / l } : null;
              }
              const sign = seg.dir === 'G2' ? -1 : 1;
              return { x: sign * Math.cos(seg.startAngle), z: -sign * Math.sin(seg.startAngle) };
            };
            const e1 = exitDir(s1), n2 = entryDir(s2);
            if (e1 && n2) {
              const dot = e1.x * n2.x + e1.z * n2.z;
              if (dot > -0.5) continue;
            }
            setSegEnd(s1, pt);
            setSegStart(s2, pt);
            result.splice(i + 1, j - (i + 1));
            loopFound = true;
            break outerLoop;
          }
        }
      }
    }
  }
  // collinear bridging (opt-in)
  if (opts.bridgeCollinear && result.length > 2) {
    let bridged = true, iter = 0;
    while (bridged && iter < 5) {
      bridged = false; iter++;
      outerB:
      for (let i = 0; i < result.length - 2; i++) {
        const s1 = result[i];
        if (s1.type !== 'line') continue;
        const d1x = s1.p2.x - s1.p1.x, d1z = s1.p2.z - s1.p1.z;
        const l1 = Math.hypot(d1x, d1z);
        if (l1 < 1e-6) continue;
        for (let j = i + 2; j < result.length; j++) {
          const s2 = result[j];
          if (s2.type !== 'line') continue;
          const d2x = s2.p2.x - s2.p1.x, d2z = s2.p2.z - s2.p1.z;
          const l2 = Math.hypot(d2x, d2z);
          if (l2 < 1e-6) continue;
          const cross = (d1x / l1) * (d2z / l2) - (d1z / l1) * (d2x / l2);
          if (Math.abs(cross) > 1e-3) continue;
          const dot = (d1x / l1) * (d2x / l2) + (d1z / l1) * (d2x / l2);
          if (dot < 0.99) continue;
          const px = s2.p1.x - s1.p1.x, pz = s2.p1.z - s1.p1.z;
          const perpDist = Math.abs(px * (d1z / l1) - pz * (d1x / l1));
          if (perpDist > TRIM_TOL) continue;
          let hasExcursion = false;
          for (let k = i + 1; k < j; k++) {
            const sk = result[k];
            const ptK = sk.type === 'line' ? sk.p2 : { x: sk.cx + Math.sin(sk.endAngle) * sk.r, z: sk.cz + Math.cos(sk.endAngle) * sk.r };
            const dKx = ptK.x - s1.p1.x, dKz = ptK.z - s1.p1.z;
            const perp = Math.abs(dKx * (d1z / l1) - dKz * (d1x / l1));
            if (perp > TRIM_TOL * 5) { hasExcursion = true; break; }
          }
          if (!hasExcursion) continue;
          result[i] = { type: 'line', p1: { x: s1.p1.x, z: s1.p1.z }, p2: { x: s2.p2.x, z: s2.p2.z } };
          result.splice(i + 1, j - i);
          bridged = true;
          break outerB;
        }
      }
    }
  }
  return result;
}

// ── Chamfer/Fillet pass přes ofsetovou polyčáru ────────────────
function applyChamferFillet(segs, chamferSize, filletSize) {
  if (filletSize === undefined) filletSize = chamferSize;
  if ((chamferSize <= 0 && filletSize <= 0) || segs.length < 2) return segs;

  const mods = [];
  for (let i = 0; i < segs.length - 1; i++) {
    const s1 = segs[i], s2 = segs[i + 1];
    if (s1.type !== 'line' || s2.type !== 'line') { mods.push(null); continue; }
    if (s1.isConnector || s2.isConnector) { mods.push(null); continue; }
    const V = s1.p2;
    const d1Lx = s1.p2.x - s1.p1.x, d1Lz = s1.p2.z - s1.p1.z;
    const d2Lx = s2.p2.x - s2.p1.x, d2Lz = s2.p2.z - s2.p1.z;
    const d1Len = Math.hypot(d1Lx, d1Lz);
    const d2Len = Math.hypot(d2Lx, d2Lz);
    if (d1Len < 1e-6 || d2Len < 1e-6) { mods.push(null); continue; }
    const d1 = { x: d1Lx / d1Len, z: d1Lz / d1Len };
    const d2 = { x: d2Lx / d2Len, z: d2Lz / d2Len };
    const cross = d1.x * d2.z - d1.z * d2.x;
    if (Math.abs(cross) < 0.05) { mods.push(null); continue; }

    if (cross < 0) {
      if (chamferSize <= 0) { mods.push(null); continue; }
      const cosTurn = d1.x * d2.x + d1.z * d2.z;
      if (cosTurn > 0.57) { mods.push(null); continue; }
      const c = Math.min(chamferSize, d1Len * 0.49, d2Len * 0.49);
      if (c < 0.05) { mods.push(null); continue; }
      const P1 = { x: V.x - d1.x * c, z: V.z - d1.z * c };
      const P2 = { x: V.x + d2.x * c, z: V.z + d2.z * c };
      mods.push({ type: 'chamfer', P1, P2 });
    } else {
      if (filletSize <= 0) { mods.push(null); continue; }
      const cosA = -d1.x * d2.x - d1.z * d2.z;
      const halfAngle = Math.acos(Math.max(-1, Math.min(1, cosA))) / 2;
      if (halfAngle < 0.05 || halfAngle > Math.PI / 2 - 0.05) { mods.push(null); continue; }
      let tanLen = filletSize / Math.tan(halfAngle);
      tanLen = Math.min(tanLen, d1Len * 0.49, d2Len * 0.49);
      const r = tanLen * Math.tan(halfAngle);
      if (r < 0.05) { mods.push(null); continue; }
      const P1 = { x: V.x - d1.x * tanLen, z: V.z - d1.z * tanLen };
      const P2 = { x: V.x + d2.x * tanLen, z: V.z + d2.z * tanLen };
      // Convex arc (G3): center on concave/inward side so the arc bulges outward
      const chDx = P2.x - P1.x, chDz = P2.z - P1.z;
      const chLen = Math.hypot(chDx, chDz);
      if (chLen < 1e-6) { mods.push(null); continue; }
      const chH2 = r * r - chLen * chLen / 4;
      if (chH2 < 0) { mods.push({ type: 'chamfer', P1, P2 }); continue; }
      const chH = Math.sqrt(chH2);
      const chOx = -chDz / chLen, chOz = chDx / chLen;
      const C = { x: (P1.x + P2.x) / 2 - chH * chOx, z: (P1.z + P2.z) / 2 - chH * chOz };
      const startAngle = Math.atan2(P1.x - C.x, P1.z - C.z);
      const endAngle = Math.atan2(P2.x - C.x, P2.z - C.z);
      mods.push({ type: 'fillet', P1, P2, C, r, startAngle, endAngle });
    }
  }
  const out = [];
  for (let i = 0; i < segs.length; i++) {
    const seg = structuredClone(segs[i]);
    if (i > 0 && mods[i - 1] && seg.type === 'line') seg.p1 = mods[i - 1].P2;
    if (i < segs.length - 1 && mods[i] && seg.type === 'line') seg.p2 = mods[i].P1;
    out.push(seg);
    if (i < segs.length - 1 && mods[i]) {
      const m = mods[i];
      if (m.type === 'chamfer') {
        out.push({ type: 'line', p1: m.P1, p2: m.P2 });
      } else {
        out.push({ type: 'arc', cx: m.C.x, cz: m.C.z, r: m.r, dir: 'G3', startAngle: m.startAngle, endAngle: m.endAngle, p1: m.P1, p2: m.P2 });
      }
    }
  }
  return out;
}

// ── Hlavní API ─────────────────────────────────────────────────
/**
 * Aplikuje rovnoměrný přídavek na chain segmentů + volitelné sražení/zaoblení rohů.
 * Vstupní segmenty musí být ve směru průchodu kontury (normála vlevo od směru
 * je „vnější" – obvyklá soustružnická konvence: kontura nad osou rotace).
 *
 * @param {Array} segments  pole line/arc segmentů (chain)
 * @param {{allowance:number, chamfer?:number, fillet?:number}} opts
 * @returns {Array|null}    výstupní chain (bez koncových uzávěrů) nebo null pokud nelze
 */
export function offsetContour(segments, opts) {
  const allowance = parseFloat(opts.allowance) || 0;
  const chamfer = parseFloat(opts.chamfer) || 0;
  const fillet  = parseFloat(opts.fillet)  || 0;
  if (allowance <= 0 || !segments || segments.length === 0) return null;

  const rawOffsets = [];
  for (const seg of segments) {
    const off = rawOffsetSegment(seg, allowance);
    if (off) rawOffsets.push(off);
  }
  if (rawOffsets.length === 0) return null;

  const preConnected = preConnectOffsets(rawOffsets);
  let trimmed = trimAndRemoveLoops(preConnected, { bridgeCollinear: true });
  if (chamfer > 0 || fillet > 0) {
    trimmed = applyChamferFillet(trimmed, chamfer, fillet);
  }
  return trimmed;
}
