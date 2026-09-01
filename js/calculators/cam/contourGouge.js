// ╔══════════════════════════════════════════════════════════════╗
// ║  CAM – zajetí nástroje do HOTOVÉ KONTURY (červené varování)   ║
// ╚══════════════════════════════════════════════════════════════╝
//
// Simulace ubírá materiál stopou destičky (`MaterialRemoval`). Když ta
// stopa sáhne POD hotovní konturu, je díl zmetek — na plátně to ale
// vypadalo úplně stejně jako legitimní řez: materiál prostě zmizel
// (nález uživatele 1. 9. 2026: *„simulace odebere materiál, ale není
// zobrazeno, že to zajelo do hotovní kontury"*). Tenhle modul spočítá,
// KTERÁ ČÁST hotového dílu už byla odebrána, a simulátor ji vybarví
// červeně jako kolizi.
//
// Princip: hotový díl (uzavřená silueta kontury) MÍNUS zbývající
// materiál. Je to tedy odpověď ze STEJNÉHO modelu, jaký úběr kreslí —
// co uživatel vidí jako odebrané, to se vybarví; žádný druhý, rozcházející
// se model nástroje (a tím i žádná červená tam, kde na plátně materiál
// zůstal stát). Akumulace je implicitní: materiál se nikdy nevrací, takže
// jednou obarvená oblast zůstane obarvená i po odjetí nože — stejně jako
// u `HolderGouge`.
//
// Souřadnice: stejné jako simPath ({x = poloměr, z = axiálně} v mm),
// nezávislé na flipX/flipZ i machineStructure (řeší až toScreen).

import { polyArea, polyDifference, polyIntersect, polyOffset } from '../../geom/geomCore.js';
import { buildStockLoopRaw } from './materialRemoval.js';
import { offsetSilhouetteLoop } from './toolEnvelope.js';

/**
 * Tolerance dotyku [mm]: o kolik se silueta hotového dílu zmenší, než se
 * proti ní měří. Dokončovací průchod jede PO kontuře a stopa nástroje se
 * jí z definice dotýká — bez zúžení by každý takový dotyk (i pouhá
 * diskretizace oblouků na tětivy) vyrobil červenou. Stejná hodnota jako
 * u ostatních testů dotyku v CAM (`toolFootprintSlim`, `holderSlim`).
 */
export const GOUGE_SHRINK = 0.05;

/** Slivery pod touhle plochou [mm²] nejsou zajezd, ale dotyk hranice. */
export const GOUGE_MIN_AREA = 0.02;

/**
 * Záznam „kudy nástroj ubral z hotového dílu" pro jeden výsledek
 * calculate(). Drží zúženou siluetu dílu (ořezanou na to, co v polotovaru
 * vůbec stálo) a na požádání ji porovná se zbývajícím materiálem.
 */
export class ContourGouge {
  /**
   * @param {object} prms parametry CAM (kvůli obrysu polotovaru)
   * @param {Array} contourSegments hotovní kontura (`calc.contourSegments`)
   * @param {Array} stockPathSegments silueta odlitku (u válce se ignoruje)
   * @param {{shrink?: number, minArea?: number}} [opts]
   */
  constructor(prms, contourSegments, stockPathSegments, opts = {}) {
    const shrink = opts.shrink ?? GOUGE_SHRINK;
    this.minArea = opts.minArea ?? GOUGE_MIN_AREA;
    const raw = offsetSilhouetteLoop(contourSegments);
    let part = [];
    if (raw && raw.length >= 3) {
      if (shrink > 0) {
        try { part = polyOffset([raw], -shrink) || []; } catch { part = []; }
      }
      if (!part.length) part = [raw];
      // OŘEZ NA POLOTOVAR: kdyby kontura kdekoli vyčnívala před obrys
      // polotovaru (nekonzistentní zadání), byl by ten přesah „odebraný"
      // hned od prvního snímku, ačkoli tam materiál nikdy nebyl.
      const stock = buildStockLoopRaw(prms, stockPathSegments);
      if (stock && stock.length >= 3) {
        try { part = polyIntersect(part, [stock]); } catch { /* ponech neořezané */ }
      }
    }
    this.part = part;
    this._srcRef = null;   // identita pole smyček, ze kterého je _loops
    this._loops = [];
  }

  get valid() { return this.part.length > 0; }

  /**
   * Oblasti hotového dílu, které už jsou odebrané.
   * @param {Array<Array<{x:number,z:number}>>} stockLoops zbývající materiál
   *   (`MaterialRemoval.model.loops`) — cachuje se podle identity pole, takže
   *   pouhé překreslení (pan/zoom) boolean operaci neopakuje.
   * @returns {Array<Array<{x:number,z:number}>>} smyčky zajetí ([] = čisté)
   */
  update(stockLoops) {
    if (!this.valid || !stockLoops) return [];
    if (stockLoops === this._srcRef) return this._loops;
    this._srcRef = stockLoops;
    let hit = [];
    try { hit = polyDifference(this.part, stockLoops); } catch { hit = []; }
    this._loops = hit.filter(l => l.length >= 3 && Math.abs(polyArea([l])) > this.minArea);
    return this._loops;
  }

  /** Celková plocha zajetí [mm²] podle posledního `update()`. */
  get area() { return Math.abs(polyArea(this._loops)); }
}
