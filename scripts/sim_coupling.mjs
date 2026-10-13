// PROVÁZANOST BLOKŮ camSimulator.js — podklad pro rozdělení souboru
// (docs/plan-rozdeleni-cam-simulatoru.md).
//
// Celý simulátor je jedna funkce `openCamSimulator`; bloky = úseky mezi
// hlavičkami `  // ── NÁZEV ──`. Pro každý blok spočítá, kolik closure
// symbolů z JINÝCH bloků čte (reads), přepisuje (writes — ty se nedají předat
// parametrem, musí do sdíleného objektu) a z kolika bloků se na jeho symboly
// sahá (fanIn). Seřazeno od nejsnáze vyjmutelného.
//
//   node scripts/sim_coupling.mjs                  # tabulka
//   node scripts/sim_coupling.mjs "params tab"     # + seznam symbolů bloku
//   node scripts/sim_coupling.mjs --sync           # co se volá SYNCHRONNĚ při otevření
//
// --sync: příkazy nejvyšší úrovně openCamSimulator (ne deklarace funkcí)
// a přímá volání v nich. Před nahrazením hoisted `function x()` za
// `const { x } = createXxx(ctx)` ověř, že se x (ani nic, co ho volá) nevolá
// synchronně DŘÍV, než proběhne řádek s továrnou — jinak TDZ ReferenceError.
//
// Přibližné: zastínění jmen ve vnořených scopech se nerozlišuje.
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { parse } from '@babel/parser';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = readFileSync(join(root, 'js/calculators/camSimulator.js'), 'utf8');
const lines = src.split(/\r?\n/);
const ast = parse(src, { sourceType: 'module', errorRecovery: true });
const fn = ast.program.body.find(n => n.type === 'ExportNamedDeclaration' && n.declaration?.id?.name === 'openCamSimulator').declaration;
const body = fn.body.body;

const heads = [];
lines.forEach((l, i) => {
  const m = l.match(/^ {2}\/\/ ── (.+?)(?: ─|$)/);
  if (m) heads.push({ line: i + 1, name: m[1].replace(/[─ ]+$/, '').slice(0, 60) });
});
const secOf = (line) => { let s = '(začátek)'; for (const h of heads) if (h.line <= line) s = h.name; return s; };

const decl = new Map();   // jméno → blok, kde je deklarované
for (const st of body) {
  const sec = secOf(st.loc.start.line);
  if (st.type === 'FunctionDeclaration') decl.set(st.id.name, sec);
  else if (st.type === 'VariableDeclaration') for (const d of st.declarations) {
    const add = (p) => {
      if (!p) return;
      if (p.type === 'Identifier') decl.set(p.name, sec);
      else if (p.type === 'ObjectPattern') p.properties.forEach(q => add(q.value || q.argument));
      else if (p.type === 'ArrayPattern') p.elements.forEach(add);
    };
    add(d.id);
  }
}

const stats = new Map();
const S = (sec) => {
  if (!stats.has(sec)) stats.set(sec, { lines: 0, reads: new Set(), writes: new Set(), fanIn: new Set() });
  return stats.get(sec);
};
heads.forEach((h, i) => { S(h.name).lines += (heads[i + 1]?.line ?? fn.loc.end.line) - h.line; });

const SKIP = new Set(['loc', 'start', 'end', 'leadingComments', 'trailingComments', 'innerComments']);
function walk(node, sec, parent, key) {
  if (!node || typeof node.type !== 'string') return;
  if (node.type === 'Identifier') {
    const isProp = parent && (
      ((parent.type === 'MemberExpression' || parent.type === 'OptionalMemberExpression') && key === 'property' && !parent.computed)
      || ((parent.type === 'ObjectProperty' || parent.type === 'ObjectMethod') && key === 'key' && !parent.computed));
    const home = !isProp && decl.get(node.name);
    if (home && home !== sec) {
      const written = (parent.type === 'AssignmentExpression' && key === 'left') || parent.type === 'UpdateExpression';
      (written ? S(sec).writes : S(sec).reads).add(node.name);
      S(home).fanIn.add(sec);
    }
    return;
  }
  for (const k of Object.keys(node)) {
    if (SKIP.has(k)) continue;
    const v = node[k];
    if (Array.isArray(v)) v.forEach(c => walk(c, sec, node, k));
    else if (v && typeof v.type === 'string') walk(v, sec, node, k);
  }
}
for (const st of body) walk(st, secOf(st.loc.start.line), null, null);

const score = (r) => (r.writes * 10 + r.reads + r.fanIn * 3) / r.lines;
const rows = [...stats.entries()].filter(([, v]) => v.lines >= 40)
  .map(([name, v]) => ({ name, lines: v.lines, reads: v.reads.size, writes: v.writes.size, fanIn: v.fanIn.size }))
  .sort((a, b) => score(a) - score(b));
console.table(rows);
console.log(`celkem ${lines.length} ř.`);

if (process.argv[2] === '--sync') {
  const calls = (node, out, inFn) => {
    if (!node || typeof node !== 'object') return out;
    if (Array.isArray(node)) { node.forEach(n => calls(n, out, inFn)); return out; }
    const isFn = /Function/.test(node.type || '');
    if (node.type === 'CallExpression' && !inFn && node.callee.type === 'Identifier') out.add(node.callee.name);
    for (const k of Object.keys(node)) if (!SKIP.has(k)) calls(node[k], out, inFn || isFn);
    return out;
  };
  console.log('\nSynchronní volání při otevření (řádek: funkce):');
  for (const st of body) {
    if (st.type === 'FunctionDeclaration') continue;
    const c = [...calls(st, new Set(), false)];
    if (c.length) console.log(`  ${st.loc.start.line}: ${c.join(', ')}`);
  }
}

const want = process.argv[2];
if (want && want !== '--sync') for (const [name, v] of stats) if (name.startsWith(want)) {
  console.log(`\n${name}\n  čte:  ${[...v.reads].join(', ')}\n  píše: ${[...v.writes].join(', ')}\n  sahají na něj: ${[...v.fanIn].join(' | ')}`);
}
