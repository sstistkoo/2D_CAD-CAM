// Kreslení plátna simulátoru — spodní vrstva: mřížka s popisky, osy,
// zbývající polotovar po úběru, vybarvení z CAD, polotovar, obrys vrtané
// a vyvrtávané díry a tečkovaná hranice pracovního posuvu kolem polotovaru.
// Vyňato z draw() v camSimulator.js (Fáze 5, docs/plan-rozdeleni-cam-
// simulatoru.md); vrstvy skládá drawCanvas.js.
import { buildStockLoopRaw } from '../materialRemoval.js';
import { state } from '../../../state.js';
import { arcSteps } from '../camMath.js';
import { drillGeom, drillAutoFaceZ, drillHoleLoop } from '../ops/drill.js';
import { boreChainFromState } from '../boreContour.js';
import { boreGeom } from '../ops/bore.js';

/** @param f snímek kreslení z drawCanvas(): { S, ctx, calc, prms, w, h, C, vS, hS, toScreen, getRemovalModel, getRemovalOuterModel, partsActive, _sampleStockOutlineWorld, _clipOutlineOutsideContour, getStockPlanOutline } */
export function drawStockLayer(f) {
  const { S, ctx, calc, prms, w, h, C, vS, hS, toScreen } = f;
  const { getRemovalModel, getRemovalOuterModel, partsActive, _sampleStockOutlineWorld, _clipOutlineOutsideContour, getStockPlanOutline } = f;

  // grid — dynamically cover entire visible canvas
  ctx.strokeStyle = C.grid; ctx.lineWidth = 1; ctx.beginPath();
  // Convert canvas corners to world coords to find visible range
  const toWorld = (sx, sy) => {
    if (prms.machineStructure === 'carousel')
      return { x: hS * (sx - S.view.panX) / S.view.scale, z: vS * (sy - S.view.panY) / S.view.scale };
    return { x: vS * (sy - S.view.panY) / S.view.scale, z: hS * (sx - S.view.panX) / S.view.scale };
  };
  const wTL = toWorld(0, 0), wBR = toWorld(w, h);
  const wMinX = Math.min(wTL.x, wBR.x), wMaxX = Math.max(wTL.x, wBR.x);
  const wMinZ = Math.min(wTL.z, wBR.z), wMaxZ = Math.max(wTL.z, wBR.z);
  // Choose grid step based on zoom
  const rawStep = Math.max(wMaxX - wMinX, wMaxZ - wMinZ) / 15;
  const mag = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const gridStep = [1, 2, 5, 10].map(m => m * mag).find(s => s >= rawStep) || (10 * mag);
  const gx0 = Math.floor(wMinX / gridStep) * gridStep, gx1 = Math.ceil(wMaxX / gridStep) * gridStep;
  const gz0 = Math.floor(wMinZ / gridStep) * gridStep, gz1 = Math.ceil(wMaxZ / gridStep) * gridStep;
  for (let v = gx0; v <= gx1; v += gridStep) {
    const p1 = toScreen(v, gz0), p2 = toScreen(v, gz1);
    ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y);
  }
  for (let v = gz0; v <= gz1; v += gridStep) {
    const p1 = toScreen(gx0, v), p2 = toScreen(gx1, v);
    ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y);
  }
  ctx.stroke();

  // grid labels
  // #585b70 (Catppuccin surface2) na tomhle pozadí padá pod 3:1 kontrastu
  // – prakticky nečitelné (viz stejná oprava v css/style.css). subtext0
  // (#a6adc8) dává ~7:1 a čísla jsou i o něco větší, ať jsou srovnatelná s CAD.
  ctx.fillStyle = '#a6adc8'; ctx.font = '12px sans-serif';
  for (let v = gx0; v <= gx1; v += gridStep) {
    if (Math.abs(v) < gridStep * 0.01) continue;
    const label = Number.isInteger(v) ? v.toString() : v.toFixed(1);
    if (prms.machineStructure === 'carousel') {
      const pt = toScreen(v, 0); ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.fillText(label, pt.x, pt.y + 2);
    } else {
      const pt = toScreen(v, 0); ctx.textAlign = 'right'; ctx.textBaseline = 'middle'; ctx.fillText(label, pt.x - 4, pt.y);
    }
  }
  for (let v = gz0; v <= gz1; v += gridStep) {
    if (Math.abs(v) < gridStep * 0.01) continue;
    const label = Number.isInteger(v) ? v.toString() : v.toFixed(1);
    if (prms.machineStructure === 'carousel') {
      const pt = toScreen(0, v); ctx.textAlign = 'right'; ctx.textBaseline = 'middle'; ctx.fillText(label, pt.x - 4, pt.y);
    } else {
      const pt = toScreen(0, v); ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.fillText(label, pt.x, pt.y + 2);
    }
  }

  // axes
  const zero = toScreen(0, 0);
  ctx.strokeStyle = C.axis; ctx.lineWidth = 2; ctx.beginPath();
  ctx.moveTo(0, zero.y); ctx.lineTo(w, zero.y);
  ctx.moveTo(zero.x, 0); ctx.lineTo(zero.x, h);
  ctx.stroke();
  ctx.fillStyle = C.axis; ctx.font = 'bold 12px monospace'; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  const vLabelY = S.flipX ? h - 8 : 15;
  const hLabelX = S.flipZ ? 20 : w - 20;
  if (prms.machineStructure === 'carousel') {
    ctx.fillText('X+', hLabelX, zero.y + 15); ctx.fillText('Z+', zero.x + 10, vLabelY);
  } else {
    ctx.fillText('Z+', hLabelX, zero.y + 15); ctx.fillText('X+', zero.x + 10, vLabelY);
  }
  ctx.fillText('X0 Z0', zero.x + 4, zero.y - 4);

  // Zbývající polotovar po úběru (Fáze 1 – Clipper2): Path2D ve screen
  // souřadnicích. Když je aktivní, ořezává vybarvení i výplň polotovaru,
  // takže projetý materiál vizuálně mizí.
  let remainPath = null;   // čistý zbytek materiálu (pro výplň polotovaru)
  let fillClipPath = null; // clip pro vybarvení: vše MIMO původní polotovar + zbytek
  let stockPath = null;    // zbytek AŽ po offsetovou čáru — TO je celý polotovar
  if (S.showRemoval) {
    const addLoop = (path, loop) => {
      if (!loop || loop.length < 3) return;
      const p0 = toScreen(loop[0].x, loop[0].z);
      path.moveTo(p0.x, p0.y);
      for (let i = 1; i < loop.length; i++) {
        const p = toScreen(loop[i].x, loop[i].z);
        path.lineTo(p.x, p.y);
      }
      path.closePath();
    };
    const rm = S.simProgress > 0 ? getRemovalModel(calc) : null;
    if (rm) {
      remainPath = new Path2D();
      for (const loop of rm.model.loops) addLoop(remainPath, loop);
      // POLOTOVAR KONČÍ AŽ NA OFFSETOVÉ ČÁŘE, takže se vybarví JEDNÍM
      // odstínem až po ni — pás nad nakresleným odlitkem není zvláštní
      // zóna, je to prostě polotovar (zadání uživatele 20. 8. 2026:
      // „obrobek je celý i s tou offsetovou čarou“). Dřív se kreslil zvlášť
      // světlejším tónem přes clip „mimo syrový obrys“, takže díl vypadal
      // jako dva materiály.
      // Offsetový zbytek OBSAHUJE syrový (obě smyčky řeže tatáž dráha, jen
      // začínají na jiném základu — hlídá tests/cam-removal-offset-band),
      // takže jedna výplň pokryje obojí.
      const rmOut = getRemovalOuterModel(calc, rm);
      if (rmOut) {
        stockPath = new Path2D();
        for (const loop of rmOut.model.loops) addLoop(stockPath, loop);
      }
    }
    // Materiál odebraný PŘEDCHOZÍMI operacemi je pryč nastálo — vybarvení se
    // tam proto nemá vracet ani při simProgress = 0 (čerstvě založená část
    // ještě nemá dráhy). Základ ořezu je pak obrys PŮVODNÍHO polotovaru
    // (uložený u první části) a zbytek = polotovar aktuální části.
    const partBase = partsActive() && S.opParts[0] ? S.opParts[0].baseStockLoop : null;
    const clipBase = partBase || (rm ? rm.baseLoop : null);
    const remainLoops = rm ? rm.model.loops
      : (partBase ? [buildStockLoopRaw(prms, calc.stockPathSegments)].filter(Boolean) : null);
    if (clipBase && remainLoops) {
      // Parity trik (evenodd): celé plátno + původní obrys polotovaru +
      // zbylé smyčky → vyplněná oblast = mimo polotovar ∪ zbytek. Vybarvení
      // se tedy maže jen tam, kde nástroj skutečně odebral materiál —
      // výplně mimo polotovar (obrobek, anotace) zůstávají netknuté.
      fillClipPath = new Path2D();
      fillClipPath.rect(-10, -10, w + 20, h + 20);
      addLoop(fillClipPath, clipBase);
      for (const loop of remainLoops) addLoop(fillClipPath, loop);
    }
  }

  // Vybarvení (fill objekty z CAD nástroje "Vybarvit") — CAM čte state.objects
  // přímo (na rozdíl od kontury/polotovaru CAM nemá vlastní kopii těchto
  // objektů, protože jde jen o vizuální anotaci, ne obráběnou geometrii).
  // Stejné pořadí jako v CAD (js/render.js drawFills) — kreslí se pod vším.
  const camXZ = (cx, cy) => prms.machineStructure === 'carousel' ? [cx, cy] : [cy, cx];
  if (fillClipPath) { ctx.save(); ctx.clip(fillClipPath, 'evenodd'); }
  state.objects.forEach((obj) => {
    if (obj.type !== 'fill' || !obj.loops || obj.loops.length === 0) return;
    const layer = state.layers.find(l => l.id === obj.layer);
    if (layer && !layer.visible) return;
    const path = new Path2D();
    for (const loop of obj.loops) {
      if (loop.length < 3) continue;
      const p0 = toScreen(...camXZ(loop[0].x, loop[0].y));
      path.moveTo(p0.x, p0.y);
      for (let i = 1; i < loop.length; i++) {
        const p = toScreen(...camXZ(loop[i].x, loop[i].y));
        path.lineTo(p.x, p.y);
      }
      path.closePath();
    }
    ctx.save();
    ctx.globalAlpha = obj.alpha ?? 0.35;
    ctx.fillStyle = obj.color || '#60a5fa';
    ctx.fill(path, 'evenodd');
    ctx.restore();
  });
  if (fillClipPath) ctx.restore();

  // stock
  if (prms.stockMode === 'cylinder') {
    const sRad = (parseFloat(prms.stockDiameter) || 0) / 2;
    const sLen = parseFloat(prms.stockLength) || 0;
    const sFace = parseFloat(prms.stockFace) || 0;
    const s1 = toScreen(sRad, sFace), s2 = toScreen(sRad, -sLen), s3 = toScreen(0, -sLen), sStart = toScreen(0, sFace);
    // filled area — při aktivním úběru se kreslí jen ZBÝVAJÍCÍ materiál
    ctx.fillStyle = 'rgba(108,112,134,0.12)';
    if (remainPath) {
      ctx.fill(stockPath || remainPath, 'evenodd');
    } else {
      ctx.beginPath(); ctx.moveTo(sStart.x, sStart.y); ctx.lineTo(s1.x, s1.y); ctx.lineTo(s2.x, s2.y); ctx.lineTo(s3.x, s3.y); ctx.closePath(); ctx.fill();
    }
    // outline — all 4 sides visible (tlustá červená čára)
    ctx.strokeStyle = '#e74c3c'; ctx.lineWidth = 3; ctx.beginPath();
    ctx.moveTo(sStart.x, sStart.y); ctx.lineTo(s1.x, s1.y); ctx.lineTo(s2.x, s2.y); ctx.lineTo(s3.x, s3.y); ctx.closePath();
    ctx.stroke();
    // label with stock dimensions
    const labelPt = toScreen(sRad, sFace);
    const stockDiaLabel = `∅${parseFloat(prms.stockDiameter)} × ${sLen}`;
    ctx.fillStyle = '#fab387'; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
    if (prms.machineStructure === 'carousel') ctx.fillText(stockDiaLabel, labelPt.x + 4, labelPt.y - 4);
    else ctx.fillText(stockDiaLabel, labelPt.x + 4, labelPt.y - 4);
  } else if (calc.stockPathSegments.length > 0) {
    // Ořez čáry polotovaru o konturu materiálu se dělá JEN PO potvrzení
    // trasování profilu (S._traceConfirmedOnce) — dokud trasa neexistuje
    // (čerstvě otevřený projekt) ani během jejího kreslení (nevíme, kudy
    // povede), musí být vidět CELÝ polotovar beze změny.
    const _clipStockToContour = !!S._traceConfirmedOnce;
    ctx.beginPath();
    if (_clipStockToContour) {
      const _pts = _sampleStockOutlineWorld(calc.stockPathSegments);
      const _runs = _clipOutlineOutsideContour(_pts, calc.contourSegments);
      _runs.forEach(run => {
        run.forEach((p, j) => {
          const sp = toScreen(p.x, p.z);
          if (j === 0) ctx.moveTo(sp.x, sp.y); else ctx.lineTo(sp.x, sp.y);
        });
      });
    } else {
      calc.stockPathSegments.forEach((seg, i) => {
        if (seg.type === 'line') {
          const p1 = toScreen(seg.p1.x, seg.p1.z), p2 = toScreen(seg.p2.x, seg.p2.z);
          if (i === 0) ctx.moveTo(p1.x, p1.y); else ctx.lineTo(p1.x, p1.y);
          ctx.lineTo(p2.x, p2.y);
        } else if (seg.type === 'arc') {
          const steps = arcSteps(seg.r, S.view.scale);
          let sA = seg.startAngle, eA = seg.endAngle;
          if (seg.dir === 'G2' && eA > sA) eA -= 2 * Math.PI;
          if (seg.dir === 'G3' && eA < sA) eA += 2 * Math.PI;
          for (let j = 0; j <= steps; j++) {
            const a = sA + (eA - sA) * (j / steps);
            const pt = toScreen(seg.cx + Math.sin(a) * seg.r, seg.cz + Math.cos(a) * seg.r);
            if (j === 0 && i === 0) ctx.moveTo(pt.x, pt.y);
            else if (j === 0) ctx.moveTo(pt.x, pt.y);
            else ctx.lineTo(pt.x, pt.y);
          }
        }
      });
    }
    ctx.strokeStyle = '#e74c3c'; ctx.lineWidth = 3; ctx.stroke();
    // Odlitek: při aktivním úběru vyplnit zbývající materiál (válec má
    // výplň výš — tady se jinak kreslí jen obrys).
    if (remainPath) {
      ctx.fillStyle = 'rgba(108,112,134,0.12)';
      ctx.fill(stockPath || remainPath, 'evenodd');
    }
  }

  // ── Vrtání: obrys vrtané díry (čárkovaně) — co se odvrtá a co zůstane ──
  if (prms.drillActive && !prms.boreActive) {
    try {
      const dg = drillGeom(prms, { faceZ: drillAutoFaceZ(S) });
      const hole = drillHoleLoop(prms, dg);
      if (hole) {
        ctx.save(); ctx.setLineDash([6, 4]); ctx.lineWidth = 1.5; ctx.strokeStyle = '#fab387';
        ctx.beginPath();
        hole.forEach((p, i) => { const q = toScreen(p.x, p.z); if (i) ctx.lineTo(q.x, q.y); else ctx.moveTo(q.x, q.y); });
        ctx.stroke();
        ctx.restore();
      }
    } catch (_) { /* neúplné zadání — bez náhledu */ }
  }
  // ── Vyvrtávání: obrys díry a předvrtání (čárkovaně, ops/bore.js) ──
  if (prms.boreActive) {
    const bsrc = prms.boreSource === 'cad' ? boreChainFromState(S) : null;
    const bg = boreGeom(prms, bsrc ? bsrc.segs : null);
    if (bg.D > 0 && bg.L > 0) {
      const line = (pts) => {
        ctx.beginPath();
        pts.forEach(([x, z], i) => { const q = toScreen(x, z); if (i) ctx.lineTo(q.x, q.y); else ctx.moveTo(q.x, q.y); });
        ctx.stroke();
      };
      ctx.save(); ctx.setLineDash([6, 4]); ctx.lineWidth = 1.5;
      ctx.strokeStyle = '#fab387';
      if (bg.chain) {
        // Díra z výkresu: řetěz od ústí dovnitř, oblouky navzorkované.
        const pts = [[bg.chain[0].p1.x, bg.chain[0].p1.z]];
        for (const s of bg.chain) {
          if (s.type === 'arc') {
            let d = s.endAngle - s.startAngle;
            if (s.dir === 'G2' && d > 0) d -= 2 * Math.PI;
            if (s.dir === 'G3' && d < 0) d += 2 * Math.PI;
            for (let j = 1; j <= 12; j++) { const a = s.startAngle + d * j / 12; pts.push([s.cx + s.r * Math.sin(a), s.cz + s.r * Math.cos(a)]); }
          } else pts.push([s.p2.x, s.p2.z]);
        }
        line(pts);
      } else {
        line([[bg.r, bg.zF], [bg.r, bg.zF - bg.s * bg.L], [Math.min(bg.r0, bg.r), bg.zF - bg.s * bg.L]]);
      }
      if (bg.r0 > 0 && bg.L0 > 0) { ctx.strokeStyle = '#f9e2af'; line([[bg.r0, bg.zF], [bg.r0, bg.zF - bg.s * bg.L0], [0, bg.zF - bg.s * bg.L0]]); }
      ctx.restore();
    }
  }

  // Tečkovaná hranice pracovního posuvu kolem polotovaru: offset povrchu
  // o Vůli X (radiálně) a Vůli Z (axiálně). Sem končí rychloposuv (G0) a
  // začíná pracovní posuv (G1); zároveň bezpečná zóna pro držák.
  // Po téhle čáře se nejede, dráhy jedou po `offsetPath` níž.
  // KRESLÍ SE VŽDY (uživatel 25. 9. 2026: *„chybí mi tam offsetová čára
  // kolem polotovaru jako přídavek, který tam mám"*) — do té doby byla
  // schovaná pod přepínačem REF (výchozí vypnuto), který tím zanikl.
  {
    ctx.save();
    ctx.strokeStyle = 'rgba(250,179,135,0.75)';
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 4]);
    ctx.beginPath();
    // Kreslí se PŘESNĚ ta smyčka, se kterou plánuje hrubování i emise
    // (`stockPlanLoop`), a na kterou se chytá SNAP — jeden zdroj, viz
    // getStockPlanOutline() níž.
    //
    // DŘÍV se offset dopočítával ZVLÁŠŤ: obrys se navzorkoval a každý bod
    // se posunul po své vlastní normále. To ale NENÍ offset polygonu a
    // v rozích i na koncích se čára přitahovala k polotovaru — normála
    // v rohu půlí úhel (chybí prodloužení hrany) a v prvním/posledním
    // vzorku se počítala jen z poloviny intervalu. Reálný nález uživatele:
    // u konce polotovaru se „offsetová čára ke konci zužuje místo aby
    // držela stejnou vzdálenost“.
    const planOutline = getStockPlanOutline(calc);
    if (planOutline.length > 1) {
      planOutline.forEach((q, i) => {
        const p = toScreen(q.x, q.z);
        if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
      });
      // Válec = otevřená polylinie od osy k ose; odlitek = uzavřená smyčka.
      if (prms.stockMode !== 'cylinder') ctx.closePath();
    }
    ctx.stroke();
    ctx.restore();
  }
}
