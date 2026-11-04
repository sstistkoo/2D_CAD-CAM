// ╔══════════════════════════════════════════════════════════════╗
// ║  Mobil: mezní čáry přes zaměřovadlo (označit → podržet → táhnout) ║
// ╚══════════════════════════════════════════════════════════════╝
// Uživatel 4. 11. 2026: na čáry čelistí, koníku a rozsahů 📐 se prstem blbě
// trefuje. Postup jako u bodů (dvoukrokové uchopení v camSimulator.js):
//   1. podržet → křížek nad prstem, najet na čáru, pustit → čára se OZNAČÍ,
//   2. znovu podržet → označená čára skočí na křížek a táhne se s ním.
// Krátký tap označení zruší. Hit-test čar je hitTest.js (tolerance 8 px —
// s křížkem nad prstem se dá trefit přesně).

const NAMES = {
  chuck: 'Čelisti', tail: 'Koník', rangeStart: 'Start rozsahu Z', rangeEnd: 'Konec rozsahu Z',
  rangeXMin: 'Rozsah X min', rangeXMax: 'Rozsah X max',
};

/**
 * @param {object} deps { S, canvas, getZLimitAt, getXLimitAt, pushHistory, showToast, draw }
 */
export function createLimitMark({ S, canvas, getZLimitAt, getXLimitAt, pushHistory, showToast, draw }) {
  const keyAt = (cx, cy) => getZLimitAt(cx, cy) ?? getXLimitAt(cx, cy);
  /** Čára na obrazovce (client): { x } svislá, { y } vodorovná. */
  const lineScreen = (key) => {
    const rect = canvas.getBoundingClientRect();
    const isX = key in S.xLimits, v = parseFloat((isX ? S.xLimits : S.zLimits)[key]) || 0;
    const vS = S.flipX ? 1 : -1, hS = S.flipZ ? -1 : 1, car = S.params.machineStructure === 'carousel';
    // Karusel: X vodorovně, Z svisle; soustruh naopak (jako toScreen v hitTest.js).
    if (isX === car) return { x: rect.left + S.view.panX + hS * v * S.view.scale };
    return { y: rect.top + S.view.panY + vS * v * S.view.scale };
  };
  return {
    /** Puštění polohovacího křížku na (client) pozici: je tam mezní čára → označit. */
    markAt(cx, cy) {
      const k = keyAt(cx, cy);
      if (!k) return false;
      S._camMarkedLimit = k;
      showToast(`Označeno: ${NAMES[k] || k} – podrž znovu a táhni`);
      draw();
      return true;
    },
    /**
     * Další podržení: uchopit označenou čáru. Vrací výchozí bod tažení
     * (lastMousePos) — leží na čáře, takže první pohyb na křížek ji k němu
     * přitáhne a dál ji křížek veze; null = nic označeno.
     */
    grabMarked(cx, cy) {
      const k = S._camMarkedLimit;
      if (!k) return null;
      S._camMarkedLimit = null;
      pushHistory();
      S.draggedLimit = k; S.isDragging = true; S._limitDragRaw = null;
      const l = lineScreen(k);
      return { x: l.x ?? cx, y: l.y ?? cy };
    },
    /** Krátký tap: zrušit označení. */
    clear() {
      if (!S._camMarkedLimit) return false;
      S._camMarkedLimit = null;
      draw();
      return true;
    },
  };
}
