// SKICA – Pomocné vrstvy
//
// Vrstva s příznakem `helper: true` (přepínač v panelu Vrstvy) je jen pro
// kreslení: její objekty se zobrazují tlumeně, ale NEjdou do CAM, CNC kódu
// (runCncExport), DXF exportu a nejsou hranicí pro Vybarvit. Kontura (vrstva 0)
// a vrstvy bokorysu / děr v plášti pomocné být nemohou.

import { state } from './state.js';

/** Průhlednost objektů pomocné vrstvy na plátně. */
export const HELPER_ALPHA = 0.5;

/** Smí vrstva dostat příznak „pomocná"? */
export function canBeHelperLayer(layer) {
  return !!layer && layer.id !== 0 && !layer.isFace && !layer.isShell;
}

/** Je vrstva pomocná? */
export function isHelperLayer(layer) {
  return !!layer && !!layer.helper && canBeHelperLayer(layer);
}

/** Leží objekt na pomocné vrstvě? */
export function isHelperObject(obj, layers = state.layers) {
  if (!obj) return false;
  const layer = (layers || []).find(l => l.id === obj.layer);
  return isHelperLayer(layer);
}

/** Objekty bez těch z pomocných vrstev (vrací stejné pole, když žádná není). */
export function withoutHelperObjects(objects, layers = state.layers) {
  const ids = new Set((layers || []).filter(isHelperLayer).map(l => l.id));
  if (!ids.size) return objects;
  return objects.filter(o => !o || !ids.has(o.layer));
}
