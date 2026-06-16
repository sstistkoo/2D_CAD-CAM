// Deterministický harness: přehraje uložený CAM program přes REÁLNÉ
// geometrické funkce z camSimulator.js (bez DOM) a vypíše finishing offset.
// Spuštění:  node scripts/cam_debug.mjs
import { readFileSync, writeFileSync, unlinkSync } from 'fs';
import { fileURLToPath, pathToFileURL } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

let src = readFileSync(join(root, 'js/calculators/camSimulator.js'), 'utf8');
// Odstranit importy (nahradíme jen ty čisté + stuby pro DOM/state).
src = src.replace(/^import\s[^\n]*$/gm, '');

const camMathUrl = pathToFileURL(join(root, 'js/calculators/cam/camMath.js')).href;
const prelude = `
import { getEffectivePlungeAngle, isAngleBetween, intersectVerticalLineSegment, intersectVerticalLineArc } from ${JSON.stringify(camMathUrl)};
const ROUGHING_STRATEGIES = {};
const makeOverlay=()=>({}), openCamEditor=()=>{}, state={}, pushUndo=()=>{}, showToast=()=>{};
const renderAll=()=>{}, autoCenterView=()=>{}, calculateAllIntersections=()=>{}, updateObjectList=()=>{};
const bulgeToArc=()=>{}, showToolLibraryDialog=()=>{};
`;
const exportsTail = `
export { resolvePointsToAbsolute, getArcParams, getNormal, vecAngle, normalizeAngle,
  getToolClearanceRange, segInterferesWithTool, trimAndRemoveLoops, spliceBridgeSegments,
  removeContourSelfIntersections, segEndPoint, segStartPoint, buildMachinableContour,
  camRayIntersection, computeInterferenceGuides, intersectLineCircle };
`;
const tmpPath = join(root, 'scripts', '_cam_tmp.mjs');
writeFileSync(tmpPath, prelude + src + exportsTail);
const H = await import(pathToFileURL(tmpPath).href + '?t=' + Date.now());
try { unlinkSync(tmpPath); } catch { /* temp soubor – nevadí */ }

// ── Uložený program (z dotazu uživatele) ──
const prms = {
  mode: 'RADIUS', toolRadius: 2, finishAllowance: 0.2, allowanceX: 0, allowanceZ: 0,
  doFinishing: true, respectInsertGeometry: true, toolShape: 'polygon',
  toolAngle: 15, toolTipAngle: 90, stockMode: 'casting',
};
const contourPoints = [
  { type:'G0', x:0,  z:48,     r:0, mode:'ABS' },
  { type:'G1', x:4,  z:48,     r:0, mode:'ABS' },
  { type:'G1', x:5,  z:47,     r:0, mode:'ABS' },
  { type:'G1', x:8,  z:32.76,  r:0, mode:'ABS' },
  { type:'G1', x:8,  z:25,     r:0, mode:'ABS' },
  { type:'G2', x:9,  z:24,     r:1, mode:'ABS' },
  { type:'G1', x:10, z:24,     r:0, mode:'ABS' },
  { type:'G3', x:14, z:20.046, r:4, mode:'ABS' },
  { type:'G1', x:14, z:18,     r:0, mode:'ABS' },
  { type:'G2', x:14, z:4,      r:10,mode:'ABS' },
  { type:'G1', x:14, z:0,      r:0, mode:'ABS' },
];

const tipR = prms.toolRadius;
const allowanceX = prms.allowanceX, allowanceZ = prms.allowanceZ, finishAllowance = prms.finishAllowance;

// Postavit contourSegments stejně jako calculate()
const abs = H.resolvePointsToAbsolute(contourPoints);
const wp = abs.map(p => ({ ...p, xReal: p.xAbs, zReal: p.zAbs }));
let contourSegments = [];
for (let i = 0; i < wp.length - 1; i++) {
  const p1 = wp[i], p2 = wp[i+1], type = p2.type;
  if (type === 'G1') contourSegments.push({ type:'line', p1:{x:p1.xReal,z:p1.zReal}, p2:{x:p2.xReal,z:p2.zReal}, orig:p2 });
  else if (type === 'G2' || type === 'G3') {
    const arc = H.getArcParams({x:p1.xReal,z:p1.zReal}, {x:p2.xReal,z:p2.zReal}, p2.rVal, type);
    const startAngle = Math.atan2(p1.xReal - arc.cx, p1.zReal - arc.cz);
    const endAngle = Math.atan2(p2.xReal - arc.cx, p2.zReal - arc.cz);
    contourSegments.push({ type:'arc', ...arc, p1:{x:p1.xReal,z:p1.zReal}, p2:{x:p2.xReal,z:p2.zReal}, dir:type, startAngle, endAngle });
  }
}
// Snapshot PŘED splice (jako v calculate) — vstup pro detekci interference.
const rawContourForInterference = contourSegments.map(s => structuredClone(s));
if (contourSegments.length > 2) contourSegments = H.spliceBridgeSegments(contourSegments);
if (contourSegments.length > 2) contourSegments = H.removeContourSelfIntersections(contourSegments);

const fmtSeg = (s, i) => s.type === 'line'
  ? `[${i}] L (${s.p1.x.toFixed(3)},${s.p1.z.toFixed(3)})→(${s.p2.x.toFixed(3)},${s.p2.z.toFixed(3)})${s.chainBreak?' [CB]':''}`
  : `[${i}] A c(${s.cx.toFixed(3)},${s.cz.toFixed(3)}) r=${s.r.toFixed(3)} ${s.dir} ${s.p1?`(${s.p1.x.toFixed(3)},${s.p1.z.toFixed(3)})→(${s.p2.x.toFixed(3)},${s.p2.z.toFixed(3)})`:''}${s.chainBreak?' [CB]':''}`;

console.log('=== contourSegments (raw, insert-geom OFF) ===');
contourSegments.forEach((s,i)=>console.log(fmtSeg(s,i)));

// ── Finishing offset (kopie bloku z calculate, respectInsertGeometry varianta) ──
function buildFinish(respectFin, segs = contourSegments) {
  const clearance = H.getToolClearanceRange(prms, false);
  let pendingBreak = false, finRaw = [], finSkipped = 0;
  for (let i = 0; i < segs.length; i++) {
    const seg = segs[i];
    const blocked = respectFin && clearance && H.segInterferesWithTool(seg, clearance);
    let finSeg = null;
    if (seg.type === 'line') {
      const n = H.getNormal(seg.p1, seg.p2);
      finSeg = { type:'line', p1:{x:seg.p1.x+n.x*tipR,z:seg.p1.z+n.z*tipR}, p2:{x:seg.p2.x+n.x*tipR,z:seg.p2.z+n.z*tipR} };
    } else if (seg.type === 'arc') {
      const midAbsX = Math.abs((seg.p1.x+seg.p2.x)/2), centerAbsX = Math.abs(seg.cx);
      const isOuter = centerAbsX < midAbsX;
      let rNew = isOuter ? seg.r + tipR : seg.r - tipR;
      if (rNew > 0.05) {
        const startAngle = Math.atan2(seg.p1.x-seg.cx, seg.p1.z-seg.cz);
        const endAngle = Math.atan2(seg.p2.x-seg.cx, seg.p2.z-seg.cz);
        const ex1 = seg.cx+Math.sin(startAngle)*rNew, ez1 = seg.cz+Math.cos(startAngle)*rNew;
        const ex2 = seg.cx+Math.sin(endAngle)*rNew, ez2 = seg.cz+Math.cos(endAngle)*rNew;
        if (Math.hypot(ex2-ex1,ez2-ez1) > 0.12)
          finSeg = { type:'arc', cx:seg.cx, cz:seg.cz, r:rNew, dir:seg.dir, refP1:seg.p1, refP2:seg.p2, startAngle, endAngle };
      }
    }
    if (!finSeg) continue; // degenerát: nechat trim napojit sousedy (jako rough)
    if (blocked) { finSkipped++; pendingBreak = true; continue; }
    if (pendingBreak && finSeg.type === 'line' && !seg.fromInsert && finRaw.length > 0) {
      const prev = finRaw[finRaw.length-1];
      if (prev.type === 'line' && finSeg.p1.x < prev.p2.x - 0.05) { pendingBreak = false; continue; }
    }
    if (seg.chainBreak || pendingBreak) finSeg.chainBreak = true;
    pendingBreak = false;
    finRaw.push(finSeg);
  }
  console.log(`\n=== finRaw (respectInsertGeometry=${respectFin}), skipped=${finSkipped} ===`);
  finRaw.forEach((s,i)=>console.log(fmtSeg(s,i)));
  const finishOffsetPath = H.trimAndRemoveLoops(finRaw);
  console.log(`--- finishOffsetPath (after trimAndRemoveLoops) ---`);
  finishOffsetPath.forEach((s,i)=>console.log(fmtSeg(s,i)));
  return finishOffsetPath;
}

// ── Roughing offset (offsetPath, +2.2 = tipR+allowance+finishAllowance) ──
function buildRough(segs = contourSegments) {
  const totalOffset = tipR + Math.max(allowanceX, allowanceZ) + finishAllowance;
  let rawOffsets = [];
  for (let i = 0; i < segs.length; i++) {
    const seg = segs[i];
    let offSeg = null;
    if (seg.type === 'line') {
      const n = H.getNormal(seg.p1, seg.p2);
      const tx = n.x*(tipR+allowanceX+finishAllowance), tz = n.z*(tipR+allowanceZ+finishAllowance);
      offSeg = { type:'line', p1:{x:seg.p1.x+tx,z:seg.p1.z+tz}, p2:{x:seg.p2.x+tx,z:seg.p2.z+tz} };
    } else if (seg.type === 'arc') {
      const midAbsX = Math.abs((seg.p1.x+seg.p2.x)/2), centerAbsX = Math.abs(seg.cx);
      const isOuter = centerAbsX < midAbsX;
      let rNew = isOuter ? seg.r + totalOffset : seg.r - totalOffset;
      if (rNew > 0.05) {
        const startAngle = Math.atan2(seg.p1.x-seg.cx, seg.p1.z-seg.cz);
        const endAngle = Math.atan2(seg.p2.x-seg.cx, seg.p2.z-seg.cz);
        offSeg = { type:'arc', cx:seg.cx, cz:seg.cz, r:rNew, dir:seg.dir, refP1:seg.p1, refP2:seg.p2, startAngle, endAngle };
      }
    }
    if (offSeg) rawOffsets.push(offSeg);
  }
  const offsetPath = H.trimAndRemoveLoops(rawOffsets);
  console.log(`\n=== roughing offsetPath (+${totalOffset}) ===`);
  offsetPath.forEach((s,i)=>console.log(fmtSeg(s,i)));
  return offsetPath;
}

buildFinish(false);
buildRough();

// ── ON-case: skutečné interferenční čáry + machinable kontura ──
const stockPoints = [
  { type:'G0', x:0, z:53, mode:'ABS' }, { type:'G1', x:6.071, z:53, mode:'ABS' },
  { type:'G1', x:10, z:49.071, mode:'ABS' }, { type:'G1', x:10, z:41.882, mode:'ABS' },
  { type:'G1', x:13, z:33.642, mode:'ABS' }, { type:'G1', x:13, z:29.567, mode:'ABS' },
  { type:'G2', x:13.919, z:28.102, r:1.627, mode:'ABS' }, { type:'G3', x:19, z:20, r:9, mode:'ABS' },
  { type:'G1', x:19, z:18, mode:'ABS' }, { type:'G1', x:19, z:15.958, mode:'ABS' },
  { type:'G1', x:17.571, z:14.5, mode:'ABS' }, { type:'G2', x:17.571, z:7.5, r:5, mode:'ABS' },
  { type:'G1', x:19, z:6.042, mode:'ABS' }, { type:'G1', x:19, z:4, mode:'ABS' },
  { type:'G1', x:19, z:0, mode:'ABS' }, { type:'G1', x:0, z:0, mode:'ABS' }, { type:'G1', x:0, z:53, mode:'ABS' },
];
const stockAbs = H.resolvePointsToAbsolute(stockPoints);
const stockWp = stockAbs.map(p => ({ ...p, xReal: p.xAbs, zReal: p.zAbs }));

const clearance = H.getToolClearanceRange(prms, false);
const interferenceSegments = rawContourForInterference.filter(s => H.segInterferesWithTool(s, clearance));
console.log(`\n######## ON-CASE (Hlídat geometrii ZAP) ########`);
console.log(`interferenceSegments: ${interferenceSegments.length}`);
const guides = H.computeInterferenceGuides(interferenceSegments, rawContourForInterference, clearance, prms, wp, stockWp);
console.log('interferenceGuides:');
guides.forEach((g,i)=>console.log(`  [${i}] ${g.kind}: (${g.x1.toFixed(3)},${g.z1.toFixed(3)})→(${g.x2.toFixed(3)},${g.z2.toFixed(3)})`));
const machinable = H.buildMachinableContour(contourSegments, guides);
console.log('\n=== machinableContour (kontura po přemostění) ===');
machinable.forEach((s,i)=>console.log(fmtSeg(s,i) + (s.fromInsert?' {bridge}':'')));
buildFinish(true, machinable);
console.log('\n--- roughing offsetPath na machinable (ON) ---');
buildRough(machinable);

