// ╔══════════════════════════════════════════════════════════════╗
// ║  CAM AIR — kolik se toho řeže VE VZDUCHU                      ║
// ╚══════════════════════════════════════════════════════════════╝
//
// K ČEMU TO JE: odpovídá na otázku „jezdí dráhy tam, kde vůbec něco je?".
//
// Booleovský sken staví zbytek proti OBDÉLNÍKOVÉMU obalu
// (`ops/long/intervalScan.js`: „scan-line záměrně obrys polotovaru IGNORUJE"),
// takže plánuje průchody i tam, kde odlitek dávno není. Emise to má dorovnat
// — tělo průchodu přejede vzduch rychloposuvem — jenže rampa, dojezd po
// kontuře a nájezd to nedělají. Výsledek uživatel vidí jako dráhy jedoucí
// metr nad materiálem.
//
// Tenhle skript to změří. Ani `cam_fingerprint` (shoda programu), ani
// `cam_sweep` (úběr × kolize) to neukážou: dráha ve vzduchu nic neodebere,
// do ničeho nenarazí a program je „stabilní".
//
// ── Spuštění ──────────────────────────────────────────────────────────────
//   node scripts/cam_air.mjs                 všechny fixtures
//   node scripts/cam_air.mjs part-23         jen fixtures dle podřetězce
//   node scripts/cam_air.mjs --detail=part-23   vypsat jednotlivé pohyby
//
// ── Co se počítá ──────────────────────────────────────────────────────────
//   • ŘEZ VE VZDUCHU  — `G1/G2/G3`, jehož CELÁ trasa leží nad vůlí-posunutou
//     siluetou polotovaru. To je vada: pracovní posuv tam nemá co dělat.
//   • PRŮCHOD NAPRÁZDNO — zákrok, jehož celý rozsah (včetně kotvy rampy
//     a obou dojezdů) leží nad materiálem. Ten by neměl vzniknout vůbec;
//     `ops/roughLong.js` je od 5. 9. 2026 zahazuje, takže tady má být 0.
//
// Rychloposuvy ve vzduchu se NEPOČÍTAJÍ — nůž se přemístit musí.
import { readdirSync, readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { runCamProg } from '../tests/helpers/camHeadless.mjs';
import { buildStockLoopRaw, offsetStockLoop } from '../js/calculators/cam/materialRemoval.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const fxDir = join(root, 'tests', 'fixtures', 'cam');

const args = process.argv.slice(2);
const detailFor = (args.find(a => a.startsWith('--detail=')) || '').slice(9);
const filtry = args.filter(a => !a.startsWith('--'));

/** Vrch vůlí-posunuté siluety na Z (null = mimo polotovar). */
const makeTopAt = (loop) => (z) => {
  let t = null;
  for (let i = 0; i < loop.length; i++) {
    const a = loop[i], b = loop[(i + 1) % loop.length];
    if ((a.z - z) * (b.z - z) > 0 || Math.abs(a.z - b.z) < 1e-12) continue;
    const x = a.x + (b.x - a.x) * (z - a.z) / (b.z - a.z);
    if (t === null || x > t) t = x;
  }
  return t;
};

/** Leží CELÁ úsečka nad materiálem? Práh 0,01 mm — dotyk povrchu je řez. */
const jeVeVzduchu = (topAt, x1, z1, x2, z2) => {
  for (let i = 0; i <= 8; i++) {
    const t = i / 8;
    const top = topAt(z1 + (z2 - z1) * t);
    if (top !== null && x1 + (x2 - x1) * t < top + 0.01) return false;
  }
  return true;
};

const soubory = readdirSync(fxDir).filter(f => f.endsWith('.camprog'))
  .filter(f => filtry.length === 0 || filtry.some(q => f.includes(q)))
  .sort();

console.log('CAM AIR · řezné pohyby nad materiálem\n');
console.log('díl'.padEnd(38) + 'řezů ve vzduchu'.padStart(16) + 'délka'.padStart(11) + 'průchodů naprázdno'.padStart(20));
console.log('─'.repeat(85));

let celkemN = 0, celkemMm = 0, celkemPrazdnych = 0;
for (const f of soubory) {
  let r;
  try { r = await runCamProg(JSON.parse(readFileSync(join(fxDir, f), 'utf8'))); }
  catch (e) { console.log(f.padEnd(38) + '  CHYBA: ' + (e && e.message)); continue; }

  const raw = buildStockLoopRaw(r.params, r.calcSim.stockPathSegments);
  if (!raw || raw.length < 3) { console.log(f.padEnd(38) + '  (bez siluety polotovaru)'); continue; }
  const topAt = makeTopAt(offsetStockLoop(raw, r.params));

  // 1) řezné pohyby z vygenerovaného G-kódu
  let x = null, z = null, n = 0, mm = 0;
  const detail = [];
  for (const ln of r.gcode.split('\n')) {
    const m = /^N\d+\s+(G[0123])\s/.exec(ln.trim());
    if (!m) continue;
    const gx = /X(-?[\d.]+)/.exec(ln), gz = /Z(-?[\d.]+)/.exec(ln);
    const nx = gx ? +gx[1] : x, nz = gz ? +gz[1] : z;
    if (x !== null && m[1] !== 'G0' && (nx !== x || nz !== z)
        && jeVeVzduchu(topAt, x, z, nx, nz)) {
      const d = Math.hypot(nx - x, nz - z);
      n++; mm += d;
      if (detailFor && f.includes(detailFor)) detail.push(`      ${ln.trim()}   (${d.toFixed(1)} mm, povrch r${(topAt(nz) ?? 0).toFixed(2)})`);
    }
    x = nx; z = nz;
  }

  // 2) průchody, jejichž CELÝ rozsah leží nad materiálem
  let prazdnych = 0;
  for (const p of (r.calc.passes || [])) {
    if (p.type !== 'long' || !Number.isFinite(p.x) || !Number.isFinite(p.zStart)) continue;
    let zLo = Math.min(p.zStart, p.zEnd), zHi = Math.max(p.zStart, p.zEnd);
    if (p.ramp && Number.isFinite(p.ramp.z0)) { zLo = Math.min(zLo, p.ramp.z0); zHi = Math.max(zHi, p.ramp.z0); }
    for (const key of ['contourLeadIn', 'contourLeadOut'])
      for (const sg of (p[key] || [])) { zLo = Math.min(zLo, sg.z1, sg.z2); zHi = Math.max(zHi, sg.z1, sg.z2); }
    if (jeVeVzduchu(topAt, p.x, zLo, p.x, zHi)) prazdnych++;
  }

  celkemN += n; celkemMm += mm; celkemPrazdnych += prazdnych;
  console.log(f.replace('.camprog', '').padEnd(38)
    + String(n).padStart(16)
    + `${mm.toFixed(1)} mm`.padStart(11)
    + String(prazdnych).padStart(20));
  detail.forEach(d => console.log(d));
}

console.log('─'.repeat(85));
console.log('CELKEM'.padEnd(38) + String(celkemN).padStart(16)
  + `${celkemMm.toFixed(1)} mm`.padStart(11) + String(celkemPrazdnych).padStart(20));
console.log('\nPrůchodů naprázdno má být 0 — `ops/roughLong.js` je zahazuje.');
console.log('Řezy ve vzduchu jsou zbytek po obdélníkovém obalu zbytku; klesat mají k nule.');
