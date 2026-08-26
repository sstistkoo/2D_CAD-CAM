// ╔══════════════════════════════════════════════════════════════╗
// ║  CAM SWEEP — úběr × kolize přes všechny fixtures              ║
// ╚══════════════════════════════════════════════════════════════╝
//
// Krok 0 plánu `docs/cam-order-aware-holder.md`. Bez tohohle nástroje nejde
// žádný další krok toho plánu posoudit: model zbytku se znalostí pořadí je
// `zbytek ⊇ hotový díl`, tedy vždy alespoň tak přísný jako dnešní statická
// obálka — sám o sobě může úběr jen UBRAT. Rozhodovat se proto dá jedině
// z dvojice čísel „kolik se odebralo" × „kolik zbylo kolizí", a to napříč
// celou sadou, ne na jednom dílu.
//
// Měří se každá fixture ve dvou variantách držáku × dvou standardech polotovaru:
//   • varianty držáku (`--holder=`)
//       - `magazine` = NAKRESLENÝ nůž (obrys ze slotu 2 „Hrubovaci"
//         DEFAULT_TOOL_MAGAZINE) VNUCENÝ všem dílům, i těm, co mají vlastní.
//         Reálný obrys je přísnější (začíná na úrovni špičky) a jen na něm
//         se zbytek nálezu 09 vůbec projeví.
//       - `own` = fixtures JAK JSOU: vlastní obrys tam, kde je nakreslený
//         (14 z 25), náhradní obdélník Tloušťka × Délka jinde. Tohle je
//         stav, který zamyká `tests/cam-collision-free`, a řádek „náhradní
//         držák" v baseline plánu i v CHANGELOGu.
//       - `all` přidá ještě `rect` = obdélník vnucený VŠEM. Není součástí
//         baseline; slouží k oddělení „vadí tvar držáku" od „vadí ten díl".
//         Pozor, na `part-13-zleva-flange` je to jiná úloha, ne jen jiný
//         držák: 15 nálezů / 9 273 mm² a o 6 000 mm² vyšší úběr.
//   • standardy polotovaru (viz `validateToolpath`, opts.planStock)
//       - SYROVÁ silueta („narazil jsem fyzicky do nakresleného?")
//       - OFFSETOVÁ čára (`planStock: true`, `shrink: 0.25` — odlitek MŮŽE
//         být až u ní; práh je odůvodněný v tests/cam-collision-free).
//   Úběr se měří v OBOU standardech taky (základ mínus zbytek po projetí
//   celé dráhy) — baseline v plánu cituje ten SYROVÝ.
//
// ── Spuštění ──────────────────────────────────────────────────────────────
//   node scripts/cam_sweep.mjs                    celá sada, obě varianty (~100 s)
//   node scripts/cam_sweep.mjs part-8 range       jen fixtures dle podřetězce
//   node scripts/cam_sweep.mjs --holder=magazine  jen jedna varianta držáku
//   node scripts/cam_sweep.mjs --holder=all       + obdélník vnucený všem
//   node scripts/cam_sweep.mjs --jobs=8           paralelizace (výchozí = CPU/2)
//   node scripts/cam_sweep.mjs --save=a.json      uložit měření
//   node scripts/cam_sweep.mjs --diff=a.json      porovnat s uloženým měřením
//   node scripts/cam_sweep.mjs --json             jen strojový výstup
//
// ── PASTI, které si to už jednou vybralo ──────────────────────────────────
//  • Singleton `S` v harnessu KONTAMINUJE — proto jeden proces na (fixture ×
//    varianta držáku), ne jeden proces na celou sadu.
//  • `S.zLimits`/`S.xLimits` harness MERGUJE (`Object.assign`), nepřepisuje.
//    Musí se proto posílat PLNÁ sada klíčů (ZL0/XL0 níž), jinak by omezení
//    z předchozího dílu prosáklo dál.
//  • Měřit ÚBĚR, ne jen kolize. Dvakrát prošla ztráta 75 a 19 mm², kterou
//    ani validátor, ani počet průchodů neukáže.
//  • Baseline měřit ve WORKTREE, ne přes `git checkout --` (repo se commituje
//    průběžně, jinak se kód porovná sám se sebou) — proto `--save`/`--diff`.
//  • Fixtures často jedou v režimu RADIUS; souřadnice `r` v nálezech jsou pak
//    poloměry, ne průměry.
import { readdirSync, readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { spawn } from 'child_process';
import { cpus } from 'os';
import { DEFAULT_TOOL_MAGAZINE } from '../js/calculators/cam/camToolPicker.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const root = join(__dirname, '..');
const fixturesDir = join(root, 'tests', 'fixtures', 'cam');

// Plná sada omezení — harness je MERGUJE do singletonu, viz hlavička.
const ZL0 = { chuck: null, tail: null, chuckActive: false, tailActive: false,
  rangeStart: null, rangeEnd: null, rangeActive: false };
const XL0 = { rangeXMin: null, rangeXMax: null, active: false };

const MAGAZINE_TOOL = DEFAULT_TOOL_MAGAZINE.find(t => t.name === 'Hrubovaci');
if (!MAGAZINE_TOOL || !MAGAZINE_TOOL.holderProfile)
  throw new Error('cam_sweep: slot „Hrubovaci" v DEFAULT_TOOL_MAGAZINE nemá holderProfile');

const HOLDERS = {
  magazine: { label: 'nakreslený nůž', note: 'obrys ze slotu 2 „Hrubovaci" DEFAULT_TOOL_MAGAZINE vnucený všem',
    profile: MAGAZINE_TOOL.holderProfile },
  own: { label: 'náhradní držák', keep: true,
    note: 'fixtures jak jsou — vlastní obrys, kde je nakreslený, jinak náhradní obdélník' },
  rect: { label: 'holý obdélník', note: 'holderProfile: null vnucený všem → obdélník Tloušťka × Délka',
    profile: null },
};
// Výchozí dvojice = ta, na kterou je zapsaná baseline v plánu.
const DEFAULT_HOLDERS = ['magazine', 'own'];

// Zapsaná baseline z docs/cam-order-aware-holder.md (25. 8. 2026, HEAD bez
// order-aware modelu). Tiskne se jako kontrolní řádek — rozdíl NENÍ chyba
// nástroje, je to výsledek měřené změny.
const BASELINE = {
  magazine: { removed: 76663.8, issues: 4, area: 33.4 },
  own: { removed: 76849.6, issues: 2, area: 2.3 },
};

// Nad 12 (výchozí `maxIssues` validátoru) proto, aby propad v kroku 3–4 šlo
// VIDĚT. Dnešní maximum je 4 nálezy na fixture, takže se dnešní součty tím
// nemění — jen se přestane maskovat případný nárůst.
const MAX_ISSUES = 64;

// ── společné ──────────────────────────────────────────────────────────────

const listFixtures = () => readdirSync(fixturesDir).filter(f => f.endsWith('.camprog')).sort();

/** „76 663,8" — česká konvence, ať se dá výstup porovnat s dokumentací. */
function nf(n, dec = 1) {
  if (n === null || n === undefined || !Number.isFinite(n)) return '–';
  const [i, f] = Math.abs(n).toFixed(dec).split('.');
  const grouped = i.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return (n < 0 ? '−' : '') + grouped + (f ? ',' + f : '');
}
const sf = (n, dec = 1) => (n > 0 ? '+' : '') + nf(n, dec);

// ── WORKER: jedna fixture × jedna varianta držáku ─────────────────────────

async function measure(file, holderKey) {
  const { runCamProg } = await import('../tests/helpers/camHeadless.mjs');
  const { validateToolpath } = await import('../js/calculators/cam/collisionValidator.js');
  const { MaterialRemoval } = await import('../js/calculators/cam/materialRemoval.js');
  const { polyArea } = await import('../js/geom/geomCore.js');

  const prog = JSON.parse(readFileSync(join(fixturesDir, file), 'utf8'));
  prog.params = { ...prog.params };
  // `keep` = obrys fixture se NEsahá (varianta `own`). Jinak se vnutí — i null,
  // což `holderProfileLoop` vyhodnotí jako náhradní obdélník.
  if (!HOLDERS[holderKey].keep) prog.params.holderProfile = HOLDERS[holderKey].profile;
  prog.zLimits = { ...ZL0, ...(prog.zLimits || {}) };
  prog.xLimits = { ...XL0, ...(prog.xLimits || {}) };

  const t0 = Date.now();
  const { calc, calcSim, params } = await runCamProg(prog);
  const simPath = calcSim.simPath || [];

  // ÚBĚR: základ mínus zbytek po projetí CELÉ dráhy. Řeže se skutečně
  // vygenerovaným G-kódem (calcSim), ne plánovanou geometrií průchodů.
  const removedOn = (planningOutline) => {
    const rm = new MaterialRemoval(params, calcSim.stockPathSegments,
      planningOutline ? { planningOutline: true } : {});
    if (!rm.valid || simPath.length < 2) return null;
    const base = Math.abs(polyArea([rm.baseLoop]));
    rm.advanceTo(simPath, simPath.length - 1);
    return base - Math.abs(rm.model.area());
  };

  const opts = { backside: params.roughingSide === 'left', maxIssues: MAX_ISSUES };
  const pack = (issues) => ({
    n: issues.length,
    area: issues.reduce((a, i) => a + i.area, 0),
    list: issues.map(i => ({ kind: i.kind, x: i.x, z: i.z, area: i.area, lineIdx: i.lineIdx })),
  });

  return {
    file, holder: holderKey,
    passes: (calc.passes || []).length,
    lines: (calcSim.simPath || []).length,
    removedRaw: removedOn(false),
    removedPlan: removedOn(true),
    raw: pack(validateToolpath(simPath, params, calcSim.stockPathSegments, opts)),
    plan: pack(validateToolpath(simPath, params, calcSim.stockPathSegments,
      { ...opts, planStock: true, shrink: 0.25 })),
    ms: Date.now() - t0,
  };
}

const MARK = '##SWEEP##';

async function runWorker(file, holderKey) {
  let out;
  try {
    out = await measure(file, holderKey);
  } catch (e) {
    out = { file, holder: holderKey, error: String(e && e.stack || e).split('\n').slice(0, 3).join(' | ') };
  }
  process.stdout.write('\n' + MARK + JSON.stringify(out) + '\n');
}

// ── PARENT: rozdělit práci do procesů ─────────────────────────────────────

function spawnOne(file, holderKey) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [__filename, '--one=' + file, '--holder-run=' + holderKey],
      { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
    let buf = '', err = '';
    child.stdout.on('data', d => { buf += d; });
    child.stderr.on('data', d => { err += d; });
    child.on('close', (code) => {
      const line = buf.split('\n').find(l => l.startsWith(MARK));
      if (line) return resolve(JSON.parse(line.slice(MARK.length)));
      resolve({ file, holder: holderKey,
        error: `worker skončil kódem ${code}: ${(err || buf).trim().split('\n').slice(-2).join(' | ')}` });
    });
  });
}

async function pool(jobs, limit, onDone) {
  const out = [];
  let next = 0;
  const worker = async () => {
    while (next < jobs.length) {
      const job = jobs[next++];
      const r = await spawnOne(job.file, job.holder);
      out.push(r);
      onDone(r, out.length, jobs.length);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, jobs.length) }, worker));
  return out;
}

// ── VÝSTUP ────────────────────────────────────────────────────────────────

const totalsOf = (rows) => rows.reduce((t, r) => ({
  passes: t.passes + (r.passes || 0),
  removedRaw: t.removedRaw + (r.removedRaw || 0),
  removedPlan: t.removedPlan + (r.removedPlan || 0),
  rawN: t.rawN + (r.raw ? r.raw.n : 0),
  rawA: t.rawA + (r.raw ? r.raw.area : 0),
  planN: t.planN + (r.plan ? r.plan.n : 0),
  planA: t.planA + (r.plan ? r.plan.area : 0),
  errors: t.errors + (r.error ? 1 : 0),
}), { passes: 0, removedRaw: 0, removedPlan: 0, rawN: 0, rawA: 0, planN: 0, planA: 0, errors: 0 });

const W = { file: 32, num: 11, n: 4, area: 8 };
const pad = (s, w) => String(s).padStart(w);
const padE = (s, w) => String(s).length >= w ? String(s).slice(0, w) : String(s) + ' '.repeat(w - String(s).length);

function printTable(holderKey, rows, prev) {
  const H = HOLDERS[holderKey];
  const line = '─'.repeat(W.file + 6 + (W.num + W.n + W.area) * 2 + 6);
  console.log(`\n── ${H.label} — ${H.note} ` + '─'.repeat(Math.max(3, line.length - 6 - H.label.length - H.note.length)));
  console.log(padE('', W.file) + pad('', 6) + pad('SYROVÁ SILUETA', W.num + W.n + W.area + 3) +
    pad('OFFSETOVÁ ČÁRA', W.num + W.n + W.area + 3));
  console.log(padE('fixture', W.file) + pad('prům.', 6) +
    pad('úběr mm²', W.num) + pad('⛔', W.n) + pad('mm²', W.area) + '   ' +
    pad('úběr mm²', W.num) + pad('⛔', W.n) + pad('mm²', W.area));
  console.log(line);
  for (const r of rows) {
    if (r.error) { console.log(padE(r.file.replace('.camprog', ''), W.file) + '  CHYBA: ' + r.error); continue; }
    console.log(
      padE(r.file.replace('.camprog', ''), W.file) + pad(r.passes, 6) +
      pad(nf(r.removedRaw), W.num) + pad(r.raw.n || '·', W.n) + pad(r.raw.n ? nf(r.raw.area) : '·', W.area) + '   ' +
      pad(nf(r.removedPlan), W.num) + pad(r.plan.n || '·', W.n) + pad(r.plan.n ? nf(r.plan.area) : '·', W.area));
  }
  const t = totalsOf(rows);
  console.log(line);
  console.log(padE('CELKEM', W.file) + pad(t.passes, 6) +
    pad(nf(t.removedRaw), W.num) + pad(t.rawN, W.n) + pad(nf(t.rawA), W.area) + '   ' +
    pad(nf(t.removedPlan), W.num) + pad(t.planN, W.n) + pad(nf(t.planA), W.area));
  if (prev) {
    const p = totalsOf(prev);
    console.log(padE('Δ proti --diff', W.file) + pad('', 6) +
      pad(sf(t.removedRaw - p.removedRaw), W.num) + pad(sf(t.rawN - p.rawN, 0), W.n) + pad(sf(t.rawA - p.rawA), W.area) + '   ' +
      pad(sf(t.removedPlan - p.removedPlan), W.num) + pad(sf(t.planN - p.planN, 0), W.n) + pad(sf(t.planA - p.planA), W.area));
  }
  return t;
}

function printIssues(rows) {
  const any = rows.some(r => r.raw && (r.raw.n || r.plan.n));
  if (!any) return;
  console.log('\n── NÁLEZY VALIDÁTORU ' + '─'.repeat(50));
  for (const r of rows) {
    if (r.error || (!r.raw.n && !r.plan.n)) continue;
    const std = [['syrová', r.raw], ['offset', r.plan]];
    for (const [name, s] of std) {
      if (!s.n) continue;
      console.log(`  ${r.file.replace('.camprog', '')} · ${HOLDERS[r.holder].label} · ${name}: ` +
        s.list.map(i => `${i.kind} @r${i.x.toFixed(2)} Z${i.z.toFixed(1)} = ${nf(i.area, 1)} mm² (ř. ${i.lineIdx})`).join('; '));
    }
  }
}

function printDiffRows(rows, prev) {
  const key = (r) => r.holder + '/' + r.file;
  const before = new Map(prev.map(r => [key(r), r]));
  const changed = rows.filter(r => {
    const p = before.get(key(r));
    return p && !p.error && !r.error &&
      (Math.abs((r.removedRaw || 0) - (p.removedRaw || 0)) > 0.05 || r.raw.n !== p.raw.n || r.plan.n !== p.plan.n);
  });
  console.log('\n── ZMĚNĚNÉ FIXTURES proti --diff ' + '─'.repeat(38));
  if (changed.length === 0) { console.log('  (žádná)'); return; }
  for (const r of changed) {
    const p = before.get(key(r));
    console.log(`  ${padE(r.file.replace('.camprog', ''), 30)} ${padE(HOLDERS[r.holder].label, 15)} ` +
      `úběr ${nf(p.removedRaw)} → ${nf(r.removedRaw)} (${sf(r.removedRaw - p.removedRaw)})  ` +
      `⛔ ${p.raw.n}/${nf(p.raw.area)} → ${r.raw.n}/${nf(r.raw.area)}  ` +
      `offset ${p.plan.n}/${nf(p.plan.area)} → ${r.plan.n}/${nf(r.plan.area)}`);
  }
}

// ── main ──────────────────────────────────────────────────────────────────

async function main() {
  const argv = process.argv.slice(2);

  const one = argv.find(a => a.startsWith('--one='));
  if (one) {
    const holderKey = (argv.find(a => a.startsWith('--holder-run=')) || '').split('=')[1] || 'rect';
    return runWorker(one.slice('--one='.length), holderKey);
  }

  const flag = (name, dflt) => {
    const a = argv.find(x => x.startsWith(`--${name}=`));
    return a ? a.slice(name.length + 3) : dflt;
  };
  const asJson = argv.includes('--json');
  const jobsLimit = Math.max(1, parseInt(flag('jobs', String(Math.max(1, Math.floor(cpus().length / 2)))), 10));
  const holderSel = flag('holder', 'both');
  const savePath = flag('save', null);
  const diffPath = flag('diff', null);
  const filters = argv.filter(a => !a.startsWith('--'));

  const holderKeys = holderSel === 'both' ? DEFAULT_HOLDERS
    : holderSel === 'all' ? Object.keys(HOLDERS) : holderSel.split(',');
  for (const k of holderKeys) if (!HOLDERS[k]) throw new Error(`cam_sweep: neznámá varianta držáku „${k}"`);

  let fixtures = listFixtures();
  if (filters.length) fixtures = fixtures.filter(f => filters.some(s => f.includes(s)));
  if (fixtures.length === 0) { console.error('cam_sweep: žádná fixture nesedí na filtr'); process.exit(2); }

  const jobs = [];
  for (const holder of holderKeys) for (const file of fixtures) jobs.push({ file, holder });

  if (!asJson) {
    console.log(`CAM SWEEP · ${fixtures.length} fixtures × ${holderKeys.length} ` +
      `${holderKeys.length === 1 ? 'varianta' : 'varianty'} držáku × 2 standardy polotovaru` +
      `  (${jobsLimit} paralelně, jeden proces na běh)`);
  }
  const t0 = Date.now();
  const rows = await pool(jobs, jobsLimit, (r, done, total) => {
    if (asJson) return;
    process.stderr.write(`\r  ${done}/${total}  ${padE(r.file.replace('.camprog', '') + ' · ' + r.holder, 46)}`);
  });
  if (!asJson) process.stderr.write('\r' + ' '.repeat(60) + '\r');

  const order = new Map(fixtures.map((f, i) => [f, i]));
  rows.sort((a, b) => holderKeys.indexOf(a.holder) - holderKeys.indexOf(b.holder) ||
    order.get(a.file) - order.get(b.file));

  if (savePath) {
    writeFileSync(savePath, JSON.stringify({ when: new Date().toISOString(), fixtures, holderKeys, rows }, null, 1), 'utf8');
    if (!asJson) console.log(`  uloženo → ${savePath}`);
  }
  if (asJson) { console.log(JSON.stringify(rows)); return; }

  // Porovnávat jen to, co se v TOMHLE běhu měřilo — jinak by se filtrovaný
  // běh srovnal se součtem celé sady a Δ by byla nesmysl.
  const prev = diffPath
    ? JSON.parse(readFileSync(diffPath, 'utf8')).rows.filter(r => order.has(r.file))
    : null;
  const totals = {};
  for (const holder of holderKeys) {
    const mine = rows.filter(r => r.holder === holder);
    totals[holder] = printTable(holder, mine, prev ? prev.filter(r => r.holder === holder) : null);
  }
  printIssues(rows);
  if (prev) printDiffRows(rows, prev);

  // Souhrn ve formátu, v jakém je baseline zapsaná v plánu.
  const full = filters.length === 0;
  console.log('\n── SOUHRN (formát docs/cam-order-aware-holder.md, krok 0) ' + '─'.repeat(14));
  for (const holder of holderKeys) {
    const t = totals[holder];
    const b = full ? BASELINE[holder] : null;
    const delta = b ? `   baseline ${nf(b.removed)} / ${b.issues} / ${nf(b.area)}` +
      `   Δ ${sf(t.removedRaw - b.removed)} mm², ${sf(t.rawN - b.issues, 0)} nálezů, ${sf(t.rawA - b.area)} mm²` : '';
    console.log(`${padE(HOLDERS[holder].label, 16)}úběr ${pad(nf(t.removedRaw), 10)} mm²   ` +
      `kolize ${t.rawN} / ${nf(t.rawA)} mm²${delta}`);
  }
  const errs = rows.filter(r => r.error);
  if (errs.length) {
    console.log(`\n⚠ ${errs.length} běhů skončilo chybou:`);
    for (const e of errs) console.log(`  ${e.file} · ${e.holder}: ${e.error}`);
  }
  console.log(`\n(${((Date.now() - t0) / 1000).toFixed(1)} s)`);
}

main().catch(e => { console.error(e); process.exit(1); });
