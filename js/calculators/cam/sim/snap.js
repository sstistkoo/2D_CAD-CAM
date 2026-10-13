// SNAP v CAM simulátoru (jako v CAD): přichytávání kurzoru k bodům a hranám
// kontury, polotovaru, drah a konstrukčních čar; přichytávání tažené mezní
// čáry (rozsah 📐, čelisti, koník) a úhlový snap. Vyňato z camSimulator.js
// (bloky „SNAP (jako v CAD)" a „SNAP MEZNÍCH ČAR", docs/plan-rozdeleni-
// cam-simulatoru.md) — stav simulátoru a jeho funkce se předávají parametrem.
import { stockClearances, isAngleBetween, segPairIntersections } from '../camMath.js';
import { stockPlanLoop } from '../materialRemoval.js';

/**
 * @param ctx { S, canvas, _gToWorld, getGNodes, getAllGuideLines, getGuideOffsetLines }
 * @returns {{ getStockPlanOutline, camSnap, snapLimitValue, snapWorld }}
 */
export function createSnap({ S, canvas, _gToWorld, getGNodes, getAllGuideLines, getGuideOffsetLines }) {
  // přichytávání k bodům a hranám kontury/polotovaru.
  function _nearestOnCamLine(wx, wz, x1, z1, x2, z2) {
    const dx = x2 - x1, dz = z2 - z1;
    const L2 = dx * dx + dz * dz;
    let t = L2 ? ((wx - x1) * dx + (wz - z1) * dz) / L2 : 0;
    t = Math.max(0, Math.min(1, t));
    return { x: x1 + t * dx, z: z1 + t * dz };
  }
  // Obrys, na kterém končí rychloposuv („tečkovaná“ čára v náhledu): povrch
  // polotovaru posunutý o Vůli X (radiálně) a Vůli Z (axiálně). JEDEN zdroj
  // pro KRESLENÍ i pro SNAP — kdyby si to každý počítal sám, mohl by náhled
  // ukazovat jinou čáru, než na kterou se přichytává (a než se kterou
  // plánují dráhy: `stockPlanLoop` je týž helper, co stojí za `planLoopRef`
  // v gcodeEmit.js).
  //
  // Vrací body smyčky; ZAVŘENÍ řeší volající — u válce je to otevřená
  // polylinie od osy k ose, u odlitku uzavřená smyčka.
  function getStockPlanOutline(calc) {
    const prms = S.params;
    if (prms.stockMode === 'cylinder') {
      const clr = stockClearances(prms);
      const sRad = (parseFloat(prms.stockDiameter) || 0) / 2;
      // Žádný polotovar — žádná čára. Bez téhle kontroly by při průměru 0 vyšel
      // offset o pouhé Vůli X a v náhledu se kreslil fantom kolem ničeho.
      if (!(sRad > 0)) return [];
      const bRad = sRad + clr.x;
      const bFace = (parseFloat(prms.stockFace) || 0) + clr.z;
      const bLen = (parseFloat(prms.stockLength) || 0) + clr.z;
      return [{ x: 0, z: bFace }, { x: bRad, z: bFace },
        { x: bRad, z: -bLen }, { x: 0, z: -bLen }];
    }
    if (!calc || !(calc.stockPathSegments || []).length) return [];
    return stockPlanLoop(prms, calc.stockPathSegments) || [];
  }
  /** Úsečky téhož obrysu — pro SNAP na hranu. U válce se úsek po ose
   *  vynechává, stejně jako se nekreslí. */
  function getStockPlanSegs(calc) {
    const pts = getStockPlanOutline(calc);
    if (pts.length < 2) return [];
    const closed = S.params.stockMode !== 'cylinder';
    const n = closed ? pts.length : pts.length - 1;
    const out = [];
    for (let i = 0; i < n; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      out.push({ type: 'line', p1: { x: a.x, z: a.z }, p2: { x: b.x, z: b.z } });
    }
    return out;
  }
  // Vrátí {x,z,type:'point'|'edge'} nebo null. Body: počátek, vrcholy kontury
  // i polotovaru, středy oblouků, středy úseček (přednost). Hrany: nejbližší
  // bod na úsečce/oblouku.
  function camSnap(clientX, clientY) {
    if (!S.snapEnabled || S.simRunning) return null;
    const calc = S._cachedCalc; if (!calc) return null;
    const rect = canvas.getBoundingClientRect();
    const w = _gToWorld(clientX - rect.left, clientY - rect.top);
    const wx = w.x, wz = w.z;
    const ptThr = 18 / S.view.scale;
    const edgeThr = 10 / S.view.scale;
    let best = null, bestD = Infinity;
    const tryPt = (x, z) => {
      if (x == null || z == null) return;
      const d = Math.hypot(x - wx, z - wz);
      if (d < ptThr && d < bestD) { bestD = d; best = { x, z, type: 'point' }; }
    };
    tryPt(0, 0);
    (calc.worldPoints || []).forEach(p => tryPt(p.xReal, p.zReal));
    (calc.stockWorldPoints || []).forEach(p => tryPt(p.xReal, p.zReal));
    // Uzly drah (koncové body pohybů G-kódu) – jen v režimu úpravy drah,
    // kdy jsou viditelné a tažitelné.
    // KONCE DRAH (uzly G-kódu). Dřív jen v režimu úpravy drah — jenže ukázat
    // na konec dráhy („sem to má dojet“) je potřeba i mimo něj; bez toho snap
    // sebral nejbližší bod POLOTOVARU (nález uživatele 31. 8. 2026).
    getGNodes().forEach(n => tryPt(n.x, n.z));
    // Vrcholy offsetové čáry POLOTOVARU (kam dojede rychloposuv).
    getStockPlanOutline(calc).forEach(q => tryPt(q.x, q.z));
    // Konstrukční / pomocné čáry + jejich offsetové čáry (dráha středu plátku)
    // – koncové body (tečné body, průsečíky) jsou snapovatelné jako úsečky.
    const guides = getAllGuideLines().map(g => ({ type: 'line', p1: { x: g.x1, z: g.z1 }, p2: { x: g.x2, z: g.z2 } }));
    const guideOffsets = getGuideOffsetLines();
    const allGuideSegs = [...guides, ...guideOffsets];
    for (const g of allGuideSegs) { tryPt(g.p1.x, g.p1.z); tryPt(g.p2.x, g.p2.z); }
    // Středy oblouků / úseček – kontura, polotovar, konstrukční + offsetové čáry.
    const baseSegs = [...(calc.contourSegments || []), ...(calc.stockPathSegments || []), ...allGuideSegs].filter(s => s && !s.isDegenerate);
    for (const s of baseSegs) {
      if (s.type === 'arc') tryPt(s.cx, s.cz);
      else if (s.p1 && s.p2) tryPt((s.p1.x + s.p2.x) / 2, (s.p1.z + s.p2.z) / 2);
    }
    // Průsečíky čar (kontura × offset × konstrukční čára × offset konstrukční
    // čáry) — snap na bod, kde se dvě čáry kříží, ne jen na konce/středy.
    const interSegs = [
      ...baseSegs,
      ...(calc.offsetPath || []),
      ...(calc.finishOffsetPath || []),
      ...(calc.finishRefPath || []),
      ...(calc.finishUnreachablePath || [])
    ].filter(s => s && !s.isDegenerate);
    for (let ii = 0; ii < interSegs.length; ii++)
      for (let jj = ii + 1; jj < interSegs.length; jj++)
        for (const q of segPairIntersections(interSegs[ii], interSegs[jj])) tryPt(q.x, q.z);
    if (best) return best;   // body mají přednost před hranami
    // Hrany: kontura + polotovar + konstrukční čáry + offsetové dráhy.
    const segs = [...baseSegs, ...getStockPlanSegs(calc), ...(calc.offsetPath || []), ...(calc.finishOffsetPath || []), ...(calc.finishRefPath || []), ...(calc.finishUnreachablePath || [])].filter(s => s && !s.isDegenerate);
    for (const s of segs) {
      let px, pz, dist;
      if (s.type === 'line') {
        if (!s.p1 || !s.p2) continue;
        const np = _nearestOnCamLine(wx, wz, s.p1.x, s.p1.z, s.p2.x, s.p2.z);
        px = np.x; pz = np.z; dist = Math.hypot(wx - px, wz - pz);
      } else if (s.type === 'arc') {
        const dx = wx - s.cx, dz = wz - s.cz;
        const d = Math.hypot(dx, dz);
        if (d < 1e-9) continue;
        const a = Math.atan2(dx, dz);   // CAM: x = cx+sin(a)·r, z = cz+cos(a)·r
        if (isAngleBetween(a, s.startAngle, s.endAngle, s.dir === 'G2')) {
          px = s.cx + Math.sin(a) * s.r; pz = s.cz + Math.cos(a) * s.r; dist = Math.abs(d - s.r);
        } else {
          const e1 = { x: s.cx + Math.sin(s.startAngle) * s.r, z: s.cz + Math.cos(s.startAngle) * s.r };
          const e2 = { x: s.cx + Math.sin(s.endAngle) * s.r, z: s.cz + Math.cos(s.endAngle) * s.r };
          const d1 = Math.hypot(wx - e1.x, wz - e1.z), d2 = Math.hypot(wx - e2.x, wz - e2.z);
          if (d1 < d2) { px = e1.x; pz = e1.z; dist = d1; } else { px = e2.x; pz = e2.z; dist = d2; }
        }
      } else continue;
      if (dist < edgeThr && dist < bestD) { bestD = dist; best = { x: px, z: pz, type: 'edge' }; }
    }
    return best;
  }
  // ── SNAP MEZNÍCH ČAR (rozsah 📐, čelisti, koník) ──────────────────────
  // Body, na které se mezní čára smí chytit: táž nabídka jako v camSnap
  // (počátek, vrcholy kontury i polotovaru, konce a středy úseček, středy
  // oblouků a vrcholy jejich výseku, konce konstrukčních čar). Průsečíky se
  // sem záměrně neberou — čára se chytá jen JEDNOU souřadnicí, takže by
  // nabídku jen zahustily o polohy, které v ní stejně už jsou.
  function limitSnapPoints() {
    const calc = S._cachedCalc;
    if (!calc) return [];
    const pts = [{ x: 0, z: 0 }];
    (calc.worldPoints || []).forEach(p => pts.push({ x: p.xReal, z: p.zReal }));
    (calc.stockWorldPoints || []).forEach(p => pts.push({ x: p.xReal, z: p.zReal }));
    const guides = getAllGuideLines().map(g => ({ type: 'line', p1: { x: g.x1, z: g.z1 }, p2: { x: g.x2, z: g.z2 } }));
    const segs = [...(calc.contourSegments || []), ...(calc.stockPathSegments || []),
      ...guides, ...getGuideOffsetLines()].filter(s => s && !s.isDegenerate);
    for (const s of segs) {
      if (s.type === 'arc') {
        pts.push({ x: s.cx, z: s.cz });
        const onArc = (a) => pts.push({ x: s.cx + Math.sin(a) * s.r, z: s.cz + Math.cos(a) * s.r });
        onArc(s.startAngle); onArc(s.endAngle);
        // Vrcholy výseku (nejzazší X a Z oblouku) – tam mez typicky patří.
        for (const a of [0, Math.PI / 2, Math.PI, -Math.PI / 2])
          if (isAngleBetween(a, s.startAngle, s.endAngle, s.dir === 'G2')) onArc(a);
      } else if (s.p1 && s.p2) {
        pts.push({ x: s.p1.x, z: s.p1.z }, { x: s.p2.x, z: s.p2.z },
          { x: (s.p1.x + s.p2.x) / 2, z: (s.p1.z + s.p2.z) / 2 });
      }
    }
    return pts;
  }
  // Přichycení tažené mezní čáry (axis 'z' = svislá čára Z, 'x' = vodorovná
  // čára X). Čára je nekonečná přímka, ale chytá se jako v CAD: bod musí být
  // u KURZORU, ne kdekoli na čáře. Platí proto DVĚ podmínky:
  //   • v ose tažení do 10 px (tam čára na bod dosedne — jako hrany v camSnap),
  //   • KOLMO na ni do 18 px od kurzoru (táž tolerance jako body v camSnap).
  // Bez té druhé se čára chytala na každý bod se správnou souřadnicí — táhls
  // s ní dole a skočila na bod úplně nahoře (nález uživatele 26. 8. 2026).
  // Ve shluku (rozdíl v ose do 1 px) vyhraje bod blíž ke kurzoru.
  // Vrací hodnotu, nebo null (nic v dosahu).
  function snapLimitValue(axis, raw, clientX, clientY) {
    S._snap = null;
    if (!S.snapEnabled || S.simRunning || !S._cachedCalc) return null;
    const rect = canvas.getBoundingClientRect();
    const cur = _gToWorld(clientX - rect.left, clientY - rect.top);
    const tol = 10 / S.view.scale;            // v ose tažení
    const perp = 18 / S.view.scale;           // kolmo ke kurzoru
    const cands = [];
    for (const p of limitSnapPoints()) {
      const v = axis === 'x' ? p.x : p.z;
      if (v == null || !isFinite(v)) continue;
      const d = Math.abs(v - raw);
      if (d > tol) continue;
      const other = Math.abs((axis === 'x' ? p.z : p.x) - (axis === 'x' ? cur.z : cur.x));
      if (other > perp) continue;             // bod je jinde na čáře, ne u kurzoru
      cands.push({ p, d, other });
    }
    if (cands.length === 0) return null;
    const tie = 1 / S.view.scale;             // rozdíl do 1 px = „stejně blízko"
    cands.sort((a, b) => (Math.round(a.d / tie) - Math.round(b.d / tie)) || (a.other - b.other));
    const best = cands[0].p;
    S._snap = { x: best.x, z: best.z, type: 'point' };   // indikátor + popisek
    return Math.round((axis === 'x' ? best.x : best.z) * 1000) / 1000;
  }
  // Úhlový snap (jako v CAD): přichytí směr ref→bod na násobek 90°
  // (vodorovně/kolmo) s tolerancí ±1°, projekcí na úhlovou přímku.
  const ANGLE_SNAP_TOL = 1 * Math.PI / 180;
  function applyCamAngleSnap(p, ref) {
    if (!ref) return p;
    const dx = p.x - ref.x, dz = p.z - ref.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 1e-9) return p;
    const angle = Math.atan2(dx, dz);            // x=sin, z=cos
    const step = Math.PI / 2;                    // 90° = vodorovnost/kolmost
    const snapped = Math.round(angle / step) * step;
    if (Math.abs(angle - snapped) > ANGLE_SNAP_TOL) return p;
    const dirx = Math.sin(snapped), dirz = Math.cos(snapped);
    const proj = dx * dirx + dz * dirz;
    return { x: ref.x + proj * dirx, z: ref.z + proj * dirz, _angle: true };
  }
  // Snapnutá světová pozice (uloží i indikátor S._snap), jinak raw.
  // refPoint (volitelný) zapne úhlový snap, když není snap k bodu/hraně.
  function snapWorld(clientX, clientY, refPoint) {
    const rect = canvas.getBoundingClientRect();
    const raw = _gToWorld(clientX - rect.left, clientY - rect.top);
    const snap = camSnap(clientX, clientY);
    if (snap) { S._snap = snap; S._angleSnapLine = null; return { x: snap.x, z: snap.z }; }
    S._snap = null;
    if (S.snapEnabled && refPoint) {
      const a = applyCamAngleSnap(raw, refPoint);
      if (a._angle) { S._angleSnapLine = { from: refPoint, to: { x: a.x, z: a.z } }; return { x: a.x, z: a.z }; }
    }
    S._angleSnapLine = null;
    return raw;
  }
  return { getStockPlanOutline, camSnap, snapLimitValue, snapWorld };
}
