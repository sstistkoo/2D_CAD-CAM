// ╔══════════════════════════════════════════════════════════════╗
// ║  CAM Fáze 4: invarianty přejezdů (rychloposuvů)               ║
// ╚══════════════════════════════════════════════════════════════╝
//
// Semantická pojistka plánování přejezdů (migrace Fáze 4, viz
// docs/geometry-libs-migration.md). Na rozdíl od cam-gcode-regression
// (snapshot celého G-kódu) NEporovnává bajty, ale ověřuje VLASTNOST drah:
//
//   Během hrubování se nástroj rychloposuvem nikdy nesjíždí v X hloub, než
//   kam v daném souvislém běhu rychloposuvů potřebuje — tj. žádný „dip"
//   (sjezd níž a hned zase výjezd) uvnitř jednoho běhu G0.
//
// Tenhle vzor byl reálný defekt (part-10-zapich-casting): dvoufázový nájezd
// zvedl nástroj nad konturu, přejel v Z, ale pak sjel ZPĚT na původní hluboké
// X (skrz stojící odlitek) a hned ho další nájezd zase zvedl. Pracuje čistě
// nad emitovanými souřadnicemi (žádný geometrický model → není flaky).
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { runCamProg } from './helpers/camHeadless.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(__dirname, 'fixtures', 'cam');
const fixtures = readdirSync(fixturesDir).filter(f => f.endsWith('.camprog')).sort();

// Naparsuj emitovaný řádek na { g, x } — X v RAW emitovaných jednotkách
// (u DIAMON průměr); pro porovnání dipů uvnitř jednoho běhu stačí monotonní
// souřadnice, škálování se nemíchá. Komentáře (`;`) i referenční blok KONTURA
// se ignorují.
function parseMove(text) {
  if (/^\s*;/.test(text)) return null;
  const g = /(^|\s)(N\d+\s+)?G0?1(\s|$)/i.test(text) ? 'feed'
    : /(^|\s)(N\d+\s+)?G0?[23](\s|$)/i.test(text) ? 'feed'
    : /(^|\s)(N\d+\s+)?G0?0(\s|$)/i.test(text) ? 'rapid' : null;
  if (!g) return null;
  const xm = text.match(/X(-?\d+\.?\d*)/i);
  return { g, x: xm ? parseFloat(xm[1]) : null };
}

// „Údolí" v X uvnitř jednoho souvislého běhu rychloposuvů = X nejdřív klesne
// (o víc než tol), a POZDĚJI zase stoupne. Čistý nájezd je UNIMODÁLNÍ: buď jen
// klesá/stoupá, nebo se jednou zvedne nad konturu (peak) a pak sjede na hloubku
// — nikdy sjezd-a-znovu-výjezd. Údolí = přesně ten marný/nebezpečný descend-back.
function hasValley(xs, tol) {
  let decreased = false;
  for (let i = 1; i < xs.length; i++) {
    const d = xs[i] - xs[i - 1];
    if (d < -tol) decreased = true;
    else if (d > tol && decreased) return true;   // výstup po sestupu = údolí
  }
  return false;
}

// Vrátí běhy rychloposuvů (mezi řeznými pohyby), které obsahují X-údolí.
// `startX` = poslední známé X před hrubováním. Do každého běhu se prependuje
// vstupní X (poloha po předchozím řezu), aby se sestup hned na začátku zachytil.
function findRapidDips(lines, startX, tol = 0.5) {
  const dips = [];
  let curX = startX;
  let run = null;   // { xs: [] }
  const closeRun = () => {
    if (run && hasValley(run.xs, tol)) dips.push({ xs: run.xs.map(v => +v.toFixed(2)) });
    run = null;
  };
  for (const line of lines) {
    const m = parseMove(line);
    if (!m) continue;
    if (m.g === 'feed') {
      closeRun();
      if (m.x !== null) curX = m.x;
      continue;
    }
    const nx = m.x !== null ? m.x : curX;
    if (!run) run = { xs: [curX] };
    run.xs.push(nx);
    curX = nx;
  }
  closeRun();
  return dips;
}

// Jen HRUBOVACÍ sekce (mezi `--- HRUBOVANI` a `--- DOKONCOVANI`/`--- KONTURA`).
function roughingLines(gcode) {
  const all = gcode.split('\n');
  const s = all.findIndex(l => /--- HRUBOVANI/.test(l));
  if (s < 0) return [];
  let e = all.findIndex((l, i) => i > s && /--- (DOKONCOVANI|KONTURA)/.test(l));
  if (e < 0) e = all.length;
  return all.slice(s + 1, e);
}

describe('CAM Fáze 4 – invarianty přejezdů', () => {
  it('nalezeny fixtures', () => {
    expect(fixtures.length).toBeGreaterThan(0);
  });

  for (const file of fixtures) {
    it(`${file} → hrubování bez marného sjezdu rychloposuvem`, async () => {
      const prog = JSON.parse(readFileSync(join(fixturesDir, file), 'utf8'));
      const { gcode, S } = await runCamProg(prog);
      const startX = parseFloat(S.params.safeX) || 0;
      const dips = findRapidDips(roughingLines(gcode), startX);
      expect(dips, `marné rychloposuvové dipy: ${JSON.stringify(dips)}`).toEqual([]);
    });
  }
});
