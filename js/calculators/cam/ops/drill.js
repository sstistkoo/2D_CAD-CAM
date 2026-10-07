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

const num = (v, d) => { const n = parseFloat(v); return Number.isFinite(n) ? n : d; };
const f3 = (v) => (Math.abs(v) < 5e-4 ? 0 : v).toFixed(3);

/**
 * Geometrie vrtání z parametrů — sdílí emise i náhled/hlášky v UI.
 * @returns {{ok:boolean, reason?:string, dir:number, zFace:number, zR:number,
 *   zBottom:number, targets:number[], D:number, rpm:number, mode:'clear'|'break',
 *   retract:number, dwell:number, reach:number}}
 */
export function drillGeom(prms) {
  const ins = getInsert(prms);
  const D = 2 * Math.max(num(prms.toolRadius, 0), 0);
  const dir = prms.roughingSide === 'left' ? 1 : -1;
  const zFace = num(prms.drillZStart, 0);
  const depth = Math.max(0, num(prms.drillDepth, 0));
  const total = depth + (prms.drillDepthFullDia ? ins.pointLengthZ : 0);
  const zBottom = zFace + dir * total;
  const zR = zFace - dir * Math.max(0.1, num(prms.drillClearance, 2));
  const Q = Math.max(0, num(prms.drillPeck, 0));
  const targets = [];
  if (Q > 0) for (let d = Q; d < total - 1e-6 && targets.length < 5000; d += Q) targets.push(zFace + dir * d);
  targets.push(zBottom);
  const lims = parseInt((prms.machineType || '').match(/LIMS=(\d+)/)?.[1]) || 2000;
  const rpm = D > 0 ? Math.max(10, Math.min(lims, Math.round(num(prms.speed, 25) * 1000 / (Math.PI * D)))) : 0;
  const g = {
    ok: true, dir, zFace, zR, zBottom, targets, D, rpm,
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
  const g = drillGeom(prms);
  const label = { clear: 'vyjizdeni', break: 'lamani trisky' }[g.mode];
  addCmt(`--- VRTANI ⌀${g.D} (hloubka ${Math.abs(g.zBottom - g.zFace).toFixed(3)}, ${g.targets.length} zaber${g.targets.length > 1 ? `u, ${label}` : ''}) ---`);
  if (!g.ok) {
    addCmt(`! ${g.reason}`);
  } else {
    const { dir, zBottom, targets } = g;
    // R rovina (odtud posuv, sem výjezdy) nesmí ležet v polotovaru ani v pásu
    // vůle před ním — polotovar končí až na offsetové čáře (odlitek může být
    // větší, rozhodnutí uživatele 20. 8. 2026), takže rychloposuv k čelu se
    // zastaví na ní a zbytek jede posuvem. Válec/odlitek přesahující Z čela
    // tím posune R rovinu ven.
    let zR = g.zR;
    const stock = buildStockLoopRaw(prms, calc && calc.stockPathSegments);
    if (stock && stock.length) {
      const zs = stock.map(p => p.z);
      const clrZ = stockClearances(prms).z;
      zR = dir < 0 ? Math.max(zR, Math.max(...zs) + clrZ) : Math.min(zR, Math.min(...zs) - clrZ);
      // Vyložení: tip v Z dna, pouzdro začíná o `reach` dál od díry.
      const faceZ = dir < 0 ? Math.max(...zs) : Math.min(...zs);
      const inside = (faceZ - zBottom) * -dir;   // jak hluboko pod čelem polotovaru je špička
      if (inside > g.reach + 1e-6 && S.genNotes) {
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
