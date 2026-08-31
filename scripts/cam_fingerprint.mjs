// ╔══════════════════════════════════════════════════════════════╗
// ║  CAM FINGERPRINT — otisk G-kódu přes všechny fixtures         ║
// ╚══════════════════════════════════════════════════════════════╝
//
// K ČEMU TO JE: odpovídá na otázku „koho všeho se moje oprava dotkla?".
//
// Opravíš jednu věc a hne se něco jiného — protože moduly v `cam/ops/`
// sdílejí data, ne jen soubory. `offsetXAt` čte 12 modulů, do pole `passes`
// zapisuje 12 modulů, obálku držáku vidí 6. Rozdělení do souborů ten dosah
// nezmenšilo, jen zpřehlednilo; co ho ohlídá, je MĚŘENÍ.
//
// Postup u každé opravy:
//   node scripts/cam_fingerprint.mjs --save=pred.json     PŘED zásahem
//   …oprava…
//   node scripts/cam_fingerprint.mjs --diff=pred.json     PO zásahu
//
// Vypíše seznam dílů, jejichž PROGRAM se změnil, a u každého první odlišný
// řádek. Když je mezi nimi díl, kterého se oprava týkat neměla, víš to dřív,
// než to najdeš na stroji.
//
// ROZDÍL PROTI `cam_sweep.mjs`: sweep měří ÚBĚR a KOLIZE, tedy jestli je
// výsledek dobrý. Fingerprint měří SHODU PROGRAMU, tedy jestli se vůbec něco
// změnilo. U refaktoringu (přesun kódu beze změny chování) musí být otisk
// shodný BAJT PO BAJTU — to sweep neukáže, protože stejný úběr může vzniknout
// z jiné dráhy. Obojí se doplňuje: fingerprint řekne KDE se hnulo,
// sweep jestli to bylo k lepšímu.
//
// ── Spuštění ──────────────────────────────────────────────────────────────
//   node scripts/cam_fingerprint.mjs                 tabulka sha za všechny fixtures
//   node scripts/cam_fingerprint.mjs part-8 range    jen fixtures dle podřetězce
//   node scripts/cam_fingerprint.mjs --save=a.json   uložit otisk (i s programy)
//   node scripts/cam_fingerprint.mjs --diff=a.json   porovnat s uloženým
//   node scripts/cam_fingerprint.mjs --diff=a.json --full   celý diff, ne jen 1. řádek
//   node scripts/cam_fingerprint.mjs --jobs=8        paralelizace (výchozí = CPU−1)
//   node scripts/cam_fingerprint.mjs --one=<cesta>   jedna fixture, JSON na stdout
//
// ── Proč jeden PROCES na fixture ──────────────────────────────────────────
// Harness `tests/helpers/camHeadless.mjs` sdílí singleton `S` a
// `Object.assign(S.zLimits, …)` MERGUJE — fixture by zdědila omezení po té
// předchozí a otisk by nebyl reprodukovatelný. Každá tedy jede zvlášť.
//
// ── Proč se z programu vyhazuje řádek `Datum:` ────────────────────────────
// Hlavička obsahuje `new Date().toLocaleDateString()`. Bez jeho odstranění by
// se otisk lišil každý den a nástroj by byl k ničemu.
//
// ── Ověřeno ───────────────────────────────────────────────────────────────
// Otisk je DETERMINISTICKÝ (28. 8. 2026 dva běhy po sobě bajt po bajtu
// shodné). Když se tedy liší, změnil se kód — ne měření.
import { createHash } from 'crypto';
import { readdirSync, readFileSync, writeFileSync } from 'fs';
import { fileURLToPath, pathToFileURL } from 'url';
import { dirname, join } from 'path';
import { spawn } from 'child_process';
import { cpus } from 'os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const fixturesDir = join(root, 'tests', 'fixtures', 'cam');

/** Datum v hlavičce se mění každý den — z otisku ven (viz hlavička). */
const stripVolatile = (gcode) =>
  (gcode || '').split('\n').filter(l => !l.includes('Datum:')).join('\n');

// ── WORKER: jedna fixture ─────────────────────────────────────────────────

const oneArg = process.argv.find(a => a.startsWith('--one='));
if (oneArg) {
  let out;
  try {
    const { runCamProgFile } = await import(
      pathToFileURL(join(root, 'tests', 'helpers', 'camHeadless.mjs')).href);
    const { gcode } = await runCamProgFile(oneArg.slice('--one='.length));
    const body = stripVolatile(gcode);
    out = { sha: createHash('sha1').update(body).digest('hex'),
      lines: body.split('\n').length, body };
  } catch (e) {
    out = { sha: 'ERROR', lines: 0, body: '', err: String((e && e.message) || e) };
  }
  process.stdout.write(JSON.stringify(out));
  process.exit(0);
}

// ── DRIVER ────────────────────────────────────────────────────────────────

const argv = process.argv.slice(2);
const flag = (name) => {
  const a = argv.find(x => x.startsWith(`--${name}=`));
  return a ? a.slice(name.length + 3) : null;
};
const savePath = flag('save');
const diffPath = flag('diff');
const full = argv.includes('--full');
const jobs = Math.max(1, parseInt(flag('jobs'), 10) || Math.max(1, cpus().length - 1));
const filters = argv.filter(a => !a.startsWith('--'));

let fixtures = readdirSync(fixturesDir).filter(f => f.endsWith('.camprog')).sort();
if (filters.length) fixtures = fixtures.filter(f => filters.some(s => f.includes(s)));
if (fixtures.length === 0) {
  console.error('cam_fingerprint: žádná fixture nesedí na filtr');
  process.exit(2);
}

const results = new Array(fixtures.length);
const runOne = (file, idx) => new Promise((res) => {
  const p = spawn(process.execPath, [process.argv[1], `--one=${join(fixturesDir, file)}`],
    { stdio: ['ignore', 'pipe', 'inherit'] });
  let buf = '';
  p.stdout.on('data', d => { buf += d; });
  p.on('close', () => {
    try { results[idx] = JSON.parse(buf); } catch {
      results[idx] = { sha: 'NOPARSE', lines: 0, body: '', err: 'worker nevrátil JSON' };
    }
    res();
  });
});

const t0 = Date.now();
let next = 0;
await Promise.all(Array.from({ length: Math.min(jobs, fixtures.length) }, async () => {
  while (next < fixtures.length) {
    const i = next++;
    await runOne(fixtures[i], i);
  }
}));

const W = Math.max(...fixtures.map(f => f.length));
const pad = (s) => String(s).padEnd(W);

// ── Uložení ───────────────────────────────────────────────────────────────

if (savePath) {
  const dump = {};
  fixtures.forEach((f, i) => { dump[f] = results[i]; });
  writeFileSync(savePath, JSON.stringify(dump), 'utf8');
}

// ── Porovnání ─────────────────────────────────────────────────────────────

if (diffPath) {
  const base = JSON.parse(readFileSync(diffPath, 'utf8'));
  const changed = [];
  const missing = [];
  fixtures.forEach((f, i) => {
    const b = base[f];
    if (!b) { missing.push(f); return; }
    if (b.sha !== results[i].sha) changed.push([f, b, results[i]]);
  });
  const gone = Object.keys(base).filter(f => !fixtures.includes(f));

  console.log(`CAM FINGERPRINT · ${fixtures.length} fixtures proti ${diffPath}`
    + `  (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
  if (missing.length) console.log(`  ⚠ v uloženém otisku nejsou: ${missing.join(', ')}`);
  if (gone.length) console.log(`  ⚠ v uloženém otisku navíc: ${gone.join(', ')}`);

  if (changed.length === 0) {
    console.log('\n  OTISK SHODNÝ — program se nezměnil u žádné fixture.');
    process.exit(0);
  }

  console.log(`\n── ZMĚNĚNO: ${changed.length} z ${fixtures.length} ───────────────────`);
  for (const [f, b, n] of changed) {
    if (n.sha === 'ERROR' || n.sha === 'NOPARSE') {
      console.log(`\n${pad(f)}  ⛔ CHYBA: ${n.err || 'neznámá'}`);
      continue;
    }
    const dl = n.lines - b.lines;
    console.log(`\n${pad(f)}  ${b.lines} → ${n.lines} ř.`
      + (dl ? ` (${dl > 0 ? '+' : ''}${dl})` : ' (stejná délka)'));
    const A = (b.body || '').split('\n');
    const B = (n.body || '').split('\n');
    const lim = full ? Infinity : 1;
    let shown = 0;
    for (let k = 0; k < Math.max(A.length, B.length) && shown < lim; k++) {
      if (A[k] === B[k]) continue;
      console.log(`    ř.${k + 1}  − ${A[k] === undefined ? '(konec)' : A[k].trim()}`);
      console.log(`    ř.${k + 1}  + ${B[k] === undefined ? '(konec)' : B[k].trim()}`);
      shown++;
    }
    if (!full && shown) console.log('    … (další rozdíly: --full)');
    if (!b.body) console.log('    (uložený otisk je starý formát bez programu — diff řádků nelze)');
  }
  console.log('\nZměnil se díl, kterého se oprava týkat neměla? Pak zasáhla něco sdíleného —'
    + '\nviz docs/cam-plan-2026-08-28.md, §3.A (co všechno moduly sdílejí).');
  process.exit(1);
}

// ── Tabulka ───────────────────────────────────────────────────────────────

console.log(`CAM FINGERPRINT · ${fixtures.length} fixtures`
  + `  (${jobs} paralelně, ${((Date.now() - t0) / 1000).toFixed(1)} s)`);
let errs = 0;
fixtures.forEach((f, i) => {
  const r = results[i];
  if (r.sha === 'ERROR' || r.sha === 'NOPARSE') errs++;
  console.log(`${pad(f)}  ${r.sha}  ${String(r.lines).padStart(5)} ř.`
    + (r.err ? `  ⛔ ${r.err}` : ''));
});
if (savePath) console.log(`\nUloženo do ${savePath}`);
if (errs) {
  console.log(`\n⛔ ${errs} fixtures skončilo chybou — otisk NENÍ použitelný jako baseline.`);
  process.exit(1);
}
