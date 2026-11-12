#!/usr/bin/env node
// ╔══════════════════════════════════════════════════════════════╗
// ║  Typová kontrola JS (TypeScript nad JSDoc, bez build kroku)    ║
// ╚══════════════════════════════════════════════════════════════╝
// Rozsah: výpočetní jádro — js/calculators/cam/**, js/geom/**, js/geometry/**
// (tam jsou chyby nejdražší: prohozené X/Z, undefined v kontuře, špatný tvar
// segmentu). Aplikace se nemění, TypeScript jen čte kód a JSDoc.
//
// Stejný princip jako tests/file-size-budget.test.js: soubory, které chyby
// měly už při zavedení (12. 11. 2026), jsou v scripts/typecheck-baseline.json
// s povoleným počtem. Ten smí jen KLESAT. Nový soubor v rozsahu musí být čistý.
// Většina starých hlášek je nepřesné JSDoc nebo DOM (`.value` na Element),
// ne chyba v kódu — opravují se průběžně, když se na soubor sahá.
//
//   npm run typecheck            kontrola (exit 1 = nová chyba)
//   npm run typecheck -- --update  po opravách snížit baseline (nikdy nezvýší)

import { execFileSync } from 'child_process';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BASELINE = join(ROOT, 'scripts', 'typecheck-baseline.json');
const SCOPE = /^js\/(calculators\/cam|geom|geometry)\//;

/** Spustí tsc a vrátí chyby v rozsahu: [{file, line, col, code, msg}]. */
export function runTsc() {
  let out = '';
  try {
    execFileSync(process.execPath, [join(ROOT, 'node_modules/typescript/bin/tsc'), '-p', 'tsconfig.typecheck.json', '--pretty', 'false'],
      { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  } catch (e) {
    if (e.stdout == null) throw e;
    out = String(e.stdout);
  }
  const errs = [];
  for (const line of out.split(/\r?\n/)) {
    const m = line.match(/^(.+?)\((\d+),(\d+)\): error (TS\d+): (.*)$/);
    if (!m) continue;
    const file = m[1].replace(/\\/g, '/');
    if (SCOPE.test(file)) errs.push({ file, line: +m[2], col: +m[3], code: m[4], msg: m[5] });
  }
  if (!errs.length && /error TS/.test(out) && !/^js\//m.test(out)) {
    // tsc selhal mimo rozsah (konfigurace) — nenechat projít potichu
    throw new Error('tsc hlásí chyby mimo kód (konfigurace?):\n' + out.slice(0, 2000));
  }
  return errs;
}

export function readBaseline() {
  return existsSync(BASELINE) ? JSON.parse(readFileSync(BASELINE, 'utf8')) : {};
}

/**
 * Porovná chyby s baseline.
 * @returns {{grown: string[], stale: string[], improved: string[], counts: Record<string, number>}}
 *   grown = soubory s víc chybami než povoleno (vč. výpisu), stale = v baseline,
 *   ale soubor neexistuje, improved = méně chyb než povoleno (jde snížit).
 */
export function compare(errs, baseline = readBaseline()) {
  const counts = {};
  for (const e of errs) counts[e.file] = (counts[e.file] || 0) + 1;
  const grown = [], improved = [], stale = [];
  for (const [file, n] of Object.entries(counts)) {
    const allowed = baseline[file] || 0;
    if (n > allowed) {
      const list = errs.filter((e) => e.file === file).map((e) => `    ${e.file}:${e.line}:${e.col} ${e.code} ${e.msg}`);
      grown.push(`${file}: ${n} chyb (povoleno ${allowed})\n${list.join('\n')}`);
    }
  }
  for (const [file, allowed] of Object.entries(baseline)) {
    if (!existsSync(join(ROOT, file))) stale.push(file);
    else if ((counts[file] || 0) < allowed) improved.push(`${file}: ${counts[file] || 0} (povoleno ${allowed})`);
  }
  return { grown, stale, improved, counts };
}

function main() {
  const errs = runTsc();
  let base = readBaseline();
  if (process.argv.includes('--update')) {
    const { counts } = compare(errs, base);
    // Jen snižovat: nové chyby se do baseline nepřidávají, ty se opravují.
    const next = {};
    for (const [file, allowed] of Object.entries(base)) {
      const n = Math.min(allowed, counts[file] || 0);
      if (n > 0 && existsSync(join(ROOT, file))) next[file] = n;
    }
    // --init: jen při zavedení (zapíše VŠECHNY současné chyby jako povolené)
    if (process.argv.includes('--init')) Object.assign(next, counts);
    base = Object.fromEntries(Object.entries(next).sort(([a], [b]) => a.localeCompare(b)));
    writeFileSync(BASELINE, JSON.stringify(base, null, 2) + '\n');
    console.log(`✓ baseline: ${Object.keys(base).length} souborů, ${Object.values(base).reduce((s, n) => s + n, 0)} povolených hlášek`);
  }
  const { grown, stale, improved, counts } = compare(errs, base);
  if (grown.length || stale.length) {
    console.error('✗ Typová kontrola: nové chyby\n');
    grown.forEach((g) => console.error(g + '\n'));
    stale.forEach((s) => console.error(`  ${s}: v baseline, ale soubor neexistuje → npm run typecheck -- --update`));
    process.exit(1);
  }
  console.log(`✓ Typová kontrola: bez nových chyb (${errs.length} starých v ${Object.keys(counts).length} souborech)`);
  if (improved.length && !process.argv.includes('--update')) {
    console.log('  Méně chyb než v baseline — sniž ji: npm run typecheck -- --update');
    improved.forEach((s) => console.log('    ' + s));
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) main();
