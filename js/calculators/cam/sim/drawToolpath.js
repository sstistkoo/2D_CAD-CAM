// Kreslení plátna simulátoru — dráhy a nástroj: náběh/výběh po kontuře,
// průchody hrubování (náhled před emisí), dráha programu (posuvy plně,
// rychloposuvy čárkovaně), úchopy úpravy drah, rovina upichnutí a nástroj
// v poloze simulace (+ výpis polohy). Vyňato z draw() v camSimulator.js
// (Fáze 5); vrstvy skládá drawCanvas.js.
import { arcSteps } from '../camMath.js';
import { partOffGeom } from '../threadHelpers.js';
import { elapsedAtProgress } from '../feedRates.js';
import { drawHolderProfileLocal, drawThreadingInsert, drawPolygonInsert, partingBodyMinH, drawDrillTool } from '../insertPreview.js';

/** @param f snímek kreslení z drawCanvas(): { S, ctx, calc, prms, C, toScreen, getGNodes, _draggingPartOff, motionOverlay, preDrillPhase, showMotionInfo, simTimeProfile, toolMirrored, getHolderGouge, getContourGouge } */
export function drawToolpathLayer(f) {
  const { S, ctx, calc, prms, C, toScreen } = f;
  const { getGNodes, _draggingPartOff, motionOverlay, preDrillPhase, showMotionInfo, simTimeProfile, toolMirrored, getHolderGouge, getContourGouge } = f;

  // Vykreslí trasování kontury (G1/G2/G3 segmenty s x1/z1/x2/z2) do
  // aktuální cesty — sdíleno pro contourLeadIn i contourLeadOut.
  const drawContourTrace = (segs) => {
    for (const seg of segs) {
      if (seg.type === 'line') {
        const p1 = toScreen(seg.x1, seg.z1), p2 = toScreen(seg.x2, seg.z2);
        ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y);
      } else {
        const steps = arcSteps(seg.r, S.view.scale);
        let sA = seg.startAngle, eA = seg.endAngle;
        if (seg.dir === 'G2' && eA > sA) eA -= 2 * Math.PI;
        if (seg.dir === 'G3' && eA < sA) eA += 2 * Math.PI;
        for (let j = 0; j <= steps; j++) {
          const a = sA + (eA - sA) * (j / steps);
          const pt = toScreen(seg.cx + Math.sin(a) * seg.r, seg.cz + Math.cos(a) * seg.r);
          if (j === 0) ctx.moveTo(pt.x, pt.y); else ctx.lineTo(pt.x, pt.y);
        }
      }
    }
  };

  // roughing passes — v 🙈 stavu skryjeme všechny drahy. Při úpravě drah
  // (✥ Dráhy) se skryjí taky: jsou počítané z kontury (needitují se podle
  // ručního G-kódu), takže by zůstaly viset na staré pozici a překrývaly
  // by skutečnou editovanou dráhu (simPath).
  // Průchody z calc.passes jsou jen PŘED-emisní odhad: skutečnou dráhu
  // (segmentace podle siluety odlitku, ořez konců na hranici materiálu,
  // zkrácené rampy) zná až emise, a ta se kreslí ze simPath níž. Jakmile
  // simPath existuje, tyhle čáry by kreslily ducha neexistující dráhy —
  // uživatel je viděl viset za konci ořezaných dojezdů.
  const passesArePreview = calc.simPath.length === 0;
  if (S.showSimPath !== 'none' && !S.gcodeEditEnabled && passesArePreview) {
    ctx.beginPath();
    calc.passes.forEach(pass => {
      if (pass.type === 'long') {
        if (pass.contourLeadIn) {
          // sledování kontury (G1/G2/G3) přes kapsu místo odskoku
          drawContourTrace(pass.contourLeadIn);
        }
        if (pass.ramp) {
          // rampa zanoření z "rohu" kontury (tečný bod pod úhlem zanoření)
          const pr = toScreen(pass.ramp.x0, pass.ramp.z0);
          const pe = toScreen(pass.x, pass.zStart);
          ctx.moveTo(pr.x, pr.y); ctx.lineTo(pe.x, pe.y);
        }
        const p1 = toScreen(pass.x, pass.zStart), p2 = toScreen(pass.x, pass.zEnd);
        ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y);
        if (pass.contourLeadOut) drawContourTrace(pass.contourLeadOut);
      } else {
        const p1 = toScreen(pass.xStart, pass.z), p2 = toScreen(pass.xEnd, pass.z);
        ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y);
        if (pass.contourLeadOut) drawContourTrace(pass.contourLeadOut);
      }
    });
    ctx.strokeStyle = C.pass; ctx.lineWidth = 1.5; ctx.stroke();
  }

  // sim path — 'all' = vše, 'cut' = jen řezné, 'none' = nic.
  // Posuvy (G1/G2/G3) plnou čarou (zelená = řez), rychloposuvy (G0)
  // čárkovaně (růžová) — aby G1 nevypadal jako rychloposuv.
  if (S.showSimPath !== 'none' && calc.simPath.length > 0) {
    const strokeSub = (wantRapid) => {
      ctx.beginPath();
      let any = false;
      for (let i = 0; i < calc.simPath.length - 1; i++) {
        const p2 = calc.simPath[i + 1];
        const isRapid = p2.type === 'G0';
        if (isRapid !== wantRapid) continue;
        if (S.showSimPath === 'cut' && isRapid) continue;
        if (p2.arcParams) {
          const ap = p2.arcParams;
          const drawSteps = arcSteps(ap.r, S.view.scale);
          const sA = ap.startAngle, eA = ap.endAngle;
          for (let j = 0; j <= drawSteps; j++) {
            const a = sA + (eA - sA) * (j / drawSteps);
            const pt = toScreen(ap.cx + Math.sin(a) * ap.r, ap.cz + Math.cos(a) * ap.r);
            if (j === 0) ctx.moveTo(pt.x, pt.y); else ctx.lineTo(pt.x, pt.y);
          }
          i += ap.tessSteps - 1;
          any = true;
        } else {
          const s = toScreen(calc.simPath[i].x, calc.simPath[i].z), e = toScreen(p2.x, p2.z);
          if (Math.abs(s.x - e.x) > 0.1 || Math.abs(s.y - e.y) > 0.1) {
            ctx.moveTo(s.x, s.y); ctx.lineTo(e.x, e.y); any = true;
          }
        }
      }
      if (!any) return;
      ctx.lineWidth = 1.5;
      if (wantRapid) { ctx.strokeStyle = '#f38ba8'; ctx.setLineDash([6, 6]); }
      else { ctx.strokeStyle = '#a6e3a1'; ctx.setLineDash([]); }
      ctx.stroke(); ctx.setLineDash([]);
    };
    strokeSub(false);   // posuvy – plně
    strokeSub(true);    // rychloposuvy – čárkovaně
  }

  // úchopové body / úsečky pro úpravu drah (✥ Dráhy)
  if (S.gcodeEditEnabled && !S.simRunning && calc.simPath.length > 0) {
    const hlSeg = S._draggedGSeg || S.hoverGSeg;
    if (hlSeg) {
      const a = toScreen(hlSeg.p1.x, hlSeg.p1.z), b = toScreen(hlSeg.p2.x, hlSeg.p2.z);
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
      ctx.strokeStyle = '#f9e2af'; ctx.lineWidth = 3; ctx.stroke();
    }
    const nodes = getGNodes();
    const dragLi = S.draggedGNode ? S.draggedGNode.lineIdx : null;
    const hovLi = S.hoverGNode ? S.hoverGNode.lineIdx : null;
    for (const n of nodes) {
      const pt = toScreen(n.x, n.z);
      const active = n.lineIdx === dragLi || n.lineIdx === hovLi;
      ctx.beginPath(); ctx.arc(pt.x, pt.y, active ? 6 : 4, 0, Math.PI * 2);
      ctx.fillStyle = active ? '#f9e2af' : (n.type === 'G0' ? '#89b4fa' : '#a6e3a1');
      ctx.fill();
      ctx.strokeStyle = '#1e1e2e'; ctx.lineWidth = 1; ctx.stroke();
    }
  }

  // Rovina upichnutí (part-off) — SVISLÁ ÚSEČKA kontury v Z=partOffZ.
  // Plná čára = upichovací plocha od dojezdu (spodní hrana plátku) po vršek
  // polotovaru; celá rovina řezu navíc čárkovaně (reference od osy nahoru).
  if (prms.partOffZ != null && isFinite(parseFloat(prms.partOffZ))) {
    const g = partOffGeom(prms, calc);
    const pz = g.pz;
    const xTopRef = Math.max(g.xStockTop, (parseFloat(prms.toolRadius) || 1) * 3);
    ctx.save();
    // Reference celé roviny řezu (čárkovaně, od osy nahoru).
    const a0 = toScreen(0, pz), bRef = toScreen(xTopRef * 1.05, pz);
    ctx.strokeStyle = '#f38ba8'; ctx.lineWidth = 1.5; ctx.setLineDash([7, 5]);
    ctx.beginPath(); ctx.moveTo(a0.x, a0.y); ctx.lineTo(bRef.x, bRef.y); ctx.stroke();
    ctx.setLineDash([]);
    // Obrobená úsečka (plná) od spodní hrany (dojezd) po vršek polotovaru
    // + dva úchopové body: spodní = Dojezd X, horní = Start X. V režimu
    // ◆ Kontura je lze chytit a táhnout v ose X (nastaví Dojezd X / Start X).
    if (g.canCut) {
      const eBot = toScreen(g.xBottomEdge, pz), eTop = toScreen(g.xStockTop, pz);
      ctx.strokeStyle = '#f38ba8'; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.moveTo(eBot.x, eBot.y); ctx.lineTo(eTop.x, eTop.y); ctx.stroke();
      const interactive = S.pointDragEnabled && !S.simRunning;
      const drawHandle = (p, color, which, label) => {
        const active = (interactive && S._hoverPartOff === which) || _draggingPartOff === which;
        const r = active ? 6.5 : (interactive ? 5 : 3.5);
        ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        ctx.fillStyle = active ? '#f9e2af' : color;
        ctx.fill(); ctx.strokeStyle = '#1e1e2e'; ctx.lineWidth = 1.5; ctx.stroke();
        if (interactive) {
          ctx.fillStyle = color; ctx.font = 'bold 10px sans-serif';
          ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
          ctx.fillText(label, p.x + 9, p.y);
        }
      };
      drawHandle(toScreen(g.startEdgeX, pz), '#89b4fa', 'start', 'Start X');   // horní (modrý)
      drawHandle(toScreen(g.xBottomEdge, pz), '#f38ba8', 'dojezd', 'Dojezd X'); // spodní (růžový)
    }
    ctx.fillStyle = '#f38ba8'; ctx.font = 'bold 11px sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    ctx.fillText(`✂ upich Z=${pz.toFixed(2)}`, bRef.x, bRef.y - 4);
    ctx.restore();
  }

  // tool position during sim — ne při vrtání ◎ (f.liveBusy): v řezu je jen
  // poháněný nástroj, který vrtá, údaj nad časem píše livePanel
  motionOverlay.textContent = '';   // naplní showMotionInfo, když sim běží/stojí na dráze
  if ((S.simRunning || S.simProgress > 0) && calc.simPath.length > 0 && !f.liveBusy) {
    const totalPoints = calc.simPath.length;
    const floatIndex = S.simProgress * (totalPoints - 1);
    const idx = Math.floor(floatIndex);
    const t = floatIndex - idx;
    // Vyvrtávání z plného (ops/borePreDrill.js): do konce vrtání se kreslí
    // vrták, potom vyvrtávací tyč (otočená k ose).
    const preTool = preDrillPhase(calc);
    const drillNow = !!preTool && floatIndex < preTool.iSplit;
    const tp = drillNow ? preTool.params : prms;
    // Vyvrtávání i zápich v díře (Upich + ◎ Vnitřní): tyč leží v díře, nůž k ose.
    const boreView = !drillNow && (!!S.params.boreActive || (!!S.params.partOffInner && S.params.partOffZ != null));
    const pCurrent = calc.simPath[idx];
    if (pCurrent) {
      const pNext = calc.simPath[Math.min(idx + 1, totalPoints - 1)] || pCurrent;
      const curX = pCurrent.x + (pNext.x - pCurrent.x) * t;
      const curZ = pCurrent.z + (pNext.z - pCurrent.z) * t;
      // Ubíhající čas + živé otáčky a posuv v aktuálním místě dráhy.
      showMotionInfo(pNext, curX, elapsedAtProgress(simTimeProfile(calc.simPath), S.simProgress));
      const pt = toScreen(curX, curZ);
      const tRad = parseFloat(tp.toolRadius) || 0.8;
      // −0.75px = polovina šířky konturové čáry (lineWidth 1.5), aby okraj
      // plátku nepřekrýval vykreslenou čáru kontury.
      // ŽÁDNÉ pixelové podlahy: plátek drží velikost i tvar v měřítku výkresu
      // (a tím i poměr k držáku, který se kreslí v pravém měřítku). Dřív měl
      // R podlahu 6 px a šířka/délka 20 px, každá se zapínala při jiném zoomu,
      // takže se plátek při oddálení nafoukl a deformoval (nález uživatele
      // 27. 8. 2026). Polohu nástroje drží křížek níž, který má minimální
      // pixelovou velikost.
      const rPix = Math.max(tRad * S.view.scale - 0.75, 0.1);
      // Držák (za destičkou) — stejné zrcadlení jako destička (strana
      // obrábění/flipZ vodorovně, flipX svisle), ale BEZ natočení
      // specifického pro tvar destičky (toolAngle), stejně jako v dialogu
      // "⚙️ Geometrie" (tam drží orientaci držáku jen knifeAngle).
      ctx.save(); ctx.translate(pt.x, pt.y);
      if ((toolMirrored()) !== !!S.flipZ) ctx.scale(-1, 1);
      if (S.flipX !== boreView) ctx.scale(1, -1);   // vyvrtávání: nůž k ose
      drawHolderProfileLocal(ctx, tp, S.view.scale);
      ctx.restore();
      // Vybarvení AKUMULOVANÝCH oblastí kolizí (držák v materiálu, zajetí do
      // hotové kontury). Smyčky jsou v SIM souřadnicích, kreslí se přímo přes
      // toScreen (mimo výše zrcadlený kontext — ten řeší toScreen sám).
      const paint = (loops, fill, stroke) => {
        if (!loops) return;
        ctx.fillStyle = fill; ctx.strokeStyle = stroke;
        for (const loop of loops) {
          if (loop.length < 3) continue;
          ctx.beginPath();
          const p0 = toScreen(loop[0].x, loop[0].z);
          ctx.moveTo(p0.x, p0.y);
          for (let i = 1; i < loop.length; i++) {
            const p = toScreen(loop[i].x, loop[i].z);
            ctx.lineTo(p.x, p.y);
          }
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
        }
      };
      // Oranžové varování: AKUMULOVANÁ oblast, kudy se držák vnořil do
      // materiálu (zůstává i po přejetí).
      const holderHit = getHolderGouge(calc);
      if (holderHit) {
        ctx.save();
        ctx.lineWidth = 1.5;
        // ČERVENĚ pás k offsetové čáře (kreslí se PRVNÍ, tvrdé vnoření do
        // materiálu je nad ním), ORANŽOVĚ vnoření do materiálu — jako dosud.
        paint(holderHit.band, 'rgba(231,76,60,0.55)', '#c0392b');
        paint(holderHit.hard, 'rgba(250,140,50,0.55)', '#e8590c');
        ctx.restore();
      }
      // ZAJETÍ DO HOTOVÉ KONTURY: části dílu, které simulace odebrala.
      // Kreslí se NAD stopou držáku — je to vada na samotném kusu, ne
      // varování o cestě nástroje.
      const partHit = getContourGouge(calc);
      if (partHit) {
        ctx.save();
        ctx.lineWidth = 1.5;
        paint(partHit, 'rgba(255,45,45,0.6)', '#ff2d2d');
        ctx.restore();
      }
      ctx.fillStyle = C.insert; ctx.strokeStyle = C.text; ctx.lineWidth = 1;
      if (tp.toolShape === 'round') {
        ctx.beginPath(); ctx.arc(pt.x, pt.y, rPix, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      } else if (tp.toolShape === 'threading') {
        // Závitový plátek: pracovní zub (lichoběžník) — rovná SPODNÍ STRANA
        // (šířka toolTipFlat) leží přímo na dráze (X průchodu = ⌀ řezu),
        // boky stoupají symetricky ±ε/2 od svislice. Rádius se nepoužívá.
        // Nad ním světle celá destička (trojúhelník se zuby v rozích),
        // sdílené s ⚙️ Geometrie — drawThreadingInsert. Spodní strana
        // min. 1,5 px, ať je vidět i při oddálení.
        const scl = S.view.scale;
        ctx.save(); ctx.translate(pt.x, pt.y);
        if (S.flipX !== boreView) ctx.scale(1, -1);   // vyvrtávání: nůž k ose
        drawThreadingInsert(ctx, { ...tp, toolTipFlat: Math.max(parseFloat(tp.toolTipFlat) || 0, 1.5 / scl) }, scl);
        ctx.restore();
      } else if (tp.toolShape === 'polygon') {
        ctx.save(); ctx.translate(pt.x, pt.y);
        // Zrcadlení destičky musí odpovídat globálnímu pohledu (viz vS/hS
        // v toScreen). Horizontálně (osa Z): backside a flipZ se vzájemně
        // ruší (XOR). Vertikálně (osa X): flipX zrcadlí pohled svisle.
        if ((toolMirrored()) !== !!S.flipZ) ctx.scale(-1, 1);
        if (S.flipX !== boreView) ctx.scale(1, -1);   // vyvrtávání: nůž k ose
        // Celá destička + řezná část ze SDÍLENÝCH segmentů (tentýž obrys
        // počítá úběr a kolize). Vlastní kopie vzorců tu dřív ignorovala
        // ⇄ Přehodit stranu (toolTipMirror) — simulace ukazovala destičku
        // jinak, než se s ní počítalo. R o −0,75 px menší, viz rPix výš.
        const scl = S.view.scale;
        const cut = drawPolygonInsert(ctx, { ...tp, toolRadius: rPix / scl }, scl);
        // Vizualizace úhlu hřbetu (α) — tečkované čáry na hranách plátku.
        // Hrany z obrysu: t1→farA (hlavní ostří), farB→t2 (vedlejší).
        const clearDeg = parseFloat(tp.toolClearanceAngle) || 0;
        if (clearDeg > 0 && cut.length >= 3) {
          const clearRad = clearDeg * Math.PI / 180;
          // Na kterou stranu leží tělo destičky, určuje ⇄ (toolTipMirror).
          const sgn = tp.toolTipMirror ? -1 : 1;
          const clLen = Math.min((parseFloat(tp.toolLength) || 10) * scl * 0.65, 30);
          const px = p => ({ x: p.x * scl, y: -p.z * scl });
          const edgeA = cut[0], edgeB = cut[cut.length - 2];
          const hair = (from, to, rot) => {
            const f = px(from), t = px(to);
            const a = Math.atan2(t.y - f.y, t.x - f.x) + rot;
            ctx.beginPath(); ctx.moveTo(f.x, f.y);
            ctx.lineTo(f.x + Math.cos(a) * clLen, f.y + Math.sin(a) * clLen);
            ctx.stroke();
          };
          ctx.save();
          ctx.strokeStyle = 'rgba(166,173,200,0.7)'; ctx.lineWidth = 1; ctx.setLineDash([3, 3]);
          hair(edgeA.from, edgeA.to, -sgn * clearRad);   // hřbet na hlavním ostří
          hair(edgeB.to, edgeB.from, sgn * clearRad);    // hřbet na vedlejším ostří
          ctx.setLineDash([]);
          ctx.restore();
        }
        ctx.restore();
      } else if (tp.toolShape === 'parting') {
        // Upichovací / zapichovací plátek: šířka = toolLength, dva spodní
        // rádiusy R. Referenční bod (0,0) = STŘED RÁDIUSU PRACOVNÍ STRANY
        // (jako u polygonu): zprava = levý roh plátku, zleva = pravý roh.
        // Lokálně kreslíme vždy levý roh v počátku s tělem doprava (do už
        // obrobené zóny); stranu obrábění řeší zrcadlení níže.
        const wPix = (parseFloat(tp.toolLength) || 10) * S.view.scale;
        const rotRad = -(parseFloat(tp.toolAngle) || 0) * (Math.PI / 180);
        const r = Math.min(rPix, wPix / 2);        // rádius nesmí být širší než půl plátku
        const w2 = wPix - 2 * r;                   // rovná část spodního ostří
        // Stejná mm-výška jako v dialogu "⚙️ Geometrie" (PARTING_BODY_MIN_H_MM),
        // aby plátek vypadal stejně vysoký v simulaci i v náhledu geometrie.
        const bodyH = Math.max(wPix * 0.6, r + partingBodyMinH(tp) * S.view.scale);
        ctx.save(); ctx.translate(pt.x, pt.y);
        // Zrcadlení: strana obrábění (zleva = otočený plátek) XOR flipZ
        // vodorovně; flipX svisle — ladí s vS/hS v toScreen.
        if (((tp.roughingSide || 'right') === 'left') !== !!S.flipZ) ctx.scale(-1, 1);
        if (S.flipX !== boreView) ctx.scale(1, -1);   // vyvrtávání: nůž k ose
        ctx.rotate(rotRad);
        // Lokální souřadnice: y roste dolů (k ose). Střed aktivního rádiusu
        // = (0,0), spodní ostří na y=+r, tělo nahoru (−y), šířka doprava.
        ctx.beginPath();
        ctx.moveTo(-r, r - bodyH);                        // levý horní roh
        ctx.lineTo(-r, 0);                                // levá strana k tečně rádiusu
        ctx.arc(0, 0, r, Math.PI, Math.PI / 2, true);    // aktivní rádius (střed = ref. bod)
        ctx.lineTo(w2, r);                                // spodní ostří (rovná část)
        ctx.arc(w2, 0, r, Math.PI / 2, 0, true);         // druhý rádius
        ctx.lineTo(w2 + r, r - bodyH);                    // pravá strana nahoru
        ctx.closePath();
        ctx.fill(); ctx.stroke();
        // Malý kontrolní křížek ve středu DRUHÉHO (neaktivního) rádiusu —
        // při obrábění z druhé strany má ležet na offsetové čáře.
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(w2 - 5, 0); ctx.lineTo(w2 + 5, 0);
        ctx.moveTo(w2, -5); ctx.lineTo(w2, 5);
        ctx.stroke();
        ctx.restore();
      } else if (tp.toolShape === 'drill') {
        // Vrták v ose: špička na bodu dráhy, tělo k vyložení (od díry ven).
        // Zrcadlení jako u držáku — strana obrábění XOR flipZ, flipX svisle.
        ctx.save(); ctx.translate(pt.x, pt.y);
        if ((toolMirrored()) !== !!S.flipZ) ctx.scale(-1, 1);
        if (S.flipX !== boreView) ctx.scale(1, -1);   // vyvrtávání: nůž k ose
        drawDrillTool(ctx, tp, S.view.scale);
        ctx.restore();
      }
      // crosshair at tool center
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5;
      const crossPix = tp.toolShape === 'drill' ? 7 : Math.max(rPix + 4, 7);   // poloha nástroje zůstane vidět i při oddálení (u vrtáku ⌀/2 nedává smysl)
      ctx.beginPath(); ctx.moveTo(pt.x - crossPix, pt.y); ctx.lineTo(pt.x + crossPix, pt.y); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(pt.x, pt.y - crossPix); ctx.lineTo(pt.x, pt.y + crossPix); ctx.stroke();
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(pt.x, pt.y, 2.5, 0, Math.PI * 2); ctx.fill();
    }
  }
}
