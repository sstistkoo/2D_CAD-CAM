// ╔══════════════════════════════════════════════════════════════╗
// ║  CAM QUALITY — kvalita drah v číslech, matice tvar × velikost ║
// ╚══════════════════════════════════════════════════════════════╝
//
// PROČ EXISTUJE. `cam_fingerprint` řekne, jestli se dráha ZMĚNILA.
// `cam_sweep` řekne úběr a kolize. Ani jeden neřekne, jestli je dráha DOBRÁ —
// a přesně to chybělo, když se měsíce opravovalo podle obrázku jednoho dílu:
// každá oprava byla jednotlivě změřená a celek přesto stál.
//
// Druhá věc, kterou to řeší: uživatel 15. 9. 2026 — *„třeba to že změní
// velikost plátku a mám úplně jiné chyby."* Měřit jednu konfiguraci nestačí,
// protože výsledek se s rádiusem plátku převrací (na jeho dílu: kulatá R 5
// → 1 kolize / 2 mm², kulatá R 0,8 → 30 kolizí / 529 mm²). Proto MATICE.
//
// ── Co se měří ────────────────────────────────────────────────────────────
//   úběr %          z materiálu, který jít MÁ (polotovar − díl), ne z celého
//                   polotovaru. To druhé je bezcenné číslo: díl má zůstat stát.
//   třísek > ap     řezných pohybů, jejichž střední tloušťka (plocha/délka)
//                   překročí Hloubku záběru, + ta největší
//   strmých sjezdů  sjezdů do materiálu strmějších než Úhel zanoření, + nejhlubší
//   vzduch          průchodů, které nic neodeberou (generátor je sám hlásí)
//   kolize          tvrdé nálezy validátoru proti SYROVÉ siluetě, zvlášť
//                   rychloposuv × držák
//
// ── PASTI, které si to už vybralo ─────────────────────────────────────────
//   • OBLOUK NENÍ SJEZD. Tesselované tětivy G2/G3 mají strmý lokální sklon,
//     ale sledují konturu. Bez jejich vyloučení hlásila metrika u R 10
//     19 „strmých sjezdů", z nichž 15 byly tětivy — a stálo to dvě mylné
//     diagnózy (16. 9. 2026). Proto `b.type !== 'G2' && b.type !== 'G3'`.
//   • MĚŇ JEDNU VĚC. Test „při 89° chyba zmizí" neizoloval mezní čáry, ale
//     měnil zároveň úhel zanoření — závěr postavený na něm byl vadný.
//
// ── Spuštění ──────────────────────────────────────────────────────────────
//   node scripts/cam_quality.mjs <soubor.camprog>        matice na jednom dílu
//   node scripts/cam_quality.mjs <soubor> --r=5          jen jedna velikost
//   node scripts/cam_quality.mjs <soubor> --shape=round  jen jeden tvar
//   node scripts/cam_quality.mjs --fixtures              přes tests/fixtures/cam
//   node scripts/cam_quality.mjs <soubor> --json         strojový výstup
//
// Souvisí: docs/cam-plan-2026-09-15.md (bod 1), docs/cam-pravidla-drah.md.

import { readFileSync, readdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

// Relativní ESM importy, ne `await import(cesta)` — na Windows by absolutní
// cesta spadla na ERR_UNSUPPORTED_ESM_URL_SCHEME (chce `pathToFileURL`).
import { runCamProg } from '../tests/helpers/camHeadless.mjs';
import { validateToolpath } from '../js/calculators/cam/collisionValidator.js';
import { MaterialRemoval } from '../js/calculators/cam/materialRemoval.js';
import { offsetSilhouetteLoop } from '../js/calculators/cam/toolEnvelope.js';
import { polyArea, polyIntersect } from '../js/geom/geomCore.js';
import { getEffectivePlungeAngle } from '../js/calculators/cam/camMath.js';

/** Jedno měření jedné konfigurace. */
export async function measureQuality(prog0, over = {}) {
  const prog = JSON.parse(JSON.stringify(prog0));
  Object.assign(prog.params, over);
  const { calc, calcSim, errors, params } = await runCamProg(prog);
  const simPath = calcSim.simPath || [];
  const ap = parseFloat(params.depthOfCut) || 1;
  const plungeDeg = getEffectivePlungeAngle(params);

  // ── ÚBĚR z toho, co jít MÁ ──
  let pct = null, leftOver = null;
  {
    const rm = new MaterialRemoval(params, calcSim.stockPathSegments, {});
    if (rm.valid && simPath.length > 1) {
      const stockA = Math.abs(polyArea([rm.baseLoop]));
      const part = offsetSilhouetteLoop(calc.contourSegments);
      const partA = (part && part.length >= 3)
        ? Math.abs(polyArea(polyIntersect([part], [rm.baseLoop]))) : 0;
      rm.advanceTo(simPath, simPath.length - 1);
      const left = Math.abs(polyArea(rm.model.loops));
      pct = 100 * (stockA - left) / (stockA - partA);
      leftOver = left - partA;
    }
  }

  // ── TŘÍSKY a SJEZDY: krok po kroku modelem úběru ──
  let overAp = 0, maxChip = 0, steep = 0, maxSteep = 0, nCuts = 0;
  {
    const rm = new MaterialRemoval(params, calcSim.stockPathSegments, {});
    if (rm.valid) {
      for (let i = 1; i < simPath.length; i++) {
        const a = simPath[i - 1], b = simPath[i];
        const dx = b.x - a.x, dz = b.z - a.z, len = Math.hypot(dx, dz);
        if (len < 1e-9) continue;
        const before = Math.abs(rm.model.area());
        rm.advanceTo(simPath, i);
        const cut = before - Math.abs(rm.model.area());
        if (b.type === 'G0' || cut < 0.01) continue;
        nCuts++;
        const t = cut / len;
        if (t > ap + 1e-6) overAp++;
        if (t > maxChip) maxChip = t;
        // Viz PASTI v hlavičce — oblouk sleduje konturu, není to sjezd.
        if (dx < -0.2 && b.type !== 'G2' && b.type !== 'G3') {
          const deg = Math.abs(dz) < 1e-9 ? 90 : Math.abs(Math.atan(dx / dz) * 180 / Math.PI);
          if (deg > plungeDeg + 1) { steep++; if (-dx > maxSteep) maxSteep = -dx; }
        }
      }
    }
  }

  const issues = validateToolpath(simPath, params, calcSim.stockPathSegments,
    { backside: params.roughingSide === 'left', maxIssues: 60 });
  const airMsg = (errors.find(e => /jede VZDUCHEM/.test(e.msg || '')) || {}).msg;

  return {
    shape: params.toolShape, r: params.toolRadius, ap, plungeDeg,
    pct, leftOver, passes: (calc.passes || []).length, nCuts,
    overAp, maxChip, steep, maxSteep,
    air: airMsg ? parseInt(airMsg.match(/(\d+) průchod/)[1], 10) : 0,
    rapid: issues.filter(i => i.kind === 'rapid'),
    holder: issues.filter(i => i.kind === 'holder'),
  };
}

const MATRIX = {
  round: [0.8, 2, 5, 8, 10, 12],
  polygon: [0.4, 0.8, 1.2, 1.6],
};

function row(m) {
  const f = (a) => a.length ? `${a.length} / ${a.reduce((s, i) => s + i.area, 0).toFixed(0)} mm²` : '0';
  return `${String(m.shape).padEnd(8)} ${String(m.r).padEnd(4)} | `
    + `${(m.pct == null ? '?' : m.pct.toFixed(1)).padStart(6)} | `
    + `${String(m.passes).padStart(6)} | `
    + `${String(m.overAp).padStart(4)}/${String(m.nCuts).padEnd(4)} (${m.maxChip.toFixed(1).padStart(5)}) | `
    + `${String(m.steep).padStart(6)} (${m.maxSteep.toFixed(1).padStart(5)}) | `
    + `${String(m.air).padStart(6)} | ${f(m.rapid).padStart(14)} | ${f(m.holder)}`;
}

const args = process.argv.slice(2);
const opt = (k) => (args.find(a => a.startsWith(`--${k}=`)) || '').split('=')[1];
const files = args.filter(a => !a.startsWith('--'));
const asJson = args.includes('--json');
const onlyR = opt('r') ? parseFloat(opt('r')) : null;
const onlyShape = opt('shape') || null;

const targets = args.includes('--fixtures')
  ? readdirSync(join(root, 'tests/fixtures/cam')).filter(f => f.endsWith('.camprog'))
      .map(f => join(root, 'tests/fixtures/cam', f))
  : files;

if (targets.length === 0) {
  console.error('Použití: node scripts/cam_quality.mjs <soubor.camprog> [--r=5] [--shape=round] [--json]');
  console.error('         node scripts/cam_quality.mjs --fixtures');
  process.exit(1);
}

const out = [];
for (const file of targets) {
  const prog = JSON.parse(readFileSync(file, 'utf8'));
  const name = file.split(/[\\/]/).pop();
  if (!asJson) {
    console.log(`\nDÍL ${name}   ap ${prog.params.depthOfCut}   přídavek X ${prog.params.allowanceX} / Z ${prog.params.allowanceZ}\n`);
    console.log('tvar     R    | úběr % | průch. | třísek>ap (max)  | strmých (max) | vzduch | kolize rapid   | kolize držák');
    console.log('-'.repeat(120));
  }
  for (const [shape, sizes] of Object.entries(MATRIX)) {
    if (onlyShape && shape !== onlyShape) continue;
    for (const r of sizes) {
      if (onlyR !== null && r !== onlyR) continue;
      const m = await measureQuality(prog, { toolShape: shape, toolRadius: r });
      m.file = name;
      out.push(m);
      if (!asJson) console.log(row(m));
    }
  }
}
if (asJson) console.log(JSON.stringify(out, null, 2));
