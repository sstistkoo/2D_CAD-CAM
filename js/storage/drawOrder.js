// Kreslicí editor (runCncExport s asDrawn): směr řetězu podle pořadí, ve kterém
// se prvky kreslily / zapsaly v editoru.
//
// Automatické řazení kontury (btnAutoSort, autoSortAllGroups) přerovná objekty
// na plátně zprava doleva. Editor čte pořadí z pole objektů, takže kód zapsaný
// od osy doprava se po zavření a novém otevření editoru objevil obráceně
// (uživatel 13. 11. 2026). Pořadí vzniku nese `id` objektu (state.nextId++ –
// přidělí ho addObject i parser G-kódu v pořadí řádků); podle něj se každý
// souvislý řetěz otočí zpět do směru, ve kterém se kreslil.

/** Pořadí vzniku položky exportu (kopie má zdroj v `_src`). */
const drawId = (it) => {
  const id = (it?._src ?? it)?.id;
  return Number.isFinite(id) ? id : null;
};

/**
 * Otočí řetězy (souvislé úseky s `_chainCont`), které jdou proti pořadí kreslení.
 * Rozhoduje většina sousedních dvojic: víc klesajících id než rostoucích → otočit.
 * Mění `list` na místě; objekty nemutuje (otočené i přeznačené jsou kopie).
 * @param {object[]} list položky v pořadí výstupu (po _orientInDrawnOrder)
 * @param {(o: object) => object} revObj vrátí kopii prvku s prohozeným začátkem a koncem
 * @returns {object[]} list
 */
export function alignChainsToDrawOrder(list, revObj) {
  let start = 0;
  while (start < list.length) {
    let end = start + 1;
    while (end < list.length && list[end]._chainCont) end++;
    if (end - start > 1) {
      let up = 0, down = 0;
      for (let i = start + 1; i < end; i++) {
        const a = drawId(list[i - 1]), b = drawId(list[i]);
        if (a === null || b === null) continue;
        if (b > a) up++; else if (b < a) down++;
      }
      if (down > up) {
        const rev = list.slice(start, end).reverse().map((it, k) => ({ ...revObj(it), _chainCont: k > 0 }));
        list.splice(start, end - start, ...rev);
      }
    }
    start = end;
  }
  return list;
}
