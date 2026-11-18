// Přepojení kót při kopírování objektů (Kopírovat & umístit, Ctrl+V).
// Kopie kóty si z originálu nese odkazy na id kótovaných objektů. Bez
// přepojení by ji updateAssociativeDimensions() hned vrátil na ORIGINÁL
// (kopie kóty odjede zpět a leží dvakrát na stejném místě).
//  • kótovaný objekt se kopíroval s ní → odkaz na jeho kopii,
//  • nekopíroval se → kóta zůstane jako volná (bez odkazu) tam, kam se vložila.

const LINK_KEYS = ['sourceObjId', 'dimLine1Id', 'dimLine2Id'];

/**
 * @param {Array<{origId: number|null|undefined, copy: object}>} pairs
 *   originál (jeho id) a jeho kopie s už přiděleným novým id
 */
export function relinkCopiedDimensions(pairs) {
  const map = new Map();
  for (const { origId, copy } of pairs) {
    if (origId != null && copy && copy.id != null) map.set(origId, copy.id);
  }
  for (const { copy } of pairs) {
    if (!copy || !copy.isDimension) continue;
    const keys = LINK_KEYS.filter(k => copy[k] != null);
    if (keys.length === 0) continue;
    // Všechny odkazy kóty buď na kopie, nebo žádný (úhlová kóta mezi kopií
    // a originálem by se při úpravě kopie nečekaně měnila).
    if (keys.every(k => map.has(copy[k]))) {
      for (const k of keys) copy[k] = map.get(copy[k]);
    } else {
      for (const k of keys) delete copy[k];
    }
  }
}
