// ╔═══════════════════════════════╗
// ║  OPERACE: UPICHNUTÍ (part-off)      ║
// ╚═══════════════════════════════╝
// Vyňato z `cam/gcodeEmit.js` (rozdělení podle OPERACÍ, plán §3.A).
// Samostatná operace s vlastním programem: když je aktivní, generátor
// nedělá nic jiného a rovnou vrací hotové řádky.

import { stockClearances } from '../camMath.js';
import { partOffGeom } from '../threadHelpers.js';
import { buildControlTailLines } from '../controlDialect.js';

/**
 * @param ctx  { S, calc, prms, lines, addCmt, addN, note, arcR, flipArc }
 *             — sdílené emisní prostředí z `generateAutoGCode()`
 * @returns    hotové řádky programu
 */
export function emitPartOff(ctx) {
  const { S, calc, prms, lines, addCmt, addN, note, arcR, flipArc } = ctx;
  let simCounter = 0;
// ── UPICHNUTÍ (part-off) ── zápich plátkem po SVISLÉ ÚSEČCE v Z=partOffZ.
// Nově se upich chová jako obrábění syntetické (svislé) kontury plátkem
// s korekcí rádiusu a přídavky (viz partOffGeom níže) — ne jako „hloupý"
// radiální zápich na osu. Podporovány jen KULATÝ a UPICHOVACÍ plátek.
//
//  • Přídavek X (allowanceX) = DOJEZD: cílová radiální poloha SPODNÍ HRANY
//    plátku (allowanceX=0 → hrana na X0; =10 → hrana na X10). Referenční
//    bod plátku = střed pracovního rádiusu ⇒ cíl středu = allowanceX + R.
//  • Přídavek Z (allowanceZ) + Přídavek na hotovo (finishAllowance) =
//    přídavek jen v ose Z; hrubování odsazeno o (allowanceZ+finishAllowance)
//    od roviny řezu, dokončení jede přesně na partOffZ.
//  • Strana (roughingSide) určuje znaménko Z-offsetu (tělo plátku sedí do
//    už obrobené zóny).
// Peck (lámání třísky) zachován: po hloubce „Vyjezd" (retractDistance) plátek
// vyjede, rychloposuvem zpět až partingApproachFeed mm nad dno, pak posuvem F.
  const geom = partOffGeom(prms, calc);   // společná geometrie (i pro vizualizaci)
  const xd = (v) => prms.mode === 'DIAMON' ? (v * 2).toFixed(3) : v.toFixed(3);
  const pz = geom.pz;
  const peck = Math.max(0.1, parseFloat(prms.retractDistance) || 2);
  const af = Math.max(0, parseFloat(prms.partingApproachFeed));
  const clr = Math.max(0.5, stockClearances(prms).x);
  const xCenterStart = geom.xCenterStart;  // odkud jede posuv (rychloposuv sem)
  const xCenterTarget = geom.xCenterTarget; // střed plátku, spodní hrana na dojezdu
  const xClear = geom.xCenterTop + clr;
  addCmt('--- UPICHNUTI ---');
  if (!geom.canCut) {
    addCmt(geom.reason);
  } else {
    // Jeden zápichový cyklus (peck) na dané Z rovině, střed jede k xTarget.
    // Posuv začíná od Start X (xCenterStart) — z povrchu se sem dojede G0.
    const peckPlunge = (zc, label) => {
      simCounter += 1; addN(`G0 Z${zc.toFixed(3)}${note('', label)}`, simCounter);
      simCounter += 1; addN(`G0 X${xd(xClear)}`, simCounter);
      let depth = xCenterStart;
      let guard = 0;
      while (depth > xCenterTarget + 1e-4 && guard++ < 10000) {
        const nextDepth = Math.max(xCenterTarget, depth - peck);
        // rychloposuv zpět na af mm nad aktuální dno (u prvního na Start X)
        simCounter += 1; addN(`G0 X${xd(depth + af)}`, simCounter);
        simCounter += 1; addN(`G1 X${xd(nextDepth)} F${prms.feed}${note('', 'Zápich')}`, simCounter);
        depth = nextDepth;
        // Výjezd pro uvolnění třísek jen na Start X (xCenterStart), ne nad
        // celý polotovar — v kapse zůstane nástroj blízko a šetří čas.
        if (depth > xCenterTarget + 1e-4) { simCounter += 1; addN(`G0 X${xd(xCenterStart)}${note('', 'Vyjezd – uvolnění třísek')}`, simCounter); }
      }
      simCounter += 1; addN(`G0 X${xd(xClear)}${note('', 'Vyjezd')}`, simCounter);
    };
    // Plynulý zápich = jeden posuv F na dno, bez peckování (výjezdů).
    // Rychloposuvem na Start X, odtud posuvem na dno.
    const smoothPlunge = (zc, label, cutCmt = 'Zápich') => {
      simCounter += 1; addN(`G0 Z${zc.toFixed(3)}${note('', label)}`, simCounter);
      simCounter += 1; addN(`G0 X${xd(xCenterStart)}`, simCounter);
      simCounter += 1; addN(`G1 X${xd(xCenterTarget)} F${prms.feed}${note('', cutCmt)}`, simCounter);
      simCounter += 1; addN(`G0 X${xd(xClear)}${note('', 'Vyjezd')}`, simCounter);
    };
    // Hlavní (hrubovací / jediný) zápich: plynule nebo peckovaně dle volby.
    const mainPlunge = prms.partOffSmooth ? smoothPlunge : peckPlunge;
    // Hlavní zápich VŽDY na zRough (nechá Přídavek Z i Přídavek na hotovo).
    // Dokončovací (plynulá) dráha jede jen se zapnutou „Dokončovací operace"
    // — odebere Přídavek na hotovo až na finální rovinu (zFinal).
    mainPlunge(geom.zRough, geom.doFinish ? 'Rovina upichnutí – hrubování' : 'Rychloposuv na rovinu upichnutí');
    if (geom.doFinish) {
      smoothPlunge(geom.zFinal, 'Dokončení – rovina řezu (plynule)', 'Dokončovací zápich');
    }
    addN(`G0 X${prms.safeX} Z${prms.safeZ}${note('', 'Bezpečná poloha')}`);
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
