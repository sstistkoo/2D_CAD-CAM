// ╔══════════════════════════════════════════════════════════════╗
// ║  CAM – vizuální úběr materiálu při simulaci (Fáze 1          ║
// ║  migrace na Clipper2, viz docs/geometry-libs-migration.md)   ║
// ╚══════════════════════════════════════════════════════════════╝
//
// Polotovar se drží jako polygon (StockModel) a s postupem simulace se
// od něj odečítá stopa nástroje (Minkowského suma obrysu špičky podél
// projetých ŘEZNÝCH úseků simPath — rychloposuvy G0 materiál neberou).
// Simulátor pak zbývající polygon použije jako ořez (clip) vybarvení
// polotovaru, takže červená výplň vizuálně mizí tam, kudy nástroj projel.
//
// Souřadnice: stejné jako simPath — {x = poloměr [mm], z = axiálně [mm]},
// nezávislé na flipX/flipZ i machineStructure (to řeší až toScreen).

import { StockModel, toolSweep, polySimplify } from '../../geom/geomCore.js';

/**
 * Obrys řezné části nástroje RELATIVNĚ k programovanému bodu dráhy
 * (= střed rádiusové kružnice špičky — viz kreslení plátku v draw()).
 * V1 aproximace „stadion": spodní půlkruh rádiusu R + obdélník nahoru
 * (+x, směrem k držáku) výšky max(2·ap, 3 mm). Prodloužení pokrývá i
 * tenké hřebínky mezi sousedními průchody (rozteč ap > 2R), které by
 * čistá kružnice vizuálně nechávala stát — fyzicky je odstřihne tělo
 * destičky. Přesný polygon destičky (vč. upichováku) přijde ve Fázi 2.
 */
export function toolFootprint(prms) {
  const r = Math.max(parseFloat(prms.toolRadius) || 0.8, 0.05);
  const H = Math.max((parseFloat(prms.depthOfCut) || 0) * 2, 3);
  const loop = [{ x: H, z: r }];
  const n = 12;
  for (let k = 0; k <= n; k++) {
    const a = (k / n) * Math.PI;    // 0..π přes spodek špičky
    loop.push({ x: -Math.sin(a) * r, z: Math.cos(a) * r });
  }
  loop.push({ x: H, z: -r });
  return loop;
}

/**
 * Uzavřená smyčka polotovaru: válec = obdélník od osy, odlitek =
 * navzorkované stockPathSegments uzavřené k ose X=0 (otevřený profil
 * polotovaru končí na ose — viz stockTools.js). Vrací null, když
 * polotovar není k dispozici.
 */
export function buildStockLoop(prms, stockPathSegments) {
  if (prms.stockMode === 'cylinder') {
    const sRad = (parseFloat(prms.stockDiameter) || 0) / 2;
    const sLen = parseFloat(prms.stockLength) || 0;
    const sFace = parseFloat(prms.stockFace) || 0;
    if (sRad <= 0 || sLen + sFace <= 0) return null;
    return [
      { x: 0, z: sFace }, { x: sRad, z: sFace },
      { x: sRad, z: -sLen }, { x: 0, z: -sLen },
    ];
  }
  const segs = stockPathSegments || [];
  if (segs.length === 0) return null;
  const pts = [];
  const push = (p) => {
    const l = pts[pts.length - 1];
    if (!l || Math.hypot(l.x - p.x, l.z - p.z) > 1e-6) pts.push({ x: p.x, z: p.z });
  };
  for (const seg of segs) {
    if (seg.type === 'line') {
      push(seg.p1); push(seg.p2);
    } else if (seg.type === 'arc') {
      let sA = seg.startAngle, eA = seg.endAngle;
      if (seg.dir === 'G2' && eA > sA) eA -= 2 * Math.PI;
      if (seg.dir === 'G3' && eA < sA) eA += 2 * Math.PI;
      const steps = Math.max(2, Math.min(48, Math.ceil(seg.r * Math.abs(eA - sA) / 0.4)));
      for (let j = 0; j <= steps; j++) {
        const a = sA + (eA - sA) * (j / steps);
        push({ x: seg.cx + Math.sin(a) * seg.r, z: seg.cz + Math.cos(a) * seg.r });
      }
    }
  }
  if (pts.length < 2) return null;
  // Uzavřít profil k ose soustružení (x = 0)
  const first = pts[0], last = pts[pts.length - 1];
  if (Math.abs(last.x) > 1e-6) pts.push({ x: 0, z: last.z });
  if (Math.abs(first.x) > 1e-6) pts.push({ x: 0, z: first.z });
  return pts;
}

/**
 * Stav úběru pro jeden výpočet drah (calc.simPath). Drží zbývající
 * polotovar a index, kam až je dráha „projetá"; advanceTo() dořeže
 * jen nový úsek (inkrementálně), při přetočení zpět přepočítá od nuly.
 */
export class MaterialRemoval {
  constructor(prms, stockPathSegments) {
    this.baseLoop = buildStockLoop(prms, stockPathSegments);
    this.foot = toolFootprint(prms);
    this.reset();
  }

  get valid() { return !!this.baseLoop; }

  reset() {
    this.model = this.baseLoop ? new StockModel([this.baseLoop]) : null;
    this.upto = 0;      // float index v simPath, kam až je odřezáno
    this._cuts = 0;     // počítadlo řezů kvůli periodickému simplify
  }

  /**
   * Posune úběr na `floatIndex` (= S.simProgress * (simPath.length − 1)).
   * Vrací StockModel zbývajícího materiálu (nebo null, když není polotovar).
   */
  advanceTo(simPath, floatIndex) {
    if (!this.model || !simPath || simPath.length < 2) return this.model;
    if (floatIndex < this.upto - 1e-9) this.reset();          // přetočení zpět
    if (floatIndex <= this.upto + 1e-9) return this.model;    // nic nového

    const last = simPath.length - 1;
    const pointAt = (fi) => {
      const i = Math.min(Math.floor(fi), last - 1);
      const t = fi - i;
      const a = simPath[i], b = simPath[i + 1];
      return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t };
    };

    // Souvislé řezné běhy (G1/G2/G3…) mezi upto a floatIndex; G0 běh utne.
    const runs = [];
    let run = null;
    const i0 = Math.floor(this.upto);
    const i1 = Math.min(Math.floor(floatIndex), last - 1);
    for (let i = i0; i <= i1; i++) {
      const a = Math.max(i, this.upto), b = Math.min(i + 1, floatIndex);
      if (b - a < 1e-12) continue;
      if ((simPath[i + 1].type || 'G0') === 'G0') { run = null; continue; }
      const pa = pointAt(a), pb = pointAt(b);
      if (!run) { run = [pa]; runs.push(run); }
      const lastPt = run[run.length - 1];
      if (Math.hypot(pb.x - lastPt.x, pb.z - lastPt.z) > 1e-9) run.push(pb);
    }

    const cutLoops = [];
    for (const r of runs) {
      if (r.length >= 2) cutLoops.push(...toolSweep(this.foot, r));
    }
    if (cutLoops.length > 0) {
      this.model.cut(cutLoops);
      // Rozdíly postupně přidávají vrcholy — periodicky zjednodušit,
      // ať kreslení i další řezy zůstanou rychlé (ε hluboko pod tolerancí).
      if (++this._cuts % 24 === 0)
        this.model.loops = polySimplify(this.model.loops, 0.002);
    }
    this.upto = floatIndex;
    return this.model;
  }
}
