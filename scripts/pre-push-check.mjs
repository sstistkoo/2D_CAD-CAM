#!/usr/bin/env node
// Kontrola před pushem (volá ji .githooks/pre-push; zapíná `npm install` přes "prepare").
//
// 1. Mění-li pushované commity soubory aplikace (to, co cachuje Service Worker),
//    musí měnit i sw.js — jinak si PWA (mobil, offline) dál drží starou cache
//    a změnu nikdo neuvidí. Náprava: `npm run sw` a commitnout sw.js.
// 2. Seznam ASSETS v commitnutém sw.js musí odpovídat commitnutým souborům —
//    chybějící soubor = nefunguje offline; soubor navíc = 404 a `cache.addAll`
//    shodí instalaci celého Service Workeru.
// 3. ESLint (jen chyby, s cache — pár sekund).
// 4. Typová kontrola výpočetního jádra (scripts/typecheck.mjs, s cache ~5 s).
//
// Obejít výjimečně: `git push --no-verify`.

import { execFileSync, spawnSync } from 'child_process';
import { readFileSync } from 'fs';
import { isAssetPath, readSwAssets } from './generate-sw-assets.js';

const ZERO = /^0+$/;
const git = (...args) => execFileSync('git', args, { encoding: 'utf-8', maxBuffer: 64 * 1024 * 1024 });

// stdin hooku: "<local ref> <local sha> <remote ref> <remote sha>" na řádek
let input = '';
try { input = readFileSync(0, 'utf-8'); } catch { /* bez stdin = nic k pushi */ }
const localShas = input.split('\n').map((l) => l.trim().split(/\s+/)[1]).filter((sha) => sha && !ZERO.test(sha));

const errors = [];

for (const sha of localShas) {
  // Commity, které ještě nejsou na žádném remote (funguje i pro novou větev).
  const changed = new Set(
    git('log', '--name-only', '--format=', sha, '--not', '--remotes').split('\n').map((s) => s.trim()).filter(Boolean)
  );
  if (changed.size === 0) continue;

  const changedAssets = [...changed].filter((f) => f !== 'sw.js' && isAssetPath(f));
  if (changedAssets.length && !changed.has('sw.js')) {
    errors.push(
      `Změněné soubory aplikace bez zvednutí verze sw.js (PWA by změnu neviděla):\n` +
      changedAssets.slice(0, 10).map((f) => `    ${f}`).join('\n') +
      (changedAssets.length > 10 ? `\n    … a dalších ${changedAssets.length - 10}` : '') +
      `\n  → npm run sw  a commitnout sw.js`
    );
  }

  const tree = git('ls-tree', '-r', '--name-only', sha).split('\n').filter(Boolean);
  if (tree.includes('sw.js')) {
    const expected = ['./', ...tree.filter(isAssetPath).map((f) => './' + f)];
    const current = readSwAssets(git('show', `${sha}:sw.js`));
    if (!current) {
      errors.push('V sw.js chybí blok ASSETS.');
    } else {
      const missing = expected.filter((f) => !current.includes(f));
      const extra = current.filter((f) => !expected.includes(f));
      if (missing.length || extra.length) {
        errors.push(
          'Seznam ASSETS v commitnutém sw.js nesouhlasí se soubory v commitu:\n' +
          missing.map((f) => `    chybí: ${f}`).concat(extra.map((f) => `    navíc (není v commitu → 404): ${f}`)).join('\n') +
          '\n  → npm run sw  a commitnout sw.js (u „navíc" nejdřív commitnout nebo smazat ten soubor)'
        );
      }
    }
  }
}

if (localShas.length) {
  const lint = spawnSync('npm run lint --silent', { stdio: 'inherit', shell: true });
  if (lint.status !== 0) errors.push('ESLint hlásí chyby (npm run lint).');
  const tc = spawnSync('npm run typecheck --silent', { stdio: 'inherit', shell: true });
  if (tc.status !== 0) errors.push('Typová kontrola hlásí nové chyby (npm run typecheck).');
}

if (errors.length) {
  console.error('\n✗ pre-push: push zastaven\n');
  errors.forEach((e) => console.error('  ' + e + '\n'));
  console.error('  (výjimečně obejít: git push --no-verify)\n');
  process.exit(1);
}
if (localShas.length) console.log('✓ pre-push: sw.js, ESLint a typová kontrola v pořádku');
