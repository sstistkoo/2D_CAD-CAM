import { state, showToast } from '../state.js';
import { addObject } from '../objects.js';
import { startDrawing, finishDrawing } from './helpers.js';
import { showPostDrawLineDialog } from '../dialogs/postDrawDialog.js';
import { activeLineProps, activeLineStyle, lineContinuationProps, getLineStyle } from '../lineStyles.js';

// Vzhled navazující úsečky, když se kreslení začne kliknutím na bod
// existujícího objektu (viz `snapPt()` v canvas.js) – zachyceno na prvním
// kliknutí (start), spotřebováno na druhém (konec). `null` = nezačalo se
// snapem na objekt, ať se běžné kreslení (Typ čáry / výchozí plná) chová
// jako dřív. `continuationIsStock` odděleně: je-li zdroj polotovar, nová
// úsečka se má vložit jako polotovar taky – i tady je vlastní typ čáry
// (dash/barva) nezávislý na tom, do jaké vrstvy/skupiny objekt patří.
let continuationStyle = null;
let continuationIsStock = false;

/**
 * @param {number} wx
 * @param {number} wy
 */
export function handleLineClick(wx, wy) {
  if (!state.drawing) {
    // Navázání na existující bod přebírá jeho typ čáry a barvu (na pokyn
    // uživatele: „ať kreslí stejnou čarou jako to, co je nakliknuté") –
    // má přednost před Typ čáry i výchozí plnou čárou.
    const src = state.mouse.snappedObject;
    continuationStyle = src ? lineContinuationProps(src) : null;
    continuationIsStock = !!src?.isStock;
    startDrawing(wx, wy, "Klepněte na koncový bod");
  } else {
    const tp = state.tempPoints[0];
    if (Math.hypot(wx - tp.x, wy - tp.y) < 1e-9) {
      showToast("Úsečka má nulovou délku");
      finishDrawing();
      return;
    }
    // Pořadí priority: navázání na klikutý bod > aktivní „Typ čáry" (dialog
    // otevřený z tlačítka v liště) > výchozí plná tlustá.
    const styleProps = continuationStyle
      || (state.lineStyleActive ? activeLineProps() : { type: "line", dashed: false });
    const styleLabel = continuationStyle
      ? getLineStyle(continuationStyle.lineStyle).label
      : (state.lineStyleActive ? activeLineStyle().label : "Úsečka");
    // Navázání na bod polotovaru zapne `drawStockMode` jen na tenhle jeden
    // `addObject()` – nikdy nesnižuje explicitní volbu uživatele zpátky na
    // konturu, jen ji podle potřeby na chvíli zapne (viz stejný vzor u
    // `commitVkToDrawing` ve vkContour.js).
    const prevStockMode = state.drawStockMode;
    if (continuationIsStock) state.drawStockMode = true;
    const lineObj = addObject({
      ...styleProps,
      x1: tp.x,
      y1: tp.y,
      x2: wx,
      y2: wy,
      name: `${styleLabel} ${state.nextId}`,
    });
    if (continuationIsStock) state.drawStockMode = prevStockMode;
    continuationStyle = null;
    continuationIsStock = false;
    finishDrawing();
    if (lineObj) showPostDrawLineDialog(lineObj);
  }
}
