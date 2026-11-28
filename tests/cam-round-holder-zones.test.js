// ╔══════════════════════════════════════════════════════════════╗
// ║  Kulatá (pravidlo 7): varování držáku nese zónu                ║
// ╚══════════════════════════════════════════════════════════════╝
//
// Audit CAM 28. 11. 2026: „Držák (pravidlo 2): N vrstev vjíždí dál od stěny
// rampou, M vrstev vynecháno" (ops/long/rule7Layers.js) neslo jen počty —
// kontrola pravidel nedokázala zbytek v údolí kulaté R10 odlišit od
// chybějící vrstvy. Teď nese `zones`: vynechaná vrstva = celý interval na
// hloubce, posunutý vjezd = pás od stěny k začátku vrstvy.
//
// round-r10-plunge-chain-end: údolí X7,58 Z84–100 (zbytek Z76–102, 9,6 mm)
// — držák se ke stěně Z100 nevejde, vrstvy X25,7/21,7/18,1 začínají dál.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { runCamProg } from './helpers/camHeadless.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const load = (p) => JSON.parse(readFileSync(join(here, p), 'utf8'));

describe('kulatá R10: zóny varování držáku (pravidlo 7)', () => {
  it('round-r10-plunge-chain-end: zóny pokrývají údolí u stěny Z100', async () => {
    const r = await runCamProg(load('fixtures/cam-cases/round-r10-plunge-chain-end.camprog'));
    const w = r.errors.find(e => e && typeof e === 'object' && /^Držák \(pravidlo 2\)/.test(e.msg));
    expect(w && Array.isArray(w.zones)).toBe(true);
    for (const x of [25.666, 21.666]) {
      expect(w.zones.some(q => Math.abs(q.x - x) < 0.01 && q.zLo < 91 && q.zHi > 100)).toBe(true);
    }
  }, 120000);

  it('zleva: zóny jsou zpátky v souřadnicích dílu (round-r10-left-full-steps)', async () => {
    const r = await runCamProg(load('fixtures/cam-cases/round-r10-left-full-steps.camprog'));
    const w = r.errors.find(e => e && typeof e === 'object' && /^Držák \(pravidlo 2\)/.test(e.msg));
    expect(w && Array.isArray(w.zones)).toBe(true);
    // Zbytek Z138–171 u stěny: zóny leží v kladném Z (ne zrcadlené).
    expect(w.zones.some(q => q.zLo > 150 && q.zHi < 175 && q.zHi - q.zLo > 10)).toBe(true);
  }, 120000);
});
