import { readFileSync, writeFileSync, unlinkSync } from 'fs';
import { fileURLToPath, pathToFileURL } from 'url';
import { dirname, join } from 'path';
const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
let src = readFileSync(join(root, 'js/calculators/camSimulator.js'), 'utf8');
src = src.replace(/^import\s[^\n]*$/gm, '');
const camMathUrl = pathToFileURL(join(root, 'js/calculators/cam/camMath.js')).href;
const prelude = `
import { getEffectivePlungeAngle, isAngleBetween, intersectVerticalLineSegment, intersectVerticalLineArc } from ${JSON.stringify(camMathUrl)};
const ROUGHING_STRATEGIES = {};
const makeOverlay=()=>({}), openCamEditor=()=>{}, state={}, pushUndo=()=>{}, showToast=()=>{};
const renderAll=()=>{}, autoCenterView=()=>{}, calculateAllIntersections=()=>{}, updateObjectList=()=>{};
const bulgeToArc=()=>{}, showToolLibraryDialog=()=>{};
`;
const exportsTail = `export { resolvePointsToAbsolute, getArcParams, getNormal, trimAndRemoveLoops, extendOffsetStartToAxis };`;
const tmpPath = join(root, 'scripts', '_cam_tmp4.mjs');
writeFileSync(tmpPath, prelude + src + exportsTail);
const H = await import(pathToFileURL(tmpPath).href + '?t=' + Date.now());
try { unlinkSync(tmpPath); } catch {}
const { genLongPasses } = await import(pathToFileURL(join(root, 'js/calculators/cam/roughingStrategies.js')).href);
const { isAngleBetween } = await import(camMathUrl);
function intersectHorizontalLineSegment(xLine, p1, p2) {
  const dx = p2.x - p1.x; if (Math.abs(dx) < 1e-9) return null;
  const t = (xLine - p1.x) / dx; if (t < -1e-6 || t > 1 + 1e-6) return null;
  return p1.z + t * (p2.z - p1.z);
}
function intersectHorizontalLineArc(xLine, center, r) {
  const dx = xLine - center.x; if (Math.abs(dx) > r + 1e-9) return [];
  const dz = Math.sqrt(Math.max(0, r * r - dx * dx)); return [center.z + dz, center.z - dz];
}
const prms = {
  mode: 'RADIUS', toolRadius: 1.2, finishAllowance: 0.3, allowanceX: 0, allowanceZ: 0,
  doFinishing: false, respectInsertGeometry: true, toolShape: 'polygon',
  toolAngle: 15, toolTipAngle: 60, toolClearanceAngle: 0, stockMode: 'casting',
  depthOfCut: 0.2, entryAngle: 15, entryAngleAuto: true, plungeRoughing: true,
  noStepRoughing: true, noStepRoughingFace: true, stockFace: 56.93, stockDiameter: 38,
};
const contourPoints = [
  { type:'G0', x:2.079, z:54.351, mode:'ABS' }, { type:'G1', x:2.079, z:54.351, mode:'ABS' },
  { type:'G1', x:2.079, z:51.348, mode:'ABS' }, { type:'G0', x:2.079, z:54.351, mode:'ABS' },
  { type:'G1', x:0.996, z:54.351, mode:'ABS' }, { type:'G1', x:0, z:54.351, mode:'ABS' },
  { type:'G0', x:2.079, z:51.348, mode:'ABS' }, { type:'G1', x:2.479, z:51.348, mode:'ABS' },
  { type:'G1', x:2.479, z:48, mode:'ABS' }, { type:'G0', x:4, z:48, mode:'ABS' },
  { type:'G1', x:4.293, z:47.707, mode:'ABS' }, { type:'G0', x:4, z:48, mode:'ABS' },
  { type:'G1', x:2.479, z:48, mode:'ABS' }, { type:'G0', x:4.293, z:47.707, mode:'ABS' },
  { type:'G1', x:5, z:46, mode:'ABS' }, { type:'G1', x:5, z:41, mode:'ABS' },
  { type:'G0', x:5, z:46, mode:'ABS' }, { type:'G1', x:10, z:30, mode:'ABS' },
  { type:'G0', x:5, z:41, mode:'ABS' }, { type:'G1', x:8, z:34, mode:'ABS' },
  { type:'G1', x:8, z:30, mode:'ABS' }, { type:'G1', x:10, z:30, mode:'ABS' },
  { type:'G1', x:14, z:22, mode:'ABS' }, { type:'G2', x:14, z:4, r:10, mode:'ABS' },
  { type:'G1', x:14, z:0, mode:'ABS' }, { type:'G1', x:0, z:0, mode:'ABS' },
];
const abs = H.resolvePointsToAbsolute(contourPoints);
const wp = abs.map(p => ({ ...p, xReal: p.xAbs, zReal: p.zAbs }));
let contourSegments = [];
for (let i = 0; i < wp.length - 1; i++) {
  const p1 = wp[i], p2 = wp[i+1], type = p2.type;
  if (type === 'G0') continue;
  if (type === 'G1') contourSegments.push({ type:'line', p1:{x:p1.xReal,z:p1.zReal}, p2:{x:p2.xReal,z:p2.zReal} });
  else if (type === 'G2' || type === 'G3') {
    const arc = H.getArcParams({x:p1.xReal,z:p1.zReal}, {x:p2.xReal,z:p2.zReal}, p2.rVal, type);
    const startAngle = Math.atan2(p1.xReal - arc.cx, p1.zReal - arc.cz);
    const endAngle = Math.atan2(p2.xReal - arc.cx, p2.zReal - arc.cz);
    contourSegments.push({ type:'arc', ...arc, p1:{x:p1.xReal,z:p1.zReal}, p2:{x:p2.xReal,z:p2.zReal}, dir:type, startAngle, endAngle });
  }
}
const tipR = prms.toolRadius, allowanceX = prms.allowanceX, allowanceZ = prms.allowanceZ, finishAllowance = prms.finishAllowance;
const totalOffset = tipR + Math.max(allowanceX, allowanceZ) + finishAllowance;
let rawOffsets = [];
for (const seg of contourSegments) {
  if (seg.type === 'line') {
    const n = H.getNormal(seg.p1, seg.p2);
    const tx = n.x*(tipR+allowanceX+finishAllowance), tz = n.z*(tipR+allowanceZ+finishAllowance);
    rawOffsets.push({ type:'line', p1:{x:seg.p1.x+tx,z:seg.p1.z+tz}, p2:{x:seg.p2.x+tx,z:seg.p2.z+tz} });
  } else {
    const midAbsX = Math.abs((seg.p1.x+seg.p2.x)/2), centerAbsX = Math.abs(seg.cx);
    const isOuter = centerAbsX < midAbsX;
    let rNew = isOuter ? seg.r + totalOffset : seg.r - totalOffset;
    if (rNew > 0.05) {
      const startAngle = Math.atan2(seg.p1.x-seg.cx, seg.p1.z-seg.cz);
      const endAngle = Math.atan2(seg.p2.x-seg.cx, seg.p2.z-seg.cz);
      rawOffsets.push({ type:'arc', cx:seg.cx, cz:seg.cz, r:rNew, dir:seg.dir, startAngle, endAngle });
    }
  }
}
const offsetPath = H.trimAndRemoveLoops(rawOffsets);
H.extendOffsetStartToAxis(offsetPath);
const sRad = prms.stockDiameter / 2;
const stockPathSegments = [
  { type:'line', p1:{x:0,z:prms.stockFace}, p2:{x:sRad,z:prms.stockFace} },
  { type:'line', p1:{x:sRad,z:prms.stockFace}, p2:{x:sRad,z:-2} },
  { type:'line', p1:{x:sRad,z:-2}, p2:{x:0,z:-2} },
];
const stockWorldPoints = [ { xReal:0, zReal:prms.stockFace }, { xReal:sRad, zReal:prms.stockFace }, { xReal:sRad, zReal:-2 }, { xReal:0, zReal:-2 } ];
const hIntersect = (segs, xLine, checkDegen) => {
  const out = [];
  for (const seg of segs) {
    if (checkDegen && seg.isDegenerate) continue;
    if (seg.type === 'line') { const z = intersectHorizontalLineSegment(xLine, seg.p1, seg.p2); if (z !== null) out.push(z); }
    else if (seg.type === 'arc') {
      const res = intersectHorizontalLineArc(xLine, { x: seg.cx, z: seg.cz }, seg.r);
      for (const z of res) { const angle = Math.atan2(xLine - seg.cx, z - seg.cz); if (isAngleBetween(angle, seg.startAngle, seg.endAngle, seg.dir === 'G2')) out.push(z); }
    }
  }
  return out;
};
const maxXAt = (segs, z) => {
  let maxX = null;
  for (const seg of segs) {
    if (seg.isDegenerate) continue;
    if (seg.type === 'line') {
      const zMin = Math.min(seg.p1.z, seg.p2.z), zMax = Math.max(seg.p1.z, seg.p2.z);
      if (z < zMin - 0.01 || z > zMax + 0.01) continue;
      const dz = seg.p2.z - seg.p1.z;
      const x = Math.abs(dz) < 1e-6 ? Math.max(seg.p1.x, seg.p2.x) : seg.p1.x + ((z - seg.p1.z) / dz) * (seg.p2.x - seg.p1.x);
      if (maxX === null || x > maxX) maxX = x;
    } else if (seg.type === 'arc') {
      const cosA = (z - seg.cz) / seg.r; if (cosA < -1.001 || cosA > 1.001) continue;
      const cosC = Math.max(-1, Math.min(1, cosA)); const a1 = Math.acos(cosC);
      for (const a of [a1, -a1]) { if (isAngleBetween(a, seg.startAngle, seg.endAngle, seg.dir === 'G2')) { const x = seg.cx + Math.sin(a) * seg.r; if (maxX === null || x > maxX) maxX = x; } }
    }
  }
  return maxX;
};
const offsetXAt = (z) => maxXAt(offsetPath, z);
const arcAngleAtZ = (seg, z) => {
  const cosA = (z - seg.cz) / seg.r; if (cosA < -1.001 || cosA > 1.001) return null;
  const cosC = Math.max(-1, Math.min(1, cosA)); const a1 = Math.acos(cosC);
  for (const a of [a1, -a1]) if (isAngleBetween(a, seg.startAngle, seg.endAngle, seg.dir === 'G2')) return a;
  return null;
};
const traceOffsetPath = (zHi, zLo) => {
  const out = [];
  for (let i = 0; i < offsetPath.length; i++) {
    const seg = offsetPath[i]; if (seg.isDegenerate) continue;
    if (seg.type === 'line') {
      const zA = seg.p1.z, zB = seg.p2.z;
      if (Math.abs(zA - zB) < 1e-6) { if (zA <= zHi + 1e-6 && zA >= zLo - 1e-6) out.push({ type: 'line', x1: seg.p1.x, z1: zA, x2: seg.p2.x, z2: zB }); continue; }
      const hiPt = zA >= zB ? seg.p1 : seg.p2, loPt = zA >= zB ? seg.p2 : seg.p1;
      const clipHi = Math.min(zHi, hiPt.z), clipLo = Math.max(zLo, loPt.z); if (clipHi <= clipLo + 1e-6) continue;
      const dz = hiPt.z - loPt.z; const xAt = (z) => Math.abs(dz) < 1e-9 ? hiPt.x : loPt.x + (z - loPt.z) / dz * (hiPt.x - loPt.x);
      out.push({ type: 'line', x1: xAt(clipHi), z1: clipHi, x2: xAt(clipLo), z2: clipLo });
    } else if (seg.type === 'arc') {
      const zAtStart = seg.cz + Math.cos(seg.startAngle) * seg.r, zAtEnd = seg.cz + Math.cos(seg.endAngle) * seg.r;
      const reversed = zAtStart < zAtEnd;
      const aAtHiOrig = reversed ? seg.endAngle : seg.startAngle, aAtLoOrig = reversed ? seg.startAngle : seg.endAngle;
      const zSegHi = Math.max(zAtStart, zAtEnd), zSegLo = Math.min(zAtStart, zAtEnd);
      const clipHi = Math.min(zHi, zSegHi), clipLo = Math.max(zLo, zSegLo); if (clipHi <= clipLo + 1e-6) continue;
      const aAtClipHi = arcAngleAtZ(seg, clipHi) ?? aAtHiOrig, aAtClipLo = arcAngleAtZ(seg, clipLo) ?? aAtLoOrig;
      const outDir = reversed ? (seg.dir === 'G2' ? 'G3' : 'G2') : seg.dir;
      out.push({ type: 'arc', cx: seg.cx, cz: seg.cz, r: seg.r, dir: outDir, startAngle: aAtClipHi, endAngle: aAtClipLo,
        x1: seg.cx + Math.sin(aAtClipHi) * seg.r, z1: clipHi, x2: seg.cx + Math.sin(aAtClipLo) * seg.r, z2: clipLo });
    }
  }
  return out;
};
const findOffsetXCrossing = (zFrom, targetX, zFloor) => {
  const h = 0.05; let z = zFrom, xPrev = offsetXAt(z);
  for (let i = 0; i < 4000; i++) { const zNext = z - h; if (zNext < zFloor - 1e-6) break; const x = offsetXAt(zNext); if (x === null) break;
    if (x <= targetX + 1e-6) return zNext; if (xPrev !== null && x > xPrev + 1e-6) break; xPrev = x; z = zNext; }
  return z;
};
const findPocketExitZ = (zFrom, depthX, zFloor) => {
  const h = 0.05; let z = zFrom, leftPocket = false;
  for (let i = 0; i < 8000; i++) { const zNext = z - h; if (zNext < zFloor - 1e-6) break; const x = offsetXAt(zNext); if (x === null) break;
    if (x > depthX + 0.01) leftPocket = true; else if (leftPocket && x <= depthX + 1e-6) return zNext; z = zNext; }
  return z;
};
const findLeadOutEndZ = (zFrom, prevX, nextX, zFloor) => {
  const h = 0.05; let z = zFrom;
  for (let i = 0; i < 8000; i++) { const zNext = z - h; if (zNext < zFloor - 1e-6) break; const x = offsetXAt(zNext); if (x === null) break;
    if (x <= nextX + 1e-6) return zNext; if (prevX !== null && x >= prevX - 1e-6) return zNext; z = zNext; }
  return z;
};
function run(pocketFinishAtOnce) {
  const passes = [], foundErrors = [];
  const ctx = { prms: { ...prms, pocketFinishAtOnce }, sRad, stockFace: prms.stockFace, step: prms.depthOfCut,
    offsetPath, stockWorldPoints, stockPathSegments, passes, foundErrors,
    offsetXAt, traceOffsetPath, findOffsetXCrossing, findPocketExitZ, findLeadOutEndZ, hIntersect,
    machiningRange: null, machiningRangeX: null, chuckZ: null };
  genLongPasses(ctx);
  return { passes, foundErrors };
}
for (const atOnce of [false, true]) {
  const { passes } = run(atOnce);
  const relevant = passes.filter(p => p.type === 'long' && Math.max(p.zStart, p.zEnd) >= 4 && Math.min(p.zStart, p.zEnd) <= 22);
  const minX = relevant.length ? Math.min(...relevant.map(p => p.x)) : null;
  console.log(`pocketFinishAtOnce=${atOnce}: pasy v kapse=${relevant.length}, celkem=${passes.length}, nejhlubsi X=${minX!==null?minX.toFixed(3):'n/a'} (cil 9.859)`);
  // Print last few relevant passes' x values to see convergence pattern.
  relevant.slice(-15).forEach(p => process.stdout.write(p.x.toFixed(2) + ' '));
  console.log();
}
