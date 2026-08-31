// ╔═════════════════════════╗
// ║  OPERACE: ZÁVITOVÁNÍ            ║
// ╚═════════════════════════╝
// Vyňato z `cam/gcodeEmit.js` (rozdělení podle OPERACÍ, plán §3.A).
// Samostatná operace s vlastním programem: když je aktivní, generátor
// nedělá nic jiného a rovnou vrací hotové řádky.

import { stockClearances } from '../camMath.js';
import { computeThreadPassCuts, threadProfileDepth } from '../threadHelpers.js';
import { buildControlTailLines } from '../controlDialect.js';

/**
 * @param ctx  { S, prms, lines, addCmt, addN, note, arcR, flipArc }
 *             — sdílené emisní prostředí z `generateAutoGCode()`
 * @returns    hotové řádky programu
 */
export function emitThread(ctx) {
  const { S, prms, lines, addCmt, addN, note, arcR, flipArc } = ctx;
  let simCounter = 0;
// ── ZÁVITOVÁNÍ (záložka Závit) ── průchody G33 (Sinumerik/Heidenhain)
// / G32 (Fanuc) s degresivním radiálním přísuvem (√(i/n) — konstantní
// průřez třísky) + jiskřící průchody. Vnější závit: přísuv z ⌀D dolů na
// ⌀(D−2H); vnitřní: z předvrtané díry ⌀(D−2H) nahoru na ⌀D. Otáčky se
// pro závitování přepnou na konstantní (G97) — G96 by měnil otáčky s X
// a stoupání by „uteklo".
  const P = Math.max(0.01, parseFloat(prms.threadPitch) || 1);
  const Dnom = Math.max(0.1, parseFloat(prms.threadDiameter) || 10);
  const H = Math.max(0.01, parseFloat(prms.threadDepth) || threadProfileDepth(prms.threadType, P, prms.threadExternal !== false));
  const ext = prms.threadExternal !== false;
  const zStart = parseFloat(prms.threadZStart) || 0;
  const zEnd = isFinite(parseFloat(prms.threadZEnd)) ? parseFloat(prms.threadZEnd) : zStart - 10;
  const runIn = Math.max(0, parseFloat(prms.threadRunIn) || 0);
  const runOut = Math.max(0, parseFloat(prms.threadRunOut) || 0);
  const spring = Math.max(0, Math.round(parseFloat(prms.threadSpringPasses)) || 0);
  const cuts = computeThreadPassCuts(H, parseFloat(prms.threadPasses) || 0);
  const xd = (v) => prms.mode === 'DIAMON' ? (v * 2).toFixed(3) : v.toFixed(3);
  // Směr řezu: od zStart k zEnd (typicky zprava doleva, Z klesá).
  const dirZ = zEnd < zStart ? -1 : 1;
  const z0 = zStart - dirZ * runIn;        // start s náběhem (rozběh posuvu)
  const zCut = zEnd + dirZ * runOut;       // konec s výběhem
  // Kuželový závit 1:k — poloměr povrchu se mění podél dráhy řezu:
  // slopeR = Δr na 1 mm (Δ⌀ = 1/k na 1 mm). Průchod jede G33 s X i Z
  // (synchronizovaná kuželová interpolace), stoupání zůstává podél Z.
  const taper = parseFloat(prms.threadTaperRatio) || 0;
  const slopeR = taper !== 0 ? 1 / (2 * taper) : 0;
  const distOf = (z) => (z - zStart) / dirZ;                 // vzdálenost podél řezu od Z startu
  const rBase = ext ? Dnom / 2 : Dnom / 2 - H;               // povrch (vnější) / předvrtaná díra (vnitřní) na Z startu
  const rSurfAt = (z) => rBase + slopeR * distOf(z);
  // Konstantní otáčky pro závit: n = Vc·1000/(π·D), omezeno LIMS.
  const lims = parseInt((prms.machineType || '').match(/LIMS=(\d+)/)?.[1]) || 2000;
  const rpm = Math.max(10, Math.min(lims, Math.round((parseFloat(prms.speed) || 100) * 1000 / (Math.PI * Dnom))));
  const clr = Math.max(0.5, stockClearances(prms).x) + 1;
  const rMinor = Dnom / 2 - H;             // poloměr dna profilu (vnější) / předvrtané díry (vnitřní)
  // Odskok mezi průchody musí minout povrch po CELÉ délce (u kužele
  // rozhoduje větší/menší konec).
  const rSurfMax = Math.max(rSurfAt(z0), rSurfAt(zCut));
  const rSurfMin = Math.min(rSurfAt(z0), rSurfAt(zCut));
  const rClear = ext ? rSurfMax + clr : Math.max(0.2, rSurfMin - clr);
  // Způsob přísuvu: radiální (kolmý) / boční po boku profilu / střídavý.
  // Boční = start průchodu se posune v Z o hloubka·tan(ε/2) — G33 drží
  // synchronizaci se vřetenem, takže posun startu posouvá řez v drážce
  // na bok profilu (řeže jen jedna strana špičky). Střídavý znaménko
  // posunu střídá — boky se řežou střídavě (rovnoměrné opotřebení).
  const infeed = prms.threadInfeed === 'flank' || prms.threadInfeed === 'alternate' ? prms.threadInfeed : 'radial';
  const infTan = Math.tan(((parseFloat(prms.threadAngle) || 60) / 2) * Math.PI / 180);
  const zShiftOf = (cum, i) => infeed === 'radial' ? 0
    : infeed === 'flank' ? cum * infTan
    : (i % 2 === 0 ? 1 : -1) * cum * infTan;
  // G33/G32: stoupání K (Sinumerik/Heidenhain ISO) vs. F (Fanuc);
  // kuželový průchod má v bloku i cílové X.
  const thrLine = (z, rTo) => {
    const xWord = taper !== 0 ? ` X${xd(rTo)}` : '';
    return prms.controlSystem === 'fanuc'
      ? `G32 Z${z.toFixed(3)}${xWord} F${P}`
      : `G33 Z${z.toFixed(3)}${xWord} K${P}`;
  };
  const infeedLabel = { radial: 'radialni prisuv', flank: 'bocni prisuv', alternate: 'stridavy prisuv' }[infeed];
  addCmt(`--- ZAVITOVANI ${prms.threadName || `⌀${Dnom}×${P}`} (${ext ? 'vnejsi' : 'vnitrni'}, H=${H.toFixed(3)}, ${cuts.length} pruchodu, ${infeedLabel}${taper !== 0 ? `, kuzel 1:${Math.abs(taper)}` : ''}) ---`);
  if (!ext && rMinor <= 0.05) {
    addCmt(`! Vnitrni zavit: prumer diry ⌀${(rMinor * 2).toFixed(3)} <= 0 — zkontroluj ⌀D a hloubku H. Drahy nevygenerovany.`);
  } else {
    addN(`G97 S${rpm}${note('', 'Konstantní otáčky pro závit')}`);
    simCounter += 1; addN(`G0 X${xd(rClear)} Z${z0.toFixed(3)}${note('', 'Nájezd před závit (náběh)')}`, simCounter);
    let prevCum = 0;
    // Jeden průchod: přejezd na start (Z s bočním posunem), přísuv v X
    // (na kuželu dle povrchu v místě startu), G33 na konec, odskok.
    const onePass = (cum, zShift, label) => {
      const z0i = z0 - dirZ * zShift;
      const rFrom = ext ? rSurfAt(z0i) - cum : rSurfAt(z0i) + cum;
      const rTo = ext ? rSurfAt(zCut) - cum : rSurfAt(zCut) + cum;
      simCounter += 1; addN(`G0 Z${z0i.toFixed(3)}`, simCounter);
      simCounter += 1; addN(`G0 X${xd(rFrom)}${note('', label)}`, simCounter);
      simCounter += 1; addN(thrLine(zCut, rTo), simCounter);
      simCounter += 1; addN(`G0 X${xd(rClear)}${note('', 'Odskok')}`, simCounter);
    };
    cuts.forEach((cum, i) => {
      onePass(cum, zShiftOf(cum, i), `Průchod ${i + 1}/${cuts.length} (ap ${(cum - prevCum).toFixed(3)})`);
      prevCum = cum;
    });
    // Jiskřící průchody na plné hloubce — boční posun jako poslední
    // řezný průchod, ať jedou ve stejné stopě.
    const springShift = zShiftOf(H, cuts.length - 1);
    for (let s = 0; s < spring; s++) onePass(H, springShift, `Jiskřící průchod ${s + 1}`);
    addN(`G0 X${prms.safeX} Z${prms.safeZ}${note('', 'Bezpečná poloha')}`);
    addN(`G96 S${prms.speed}${note('', 'Zpět konst. řezná rychlost')}`);
    buildControlTailLines(prms.controlSystem).forEach(line => addN(line));
  }
  addCmt('--- KONTURA (Pro referenci) ---');
  S.contourPoints.forEach(p => {
    const cmd = (p.type === 'G2' || p.type === 'G3') ? flipArc(p.type) : p.type;
    let line = `${cmd} X${(parseFloat(p.x) || 0)} Z${(parseFloat(p.z) || 0)}`;
    if (p.type === 'G2' || p.type === 'G3') line += ` ${arcR(p.r)}`;
    addCmt(line);
  });
  return lines;
}
