// ╔════════════════════════════════════════╗
// ║  VOLÁNÍ NÁSTROJE podle řídicího systému               ║
// ╚════════════════════════════════════════╝
// Sinumerik volá nástroj JMÉNEM (`T="HRUBOVAK" D1 M6`), Fanuc a Heidenhain
// ČÍSLEM. Číslo = slot zásobníku (S.toolMagazine[].slot). Do 10. 11. 2026
// měl Fanuc natvrdo `T0101` a Heidenhain `T1 M6`, takže program s více noži
// (části / předvrtání / dokončovací nůž) nikdy nástroj nevyměnil.
//
// Bez importů — čerpá z něj controlDialect.js, který je také bez importů.

/** Číslo T, které Fanuc/Heidenhain dostanou, když nástroj nemá slot. */
export const DEFAULT_TOOL_NUMBER = 1;

const validNum = (v) => {
  const n = parseInt(v, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
};

/**
 * Číslo nástroje pro hlavičku: aktivní slot zásobníku, jinak slot se stejným
 * jménem jako `params.toolName`, jinak 1.
 * @param {{toolMagazine?:Array<{slot:number,name:string}>, activeMagazineSlot?:number|null, params?:object}} S
 */
export function activeToolNumber(S) {
  const mag = Array.isArray(S && S.toolMagazine) ? S.toolMagazine : [];
  const idx = S ? S.activeMagazineSlot : null;
  if (typeof idx === 'number' && mag[idx]) {
    const n = validNum(mag[idx].slot);
    if (n) return n;
  }
  return toolNumberForName(S && S.params && S.params.toolName, mag) || DEFAULT_TOOL_NUMBER;
}

/** Slot zásobníku podle jména nástroje (null = nenalezen). Bere i jméno „T5". */
export function toolNumberForName(name, magazine) {
  const nm = String(name || '').trim();
  if (!nm) return null;
  const hit = (Array.isArray(magazine) ? magazine : []).find(s => s && String(s.name || '').trim() === nm);
  if (hit && validNum(hit.slot)) return validNum(hit.slot);
  const m = nm.match(/^T(\d+)$/i);
  return m ? validNum(m[1]) : null;
}

/** Jméno nástroje podle čísla slotu (null = nenalezen). */
export function toolNameForNumber(num, magazine) {
  const hit = (Array.isArray(magazine) ? magazine : []).find(s => s && validNum(s.slot) === num);
  return hit && hit.name ? String(hit.name) : null;
}

/**
 * Slovo volání nástroje (bez N a komentáře).
 * Sinumerik `T="jméno" D1 M6` · Fanuc `T0505` (nástroj + korekce) · Heidenhain `T5 M6`.
 * @param {string} ctrl
 * @param {{name?:string, num?:number}} tool
 */
export function toolCallWord(ctrl, tool) {
  const num = validNum(tool && tool.num) || DEFAULT_TOOL_NUMBER;
  if (ctrl === 'fanuc') {
    const t = String(Math.min(num, 99)).padStart(2, '0');
    return `T${t}${t}`;
  }
  if (ctrl === 'heidenhain') return `T${num} M6`;
  const name = (tool && tool.name) || `T${num}`;
  return `T="${name}" D1 M6`;
}

/**
 * Rozpozná volání nástroje v řádku (libovolný dialekt).
 * @returns {{name?:string, num?:number, match:string}|null}
 */
export function parseToolCall(line) {
  const code = String(line || '').replace(/^\s*N\d+\s*/i, '');
  let m = code.match(/\bT="([^"]*)"(?:\s+D\d+)?(?:\s+M0?6\b)?/i);
  if (m) return { name: m[1], match: m[0] };
  const clean = code.replace(/[;(].*$/, '');
  m = clean.match(/\bT(\d{4})\b/);                       // Fanuc TTOO
  if (m) return { num: parseInt(m[1].slice(0, 2), 10), match: m[0] };
  m = clean.match(/\bT(\d{1,3})(?:\s+M0?6\b)?/i);
  if (m) return { num: parseInt(m[1], 10), match: m[0] };
  return null;
}

/**
 * Převede volání nástroje v řádku na jiný dialekt (jméno ↔ číslo přes zásobník).
 * Řádek bez volání nástroje vrací beze změny.
 */
export function convertToolCallLine(line, newCtrl, magazine) {
  const tc = parseToolCall(line);
  if (!tc) return line;
  const num = tc.num || toolNumberForName(tc.name, magazine) || DEFAULT_TOOL_NUMBER;
  const name = tc.name || toolNameForNumber(num, magazine) || `T${num}`;
  return line.replace(tc.match, toolCallWord(newCtrl, { num, name }));
}
