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

import { StockModel, toolSweep, polyIntersect, polyUnion, polyDifference, polyOffset, polyArea, polySimplify } from '../../geom/geomCore.js';
import { buildStockLoopRaw, offsetStockLoop, toolFootprint } from './materialRemoval.js';
import { stockClearanceIsZero } from './camMath.js';
import { holderWorldLoop } from './collisionValidator.js';

/**
 * Akumulátor kolize držáku pro jeden výsledek calculate() (calc.simPath).
 * Drží vlastní kopii zbývajícího polotovaru (aby stopa držáku nehlásila
 * kanál, který destička legálně vyřezala) a sjednocenou oblast vnoření.
 * advanceTo() zpracuje jen nový úsek dráhy; při přetočení zpět počítá znovu.
 */
export class HolderGouge {
  /**
   * @param {object} prms parametry CAM
   * @param {Array} stockPathSegments silueta odlitku
   * @param {boolean} [backside] hrubování zleva (zrcadlený držák)
   * @param {{band?: boolean}} [opts] `band` = sledovat NAVÍC vnoření do PÁSU
   *   mezi syrovým obrysem a offsetovou čarou. Přídavek X/Z (polo.) je
   *   v zadání proto, že odlitek MŮŽE být až u té čáry — držák, který tam
   *   vjede, na nadměrném kusu naráží, i když na nakresleném odlitku ne
   *   (nález uživatele 19. 8. 2026: „držák mám za offsetovou čarou a nic se
   *   nevybarvilo“). Vede se ZVLÁŠŤ (`gougeBand`), aby se v náhledu
   *   odlišilo „tvrdé“ vnoření do materiálu od vjezdu do pesimistického pásu.
   */
  constructor(prms, stockPathSegments, backside = false, opts = {}) {
    this.baseLoop = buildStockLoopRaw(prms, stockPathSegments);
    this.foot = toolFootprint(prms);            // stopa destičky (úběr materiálu)
    this.holder = holderWorldLoop(prms, backside); // obrys držáku rel. ke špičce
    // Pás = offsetová smyčka MÍNUS syrový obrys. Nulový Přídavek = čáry
    // splývají a pás neexistuje.
    this.bandLoops = null;
    this.holderSlim = this.holder;
    if (opts.band && this.baseLoop && this.holder && !stockClearanceIsZero(prms)) {
      const off = offsetStockLoop(this.baseLoop, prms);
      if (off) {
        try { this.bandLoops = polyDifference([off], [this.baseLoop]); }
        catch { this.bandLoops = null; }
      }
      // Držák pro test PÁSU se zmenší o 0,05 mm (stejný trik jako u
      // `holderShrunk` v gcodeEmit.js). Bez toho se každý přejezd na
      // rapid-safe X, který leží PŘESNĚ na offsetové čáře, počítal jako vjezd
      // — změřeno 94 oblastí, z toho většina s nulovou plochou (dotek hranice).
      let sl = null;
      try { sl = polyOffset([this.holder], -0.05); } catch { sl = null; }
      this.holderSlim = (sl && sl[0]) ? sl[0] : this.holder;
    }
    this.reset();
  }

  get valid() { return !!this.baseLoop && !!this.holder; }

  reset() {
    this.stock = this.baseLoop ? new StockModel([this.baseLoop]) : null;
    this.band = (this.bandLoops && this.bandLoops.length) ? new StockModel(this.bandLoops) : null;
    this.gouge = [];       // vnoření do MATERIÁLU (oranžové)
    this.gougeBand = [];   // vjezd do PÁSU k offsetové čáře (červené)
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
    const newBandHits = [];
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
        if (cut.length) {
          this.stock.cut(cut);
          // Pás ubírá táž destička — kudy legálně projela, tam už nic nestojí.
          if (this.band) this.band.cut(cut);
        }
      }
      // 2) stopa držáku podél úseku × zbývající materiál = vnoření
      if ((this.stock && this.stock.loops.length) || (this.band && this.band.loops.length)) {
        const hsweep = toolSweep(this.holder, seg);
        if (hsweep.length) {
          if (this.stock && this.stock.loops.length) {
            const hit = polyIntersect(hsweep, this.stock.loops);
            if (hit.length) newHits.push(...hit);
          }
          if (this.band && this.band.loops.length) {
            const bsweep = this.holderSlim === this.holder ? hsweep : toolSweep(this.holderSlim, seg);
            const hitB = polyIntersect(bsweep, this.band.loops);
            // Slivery z pouhého DOTEKU hranice nejsou vjezd — zahodit.
            for (const l of hitB) if (Math.abs(polyArea([l])) > 0.02) newBandHits.push(l);
          }
        }
      }
    }

    if (newHits.length) this.gouge = polyUnion(this.gouge, newHits);
    if (newBandHits.length) this.gougeBand = polyUnion(this.gougeBand, newBandHits);
    // Sjednocení postupně přidává vrcholy — periodicky zjednodušit.
    if ((newHits.length || newBandHits.length) && ++this._n % 24 === 0) {
      this.gouge = polySimplify(this.gouge, 0.01);
      this.gougeBand = polySimplify(this.gougeBand, 0.01);
    }
    this.upto = floatIndex;
    return this.gouge;
  }
}
