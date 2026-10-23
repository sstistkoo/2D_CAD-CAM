// Hit-testy CAM simulátoru: bod / úsečka / oblouk kontury či polotovaru pod
// kurzorem, úchopy upichnutí (Dojezd X / Start X), mezní čáry Z a X a převod
// kliknutí na světové souřadnice. Vyňato z camSimulator.js (část bývalého
// bloku „SNAP MEZNÍCH ČAR", docs/plan-rozdeleni-cam-simulatoru.md) — stav
// simulátoru a plátno se předávají parametrem.
import { getArcParams, isAngleBetween } from '../camMath.js';
import { partOffGeom } from '../threadHelpers.js';
import { xBoundOn, xRangeAnyOn } from '../rangeX.js';

/**
 * @param ctx { S, canvas }
 * @returns {{ getAnyPointAt, getPartOffHandleAt, _partOffRadiusFromClient, _applyPartOffHandle,
 *             getContourSegmentAt, clientToWorldCam, getArcSegmentAt, getZLimitAt, getXLimitAt }}
 */
export function createHitTest({ S, canvas }) {
  // Najde nejbližší bod kontury NEBO polotovaru bez ohledu na aktuální
  // editMode — používá se pro "+"/"−" (vložit/odebrat bod), aby šlo
  // navázat kresbu i z bodu polotovaru, když je aktivní editor kontury.
  function getAnyPointAt(clientX, clientY) {
    if (S.simRunning) return null;
    const calc = S._cachedCalc; if (!calc) return null;
    const rect = canvas.getBoundingClientRect();
    const mx = clientX - rect.left, my = clientY - rect.top;
    const prms = S.params;
    const vS = S.flipX ? 1 : -1; const hS = S.flipZ ? -1 : 1;
    const toScreen = (x, z) => {
      if (prms.machineStructure === 'carousel') return { x: S.view.panX + hS * x * S.view.scale, y: S.view.panY + vS * z * S.view.scale };
      return { x: S.view.panX + hS * z * S.view.scale, y: S.view.panY + vS * x * S.view.scale };
    };
    let closest = null, minD = Infinity;
    (calc.worldPoints || []).forEach((p, i) => {
      const pt = toScreen(p.xReal, p.zReal);
      const d = Math.hypot(pt.x - mx, pt.y - my);
      if (d < 15 && d < minD) { minD = d; closest = { idx: i, isStock: false }; }
    });
    if (prms.stockMode !== 'cylinder') {
      (calc.stockWorldPoints || []).forEach((p, i) => {
        const pt = toScreen(p.xReal, p.zReal);
        const d = Math.hypot(pt.x - mx, pt.y - my);
        if (d < 15 && d < minD) { minD = d; closest = { idx: i, isStock: true }; }
      });
    }
    return closest;
  }

  // Hit-test na úchopové body upichnutí (Dojezd X / Start X) na svislé úsečce.
  // Vrátí 'dojezd' | 'start' | null. Aktivní jen v režimu ◆ Kontura.
  function getPartOffHandleAt(clientX, clientY) {
    if (S.simRunning) return null;
    const prms = S.params;
    if (prms.partOffZ == null || !isFinite(parseFloat(prms.partOffZ))) return null;
    if (prms.partOffFace) return null;   // čelní zápich nemá Dojezd / Start X (pravidlo 19)
    const calc = S._cachedCalc; if (!calc) return null;
    const g = partOffGeom(prms, calc);
    if (!g.canCut) return null;
    const rect = canvas.getBoundingClientRect();
    const mx = clientX - rect.left, my = clientY - rect.top;
    const vS = S.flipX ? 1 : -1; const hS = S.flipZ ? -1 : 1;
    const toScreen = (x, z) => (prms.machineStructure === 'carousel')
      ? { x: S.view.panX + hS * x * S.view.scale, y: S.view.panY + vS * z * S.view.scale }
      : { x: S.view.panX + hS * z * S.view.scale, y: S.view.panY + vS * x * S.view.scale };
    let closest = null, minD = Infinity;
    for (const hnd of [{ w: 'dojezd', x: g.xBottomEdge }, { w: 'start', x: g.startEdgeX }]) {
      const pt = toScreen(hnd.x, g.pz);
      const d = Math.hypot(pt.x - mx, pt.y - my);
      if (d < 15 && d < minD) { minD = d; closest = hnd.w; }
    }
    return closest;
  }

  // Radiální (X, v rádiusu) souřadnice pod kurzorem — pro tažení úchopů upichnutí.
  function _partOffRadiusFromClient(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const vS = S.flipX ? 1 : -1; const hS = S.flipZ ? -1 : 1;
    return (S.params.machineStructure === 'carousel')
      ? hS * ((clientX - rect.left) - S.view.panX) / S.view.scale
      : vS * ((clientY - rect.top) - S.view.panY) / S.view.scale;
  }

  // Nastaví Dojezd X / Start X z radiální polohy kurzoru (s clampem).
  function _applyPartOffHandle(which, radiusX) {
    const top = partOffGeom(S.params, S._cachedCalc || {}).xStockTop;
    let rx = Math.max(0, radiusX);
    if (which === 'dojezd') {
      const startV = parseFloat(S.params.partOffStartX);
      const upper = (isFinite(startV) && startV > 0) ? startV : top;
      rx = Math.min(rx, Math.max(0, upper - 0.01), top);
      S.params.allowanceX = Math.round(rx * 100) / 100;
    } else {   // start
      const lower = parseFloat(S.params.allowanceX) || 0;
      if (rx >= top - 0.01) S.params.partOffStartX = 0;         // u povrchu → neaktivní
      else S.params.partOffStartX = Math.round(Math.max(rx, lower + 0.01) * 100) / 100;
    }
  }

  // Hit-test na přímé segmenty (G0/G1) kontury nebo stock polyline.
  // Vrátí {idx1, idx2, isStock} nebo null. Ignoruje oblouky.
  function getContourSegmentAt(clientX, clientY) {
    if (!S.pointDragEnabled || S.simRunning) return null;
    const calc = S._cachedCalc; if (!calc) return null;
    const rect = canvas.getBoundingClientRect();
    const mx = clientX - rect.left, my = clientY - rect.top;
    const vS = S.flipX ? 1 : -1; const hS = S.flipZ ? -1 : 1;
    const toScreen = (x, z) => {
      if (S.params.machineStructure === 'carousel') return { x: S.view.panX + hS * x * S.view.scale, y: S.view.panY + vS * z * S.view.scale };
      return { x: S.view.panX + hS * z * S.view.scale, y: S.view.panY + vS * x * S.view.scale };
    };
    const distToSeg = (px, py, ax, ay, bx, by) => {
      const dx = bx - ax, dy = by - ay;
      const L2 = dx * dx + dy * dy;
      let t = L2 ? ((px - ax) * dx + (py - ay) * dy) / L2 : 0;
      t = Math.max(0, Math.min(1, t));
      return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
    };
    let best = null, minD = Infinity;
    const scanPts = (pts, isStock) => {
      if (!pts || pts.length < 2) return;
      for (let i = 0; i < pts.length - 1; i++) {
        const p2 = pts[i + 1];
        if (p2.type === 'G2' || p2.type === 'G3') continue;
        const a = toScreen(pts[i].xReal, pts[i].zReal);
        const b = toScreen(p2.xReal, p2.zReal);
        const d = distToSeg(mx, my, a.x, a.y, b.x, b.y);
        const dA = Math.hypot(a.x - mx, a.y - my), dB = Math.hypot(b.x - mx, b.y - my);
        if (d < 8 && d < minD && dA > 12 && dB > 12) {
          minD = d; best = { idx1: i, idx2: i + 1, isStock };
        }
      }
    };
    scanPts(calc.worldPoints, false);
    if (S.params.stockMode !== 'cylinder') scanPts(calc.stockWorldPoints, true);
    return best;
  }

  // Převod kliknutí (client souřadnice) na world souřadnice (X = rádius).
  function clientToWorldCam(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const sx = clientX - rect.left, sy = clientY - rect.top;
    const vS = S.flipX ? 1 : -1; const hS = S.flipZ ? -1 : 1;
    if (S.params.machineStructure === 'carousel') {
      return { wx: hS * (sx - S.view.panX) / S.view.scale, wz: vS * (sy - S.view.panY) / S.view.scale };
    }
    return { wx: vS * (sy - S.view.panY) / S.view.scale, wz: hS * (sx - S.view.panX) / S.view.scale };
  }

  // Najde nejbližší obloukový segment (G2/G3) kontury nebo polotovaru pod
  // kurzorem — pro "+" mód (tečná úsečka pod úhlem z oblouku, CAM obdoba
  // CAD nástroje „Úhel"). Vrací index KONCOVÉHO bodu segmentu.
  function getArcSegmentAt(clientX, clientY) {
    if (S.simRunning) return null;
    const calc = S._cachedCalc; if (!calc) return null;
    const { wx, wz } = clientToWorldCam(clientX, clientY);
    const tol = 10 / S.view.scale;
    let best = null, bestD = Infinity;
    const scan = (pts, isStock) => {
      if (!pts) return;
      for (let i = 1; i < pts.length; i++) {
        const p2 = pts[i];
        if (p2.type !== 'G2' && p2.type !== 'G3') continue;
        const p1 = pts[i - 1];
        const arc = getArcParams({ x: p1.xReal, z: p1.zReal }, { x: p2.xReal, z: p2.zReal }, p2.rVal, p2.type);
        if (arc.error) continue;
        const d = Math.abs(Math.hypot(wx - arc.cx, wz - arc.cz) - arc.r);
        if (d > tol || d >= bestD) continue;
        const ang = Math.atan2(wx - arc.cx, wz - arc.cz);
        const sA = Math.atan2(p1.xReal - arc.cx, p1.zReal - arc.cz);
        const eA = Math.atan2(p2.xReal - arc.cx, p2.zReal - arc.cz);
        if (!isAngleBetween(ang, sA, eA, p2.type === 'G2')) continue;
        bestD = d;
        best = { idx: i, isStock, wx, wz };
      }
    };
    scan(calc.worldPoints, false);
    if (S.params.stockMode !== 'cylinder') scan(calc.stockWorldPoints, true);
    return best;
  }

  // Vrátí klíč Z-limity ('chuck' | 'tail' | 'rangeStart' | 'rangeEnd') pod kurzorem, jinak null.
  function getZLimitAt(clientX, clientY) {
    if (S.simRunning || !S.showZLimits || S.showZLimits === 'off') return null;
    const rect = canvas.getBoundingClientRect();
    const mx = clientX - rect.left, my = clientY - rect.top;
    const prms = S.params;
    const vS = S.flipX ? 1 : -1; const hS = S.flipZ ? -1 : 1;
    const toScreen = (x, z) => {
      if (prms.machineStructure === 'carousel') return { x: S.view.panX + hS * x * S.view.scale, y: S.view.panY + vS * z * S.view.scale };
      return { x: S.view.panX + hS * z * S.view.scale, y: S.view.panY + vS * x * S.view.scale };
    };
    const isKarusel = prms.machineStructure === 'carousel';
    let bestKey = null, bestD = 8; // tolerance v pixelech
    // Drag-target jen pro zaškrtnuté (viditelné) čáry.
    const visibleKeys = [];
    if (S.zLimits.chuckActive)  visibleKeys.push('chuck');
    if (S.zLimits.tailActive)   visibleKeys.push('tail');
    if (S.zLimits.rangeActive)  visibleKeys.push('rangeStart', 'rangeEnd');
    for (const key of visibleKeys) {
      const z = S.zLimits[key];
      if (z === null || z === undefined || isNaN(z)) continue;
      const d = isKarusel ? Math.abs(toScreen(0, z).y - my) : Math.abs(toScreen(0, z).x - mx);
      if (d < bestD) { bestD = d; bestKey = key; }
    }
    return bestKey;
  }

  // Vrátí klíč X-limitu ('rangeXMin' | 'rangeXMax') pod kurzorem, jinak null.
  function getXLimitAt(clientX, clientY) {
    if (S.simRunning || !S.showZLimits || S.showZLimits === 'off') return null;
    if (!xRangeAnyOn(S.xLimits)) return null; // čáry nejsou viditelné — nelze tahat
    const rect = canvas.getBoundingClientRect();
    const mx = clientX - rect.left, my = clientY - rect.top;
    const prms = S.params;
    const vS = S.flipX ? 1 : -1; const hS = S.flipZ ? -1 : 1;
    const toScreen = (x, z) => {
      if (prms.machineStructure === 'carousel') return { x: S.view.panX + hS * x * S.view.scale, y: S.view.panY + vS * z * S.view.scale };
      return { x: S.view.panX + hS * z * S.view.scale, y: S.view.panY + vS * x * S.view.scale };
    };
    const isKarusel = prms.machineStructure === 'carousel';
    let bestKey = null, bestD = 8;
    for (const [key, x, which] of [['rangeXMin', S.xLimits.rangeXMin, 'min'], ['rangeXMax', S.xLimits.rangeXMax, 'max']]) {
      if (x === null || x === undefined || isNaN(x) || !xBoundOn(S.xLimits, which)) continue;
      const d = isKarusel ? Math.abs(toScreen(x, 0).x - mx) : Math.abs(toScreen(x, 0).y - my);
      if (d < bestD) { bestD = d; bestKey = key; }
    }
    return bestKey;
  }
  return { getAnyPointAt, getPartOffHandleAt, _partOffRadiusFromClient, _applyPartOffHandle,
    getContourSegmentAt, clientToWorldCam, getArcSegmentAt, getZLimitAt, getXLimitAt };
}
