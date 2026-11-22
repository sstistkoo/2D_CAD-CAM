// Dojezd přes hrb: NEJDŘÍV vrstva, do svahu až potom (audit 21. 11. 2026,
// pravidla 3 a 7). Dřív dojezd za malým hrbem sjel po svahu až na hloubku
// DALŠÍ vrstvy a „dodělat vrstvu" (openPass.js) se pak vracel kolmo nahoru —
// nad svahem přitom stál materiál téhle vrstvy, takže sjezd bral dvě vrstvy:
// part-4 `N1600 G1 X32.971 Z133.125` → `N1610 G1 X35.478 Z133.125`, tříska ~5 mm
// při ap 2,5. Teď se dojezd utne, kde po hrbu sestoupí na hloubku vrstvy,
// vrstva dojede rovně a svah začne další vrstva od místa, kde tahle sjela.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { runCamProg } from './helpers/camHeadless.mjs';

/** Hrubovací „zub": řezný pohyb k ose, hned po něm čistě radiální návrat
 *  OD osy (bez Z) o víc než půl ap a za ním pokračování v Z na posuvu. */
function dipAndClimb(gcode, ap, dia) {
  const out = [];
  let rough = false, g = 0, x = null, z = null;
  const moves = [];
  for (const raw of gcode.split('\n')) {
    if (/HRUBOVANI/.test(raw)) rough = true;
    if (/DOKONCOVANI/.test(raw)) rough = false;
    if (/^\s*;/.test(raw)) { moves.length = 0; continue; }
    const c = raw.replace(/;.*$/, '');
    const gm = c.match(/\bG0?([0-3])\b/); if (gm) g = +gm[1];
    const xm = c.match(/\bX(-?[\d.]+)/), zm = c.match(/\bZ(-?[\d.]+)/);
    if (!xm && !zm) continue;
    const nx = xm ? +xm[1] / (dia ? 2 : 1) : x, nz = zm ? +zm[1] : z;
    if (rough && g >= 1 && x !== null && z !== null) moves.push({ raw: raw.trim(), dx: nx - x, dz: nz - z });
    else moves.length = 0;
    x = nx; z = nz;
    const n = moves.length;
    if (n >= 3) {
      const [a, b, c2] = moves.slice(n - 3);
      if (a.dx < -0.1 && Math.abs(b.dz) < 1e-3 && b.dx > ap / 2 && Math.abs(c2.dx) < 1e-3 && Math.abs(c2.dz) > 0.5) {
        out.push(`${a.raw} → ${b.raw}`);
      }
    }
  }
  return out;
}

/** Nejnižší Z, kam dojede průchod, který začíná na hloubce `x` (radius). */
function passMinZ(gcode, x) {
  let inPass = false, best = null, z = null;
  for (const raw of gcode.split('\n')) {
    if (/^\s*;/.test(raw)) { if (inPass) break; continue; }
    const xm = raw.match(/\bX(-?[\d.]+)/), zm = raw.match(/\bZ(-?[\d.]+)/);
    if (zm) z = +zm[1];
    if (!inPass && /\bG1\b/.test(raw) && xm && Math.abs(+xm[1] - x) < 1e-3) inPass = true;
    if (inPass && z !== null) best = best === null ? z : Math.min(best, z);
  }
  return best;
}

// Oblouk přes nízký hrb (vrchol jen 0,08 mm nad vrstvou) se bral za „dip"
// pod hloubku a zahodil se s celým dojezdem: part-1 vrstva X34,978 skončila
// u hrbu na Z145,989 a za hrb se vrátila až o 9 průchodů později (pravidlo 7
// bod 2: vrstva, která narazí na hrb, ho kopíruje a jede až na konec).
describe('vrstva přes nízký hrb jede vcelku (oblouk se neměří jen koncem)', () => {
  it('part-1: vrstva X34,978 přejede hrb Z~144 a dojede za něj', async () => {
    const prog = JSON.parse(readFileSync(join(__dirname, 'fixtures', 'cam', 'part-1.camprog'), 'utf8'));
    const { gcode } = await runCamProg(prog);
    expect(passMinZ(gcode, 34.978)).toBeLessThan(120);
  }, 180000);
});

/** Řezné pohyby hrubovacího průchodu, které jdou v Z PROTI směru průchodu. */
function backSteps(gcode) {
  const out = [];
  let rough = false, z = null, pass = [];
  const flush = () => {
    const mv = pass;
    const dir = Math.sign(mv.reduce((s, m) => s + m.dz, 0));
    for (const m of mv) if (dir !== 0 && Math.sign(m.dz) === -dir && Math.abs(m.dz) > 0.5) out.push(m.raw);
    pass = [];
  };
  for (const raw of gcode.split('\n')) {
    if (/HRUBOVANI/.test(raw)) rough = true;
    if (/DOKONCOVANI/.test(raw)) { flush(); rough = false; }
    if (/^\s*;/.test(raw)) { flush(); continue; }
    const zm = raw.match(/\bZ(-?[\d.]+)/);
    const nz = zm ? +zm[1] : z;
    // Jen řezné pohyby (s F) — odskok emise píše jako G1 bez F.
    if (rough && /\bG[123]\b/.test(raw) && /\bF[\d.]/.test(raw) && z !== null && nz !== z) pass.push({ raw: raw.trim(), dz: nz - z });
    z = nz;
  }
  flush();
  return out;
}

// Roh strmé stěny POD hloubkou vrstvy: ořez rampy počítal cíl z rohu po
// přímce zanoření a ten vyšel ZPÁTKY — part-21 (zleva) `N1330 G1 X39.740
// Z137.821` → `N1340 G1 X40.118 Z136.412`: pod vrstvu, šikmo proti směru
// jízdy zpátky nahoru (P7 „přerušila", tříska 3,38 mm).
describe('rampa z rohu pod vrstvou: žádný zpětný krok', () => {
  it('part-21-zleva-insert-shadow', async () => {
    const prog = JSON.parse(readFileSync(join(__dirname, 'fixtures', 'cam', 'part-21-zleva-insert-shadow.camprog'), 'utf8'));
    const { gcode } = await runCamProg(prog);
    expect(backSteps(gcode)).toEqual([]);
  }, 180000);
});

describe('dojezd přes hrb: nejdřív vrstva, do svahu až potom', () => {
  it.each(['part-4', 'part-10-zapich-casting', 'part-13-zleva-flange'])('%s', async (name) => {
    const prog = JSON.parse(readFileSync(join(__dirname, 'fixtures', 'cam', `${name}.camprog`), 'utf8'));
    const { gcode, params } = await runCamProg(prog);
    expect(dipAndClimb(gcode, parseFloat(params.depthOfCut), params.mode === 'DIAMON')).toEqual([]);
  }, 180000);
});
