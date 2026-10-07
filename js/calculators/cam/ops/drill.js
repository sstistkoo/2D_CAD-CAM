// ╔═════════════════════════╗
// ║  OPERACE: VRTÁNÍ                ║
// ╚═════════════════════════╝
// Vrtání v ose soustruhu (X0) vrtákem (nástroj ⌀, inserts/drill.js).
// Samostatná operace s vlastním programem jako závit a upich: když je
// aktivní, generátor nedělá nic jiného a rovnou vrací hotové řádky.
//
// Cyklus se píše ROZEPSANĚ (G0/G1/G4), ne jako CYCLE83 / G83 / CYCL DEF 200:
// takový program jede na každém řídicím systému stejně, simulátor ho přehraje
// bez vlastního interpretu cyklů a v programu je vidět každý záběr.
//
//   Vyjíždění (G83)       — po každém záběru Q rychloposuvem z díry ven
//                           (odvod třísky), zpět rychloposuvem až `drillRetract`
//                           nad dno a dál posuvem.
//   Lámání třísky (G73)   — po každém záběru jen odskok o `drillRetract`.
//
// Hloubka se měří od Z čela (`drillZStart`) ve směru vrtání: zprava (výchozí)
// k −Z, zleva k +Z. „Na plný ⌀" přidá osovou délku špičky (pointLengthZ).
// Otáčky jsou konstantní (G97): v ose by G96 vyhnal vřeteno na LIMS.

import { stockClearances } from '../camMath.js';
import { buildStockLoopRaw } from '../materialRemoval.js';
import { getInsert } from '../inserts/index.js';
import { buildControlTailLines } from '../controlDialect.js';
import { resolvePointsToAbsolute } from '../contourBuild.js';
import { polyIntersect } from '../../../geom/geomCore.js';

const num = (v, d) => { const n = parseFloat(v); return Number.isFinite(n) ? n : d; };
const f3 = (v) => (Math.abs(v) < 5e-4 ? 0 : v).toFixed(3);

/**
 * Z čela dílu na straně obrábění — kde díra začíná, když „Z čelo" není
 * zadané (`drillZStart` null). Zprava nejvyšší Z kontury, zleva nejnižší.
 * Výchozí Z0 vrtalo u dílu nakresleného od Z0 doprava od LEVÉHO konce přes
 * celý kus (nález uživatele 7. 10. 2026: čelo Z346, dno vyšlo Z−51,5).
 * @returns {number|null} null = kontura není
 */
export function drillAutoFaceZ(S) {
  const pts = resolvePointsToAbsolute((S && S.contourPoints) || []);
  if (!pts.length) return null;
  const zs = pts.map(p => p.zAbs);
  return (S.params && S.params.roughingSide) === 'left' ? Math.min(...zs) : Math.max(...zs);
}

/**
 * Geometrie vrtání z parametrů — sdílí emise i náhled/hlášky v UI.
 * `faceZ` = čelo dílu (drillAutoFaceZ), platí když Z čelo není zadané.
 * `stockLoop` = obrys polotovaru (buildStockLoopRaw) — z něj R rovina
 * (radiální rychloposuvy mimo celý polotovar) a místo, kde vrták v ose
 * VJEDE do materiálu: od něj se počítají záběry Q. Neobrobený odlitek před
 * čelem dílu je taky materiál — dřív se Q měřilo od čela dílu a první záběr
 * jel 22 mm odlitku + Q najednou (nález uživatele 7. 10. 2026, ⌀5: 5,6×⌀).
 * @returns {{ok:boolean, reason?:string, dir:number, zFace:number, zFaceAuto:boolean,
 *   zEntry:number, zR:number, zStockFace:number|null, zBottom:number, targets:number[],
 *   D:number, rpm:number, mode:'clear'|'break', retract:number, dwell:number, reach:number}}
 */
export function drillGeom(prms, { faceZ = null, stockLoop = null } = {}) {
  const ins = getInsert(prms);
  const D = 2 * Math.max(num(prms.toolRadius, 0), 0);
  const dir = prms.roughingSide === 'left' ? 1 : -1;
  const zFaceSet = prms.drillZStart !== null && prms.drillZStart !== '' && Number.isFinite(parseFloat(prms.drillZStart));
  const zFace = zFaceSet ? parseFloat(prms.drillZStart) : (Number.isFinite(faceZ) ? faceZ : 0);
  const depth = Math.max(0, num(prms.drillDepth, 0));
  const total = depth + (prms.drillDepthFullDia ? ins.pointLengthZ : 0);
  const zBottom = zFace + dir * total;
  const back = (a, b) => (dir < 0 ? Math.max(a, b) : Math.min(a, b));   // dál od díry (ven)
  // R rovina (odtud posuv, sem výjezdy) nesmí ležet v polotovaru ani v pásu
  // vůle před ním — polotovar končí až na offsetové čáře (odlitek může být
  // větší, rozhodnutí uživatele 20. 8. 2026), takže rychloposuv k čelu se
  // zastaví na ní a zbytek jede posuvem. Bere se CELÝ polotovar: radiální
  // přejezd do osy vede přes všechny poloměry.
  let zR = zFace - dir * Math.max(0.1, num(prms.drillClearance, 2));
  let zEntry = zFace, zStockFace = null;
  const D0 = 2 * Math.max(num(prms.toolRadius, 0), 0);
  if (stockLoop && stockLoop.length >= 3) {
    const zs = stockLoop.map(p => p.z);
    zStockFace = dir < 0 ? Math.max(...zs) : Math.min(...zs);
    zR = back(zR, zStockFace - dir * stockClearances(prms).z);
    // Vjezd do materiálu V OSE: polotovar v pásu ⌀ vrtáku (u odlitku může
    // čelo v ose ležet jinde než nejvzdálenější bod obrysu).
    const r = Math.max(D0 / 2, 0.05), far = 1e5;
    let band = [];
    try { band = polyIntersect([stockLoop], [[{ x: -r, z: -far }, { x: r, z: -far }, { x: r, z: far }, { x: -r, z: far }]]); } catch { band = []; }
    const bz = band.flat().map(p => p.z);
    if (bz.length) zEntry = back(zFace, dir < 0 ? Math.max(...bz) : Math.min(...bz));
  }
  const Q = Math.max(0, num(prms.drillPeck, 0));
  const totalCut = Math.abs(zBottom - zEntry);
  const targets = [];
  if (Q > 0) for (let d = Q; d < totalCut - 1e-6 && targets.length < 5000; d += Q) targets.push(zEntry + dir * d);
  targets.push(zBottom);
  const lims = parseInt((prms.machineType || '').match(/LIMS=(\d+)/)?.[1]) || 2000;
  const rpm = D > 0 ? Math.max(10, Math.min(lims, Math.round(num(prms.speed, 25) * 1000 / (Math.PI * D)))) : 0;
  const g = {
    ok: true, dir, zFace, zFaceAuto: !zFaceSet, zEntry, zR, zStockFace, zBottom, targets, D, rpm,
    mode: prms.drillChipMode === 'break' ? 'break' : 'clear',
    retract: Math.max(0.1, num(prms.drillRetract, 1)),
    dwell: Math.max(0, num(prms.drillDwell, 0)),
    reach: ins.holderSeatZ,   // vyložení — kam až smí vrták do díry
  };
  if (!ins.canDrill) return { ...g, ok: false, reason: 'Nastroj neni vrtak — vrtani vyzaduje nastroj ⌀ vrtak (Nastroj → tvar ⌀). Drahy nevygenerovany.' };
  if (!(D > 0)) return { ...g, ok: false, reason: 'Prumer vrtaku je 0 — drahy nevygenerovany.' };
  if (!(total > 0)) return { ...g, ok: false, reason: 'Hloubka vrtani je 0 — drahy nevygenerovany.' };
  return g;
}

/** Prodleva na dně v dialektu řídicího systému. */
function dwellLine(ctrl, sec) {
  if (ctrl === 'fanuc') return `G04 P${Math.round(sec * 1000)}`;   // P = ms (X/U by simulace četla jako pohyb)
  if (ctrl === 'heidenhain') return `G04 F${sec}`;
  return `G4 F${sec}`;
}

/**
 * @param ctx  { S, calc, prms, lines, addCmt, addN, note, arcR, flipArc }
 *             — sdílené emisní prostředí z `generateAutoGCode()`
 * @returns    hotové řádky programu
 */
export function emitDrill(ctx) {
  const { S, calc, prms, lines, addCmt, addN, note, arcR, flipArc } = ctx;
  let simCounter = 0;
  const stock = buildStockLoopRaw(prms, calc && calc.stockPathSegments);
  const g = drillGeom(prms, { faceZ: drillAutoFaceZ(S), stockLoop: stock });
  const label = { clear: 'vyjizdeni', break: 'lamani trisky' }[g.mode];
  addCmt(`--- VRTANI ⌀${g.D} (hloubka ${Math.abs(g.zBottom - g.zFace).toFixed(3)}, ${g.targets.length} zaber${g.targets.length > 1 ? `u, ${label}` : ''}) ---`);
  if (!g.ok) {
    addCmt(`! ${g.reason}`);
  } else {
    const { dir, zR, zBottom, targets } = g;   // R rovina mimo polotovar — viz drillGeom
    // Vyložení: špička na dně, pouzdro začíná o `reach` dál od díry.
    if (g.zStockFace !== null && S.genNotes) {
      const inside = (g.zStockFace - zBottom) * -dir;   // jak hluboko pod čelem polotovaru je špička
      if (inside > g.reach + 1e-6) {
        S.genNotes.push({ type: 'warning', msg: `Vrtání: díra sahá ${inside.toFixed(1)} mm pod čelo polotovaru, ale vyložení vrtáku je jen ${g.reach.toFixed(1)} mm — do čela narazí sklíčidlo/pouzdro. Prodlužte vyložení nebo zkraťte hloubku.` });
      }
    }
    addN(`G97 S${g.rpm}${note('', 'Konstantní otáčky pro vrtání')}`);
    simCounter += 1; addN(`G0 Z${f3(zR)}${note('', 'R rovina před čelem (mimo polotovar)')}`, simCounter);
    simCounter += 1; addN(`G0 X0${note('', 'Do osy')}`, simCounter);
    let prev = null;
    targets.forEach((t, i) => {
      if (prev !== null) {
        if (g.mode === 'clear') {
          simCounter += 1; addN(`G0 Z${f3(zR)}${note('', 'Vyjetí – odvod třísky')}`, simCounter);
          simCounter += 1; addN(`G0 Z${f3(prev - dir * g.retract)}${note('', 'Zpět nad dno')}`, simCounter);
        } else {
          simCounter += 1; addN(`G0 Z${f3(prev - dir * g.retract)}${note('', 'Odskok – lámání třísky')}`, simCounter);
        }
      }
      simCounter += 1; addN(`G1 Z${f3(t)} F${prms.feed}${note('', targets.length > 1 ? `Vrtání ${i + 1}/${targets.length}` : 'Vrtání')}`, simCounter);
      prev = t;
    });
    if (g.dwell > 0) addN(`${dwellLine(prms.controlSystem, g.dwell)}${note('', 'Prodleva na dně')}`);
    simCounter += 1; addN(`G0 Z${f3(zR)}${note('', 'Vyjetí z díry')}`, simCounter);
    // Nejdřív radiálně ven, pak v Z — zleva by šikmý přejezd na bezpečnou
    // polohu (ta bývá vpravo) vedl skrz díl.
    simCounter += 1; addN(`G0 X${prms.safeX}${note('', 'Bezpečná poloha')}`, simCounter);
    simCounter += 1; addN(`G0 Z${prms.safeZ}`, simCounter);
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
