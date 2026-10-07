// ╔══════════════════════════════════════════════════════════════╗
// ║  SKICA – závitové laydown destičky (11/16/22/27 ER) pro katalog ║
// ╚══════════════════════════════════════════════════════════════╝
//
// Závitové destičky do držáku SER/SEL (vnější, ER) a do kulaté tyče SNR/SNL
// (vnitřní, IR — stejná řada, zrcadlová destička) v 📚 ISO katalogu. Značení je
// de facto standard výrobců (ISO ho nepokrývá): velikost = délka hrany
// trojúhelníku v mm (11ER IC 6,35 · 16ER 9,525 · 22ER 12,7 · 27ER 15,875),
// pak profil:
//   ČÁSTEČNÝ profil (A / AG / N / Q + úhel) — jedna destička na ROZSAH
//     stoupání, vrchol závitu nedělá.
//   PLNÝ profil Tr 30° (ISO 2904) a Acme 29° — destička na JEDNO stoupání,
//     šířka špičky = šířka dna závitu.
// Rozsahy jsou běžné řady výrobců (Vargus, Iscar, Carmex) — ORIENTAČNÍ,
// jako ostatní rozměry katalogu.
//
// Zub destičky pro CAM (toolLength = délka boku, toolTipFlat = šířka
// špičky) musí dosáhnout do hloubky závitu: hloubka zubu = cos(ε/2)·toolLength.

import { trClearanceAc } from './threadData.js';

/** Délka boku zubu [mm] u částečného profilu podle velikosti destičky (hloubka do největšího P řady). */
const PARTIAL_FLANK_MM = { 11: 1.3, 16: 2.5, 22: 4.0, 27: 4.8 };
/** Velikosti destičky, které se vejdou do dříku (hrana ≤ šířka dříku — širší hlava „vypadá šíleně"). */
const THREAD_FIT = { 1616: [11, 16], 2020: [11, 16], 2525: [16, 22], 3232: [16, 22, 27] };
const ACME_CLEARANCE_MM = 0.25;   // vůle ve dně jako v threadProfileDepth (cam/threadHelpers.js)
const TPI = (n) => 25.4 / n;
const r2 = (v) => Math.round(v * 100) / 100;
const cz = (v) => String(v).replace('.', ',');

function partial(id, size, angle, pMin, pMax, use) {
  return { id, size, angle, code: id, kind: 'partial', pMin, pMax, label: `${size}ER ${id} · ${angle}° ${use}` };
}
function trapezoid(P, size) {
  const code = `${P.toFixed(1)}TR`;
  return { id: 'TR' + P, size, angle: 30, code, kind: 'tr', P, pMin: P, pMax: P,
    label: `${size}ER ${code.replace('TR', ' TR')} · Tr 30°, jen P ${cz(P)}` };
}
function acme(tpi, size) {
  const P = TPI(tpi);
  return { id: 'ACME' + tpi, size, angle: 29, code: `${tpi}ACME`, kind: 'acme', P, pMin: P, pMax: P,
    label: `${size}ER ${tpi} ACME · Acme 29°, jen ${tpi} z/″` };
}

/** Všechny destičky — pořadí = pořadí ve výběru (60°, 55°, Tr, Acme; uvnitř podle velikosti). */
export const ISO_THREAD_INSERTS = [
  partial('A60', 11, 60, 0.5, TPI(16), '(M, UN), P 0,5–1,5'),
  partial('AG60', 16, 60, 0.5, TPI(8), '(M, UN), P 0,5–3'),
  partial('N60', 22, 60, 3.5, TPI(5), '(M, UN), P 3,5–5'),
  partial('Q60', 27, 60, 5.5, TPI(4), '(M, UN), P 5,5–6'),
  partial('A55', 11, 55, 0.5, TPI(16), '(G, BSW), 48–16 z/″'),
  partial('AG55', 16, 55, 0.5, TPI(8), '(G, BSW), 48–8 z/″'),
  partial('N55', 22, 55, TPI(7), TPI(5), '(BSW), 7–5 z/″'),
  partial('Q55', 27, 55, TPI(4.5), TPI(4), '(BSW), 4,5–4 z/″'),
  ...[1.5, 2, 3].map((P) => trapezoid(P, 16)),
  ...[4, 5].map((P) => trapezoid(P, 22)),
  trapezoid(6, 27),
  ...[16, 14, 12, 10, 8].map((n) => acme(n, 16)),
  ...[6, 5].map((n) => acme(n, 22)),
  acme(4, 27),
];

export function isoThreadInsertById(id) {
  return ISO_THREAD_INSERTS.find((x) => x.id === id) || null;
}

/** Destičky, které se vejdou do dříku. */
export function isoThreadInsertsFor(shankCode) {
  const fit = THREAD_FIT[shankCode] || THREAD_FIT[2525];
  return ISO_THREAD_INSERTS.filter((x) => fit.includes(x.size));
}

/** Dříky, do kterých destička jde (kódy ISO_SHANKS). */
export function isoThreadShanksFor(insert) {
  return Object.keys(THREAD_FIT).filter((k) => THREAD_FIT[k].includes(insert.size));
}

/** Popisek do výběru — u vnitřní destičky „16IR …" místo „16ER …". */
export function isoThreadInsertLabel(insert, internal) {
  return internal ? insert.label.replace(/^(\d+)ER/, '$1IR') : insert.label;
}

/**
 * Zub destičky pro CAM: šířka špičky a délka boku.
 * Plný profil: špička = dno vnějšího závitu (Tr: 0,366·P − 0,536·ac,
 * Acme: 0,3707·P − 0,5172·vůle), bok do hloubky závitu + 0,2 mm.
 */
export function isoThreadTooth(insert) {
  const half = (insert.angle / 2) * Math.PI / 180;
  if (insert.kind === 'partial') return { flat: 0.1, flank: PARTIAL_FLANK_MM[insert.size] };
  const P = insert.P;
  const c = insert.kind === 'tr' ? trClearanceAc(P) : ACME_CLEARANCE_MM;
  const flat = insert.kind === 'tr' ? 0.36603 * P - 0.5359 * c : 0.37069 * P - 0.51724 * c;
  return { flat: r2(flat), flank: r2((0.5 * P + c + 0.2) / Math.cos(half)) };
}

/** Destička podle kódu VBD („16ERAG60", „22EL4.0TR", „16IR 8 ACME"); jinak null. */
export function isoThreadInsertByCode(vbdCode) {
  const m = /^(\d{2})[EI][RL](.+)$/.exec(String(vbdCode || '').toUpperCase().replace(/\s/g, ''));
  if (!m) return null;
  return ISO_THREAD_INSERTS.find((x) => x.size === Number(m[1]) && x.code.toUpperCase() === m[2]) || null;
}

/**
 * Sedí destička na stranu závitu? ER = vnější, IR = vnitřní. Nůž, který
 * katalog nezná (vlastní ▽), bere jako dřív vždy.
 */
export function threadInsertFitsSide(vbdCode, external) {
  if (!isoThreadInsertByCode(vbdCode)) return true;
  const internal = /^\d{2}I/.test(String(vbdCode).toUpperCase().replace(/\s/g, ''));
  return internal !== (external !== false);
}

/** Sedí destička na stoupání P? Nůž, který katalog nezná (vlastní ▽), bere jako dřív vždy. */
export function threadInsertFitsPitch(vbdCode, P) {
  const ins = isoThreadInsertByCode(vbdCode);
  if (!ins || !(P > 0)) return true;
  return P >= ins.pMin - 0.01 && P <= ins.pMax + 0.01;
}

/** Destičky pro úhel profilu a stoupání (pořadí katalogu). */
export function isoThreadInsertsForPitch(angle, P) {
  return ISO_THREAD_INSERTS.filter((x) => Math.abs(x.angle - angle) < 0.5 && P >= x.pMin - 0.01 && P <= x.pMax + 0.01);
}

/**
 * Vnější destička z katalogu pro úhel profilu a stoupání → text rady
 * („16ER 2.0TR", když nejde do každého dříku, i dřík), nebo null, když ji
 * katalog nemá. Z více vhodných ta, která jde do nejvíc dříků (AG60 před
 * A60). Vnitřní: isoInternalThreadHint (isoInternalTools.js — zná díru).
 */
export function isoThreadInsertHint(angle, P) {
  const ins = isoThreadInsertsForPitch(angle, P)
    .sort((a, b) => isoThreadShanksFor(b).length - isoThreadShanksFor(a).length)[0];
  if (!ins) return null;
  const shanks = isoThreadShanksFor(ins);
  const shank = shanks.length < Object.keys(THREAD_FIT).length ? ` (dřík ${shanks.map((k) => k.slice(0, 2) + '×' + k.slice(2)).join(', ')})` : '';
  return `${ins.size}ER ${ins.code}${shank}`;
}
