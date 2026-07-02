// ╔══════════════════════════════════════════════════════════════╗
// ║  CAM – sdílené čisté geometrické helpery (bez DOM/stavu)       ║
// ╚══════════════════════════════════════════════════════════════╝
// Čisté funkce vytažené z camSimulator.js, aby je mohly sdílet i
// strategie generování drah (cam/roughingStrategies.js a další).
// Startovní množina — modul může postupně absorbovat další pure helpery.

// Efektivní úhel zanoření (ramp-in): auto z tvaru destičky (podélně =
// natočení, čelně = |natočení + vrchol − 90|), nebo ruční entryAngle.
// Pokud je nastaven úhel hřbetu α > 0, omezuje výsledek shora — hřbet destičky
// kontaktuje materiál při zanořování strmějším než α.
export function getEffectivePlungeAngle(prms) {
  // Upichovák smí zanořit kolmo k ose (přímo k Z) → strop 90° místo 89°.
  const parting = prms.toolShape === 'parting';
  const clampA = (v) => Math.max(0.5, Math.min(parting ? 90 : 89, v));
  if (!prms.entryAngleAuto) return clampA(parseFloat(prms.entryAngle) || 30);
  if (parting) return 90;               // auto = svislé zanoření (part-off)
  if (prms.toolShape !== 'polygon') return 45;
  const rot = parseFloat(prms.toolAngle) || 0;
  const tip = parseFloat(prms.toolTipAngle) || 90;
  const clearDeg = parseFloat(prms.toolClearanceAngle) || 0;
  const rawAngle = prms.roughingStrategy === 'face' ? Math.abs(rot + tip - 90) : Math.abs(rot);
  // clearDeg > 0 → pozitivní plátka, hřbet omezuje max. zanoření na α
  const a = clearDeg > 0 ? Math.min(rawAngle, clearDeg) : rawAngle;
  return clampA(a);
}

// Leží úhel `target` v intervalu <start,end>? isG2 = směr CW (G2).
export function isAngleBetween(target, start, end, isG2) {
  if (isNaN(target) || isNaN(start) || isNaN(end)) return false;
  const pi2 = 2 * Math.PI;
  const t = ((target % pi2) + pi2) % pi2;
  const s = ((start % pi2) + pi2) % pi2;
  const e = ((end % pi2) + pi2) % pi2;
  if (isG2) { if (s >= e) return t <= s && t >= e; return t <= s || t >= e; }
  else { if (e >= s) return t >= s && t <= e; return t >= s || t <= e; }
}

// X průsečíku svislé čáry Z=zLine s úsečkou p1→p2 (null mimo Z-rozsah).
export function intersectVerticalLineSegment(zLine, p1, p2) {
  if (!p1 || !p2) return null;
  const minZ = Math.min(p1.z, p2.z), maxZ = Math.max(p1.z, p2.z);
  if (zLine < minZ || zLine > maxZ) return null;
  if (Math.abs(p2.z - p1.z) < 1e-6) return null;
  const t = (zLine - p1.z) / (p2.z - p1.z);
  return p1.x + t * (p2.x - p1.x);
}

// X-ové průsečíky svislé čáry Z=zLine s kružnicí (0 nebo 2 hodnoty).
export function intersectVerticalLineArc(zLine, center, radius) {
  if (!center) return [];
  const term = radius * radius - Math.pow(zLine - center.z, 2);
  if (term < 0) return [];
  const sqrtTerm = Math.sqrt(term);
  return [center.x - sqrtTerm, center.x + sqrtTerm];
}
