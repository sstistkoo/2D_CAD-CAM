// Dojezd z kapsy přes hrb do DALŠÍHO údolí (audit 21. 11. 2026, pravidla 3 a 7).
// pocketHumpSplit.js dřív dojezd, za jehož hrbem kontura zase stoupá, nechal
// celý: sjel do údolí, jehož vrstvy ještě nejely — part-1 `N2240 G1 X31.201
// Z40.243` z X38,8 na X31,2 jedním tahem, tříska 6,8 mm při ap 3. Teď se utne
// na vrcholu hrbu a údolí si vezmou jeho vlastní průchody.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { runCamProg } from './helpers/camHeadless.mjs';

/** Řezné pohyby hrubování, které sjedou k ose o víc než DVĚ vrstvy (2 × ap) jedním tahem.
 *  (Sjezd o jednu vrstvu po stěně pod úhlem zanoření je běžný dojezd.) */
function deepDescents(gcode, ap, dia) {
  const out = [];
  let x = null, g = 0, rough = false;
  for (const raw of gcode.split('\n')) {
    if (/HRUBOVANI/.test(raw)) rough = true;
    if (/DOKONCOVANI/.test(raw)) rough = false;
    const c = raw.replace(/;.*$/, '');
    const gm = c.match(/\bG0?([0-3])\b/); if (gm) g = +gm[1];
    const xm = c.match(/\bX(-?[\d.]+)/);
    if (!xm) continue;
    const nx = +xm[1] / (dia ? 2 : 1);
    if (rough && g >= 1 && x !== null && x - nx > 2 * ap + 0.05) out.push(`${raw.trim()} (o ${(x - nx).toFixed(2)} mm)`);
    x = nx;
  }
  return out;
}

describe('dojezd z kapsy nesjede do dalšího údolí přes víc vrstev', () => {
  it.each(['part-1', 'part-4', 'part-8'])('%s', async (name) => {
    const prog = JSON.parse(readFileSync(join(__dirname, 'fixtures', 'cam', `${name}.camprog`), 'utf8'));
    const { gcode, params } = await runCamProg(prog);
    expect(deepDescents(gcode, parseFloat(params.depthOfCut), params.mode === 'DIAMON')).toEqual([]);
  }, 180000);
});
