// ╔══════════════════════════════════════════════════════════════╗
// ║  Čelní hrubování: varování o zkrácených průchodech nesou zónu  ║
// ╚══════════════════════════════════════════════════════════════╝
//
// Audit CAM 28. 11. 2026 (zbytek na dně, třídění): hlídání destičky, hloubky
// vrstev, zanoření a držáku čelní průchody zkracují/vynechávají a varování
// neslo jen počet — kontrola pravidel nedokázala zbytek, který generátor
// vědomě nechal, odlišit od chybějící vrstvy. Teď nese `zones`
// (ops/face/faceZones.js): pás Z vrstvy + rozsah X, který se nepojel.
//
// part-19 (PSKNR −15°): kužel Z240–270 pod X34 — natočená destička nesmí
// pod předchozí vrstvu, dna jdou po 15° (X25,8 → X33,9) a klín mezi nimi
// a čelem dílu Z≈239 zůstává. Zvedá je hloubka vrstev při vytvoření doběhu
// (`makeRegionRunOut` volá `enforceLayerDepth` hned) — i to se sleduje.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { runCamProg } from './helpers/camHeadless.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const load = (p) => JSON.parse(readFileSync(join(here, p), 'utf8'));

describe('čelní hrubování: zóny varování', () => {
  it('part-19: hloubka vrstev hlásí zónu klínu pod kuželem (Z 240–270, X do 33)', async () => {
    const r = await runCamProg(load('fixtures/cam/part-19-face-tilted-insert.camprog'));
    const w = r.errors.filter(e => e && typeof e === 'object' && /^Hlídání destičky \(hloubka vrstev\)/.test(e.msg));
    expect(w.length).toBeGreaterThan(0);
    for (const e of w) expect(Array.isArray(e.zones)).toBe(true);
    const zs = w[0].zones;
    // Každý pás kužele Z 242–269 je v nějaké zóně s rozsahem X až nad X 25.
    for (let z = 242; z <= 269; z += 3) {
      expect(zs.some(q => z >= q.zLo && z <= q.zHi && q.xHi > 25 && q.xLo < q.xHi)).toBe(true);
    }
  }, 120000);

  it('range-parting-plunge: zkrácení při vytvoření hlídání držáku je v zóně držáku', async () => {
    const r = await runCamProg(load('fixtures/cam-cases/range-parting-plunge.camprog'));
    const w = r.errors.find(e => e && typeof e === 'object' && /^Hlídání držáku \(čelně\)/.test(e.msg));
    expect(w && Array.isArray(w.zones)).toBe(true);
    // Průchod Z299,932 zvedne držák z X10,32 na X15,80 (svah nad stopkou).
    expect(w.zones.some(q => q.zLo <= 300 && q.zHi >= 300 && q.xLo < 11 && q.xHi > 15)).toBe(true);
  }, 120000);
});
