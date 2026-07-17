// ╔══════════════════════════════════════════════════════════════╗
// ║  CAM – akumulovaná stopa vnoření DRŽÁKU do materiálu          ║
// ║  (oranžové varování při simulaci)                            ║
// ╚══════════════════════════════════════════════════════════════╝
//
// Obdoba MaterialRemoval, ale místo úběru destičkou sleduje KOLIZE
// DRŽÁKU: podél projeté dráhy navléká stopu obrysu držáku a průnik se
// zbývajícím materiálem (co destička ještě neodebrala) postupně
// SJEDNOCUJE do jedné oblasti. Ta pak v simulátoru ZŮSTÁVÁ oranžová i
// po přejetí — je to záznam, kudy se držák do polotovaru/obrobku vnořil.
//
// Souřadnice: stejné jako simPath ({x = poloměr, z = axiálně} v mm),
// nezávislé na flipX/flipZ i machineStructure (řeší až toScreen).

import { StockModel, toolSweep, polyIntersect, polyUnion, polySimplify } from '../../geom/geomCore.js';
import { buildStockLoop, toolFootprint } from './materialRemoval.js';
import { holderWorldLoop } from './collisionValidator.js';

/**
 * Akumulátor kolize držáku pro jeden výsledek calculate() (calc.simPath).
 * Drží vlastní kopii zbývajícího polotovaru (aby stopa držáku nehlásila
 * kanál, který destička legálně vyřezala) a sjednocenou oblast vnoření.
 * advanceTo() zpracuje jen nový úsek dráhy; při přetočení zpět počítá znovu.
 */
export class HolderGouge {
  constructor(prms, stockPathSegments, backside = false) {
    this.baseLoop = buildStockLoop(prms, stockPathSegments);
    this.foot = toolFootprint(prms);            // stopa destičky (úběr materiálu)
    this.holder = holderWorldLoop(prms, backside); // obrys držáku rel. ke špičce
    this.reset();
  }

  get valid() { return !!this.baseLoop && !!this.holder; }

  reset() {
    this.stock = this.baseLoop ? new StockModel([this.baseLoop]) : null;
    this.gouge = [];   // sjednocené smyčky vnoření držáku [{x,z}, …]
    this.upto = 0;     // float index v simPath, kam až je zpracováno
    this._n = 0;       // počítadlo kvůli periodickému simplify
  }

  /**
   * Posune zpracování na `floatIndex` (= S.simProgress · (simPath.length − 1)).
   * Pro každý nový úsek: (1) na řezných blocích odebere materiál stopou
   * destičky, (2) navlékne stopu držáku podél úseku a její průnik se
   * ZBÝVAJÍCÍM materiálem přidá do akumulované oblasti. Vrací pole smyček
   * vnoření (může být prázdné).
   */
  advanceTo(simPath, floatIndex) {
    if (!this.valid || !simPath || simPath.length < 2) return this.gouge;
    if (floatIndex < this.upto - 1e-9) this.reset();          // přetočení zpět
    if (floatIndex <= this.upto + 1e-9) return this.gouge;    // nic nového

    const last = simPath.length - 1;
    const pointAt = (fi) => {
      const i = Math.min(Math.floor(fi), last - 1);
      const t = fi - i;
      const a = simPath[i], b = simPath[i + 1];
      return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t };
    };

    const i0 = Math.floor(this.upto);
    const i1 = Math.min(Math.floor(floatIndex), last - 1);
    const newHits = [];
    for (let i = i0; i <= i1; i++) {
      const a = Math.max(i, this.upto), b = Math.min(i + 1, floatIndex);
      if (b - a < 1e-12) continue;
      const pa = pointAt(a), pb = pointAt(b);
      if (Math.hypot(pb.x - pa.x, pb.z - pa.z) < 1e-9) continue;
      const seg = [pa, pb];
      const cutting = (simPath[i + 1].type || 'G0') !== 'G0';
      // 1) destička nejdřív odebere materiál (jen řezné bloky) — držák se pak
      //    testuje proti tomu, co ZBYLO (kanál po destičce = žádná kolize).
      if (cutting) {
        const cut = toolSweep(this.foot, seg);
        if (cut.length) this.stock.cut(cut);
      }
      // 2) stopa držáku podél úseku × zbývající materiál = vnoření
      if (this.stock && this.stock.loops.length) {
        const hsweep = toolSweep(this.holder, seg);
        if (hsweep.length) {
          const hit = polyIntersect(hsweep, this.stock.loops);
          if (hit.length) newHits.push(...hit);
        }
      }
    }

    if (newHits.length) {
      this.gouge = polyUnion(this.gouge, newHits);
      // Sjednocení postupně přidává vrcholy — periodicky zjednodušit.
      if (++this._n % 24 === 0) this.gouge = polySimplify(this.gouge, 0.01);
    }
    this.upto = floatIndex;
    return this.gouge;
  }
}
