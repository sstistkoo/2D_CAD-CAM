// ╔══════════════════════════════════════════════════════════════╗
// ║  SKICA – Geometrie: vzdálenosti, průsečíky                  ║
// ╚══════════════════════════════════════════════════════════════╝

// Rozcestník: kód žije v js/geometry/*.js (rozděleno 16. 10. 2026 podle témat).
// Seznam exportů je stejný jako dřív — 45 souborů importuje odsud, nic se jim
// neměnilo. Nové funkce patří do modulu svého tématu a sem jen do seznamu.
export {
  findConstraintAt,
  findObjectAt,
  findIntersectionAt,
  selectObjectAt,
} from './geometry/select.js';
export {
  findSegmentAt,
  distToObject,
} from './geometry/hitDistance.js';
export {
  getLines,
  getCircles,
  intersectLineLine,
  intersectLineCircle,
  intersectCircleCircle,
  flushAutoCncExport,
  calculateAllIntersections,
} from './geometry/intersections.js';
export {
  tangentsFromPointToCircle,
  tangentsTwoCircles,
  circlePositionsTangentToLine,
  circlePositionsTangentToCircleAndLine,
  circlePositionsTangentToTwoLines,
  circlePositionsTangentToLineAndPoint,
  circlePositionsTangentToCircleAndPoint,
} from './geometry/tangents.js';
export {
  circleThrough3Points,
  circleTangentToLineAndTwoPoints,
  circleTangentToTwoLinesAndPoint,
  circleTangentToThreeLines,
  circleTangentToCircleAndTwoPoints,
  circlePositionsTangentToTwoCircles,
  circlePositionsTangentToTwoSegments,
  circleTangentToThreeSegments,
} from './geometry/tangentCircles.js';
export {
  getPolylineSegmentAsLine,
  intersectInfiniteLines,
  projectPointToLine,
  distPointToInfiniteLine,
  angleBetweenLines,
  offsetObject,
  pickOffsetSide,
} from './geometry/linesOffset.js';
export {
  mirrorObject,
  linearArray,
  rotateObject,
  flipObject,
  circularArray,
  scaleObject,
} from './geometry/transforms.js';
export {
  filletTwoLines,
  chamferTwoLines,
  filletLineAndArc,
  chamferLineAndArc,
} from './geometry/fillet.js';

import { calculateAllIntersections } from './geometry/intersections.js';
import { bridge } from './bridge.js';

// ── Bridge registrace ──
bridge.calculateAllIntersections = () => calculateAllIntersections();
