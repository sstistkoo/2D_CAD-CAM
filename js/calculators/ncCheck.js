// ╔══════════════════════════════════════════════════════════════╗
// ║  KONTROLA NC PROGRAMU PŘED EXPORTEM (text, ne geometrie)      ║
// ╚══════════════════════════════════════════════════════════════╝
// Kolize nástroje s materiálem hlídá simulátor (cam/sim/collisionWarnings.js,
// cam/startCheck.js). Tady se kontroluje HOTOVÝ TEXT programu — to, co pošle
// stroj do alarmu nebo co je na stroji nebezpečné, i když je dráha v pořádku:
// řez bez vřetena, bez posuvu, G96 bez omezení otáček, pohyb bez nástroje,
// oblouk bez poloměru, chybějící M30. Smysl má hlavně u RUČNĚ UPRAVENÉHO
// programu; vygenerovaný program má být čistý (test nc-check).
//
// Kontrola je konzervativní: co nezná (cykly CYCLE95, G71 Fanuc, podprogramy),
// to nehlásí. Falešný poplach by naučil okno odklikávat.

import { parseToolCall } from './cam/toolCall.js';

/** Největší souřadnice, která na skutečném stroji existuje (jako programSanity.js). */
const MAX_COORD_MM = 10000;

/** Kód bez komentářů, čísla bloku a textových řetězců (T="G1_NUZ" nesmí být G1). */
function codeOf(line, ctrl) {
  let s = String(line || '');
  if (ctrl === 'fanuc') s = s.replace(/\([^)]*\)?/g, ' ');
  s = s.replace(/;.*$/, '');
  s = s.replace(/"[^"]*"?/g, '""');
  s = s.replace(/^\s*N\d+/i, '');
  return s.toUpperCase().trim();
}

/** Čísla adresy (G, M, …) v bloku; písmeno před adresou nesmí být (LIMS ≠ S, DIAMOF ≠ M). */
function words(code, letter) {
  const re = new RegExp(`(?<![A-Z_])${letter}\\s*=?\\s*(-?\\d*\\.?\\d+)`, 'g');
  return [...code.matchAll(re)].map(m => parseFloat(m[1]));
}

const has = (code, re) => re.test(code);

/**
 * Zkontroluje NC program.
 * @param {string} code  celý program
 * @param {'sinumerik'|'fanuc'|'heidenhain'} ctrl řídicí systém
 * @returns {{level:'error'|'warn', line:number, block:string, msg:string}[]}
 *   line = číslo řádku od 1 (0 = celý program)
 */
export function checkNcProgram(code, ctrl = 'sinumerik') {
  const lines = String(code || '').split(/\r?\n/);
  const out = [];
  const once = new Set();
  const add = (level, idx, msg, key = msg) => {
    if (once.has(key)) return;
    once.add(key);
    out.push({ level, line: idx + 1, block: idx >= 0 ? lines[idx].trim() : '', msg });
  };

  let motion = null;        // modální G0/G1/G2/G3/G33
  let spindleOn = false;
  let speedSet = false;     // S > 0 někde dřív
  let feed = 0;             // modální F
  let tool = false;
  let limit = false;        // LIMS / G50 S / G92 S
  let comp = -1;            // řádek posledního G41/G42 bez G40
  let endIdx = -1;

  lines.forEach((raw, idx) => {
    const c = codeOf(raw, ctrl);
    if (!c) return;

    if (endIdx >= 0) {
      add('warn', idx, 'Kód za koncem programu (M30) — řízení ho neprovede.', 'after-end');
      return;
    }

    // Souřadnice mimo rozsah stroje (typicky tan 90° nebo překlep).
    for (const m of c.matchAll(/(?:CR\s*=|(?<![A-Z_])[XZUWIK])\s*=?\s*(-?\d*\.?\d+)/g)) {
      if (Math.abs(parseFloat(m[1])) > MAX_COORD_MM) {
        add('error', idx, `Nesmyslná souřadnice (mimo ±${MAX_COORD_MM} mm).`, `coord-${idx}`);
        break;
      }
    }

    if (parseToolCall(raw)) tool = true;

    const g = words(c, 'G');
    const m = words(c, 'M');
    // Sinumerik M1=3 (vřeteno 1 vpravo) — hodnota za rovnítkem.
    for (const mm of c.matchAll(/(?<![A-Z_])M\d+\s*=\s*(\d+)/g)) m.push(parseInt(mm[1], 10));

    const s = words(c, 'S');
    if (s.some(v => v > 0)) speedSet = true;
    const f = words(c, 'F');
    if (f.length) feed = f[f.length - 1];

    // Omezení otáček (musí platit dřív než G96, nebo ve stejném bloku).
    if (has(c, /(?<![A-Z_])LIMS\s*=/)) limit = true;
    if (ctrl === 'fanuc' && (g.includes(50) || g.includes(92)) && s.length && !has(c, /(?<![A-Z_])[XZUW]\s*-?[\d.]/)) limit = true;
    if (g.includes(96) && !limit && ctrl !== 'heidenhain') {
      const word = ctrl === 'fanuc' ? 'G50 S…' : 'LIMS=…';
      add('error', idx, `G96 (konst. řezná rychlost) bez omezení otáček — doplň ${word} před G96. U malého průměru by vřeteno vyletělo na maximum stroje.`, 'g96-limit');
    }

    if (m.some(v => v === 3 || v === 4)) spindleOn = true;
    if (m.includes(5)) spindleOn = false;

    if (g.includes(40)) comp = -1;
    if (g.includes(41) || g.includes(42)) comp = idx;

    // Bloky s pevnými body / referencí / cykly: souřadnice tu nejsou pohyb dráhy
    // (G75 Sinumerik = pevný bod, G74/G75 Fanuc = cyklus; obojí se přeskočí).
    const special = [28, 53, 74, 75].some(v => g.includes(v))
      || (ctrl === 'fanuc' && [50, 70, 71, 72, 73, 76, 90, 92, 94].some(v => g.includes(v)));
    for (const v of g) if ([0, 1, 2, 3, 32, 33, 34].includes(v)) motion = v;
    const thread = motion === 32 || motion === 33 || motion === 34;   // stoupání K/F, ne posuv

    const axis = has(c, /(?<![A-Z_])[XZUW]\s*=?\s*[-\d.(]/);
    if (axis && !special && motion !== null) {
      if (!tool) add('error', idx, 'Pohyb před voláním nástroje (T…).', 'no-tool');
      if (motion !== 0) {
        if (!spindleOn) add('error', idx, 'Řezný pohyb bez zapnutého vřetena (M3/M4).', 'no-spindle');
        else if (!speedSet) add('error', idx, 'Řezný pohyb bez otáček / řezné rychlosti (S…).', 'no-speed');
        if (!thread && !(feed > 0)) add('error', idx, 'Řezný pohyb bez posuvu (F…).', 'no-feed');
      }
      if (motion === 2 || motion === 3) {
        const r = [...words(c, 'R'), ...[...c.matchAll(/CR\s*=\s*(-?\d*\.?\d+)/g)].map(x => parseFloat(x[1]))];
        const center = has(c, /(?<![A-Z_])[IK]\s*=?\s*-?[\d.]/);
        if (!center && !r.length) add('error', idx, `Oblouk G${motion} bez poloměru (${ctrl === 'sinumerik' ? 'CR=' : 'R'}) i bez středu (I/K).`, `arc-${idx}`);
        else if (!center && r.every(v => v === 0)) add('error', idx, `Oblouk G${motion} s nulovým poloměrem.`, `arc0-${idx}`);
      }
    }

    if (m.includes(30) || m.includes(2)) endIdx = idx;
  });

  if (endIdx < 0 && lines.some(l => codeOf(l, ctrl))) {
    add('warn', -1, 'Chybí konec programu (M30).', 'no-end');
  }
  if (comp >= 0) add('warn', comp, 'Korekce rádiusu G41/G42 není na konci zrušená (G40).', 'comp');
  return out;
}

/** Text pro potvrzovací okno; nejvýš `max` položek. */
export function formatNcFindings(findings, max = 8) {
  const errs = findings.filter(f => f.level === 'error').length;
  const warns = findings.length - errs;
  const parts = [];
  if (errs) parts.push(`chyby: ${errs}`);
  if (warns) parts.push(`upozornění: ${warns}`);
  const head = `Kontrola NC programu — ${parts.join(', ')}`;
  const rows = findings.slice(0, max).map(f => {
    const where = f.line > 0 ? `ř. ${f.line}${f.block ? ` (${f.block.slice(0, 40)})` : ''}: ` : '';
    return `${f.level === 'error' ? '⛔' : '⚠'} ${where}${f.msg}`;
  });
  if (findings.length > max) rows.push(`… a ${findings.length - max} dalších`);
  return `${head}\n\n${rows.join('\n')}`;
}

/**
 * Před uložením / kopírováním: když kontrola něco najde, zeptá se.
 * @returns {boolean} true = pokračovat v exportu
 */
export function confirmNcExport(code, ctrl, ask = (t) => window.confirm(t)) {
  const findings = checkNcProgram(code, ctrl);
  if (!findings.length) return true;
  return ask(`${formatNcFindings(findings)}\n\nPřesto pokračovat?`);
}
