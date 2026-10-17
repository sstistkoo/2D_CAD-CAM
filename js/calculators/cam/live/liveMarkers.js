// Značky bloku POHÁNĚNÝCH NÁSTROJŮ v NC programu.
//
// Blok vrtání/frézování poháněným nástrojem (osa C / SPOS / TRANSMIT) se do
// programu vkládá mezi dvě komentářové značky. Simulátor soustružení
// (gcodeParser.js) obsah mezi nimi PŘESKAKUJE: vrtání na roztečné kružnici
// není rotační řez — kdyby se X/Z pohyby vrtáku braly jako soustružení,
// úběr materiálu by z díry udělal zápich po celém obvodu. Blok kreslí
// pohled na čelo (liveFaceView.js) a řez (liveSection.js) z definice operací.
//
// Značky jsou ASCII (Fanuc komentáře diakritiku neumí) a v obou stylech
// komentáře (`; …` i `( … )`) — přepnutí řídicího systému styl převádí.
// Modul nemá importy, smí ho číst i parser bez rizika cyklu.

export const LIVE_BEGIN = '>>> POHANENE NASTROJE';
export const LIVE_END = '<<< POHANENE NASTROJE';
const MARK_RE = /(>>>|<<<)\s*POHANENE NASTROJE/;

/** 'begin' | 'end' | null — je řádek značkou bloku? */
export function liveMarkerKind(line) {
  const m = String(line).toUpperCase().match(MARK_RE);
  if (!m) return null;
  return m[1] === '>>>' ? 'begin' : 'end';
}

/** Rozsah bloku v řádcích { start, end } (včetně značek) nebo null. */
export function findLiveBlock(lines) {
  let start = -1;
  for (let i = 0; i < lines.length; i++) {
    const k = liveMarkerKind(lines[i]);
    if (k === 'begin' && start < 0) start = i;
    else if (k === 'end' && start >= 0) return { start, end: i };
  }
  return null;
}

/** Hlavička bloku nese systém a režim: `[sinumerik/spos]`. */
export function liveBlockTag(lines) {
  const b = findLiveBlock(lines);
  if (!b) return null;
  const m = String(lines[b.start]).match(/\[(\w+)\/(\w+)\]/);
  return m ? { ctrl: m[1], mode: m[2] } : null;
}

/**
 * Vloží (nebo nahradí) blok do programu: existující blok se přepíše na místě,
 * jinak se vloží PŘED závěr programu (první řádek M30 / M2 / M9 před koncem).
 */
export function insertLiveBlock(code, blockLines) {
  const lines = String(code || '').replace(/\r\n/g, '\n').split('\n');
  const b = findLiveBlock(lines);
  if (b) {
    lines.splice(b.start, b.end - b.start + 1, ...blockLines);
    return lines.join('\n');
  }
  let at = -1;
  for (let i = lines.length - 1; i >= 0; i--) {
    // `M2` = konec programu, ale `M2=3` / `M2=5` je vřeteno 2 (Sinumerik).
    if (/\bM0?(30|2)\b(?!\s*=)/i.test(lines[i].replace(/[;(].*$/, ''))) { at = i; break; }
  }
  if (at < 0) at = lines.length;
  // Fanuc/Heidenhain mají před M30 ještě M9/M5/G28 — blok patří před ně.
  while (at > 0 && /^\s*(N\d+\s+)?(M0?9|M0?5|G28 U0 W0)\b/i.test(lines[at - 1])) at--;
  lines.splice(at, 0, ...blockLines);
  return lines.join('\n');
}

/** Odebere blok z programu (pokud tam je). */
export function removeLiveBlock(code) {
  const lines = String(code || '').replace(/\r\n/g, '\n').split('\n');
  const b = findLiveBlock(lines);
  if (!b) return code;
  lines.splice(b.start, b.end - b.start + 1);
  return lines.join('\n');
}
