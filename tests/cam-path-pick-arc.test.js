// ╔══════════════════════════════════════════════════════════════╗
// ║  CAM – klik na OBLOUK dráhy najde svůj řádek G-kódu           ║
// ╚══════════════════════════════════════════════════════════════╝
//
// `getGSegmentAt` (camSimulator.js) mapuje kliknutí na plátně na řádek
// G-kódu. Do 1. 9. 2026 uměla jen úsečky (G0/G1): oblouk je v simPath ŘETĚZ
// bodů se stejným `originalLineIdx`, takže ho minul jak filtr na G0/G1, tak
// podmínka „ne vnitřek oblouku". Klik doprostřed oblouku pak buď nenašel nic,
// nebo označil SOUSEDNÍ úsečku (nález uživatele: „na G2/G3 se nic neděje").
//
// Funkce žije v closure `openCamSimulator`, takže se sem — stejně jako
// v `scripts/cam_debug.mjs` — vyřízne ze zdroje a spustí nad stubem
// (skutečný simPath z fixture, umělá projekce plátna). Kdyby se přejmenovala
// nebo přesunula, test spadne na chybějící kotvě, ne tiše.
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync, writeFileSync, unlinkSync } from 'fs';
import { fileURLToPath, pathToFileURL } from 'url';
import { dirname, join } from 'path';
import { tmpdir } from 'os';
import { runCamProgFile } from './helpers/camHeadless.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const SCALE = 4;   // px/mm umělé projekce (na měřítku nezáleží)

/** Vyřízne `getGSegmentAt` ze zdroje a vrátí ji nad zadaným simPath. */
async function loadPicker(simPath) {
  // CRLF na LF — soubor je v repu s CRLF a konec funkce se hledá podle
  // odsazení („\n  }" = uzavírací závorka na úrovni closure).
  const src = readFileSync(join(root, 'js/calculators/camSimulator.js'), 'utf8').replace(/\r\n/g, '\n');
  const start = src.indexOf('  function getGSegmentAt(');
  if (start < 0) throw new Error('cam-path-pick-arc: getGSegmentAt nenalezena v camSimulator.js');
  const end = src.indexOf('\n  }\n', start);
  if (end < 0) throw new Error('cam-path-pick-arc: konec getGSegmentAt nenalezen');
  const body = src.slice(start, end + 4);
  const mod = `
const S = { gcodeEditEnabled: false, simRunning: false, _cachedCalc: { simPath: ${JSON.stringify(simPath)} } };
const canvas = { getBoundingClientRect: () => ({ left: 0, top: 0 }) };
const _gToScreen = (x, z) => ({ x: 100 + z * ${SCALE}, y: 300 - x * ${SCALE} });
${body}
export { getGSegmentAt };
`;
  const tmp = join(tmpdir(), `_cam_pick_${process.pid}_${Date.now()}.mjs`);
  writeFileSync(tmp, mod);
  try { return (await import(pathToFileURL(tmp).href)).getGSegmentAt; }
  finally { try { unlinkSync(tmp); } catch { /* nevadí */ } }
}

/** Oblouky v simPath jako { lineIdx, mid } (mid = bod uprostřed řetězu). */
function arcsOf(sp) {
  const out = [];
  for (let i = 1; i < sp.length; i++) {
    const t = sp[i].type;
    if ((t !== 'G2' && t !== 'G3') || sp[i - 1].originalLineIdx === sp[i].originalLineIdx) continue;
    const li = sp[i].originalLineIdx;
    let j = i;
    while (j < sp.length && sp[j].originalLineIdx === li) j++;
    out.push({ lineIdx: li, type: t, mid: sp[Math.floor((i + j - 1) / 2)] });
    i = j;
  }
  return out;
}

describe('klik na oblouk dráhy (G2/G3) najde svůj řádek', () => {
  let pick, arcs;
  beforeAll(async () => {
    const { calcSim } = await runCamProgFile(join(__dirname, 'fixtures', 'cam', 'part-1.camprog'));
    arcs = arcsOf(calcSim.simPath);
    pick = await loadPicker(calcSim.simPath);
  }, 120000);

  it('fixture vůbec nějaké oblouky má (jinak test nic neměří)', () => {
    expect(arcs.length).toBeGreaterThan(5);
  });

  it('střed KAŽDÉHO oblouku vrátí právě jeho řádek', () => {
    const misses = [];
    for (const a of arcs) {
      const pt = { x: 100 + a.mid.z * SCALE, y: 300 - a.mid.x * SCALE };
      const hit = pick(pt.x, pt.y, true, true);
      if (!hit || hit.lineIdx !== a.lineIdx || !hit.isArc) misses.push(a.lineIdx);
    }
    expect(misses).toEqual([]);
  });

  it('bez `includeArcs` se oblouk nenajde (regrese by jinak prošla nepovšimnuta)', () => {
    const found = arcs.filter(a => {
      const hit = pick(100 + a.mid.z * SCALE, 300 - a.mid.x * SCALE, true, false);
      return hit && hit.lineIdx === a.lineIdx;
    });
    expect(found).toEqual([]);
  });

  it('oblouk se vrací BEZ p1/p2 — tažení ho nesmí chytit', () => {
    const a = arcs[0];
    const hit = pick(100 + a.mid.z * SCALE, 300 - a.mid.x * SCALE, true, true);
    expect(hit.isArc).toBe(true);
    expect(hit.p1).toBeUndefined();
    expect(hit.p2).toBeUndefined();
  });
});
