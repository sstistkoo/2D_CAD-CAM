// ╔══════════════════════════════════════════════════════════════╗
// ║  SKICA – VK kontura → objekty výkresu („Vložit do výkresu")   ║
// ╚══════════════════════════════════════════════════════════════╝
//
// VK bylo do teď jen textová pomůcka – náhled se kreslil na plátno, ale
// do výkresu se nedostal. Tenhle modul je ta chybějící poslední míle:
// z hotové VK syntaxe udělá NORMÁLNÍ objekty `line`/`arc` v `state.objects`.
//
// Vědomě BEZ jakéhokoli `isVk` příznaku – jakmile je prvek ve výkresu, je
// to obyčejný objekt jako každý jiný, takže průsečíky, úpravy (trim/fillet),
// DXF, CAM i export G-kódu fungují zadarmo a VK nemusí nic z toho řešit.
// Cena za to: zpětná cesta „objekt → VK zápis" neexistuje, po vložení se
// kontura edituje běžnými nástroji CADu.
//
// Modul zůstává bez DOM závislostí (překreslení a seznam objektů jde přes
// `bridge`), aby šel testovat ve vitest `environment: 'node'` – stejně jako
// zbytek VK mimo vkPreviewRender.js.

import { state, pushUndo, showToast, STOCK_LAYER_ID } from '../state.js';
import { bridge } from '../bridge.js';
import { buildVkPreviewData, vkToWorld, vkArcInWorld } from './vkContour.js';

/** Kratší segment už není geometrie, ale poziční skok (G0) nebo šum. */
const MIN_SEG_LEN = 1e-4;

/**
 * Převede segmenty VK náhledu na objekty výkresu (world souřadnice,
 * bez `id`/`name`/`layer` – ty přiděluje až `commitVkToDrawing`).
 *
 * Nekomituje se:
 *  - `type: 'ray'` – konstrukční paprsky (G111/G0 s PA) jsou jen pomůcka
 *    pro nalezení průsečíku, ne geometrie dílu,
 *  - `isDraft` – rozepsaný prvek z formuláře, který ještě není v syntaxi,
 *  - nulové segmenty – typicky úvodní `G0 X.. Z..` (najetí na start).
 *
 * @param {Array<object>} segments výstup `buildVkPreviewData().segments`
 * @returns {{ objects: object[], skippedArcs: number }} `skippedArcs` = oblouky
 *   bez použitelného R (tětiva delší než 2R, nedopočtený poloměr) – ty se
 *   raději zahodí, než aby se tiše vložily jako úsečka
 */
export function vkSegmentsToDrawObjects(segments) {
  const objects = [];
  let skippedArcs = 0;

  for (const segment of segments || []) {
    if (!segment || segment.type === 'ray' || segment.isDraft) continue;
    if (!segment.start || !segment.end) continue;

    const [x1, y1] = vkToWorld(segment.start);
    const [x2, y2] = vkToWorld(segment.end);
    if (![x1, y1, x2, y2].every(Number.isFinite)) continue;
    if (Math.hypot(x2 - x1, y2 - y1) < MIN_SEG_LEN) continue;

    if (segment.type === 'arc') {
      const arc = vkArcInWorld(segment.start, segment.end, segment.radius, segment.direction);
      if (!arc) { skippedArcs += 1; continue; }
      objects.push({
        type: 'arc',
        cx: arc.cx, cy: arc.cy, r: arc.r,
        startAngle: arc.startAngle, endAngle: arc.endAngle,
        ccw: arc.ccw,
      });
      continue;
    }

    objects.push({ type: 'line', x1, y1, x2, y2 });
  }

  return { objects, skippedArcs };
}

/**
 * Vloží VK konturu do výkresu jako běžné objekty.
 *
 * Jeden `pushUndo()` na celý řetěz (jako `addPolylineAsSegments`), takže se
 * vložení vrací jedním UNDO. `addObject()` se schválně nepoužívá – volalo by
 * `pushUndo()` a `calculateAllIntersections()` pro každý segment zvlášť.
 *
 * @param {string} code obsah pole „Generovaná VK syntaxe"
 * @returns {number} počet vložených objektů (0 = nic se nevložilo)
 */
export function commitVkToDrawing(code) {
  const text = String(code || '');
  if (!text.trim()) {
    showToast('VK syntaxe je prázdná – není co vložit');
    return 0;
  }
  // Nedopočtené rozměry (`X?`) by `buildVkPreviewData` sbalilo na nulový
  // segment a prvek by z výkresu tiše zmizel. Radši poslat uživatele na
  // dopočet, než vložit půlku kontury.
  if (text.includes('?')) {
    showToast('Nejdřív dopočti neznámé (?) – tlačítko „Konvertovat na ISO G-kód"');
    return 0;
  }

  const { objects, skippedArcs } = vkSegmentsToDrawObjects(buildVkPreviewData(text).segments);
  if (objects.length === 0) {
    showToast(skippedArcs > 0
      ? 'Oblouk nemá platný poloměr R – nelze vložit'
      : 'VK kontura neobsahuje žádný prvek k vložení');
    return 0;
  }

  pushUndo();
  // Stejné pravidlo jako v objects.js: v režimu kreslení polotovaru jdou
  // nové objekty do vrstvy Polotovar a nesou `isStock`.
  const stockTag = state.drawStockMode;
  const layer = stockTag ? STOCK_LAYER_ID : state.activeLayer;
  for (const obj of objects) {
    obj.id = state.nextId++;
    obj.name = obj.type === 'arc' ? `Oblouk ${obj.id}` : `Úsečka ${obj.id}`;
    obj.layer = layer;
    if (stockTag) obj.isStock = true;
    state.objects.push(obj);
  }

  bridge.updateObjectList?.();
  // Přepočet průsečíků si sám volá renderAll() i přegenerování CNC panelu.
  bridge.calculateAllIntersections?.();

  const skippedNote = skippedArcs > 0 ? ` (${skippedArcs} oblouk/ů bez platného R vynecháno)` : '';
  showToast(`Vloženo ${objects.length} objektů do výkresu${skippedNote}`);
  return objects.length;
}

bridge.commitVkToDrawing = commitVkToDrawing;
