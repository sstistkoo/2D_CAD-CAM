// ╔══════════════════════════════════════════════════════════════╗
// ║  CAM – JEDEN model zbytkového polotovaru                      ║
// ╚══════════════════════════════════════════════════════════════╝
//
// Krok 1 z `docs/cam-architektura-analyza.md`.
//
// Do 5. 9. 2026 si zbytek („co z polotovaru ještě stojí") stavěla emise
// (`rapidStock` v `gcodeEmit.js`) a validátor kolizí (`collisionValidator.js`)
// každý po svém: validátor PŘEHRÁNÍM celého `simPath` od začátku, emise
// přírůstkově za jízdy s `polySimplify` každých 24 řezů. Dokud to byly dva
// kódy, nedaly se sladit — a ten rozdíl je přímo měřitelný: na `part-1`
// a `part-2` hlásí validátor `rapid @r42.25 Z110.8 = 0,8 mm²`, kdežto emise
// tam měří < 0,5 mm². Šest hypotéz, čím ten rozdíl je, skončilo na nule
// (seznam je v analýze, §„Krok 1"), protože se hádalo mezi dvěma
// implementacemi místo aby existovala jedna.
//
// Tenhle soubor je ta jedna akumulace. To, čím se emise a validátor liší,
// jsou od teď POJMENOVANÉ PARAMETRY jednoho modelu, ne dva různé algoritmy:
//
//   |                 | emise (gcodeEmit)        | validátor                |
//   |-----------------|--------------------------|--------------------------|
//   | výchozí smyčka  | `buildStockLoopRaw`      | raw / `stockPlanLoop`    |
//   | ubírá se        | `toolFootprint` (stadion)| `toolFootprintVisual`    |
//   | testuje se      | `toolFootprintSlim()`    | `toolFootprintSlim(0,05)`|
//   | co se zapisuje  | PLÁN (`noteCutPass`)     | jen SKUTEČNĚ VYDANÉ      |
//   |                 | i vydané pohyby          | řezné bloky `simPath`    |
//   | zjednodušení    | po 24 řezech, ε 0,002    | žádné                    |
//   | broad-phase     | žádná                    | AABB proti polotovaru    |
//
// ⚠ Zavedení tohohle souboru NIC z té tabulky nesjednocuje — sjednocuje KÓD.
// Srovnání jednotlivých řádků je samostatná práce a každý z nich je vlastní
// měřicí kolo (viz `docs/cam-architektura-analyza.md`, „Krok 1"). Smysl je,
// že od teď je ten seznam KONEČNÝ a čitelný na jednom místě: co v něm není,
// v tom se ty dva modely lišit NEMOHOU.
//
// Souřadnice: {x = poloměr, z = axiálně} v mm, stejně jako `simPath`.

import { StockModel, toolSweep, polyArea, polySimplify } from '../../geom/geomCore.js';

/**
 * Zbytkový polotovar jako polygony, ubíraný stopou nástroje.
 *
 * @param {Array<{x:number,z:number}>} seedLoop výchozí silueta polotovaru
 *   (null/undefined = model se nepostaví a všechny dotazy jsou „nevím")
 * @param {object} [opts]
 *   `cutFootprint`  obrys, kterým se ODEBÍRÁ (výchozí stopa pro `cutPolyline`)
 *   `probeFootprint` obrys, kterým se TESTUJE dotyk (výchozí pro `hits`)
 *   `tolerance`     [mm²] nad kolik se průnik považuje za kolizi (0,5)
 *   `simplifyEvery` po kolika řezech proběhne `polySimplify` (0 = nikdy)
 *   `simplifyEps`   [mm] ε toho zjednodušení (0,002)
 *   `broadPhase`    `(loops) => boolean` – rychlé odmítnutí; když je zadaná,
 *                   prázdná stopa i stopa mimo polotovar se přeskočí. Bez ní
 *                   se řez provede vždy (dnešní chování emise).
 *   `countEmptyCuts` počítat i řezy, které se neprovedly, do periody
 *                   zjednodušení (true = dnešní chování emise)
 */
export class ResidualStock {
  constructor(seedLoop, opts = {}) {
    this.seedLoop = seedLoop || null;
    this.model = this.seedLoop ? new StockModel([this.seedLoop]) : null;
    this.cutFoot = opts.cutFootprint || null;
    this.probeFoot = opts.probeFootprint || null;
    this.tolerance = Number.isFinite(opts.tolerance) ? opts.tolerance : 0.5;
    this.simplifyEvery = Number.isFinite(opts.simplifyEvery) ? opts.simplifyEvery : 0;
    this.simplifyEps = Number.isFinite(opts.simplifyEps) ? opts.simplifyEps : 0.002;
    this.broadPhase = typeof opts.broadPhase === 'function' ? opts.broadPhase : null;
    this.countEmptyCuts = opts.countEmptyCuts !== false;
    /** Modely ubírané TÝMŽ řezem (emise: syrový + plánovací zbytek). */
    this.linked = [];
    this.cuts = 0;
  }

  get valid() { return !!this.model; }

  /** Aktuální zbytek jako smyčky ([] = model není). */
  get loops() { return this.model ? this.model.loops : []; }

  /** Vrátí model na výchozí siluetu (znovupostavení z pole průchodů). */
  reset() {
    if (this.seedLoop) this.model = new StockModel([this.seedLoop]);
    this.cuts = 0;
    return this;
  }

  /**
   * Připojí další model, který se ubírá TÝMŽ řezem. Emise takhle drží syrový
   * a plánovací (vůlí-posunutý) zbytek: kdyby se plánovací neubíral, zůstal
   * by stát celý a po prvních průchodech by zablokoval každý přejezd.
   */
  link(other) {
    if (other && other !== this && !this.linked.includes(other)) this.linked.push(other);
    return this;
  }

  /** Stopa obrysu `foot` podél lomené čáry `pts` ([] když se nedá spočítat). */
  sweep(pts, foot = this.cutFoot) {
    if (!foot || !Array.isArray(pts) || pts.length < 2) return [];
    try { return toolSweep(foot, pts); } catch { return []; }
  }

  /**
   * Odebere hotovou stopu ze sebe i ze všech připojených modelů.
   * Vrací `true`, když se řez provedl.
   */
  cutSweeps(cutLoops) {
    if (!this.model) return false;
    let done = false;
    if (!this.broadPhase || (cutLoops.length > 0 && this.broadPhase(cutLoops))) {
      try {
        this.model.cut(cutLoops);
        for (const o of this.linked) if (o.model) o.model.cut(cutLoops);
        done = true;
      } catch { /* model je jen měřidlo — jeden nevydařený řez ho nesmí shodit */ }
    }
    if ((done || this.countEmptyCuts) && this.simplifyEvery > 0
      && ++this.cuts % this.simplifyEvery === 0) {
      // Rozdíly postupně přidávají vrcholy — periodicky zjednodušit, ať další
      // řezy i dotazy zůstanou rychlé (ε hluboko pod řeznou tolerancí).
      this.model.loops = polySimplify(this.model.loops, this.simplifyEps);
      for (const o of this.linked) if (o.model) o.model.loops = polySimplify(o.model.loops, this.simplifyEps);
    }
    return done;
  }

  /** Odebere materiál stopou `foot` podél lomené čáry `pts`. */
  cutPolyline(pts, foot = this.cutFoot) {
    if (!this.model || !Array.isArray(pts) || pts.length < 2) return false;
    return this.cutSweeps(this.sweep(pts, foot));
  }

  /**
   * Plocha [mm²], kterou stopa obrysu `loop` podél `pts` protne se zbytkem.
   * 0 = nic (i když se ptát nešlo — dotaz je hlídání, ne měřidlo).
   */
  probe(loop, pts) {
    if (!this.model || !loop) return 0;
    let sweepLoops;
    try { sweepLoops = toolSweep(loop, pts); } catch (err) { return this._failed(err); }
    if (this.broadPhase && (sweepLoops.length === 0 || !this.broadPhase(sweepLoops))) return 0;
    try { return Math.abs(polyArea(this.model.collide(sweepLoops))); } catch (err) { return this._failed(err); }
  }

  /**
   * Nepovedená geometrická operace = odpověď „nic". Emise to tak měla vždycky
   * (model je jen měřidlo pro rychloposuvy a výjimka nesmí shodit výpočet);
   * validátor dřív výjimku pustil ven a shodil s ní celý ⚠ panel. Sjednoceno
   * na tu první variantu, ale NE potichu — jednou za model se to ohlásí.
   */
  _failed(err) {
    if (!this._warned) {
      this._warned = true;
      console.warn('CAM: dotaz do modelu zbytku selhal, beru to jako „bez materiálu":', err);
    }
    return 0;
  }

  /**
   * Protne stopa obrysu `loop` podél `pts` zbytek víc než `tolerance`?
   * `loop === null` (obrys se nedá postavit, např. držák se nehlídá) je
   * ODPOVĚĎ „ne", ne důvod sáhnout po výchozí stopě — proto se `probeFoot`
   * dosadí jen při VYNECHANÉM argumentu.
   */
  hits(loop, pts) {
    return this.probe(loop === undefined ? this.probeFoot : loop, pts) > this.tolerance;
  }

  /** Totéž pro přejezd dvěma body — kvůli čitelnosti volajícího. */
  hitsMove(loop, x1, z1, x2, z2) {
    return this.hits(loop, [{ x: x1, z: z1 }, { x: x2, z: z2 }]);
  }

  /**
   * Kolik zbytku leží pod STATICKÝM obrysem `loop` posunutým do (x, z)?
   * Vrací plochu [mm²], nebo `null`, když se ptát nejde — na rozdíl od
   * `probe` tu volající ten rozdíl potřebuje (viz `holderPlanAreaAt`
   * v gcodeEmit.js: absolutní číslo z tohohle modelu nemá smysl srovnávat
   * s nulou, použitelný je jen ROZDÍL dvou poloh téhož obrysu).
   */
  areaUnder(loop, x, z) {
    if (!this.model || !loop) return null;
    try {
      return Math.abs(polyArea(this.model.collide([loop.map(p => ({ x: x + p.x, z: z + p.z }))])));
    } catch { return null; }
  }

  /**
   * Nejvyšší materiál na svislici Z (null = zbytek tam nesahá).
   * Na rozdíl od výškového pole vrací SKUTEČNÝ povrch i nad tunelem.
   */
  topAt(z) {
    let top = null;
    for (const loop of this.loops) {
      const n = loop.length;
      for (let i = 0; i < n; i++) {
        const a = loop[i], b = loop[(i + 1) % n];
        if ((a.z <= z && b.z > z) || (b.z <= z && a.z > z)) {
          const x = a.x + (b.x - a.x) * ((z - a.z) / (b.z - a.z));
          if (top === null || x > top) top = x;
        }
      }
    }
    return top;
  }
}
