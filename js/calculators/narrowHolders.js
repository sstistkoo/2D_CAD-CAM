// ╔══════════════════════════════════════════════════════════════╗
// ║  SKICA – ÚZKÉ držáky: kulatá destička a upichovák             ║
// ╚══════════════════════════════════════════════════════════════╝
//
// Uživatel 1. 11. 2026 (SRDPN1010H10T3 + RPMT10T3): držák užší než plátek,
// aby při kolmém čele / stěně nedrhla ani jedna strana. Totéž pro upichovák.
// Šířka držáku se odvozuje z plátku — změní-li se R kulaté destičky nebo
// šířka upichovací destičky, držák je pořád o NARROW_GAP_MM na stranu užší
// (přestavba: cam/holderFollowsInsert.js).
//
// Obrys v profilových souřadnicích (jako isoToolCatalog.js): 0,0 = střed
// rádiusu, +z = k držáku, +x = k obrobené straně. Oba držáky jsou souměrné
// (neutrální) — rovná lišta bez rozšíření, takže dosah do hloubky neomezuje.

import { isoKnifeRecord, isoCutData, isoCloseLoop } from './isoToolCatalog.js';
import { PARTING_BODY_MIN_H_MM } from './cam/insertPreview.js';

/** O kolik je držák užší než plátek — na KAŽDÉ straně [mm]. */
export const NARROW_GAP_MM = { round: 0.5, parting: 0.2 };
/** Délka lišty od plátku (jako dřík 2525 M). */
const NARROW_LENGTH_MM = 150;
const SEAT_ROUND_MM = 0.5;      // lůžko kulaté destičky odsazené od kružnice (jako ISO v3)

const rad = (d) => d * Math.PI / 180;
const r3 = (v) => Math.round(v * 1000) / 1000;
const num = (v) => parseFloat(v) || 0;

/** Poloviční šířka lišty kulatého držáku (nikdy pod 30 % R). */
const roundHalf = (R) => Math.max(0.3 * R, R - NARROW_GAP_MM.round);

/**
 * Lišta nad kulatou destičkou poloměru R: boky svisle na ±(R − mezera),
 * spodek lůžka obepíná horní oblouk kružnice (opsaný mnohoúhelník — do
 * destičky nesahá).
 */
function roundNarrowLoop(R) {
  const h = roundHalf(R), N = 8;
  let rr = R + SEAT_ROUND_MM, phi = 0, step = 0;
  for (let i = 0; i < 3; i++) {
    phi = Math.acos(Math.min(h / rr, 1)) * 180 / Math.PI;
    step = (180 - 2 * phi) / N;
    rr = R / Math.cos(rad(step / 2)) + SEAT_ROUND_MM;
  }
  phi = Math.acos(h / rr) * 180 / Math.PI;
  step = (180 - 2 * phi) / N;
  const at = (deg) => ({ x: rr * Math.cos(rad(deg)), z: rr * Math.sin(rad(deg)) });
  const seat = [];
  for (let i = N - 1; i >= 1; i--) seat.push(at(phi + i * step));
  const zA = Math.sqrt(rr * rr - h * h);
  return isoCloseLoop([{ x: h, z: zA }, { x: h, z: NARROW_LENGTH_MM }, { x: -h, z: NARROW_LENGTH_MM },
    { x: -h, z: zA }, ...seat]);
}

/** Lišta nad upichovací destičkou šířky w: od těla destičky rovně, užší o mezeru na stranu. */
function partingNarrowLoop(w, r) {
  r = Math.min(r, w / 2);
  const g = Math.min(NARROW_GAP_MM.parting, 0.2 * w);
  const bodyTop = Math.max(w * 0.6, r + PARTING_BODY_MIN_H_MM) - r;
  const xL = -r + g, xR = w - r - g;
  return isoCloseLoop([{ x: xL, z: bodyTop }, { x: xR, z: bodyTop }, { x: xR, z: NARROW_LENGTH_MM }, { x: xL, z: NARROW_LENGTH_MM }]);
}

/**
 * Úzký držák pro plátek `prms` (toolShape, toolRadius, toolLength); null =
 * tvar úzký držák nemá.
 * @returns {{sideA:Array, sideB:Array}|null}
 */
export function narrowHolderProfile(prms) {
  if (!prms) return null;
  const shape = prms.toolShape || prms.shape;
  if (shape === 'round' && num(prms.toolRadius) > 0) return { sideA: roundNarrowLoop(num(prms.toolRadius)), sideB: [] };
  if (shape === 'parting' && num(prms.toolLength) > 0) return { sideA: partingNarrowLoop(num(prms.toolLength), num(prms.toolRadius)), sideB: [] };
  return null;
}

/** Šířka lišty úzkého držáku [mm] pro plátek `prms`. */
export function narrowHolderWidth(prms) {
  const shape = prms.toolShape || prms.shape;
  if (shape === 'round') return r3(2 * roundHalf(num(prms.toolRadius)));
  const w = num(prms.toolLength);
  return r3(w - 2 * Math.min(NARROW_GAP_MM.parting, 0.2 * w));
}

/**
 * Úzký nůž jako záznam knihovny (tvar jako buildIsoKnife).
 * @param {{kind:'round'|'parting', radius?:number, width?:number, tipRadius?:number}} opts
 */
export function buildNarrowKnife(opts = {}) {
  if (opts.kind === 'parting') {
    const w = num(opts.width) || 4, r = Math.min(num(opts.tipRadius) || 0.4, w / 2);
    const prms = { toolShape: 'parting', toolLength: w, toolRadius: r, toolAngle: 0, toolTipAngle: 90, toolTipFlat: 0.1, toolClearanceAngle: 0 };
    const hw = narrowHolderWidth(prms);
    return isoKnifeRecord({
      name: 'Upichovák úzký', vbdCode: `MGMN${Math.round(w * 100)}-M`, holder: partingNarrowLoop(w, r), prms,
      sh: { b: hw, l1: NARROW_LENGTH_MM }, hand: 'R',
      cut: { vc: 120, f: r3(0.05 + 0.01 * w), ap: 2 },
      desc: `Upichovák s rovnou lištou užší o ${NARROW_GAP_MM.parting} mm na stranu než destička — boky nedrhnou v žádné hloubce. Šířka lišty sleduje šířku destičky.`,
      iso: { type: 'narrow', kind: 'parting', width: w },
    });
  }
  const R = num(opts.radius) || 5;
  const prms = { toolShape: 'round', toolLength: 10, toolRadius: R, toolAngle: 0, toolTipAngle: 90, toolTipFlat: 0.1, toolClearanceAngle: 11 };
  return isoKnifeRecord({
    name: 'SRDPN úzký', vbdCode: 'RPMT10T3MO', holder: roundNarrowLoop(R), prms,
    sh: { b: narrowHolderWidth(prms), l1: NARROW_LENGTH_MM }, hand: 'R',
    cut: isoCutData('round', 0, 0, R),
    desc: `Kulatá destička v neutrální liště užší o ${NARROW_GAP_MM.round} mm na stranu než destička (SRDPN) — ke kolmé stěně dojede zleva i zprava. Šířka lišty sleduje R.`,
    iso: { type: 'narrow', kind: 'round', radius: R },
  });
}
