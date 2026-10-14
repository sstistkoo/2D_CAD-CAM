// Headless reprodukce CELÉHO G-kódu: nastaví simulátor z .camprog a vypíše
// vygenerovaný G-kód (hrubování + dokončování). CAMDBG=1/2 vypíše mezikroky,
// CAMSVG=… nakreslí dráhy.
//   node scripts/cam_gcode_repro.mjs [cesta-k-.camprog]
//
// Běží přes tests/helpers/camHeadless.mjs — týž headless běh, na kterém stojí
// CAM testy. Dřív měl skript vlastní kopii (stuby DOM + vyřezání ze zdroje
// camSimulator.js), která po přesunech kódu do modulů tiše přestala fungovat
// („injectCSS is not defined", zjištěno 13. 10. 2026).
import { readFileSync, writeFileSync } from 'fs';
import { runCamProg } from '../tests/helpers/camHeadless.mjs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

// ── Naloaduj .camprog ──
const progPath = process.argv[2] || 'C:/Users/stistko/Downloads/projekt_2026-06-30 (10).camprog';
const prog = JSON.parse(readFileSync(progPath, 'utf8'));
const { calc, gcode } = await runCamProg(prog);

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

const text = gcode;

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
