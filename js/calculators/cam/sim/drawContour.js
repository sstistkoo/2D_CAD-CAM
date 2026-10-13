// Kreslení plátna simulátoru — kontura a čáry kolem ní: hotová kontura,
// auto-profil (Hlídat geometrii), náhled a body trasování profilu, úseky
// mimo dosah destičky (ostří, hřbet), konstrukční čáry a offsetové čáry
// (hrubovací, hotovní, nedosažitelné dokončení). Vyňato z draw()
// v camSimulator.js (Fáze 5); vrstvy skládá drawCanvas.js.
import { getArcParams, arcSteps, getNormal } from '../camMath.js';
import { guidePolyPoints } from '../interferenceGuides.js';

/** @param f snímek kreslení z drawCanvas(): { S, ctx, calc, prms, C, toScreen, _drawPointsContour } */
export function drawContourLayer(f) {
  const { S, ctx, calc, prms, C, toScreen } = f;
  const { _drawPointsContour } = f;

  // contour
  if (calc.worldPoints.length > 0 && !calc.profileViewActive) {
    ctx.beginPath();
    const start = toScreen(calc.worldPoints[0].xReal, calc.worldPoints[0].zReal);
    ctx.moveTo(start.x, start.y);
    for (let i = 0; i < calc.worldPoints.length - 1; i++) {
      const p1 = calc.worldPoints[i], p2 = calc.worldPoints[i + 1];
      const ptEnd = toScreen(p2.xReal, p2.zReal);
      if (p2.type === 'G0') {
        // G0 = mezera mezi nesouvisejícími entitami — nic nevykreslovat,
        // jen přesunout "pero" na začátek dalšího úseku.
        ctx.moveTo(ptEnd.x, ptEnd.y);
      } else if (p2.type === 'G1') {
        ctx.lineTo(ptEnd.x, ptEnd.y);
      } else if (p2.type === 'G2' || p2.type === 'G3') {
        const arc = getArcParams({ x: p1.xReal, z: p1.zReal }, { x: p2.xReal, z: p2.zReal }, p2.rVal, p2.type);
        if (!arc.error) {
          const steps = arcSteps(arc.r, S.view.scale);
          let sA = Math.atan2(p1.xReal - arc.cx, p1.zReal - arc.cz);
          let eA = Math.atan2(p2.xReal - arc.cx, p2.zReal - arc.cz);
          if (p2.type === 'G2' && eA > sA) eA -= 2 * Math.PI;
          if (p2.type === 'G3' && eA < sA) eA += 2 * Math.PI;
          for (let j = 1; j <= steps; j++) {
            const a = sA + (eA - sA) * (j / steps);
            const pt = toScreen(arc.cx + Math.sin(a) * arc.r, arc.cz + Math.cos(a) * arc.r);
            ctx.lineTo(pt.x, pt.y);
          }
        } else ctx.lineTo(ptEnd.x, ptEnd.y);
      }
    }
    ctx.strokeStyle = (S._previewContour || calc.profileViewActive) ? 'rgba(137,180,250,0.2)' : C.contour; ctx.lineWidth = calc.profileViewActive ? 1.5 : 3; ctx.stroke();

    // Úseky kontury vzniklé z geometrie destičky (profilování po mezní
    // čáře) — odlišná barva, ať je poznat. Berou se ale jako normální
    // kontura (G1). Při náhledu profilu se nekreslí (kontura je ztlumená).
    if (!S._previewContour) {
      ctx.beginPath();
      let anyIns = false;
      for (let i = 0; i < calc.worldPoints.length - 1; i++) {
        const p2 = calc.worldPoints[i + 1];
        if (!p2.fromInsert || p2.type === 'G0') continue;
        const a = toScreen(calc.worldPoints[i].xReal, calc.worldPoints[i].zReal);
        const b = toScreen(p2.xReal, p2.zReal);
        ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); anyIns = true;
      }
      if (anyIns) { ctx.strokeStyle = '#fab387'; ctx.lineWidth = 3; ctx.stroke(); }
    }
  }

  // Auto-profil (Hlídat geometrii): mostové úseky z geometrie destičky,
  // které automaticky nahradily nedosažitelnou část kontury — oranžově,
  // ať je profil vidět (offsety/CNC jedou po této obrobitelné kontuře).
  if (calc.machinableContour && !S._previewContour) {
    ctx.beginPath();
    let anyM = false;
    for (const s of calc.machinableContour) {
      if (!s.fromInsert || s.type !== 'line' || s.isDegenerate) continue;
      const a = toScreen(s.p1.x, s.p1.z), b = toScreen(s.p2.x, s.p2.z);
      ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); anyM = true;
    }
    if (anyM) { ctx.strokeStyle = '#fab387'; ctx.lineWidth = 3; ctx.stroke(); }
  }

  // Náhled trasovaného profilu (číslovaná kontura čekající na potvrzení)
  if (S._previewContour) {
    _drawPointsContour(S._previewContour, toScreen, C.pass, true);
  }

  // Body trasování v průběhu (před dokončením)
  if (S.profileTraceMode && S._tracePoints.length > 0) {
    const tracePts = [{ ...S._tracePoints[0], type: 'G0' }];
    for (let i = 0; i < S._traceSegs.length; i++) {
      const seg = S._traceSegs[i];
      tracePts.push({ ...S._tracePoints[i + 1], type: seg.type, r: seg.r || 0 });
    }
    _drawPointsContour(tracePts, toScreen, C.trace, true);
  }

  // Náhledová čára k pozici kurzoru — jen v režimu „Mimo body" (jinak by
  // překážela); úhlový snap se aplikuje už na S._traceCursor (mousemove).
  if (S.profileTraceMode && S._traceFreeClick && S._traceCursor && S._tracePoints.length > 0) {
    const last = S._tracePoints[S._tracePoints.length - 1];
    const a = toScreen(last.x, last.z), b = toScreen(S._traceCursor.x, S._traceCursor.z);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.strokeStyle = C.trace; ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 4]);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // zvýraznění úseků kontury, kam destička dle svého tvaru/natočení
  // nedosáhne beze zbytku materiálu (kolize bočním ostřím)
  if (calc.interferenceSegments && calc.interferenceSegments.length > 0) {
    ctx.beginPath();
    calc.interferenceSegments.forEach(seg => {
      if (seg.type === 'line') {
        const p1 = toScreen(seg.p1.x, seg.p1.z), p2 = toScreen(seg.p2.x, seg.p2.z);
        ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y);
      } else if (seg.type === 'arc') {
        const steps = arcSteps(seg.r, S.view.scale);
        let sA = Math.atan2(seg.p1.x - seg.cx, seg.p1.z - seg.cz);
        let eA = Math.atan2(seg.p2.x - seg.cx, seg.p2.z - seg.cz);
        if (seg.dir === 'G2' && eA > sA) eA -= 2 * Math.PI;
        if (seg.dir === 'G3' && eA < sA) eA += 2 * Math.PI;
        for (let j = 0; j <= steps; j++) {
          const a = sA + (eA - sA) * (j / steps);
          const pt = toScreen(seg.cx + Math.sin(a) * seg.r, seg.cz + Math.cos(a) * seg.r);
          if (j === 0) ctx.moveTo(pt.x, pt.y); else ctx.lineTo(pt.x, pt.y);
        }
      }
    });
    ctx.strokeStyle = C.error; ctx.lineWidth = 5; ctx.setLineDash([4, 3]); ctx.stroke(); ctx.setLineDash([]);
  }

  // oranžové zvýraznění: hřbet destičky koliduje s materiálem (α příliš malý)
  if (calc.flankSegments && calc.flankSegments.length > 0) {
    ctx.beginPath();
    calc.flankSegments.forEach(seg => {
      if (seg.type === 'line') {
        const p1 = toScreen(seg.p1.x, seg.p1.z), p2 = toScreen(seg.p2.x, seg.p2.z);
        ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y);
      } else if (seg.type === 'arc') {
        const steps = arcSteps(seg.r, S.view.scale);
        let sA = Math.atan2(seg.p1.x - seg.cx, seg.p1.z - seg.cz);
        let eA = Math.atan2(seg.p2.x - seg.cx, seg.p2.z - seg.cz);
        if (seg.dir === 'G2' && eA > sA) eA -= 2 * Math.PI;
        if (seg.dir === 'G3' && eA < sA) eA += 2 * Math.PI;
        for (let j = 0; j <= steps; j++) {
          const a = sA + (eA - sA) * (j / steps);
          const pt = toScreen(seg.cx + Math.sin(a) * seg.r, seg.cz + Math.cos(a) * seg.r);
          if (j === 0) ctx.moveTo(pt.x, pt.y); else ctx.lineTo(pt.x, pt.y);
        }
      }
    });
    ctx.strokeStyle = '#fab387'; ctx.lineWidth = 4; ctx.setLineDash([6, 3]); ctx.stroke(); ctx.setLineDash([]);
  }

  // pomocné (konstrukční) čáry — ruční tečny z nástroje Úhel (žluté)
  // + automatické mezní čáry hran destičky (tyrkysové). Ke každé se
  // kreslí i offset o rádius plátku (kam dojede STŘED plátku) a malé
  // kroužky na koncových bodech (tečné body / průsečíky) pro klikání.
  {
    const allGuides = [
      ...(S.guideLines || []).map(g => ({ ...g, auto: false })),
      ...((calc.interferenceGuides || []).map(g => ({ ...g, auto: true })))
    ];
    if (allGuides.length > 0) {
      const tipROff = parseFloat(prms.toolRadius) || 0;
      allGuides.forEach(g => {
        const col = g.auto ? '#94e2d5' : C.tool;
        // Uživatelské konstrukční čáry jsou NEKONEČNÉ jen v režimu úpravy
        // (odemčeno) – slouží jako reference pro prodloužení/snap. Po zamčení
        // se zkrátí ke svým skutečným koncovým bodům.
        // Lomená čára (hlídání držáku, g.via) se kreslí po vrcholech; přímá
        // jako dřív. Uživatelská čára v režimu úprav je nekonečná.
        let poly = guidePolyPoints(g);
        if (!g.auto && S.gcodeEditEnabled && (!g.via || !g.via.length)) {
          let dx = g.x2 - g.x1, dz = g.z2 - g.z1; const L = Math.hypot(dx, dz);
          if (L > 1e-9) {
            dx /= L; dz /= L;
            poly = [{ x: g.x2 + dx * 1e4, z: g.z2 + dz * 1e4 }, { x: g.x1 - dx * 1e4, z: g.z1 - dz * 1e4 }];
          }
        }
        ctx.beginPath();
        poly.forEach((q, qi) => {
          const p = toScreen(q.x, q.z);
          if (qi === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
        });
        // Čelní mezní čára končící na polotovaru (downOnStock) = PLNÁ (mění
        // obrobitelnou konturu); ostatní mezní čáry čárkovaně.
        // PLNÁ je i mez ZANOŘENÍ kulaté destičky (`plungeLimit`): konturu
        // sice nemění, ale je to stejně platná mez jako u polygonu a
        // uživatel ji chce vidět stejně (rozhodnutí 8. 9. 2026).
        ctx.strokeStyle = col; ctx.lineWidth = 1.5;
        ctx.setLineDash((g.downOnStock || g.plungeLimit) ? [] : [8, 4]); ctx.stroke(); ctx.setLineDash([]);
        // Offset dráhy středu plátku (korekce R) na stranu vzduchu (+X).
        // DVĚ ČÁRY: hrubovací (R + Přídavek X/Z + Přídavek na hotovo) a
        // HOTOVNÍ (jen R). Obě, i když se dokončování nejede — uživatel je
        // chce vidět obě (17. 9. 2026: *„přidej tam i tu hotovní"*), protože
        // jsou to hranice, ne dráhy. Bez přídavků obě splývají a zůstává
        // jediná.
        // (Mezitím byla hotovní schovaná pod přepínač REF. To bylo špatné
        // čtení dřívější připomínky: uživateli vadilo, že obě visely KOLMO
        // od čáry s konci ve vzduchu, ne že jsou dvě.)
        // Napojenou (oříznutou) podobu si mezní čára nese z výpočtu
        // (`offRough`/`offFinish`, guideOffsetJoin.js) — pak se kreslí
        // přesně ta, kterou má v sobě offsetový řetěz.
        if (tipROff > 0) {
          const aX = parseFloat(prms.allowanceX) || 0;
          const aZ = parseFloat(prms.allowanceZ) || 0;
          const fin = parseFloat(prms.finishAllowance) || 0;
          const hasRough = aX > 1e-9 || aZ > 1e-9 || fin > 1e-9;
          const drawOff = (rOff, aXo, aZo, joined) => {
            ctx.beginPath();
            if (joined) {
              const o1 = toScreen(joined.p1.x, joined.p1.z);
              const o2 = toScreen(joined.p2.x, joined.p2.z);
              ctx.moveTo(o1.x, o1.y); ctx.lineTo(o2.x, o2.y);
            } else {
              for (let k = 0; k + 1 < poly.length; k++) {
                let n = getNormal(poly[k], poly[k + 1]);
                if (n.x < 0 || (Math.abs(n.x) < 1e-9 && n.z < 0)) n = { x: -n.x, z: -n.z };
                const ox = n.x * (rOff + aXo), oz = n.z * (rOff + aZo);
                const o1 = toScreen(poly[k].x + ox, poly[k].z + oz);
                const o2 = toScreen(poly[k + 1].x + ox, poly[k + 1].z + oz);
                ctx.moveTo(o1.x, o1.y); ctx.lineTo(o2.x, o2.y);
              }
            }
            ctx.strokeStyle = col; ctx.lineWidth = 1; ctx.setLineDash([2, 3]); ctx.stroke(); ctx.setLineDash([]);
          };
          // Bez přídavků je hrubovací offset zároveň ten hotovní — kreslí
          // se jednou a napojenou podobu si nese pod `offRough`.
          if (hasRough) drawOff(tipROff + fin, aX, aZ, g.offRough);
          else drawOff(tipROff, 0, 0, g.offRough);
          if (hasRough) drawOff(tipROff, 0, 0, g.offFinish);
        }
        // koncové body (PŮVODNÍ konce) — viditelné a uchopitelné (tažení po
        // čáře = prodloužit/zkrátit; "+" vloží bod kontury v tečném bodě)
        const c1 = toScreen(g.x1, g.z1), c2 = toScreen(g.x2, g.z2);
        ctx.fillStyle = col;
        for (const q of [c1, c2]) { ctx.beginPath(); ctx.arc(q.x, q.y, 4, 0, Math.PI * 2); ctx.fill(); }
      });
    }
  }

  // offset path — v 🙈 stavu (none) skryjeme všechny drahy
  if (S.showSimPath !== 'none' && calc.offsetPath.length > 0) {
    ctx.beginPath();
    calc.offsetPath.forEach((seg, i) => {
      if (seg.isDegenerate) return;
      if (seg.type === 'line') {
        const p1 = toScreen(seg.p1.x, seg.p1.z), p2 = toScreen(seg.p2.x, seg.p2.z);
        if (i === 0 || seg.chainBreak) ctx.moveTo(p1.x, p1.y); else ctx.lineTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
      } else if (seg.type === 'arc') {
        const steps = arcSteps(seg.r, S.view.scale);
        let sA = seg.startAngle, eA = seg.endAngle;
        if (seg.dir === 'G2' && eA > sA) eA -= 2 * Math.PI;
        if (seg.dir === 'G3' && eA < sA) eA += 2 * Math.PI;
        for (let j = 0; j <= steps; j++) {
          const a = sA + (eA - sA) * (j / steps);
          const pt = toScreen(seg.cx + Math.sin(a) * seg.r, seg.cz + Math.cos(a) * seg.r);
          if (j === 0 && (i === 0 || seg.chainBreak)) ctx.moveTo(pt.x, pt.y);
          else ctx.lineTo(pt.x, pt.y);
        }
      }
    });
    ctx.strokeStyle = C.offset; ctx.lineWidth = 1; ctx.setLineDash([2, 2]); ctx.stroke(); ctx.setLineDash([]);
  }

  // HOTOVNÍ offset kontury (jen rádius plátku, bez přídavků) — druhá
  // tečkovaná čára vedle hrubovacího offsetu, stejně jako u mezních čar
  // hlídání destičky. Čistá GEOMETRIE „kam dojede střed plátku na hotovo",
  // ne dráha — kreslí se i s vypnutým Dokončováním. Prázdné pole, když
  // žádný přídavek není (pak by splynula s hrubovacím offsetem).
  //
  // KRESLÍ SE VŽDY (rozhodnutí uživatele 17. 9. 2026: *„ať jsou tam ty dvě
  // offsetové čáry, jedna od přídavku na hotovo a další na hotovo — je tam
  // většinou jenom jedna"*). Přepínač REF, pod který spadla 15. 9., řídí od
  // teď už jen tečkovanou PLÁNOVACÍ hranici polotovaru — ta zůstává
  // referencí, po které se opravdu nejezdí.
  if (S.showSimPath !== 'none' && (calc.finishRefPath || []).length > 0) {
    ctx.beginPath();
    calc.finishRefPath.forEach((seg, i) => {
      if (seg.isDegenerate) return;
      if (seg.type === 'line') {
        const p1 = toScreen(seg.p1.x, seg.p1.z), p2 = toScreen(seg.p2.x, seg.p2.z);
        if (i === 0 || seg.chainBreak) ctx.moveTo(p1.x, p1.y); else ctx.lineTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
      } else if (seg.type === 'arc') {
        const steps = arcSteps(seg.r, S.view.scale);
        let sA = seg.startAngle, eA = seg.endAngle;
        if (seg.dir === 'G2' && eA > sA) eA -= 2 * Math.PI;
        if (seg.dir === 'G3' && eA < sA) eA += 2 * Math.PI;
        for (let j = 0; j <= steps; j++) {
          const a = sA + (eA - sA) * (j / steps);
          const pt = toScreen(seg.cx + Math.sin(a) * seg.r, seg.cz + Math.cos(a) * seg.r);
          if (j === 0 && (i === 0 || seg.chainBreak)) ctx.moveTo(pt.x, pt.y);
          else ctx.lineTo(pt.x, pt.y);
        }
      }
    });
    ctx.strokeStyle = C.finish; ctx.lineWidth = 1; ctx.setLineDash([2, 3]); ctx.stroke(); ctx.setLineDash([]);
  }

  // finish path — kreslí simPath (zelená), finishOffsetPath overlay odstraněn

  // Nedosažitelný dokončovací offset (Hlídat geometrii destičky) —
  // tečkovaně: úseky, kam destička bočním ostřím nedosáhne, takže se
  // neobrobí, ale je vidět, že tam kontura nebude objeta.
  if (S.showSimPath !== 'none' && (prms.doFinishing || prms.finishOnly) && (calc.finishUnreachablePath || []).length > 0) {
    ctx.beginPath();
    calc.finishUnreachablePath.forEach(seg => {
      // Kus pod mezní čarou zanoření (pravidlo 15, ops/finishSteep.js) se
      // nekreslí — zůstávají jen dráhy podél mezní čáry (uživatel 7. 10. 2026).
      if (seg.isDegenerate || seg.belowPlunge) return;
      if (seg.type === 'line') {
        const p1 = toScreen(seg.p1.x, seg.p1.z), p2 = toScreen(seg.p2.x, seg.p2.z);
        ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y);
      } else if (seg.type === 'arc') {
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
    });
    ctx.strokeStyle = C.finish; ctx.lineWidth = 1.5; ctx.setLineDash([2, 4]); ctx.stroke(); ctx.setLineDash([]);
  }
}
