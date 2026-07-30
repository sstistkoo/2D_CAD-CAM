// ╔══════════════════════════════════════════════════════════════╗
// ║  Tužka – kreslení od ruky (táhni myší/prstem po plátně)     ║
// ╚══════════════════════════════════════════════════════════════╝

import { state, showToast } from '../state.js';
import { addObject } from '../objects.js';

// Min. rozestup nových bodů na plátně (px) – proti zahlcení stovkami
// téměř totožných bodů při pomalém tahu.
const MIN_SEG_PX = 3;

/** Začátek tahu tužkou – uloží první bod do state.tempPoints. */
export function startPencilStroke(wx, wy) {
  state.drawing = true;
  state.tempPoints = [{ x: wx, y: wy }];
}

/** Přidá bod do rozkresleného tahu, pokud je dost daleko od posledního bodu. */
export function addPencilPoint(wx, wy) {
  if (!state.drawing || state.tool !== 'pencil') return;
  const pts = state.tempPoints;
  const last = pts[pts.length - 1];
  const minDist = MIN_SEG_PX / (state.zoom || 1);
  if (Math.hypot(wx - last.x, wy - last.y) < minDist) return;
  pts.push({ x: wx, y: wy });
}

/** Dokončí tah – uloží jako jeden polyline objekt (rovné mikro-segmenty). */
export function finishPencilStroke() {
  if (!state.drawing || state.tool !== 'pencil') return;
  const pts = state.tempPoints;
  state.drawing = false;
  state.tempPoints = [];
  if (pts.length < 2) return;
  const name = `Tužka ${state.nextId}`;
  addObject({
    type: 'polyline',
    vertices: pts,
    bulges: new Array(pts.length - 1).fill(0),
    closed: false,
    name,
    // Vyřazuje objekt z krokového undo po bodech (state.js undo()) – tah
    // tužkou má desítky mikro-bodů, jedno „Zpět" má smazat celý náčrt naráz.
    isPencilStroke: true,
  });
  showToast('Náčrt tužkou přidán ✓');
}

/** Zruší rozkreslený tah bez uložení (Escape / přepnutí nástroje). */
export function resetPencilState() {
  state.drawing = false;
  state.tempPoints = [];
}
