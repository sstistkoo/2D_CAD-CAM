// Zpřístupní VNITŘNÍ (neexportované) geometrické funkce camSimulator.js pro
// přímé jednotkové testy — přes text-surgery (strip importů + přidání exportů),
// stejně jako scripts/cam_debug.mjs. Umožňuje charakterizovat čisté funkce jako
// buildMachinableContour bez celého pipeline. DOM se nedotkne (openCamSimulator
// se nevolá), stačí drobné globální stuby pro případ, že by se něco vyhodnotilo
// při importu.
import { readFileSync, writeFileSync, unlinkSync } from 'fs';
import { pathToFileURL } from 'url';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { tmpdir } from 'os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..', '..');

const EXPORTS = [
  'buildMachinableContour', 'mergePocketGuides', 'markDominatedGuides',
  'bridgeBetweenContourPoints', 'bridgeFromContourToStock', '_locateOnContour',
  'getArcParams', 'segStartPoint', 'segEndPoint', 'setSegStart', 'setSegEnd',
  // Editor tvaru držáku (čisté geometrické funkce)
  'holderRectProfile', 'holderBottomHandles', 'translateHolderProfile',
  'chamferProfileCorner', 'getInsertAnchorPoints',
];

let _mod = null;
export async function loadCamInternals() {
  if (_mod) return _mod;
  if (!globalThis.document) globalThis.document = { createElement: () => ({}), body: {} };
  let src = readFileSync(join(root, 'js/calculators/camSimulator.js'), 'utf8');
  src = src.replace(/^import\s[^\n]*$/gm, '');
  const camMathUrl = pathToFileURL(join(root, 'js/calculators/cam/camMath.js')).href;
  const interferenceGuidesUrl = pathToFileURL(join(root, 'js/calculators/cam/interferenceGuides.js')).href;
  const contourBuildUrl = pathToFileURL(join(root, 'js/calculators/cam/contourBuild.js')).href;
  const insertPreviewUrl = pathToFileURL(join(root, 'js/calculators/cam/insertPreview.js')).href;
  const prelude = `
import { getEffectivePlungeAngle, isAngleBetween, intersectVerticalLineSegment, intersectVerticalLineArc, samplePartingEnvelope, fitArcsToPolyline, stockClearances, stockOuterXAtZ, getNormal, vecAngle, normalizeAngle, getArcParams, intersectLineCircle, intersectHorizontalLineSegment, _locateOnContour, arcSteps, intersectLines, intersectLinesInfinite, intersectCircleCircle, segPairIntersections, getSegEnd, getSegStart, intersectHorizontalLineArc, intersectSegAtZ, findSegIntersection, setSegEnd, setSegStart, isOnSegBounds, isWithinSegStrict, segEndPoint, segStartPoint, syncArcEndpoints, reverseSeg, dropTinyArcs, pointOnSegInterior, TRIM_TOL, LOOP_INTERIOR_MIN } from ${JSON.stringify(camMathUrl)};
import { computeInterferenceGuides, camRayIntersection, guidePolyPoints, guideBridgePts, mkBridgeSegs } from ${JSON.stringify(interferenceGuidesUrl)};
import { buildMachinableContour, mergePocketGuides, markDominatedGuides, bridgeBetweenContourPoints, bridgeFromContourToStock } from ${JSON.stringify(contourBuildUrl)};
import { holderRectProfile, holderBottomHandles, translateHolderProfile, chamferProfileCorner, getInsertAnchorPoints } from ${JSON.stringify(insertPreviewUrl)};
const ROUGHING_STRATEGIES = {};
const makeOverlay=()=>({}), openCamEditor=()=>{}, state={}, pushUndo=()=>{}, showToast=()=>{};
const renderAll=()=>{}, autoCenterView=()=>{}, calculateAllIntersections=()=>{}, updateObjectList=()=>{};
const bulgeToArc=()=>{}, showToolLibraryDialog=()=>{};
const camConfirm=()=>{}, camCloseConfirm=()=>{}, camOffsetDialog=()=>{}, camAddMoveDialog=()=>{};
const injectCSS=()=>{};
`;
  const exportsTail = `\nexport { ${EXPORTS.join(', ')} };\n`;
  const tmp = join(tmpdir(), `_cam_internals_${process.pid}_${Date.now()}.mjs`);
  writeFileSync(tmp, prelude + src + exportsTail);
  try {
    _mod = await import(pathToFileURL(tmp).href);
  } finally {
    try { unlinkSync(tmp); } catch { /* nevadí */ }
  }
  return _mod;
}

// ── Pomocníci pro stavbu vstupů testů ──
export function line(x1, z1, x2, z2, extra = {}) {
  return { type: 'line', p1: { x: x1, z: z1 }, p2: { x: x2, z: z2 }, ...extra };
}
export function guide(x1, z1, x2, z2, extra = {}) {
  return { x1, z1, x2, z2, kind: 'zanoreni', ...extra };
}
// Kompaktní popis kontury pro asserty: "L (x1,z1)->(x2,z2)".
export function describe(segs) {
  return segs.filter(s => !s.isDegenerate).map(s => s.type === 'line'
    ? `L (${s.p1.x.toFixed(2)},${s.p1.z.toFixed(2)})->(${s.p2.x.toFixed(2)},${s.p2.z.toFixed(2)})${s.fromInsert ? ' {ins}' : ''}`
    : `A r=${s.r.toFixed(2)} ${s.dir}${s.fromInsert ? ' {ins}' : ''}`);
}
