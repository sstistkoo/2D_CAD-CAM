// ╔══════════════════════════════════════════════════════════════╗
// ║  CAM – ladění posuvu nad hotovými řádky G-kódu                 ║
// ╚══════════════════════════════════════════════════════════════╝
//
// Uživatel 6. 11. 2026: dráhy jedou středem rádiusu destičky (bez G41/G42),
// posuv se ale má řídit tím, co se reálně řeže:
//   • Posuv při zanoření (%)  — každý řezný pohyb DO HLOUBKY průchodu
//     (rampa, svislý vjezd, sjezd po kontuře do kapsy) ve všech hrubovacích
//     strategiích (podélně, čelně, cik cak).
//   • Konstantní posuv na oblouku — F oblouku hrubování × r dráhy / R řezu
//     (arcFeedComp.js; dokončování si to dělá samo ve finishEmit.js).
//
// Proč až nad řádky: rampy a vjezdy se v hrubování vypisují na desítkách
// míst a často BEZ F (modálně). Úprava na každém z nich by se snadno
// rozešla. Emise proto ke každému řeznému řádku jen připíše, ODKUD a KAM
// jel (vnitřní souřadnice, `from`/`to`), v jakém průchodu (`tag`: osa
// hloubky a znaménko „hlouběji") a případně poměr oblouku (`arcK`). Tady se
// pak F přepočte a hlídá se modální stav: za změněným blokem dostane další
// řezný blok zpátky původní F. Dráha se nemění.

import { formatFeed } from './arcFeedComp.js';
import { getInsert } from './inserts/index.js';

const MOTION = /^(\s*N\d+\s+)?(G0?[123])\b/i;
const F_WORD = /\bF(\d*\.?\d+)/i;

/**
 * Sledování řádků pro ladění posuvu (gcodeEmit.js). `mark` volá zápis řádku,
 * `moved` setPos; `cur`/`tag`/`arcK` nastavuje emise hrubování (roughEmit.js).
 */
export function createFeedTrack() {
  const t = {
    cur: null, tag: null, arcK: null, last: null,
    mark(l) {
      if (t.tag && t.cur) {
        l.from = { x: t.cur.x, z: t.cur.z }; l.tag = t.tag;
        if (t.arcK) l.arcK = t.arcK;
      }
      t.arcK = null; t.last = l;
      return l;
    },
    moved(x, z) { const l = t.last; if (l && l.from && !l.to) l.to = { x, z }; },
  };
  return t;
}

// ── KONSTANTNÍ TLOUŠŤKA TŘÍSKY (uživatel 6. 11. 2026, jen hrubování) ─────
// Rádiusem destičky R ostří vstupuje do řezu pod úhlem κ: cos κ = 1 − ap/R
// (ap ≥ R → κ = 90°, sin κ = 1). Tříska je tenčí než posuv: h = f · sin κ.
// Nastavené F platí pro plnou vrstvu (ap z parametrů); vrstva s jiným ap
// dostane F · sin κ(ap nastavené) / sin κ(ap vrstvy) — tenká poslední vrstva
// pojede rychleji, tlustší (první vrstva na odlitku) pomaleji. Mez dole
// CHIP_MIN × F, nahoře „Max. F" (výchozí 2 × F). Dokončení se nemění.
export const CHIP_MIN = 0.5;

/** sin κ pro hloubku řezu ap a rádius R. */
export function sinKappa(ap, R) {
  if (!(R > 0) || ap >= R) return 1;
  const c = 1 - Math.max(ap, 1e-3) / R;
  return Math.sqrt(1 - c * c);
}

/** Platí tloušťka třísky pro tyto parametry? (přepínač + klíč plátku). Volat jednou na průchod. */
export function chipThinActive(prms) {
  return !!prms?.chipThinOn && !!getInsert(prms).chipThinning;   // klíč plátku (kulatá, polygon)
}

/** Faktor posuvu pro vrstvu s hloubkou ap; null = vypnuto / beze změny. */
export function chipFeedFactor(prms, ap) {
  return chipThinActive(prms) ? chipRatio(prms, ap) : null;
}

/** Jen výpočet poměru (bez dotazu na plátek — pro smyčky po pohybech). */
export function chipRatio(prms, ap) {
  if (!(ap > 0)) return null;
  const R = parseFloat(prms.toolRadius) || 0, apRef = Math.abs(parseFloat(prms.depthOfCut) || 0);
  if (!(R > 0) || !(apRef > 0)) return null;
  const F = parseFloat(prms.feed) || 0;
  const maxF = parseFloat(prms.chipMaxF) > 0 ? parseFloat(prms.chipMaxF) : 2 * F;
  const kMax = F > 0 ? Math.max(1, maxF / F) : 1;
  const k = Math.min(kMax, Math.max(CHIP_MIN, sinKappa(apRef, R) / sinKappa(ap, R)));
  return Math.abs(k - 1) < 0.03 ? null : k;   // ±3 % = šum odhadu ap (přídavek), F beze změny
}

/**
 * Skutečné ap průchodu hrubování (vnitřní rámec: hloubka podélně = −X,
 * čelně = Z). Podélně z modelu zbytku (`topAt(z)` = povrch materiálu nad
 * průchodem), čelně výška sloupce materiálu nad dnem řezu. Neznámé → null.
 */
export function passDepth(pass, { topAt, tipR = 0, step = 0, margin = 0, marginZ = 0 }) {
  if (pass.type === 'face') {
    // Čelně: výška sloupce materiálu nad dnem řezu v ose Z (k obrobené
    // straně), měřená z modelu zbytku v několika X průchodu. NE z rozestupu
    // vrstev — dva průchody v různých úsecích (jiná výška polotovaru) by
    // daly falešně tenké ap a F by vyletělo nahoru.
    if (typeof topAt !== 'function' || !Number.isFinite(pass.z)) return null;
    const x0 = Number.isFinite(pass.xEnd) ? pass.xEnd : null;
    const x1 = Number.isFinite(pass.xSurface) ? pass.xSurface : (Number.isFinite(pass.xStart) ? pass.xStart : null);
    if (x0 === null || x1 === null) return null;
    const deeper = pass.faceLeft ? 1 : -1, zb = pass.z + deeper * tipR;
    const maxD = Math.max(3 * (step || 0), 30), STEP = 0.1;
    let ap = null;
    for (let k = 0; k <= 20; k++) {
      const x = x0 + (x1 - x0) * (k / 20);
      let d = 0;
      for (let dz = STEP / 2; dz <= maxD; dz += STEP) {
        const top = topAt(zb - deeper * dz);
        if (top === null || !(top >= x + 0.01)) break;
        d = dz + STEP / 2;                    // horní mez kroku — ap nikdy nevyjde tenčí
      }
      if (d > 0.01) ap = Math.max(ap ?? 0, d);
    }
    return ap === null ? null : ap + marginZ;
  }
  if (pass.type !== 'long' || typeof topAt !== 'function' || !Number.isFinite(pass.x)) return null;
  const z0 = pass.zStart, z1 = pass.zEnd;
  if (!Number.isFinite(z0) || !Number.isFinite(z1)) return null;
  const n = Math.max(2, Math.min(400, Math.ceil(Math.abs(z1 - z0) / 0.5)));
  let ap = null;
  for (let k = 0; k <= n; k++) {
    const top = topAt(z0 + (z1 - z0) * (k / n));
    if (top === null || !Number.isFinite(top)) continue;
    const d = top - (pass.x - tipR);
    if (d > 0.01) ap = Math.max(ap ?? 0, d);
  }
  return ap === null ? null : ap + margin;
}

/**
 * Skutečné ap jednoho pohybu (x1,z1 → x2,z2 = dráha středu rε) z modelu zbytku
 * v okamžiku emise. Model zbytku registruje řez po kontuře jako po hotovní
 * čáře (viz finishEmit.js) — přičte se proto přídavek, ať odhad nikdy
 * nevyjde tenčí než skutečnost (jinak by tenká vrstva zrychlila víc, než smí).
 */
export function moveDepth(x1, z1, x2, z2, { topAt, tipR = 0, margin = 0 }) {
  if (typeof topAt !== 'function') return null;
  const n = Math.max(2, Math.min(400, Math.ceil(Math.hypot(x2 - x1, z2 - z1) / 0.5)));
  let ap = null;
  for (let k = 0; k <= n; k++) {
    const t = k / n, x = x1 + (x2 - x1) * t, top = topAt(z1 + (z2 - z1) * t);
    if (top === null || !Number.isFinite(top)) continue;
    const d = top - (x - tipR);
    if (d > 0.01) ap = Math.max(ap ?? 0, d);
  }
  return ap === null ? null : ap + margin;
}

/** Přídavek, o který model zbytku může ap podhodnotit (radiálně). */
export function chipMargin(prms, axis = 'x') {
  const a = parseFloat(axis === 'z' ? prms?.allowanceZ : prms?.allowanceX) || 0;
  return Math.max(0, a) + Math.max(0, parseFloat(prms?.finishAllowance) || 0);
}

/** Faktor posuvu při zanoření z parametrů (1 = vypnuto). */
export function plungeFeedFactor(prms) {
  if (!prms?.feedPlungeOn) return 1;
  const p = parseFloat(prms.feedPctPlunge);
  return Number.isFinite(p) && p > 0 ? Math.min(p, 100) / 100 : 1;
}

/** Jede pohyb do hloubky průchodu? (tag = { axis:'x'|'z', sign:±1 }) */
export function isPlungeMove(meta, eps = 0.01) {
  if (!meta || !meta.tag || !meta.from || !meta.to) return false;
  const a = meta.tag.axis;
  return (meta.to[a] - meta.from[a]) * meta.tag.sign > eps;
}

/**
 * Sedí `to` se slovy X/Z v textu řádku? Pojistka, kdyby emise volala
 * setPos jinak než „addN → setPos" — metadata pak nesmí patřit jinému bloku.
 * Chybějící slovo = modální osa (nesmí se hnout).
 */
export function metaMatchesText(l, dia) {
  if (!l.from || !l.to) return false;
  const code = (l.text || '').replace(/[;(].*$/, '');
  const x = code.match(/\bX(-?\d*\.?\d+)/i), z = code.match(/\bZ(-?\d*\.?\d+)/i);
  const tx = l.to.x * (dia ? 2 : 1);
  const okX = x ? Math.abs(parseFloat(x[1]) - tx) < 0.002 : Math.abs(l.to.x - l.from.x) < 1e-6;
  const okZ = z ? Math.abs(parseFloat(z[1]) - l.to.z) < 0.002 : Math.abs(l.to.z - l.from.z) < 1e-6;
  return okX && okZ;
}

/** Vloží/nahradí F v řádku (před komentář). */
function withFeed(text, f) {
  const cut = text.search(/[;(]/);
  const code = cut >= 0 ? text.slice(0, cut) : text, rest = cut >= 0 ? text.slice(cut) : '';
  const out = F_WORD.test(code) ? code.replace(F_WORD, `F${f}`) : `${code.replace(/\s+$/, '')} F${f}${rest ? ' ' : ''}`;
  return out + rest;
}

/**
 * Přepočte F na řádcích s metadaty; mění `lines` na místě.
 * @param {Array<{text:string, from?:object, to?:object, tag?:object, arcK?:number}>} lines
 */
export function tuneFeeds(lines, prms) {
  const kPlunge = plungeFeedFactor(prms);
  const arcs = !!prms?.arcFeedComp, chip = !!prms?.chipThinOn;
  if (kPlunge === 1 && !arcs && !chip) return lines;
  const dia = prms.mode === 'DIAMON';
  let modal = null;     // F podle původního textu (co by platilo bez ladění)
  let written = null;   // F, které platí na stroji po upravených řádcích
  for (const l of lines) {
    const t = l.text || '';
    const m = t.match(MOTION);
    if (!m) continue;
    const code = t.replace(/[;(].*$/, '');
    const fm = code.match(F_WORD);
    if (fm) modal = parseFloat(fm[1]);
    if (/^G0?0$/i.test(m[2]) || modal == null) { if (fm) written = modal; continue; }
    // Tloušťka třísky: celý průchod (tag se přiřazuje při zápisu řádku, nezávisí na from/to).
    let k = chip && l.tag && l.tag.chipK ? l.tag.chipK : 1;
    if (l.from && metaMatchesText(l, dia)) {
      if (kPlunge !== 1 && isPlungeMove(l, 0.01)) k *= kPlunge;
      if (arcs && l.arcK) k *= l.arcK;
    }
    const f = parseFloat(formatFeed(modal * k));
    if (f !== written || (fm && f !== modal)) l.text = withFeed(t, formatFeed(f));
    written = f;
  }
  return lines;
}
