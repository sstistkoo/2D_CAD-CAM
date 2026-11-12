// ╔══════════════════════════════════════════════════════════════╗
// ║  CAM – „✂ Po úsecích" s Cik cak: dokončení až na konci,        ║
// ║  všechny úseky naráz                                           ║
// ╚══════════════════════════════════════════════════════════════╝
//
// Uživatel 2. 11. 2026: „napřed se to vyhrubuje s přídavkem na hotovo …
// a pak se naráz vezme všechno na hotovo, všechny úseky naráz, když to bude
// ve volbě, že se má jet i na hotovo". Úseky se proto vygenerují bez
// dokončování a za ně přibude jedna část „Na hotovo" (jen dokončení,
// `finishOnly`) přes celý rozsah uživatele, na polotovaru po posledním úseku.
// Jen strategie Cik cak a podélné s „Nepřejíždět mezi hrby" — ostatní „Po
// úsecích" dokončují v každém úseku zvlášť jako dosud. Volá camSimulator.js (sectionPathsNow).

import { humpFirstOn } from './humpFirstOption.js';

/** Před úseky: u Cik cak s dokončováním ho v úsecích vypne. */
export function sectionFinishBegin(S) {
  // + „Nepřejíždět mezi hrby" (ops/sections/humpFirst.js): kroky se dělí i podle
  // X (do dna údolí / pod ním) — dokončení po krocích by kontura rozsekala.
  const on = (S.params.roughingStrategy === 'zigzag' || humpFirstOn(S.params)) && !!S.params.doFinishing && !S.params.finishOnly;
  if (on) S.params.doFinishing = false;
  return { on };
}

/**
 * Za úseky: přidá část „Na hotovo" (celý rozsah, polotovar po posledním
 * úseku). Úsekům vrátí volbu dokončování (jejich G-kód je bez něj) — ↺ Reset
 * i další „Po úsecích" tak volbu uživatele neztratí.
 * @returns {object[]} části programu
 */
export function sectionFinishEnd(S, fin, { parts, baseLimits, regen, makePart }) {
  if (!fin || !fin.on || parts.length === 0) return parts;
  for (const p of parts) p.params.doFinishing = true;
  S.zLimits = JSON.parse(JSON.stringify(baseLimits.z));
  S.xLimits = JSON.parse(JSON.stringify(baseLimits.x));
  S.params.doFinishing = true;
  S.params.finishOnly = true;
  regen();
  const part = makePart(S, { name: 'Na hotovo', gcode: S.manualGCode });
  part.params.finishOnly = true;
  part.finishAtEnd = true;
  S.params.finishOnly = false;
  return [...parts, part];
}

/**
 * `finishOnly` pro návrat k jednooperačnímu režimu (↺ Reset, nové „✂ Po
 * úsecích", 🔄 Dráhy). Parametry se berou z aktivní části — je-li to
 * automatická „Na hotovo", její `finishOnly` patří jen jí: převzaté by
 * vypnulo hrubování (uživatel 2. 11. 2026: po resetu hláška „jen dokončovací
 * operace" v záložce Hrub. a úseky pak vyšly jako samé dokončení). Platí pak
 * volba první části. Starší soubory značku nemají — poznají se podle názvu.
 */
export function baseFinishOnly(parts, activeIdx, current) {
  const p = parts && parts[activeIdx];
  const auto = p && (p.finishAtEnd || (p.name === 'Na hotovo' && p.params && p.params.finishOnly));
  if (!auto) return current;
  const first = parts[0];
  return !!(first && first !== p && first.params && first.params.finishOnly);
}
