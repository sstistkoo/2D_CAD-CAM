// ╔══════════════════════════════════════════════════════════════╗
// ║  SKICA – ISO katalog soustružnických nožů (držák + VBD)      ║
// ╚══════════════════════════════════════════════════════════════╝
//
// Vestavěná sada běžných VNĚJŠÍCH soustružnických nožů podle ISO 5608
// (značení držáku) a ISO 1832 (značení VBD). Z typu držáku, dříku h×b,
// velikosti destičky a rádiusu špičky se PARAMETRICKY postaví celý nůž pro
// CAM: destička (ε, natočení, délka hrany, R, α) i obrys držáku
// (holderProfile). Výstup má tvar záznamu 🧰 Knihovny (toolLibrary.js) —
// „✅ Použít" i „🔧 Do zásobníku" tak jdou stejnou cestou jako uložené nože.
//
// Rozměry dříku (h × b, l1, f1) jsou typické řady ISO 5610 / katalogů
// výrobců, tvar hlavy je schematický — ORIENTAČNÍ, ne katalogová data
// konkrétního výrobce. UI to musí říct.
//
// Obrys je v PROFILOVÝCH souřadnicích jako všude v CAM (insertPreview.js):
// 0,0 = střed rádiusu špičky, +z = od špičky k držáku, +x = k obrobené
// straně. Kreslí se pravý nůž (R); levý (L) zrcadlí CAM sám podle strany
// hrubování, ruka v záznamu je jen pro náhled a název.
//
// Natočení destičky v CAM (toolAngle θ) = úhel VEDLEJŠÍ (spodní) hrany od
// osy Z, hlavní hrana leží pod θ + ε (inserts/polygon.js). Z úhlu nastavení κr:
//   podélně (hlavní hrana proti posuvu −Z):        θ = 180 − ε − κr
//   čelně, styl F/K (hlavní hrana proti posuvu −X): θ = κr − 90

import { SHAPES, sizeInfo, CLEARANCE_DEG, RADIUS_MM } from './vbdIso.js';
import { buildInsertProfileSegments, buildInsertOutlineSegments, PARTING_BODY_MIN_H_MM } from './cam/insertPreview.js';
import { segPoints, knifeThumbSvg } from './knifeThumb.js';

/**
 * Dřík: výška × šířka, délkový kód a l1 (ISO 5608 poz. 8), f1 = špička od
 * zadní strany dříku (přesazené držáky). ic = rozsah IC destiček, které se
 * do hlavy dají dát (o stupeň širší než nejběžnější řada — hlava se staví
 * podle destičky), ic0 = typická velikost pro výchozí volbu.
 */
export const ISO_SHANKS = [
  { code: '1616', h: 16, b: 16, len: 'H', l1: 100, f1: 20, ic: [6, 13], ic0: 9.525 },
  { code: '2020', h: 20, b: 20, len: 'K', l1: 125, f1: 25, ic: [6, 16], ic0: 12.7 },
  { code: '2525', h: 25, b: 25, len: 'M', l1: 150, f1: 32, ic: [6, 20], ic0: 12.7 },
  { code: '3232', h: 32, b: 32, len: 'P', l1: 170, f1: 40, ic: [9, 20], ic0: 15.875 },
];
/** Kulatá destička do dříku: průměr 0,3·b až b. */
const ROUND_FIT = [0.3, 1];

export const ISO_GROUPS = [
  { id: 'long', label: 'Podélné' },
  { id: 'face', label: 'Čelní' },
  { id: 'copy', label: 'Kopírovací' },
  { id: 'chamfer', label: 'Srážecí' },
  { id: 'groove', label: 'Zapichovací' },
  { id: 'thread', label: 'Závitové' },
];

// Destičky k držákům — klíč = velikost (ISO 1832 poz. 5), hodnota = tloušťka
// (poz. 6). Negativní …NMG (upnutí páčkou P / upínkou M), pozitivní …CMT /
// VBMT (upnutí šroubem S); kulatá jen pozitivní RCMT.
const INSERTS = {
  C: { neg: { '09': 'T3', '12': '04', '16': '06', '19': '06' }, pos: { '06': '02', '09': 'T3', '12': '04' } },
  D: { neg: { '11': '04', '15': '06' }, pos: { '07': '02', '11': 'T3' } },
  S: { neg: { '09': 'T3', '12': '04', '15': '06', '19': '06' }, pos: { '09': 'T3', '12': '04' } },
  T: { neg: { '16': '04', '22': '04' }, pos: { '11': '02', '16': 'T3' } },
  V: { neg: { '16': '04' }, pos: { '11': '03', '16': '04' } },
  W: { neg: { '06': 'T3', '08': '04' } },
  R: { pos: { '06': '02', '08': '03', '10': 'T3', '12': '04', '16': '06', '20': '06', '25': '07', '32': '09' } },
};
/** Úhel hřbetu pozitivní destičky (ISO 1832 poz. 2): VBMT 5°, ostatní 7°. */
const POS_CLEARANCE = { V: 'B' };

// Typy držáků. neg/pos = písmeno upnutí (ISO 5608 poz. 1) pro negativní /
// pozitivní destičku — chybí-li, varianta se nenabízí. face = κr se měří
// k čelu (styl F, K). neutral = dřík souměrně nad špičkou (ruka N).
export const ISO_HOLDER_TYPES = [
  { id: 'CL', shape: 'C', style: 'L', kr: 95, neg: 'P', pos: 'S', groups: ['long', 'face'],
    desc: 'Podélné i čelní soustružení do osazení 90°. Nejuniverzálnější nůž — hrubování i dokončení.' },
  { id: 'WL', shape: 'W', style: 'L', kr: 95, neg: 'P', groups: ['long', 'face'],
    desc: 'Podélné i čelní do osazení 90°. Trigon 80° — pevná špička, 6 břitů.' },
  { id: 'TG', shape: 'T', style: 'G', kr: 90, neg: 'P', pos: 'S', groups: ['long'],
    desc: 'Podélné soustružení do osazení 90°. Trojúhelník — 6 (3) břitů.' },
  { id: 'CB', shape: 'C', style: 'B', kr: 75, neg: 'P', groups: ['long'],
    desc: 'Podélné hrubování, κr 75° ztenčí třísku. Pevná špička, osazení 90° neudělá.' },
  { id: 'SB', shape: 'S', style: 'B', kr: 75, neg: 'P', groups: ['long'],
    desc: 'Podélné hrubování (κr 75°). Čtverec — 8 břitů, nejpevnější špička.' },
  { id: 'SK', shape: 'S', style: 'K', kr: 75, face: true, neg: 'P', groups: ['face'],
    desc: 'Čelní hrubování (κr 75° k čelu). Čtverec — 8 břitů.' },
  { id: 'TF', shape: 'T', style: 'F', kr: 90, face: true, neg: 'P', pos: 'S', groups: ['face'],
    desc: 'Čelní soustružení (zarovnání čela, κr 90°). Trojúhelník.' },
  { id: 'DJ', shape: 'D', style: 'J', kr: 93, neg: 'P', pos: 'S', groups: ['copy', 'long'],
    desc: 'Kopírování a profilování (κr 93°) — zanoření do ~30°, dokončení tvarů.' },
  { id: 'DN', shape: 'D', style: 'N', kr: 62.5, neutral: true, neg: 'P', pos: 'S', groups: ['copy'],
    desc: 'Kopírování oběma směry (neutrální, κr 62,5°) — rádiusy a zápichy z obou stran.' },
  { id: 'VJ', shape: 'V', style: 'J', kr: 93, neg: 'M', pos: 'S', groups: ['copy'],
    desc: 'Jemné kopírování (κr 93°) — zanoření do ~50°, úzké tvary.' },
  { id: 'VV', shape: 'V', style: 'V', kr: 72.5, neutral: true, neg: 'M', pos: 'S', groups: ['copy'],
    desc: 'Jemné kopírování oběma směry (neutrální, κr 72,5°).' },
  { id: 'SS', shape: 'S', style: 'S', kr: 45, neg: 'P', pos: 'S', groups: ['chamfer', 'long'],
    desc: 'Srážení hran 45° a podélné hrubování (κr 45°). Čtverec — 8 břitů.' },
  { id: 'SD', shape: 'S', style: 'D', kr: 45, neutral: true, neg: 'P', groups: ['chamfer'],
    desc: 'Srážení hran oběma směry (neutrální, κr 45°).' },
  { id: 'RD', shape: 'R', style: 'D', neutral: true, pos: 'S', groups: ['copy', 'long'],
    desc: 'Kulatá destička, neutrální — kopírování oběma směry. Dřík je souměrně nad destičkou, k čelu nedojede.' },
  { id: 'RS', shape: 'R', style: 'S', pos: 'S', groups: ['copy', 'long', 'face'],
    desc: 'Kulatá destička v rohu dříku, hlava zkosená 45° — destička vyčnívá o R, dojede až k čelu / osazení.' },
  { id: 'RG', shape: 'R', style: 'G', pos: 'S', groups: ['copy', 'long', 'face'],
    desc: 'Kulatá destička v rohu dříku, rovné čelo hlavy (90°) — dojede k čelu, tužší než zkosená hlava.' },
  { id: 'GR', special: 'parting', groups: ['groove'],
    desc: 'Zapichování a upichování — destička MGMN šířky 2–5 mm, levý bok v rovině s držákem.' },
  { id: 'TH', special: 'threading', groups: ['thread'],
    desc: 'Vnější závit — laydown destička 16ER, částečný profil AG60 (60°) / AG55 (55°).' },
];

/** Zapichovací destičky MGMN (výrobcovské značení, ISO je nepokrývá); tmax = max. hloubka zápichu. */
export const ISO_GROOVE_INSERTS = [
  { w: 2, code: 'MGMN200-G', r: 0.2, tmax: 16 },
  { w: 3, code: 'MGMN300-M', r: 0.4, tmax: 20 },
  { w: 4, code: 'MGMN400-M', r: 0.4, tmax: 20 },
  { w: 5, code: 'MGMN500-M', r: 0.8, tmax: 23 },
];
const GROOVE_FIT = { 1616: [2, 3], 2020: [2, 4], 2525: [2, 5], 3232: [3, 5] };

/** Závitové laydown destičky 16ER (de facto standard, IC 9,525). */
export const ISO_THREAD_INSERTS = [
  { id: 'AG60', angle: 60, label: 'AG60 · 60° (M, UN), P 0,5–3' },
  { id: 'AG55', angle: 55, label: 'AG55 · 55° (G, BSW), 8–48 z/″' },
];

const RELIEF_DEG = 3;          // úleva boků hlavy od hran destičky
const THREAD_FLANK_MM = 2.5;   // bok zubu AG (hloubka do P 3 mm ≈ 1,8 mm)

const rad = (d) => d * Math.PI / 180;
const r3 = (v) => Math.round(v * 1000) / 1000;
const shankOf = (code) => ISO_SHANKS.find((s) => s.code === code) || ISO_SHANKS[2];
const epsOf = (shape) => (SHAPES.find((s) => s.v === shape) || {}).angle;

export function isoTypeById(id) {
  return ISO_HOLDER_TYPES.find((t) => t.id === id) || null;
}

// ── Výběr variant (pro UI) ─────────────────────────────────────

function icOf(shape, size) {
  const s = sizeInfo(shape, size);
  return s ? (s.diameter || s.ic) : null;
}

/** Velikosti destičky, které se k dříku hodí (podle IC). */
export function isoSizes(type, variant, shankCode) {
  const table = INSERTS[type.shape] && INSERTS[type.shape][variant];
  if (!table || !type[variant]) return [];
  const sh = shankOf(shankCode);
  const [lo, hi] = type.shape === 'R' ? ROUND_FIT.map((k) => k * sh.b) : sh.ic;
  // Seřadit podle IC — klíče „09", „06" by objekt jinak vrátil až za „12", „16".
  return Object.keys(table).filter((sz) => { const ic = icOf(type.shape, sz); return ic >= lo && ic <= hi; })
    .sort((a, b) => icOf(type.shape, a) - icOf(type.shape, b));
}

/** Varianty (neg/pos), pro které má dřík aspoň jednu velikost. */
export function isoVariants(type, shankCode) {
  if (type.special === 'parting') return isoGrooveWidths(shankCode).length ? ['neg'] : [];
  if (type.special === 'threading') return ['neg'];
  return ['neg', 'pos'].filter((v) => isoSizes(type, v, shankCode).length > 0);
}

/** Rádiusy špičky (ISO 1832 poz. 7) podle velikosti destičky. */
export function isoRadii(type, size) {
  if (type.shape === 'R') return [];
  const ic = icOf(type.shape, size) || 12.7;
  if (ic < 7) return ['02', '04', '08'];
  const sharp = type.shape === 'D' || type.shape === 'V';
  if (ic < 10) return sharp ? ['02', '04', '08', '12'] : ['04', '08', '12'];
  return ['04', '08', '12', '16'];
}

export function isoGrooveWidths(shankCode) {
  const [lo, hi] = GROOVE_FIT[shankOf(shankCode).code];
  return ISO_GROOVE_INSERTS.filter((g) => g.w >= lo && g.w <= hi);
}

/** Výchozí volba pro typ a dřík: negativní, IC nejblíž typické velikosti dříku, rε 0,8. */
export function isoDefaults(type, shankCode) {
  const sh = shankOf(shankCode);
  if (type.special === 'parting') {
    const ws = isoGrooveWidths(sh.code);
    return { variant: 'neg', width: (ws.find((g) => g.w === 3) || ws[0] || {}).w };
  }
  if (type.special === 'threading') return { variant: 'neg', thread: 'AG60' };
  const variant = isoVariants(type, sh.code)[0];
  if (!variant) return null;
  // Trojúhelník má na stejný dřík o stupeň menší IC (PTGNR 2525M16, ne M22).
  const target = type.shape === 'R' ? sh.ic0 - 0.7 : type.shape === 'T' ? sh.ic0 * 0.75 : sh.ic0;
  const size = isoSizes(type, variant, sh.code).reduce((best, sz) => {
    const d = Math.abs(icOf(type.shape, sz) - target), db = Math.abs(icOf(type.shape, best) - target);
    return d < db || (d === db && icOf(type.shape, sz) > icOf(type.shape, best)) ? sz : best;
  });
  const radii = isoRadii(type, size);
  return { variant, size, radius: radii.includes('08') ? '08' : radii[0] };
}

// ── Kódy ───────────────────────────────────────────────────────

function insertCode(type, variant, size, radius) {
  const thick = INSERTS[type.shape][variant][size];
  if (type.shape === 'R') return 'RCMT' + size + thick + 'M0';
  const head = variant === 'neg' ? type.shape + 'NMG' : type.shape + (POS_CLEARANCE[type.shape] || 'C') + 'MT';
  return head + size + thick + radius;
}

function holderCode(type, variant, sh, size, hand) {
  const clear = variant === 'neg' ? 'N' : (POS_CLEARANCE[type.shape] || 'C');
  return type[variant] + type.shape + type.style + clear + (type.neutral ? 'N' : hand) + sh.code + sh.len + size;
}

/** Popisek velikosti destičky pro výběr: „CNMG 1204", „RCMT 1204M0". */
export function isoInsertLabel(type, variant, size) {
  const code = insertCode(type, variant, size, '');
  return code.slice(0, 4) + ' ' + code.slice(4);
}

// ── Geometrie ──────────────────────────────────────────────────

/** Pravý bok hlavy: od konce vedlejší hrany (FA) pod úhlem dA k pravé straně dříku. */
function rightFlank(FA, dA, xR) {
  const dx = Math.max(xR - FA.x, 0);
  return [FA, { x: xR, z: FA.z + dx * Math.tan(rad(dA)) }];
}

/**
 * Levý bok hlavy od horní hrany hlavy (zTop) dolů ke konci hlavní hrany (FB).
 * Bok drží za prodloužením hlavní hrany (úhel dB), aby hlava nevadila v
 * osazení; nikdy ale nevyčnívá dál než roh destičky — pak jde svisle.
 */
function leftFlank(FB, dB, xL, zTop) {
  const c = Math.cos(rad(dB)), s = Math.sin(rad(dB));
  const xr = FB.x + (zTop - FB.z) * c / s;
  if (xr <= xL) {
    const xMin = Math.min(xL, FB.x);
    if (xr >= xMin) return [{ x: xr, z: zTop }, FB];
    const zM = c < -1e-9 ? FB.z + (xMin - FB.x) * s / c : FB.z;
    return [{ x: xMin, z: zTop }, { x: xMin, z: zM }, FB];
  }
  if (FB.x < xL && c > 1e-9) return [{ x: xL, z: FB.z + (xL - FB.x) * s / c }, FB];
  return [{ x: xL, z: FB.z }, FB];
}

/** Uzavřený obrys (první = poslední bod), bez opakovaných bodů a bodů uprostřed přímky, zaokrouhlený. */
function closeLoop(pts) {
  let out = [];
  for (const p of pts) {
    const q = { x: r3(p.x), z: r3(p.z) };
    const l = out[out.length - 1];
    if (!l || Math.hypot(l.x - q.x, l.z - q.z) > 1e-3) out.push(q);
  }
  if (out.length > 1 && Math.hypot(out[0].x - out[out.length - 1].x, out[0].z - out[out.length - 1].z) < 1e-3) out.pop();
  const straight = (a, b, c) => Math.abs((b.x - a.x) * (c.z - b.z) - (b.z - a.z) * (c.x - b.x)) < 1e-6
    && (b.x - a.x) * (c.x - b.x) + (b.z - a.z) * (c.z - b.z) > 0;
  out = out.filter((b, i) => !straight(out[(i - 1 + out.length) % out.length], b, out[(i + 1) % out.length]));
  out.push({ ...out[0] });
  return out;
}

/** Obrys držáku polygonální destičky — hlava od spojnice FA–FB (zadní půlka destičky sedí v lůžku). */
function polygonHolder(prms, type, sh) {
  const cut = buildInsertProfileSegments(prms);           // [t1→FA, FA→FB, FB→t2, oblouk]
  const FA = cut[0].to, FB = cut[1].to;
  const minX = Math.min(...segPoints(cut).map((p) => p.x));
  const maxZ = Math.max(...segPoints(buildInsertOutlineSegments(prms)).map((p) => p.z));
  const xL = type.neutral ? -sh.b / 2 : minX + (sh.f1 - sh.b);
  const xR = xL + sh.b;
  // Velká destička v úzkém (neutrálním) dříku: hlava je širší než dřík a na
  // horní hraně hlavy se do dříku zúží (vlevo to samo řeší leftFlank).
  const xHR = Math.max(xR, FA.x + 1);
  const theta = prms.toolAngle, eps = prms.toolTipAngle;
  const right = rightFlank(FA, Math.max(theta, 0) + RELIEF_DEG, xHR);
  const zTop = Math.max(1.3 * sh.b, right[1].z + 2, maxZ + 2, FB.z + 2);
  const left = leftFlank(FB, theta + eps - RELIEF_DEG, xL, zTop);
  const step = xHR > xR ? [{ x: xHR, z: zTop }, { x: xR, z: zTop }] : [];
  return closeLoop([...right, ...step, { x: xR, z: sh.l1 }, { x: xL, z: sh.l1 }, { x: xL, z: zTop }, ...left]);
}

/**
 * Obrys držáku kulaté destičky; lůžko obepíná horní oblouk kružnice
 * (opsaný mnohoúhelník — do destičky nesahá).
 *  D (SRDCN)  neutrální — dřík souměrně nad destičkou, boky hlavy 65°.
 *  S (SRSCR)  dřík od středu destičky doprava: vlevo destička vyčnívá o R
 *             (dojede k čelu / osazení), vpravo krček a sražení hlavy 45°.
 *  G (SRGCR)  totéž bez sražení — rovné čelo hlavy nad destičkou (90°).
 */
function roundHolder(r, sh, style) {
  const PHI = 25;
  const at = (deg, rr) => ({ x: rr * Math.cos(rad(deg)), z: rr * Math.sin(rad(deg)) });
  if (style === 'D') {
    const N = 8, step = (180 - 2 * PHI) / N, rr = r / Math.cos(rad(step / 2)) + 0.05;
    const FA = at(PHI, rr), FB = at(180 - PHI, rr);
    const xL = -sh.b / 2, xR = sh.b / 2;
    const right = rightFlank(FA, 65, xR);
    const zTop = Math.max(1.3 * sh.b, right[1].z + 2, r + 2);
    const left = leftFlank(FB, 115, xL, zTop);
    const seat = [];
    for (let i = N - 1; i >= 1; i--) seat.push(at(PHI + i * step, rr));
    return closeLoop([...right, { x: xR, z: sh.l1 }, { x: xL, z: sh.l1 }, { x: xL, z: zTop }, ...left, ...seat]);
  }
  const N = 5, step = (90 - PHI) / N, rr = r / Math.cos(rad(step / 2)) + 0.05;
  const FA = at(PHI, rr), xR = sh.b;
  const seat = [];
  for (let i = N - 1; i >= 1; i--) seat.push(at(PHI + i * step, rr));
  let head;
  if (style === 'S') {
    const zNeck = rr + 0.5 * r;
    head = [FA, { x: FA.x, z: zNeck }, { x: xR, z: zNeck + (xR - FA.x) }];
  } else {
    head = [FA, { x: xR, z: FA.z }];
  }
  return closeLoop([...head, { x: xR, z: sh.l1 }, { x: 0, z: sh.l1 }, at(90, rr), ...seat]);
}

/** Obrys zapichovacího držáku: čepel užší o 0,1 mm/stranu do tmax, levý bok v rovině s destičkou. */
function partingHolder(prms, g, sh) {
  const w = prms.toolLength, r = Math.min(prms.toolRadius, w / 2);
  const bodyTop = Math.max(w * 0.6, r + PARTING_BODY_MIN_H_MM) - r;
  const xBL = -r + 0.1, xBR = w - r - 0.1, xR = xBL + sh.b;
  const zBlade = Math.max(bodyTop + 1, Math.min(g.tmax, 0.8 * sh.b) - r);
  return closeLoop([{ x: xBL, z: bodyTop }, { x: xBR, z: bodyTop }, { x: xBR, z: zBlade },
    { x: xR, z: zBlade + (xR - xBR) }, { x: xR, z: sh.l1 }, { x: xBL, z: sh.l1 }]);
}

/**
 * Obrys závitového držáku (SER/SEL): ROVNÝ dřík šířky b, destička leží
 * v levém rohu jeho konce (trojúhelník jako threadingOutlineSegments —
 * levý roh destičky v rovině s bokem dříku), dolní polovina se zubem
 * vyčnívá přes čelo dříku. Protilehlý roh čela je sražený (jako na výkresu
 * výrobce). Uživatel 6. 10. 2026: hlava širší než dřík „vypadá šíleně".
 */
function threadingHolder(prms, sh) {
  const half = rad(prms.toolTipAngle / 2), L = prms.toolLength, f2 = prms.toolTipFlat / 2;
  const dz = Math.cos(half) * L, a = f2 + Math.sin(half) * L;
  const S = Math.max(16, 4 * a + 2), zApex = dz - a * Math.sqrt(3);
  const zEnd = zApex + 0.5 * S * Math.sqrt(3) / 2;          // čelo dříku v půlce výšky destičky
  // Sražení jen vedle destičky — u úzkého dříku (16×16) by šlo přes ni.
  const xL = -(S / 2 + 0.5), xR = xL + sh.b, c = Math.max(0, Math.min(0.3 * sh.b, xR - S / 2 - 1));
  return closeLoop([{ x: xL, z: zEnd }, { x: xR - c, z: zEnd }, { x: xR, z: zEnd + c },
    { x: xR, z: sh.l1 }, { x: xL, z: sh.l1 }]);
}

// ── Řezné podmínky (orientační start, ne doporučení výrobce) ─────

function cutData(shape, edge, eps, R) {
  if (shape === 'round') return { vc: 180, f: r3(Math.min(0.3, 0.012 * 2 * R)), ap: Math.max(0.5, Math.round(0.4 * R * 2) / 2) };
  const k = eps >= 80 ? 0.3 : eps >= 60 ? 0.25 : eps >= 55 ? 0.2 : 0.15;
  return {
    vc: 200,
    f: Math.round(Math.min(0.45, Math.max(0.08, 0.3 * R)) * 100) / 100,
    ap: Math.max(0.5, Math.min(6, Math.round(edge * k * 2) / 2)),
  };
}

// ── Stavba nože ────────────────────────────────────────────────

function knifeRecord({ name, vbdCode, holder, prms, sh, hand, cut, desc, iso }) {
  const tool = {
    toolShape: prms.toolShape,
    toolLength: r3(prms.toolLength),
    toolAngle: r3(prms.toolAngle),
    toolTipAngle: prms.toolTipAngle,
    toolRadius: prms.toolRadius,
    toolTipFlat: prms.toolTipFlat,
    toolTipMirror: false,
    toolVbdCode: vbdCode,
    toolClearanceAngle: prms.toolClearanceAngle,
    holderLength: sh.l1,
    holderWidth: sh.b,
    holderHand: hand === 'L' ? 'L' : 'R',
    holderProfile: { sideA: holder, sideB: [] },
    knifeAngle: 270,
    holderInflate: 0,
    holderInflateAll: false,
  };
  // `iso` = z čeho se nůž postavil (typ, dřík, volby) — UI z něj čte aktuální výběr.
  return {
    name, vbdCode, holderCode: name, desc, iso, material: '',
    tipRadius: prms.toolRadius, toolAngle: tool.toolAngle, tipAngle: prms.toolTipAngle,
    clearanceAngle: prms.toolClearanceAngle, vc: cut.vc, f: cut.f, ap: cut.ap, tool,
  };
}

/**
 * Postaví celý nůž (záznam knihovny s `tool` = CAM_TOOL_KEYS).
 * @param {string} typeId  id z ISO_HOLDER_TYPES
 * @param {{shank?:string, variant?:'neg'|'pos', size?:string, radius?:string,
 *          hand?:'R'|'L', width?:number, thread?:string}} [opts]
 * @returns {Object|null} null = kombinace pro dřík neexistuje
 */
export function buildIsoKnife(typeId, opts = {}) {
  const type = isoTypeById(typeId);
  if (!type) return null;
  const sh = shankOf(opts.shank);
  const hand = opts.hand === 'L' ? 'L' : 'R';
  const def = isoDefaults(type, sh.code);
  if (!def) return null;

  if (type.special === 'parting') {
    const g = isoGrooveWidths(sh.code).find((x) => x.w === Number(opts.width)) || ISO_GROOVE_INSERTS.find((x) => x.w === def.width);
    if (!g) return null;
    const prms = { toolShape: 'parting', toolLength: g.w, toolRadius: g.r, toolAngle: 0, toolTipAngle: 90, toolTipFlat: 0.1, toolClearanceAngle: 0 };
    return knifeRecord({ name: `MGEH${hand}${sh.code}-${g.w}`, vbdCode: g.code, holder: partingHolder(prms, g, sh), prms, sh, hand,
      cut: { vc: 120, f: r3(0.05 + 0.01 * g.w), ap: 2 }, desc: type.desc,
      iso: { type: type.id, shank: sh.code, hand, width: g.w } });
  }
  if (type.special === 'threading') {
    const th = ISO_THREAD_INSERTS.find((x) => x.id === opts.thread) || ISO_THREAD_INSERTS[0];
    const prms = { toolShape: 'threading', toolLength: THREAD_FLANK_MM, toolRadius: 0, toolAngle: 0, toolTipAngle: th.angle, toolTipFlat: 0.1, toolClearanceAngle: 0 };
    return knifeRecord({ name: `SE${hand}${sh.code}${sh.len}16`, vbdCode: `16E${hand}${th.id}`, holder: threadingHolder(prms, sh), prms, sh, hand,
      cut: { vc: 100, f: 1.5, ap: 0.1 }, desc: type.desc,
      iso: { type: type.id, shank: sh.code, hand, thread: th.id } });
  }

  const variant = isoVariants(type, sh.code).includes(opts.variant) ? opts.variant : def.variant;
  const sizes = isoSizes(type, variant, sh.code);
  const size = sizes.includes(opts.size) ? opts.size : (sizes.includes(def.size) ? def.size : sizes[0]);
  if (!size) return null;
  const radii = isoRadii(type, size);
  const radius = radii.includes(opts.radius) ? opts.radius : (radii.includes('08') ? '08' : radii[0]);
  const clearance = variant === 'neg' ? 0 : CLEARANCE_DEG[POS_CLEARANCE[type.shape] || 'C'];
  const vbdCode = insertCode(type, variant, size, radius);
  const name = holderCode(type, variant, sh, size, hand);
  const iso = { type: type.id, shank: sh.code, hand, variant, size, radius };

  if (type.shape === 'R') {
    const R = icOf('R', size) / 2;
    const prms = { toolShape: 'round', toolLength: 10, toolRadius: R, toolAngle: 0, toolTipAngle: 90, toolTipFlat: 0.1, toolClearanceAngle: clearance };
    return knifeRecord({ name, vbdCode, holder: roundHolder(R, sh, type.style), prms, sh, hand, cut: cutData('round', 0, 0, R), desc: type.desc, iso });
  }
  const eps = epsOf(type.shape);
  const edge = sizeInfo(type.shape, size).edge;
  const theta = type.face ? type.kr - 90 : 180 - eps - type.kr;
  const R = RADIUS_MM[radius];
  const prms = { toolShape: 'polygon', toolLength: edge, toolRadius: R, toolAngle: theta, toolTipAngle: eps,
    toolTipFlat: 0.1, toolTipMirror: false, toolVbdCode: vbdCode, toolClearanceAngle: clearance };
  return knifeRecord({ name, vbdCode, holder: polygonHolder(prms, type, sh), prms, sh, hand,
    cut: cutData('polygon', edge, eps, R), desc: type.desc, iso });
}

/** Kolik různých nožů katalog umí postavit (typ × dřík × varianta × velikost × rádius / šířka / profil). */
export function isoCatalogCount() {
  let n = 0;
  for (const t of ISO_HOLDER_TYPES) {
    for (const sh of ISO_SHANKS) {
      if (t.special === 'parting') { n += isoGrooveWidths(sh.code).length; continue; }
      if (t.special === 'threading') { n += ISO_THREAD_INSERTS.length; continue; }
      for (const v of isoVariants(t, sh.code)) {
        for (const sz of isoSizes(t, v, sh.code)) n += Math.max(1, isoRadii(t, sz).length);
      }
    }
  }
  return n;
}

// ── Náhled (SVG) ───────────────────────────────────────────────

/** Malý náhled nože z katalogu (sdílená kresba knifeThumb.js). */
export function isoKnifeSvg(rec, px = 72) {
  return knifeThumbSvg(rec.tool, px);
}
