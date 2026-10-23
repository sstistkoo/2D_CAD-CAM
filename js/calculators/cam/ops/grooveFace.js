// ╔══════════════════════════════════════════════════════════════╗
// ║  OPERACE: ČELNÍ (AXIÁLNÍ) ZÁPICH (Upich + ⊚ Čelní) — pravidlo 19 ║
// ╚══════════════════════════════════════════════════════════════╝
//
// docs/cam-pravidla.md, schválil uživatel 23. 10. 2026:
//   • Z čela (`partOffZ`) = povrch, dno = Z čela − hloubka (zprava do −Z,
//     zleva do +Z); ⌀d1 / ⌀d2 (`faceGrooveD1` / `faceGrooveD2`) = stěny.
//   • Osové zápichy vedle sebe radiálně, krok ≤ 0,8 × šířka destičky, od
//     vnitřní stěny ven. Stěny nechají Přídavek X + Přídavek na hotovo,
//     dno Přídavek na hotovo.
//   • Dokončení: vnitřní stěna → dno → vnější stěna → ven; se sražením
//     (grooveChamfer.js) i bez Přídavku na hotovo.
//   • Nástroj: čelní zapichovací nůž (destička natočená −90°, 📚 katalog
//     isoFaceGrooves.js) — zápich v jeho rozsahu průměrů, hloubka ≤ dosah.
//   • Pohyb: před čelo (vůle + rádius), radiálně nad zápich, osově do čela,
//     zpět před čelo.
// Destička natočená −90° zabírá radiálně X ∈ [xRef − (w − r), xRef + r]
// (referenční roh = vnější), osově ostří na Z středu rohu − r (zprava).

import { stockClearances } from '../camMath.js';
import { buildControlTailLines } from '../controlDialect.js';
import { getInsert } from '../inserts/index.js';
import { buildStockLoopRaw } from '../materialRemoval.js';
import { chamferFinishPath } from './grooveChamfer.js';
import { isoFaceGrooveFromName } from '../../isoFaceGrooves.js';

const num = (v, d = 0) => { const x = parseFloat(v); return Number.isFinite(x) ? x : d; };
const STEP_FRAC = 0.8;

/** Je aktivní čelní zápich (Upich + ⊚ Čelní)? */
export function grooveFaceActive(prms) {
  return !!(prms && prms.partOffFace === true && prms.partOffZ != null && isFinite(parseFloat(prms.partOffZ)));
}

/**
 * Geometrie čelního zápichu (sdílí emise, UI i testy).
 * @param stockLoop  polotovar (čelo polotovaru před čelem dílu → bezpečné Z)
 */
export function grooveFaceGeom(prms, stockLoop = null) {
  const k = prms.mode === 'DIAMON' ? 2 : 1;
  const dir = prms.roughingSide === 'left' ? -1 : 1;       // zprava je čelo na +Z, zápich do −Z
  const ins = getInsert(prms);
  const w = ins.widthZ || 0;
  const r = Math.max(0, ins.partOffCornerR || 0);
  const zFace = num(prms.partOffZ, NaN);
  const r1 = num(prms.faceGrooveD1) / 2, r2 = num(prms.faceGrooveD2) / 2;
  const t = num(prms.faceGrooveDepth);
  const allowX = Math.max(0, num(prms.allowanceX));
  const finAllow = Math.max(0, num(prms.finishAllowance));
  const sCh = Math.max(0, num(prms.grooveChamfer));
  const doFinish = !!prms.doFinishing && (finAllow > 1e-6 || sCh > 0);
  const clr = Math.max(0.5, stockClearances(prms).z);
  const out = { ok: false, k, dir, w, r, zFace, r1, r2, t, doFinish, chamfer: sCh };
  const fail = (reason) => ({ ...out, reason });
  const tool = isoFaceGrooveFromName(prms.toolName);

  if (!ins.canPartOff || !(w > 0) || ins.bodySweepZ !== 1) {   // destička natočená do čela (−90°)
    return fail('Čelní zápich potřebuje čelní zapichovací nůž (destička natočená do čela) — 📚 katalog → Čelní zápichy.');
  }
  if (!Number.isFinite(zFace)) return fail('Naklikej Z čela (✂️ Ukázat bod), nebo vezmi zápich ✏ z výkresu.');
  if (!(r1 >= 0) || !(r2 > r1 + 1e-6)) return fail('Zadej vnitřní ⌀d1 a vnější ⌀d2 zápichu (d2 > d1).');
  if (!(t > 0)) return fail('Zadej hloubku čelního zápichu.');
  if (r2 - r1 < w - 1e-6) return fail(`Zápich je užší (${(r2 - r1).toFixed(2)} mm) než destička ${w} mm — vyber užší destičku.`);
  if (tool) {
    if (2 * r1 < tool.dmin - 1e-6 || 2 * r2 > tool.dmax + 1e-6) {
      return fail(`Zápich ⌀${2 * r1}–${2 * r2} neleží v rozsahu čepele ⌀${tool.dmin}–${tool.dmax} — vyber čelní nůž s jiným rozsahem.`);
    }
    if (t > tool.a + 1e-6) return fail(`Zápich je hlubší (${t} mm), než čepel dosáhne (${tool.a} mm) — vyber širší destičku s větším dosahem.`);
  } else {
    return fail('Čelní zápich potřebuje čelní zapichovací nůž z 📚 katalogu (rozsah průměrů a dosah čepele).');
  }

  // Radiálně: destička od u (od vnitřní stěny) zabírá [r1 + u, r1 + u + w];
  // referenční roh (vnější) má střed na r1 + u + w − r.
  const fa = allowX + finAllow;
  const span = (r2 - r1) - 2 * fa;
  if (span < w - 1e-6) return fail(`Zápich ${(r2 - r1).toFixed(2)} mm se s přídavky stěn (2 × ${fa.toFixed(2)}) nevejde na destičku ${w} mm — zmenši přídavky.`);
  const n = span - w < 1e-6 ? 1 : Math.ceil((span - w) / (STEP_FRAC * w)) + 1;
  const step = n > 1 ? (span - w) / (n - 1) : 0;
  const xOfU = (u) => r1 + u + w - r;
  // Osově: střed rohu je o r nad ostřím; d = hloubka od čela do materiálu.
  const zOfD = (d) => zFace - dir * d;
  const zCenter = (d) => zOfD(d) + dir * r;
  const plunges = [];
  for (let i = 0; i < n; i++) plunges.push(xOfU(fa + i * step));
  // Bezpečné Z: před čelo dílu i polotovaru (může přečnívat) o vůli + rádius.
  const zs = (stockLoop || []).map(q => q.z).filter(Number.isFinite);
  const zFront = zs.length ? (dir > 0 ? Math.max(zFace, ...zs) : Math.min(zFace, ...zs)) : zFace;
  const zSafe = zFront + dir * (clr + r);
  // Odtud posuv: nad čelem i nad polotovarem, který čelo ještě přečnívá
  // (nezarovnané čelo se prořízne posuvem, ne rychloposuvem).
  const zStart = zFront + dir * (Math.min(clr, 1) + r);
  const plan = {
    ...out, ok: true, plunges, zSafe, zStart,
    zRough: zCenter(t) + dir * finAllow,                // dno: Přídavek na hotovo zůstává
    zFinal: zCenter(t),
    xFinA: xOfU(allowX), xFinB: xOfU((r2 - r1) - allowX - w),
  };
  if (sCh > 0) {
    // Sražení: u radiálně od vnitřní stěny, d osově od čela (dStart = nad čelem).
    const ch = chamferFinishPath({ s: sCh, uA: allowX, uB: (r2 - r1) - allowX, w, r, depth: t, dStart: -(r + Math.min(clr, 1)) });
    if (!ch.ok) return fail(ch.reason);
    plan.chamferPath = ch.pts.map(q => ({ x: xOfU(q.u), z: zOfD(q.d) }));
  }
  return plan;
}

/**
 * @param ctx { S, calc, prms, lines, addCmt, addN, note }
 */
export function emitGrooveFace(ctx) {
  const { S, calc, prms, lines, addCmt, addN, note } = ctx;
  let stock = null;
  try { stock = buildStockLoopRaw(prms, calc && calc.stockPathSegments); } catch { stock = null; }
  const g = grooveFaceGeom(prms, stock);
  const xd = (v) => (v * g.k).toFixed(3);
  const zs = (v) => v.toFixed(3);
  let sim = 0;
  const N = (txt) => { sim += 1; addN(txt, sim); };
  addCmt(`--- CELNI ZAPICH D${xd(g.r1)}-${xd(g.r2)} hloubka ${g.t} (pravidlo 19) ---`);
  if (!g.ok) {
    addCmt(`! ${g.reason}`);
    if (S.genNotes) S.genNotes.push({ type: 'warning', msg: `Čelní zápich: ${g.reason}` });
    return lines;
  }
  const peck = Math.max(0.1, num(prms.retractDistance, 2));
  const af = Math.max(0, num(prms.partingApproachFeed, 0));
  const F = prms.feed;
  const dir = g.dir;
  // Před čelo, pak radiálně nad zápich.
  N(`G0 Z${zs(g.zSafe)}${note('', 'Před čelo')}`);
  g.plunges.forEach((x, i) => {
    N(`G0 X${xd(x)}${note('', g.plunges.length > 1 ? `Zápich ${i + 1}/${g.plunges.length}` : 'Čelní zápich')}`);
    N(`G0 Z${zs(g.zStart)}`);
    if (prms.partOffSmooth) {
      N(`G1 Z${zs(g.zRough)} F${F}${note('', 'Zápich')}`);
    } else {
      // Peck osově: po hloubce „Vyjezd" zpět nad čelo, rychle k dnu, dál posuvem.
      let z = g.zStart, guard = 0;
      while (dir * (z - g.zRough) > 1e-4 && guard++ < 10000) {
        const next = dir > 0 ? Math.max(g.zRough, z - peck) : Math.min(g.zRough, z + peck);
        if (dir * (g.zStart - z) > 1e-4) N(`G0 Z${zs(z + dir * af)}`);
        N(`G1 Z${zs(next)} F${F}${note('', 'Zápich')}`);
        z = next;
        if (dir * (z - g.zRough) > 1e-4) N(`G0 Z${zs(g.zStart)}${note('', 'Vyjezd – uvolnění třísek')}`);
      }
    }
    N(`G0 Z${zs(g.zSafe)}${note('', 'Vyjezd')}`);
  });
  if (g.chamfer > 0 && !g.doFinish) {
    addCmt('! Srazeni hran dela jen dokoncovaci operace - zapni ji.');
    if (S.genNotes) S.genNotes.push({ type: 'warning', msg: 'Čelní zápich: sražení hran dělá jen dokončení — zapni Dokončovací operaci.' });
  }
  if (g.doFinish && g.chamferPath) {
    const [p0, ...rest] = g.chamferPath;
    // Na začátek sražení posuvem (polotovar může čelo přečnívat).
    N(`G0 X${xd(p0.x)}${note('', `Dokončení se sražením ${g.chamfer}×45°`)}`);
    N(`G0 Z${zs(g.zStart)}`);
    N(`G1 Z${zs(p0.z)} F${F}`);
    rest.forEach((q, i) => N(`G1 X${xd(q.x)} Z${zs(q.z)}${i === 0 ? note('', 'Sražení') : ''}`));
    N(`G0 Z${zs(g.zSafe)}${note('', 'Vyjezd')}`);
  } else if (g.doFinish) {
    N(`G0 X${xd(g.xFinA)}${note('', 'Dokončení – vnitřní stěna')}`);
    N(`G0 Z${zs(g.zStart)}`);
    N(`G1 Z${zs(g.zFinal)} F${F}${note('', 'Dokončovací zápich')}`);
    if (Math.abs(g.xFinB - g.xFinA) > 1e-6) N(`G1 X${xd(g.xFinB)}${note('', 'Dno zápichu')}`);
    N(`G1 Z${zs(g.zStart)}${note('', 'Vnější stěna')}`);
    N(`G0 Z${zs(g.zSafe)}${note('', 'Vyjezd')}`);
  }
  addN(`G0 X${prms.safeX} Z${prms.safeZ}${note('', 'Bezpečná poloha')}`);
  buildControlTailLines(prms.controlSystem).forEach(line => addN(line));
  return lines;
}
