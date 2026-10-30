// SKICA – render: Šrafy řezu (výplň nástroje „Vybarvit" se vzorem)
//
// Výplň ('fill') může mít místo plné barvy šrafy: obj.hatch = { angle, step }
// – úhel čar ve stupních (45 / 135, „křížem" = obojí) a rozteč v mm výkresu.
// Rozteč je ve světových jednotkách, takže se šrafy zvětšují se zoomem jako
// na papírovém výkrese. Kreslí plátno (mirrorFills.js) i export PNG
// (exportImage.js) – oba předávají vlastní převod world → px.

/** Volby v okně Vybarvit (hodnota = obj.hatch.angle, null = plná barva). */
export const HATCH_MODES = [
  { value: null, label: 'Barva' },
  { value: 45, label: 'Šrafy ⟋ 45°' },
  { value: 135, label: 'Šrafy ⟍ 135°' },
  { value: 'cross', label: 'Šrafy křížem' },
];

/** Nejmenší rozteč šraf v px — hustší čáry by splynuly v plnou plochu. */
const MIN_STEP_PX = 3;

/** Výchozí rozteč (mm) podle velikosti plochy: ~25 čar přes delší stranu. */
export function defaultHatchStep(loops) {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const loop of loops || []) for (const p of loop) {
    minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
  }
  const span = Math.max(maxX - minX, maxY - minY);
  if (!Number.isFinite(span) || span <= 0) return 2;
  return Math.max(0.5, Math.round(span / 25 * 2) / 2);
}

/**
 * Úsečky šraf (ve world souřadnicích) pokrývající obdélník bounds pod úhlem
 * angleDeg s roztečí step. Ořez na tvar plochy řeší volající (clip).
 * @returns {Array<[{x:number,y:number},{x:number,y:number}]>}
 */
export function hatchSegments(bounds, angleDeg, step) {
  const a = angleDeg * Math.PI / 180;
  const dx = Math.cos(a), dy = Math.sin(a);   // směr čar
  const nx = -dy, ny = dx;                    // normála (posun mezi čarami)
  const cx = (bounds.minX + bounds.maxX) / 2, cy = (bounds.minY + bounds.maxY) / 2;
  const half = Math.hypot(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY) / 2;
  // Čáry „ukotvené" k počátku souřadnic (offset = celý násobek kroku), aby
  // dvě sousední plochy se stejnými šrafami na sebe navazovaly.
  const c0 = cx * nx + cy * ny;
  const kMin = Math.floor((c0 - half) / step), kMax = Math.ceil((c0 + half) / step);
  const segs = [];
  for (let k = kMin; k <= kMax; k++) {
    const off = k * step - c0;
    const px = cx + nx * off, py = cy + ny * off;
    segs.push([{ x: px - dx * half, y: py - dy * half }, { x: px + dx * half, y: py + dy * half }]);
  }
  return segs;
}

/**
 * Nakreslí šrafy výplně do kontextu g. path = Path2D smyček už v px,
 * w2s(x,y) → [px,py], pxPerMm = měřítko (kvůli minimální rozteči).
 */
export function drawHatch(g, obj, path, bounds, w2s, pxPerMm) {
  const h = obj.hatch;
  if (!(pxPerMm > 0)) return;   // jinak by se smyčka ředění níže nezastavila
  const angles = h.angle === 'cross' ? [45, 135] : [Number(h.angle) || 45];
  // Při malém zoomu rozteč zvětšit (celým násobkem — čáry zůstanou na místě).
  let step = h.step > 0 ? h.step : defaultHatchStep(obj.loops);
  while (step * pxPerMm < MIN_STEP_PX) step *= 2;

  g.save();
  g.clip(path, 'evenodd');
  g.strokeStyle = obj.color || '#60a5fa';
  g.globalAlpha = Math.max(0.6, obj.alpha ?? 1);
  g.lineWidth = 1;
  g.setLineDash([]);
  g.beginPath();
  for (const ang of angles) {
    for (const [p, q] of hatchSegments(bounds, ang, step)) {
      const [x1, y1] = w2s(p.x, p.y), [x2, y2] = w2s(q.x, q.y);
      g.moveTo(x1, y1); g.lineTo(x2, y2);
    }
  }
  g.stroke();
  g.restore();
}
