// ŘEZ V ROVINĚ Z pro Pohled na čelo v CAM (lišta s posuvníkem v panelu ◎).
//
// Kontura a polotovar simulátoru se převedou na lomené čáry (oblouky
// vzorkované) ve tvaru objektů CAD — x = Z, y = poloměr — a počítají se
// STEJNÝMI funkcemi jako bokorys v CAD (faceView/faceReference.js): průměry
// v rovině řezu, hrany za řezem (viditelné / zakryté materiálem), osazení
// pro přichycení posuvníku a doporučená strana pohledu.
//
// Značka řezu se kreslí i do řezu (hlavní plátno) — čerchovaná čára se
// šipkou směru pohledu jako v nárysu CAD.
import { resolvePointsToAbsolute } from '../contourBuild.js';
import { getArcParams } from '../camMath.js';
import { profileAtZ, viewRadii, shoulderZs, sectionAt } from '../../../faceView/faceReference.js';

const LATHE = 'soustruh';   // výpočty vždy v (Z, poloměr) — karusel jen jinak kreslí

/**
 * Objekty CAD z bodů kontury: úsečky jdoucí za sebou = lomená čára, oblouk
 * G2/G3 = objekt `arc` (bokorys z něj bere za hranu jen konce, ne každý
 * vzorek — jinak by zaoblení dalo hustý pruh kružnic). G0 = mezera.
 * Úhel oblouku v CAD (x = cx + r·cos, y = cy + r·sin) je týž jako v CAM
 * (z = cz + r·cos, x = cx + r·sin); G2 = po směru hodin (ccw: false).
 */
export function pointsToChains(points, half, isStock = false) {
  const abs = resolvePointsToAbsolute(points || []);
  const out = [];
  let cur = null, prev = null;
  const flush = () => { if (cur && cur.length > 1) out.push({ type: 'polyline', vertices: cur, isStock }); cur = null; };
  abs.forEach(p => {
    const x = p.xAbs * half, z = p.zAbs;
    if (!Number.isFinite(x) || !Number.isFinite(z)) return;
    const arc = prev && p.type !== 'G0' && (p.type === 'G2' || p.type === 'G3') && p.rVal
      ? getArcParams({ x: prev.x, z: prev.z }, { x, z }, p.rVal, p.type) : null;
    if (!prev || p.type === 'G0') { flush(); cur = [{ x: z, y: x }]; }
    else if (arc && !arc.error) {
      flush();
      out.push({
        type: 'arc', cx: arc.cz, cy: arc.cx, r: arc.r, isStock, ccw: p.type === 'G3',
        startAngle: Math.atan2(prev.x - arc.cx, prev.z - arc.cz), endAngle: Math.atan2(x - arc.cx, z - arc.cz),
      });
      cur = [{ x: z, y: x }];
    } else (cur || (cur = [{ x: prev.z, y: prev.x }])).push({ x: z, y: x });
    prev = { x, z };
  });
  flush();
  return out;
}

/**
 * Profil dílu pro řezy: objekty (kontura + tvarový polotovar) a osazení.
 * Válcový polotovar se nepřidává — jeho poloměr je všude stejný (geo.stockR).
 */
export function liveProfile(S) {
  const prms = S.params || {};
  const half = prms.mode === 'DIAMON' ? 0.5 : 1;
  const objects = pointsToChains(S.contourPoints, half);
  if (prms.stockMode !== 'cylinder') objects.push(...pointsToChains(S.stockPoints, half, true));
  const sh = shoulderZs(objects, LATHE);
  return { objects, empty: !objects.some(o => !o.isStock), zs: sh.zs, min: sh.min, max: sh.max };
}

/**
 * Řez v rovině z při pohledu ze strany side ('right' = zprava, k −Z).
 * @returns {{ z, side, at, view }} at = profileAtZ s plochou řezu (outerR,
 *   innerR) z materiálu za rovinou (sectionAt), view = { visible, hidden }
 */
export function liveCutAt(prof, z, side) {
  const at0 = profileAtZ(prof.objects, LATHE, z);
  const view = viewRadii(prof.objects, LATHE, z, side, at0);
  return { z, side, at: { ...at0, ...sectionAt(prof.objects, LATHE, z, side) }, view };
}

/** Strana pohledu podle osazení v rovině z (menší průměr vpravo → zprava). */
export function autoSide(prof, z, fallback = 'right') {
  return profileAtZ(prof.objects, LATHE, z).side || fallback;
}

/** Přichytit z k nejbližší z hodnot `zs` do `tol` [mm]. */
export function snapZ(z, zs, tol) {
  let best = z, d = tol;
  zs.forEach(v => { const dd = Math.abs(v - z); if (dd <= d) { d = dd; best = v; } });
  return best;
}

/**
 * Značka řezu v řezu (hlavní plátno CAM): čerchovaná čára v rovině Z od osy
 * přes polotovar, šipka = směr pohledu, popisek Z.
 * @param f snímek z drawCanvas.js ({ ctx, toScreen })
 */
export function drawCutMark(f, z, side, stockR) {
  const { ctx, toScreen } = f;
  if (!Number.isFinite(z) || !(stockR > 0)) return;
  const col = 'rgba(250,179,135,0.95)';
  const span = stockR + Math.max(6, stockR * 0.15);
  const a = toScreen(0, z), b = toScreen(span, z);
  ctx.save();
  ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = 1.5;
  ctx.setLineDash([10, 3, 2, 3]);
  ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
  ctx.setLineDash([]);
  const dir = side === 'left' ? 1 : -1;
  const c = toScreen(span, z + dir * Math.max(4, span * 0.25));
  const dx = c.x - b.x, dy = c.y - b.y, L = Math.hypot(dx, dy) || 1, ux = dx / L, uy = dy / L;
  ctx.beginPath(); ctx.moveTo(b.x, b.y); ctx.lineTo(c.x, c.y); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(c.x, c.y);
  ctx.lineTo(c.x - ux * 8 - uy * 4, c.y - uy * 8 + ux * 4);
  ctx.lineTo(c.x - ux * 8 + uy * 4, c.y - uy * 8 - ux * 4);
  ctx.closePath(); ctx.fill();
  ctx.font = 'bold 11px sans-serif';
  ctx.fillText(`Z${fmt(z)}`, b.x + 4, b.y - 6);
  ctx.restore();
}

export function fmt(v) { return String(+(+v).toFixed(3)).replace('.', ','); }
