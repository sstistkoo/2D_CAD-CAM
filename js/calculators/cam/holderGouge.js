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
import { buildStockLoopRaw, offsetStockLoop, toolFootprint, toolFootprintVisual } from './materialRemoval.js';
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
    // ÚBĚR TĚLEM DESTIČKY, ne tenkým plánovacím profilem. `toolFootprint` je
    // aproximace pro PLÁNOVÁNÍ (stadion kolem nosu, u nože uživatele 10,6 mm²);
    // materiál ve skutečnosti odebírá celé těleso plátku — týž obrys, jaký
    // simulátor KRESLÍ jako odebraný (`MaterialRemoval` používá právě ten,
    // 76,6 mm², tedy 7× víc). S tenkým profilem tady zůstával v modelu
    // materiál, který je na plátně dávno pryč, a držák se do něj „vnořoval":
    // na dílu uživatele největší z pěti oblastí červené (1,12 z 2,46 mm²,
    // `N2290 G1 Z139.365`) — a protože HolderGouge je ZÁZNAM, zůstala
    // vybarvená i po odjetí nože (nález 21. 8. 2026).
    this.foot = toolFootprintVisual(prms);
    this.holder = holderWorldLoop(prms, backside); // obrys držáku rel. ke špičce
    // PROSTOR DESTIČKY NENÍ PROSTOR DRŽÁKU. Obrys držáku začíná ve ŠPIČCE
    // (holderWorldLoop), takže se u hrotu překrývá s destičkou — u nože
    // uživatele v pásu Z 0–4,2 × X 0–15 mm. Materiál, který tam je, ale
    // ŘEŽE DESTIČKA; hlásit ho jako náraz držáku je falešný poplach
    // (nález uživatele 21. 8. 2026: „vidím tam kolizi červenou, ale ten
    // držák je za plátkem"). Na jeho dílu to dělalo polovinu zbylých
    // nálezů proti offsetové čáře (9,1 → 4,9 mm²).
    //
    // Odečítá se `toolFootprintVisual` — TÝŽ obrys, jaký simulátor KRESLÍ.
    // Se samotným `insertWorldLoop` zůstal u špičky výřez ve tvaru rohového
    // rádiusu destičky (r 0,8): mezi obloukem a hranou tělesa je 3,3 mm²,
    // které do obrysu nepatří, ale uvnitř nakresleného plátku leží — a přesně
    // ty se pak vybarvily červeně uvnitř destičky (nález uživatele: „vidím
    // výřez, jako bych udělal kružnici toho radiusu").
    //
    // ODEČÍTÁ SE I U RYCHLOPOSUVU — tady, na rozdíl od validátoru drah.
    // Tenhle soubor odpovídá na otázku „KUDY se vnořil DRŽÁK", a prostor,
    // který zabírá destička, do odpovědi nepatří ani při G0. Dokud přes něj
    // stojí nakreslený plátek, není to vidět; jakmile nástroj odjede, zůstane
    // po něm vybarvená skvrna (HolderGouge je ZÁZNAM, viz hlavička souboru) —
    // nález uživatele 21. 8. 2026: *„po odjetí nože se objeví červený
    // lichoběžník od kolize, který by tam neměl být"*. Na jeho dílu to byla
    // celá jedna z pěti oblastí červené (`N2780 G0 X19.545`, 0,66 z 2,46 mm²).
    //
    // SLEPÉ MÍSTO TO NEDĚLÁ: rychloposuv tělem destičky skrz materiál hlásí
    // `validateToolpath` (⛔ „rychloposuv materiálem"), a ten si u G0 držák
    // schválně bere CELÝ právě proto, aby tělo destičky pokryl. Tady jde jen
    // o to, co se VYBARVÍ jako vnoření držáku, ne o to, co se hlásí.
    this.holderCut = this.holder;
    if (this.holder) {
      const ins = toolFootprintVisual(prms);
      if (ins && ins.length >= 3) {
        try { this.holderCut = polyDifference([this.holder], [ins])[0] || this.holder; }
        catch { this.holderCut = this.holder; }
      }
    }
    // Pás = offsetová smyčka MÍNUS syrový obrys. Nulový Přídavek = čáry
    // splývají a pás neexistuje.
    this.bandLoops = null;
    this.holderSlim = this.holder;
    this.holderCutSlim = this.holderCut;
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
      let slc = null;
      try { slc = polyOffset([this.holderCut], -0.05); } catch { slc = null; }
      this.holderCutSlim = (slc && slc[0]) ? slc[0] : this.holderCut;
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
        // Držák BEZ prostoru destičky, i u rychloposuvu (viz konstruktor).
        const hBody = this.holderCut;
        const hSlim = this.holderCutSlim;
        const hsweep = toolSweep(hBody, seg);
        if (hsweep.length) {
          if (this.stock && this.stock.loops.length) {
            const hit = polyIntersect(hsweep, this.stock.loops);
            if (hit.length) newHits.push(...hit);
          }
          if (this.band && this.band.loops.length) {
            const bsweep = hSlim === hBody ? hsweep : toolSweep(hSlim, seg);
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
