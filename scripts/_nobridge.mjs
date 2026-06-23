// Harness: reprodukuje ČELNÍ hrubování + "Hlídání geometrie destičky (čelně)"
// na uživatelově .camprog. Izoluje blok zkracování čelních průchodů, aby bylo
// vidět, KDE (na jakém Z) staircase mezní čára začíná.
// Spuštění: node scripts/cam_face_debug.mjs
import { readFileSync, writeFileSync, unlinkSync } from 'fs';
import { fileURLToPath, pathToFileURL } from 'url';
import { dirname, join } from 'path';
import { genFacePasses } from '../js/calculators/cam/roughingStrategies.js';
import { isAngleBetween } from '../js/calculators/cam/camMath.js';

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
const exportsTail = `
export { resolvePointsToAbsolute, getArcParams, getNormal, foldContourToMachiningSide,
  getToolClearanceRange, segInterferesWithTool, trimAndRemoveLoops, spliceBridgeSegments,
  removeContourSelfIntersections, buildMachinableContour, dropTinyArcs, normalizeContourDirection,
  computeInterferenceGuides, extendOffsetStartToAxis, intersectSegAtZ, _locateOnContour };
`;
const tmpPath = join(root, 'scripts', '_camface_tmp.mjs');
writeFileSync(tmpPath, prelude + src + exportsTail);
const H = await import(pathToFileURL(tmpPath).href + '?t=' + Date.now());
try { unlinkSync(tmpPath); } catch { /* */ }

// ── uživatelův .camprog (jen relevantní část) ──
const prog = JSON.parse(readFileSync(join(root, 'scripts', 'user_face_new.camprog'), 'utf8'));
const prms = prog.params;
const contourPoints = prog.contourPoints;
const stockPoints = prog.stockPoints;

const tipR = prms.toolRadius, allowanceX = prms.allowanceX, allowanceZ = prms.allowanceZ, finishAllowance = prms.finishAllowance;
const totalOffset = tipR + Math.max(allowanceX, allowanceZ) + finishAllowance;

// 1. worldPoints + fold
const absC = H.resolvePointsToAbsolute(contourPoints);
let worldPoints = absC.map(p => ({ ...p, xReal: prms.mode === 'DIAMON' ? p.xAbs/2 : p.xAbs, zReal: p.zAbs }));
const absS = H.resolvePointsToAbsolute(stockPoints);
const stockWorldPoints = absS.map(p => ({ ...p, xReal: prms.mode === 'DIAMON' ? p.xAbs/2 : p.xAbs, zReal: p.zAbs }));
worldPoints = H.foldContourToMachiningSide(worldPoints, stockWorldPoints);

// 2. contourSegments
function buildSegs(wp) {
  const segs = [];
  for (let i = 0; i < wp.length - 1; i++) {
    const p1 = wp[i], p2 = wp[i+1], type = p2.type;
    if (type === 'G1') segs.push({ type:'line', p1:{x:p1.xReal,z:p1.zReal}, p2:{x:p2.xReal,z:p2.zReal}, orig:p2, origIdx:i+1 });
    else if (type === 'G2' || type === 'G3') {
      const arc = H.getArcParams({x:p1.xReal,z:p1.zReal}, {x:p2.xReal,z:p2.zReal}, p2.rVal, type);
      const startAngle = Math.atan2(p1.xReal-arc.cx, p1.zReal-arc.cz);
      const endAngle = Math.atan2(p2.xReal-arc.cx, p2.zReal-arc.cz);
      segs.push({ type:'arc', ...arc, p1:{x:p1.xReal,z:p1.zReal}, p2:{x:p2.xReal,z:p2.zReal}, dir:type, startAngle, endAngle, origIdx:i+1 });
    }
  }
  return segs;
}
let contourSegments = buildSegs(worldPoints);
H.normalizeContourDirection(contourSegments); // pořadí jako reálný calculate() (ř. 2678)
const rawContourForInterference = contourSegments.map(s => structuredClone(s));
if (contourSegments.length > 2) contourSegments = H.spliceBridgeSegments(contourSegments);
if (contourSegments.length > 2) contourSegments = H.removeContourSelfIntersections(contourSegments);

// 3. interference + machinable
const clearance = H.getToolClearanceRange(prms, prog.flipX || false);
const interferenceSegments = clearance ? rawContourForInterference.filter(s => H.segInterferesWithTool(s, clearance)) : [];
const interferenceGuides = (clearance && prms.respectInsertGeometry)
  ? H.computeInterferenceGuides(interferenceSegments, rawContourForInterference, clearance, prms, worldPoints, stockWorldPoints) : [];
console.log('=== interferenceGuides (mezní čáry geometrie destičky) ===');
interferenceGuides.forEach((g,i)=>console.log(`  [${i}] ${g.kind}: (${g.x1.toFixed(3)},${g.z1.toFixed(3)}) -> (${g.x2.toFixed(3)},${g.z2.toFixed(3)})`));
console.log('=== interferenceSegments (úseky kam destička nedosáhne) ===');
interferenceSegments.forEach((s,i)=>{
  const d = s.type==='line'?`L (${s.p1.x.toFixed(2)},${s.p1.z.toFixed(2)})->(${s.p2.x.toFixed(2)},${s.p2.z.toFixed(2)})`:`A c(${s.cx.toFixed(2)},${s.cz.toFixed(2)}) r=${s.r.toFixed(2)} ${s.dir}`;
  console.log(`  [${i}] ${d}`);
});
if (false) {
  contourSegments = H.buildMachinableContour(contourSegments, interferenceGuides);
}
const guidesKept = interferenceGuides.filter(g =>
  !g._dominated &&
  H._locateOnContour(contourSegments, { x: g.x1, z: g.z1 }) && H._locateOnContour(contourSegments, { x: g.x2, z: g.z2 }));
console.log(`\n=== kreslené mezní čáry po filtru: ${guidesKept.length} z ${interferenceGuides.length} ===`);
guidesKept.forEach((g,i)=>console.log(`  KEEP ${g.kind}: (${g.x1.toFixed(2)},${g.z1.toFixed(2)})->(${g.x2.toFixed(2)},${g.z2.toFixed(2)})`));
console.log('\n=== machinableContour (dokreslená kontura; {MOST}=fromInsert) ===');
contourSegments.forEach((s,i)=>{
  const d = s.type==='line'
    ? `L (${s.p1.x.toFixed(3)},${s.p1.z.toFixed(3)})->(${s.p2.x.toFixed(3)},${s.p2.z.toFixed(3)})`
    : `A c(${s.cx.toFixed(2)},${s.cz.toFixed(2)}) r=${s.r.toFixed(2)} ${s.dir} (${s.p1.x.toFixed(2)},${s.p1.z.toFixed(2)})->(${s.p2.x.toFixed(2)},${s.p2.z.toFixed(2)})`;
  console.log(`  [${i}] ${d}${s.fromInsert?'  {MOST}':''}${s.chainBreak?' [CB]':''}`);
});

// 4. offsetPath
function buildOffset(segs) {
  const raw = [];
  for (const seg of segs) {
    let off = null;
    if (seg.type === 'line') {
      const n = H.getNormal(seg.p1, seg.p2);
      const tx = n.x*(tipR+allowanceX+finishAllowance), tz = n.z*(tipR+allowanceZ+finishAllowance);
      off = { type:'line', p1:{x:seg.p1.x+tx,z:seg.p1.z+tz}, p2:{x:seg.p2.x+tx,z:seg.p2.z+tz} };
    } else if (seg.type === 'arc') {
      const midAbsX = Math.abs((seg.p1.x+seg.p2.x)/2), centerAbsX = Math.abs(seg.cx);
      const isOuter = centerAbsX < midAbsX;
      let rNew = isOuter ? seg.r+totalOffset : seg.r-totalOffset;
      if (rNew > 0.05) {
        const startAngle = Math.atan2(seg.p1.x-seg.cx, seg.p1.z-seg.cz);
        const endAngle = Math.atan2(seg.p2.x-seg.cx, seg.p2.z-seg.cz);
        off = { type:'arc', cx:seg.cx, cz:seg.cz, r:rNew, dir:seg.dir, refP1:seg.p1, refP2:seg.p2, startAngle, endAngle };
      }
    }
    if (off) { if (seg.chainBreak) off.chainBreak = true; raw.push(off); }
  }
  return H.dropTinyArcs(H.trimAndRemoveLoops(raw));
}
const offsetPath = buildOffset(contourSegments);
H.extendOffsetStartToAxis(offsetPath);

// 5. stockPathSegments
const stockPathSegments = buildSegs(stockWorldPoints);

// 6. pass-helpery (kopie z calculate)
const arcAngleAtZ = (seg, z) => {
  const cosA = (z - seg.cz) / seg.r;
  if (cosA < -1.001 || cosA > 1.001) return null;
  const cosC = Math.max(-1, Math.min(1, cosA));
  const a1 = Math.acos(cosC);
  for (const a of [a1, -a1]) if (isAngleBetween(a, seg.startAngle, seg.endAngle, seg.dir === 'G2')) return a;
  return null;
};
const traceOffsetPath = (zHi, zLo) => {
  const out = [];
  for (const seg of offsetPath) {
    if (seg.isDegenerate) continue;
    if (seg.type === 'line') {
      const zA = seg.p1.z, zB = seg.p2.z;
      if (Math.abs(zA-zB) < 1e-6) { if (zA <= zHi+1e-6 && zA >= zLo-1e-6) out.push({type:'line',x1:seg.p1.x,z1:zA,x2:seg.p2.x,z2:zB}); continue; }
      const hiPt = zA>=zB?seg.p1:seg.p2, loPt = zA>=zB?seg.p2:seg.p1;
      const clipHi = Math.min(zHi,hiPt.z), clipLo = Math.max(zLo,loPt.z);
      if (clipHi <= clipLo+1e-6) continue;
      const dz = hiPt.z-loPt.z;
      const xAt = z => Math.abs(dz)<1e-9?hiPt.x:loPt.x+(z-loPt.z)/dz*(hiPt.x-loPt.x);
      out.push({type:'line',x1:xAt(clipHi),z1:clipHi,x2:xAt(clipLo),z2:clipLo});
    } else {
      const zAtStart = seg.cz+Math.cos(seg.startAngle)*seg.r, zAtEnd = seg.cz+Math.cos(seg.endAngle)*seg.r;
      const reversed = zAtStart<zAtEnd;
      const zSegHi = Math.max(zAtStart,zAtEnd), zSegLo = Math.min(zAtStart,zAtEnd);
      const clipHi = Math.min(zHi,zSegHi), clipLo = Math.max(zLo,zSegLo);
      if (clipHi <= clipLo+1e-6) continue;
      const aHi = arcAngleAtZ(seg,clipHi) ?? seg.startAngle, aLo = arcAngleAtZ(seg,clipLo) ?? seg.endAngle;
      out.push({type:'arc',cx:seg.cx,cz:seg.cz,r:seg.r,dir:reversed?(seg.dir==='G2'?'G3':'G2'):seg.dir,startAngle:aHi,endAngle:aLo,
        x1:seg.cx+Math.sin(aHi)*seg.r,z1:clipHi,x2:seg.cx+Math.sin(aLo)*seg.r,z2:clipLo});
    }
  }
  return out;
};

console.log('\n=== folded worldPoints (číslování jako v UI) ===');
worldPoints.forEach((p,i)=>console.log(`  [${i+1}] ${p.type} x=${p.xReal.toFixed(3)} z=${p.zReal.toFixed(3)}`));

const sRad = (parseFloat(prms.stockDiameter)||0)/2;
const stockFace = parseFloat(prms.stockFace) || 0;
const step = parseFloat(prms.depthOfCut) || 2.5;

function runFace(respect) {
  const passes = [], foundErrors = [];
  const ctx = { prms: { ...prms, respectInsertGeometry: respect }, sRad, stockFace, step, offsetPath,
    stockPathSegments, stockWorldPoints, worldPoints, passes, foundErrors, traceOffsetPath };
  genFacePasses(ctx);
  return { passes, foundErrors };
}

console.log('toolAngle=', prms.toolAngle, ' tipAngle=', prms.toolTipAngle, ' phiFaceDeg=', -(parseFloat(prms.toolAngle)||0));
console.log('offsetPath Z-rozsah:', Math.min(...offsetPath.flatMap(s=>s.type==='line'?[s.p1.z,s.p2.z]:[s.cz-s.r,s.cz+s.r])).toFixed(2),
  '..', Math.max(...offsetPath.flatMap(s=>s.type==='line'?[s.p1.z,s.p2.z]:[s.cz-s.r,s.cz+s.r])).toFixed(2));

const off = runFace(false);
const on = runFace(true);
const faceOff = off.passes.filter(p=>p.type==='face');
const faceOn = on.passes.filter(p=>p.type==='face');
console.log(`\nface passes: OFF=${faceOff.length}  ON=${faceOn.length}`);
on.foundErrors.forEach(e=>console.log('  WARN:', e.msg));

// Mapa OFF podle z (na 3 desetiny)
const key = z => z.toFixed(3);
// ── DOKONČOVÁNÍ: rekonstrukce finishOffsetPath na machinable kontuře ──
const clearanceFin = H.getToolClearanceRange(prms, prog.flipX || false);
function buildFinish(segs) {
  let pendingBreak = false, finRaw = [], finSkipped = 0;
  for (const seg of segs) {
    const blocked = prms.respectInsertGeometry && clearanceFin && H.segInterferesWithTool(seg, clearanceFin);
    let finSeg = null;
    if (seg.type === 'line') {
      const n = H.getNormal(seg.p1, seg.p2);
      finSeg = { type:'line', p1:{x:seg.p1.x+n.x*tipR,z:seg.p1.z+n.z*tipR}, p2:{x:seg.p2.x+n.x*tipR,z:seg.p2.z+n.z*tipR} };
    } else if (seg.type === 'arc') {
      const midAbsX = Math.abs((seg.p1.x+seg.p2.x)/2), centerAbsX = Math.abs(seg.cx);
      const isOuter = centerAbsX < midAbsX;
      let rNew = isOuter ? seg.r+tipR : seg.r-tipR;
      if (rNew > 0.05) {
        const startAngle = Math.atan2(seg.p1.x-seg.cx, seg.p1.z-seg.cz);
        const endAngle = Math.atan2(seg.p2.x-seg.cx, seg.p2.z-seg.cz);
        const ex1=seg.cx+Math.sin(startAngle)*rNew, ez1=seg.cz+Math.cos(startAngle)*rNew;
        const ex2=seg.cx+Math.sin(endAngle)*rNew, ez2=seg.cz+Math.cos(endAngle)*rNew;
        if (Math.hypot(ex2-ex1,ez2-ez1)>0.12)
          finSeg = { type:'arc', cx:seg.cx, cz:seg.cz, r:rNew, dir:seg.dir, refP1:seg.p1, refP2:seg.p2, startAngle, endAngle };
      }
    }
    if (!finSeg) { pendingBreak = true; continue; }
    if (blocked) { finSkipped++; pendingBreak = true; continue; }
    if (pendingBreak && finSeg.type==='line' && !seg.fromInsert && finRaw.length>0) {
      const prev = finRaw[finRaw.length-1];
      if (prev.type==='line' && finSeg.p1.x < prev.p2.x-0.05) { pendingBreak=false; continue; }
    }
    if ((seg.chainBreak || pendingBreak) && !seg.fromInsert) finSeg.chainBreak = true;
    pendingBreak = false; finRaw.push(finSeg);
  }
  let fin = H.dropTinyArcs(H.trimAndRemoveLoops(finRaw));
  if (worldPoints.length>0 && Math.abs(worldPoints[0].xReal)<1e-3) H.extendOffsetStartToAxis(fin);
  return { fin, finSkipped };
}
const profileXAt = (z) => {
  let mx = -Infinity;
  for (const s of rawContourForInterference) { if (s.isDegenerate) continue; for (const x of H.intersectSegAtZ(s, z)) if (x>mx) mx=x; }
  return mx;
};
const { fin: finPath, finSkipped } = buildFinish(contourSegments);
console.log(`\n######## DOKONČOVÁNÍ (finishOffsetPath, skipped=${finSkipped}) ########`);
finPath.forEach((s,i)=>{
  const d = s.type==='line'
    ? `L (${s.p1.x.toFixed(2)},${s.p1.z.toFixed(2)})->(${s.p2.x.toFixed(2)},${s.p2.z.toFixed(2)}) len=${Math.hypot(s.p2.x-s.p1.x,s.p2.z-s.p1.z).toFixed(1)}`
    : `A r=${s.r.toFixed(2)} ${s.dir}`;
  // mid-segment gouge: navzorkuj a porovnej x proti kontuře (střed nástroje musí být >= profileX)
  let worst = 0, worstZ = null;
  if (s.type==='line') {
    for (let t=0;t<=20;t++){ const x=s.p1.x+(s.p2.x-s.p1.x)*t/20, z=s.p1.z+(s.p2.z-s.p1.z)*t/20; const mx=profileXAt(z); if(mx>-Infinity){const d2=mx-x; if(d2>worst){worst=d2;worstZ=z;}} }
  }
  const g = worst>0.05 ? `   <<< ZAJÍŽDÍ ${worst.toFixed(2)}mm pod konturu @Z${worstZ.toFixed(1)}` : '';
  console.log(`  [${i}] ${d}${s.chainBreak?' [CB→G0]':''}${g}`);
});

const leadMinX = (p) => {
  if (!p.contourLeadOut || p.contourLeadOut.length === 0) return null;
  let m = Infinity;
  p.contourLeadOut.forEach(s => { m = Math.min(m, s.x1, s.x2); });
  return m;
};
console.log('\n   z       xEnd(ON)  leadOut: (x,z)->(x,z)  směr');
for (const o of faceOn) {
  if (!o.contourLeadOut || o.contourLeadOut.length === 0) { console.log(`  ${o.z.toFixed(2).padStart(7)}  ${o.xEnd.toFixed(3).padStart(8)}  (žádný)`); continue; }
  const f = o.contourLeadOut[0], l = o.contourLeadOut[o.contourLeadOut.length-1];
  const zEnd = l.z2, dir = zEnd > o.z + 0.01 ? 'DOPRAVA(+Z) ✓' : zEnd < o.z - 0.01 ? 'DOLEVA(-Z) ✗' : '?';
  console.log(`  ${o.z.toFixed(2).padStart(7)}  ${o.xEnd.toFixed(3).padStart(8)}  (${f.x1.toFixed(2)},${f.z1.toFixed(2)})->(${l.x2.toFixed(2)},${l.z2.toFixed(2)})  ${dir}`);
}
