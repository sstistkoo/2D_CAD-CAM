// Headless reprodukce CELÉHO G-kódu: naloaduje camSimulator.js s DOM-stuby,
// zachytí vnitřní S + calculate + generateAutoGCode přes injektovaný early-return,
// nastaví S z .camprog a vypíše vygenerovaný G-kód (hrubování + dokončování).
//   node scripts/cam_gcode_repro.mjs [cesta-k-.camprog]
import { readFileSync, writeFileSync, unlinkSync } from 'fs';
import { fileURLToPath, pathToFileURL } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

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
try { Object.defineProperty(globalThis, 'navigator', { value: { userAgent: 'node', clipboard: { writeText: async () => {} } }, configurable: true }); } catch { /* navigator už existuje – nevadí */ }
globalThis.__CAM_CAPTURE__ = true;

// ── Text-surgery: strip importy, přidej stuby + real camMath/strategie, inject capture ──
let src = readFileSync(join(root, 'js/calculators/camSimulator.js'), 'utf8');
src = src.replace(/^import\s[^\n]*$/gm, '');

const camMathUrl = pathToFileURL(join(root, 'js/calculators/cam/camMath.js')).href;
const strategiesUrl = pathToFileURL(join(root, 'js/calculators/cam/roughingStrategies.js')).href;
const prelude = `
import { getEffectivePlungeAngle, isAngleBetween, intersectVerticalLineSegment, intersectVerticalLineArc } from ${JSON.stringify(camMathUrl)};
import { ROUGHING_STRATEGIES } from ${JSON.stringify(strategiesUrl)};
const state = { flipX: false, flipZ: false };
const makeOverlay = () => fakeOverlay();
const openCamEditor = () => {}, pushUndo = () => {}, showToast = () => {};
const renderAll = () => {}, autoCenterView = () => {}, calculateAllIntersections = () => {}, updateObjectList = () => {}, persistSettings = () => {};
const bulgeToArc = () => {}, showToolLibraryDialog = () => {}, openInsertCalc = () => {};
function fakeOverlay(){ return globalThis.document.body; }
`;

// Inject early-return capture right after S je hotové (před localStorage blokem).
const anchor = "const STORAGE_KEY = 'skica-cam-simulator';";
if (!src.includes(anchor)) throw new Error('anchor nenalezen');
src = src.replace(anchor,
  "if (globalThis.__CAM_CAPTURE__) { globalThis.__CAM_RESULT__ = { S, calculate, generateAutoGCode }; return; }\n  " + anchor);

const tmpPath = join(root, 'scripts', '_cam_gcode_tmp.mjs');
writeFileSync(tmpPath, prelude + src);
const H = await import(pathToFileURL(tmpPath).href + '?t=' + Date.now());
try { unlinkSync(tmpPath); } catch { /* nevadí */ }

H.openCamSimulator();
const { S, calculate, generateAutoGCode } = globalThis.__CAM_RESULT__;

// ── Naloaduj .camprog ──
const progPath = process.argv[2] || 'C:/Users/stistko/Downloads/projekt_2026-06-30 (10).camprog';
const prog = JSON.parse(readFileSync(progPath, 'utf8'));
Object.assign(S.params, prog.params);
S.contourPoints = prog.contourPoints;
S.stockPoints = prog.stockPoints;
S.flipX = !!prog.flipX;
S.flipZ = !!prog.flipZ;
if (prog.zLimits) Object.assign(S.zLimits, prog.zLimits);
if (prog.xLimits) Object.assign(S.xLimits, prog.xLimits);

const calc = calculate();

if (process.env.CAMDBG) {
  const fmt = (s) => s.type === 'line'
    ? `L (${s.p1.x.toFixed(3)},${s.p1.z.toFixed(3)})->(${s.p2.x.toFixed(3)},${s.p2.z.toFixed(3)})${s.chainBreak ? ' [CB]' : ''}${s.isDegenerate ? ' [DEG]' : ''}`
    : `A c(${s.cx.toFixed(3)},${s.cz.toFixed(3)}) r=${s.r.toFixed(3)} ${s.dir} (${s.p1?.x.toFixed(3)},${s.p1?.z.toFixed(3)})->(${s.p2?.x.toFixed(3)},${s.p2?.z.toFixed(3)})${s.isDegenerate ? ' [DEG]' : ''}`;
  console.log('=== offsetPath ===');
  calc.offsetPath.forEach((s, i) => console.log(`[${i}] ${fmt(s)}`));
  console.log('\n=== finishOffsetPath ===');
  calc.finishOffsetPath.forEach((s, i) => console.log(`[${i}] ${fmt(s)}`));
  console.log('\n=== finishUnreachablePath (dotted / not machined) ===');
  (calc.finishUnreachablePath || []).forEach((s, i) => console.log(`[${i}] ${fmt(s)}`));
  console.log('\n=== machinableContour ===');
  (calc.machinableContour || calc.contourSegments || []).forEach((s, i) => console.log(`[${i}] ${fmt(s)}${s.fromInsert ? ' {bridge}' : ''}`));
  console.log('\n=== interferenceGuides ===');
  (calc.interferenceGuides || []).forEach((g, i) => console.log(`[${i}] ${g.kind}: (${g.x1.toFixed(3)},${g.z1.toFixed(3)})->(${g.x2.toFixed(3)},${g.z2.toFixed(3)})`));
  console.log('\n=== passes ===');
  calc.passes.forEach((p, i) => {
    const tags = ['pocketClean', 'pocketReposition', 'pocketEntry', 'ramp', 'contourLeadIn', 'contourLeadOut', 'noRetract', 'backside', 'blocked'].filter(t => p[t]).join(',');
    let s = `[${i}] ${p.type} x=${p.x?.toFixed(3)} zS=${p.zStart?.toFixed(3)} zE=${p.zEnd?.toFixed(3)}${p.z !== undefined ? ' z=' + p.z.toFixed(3) : ''} {${tags}}`;
    if (p.rampFeedFrom) s += ` rampFeedFrom=(${p.rampFeedFrom.x.toFixed(3)},${p.rampFeedFrom.z.toFixed(3)})`;
    console.log(s);
    if (process.env.CAMDBG === '2') {
      for (const key of ['contourLeadIn', 'contourLeadOut']) {
        if (p[key]) p[key].forEach(seg => console.log(`      ${key}: ${seg.type === 'line' ? `L (${seg.x1.toFixed(3)},${seg.z1.toFixed(3)})->(${seg.x2.toFixed(3)},${seg.z2.toFixed(3)})` : `A r=${seg.r.toFixed(3)} ${seg.dir} (${seg.x1.toFixed(3)},${seg.z1.toFixed(3)})->(${seg.x2.toFixed(3)},${seg.z2.toFixed(3)})`}`));
      }
    }
  });
  console.log('');
}

const gc = generateAutoGCode(calc);
const text = Array.isArray(gc) ? gc.map(l => l.text).join('\n') : String(gc);

if (process.env.CAMSVG) {
  // Parse G-kód na pohyby (modální G, X=rádius, Z). Vykreslí konturu,
  // dokončovací offset, nedosažitelné (tečkovaně) a dráhu nástroje.
  const moves = [];
  let g = 0, x = 150, z = 5;
  for (const line of text.split('\n')) {
    const t = line.replace(/;.*/, '').trim();
    if (!t.startsWith('N')) continue;
    const body = t.replace(/^N\d+\s*/, '');
    const gm = body.match(/G0?([0-3])\b/); if (gm) g = +gm[1];
    const xm = body.match(/X(-?[\d.]+)/); const zm = body.match(/Z(-?[\d.]+)/);
    const nx = xm ? +xm[1] : x, nz = zm ? +zm[1] : z;
    if (xm || zm) { moves.push({ g, x0: x, z0: z, x1: nx, z1: nz }); x = nx; z = nz; }
  }
  // bounds z contour + finish
  const pts = [];
  const pushSeg = (s) => { if (s.type === 'line') { pts.push(s.p1, s.p2); } else { pts.push({ x: s.cx + s.r, z: s.cz }, { x: s.cx - s.r, z: s.cz }, { x: s.cx, z: s.cz + s.r }, { x: s.cx, z: s.cz - s.r }); } };
  (calc.machinableContour || calc.contourSegments || []).forEach(pushSeg);
  const zs = pts.map(p => p.z), xs = pts.map(p => p.x);
  const REGION = process.env.CAMSVG; // 'apex','face','full'
  let zMin = Math.min(...zs), zMax = Math.max(...zs), xMin = 0, xMax = Math.max(...xs) + 3;
  if (REGION === 'apex') { zMin = 130; zMax = 165; xMax = 40; }
  if (REGION === 'face') { zMin = 235; zMax = 268; xMax = 40; }
  const W = 900, H = 700, M = 50;
  const sc = Math.min((W - 2 * M) / (zMax - zMin), (H - 2 * M) / (xMax - xMin));
  const sx = zz => M + (zz - zMin) * sc;         // Z -> horizontal
  const sy = xx => H - M - (xx - xMin) * sc;     // X -> vertical (up)
  const arcPath = (s) => {
    const p1 = { x: s.cx + Math.sin(s.startAngle) * s.r, z: s.cz + Math.cos(s.startAngle) * s.r };
    const p2 = { x: s.cx + Math.sin(s.endAngle) * s.r, z: s.cz + Math.cos(s.endAngle) * s.r };
    const large = Math.abs(s.endAngle - s.startAngle) > Math.PI ? 1 : 0;
    const sweep = s.dir === 'G2' ? 1 : 0;
    return `M ${sx(p1.z)} ${sy(p1.x)} A ${s.r * sc} ${s.r * sc} 0 ${large} ${sweep} ${sx(p2.z)} ${sy(p2.x)}`;
  };
  const segPath = (s) => s.type === 'line' ? `M ${sx(s.p1.z)} ${sy(s.p1.x)} L ${sx(s.p2.z)} ${sy(s.p2.x)}` : arcPath(s);
  let svg = `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg"><rect width="${W}" height="${H}" fill="#181825"/>`;
  // grid Z ticks
  for (let zt = Math.ceil(zMin / 10) * 10; zt <= zMax; zt += 10) svg += `<line x1="${sx(zt)}" y1="${M}" x2="${sx(zt)}" y2="${H - M}" stroke="#313244" stroke-width="1"/><text x="${sx(zt)}" y="${H - M + 15}" fill="#9399b2" font-size="10" text-anchor="middle">Z${zt}</text>`;
  for (let xt = 0; xt <= xMax; xt += 10) svg += `<line x1="${M}" y1="${sy(xt)}" x2="${W - M}" y2="${sy(xt)}" stroke="#313244" stroke-width="1"/><text x="${M - 5}" y="${sy(xt) + 3}" fill="#9399b2" font-size="10" text-anchor="end">X${xt}</text>`;
  (calc.machinableContour || calc.contourSegments || []).forEach(s => { svg += `<path d="${segPath(s)}" stroke="#6c7086" stroke-width="2.5" fill="none"/>`; });
  (calc.finishOffsetPath || []).forEach(s => { svg += `<path d="${segPath(s)}" stroke="#a6e3a1" stroke-width="1.5" fill="none"/>`; });
  (calc.finishUnreachablePath || []).forEach(s => { if (s.type === 'arc' && s.startAngle === undefined) return; svg += `<path d="${segPath(s)}" stroke="#f38ba8" stroke-width="1.5" fill="none" stroke-dasharray="4 3"/>`; });
  // toolpath
  for (const m of moves) {
    const col = m.g === 0 ? '#f9e2af' : '#89b4fa';
    const w = m.g === 0 ? 0.6 : 1.8;
    const dash = m.g === 0 ? 'stroke-dasharray="2 2"' : '';
    svg += `<line x1="${sx(m.z0)}" y1="${sy(m.x0)}" x2="${sx(m.z1)}" y2="${sy(m.x1)}" stroke="${col}" stroke-width="${w}" ${dash}/>`;
  }
  svg += `</svg>`;
  writeFileSync(join(root, 'scripts', `_cam_${REGION}.svg`), svg);
  console.error(`wrote scripts/_cam_${REGION}.svg`);
} else {
  console.log(text);
}
