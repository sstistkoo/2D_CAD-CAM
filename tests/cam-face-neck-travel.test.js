// ╔══════════════════════════════════════════════════════════════╗
// ║  Čelní hrubování: přejezdy bez zbytečného zdvihu a dojezd bez ║
// ║  zajíždění do neobrobené mezery (díl uživatele 12. 10. 2026)  ║
// ╚══════════════════════════════════════════════════════════════╝
//
// Fixture `part-23-face-neck-round-r10`: kulatá R10, čelně zprava, odlitek
// s přírubou a krčkem (Z 165–205). Tři nálezy v jednom programu:
//
//  1. `G0 X75.545 ; Výjezd nad konturu` (N2370, N3180, N3250, N3310, N3370):
//     přejezd v Z se testoval ve výšce `xStart` (pod nástrojem), ne ve skutečné
//     výšce `cur.x`, a hlásil blokádu, kterou tam nikdo neměl → zdvih na strop.
//  2. `G0 X66.422` na Z −7 (N4690) a výš: v okně nosu za koncem polotovaru se
//     bral jmenovitý Ø polotovaru (sRad 55,5) jako neexistující stěna → poslední
//     průchody u čela vyjížděly nad průměr a jely posuvem vzduchem.
//  3. `N2410 G1 X18.943 Z168.168`: dojezd „bez schodků“ průchodu Z164,932 jel
//     do mezery po průchodech krčku, které hlídání plátku vyhodilo — tedy do
//     plného materiálu, kde žádný schod není.
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { runCamProg } from './helpers/camHeadless.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIX = join(__dirname, 'fixtures', 'cam', 'part-23-face-neck-round-r10.camprog');

let lines;
beforeAll(async () => {
  const { gcode } = await runCamProg(JSON.parse(readFileSync(FIX, 'utf8')));
  const all = gcode.split('\n').map(l => l.replace(/^N\d+ /, ''));
  const a = all.findIndex(l => l.includes('HRUBOVANI'));
  const b = all.findIndex(l => l.includes('DOKONCOVANI'));
  lines = all.slice(a, b);
}, 180000);

/** Řádky průchodu `n` (od komentáře `; Průchod n` po další komentář průchodu). */
function pass(n) {
  const i = lines.findIndex(l => new RegExp(`^; Průchod ${n}( |$)`).test(l));
  expect(i, `průchod ${n} v programu`).toBeGreaterThanOrEqual(0);
  let j = i + 1;
  while (j < lines.length && !lines[j].startsWith('; Průchod')) j++;
  return lines.slice(i + 1, j);
}

describe('čelní hrubování — přejezd v Z nezvedá bezdůvodně', () => {
  it('nikde v hrubování není zdvih nad konturu (kromě závěrečného odjezdu na bezpečné X)', () => {
    const lifts = lines.filter(l => l.includes('Výjezd nad konturu') && !/^G0 X150(\.0+)?\b/.test(l));
    expect(lifts).toEqual([]);
  });

  it('žádný rychloposuv v X nejede nad strop polotovaru + nos (Ø polotovaru 111 se neuplatní)', () => {
    // Nejvyšší povrch polotovaru je R 64,5; nos R 10 + vůle 1 = 75,5. Poslední
    // průchody u čela (polotovar tam R 38,6) smí být nejvýš pod ~52.
    const tail = [];
    for (let n = 86; n <= 90; n++) tail.push(...pass(n));
    // Poslední průchod končí odjezdem na bezpečné X150 — to se nepočítá.
    const xs = tail.filter(l => l.startsWith('G0 X') && !l.includes('Výjezd nad konturu'))
      .map(l => parseFloat(l.slice(4)));
    expect(xs.length).toBeGreaterThan(0);
    expect(Math.max(...xs)).toBeLessThan(52);
  });
});

describe('čelní hrubování — dojezd nejede do mezery po vyhozeném průchodu', () => {
  it('první průchod za krčkem (Z164,932) nejede dojezdem do +Z po neobrobeném krčku', () => {
    const p = pass(47);
    expect(p.some(l => l.startsWith('G0 Z164.932'))).toBe(true);
    // Žádný posuv do +Z v tomhle průchodu mimo odskok pod 45° (X i Z roste).
    const bad = p.filter(l => /^G1 X18\.943 Z16[5-9]/.test(l));
    expect(bad).toEqual([]);
  });

  it('další průchod už dojezd má (předchozí vrstva Z164,932 existuje)', () => {
    expect(pass(48).some(l => /^G1 X18\.943 Z164\.932/.test(l))).toBe(true);
  });
});
