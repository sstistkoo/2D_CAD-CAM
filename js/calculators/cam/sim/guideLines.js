// Konstrukční čáry v CAM simulátoru: ruční (S.guideLines) + automatické
// mezní čáry, jejich offset o rádius plátku, ⊢ Prodl / ⊣ Ořez uzlu dráhy
// i konce čáry, hit-testy čar a vložení bodu kontury na konec čáry.
// Vyňato z camSimulator.js (část bývalého bloku „SNAP MEZNÍCH ČAR",
// docs/plan-rozdeleni-cam-simulatoru.md) — stav simulátoru a jeho funkce se
// předávají parametrem.
import { showToast } from '../../../state.js';
import { getNormal, intersectLineCircle, isAngleBetween, getArcParams } from '../camMath.js';
import { guidePolyPoints } from '../interferenceGuides.js';

/**
 * @param ctx { S, pushHistory, writeGLine, saveState, renderTab, updateUndoRedoBtns,
 *              draw, clientToWorldCam, fullUpdate }
 */
export function createGuideLines({ S, pushHistory, writeGLine, saveState, renderTab, updateUndoRedoBtns, draw, clientToWorldCam, fullUpdate }) {
  // camRayIntersection() je nyní modulová funkce (viz výše u buildMachinableContour) —
  // uvnitř openCamSimulator se volá s S._cachedCalc jako posledním argumentem.

  // Všechny pomocné čáry: ruční (S.guideLines) + automatické mezní
  // čáry hran destičky z posledního výpočtu.
  function getAllGuideLines() {
    return [...(S.guideLines || []), ...((S._cachedCalc && S._cachedCalc.interferenceGuides) || [])];
  }

  // Offsetové (společné) čáry konstrukčních čar – posunuté o rádius plátku
  // na stranu vzduchu (+X); kam dojede STŘED plátku. Vrací snapovatelné
  // úsečky {type:'line', p1, p2} (prázdné, je-li rádius 0).
  function getGuideOffsetLines() {
    const prm = S.params || {};
    const tipROff = parseFloat(prm.toolRadius) || 0;
    if (tipROff <= 0) return [];
    // Dva offsety jako u kontury: dokončovací = jen R, hrubovací =
    // R + Přídavek X/Z + Přídavek na hotovo (po složkách normály).
    const aX = parseFloat(prm.allowanceX) || 0;
    const aZ = parseFloat(prm.allowanceZ) || 0;
    const fin = parseFloat(prm.finishAllowance) || 0;
    const hasRough = aX > 1e-9 || aZ > 1e-9 || fin > 1e-9;
    const out = [];
    for (const g of getAllGuideLines()) {
      // Napojená podoba z výpočtu má přednost — SNAP tak nabízí přesně ty
      // body, kde offset mezní čáry navazuje na okolní offsetové čáry
      // (guideOffsetJoin.js). Kreslení i SNAP tím čtou jednu geometrii.
      // `offRough` je hrubovací offset (bez přídavků zároveň hotovní),
      // `offFinish` hotovní reference. Co je napojené, kolmý dopočet
      // už nepotřebuje.
      const roughKind = hasRough ? 'rough' : 'finish';
      if (g.offRough) out.push({ type: 'line', kind: roughKind, p1: { ...g.offRough.p1 }, p2: { ...g.offRough.p2 } });
      if (g.offFinish) out.push({ type: 'line', kind: 'finish', p1: { ...g.offFinish.p1 }, p2: { ...g.offFinish.p2 } });
      const needRough = !g.offRough;
      const needFinish = hasRough && !g.offFinish;
      if (!needRough && !needFinish) continue;
      // Po úsecích — lomené (via) čáry z hlídání držáku mají offset za segment.
      const pts = guidePolyPoints(g);
      for (let k = 0; k + 1 < pts.length; k++) {
        const a = pts[k], b = pts[k + 1];
        let n = getNormal(a, b);
        if (n.x < 0 || (Math.abs(n.x) < 1e-9 && n.z < 0)) n = { x: -n.x, z: -n.z };
        if (needRough) {
          const dxR = n.x * (tipROff + (hasRough ? aX + fin : 0));
          const dzR = n.z * (tipROff + (hasRough ? aZ + fin : 0));
          out.push({ type: 'line', kind: roughKind,
            p1: { x: a.x + dxR, z: a.z + dzR },
            p2: { x: b.x + dxR, z: b.z + dzR } });
        }
        if (needFinish) {
          out.push({ type: 'line', kind: 'finish',
            p1: { x: a.x + n.x * tipROff, z: a.z + n.z * tipROff },
            p2: { x: b.x + n.x * tipROff, z: b.z + n.z * tipROff } });
        }
      }
    }
    return out;
  }

  // Nejbližší průsečík paprsku (sx,sz)+t·(dirX,dirZ), t>0, s geometrií:
  // kontura + offset + dokončovací dráha + konstrukční (pomocné) čáry.
  // Pro prodloužení (paprsek vpřed) i oříznutí (paprsek vzad).
  function nearestPathHit(sx, sz, dirX, dirZ) {
    const calc = S._cachedCalc; if (!calc) return null;
    let best = null, bestT = Infinity;
    const A1 = { x: sx, z: sz };
    const far = { x: sx + dirX * 1e5, z: sz + dirZ * 1e5 };
    const consider = (px, pz) => {
      const t = (px - sx) * dirX + (pz - sz) * dirZ;     // vzdálenost podél paprsku
      if (t > 0.05 && t < bestT) { bestT = t; best = { x: px, z: pz }; }
    };
    const lineHit = (B1, B2) => {
      if (!B1 || !B2) return;
      const d = (A1.x - far.x) * (B1.z - B2.z) - (A1.z - far.z) * (B1.x - B2.x);
      if (Math.abs(d) < 1e-12) return;
      const u = ((A1.x - B1.x) * (A1.z - far.z) - (A1.z - B1.z) * (A1.x - far.x)) / d;
      if (u < -0.001 || u > 1.001) return;               // mimo cílovou úsečku
      const t = ((A1.x - B1.x) * (B1.z - B2.z) - (A1.z - B1.z) * (B1.x - B2.x)) / d;
      consider(A1.x + t * (far.x - A1.x), A1.z + t * (far.z - A1.z));
    };
    const arcHit = (seg) => {
      const hits = intersectLineCircle(A1, far, { x: seg.cx, z: seg.cz }, seg.r);
      if (!hits) return;
      for (const q of hits) {
        const ang = Math.atan2(q.x - seg.cx, q.z - seg.cz);
        if (isAngleBetween(ang, seg.startAngle, seg.endAngle, seg.dir === 'G2')) consider(q.x, q.z);
      }
    };
    const segs = [...(calc.contourSegments || []), ...(calc.offsetPath || []), ...(calc.finishOffsetPath || []), ...(calc.finishRefPath || []), ...(calc.finishUnreachablePath || [])];
    for (const s of segs) {
      if (!s || s.isDegenerate) continue;
      if (s.type === 'line') lineHit(s.p1, s.p2);
      else if (s.type === 'arc') arcHit(s);
    }
    for (const g of getAllGuideLines()) {
      const pts = guidePolyPoints(g);
      for (let k = 0; k + 1 < pts.length; k++) lineHit(pts[k], pts[k + 1]);
    }
    return best;
  }

  // Prodloužení (sign=+1) / oříznutí (sign=−1) úsečkového pohybu (G0/G1):
  // z koncového bodu vyšle paprsek ve směru pohybu (vpřed/vzad) a posune
  // koncový bod na nejbližší průsečík → přepíše X/Z příslušného řádku.
  function extendTrimNode(node, sign) {
    const calc = S._cachedCalc; if (!calc || !calc.simPath) return;
    if (node.type !== 'G0' && node.type !== 'G1') { showToast('Prodloužit/oříznout jde jen u úseček (G0/G1)'); return; }
    if (node.simIdx <= 0) { showToast('Pohyb nemá počátek'); return; }
    const p1 = calc.simPath[node.simIdx - 1];
    let dx = node.x - p1.x, dz = node.z - p1.z;
    const len = Math.hypot(dx, dz);
    if (len < 1e-6) { showToast('Nulová délka pohybu'); return; }
    dx /= len; dz /= len;
    const hit = nearestPathHit(node.x, node.z, sign * dx, sign * dz);
    if (!hit) { showToast(sign > 0 ? 'Žádný průsečík pro prodloužení' : 'Žádný průsečík pro oříznutí'); return; }
    pushHistory();
    writeGLine(node.lineIdx, hit.x, hit.z);
    showToast(sign > 0 ? 'Dráha prodloužena k průsečíku ✓' : 'Dráha oříznuta k průsečíku ✓');
  }

  // Cílový bod pro prodloužení (sign=+1) / oříznutí (sign=−1) konce
  // konstrukční čáry g: konec endIdx se posouvá PO (nekonečné) čáře
  // k nejbližšímu průsečíku s geometrií — ven od kotvy (prodloužit) nebo
  // zpět ke kotvě (oříznout). Kotva = druhý konec. Vrací {x,z} nebo null.
  function guideExtendTrimTarget(g, endIdx, sign) {
    const ax = endIdx === 0 ? g.x2 : g.x1;
    const az = endIdx === 0 ? g.z2 : g.z1;
    const ex = endIdx === 0 ? g.x1 : g.x2;
    const ez = endIdx === 0 ? g.z1 : g.z2;
    let dx = ex - ax, dz = ez - az;
    const L = Math.hypot(dx, dz);
    if (L < 1e-6) return null;
    dx /= L; dz /= L;
    const tEnd = (ex - ax) * dx + (ez - az) * dz;   // = L, parametr aktuálního konce
    let best = null, bestGap = Infinity;
    for (const h of lineGeometryHits(ax, az, dx, dz)) {
      const t = (h.x - ax) * dx + (h.z - az) * dz;
      if (sign > 0) {
        if (t > tEnd + 0.05 && (t - tEnd) < bestGap) { bestGap = t - tEnd; best = h; }
      } else {
        if (t < tEnd - 0.05 && t > 0.05 && (tEnd - t) < bestGap) { bestGap = tEnd - t; best = h; }
      }
    }
    return best;
  }

  // Prodloužit/oříznout konstrukční čáru kliknutím (clientX/Y, sign ±1):
  //  • uživatelská čára (S.guideLines) — konec nebo tělo → posune se konec.
  //  • automatická mezní čára (interferenceGuides) — PŘEVEDE se na trvalou
  //    uživatelskou (nekonečnou, editovatelnou) čáru a hned se prodlouží.
  function extendTrimGuideClick(clientX, clientY, sign) {
    const gEnd = getUserGuideEndForAction(clientX, clientY);
    const auto = gEnd ? null : findAutoGuideForAction(clientX, clientY);
    if (!gEnd && !auto) { showToast('Klikněte na koncový bod nebo na konstrukční čáru'); return; }

    const baseG = gEnd ? S.guideLines[gEnd.guideIdx]
                       : { x1: auto.x1, z1: auto.z1, x2: auto.x2, z2: auto.z2 };
    const endIdx = gEnd ? gEnd.endIdx : auto.endIdx;
    const target = guideExtendTrimTarget(baseG, endIdx, sign);

    // Existující čára bez průsečíku → nic neměnit, jen informovat.
    if (!target && !auto) {
      showToast(sign > 0 ? 'Žádný průsečík pro prodloužení' : 'Žádný průsečík pro oříznutí');
      return;
    }

    pushHistory();
    let g = baseG;
    if (auto) {                       // převést mezní čáru na uživatelskou
      if (!S.guideLines) S.guideLines = [];
      // fromInsert: true → auto-smazání při změně parametrů destičky
      g = { x1: auto.x1, z1: auto.z1, x2: auto.x2, z2: auto.z2, fromInsert: true };
      S.guideLines.push(g);
    }
    if (target) {
      if (endIdx === 0) { g.x1 = target.x; g.z1 = target.z; }
      else { g.x2 = target.x; g.z2 = target.z; }
    }
    saveState(); renderTab(); updateUndoRedoBtns(); draw();
    if (target) showToast(sign > 0 ? 'Konstrukční čára prodloužena ✓' : 'Konstrukční čára oříznuta ✓');
    else showToast('Mezní čára převedena na konstrukční (nekonečnou) čáru ✓');
  }

  // Index RUČNÍ pomocné čáry (S.guideLines) pod kurzorem — klik na čáru
  // nebo její koncový bod. Automatické mezní čáry mazat nejdou (počítají
  // se znovu při každé změně), proto se tu neuvažují.
  function getUserGuideAt(clientX, clientY) {
    if (!S.guideLines || S.guideLines.length === 0) return null;
    const { wx, wz } = clientToWorldCam(clientX, clientY);
    const tol = 10 / S.view.scale;
    for (let i = S.guideLines.length - 1; i >= 0; i--) {
      const g = S.guideLines[i];
      const dx = g.x2 - g.x1, dz = g.z2 - g.z1;
      const len2 = dx * dx + dz * dz;
      let d;
      if (len2 < 1e-12) {
        d = Math.hypot(wx - g.x1, wz - g.z1);
      } else {
        let t = ((wx - g.x1) * dx + (wz - g.z1) * dz) / len2;
        t = Math.max(0, Math.min(1, t));
        d = Math.hypot(g.x1 + t * dx - wx, g.z1 + t * dz - wz);
      }
      if (d < tol) return i;
    }
    return null;
  }

  // Koncový bod pomocné čáry (tečný bod / průsečík) poblíž kurzoru.
  function getGuideEndpointAt(clientX, clientY) {
    const guides = getAllGuideLines();
    if (guides.length === 0) return null;
    const { wx, wz } = clientToWorldCam(clientX, clientY);
    const tol = 12 / S.view.scale;
    let best = null, bestD = tol;
    guides.forEach(g => {
      for (const q of [{ x: g.x1, z: g.z1 }, { x: g.x2, z: g.z2 }]) {
        const d = Math.hypot(q.x - wx, q.z - wz);
        if (d < bestD) { bestD = d; best = q; }
      }
    });
    return best;
  }

  // Uchopený koncový bod UŽIVATELSKÉ konstrukční čáry (S.guideLines) —
  // vrací {guideIdx, endIdx 0/1}. Auto čáry se needitují.
  function getUserGuideEndAt(clientX, clientY) {
    if (!S.guideLines || !S.guideLines.length) return null;
    const { wx, wz } = clientToWorldCam(clientX, clientY);
    const tol = 14 / S.view.scale;
    let best = null, bestD = tol;
    S.guideLines.forEach((g, gi) => {
      [[g.x1, g.z1, 0], [g.x2, g.z2, 1]].forEach(([x, z, ei]) => {
        const d = Math.hypot(x - wx, z - wz);
        if (d < bestD) { bestD = d; best = { guideIdx: gi, endIdx: ei }; }
      });
    });
    return best;
  }

  // Cíl pro Prodl/Ořez na konstrukční čáře: nejdřív přesný koncový bod,
  // jinak klik kamkoli na (nekonečné) tělo UŽIVATELSKÉ čáry → vybere se
  // konec bližší ke kliknutí. Vrací {guideIdx, endIdx} nebo null.
  function getUserGuideEndForAction(clientX, clientY) {
    const exact = getUserGuideEndAt(clientX, clientY);
    if (exact) return exact;
    if (!S.guideLines || !S.guideLines.length) return null;
    const { wx, wz } = clientToWorldCam(clientX, clientY);
    const tol = 10 / S.view.scale;
    let best = null, bestD = tol;
    S.guideLines.forEach((g, gi) => {
      let dx = g.x2 - g.x1, dz = g.z2 - g.z1;
      const L = Math.hypot(dx, dz);
      if (L < 1e-9) return;
      dx /= L; dz /= L;
      // kolmá vzdálenost ke (nekonečné) přímce
      const perp = Math.abs((wx - g.x1) * dz - (wz - g.z1) * dx);
      if (perp < bestD) {
        bestD = perp;
        const d1 = Math.hypot(g.x1 - wx, g.z1 - wz);
        const d2 = Math.hypot(g.x2 - wx, g.z2 - wz);
        best = { guideIdx: gi, endIdx: d1 <= d2 ? 0 : 1 };
      }
    });
    return best;
  }

  // Najde AUTOMATICKOU mezní čáru poblíž kliknutí (konec nebo tělo) pro
  // převod na uživatelskou. Vrací {x1,z1,x2,z2,endIdx} (endIdx = konec bližší
  // ke kliknutí) nebo null. Auto čáry jsou KONEČNÉ úsečky → projekce musí
  // ležet v rozsahu úsečky (s malou tolerancí).
  function findAutoGuideForAction(clientX, clientY) {
    const auto = (S._cachedCalc && S._cachedCalc.interferenceGuides) || [];
    if (!auto.length) return null;
    const { wx, wz } = clientToWorldCam(clientX, clientY);
    const tolPt = 14 / S.view.scale;
    const tolLine = 10 / S.view.scale;
    let best = null, bestScore = Infinity;
    for (const g of auto) {
      // Lomené čáry (hlídání držáku) nejde převést na jednu přímou
      // uživatelskou čáru — přeskočit (jejich přímá náhrada by lhala).
      if (g.via && g.via.length) continue;
      let dx = g.x2 - g.x1, dz = g.z2 - g.z1;
      const L = Math.hypot(dx, dz);
      if (L < 1e-9) continue;
      dx /= L; dz /= L;
      const d1 = Math.hypot(g.x1 - wx, g.z1 - wz);
      const d2 = Math.hypot(g.x2 - wx, g.z2 - wz);
      const endIdx = d1 <= d2 ? 0 : 1;
      const ptD = Math.min(d1, d2);
      if (ptD < tolPt && ptD < bestScore) {
        bestScore = ptD; best = { x1: g.x1, z1: g.z1, x2: g.x2, z2: g.z2, endIdx };
        continue;
      }
      const perp = Math.abs((wx - g.x1) * dz - (wz - g.z1) * dx);
      const t = (wx - g.x1) * dx + (wz - g.z1) * dz;
      if (perp < tolLine && t > -tolLine && t < L + tolLine && perp < bestScore) {
        bestScore = perp; best = { x1: g.x1, z1: g.z1, x2: g.x2, z2: g.z2, endIdx };
      }
    }
    return best;
  }
  // Všechny průsečíky NEKONEČNÉ přímky (ax,az)+t·(dx,dz) s geometrií
  // (kontura + offset + dokončení + konstrukční čáry) — obě strany.
  function lineGeometryHits(ax, az, dx, dz) {
    const calc = S._cachedCalc; if (!calc) return [];
    const out = [];
    const P = { x: ax - dx * 1e5, z: az - dz * 1e5 };
    const Q = { x: ax + dx * 1e5, z: az + dz * 1e5 };
    const lineHit = (B1, B2) => {
      if (!B1 || !B2) return;
      const d = (P.x - Q.x) * (B1.z - B2.z) - (P.z - Q.z) * (B1.x - B2.x);
      if (Math.abs(d) < 1e-12) return;
      const u = ((P.x - B1.x) * (P.z - Q.z) - (P.z - B1.z) * (P.x - Q.x)) / d;
      if (u < -0.001 || u > 1.001) return;
      const t = ((P.x - B1.x) * (B1.z - B2.z) - (P.z - B1.z) * (B1.x - B2.x)) / d;
      out.push({ x: P.x + t * (Q.x - P.x), z: P.z + t * (Q.z - P.z) });
    };
    const arcHit = (seg) => {
      const hits = intersectLineCircle(P, Q, { x: seg.cx, z: seg.cz }, seg.r);
      if (!hits) return;
      for (const q of hits) {
        const ang = Math.atan2(q.x - seg.cx, q.z - seg.cz);
        if (isAngleBetween(ang, seg.startAngle, seg.endAngle, seg.dir === 'G2')) out.push({ x: q.x, z: q.z });
      }
    };
    for (const s of [...(calc.contourSegments || []), ...(calc.offsetPath || []), ...(calc.finishOffsetPath || []), ...(calc.finishRefPath || [])]) {
      if (!s || s.isDegenerate) continue;
      if (s.type === 'line') lineHit(s.p1, s.p2);
      else if (s.type === 'arc') arcHit(s);
    }
    for (const g of getAllGuideLines()) lineHit({ x: g.x1, z: g.z1 }, { x: g.x2, z: g.z2 });
    return out;
  }

  // Vloží bod kontury/polotovaru PŘESNĚ na (wx,wz) — pokud bod leží na
  // některém segmentu: úsečka se rozdělí na dvě, oblouk na dva oblouky
  // po téže kružnici (se správným znaménkem R pro >180° polovinu).
  // Používá se pro koncové body pomocných čar (tečné body, průsečíky).
  function insertPointOnSegmentAt(wx, wz) {
    const calc = S._cachedCalc; if (!calc) return false;
    const tol = 0.05; // bod musí ležet prakticky přesně na segmentu
    const isDia = S.params.mode === 'DIAMON';
    const roundC = (v) => Math.round(v * 1000) / 1000;
    const lists = [
      { pts: calc.worldPoints, raw: S.contourPoints },
      { pts: calc.stockWorldPoints, raw: S.stockPoints }
    ];
    for (const { pts, raw } of lists) {
      if (!pts || pts.length !== raw.length) continue;
      for (let i = 1; i < pts.length; i++) {
        const p2 = pts[i], p1 = pts[i - 1];
        if (p2.type === 'G1') {
          const dx = p2.xReal - p1.xReal, dz = p2.zReal - p1.zReal;
          const len2 = dx * dx + dz * dz;
          if (len2 < 1e-12) continue;
          const t = ((wx - p1.xReal) * dx + (wz - p1.zReal) * dz) / len2;
          if (t < 0.001 || t > 0.999) continue;
          if (Math.hypot(p1.xReal + t * dx - wx, p1.zReal + t * dz - wz) > tol) continue;
          pushHistory();
          raw.splice(i, 0, {
            id: Date.now(), type: 'G1', mode: 'ABS',
            x: roundC(isDia ? wx * 2 : wx), z: roundC(wz), r: 0
          });
          // Původní koncový bod nesmí změnit polohu — INC by se po vložení
          // počítal od nového bodu, proto ho přepíšeme na ABS.
          const endRaw = raw[i + 1];
          if (endRaw.mode === 'INC') { endRaw.mode = 'ABS'; endRaw.x = roundC(p2.xAbs); endRaw.z = roundC(p2.zAbs); }
          fullUpdate();
          return true;
        }
        if (p2.type === 'G2' || p2.type === 'G3') {
          const arc = getArcParams({ x: p1.xReal, z: p1.zReal }, { x: p2.xReal, z: p2.zReal }, p2.rVal, p2.type);
          if (arc.error) continue;
          if (Math.abs(Math.hypot(wx - arc.cx, wz - arc.cz) - arc.r) > tol) continue;
          const aP = Math.atan2(wx - arc.cx, wz - arc.cz);
          const sA = Math.atan2(p1.xReal - arc.cx, p1.zReal - arc.cz);
          const eA = Math.atan2(p2.xReal - arc.cx, p2.zReal - arc.cz);
          if (!isAngleBetween(aP, sA, eA, p2.type === 'G2')) continue;
          // Bod příliš blízko konci oblouku nemá smysl vkládat.
          const distToEnds = Math.min(Math.hypot(wx - p1.xReal, wz - p1.zReal), Math.hypot(wx - p2.xReal, wz - p2.zReal));
          if (distToEnds < 0.01) continue;
          // Úhlové rozpětí polovin podél směru oblouku → znaménko R
          // (záporné R = dlouhý oblouk >180°, viz getArcParams).
          const sweep = (from, to) => {
            let d = to - from;
            if (p2.type === 'G2') { while (d > 1e-12) d -= 2 * Math.PI; return -d; }
            while (d < -1e-12) d += 2 * Math.PI; return d;
          };
          const rMag = Math.abs(parseFloat(p2.rVal)) || arc.r;
          const r1 = sweep(sA, aP) > Math.PI ? -rMag : rMag;
          const r2 = sweep(aP, eA) > Math.PI ? -rMag : rMag;
          pushHistory();
          raw.splice(i, 0, {
            id: Date.now(), type: p2.type, mode: 'ABS',
            x: roundC(isDia ? wx * 2 : wx), z: roundC(wz), r: r1
          });
          const endRaw = raw[i + 1];
          endRaw.r = r2;
          if (endRaw.mode === 'INC') { endRaw.mode = 'ABS'; endRaw.x = roundC(p2.xAbs); endRaw.z = roundC(p2.zAbs); }
          fullUpdate();
          return true;
        }
      }
    }
    return false;
  }
  return { getAllGuideLines, getGuideOffsetLines, extendTrimNode, extendTrimGuideClick, getUserGuideAt,
    getGuideEndpointAt, getUserGuideEndAt, findAutoGuideForAction, lineGeometryHits, insertPointOnSegmentAt };
}
