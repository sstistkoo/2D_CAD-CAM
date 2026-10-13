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

let lines, calcPasses;
beforeAll(async () => {
  const { gcode, calc } = await runCamProg(JSON.parse(readFileSync(FIX, 'utf8')));
  calcPasses = calc.passes;
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

// Průchody se hledají podle Z, ne podle čísla — čísla se posunou, když přibude
// průchod jinde (13. 10. 2026: 45° průchody před čelem příruby, S5).
/** Číslo průchodu, který jede v hloubce `z` (řádek `G0 Z…`). */
function passAtZ(z) {
  const at = lines.findIndex(l => l === `G0 Z${z}`);
  expect(at, `průchod v Z${z}`).toBeGreaterThanOrEqual(0);
  for (let k = at; k >= 0; k--) {
    const m = /^; Průchod (\d+)/.exec(lines[k]);
    if (m) return +m[1];
  }
  return -1;
}
/** Číslo posledního průchodu hrubování. */
const lastPass = () => Math.max(...lines.map(l => /^; Průchod (\d+)/.exec(l)).filter(Boolean).map(m => +m[1]));

describe('čelní hrubování — přejezd v Z nezvedá bezdůvodně', () => {
  // Zdvih o kousek nad nájezd je v pořádku, když ho nos potřebuje: pod
  // přírubou za 45° průchody (13. 10. 2026) se přejezd zvedne na X29,25 místo
  // X28,75, aby se nos R10 bokem neotřel o roh klínu pod mezní čarou.
  // Nález byl skok na STROP nad konturou (X75,545), ne tohle.
  it('nikde v hrubování není zdvih na strop nad konturou (kromě závěrečného odjezdu na bezpečné X)', () => {
    const lifts = lines.filter(l => l.includes('Výjezd nad konturu') && !/^G0 X150(\.0+)?\b/.test(l))
      .filter(l => parseFloat(l.slice(4)) > 40);
    expect(lifts).toEqual([]);
  });

  it('žádný rychloposuv v X nejede nad strop polotovaru + nos (Ø polotovaru 111 se neuplatní)', () => {
    // Nejvyšší povrch polotovaru je R 64,5; nos R 10 + vůle 1 = 75,5. Poslední
    // průchody u čela (polotovar tam R 38,6) smí být nejvýš pod ~52.
    const tail = [];
    for (let n = lastPass() - 4; n <= lastPass(); n++) tail.push(...pass(n));
    // Poslední průchod končí odjezdem na bezpečné X150 — to se nepočítá.
    const xs = tail.filter(l => l.startsWith('G0 X') && !l.includes('Výjezd nad konturu'))
      .map(l => parseFloat(l.slice(4)));
    expect(xs.length).toBeGreaterThan(0);
    expect(Math.max(...xs)).toBeLessThan(52);
  });
});

// Mezní čára zanoření 45° od vrcholu stěny příruby vede PŘED čelem osazení
// (Z 205) až na hranu polotovaru (S5, Z 196,3). Offset čela ji protínal ještě
// uprostřed a dráhy u čela skončily — mezi posledním průchodem a koncem čáry
// zůstal stát klín polotovaru „od nože" (uživatel 13. 10. 2026: „dobrat jenom
// ten kousek s tím zanořením 45°", jako u S14). Průchody mají jet po čáře až
// na její konec: střed nosu na X = Z − 156,63 až po Z 188,07.
describe('čelní hrubování — 45° průchody před čelem příruby dojedou na konec mezní čáry', () => {
  it('průchody Z192,932 a Z188,932 končí na offsetu mezní čáry (X36,303 / X32,303)', () => {
    // Z192,932 se najíždí rampou 45° (`G1 X36.303 Z192.932 ; Zanoření`).
    expect(lines.some(l => /^G1 X36\.303 Z192\.932\b/.test(l))).toBe(true);
    expect(pass(passAtZ('188.932')).some(l => /^G1 X32\.303( |$)/.test(l))).toBe(true);
  });
});

// Odskok 45° = úhel zanoření 45°: po průchodu zkráceném zanořením (schodiště
// pod 45°) by šikmý odskok jel zpátky po obrobené ploše. Má odjet kolmo v X
// (uživatel 13. 10. 2026).
describe('čelní hrubování — odskok po schodišti zanoření jede kolmo', () => {
  it('průchody zkrácené zanořením odjíždějí „Výjezd v X", ne pod 45°', () => {
    const zs = calcPasses.filter(p => p.type === 'face' && p.descentClamped).map(p => p.z.toFixed(3));
    expect(zs.length).toBeGreaterThan(0);
    for (const z of zs) {
      const p = pass(passAtZ(z));
      expect(p[p.length - 1], `odskok průchodu Z${z}`).toMatch(/Výjezd v X/);
    }
  });
});

describe('čelní hrubování — dojezd nejede do mezery po vyhozeném průchodu', () => {
  // Dřív vrstva Z168,932 vypadla (držák) a dojezd průchodu Z164,932 jel do
  // té mezery. Od 13. 10. 2026 (45° průchody před čelem příruby uvolnily
  // držák) ta vrstva existuje — dojezd k ní stoupat SMÍ, ale ne výš.
  it('dojezd průchodu Z164,932 nestoupá dál, než k existující předchozí vrstvě', () => {
    const p = pass(passAtZ('164.932'));
    expect(p.some(l => l.startsWith('G0 Z164.932'))).toBe(true);
    const zPrev = 168.932;
    const prevExists = lines.some(l => l === `G0 Z${zPrev}`);
    // Posuvy v průchodu kromě odskoku (poslední řádek) — Z nesmí přes předchozí vrstvu.
    const feedZs = p.slice(0, -1).filter(l => l.startsWith('G1')).map(l => /Z(-?[\d.]+)/.exec(l)).filter(Boolean).map(m => +m[1]);
    const maxZ = Math.max(164.932, ...feedZs);
    expect(maxZ).toBeLessThanOrEqual(prevExists ? zPrev + 1e-3 : 164.932 + 1e-3);
  });

  it('další průchod už dojezd má (předchozí vrstva Z164,932 existuje)', () => {
    expect(pass(passAtZ('164.932') + 1).some(l => /^G1 X18\.943 Z164\.932/.test(l))).toBe(true);
  });
});
