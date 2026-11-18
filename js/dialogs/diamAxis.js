// Režim průměru (⌀) v polích souřadnic dialogů.
// Průměr patří ose X: na soustruhu je svislá (wy), na karuselu vodorovná (wx)
// – stejně jako export a import G-kódu (storage/gcodeParse.js → toCanvas).
// H = vodorovné pole (wx), V = svislé pole (wy), viz axisLabels().
import { state, displayX, inputX, xPrefix } from '../state.js';

const xIsH = () => state.machineType === 'karusel';

/** World → zobrazení pro svislé pole. */
export const dV = (v) => xIsH() ? v : displayX(v);
/** Zobrazení → world pro svislé pole. */
export const iV = (v) => xIsH() ? v : inputX(v);
/** World → zobrazení pro vodorovné pole. */
export const dH = (v) => xIsH() ? displayX(v) : v;
/** Zobrazení → world pro vodorovné pole. */
export const iH = (v) => xIsH() ? inputX(v) : v;
/** Prefix (⌀ nebo '') před popisek svislé osy. */
export const pfxV = () => xIsH() ? '' : xPrefix();
/** Prefix (⌀ nebo '') před popisek vodorovné osy. */
export const pfxH = () => xIsH() ? xPrefix() : '';

/** Dvojice hodnot z polí (H, V) → world jednotky. */
export const fieldToWorld = (h, v) => ({ x: iH(h), y: iV(v) });
