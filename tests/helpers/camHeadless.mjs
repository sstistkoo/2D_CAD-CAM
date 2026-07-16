// Headless full-pipeline runner pro CAM: naloaduje camSimulator.js s DOM-stuby,
// zachytí vnitřní S + calculate + generateAutoGCode přes injektovaný early-return
// a umožní pustit CELÝ pipeline (kontura → obrobitelná kontura → offsety →
// hrubovací/dokončovací dráhy → G-kód) nad libovolným .camprog objektem.
//
// Slouží jako REGRESNÍ základ: `runCamProg(prog)` vrátí { calc, gcode } z REÁLNÉHO
// kódu (ne z reimplementace), takže snapshot G-kódu chytí jakoukoli regresi
// v logice hrubování. Odvozeno z scripts/cam_gcode_repro.mjs.
import { readFileSync, writeFileSync, unlinkSync } from 'fs';
import { fileURLToPath, pathToFileURL } from 'url';
import { dirname, join } from 'path';
import { tmpdir } from 'os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..', '..');

// ── Fake DOM (Proxy vrací sebe pro cokoliv) ──
const noop = () => {};
function fakeEl() {
  const t = function () {};
  return new Proxy(t, {
    get(_t, k) {
      if (k === 'style') return new Proxy({}, { get: () => '', set: () => true });
      if (k === 'classList') return { add: noop, remove: noop, toggle: noop, contains: () => false };
      if (k === 'dataset') return {};
      if (k === Symbol.toPrimitive || k === 'toString') return () => '';
      if (k === 'querySelectorAll' || k === 'getElementsByClassName' || k === 'getElementsByTagName') return () => [];
      if (k === 'children' || k === 'childNodes') return [];
      if (k === 'appendChild' || k === 'append' || k === 'insertBefore' || k === 'removeChild' ||
          k === 'prepend' || k === 'cloneNode' || k === 'querySelector' || k === 'getElementById' ||
          k === 'closest' || k === 'getContext' || k === 'createElement') return () => fakeEl();
      if (k === 'getBoundingClientRect') return () => ({ left: 0, top: 0, width: 100, height: 100, right: 100, bottom: 100 });
      if (k === 'addEventListener' || k === 'removeEventListener' || k === 'setAttribute' ||
          k === 'removeAttribute' || k === 'remove' || k === 'focus' || k === 'blur' ||
          k === 'observe' || k === 'disconnect' || k === 'dispatchEvent' || k === 'scrollIntoView' ||
          k === 'setPointerCapture' || k === 'releasePointerCapture') return noop;
      if (k === 'contains') return () => false;
      if (k === 'getAttribute') return () => null;
      if (k === 'offsetWidth' || k === 'offsetHeight' || k === 'clientWidth' || k === 'clientHeight') return 100;
      if (k === 'innerHTML' || k === 'textContent' || k === 'value' || k === 'className' || k === 'id') return '';
      return fakeEl();
    },
    apply() { return fakeEl(); },
    set() { return true; },
  });
}

function installDomStubs() {
  if (globalThis.__CAM_DOM_STUBS__) return;
  const documentStub = new Proxy({}, {
    get(_t, k) {
      if (k === 'createElement' || k === 'createElementNS' || k === 'createTextNode' ||
          k === 'getElementById' || k === 'querySelector') return () => fakeEl();
      if (k === 'querySelectorAll' || k === 'getElementsByClassName' || k === 'getElementsByTagName') return () => [];
      if (k === 'addEventListener' || k === 'removeEventListener') return noop;
      if (k === 'body' || k === 'head' || k === 'documentElement') return fakeEl();
      return fakeEl();
    },
  });
  globalThis.document = documentStub;
  globalThis.MutationObserver = class { observe() {} disconnect() {} };
  globalThis.ResizeObserver = class { observe() {} disconnect() {} unobserve() {} };
  globalThis.window = { addEventListener: noop, removeEventListener: noop, devicePixelRatio: 1,
    requestAnimationFrame: noop, cancelAnimationFrame: noop, matchMedia: () => ({ matches: false, addEventListener: noop }) };
  globalThis.localStorage = { getItem: () => null, setItem: noop, removeItem: noop };
  try { Object.defineProperty(globalThis, 'navigator', { value: { userAgent: 'node', clipboard: { writeText: async () => {} } }, configurable: true }); } catch { /* už existuje */ }
  globalThis.__CAM_DOM_STUBS__ = true;
}

let _captured = null;
async function loadCam() {
  if (_captured) return _captured;
  installDomStubs();
  globalThis.__CAM_CAPTURE__ = true;

  let src = readFileSync(join(root, 'js/calculators/camSimulator.js'), 'utf8');
  src = src.replace(/^import\s[^\n]*$/gm, '');
  const camMathUrl = pathToFileURL(join(root, 'js/calculators/cam/camMath.js')).href;
  const strategiesUrl = pathToFileURL(join(root, 'js/calculators/cam/roughingStrategies.js')).href;
  // POZOR: prelude musí zrcadlit reálné importy camSimulator.js z čistých
  // modulů (cam/*, geom/*, threadData) — jinak nové symboly v headless
  // běhu tiše chybí (ReferenceError až za běhu, try/catch je spolkne).
  const materialRemovalUrl = pathToFileURL(join(root, 'js/calculators/cam/materialRemoval.js')).href;
  const collisionValidatorUrl = pathToFileURL(join(root, 'js/calculators/cam/collisionValidator.js')).href;
  const toolEnvelopeUrl = pathToFileURL(join(root, 'js/calculators/cam/toolEnvelope.js')).href;
  const geomCoreUrl = pathToFileURL(join(root, 'js/geom/geomCore.js')).href;
  const threadDataUrl = pathToFileURL(join(root, 'js/calculators/threadData.js')).href;
  const prelude = `
import { getEffectivePlungeAngle, isAngleBetween, intersectVerticalLineSegment, intersectVerticalLineArc, samplePartingEnvelope, fitArcsToPolyline, stockClearances, stockOuterXAtZ } from ${JSON.stringify(camMathUrl)};
import { ROUGHING_STRATEGIES } from ${JSON.stringify(strategiesUrl)};
import { MaterialRemoval, buildStockLoop, toolFootprint } from ${JSON.stringify(materialRemovalUrl)};
import { validateToolpath } from ${JSON.stringify(collisionValidatorUrl)};
import { makeHolderClamp } from ${JSON.stringify(toolEnvelopeUrl)};
import { ensureCollisions, StockModel, toolSweep, polyArea, polySimplify, polyOffset } from ${JSON.stringify(geomCoreUrl)};
import { mCoarse, mFine, gThreads, trThreads, uncThreads, unfThreads, bswThreads, nptThreads, acmeThreads, bsptThreads } from ${JSON.stringify(threadDataUrl)};
const state = { flipX: false, flipZ: false };
const makeOverlay = () => globalThis.document.body;
const openCamEditor = () => {}, pushUndo = () => {}, showToast = () => {};
const renderAll = () => {}, autoCenterView = () => {}, calculateAllIntersections = () => {}, updateObjectList = () => {}, persistSettings = () => {};
const bulgeToArc = () => {}, showToolLibraryDialog = () => {}, openInsertCalc = () => {};
`;
  const anchor = "const STORAGE_KEY = 'skica-cam-simulator';";
  if (!src.includes(anchor)) throw new Error('camHeadless: anchor pro capture nenalezen v camSimulator.js');
  src = src.replace(anchor,
    "if (globalThis.__CAM_CAPTURE__) { globalThis.__CAM_RESULT__ = { S, calculate, generateAutoGCode }; return; }\n  " + anchor);

  // Temp modul do OS temp dir (ne do repa) — prelude nahrazuje relativní
  // importy absolutními file:// URL, takže na umístění nezáleží; přerušený běh
  // pak nezanechá smetí ve scripts/.
  const tmpPath = join(tmpdir(), `_cam_headless_${process.pid}_${Date.now()}.mjs`);
  writeFileSync(tmpPath, prelude + src);
  try {
    const H = await import(pathToFileURL(tmpPath).href);
    H.openCamSimulator();
  } finally {
    try { unlinkSync(tmpPath); } catch { /* nevadí */ }
  }
  _captured = globalThis.__CAM_RESULT__;
  if (!_captured) throw new Error('camHeadless: capture selhal (__CAM_RESULT__ prázdné)');
  return _captured;
}

/**
 * Spustí CELÝ CAM pipeline nad .camprog objektem (parsed JSON).
 * Vrací { calc, gcode } z reálného calculate()/generateAutoGCode().
 */
export async function runCamProg(prog) {
  const { S, calculate, generateAutoGCode } = await loadCam();
  // reset relevantního stavu (S je singleton napříč voláními)
  S.manualGCode = '';
  Object.assign(S.params, prog.params);
  S.contourPoints = prog.contourPoints;
  S.stockPoints = prog.stockPoints;
  S.flipX = !!prog.flipX;
  S.flipZ = !!prog.flipZ;
  S.guideLines = Array.isArray(prog.guideLines) ? prog.guideLines : [];
  // Zásobník nástrojů (výměna dokončovacího nástroje) — reset na každé volání,
  // ať singleton S neprosakuje magazín mezi testy.
  S.toolMagazine = Array.isArray(prog.toolMagazine) ? prog.toolMagazine : [];
  if (prog.zLimits) Object.assign(S.zLimits, prog.zLimits);
  if (prog.xLimits) Object.assign(S.xLimits, prog.xLimits);
  const calc = calculate();
  const gc = generateAutoGCode(calc);
  const gcode = Array.isArray(gc) ? gc.map(l => l.text).join('\n') : String(gc);
  // Druhý průchod jako v aplikaci (Autorefresh): vygenerovaný kód →
  // manualGCode → calculate() z něj postaví simPath (dráhu simulace).
  // calcSim.simPath je potřeba pro validátor kolizí — calc.simPath z
  // prvního průchodu je prázdný (manualGCode byl při něm prázdný).
  S.manualGCode = gcode;
  const calcSim = calculate();
  S.manualGCode = '';
  return { calc, calcSim, gcode, S };
}

/** Načte .camprog ze souboru a spustí pipeline. */
export async function runCamProgFile(path) {
  return runCamProg(JSON.parse(readFileSync(path, 'utf8')));
}
