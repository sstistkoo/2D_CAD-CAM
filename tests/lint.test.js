// ESLint jako součást testů: CHYBY (neexistující proměnná, zdvojený klíč,
// přepsaná konstanta…) shodí test:cad dřív, než se na ně narazí klikáním.
// Pravidla a co je jen varování: eslint.config.js.
// Spouští se jako příkaz (ne přes `new ESLint()`): jen CLI si ukládá cache
// (node_modules/.cache/eslint) — opakovaný běh pak kontroluje jen změněné
// soubory (~4 s místo ~11 s).
import { describe, it, expect } from 'vitest';
import { ESLint } from 'eslint';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join, relative } from 'path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function lintErrors() {
  const args = [join(root, 'node_modules/eslint/bin/eslint.js'), '.', '--quiet', '-f', 'json',
    '--cache', '--cache-location', join(root, 'node_modules/.cache/eslint/')];
  let out;
  try {
    out = execFileSync(process.execPath, args, { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  } catch (e) {
    if (!e.stdout) throw e;          // ESLint sám spadl (konfigurace…), ne nález
    out = e.stdout;                  // exit 1 = našel chyby, výsledek je ve stdout
  }
  return JSON.parse(out).flatMap(r => r.messages
    .filter(m => m.severity === 2)
    .map(m => `${relative(root, r.filePath)}:${m.line}:${m.column}  ${m.message}  (${m.ruleId})`));
}

describe('ESLint', () => {
  it('kód nemá chyby (varování nevadí)', () => {
    const errors = lintErrors();
    expect(errors, `ESLint našel chyby:\n${errors.join('\n')}`).toEqual([]);
  }, 180_000);

  it('opravdu chytí neexistující proměnnou (pojistka, že hlídač běží)', async () => {
    const eslint = new ESLint({ cwd: root });
    const [r] = await eslint.lintText('export function f() { return zapomenutaPromenna + 1; }\n', { filePath: join(root, 'js/_lint_probe.js') });
    expect(r.messages.map(m => m.ruleId)).toContain('no-undef');
  });
});
