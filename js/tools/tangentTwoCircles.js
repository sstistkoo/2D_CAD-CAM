// ╔══════════════════════════════════════════════════════════════╗
// ║  Tečna – dvě kružnice: tečné úsečky (vnější / vnitřní)      ║
// ╚══════════════════════════════════════════════════════════════╝
//
// Uživatel 18. 11. 2026: výběr (nebo klik) kružnice + kružnice nabídne
// tečné úsečky mezi nimi; přesun kružnice tečně ke druhé zůstává jako
// druhá volba. Dřív se tečné úsečky mezi dvěma kružnicemi nedaly vytvořit
// vůbec (větev v tangentClick.js byla nedosažitelná).

import { tangentsTwoCircles } from '../geometry.js';

const MIN_LEN = 1e-6;

/**
 * Tečné úsečky dvou kružnic s druhem a popiskem. Vynechá zdegenerované
 * (nulové délky – kružnice se dotýkají v jednom bodě) a duplicitní.
 * Vnitřní tečna protíná spojnici středů, vnější ne.
 * @param {{cx:number, cy:number, r:number}} c1
 * @param {{cx:number, cy:number, r:number}} c2
 * @returns {{x1:number, y1:number, x2:number, y2:number, kind:'outer'|'inner', label:string}[]}
 */
export function twoCircleTangents(c1, c2) {
  const raw = tangentsTwoCircles(c1.cx, c1.cy, c1.r, c2.cx, c2.cy, c2.r);
  const out = [];
  for (const t of raw) {
    if (Math.hypot(t.x2 - t.x1, t.y2 - t.y1) < MIN_LEN) continue;
    if (out.some(o => Math.hypot(o.x1 - t.x1, o.y1 - t.y1) < MIN_LEN && Math.hypot(o.x2 - t.x2, o.y2 - t.y2) < MIN_LEN)) continue;
    out.push({ x1: t.x1, y1: t.y1, x2: t.x2, y2: t.y2, kind: crossesCenterLine(t, c1, c2) ? 'inner' : 'outer' });
  }
  // Vnější napřed, pak číslování v rámci druhu
  out.sort((a, b) => (a.kind === b.kind ? 0 : a.kind === 'outer' ? -1 : 1));
  const count = { outer: 0, inner: 0 };
  return out.map(t => ({ ...t, label: `${t.kind === 'outer' ? 'Vnější' : 'Vnitřní'} tečna ${++count[t.kind]}` }));
}

/** Leží konce tečny na opačných stranách spojnice středů? */
function crossesCenterLine(t, c1, c2) {
  const dx = c2.cx - c1.cx, dy = c2.cy - c1.cy;
  const side = (x, y) => dx * (y - c1.cy) - dy * (x - c1.cx);
  return side(t.x1, t.y1) * side(t.x2, t.y2) < 0;
}
