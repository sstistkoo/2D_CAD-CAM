#!/usr/bin/env node
// ╔══════════════════════════════════════════════════════════════╗
// ║  SKICA – Generátor asset listu pro Service Worker           ║
// ║  Skenuje projekt a aktualizuje ASSETS pole v sw.js          ║
// ╚══════════════════════════════════════════════════════════════╝

import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import { join, relative, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const ROOT = join(__dirname, '..');
const SW_PATH = join(ROOT, 'sw.js');

// Rozšíření souborů, které se mají cachovat
const EXTENSIONS = new Set(['.html', '.css', '.js', '.json', '.svg', '.png', '.webp', '.ico']);

// Adresáře/soubory, které se ignorují
const IGNORE = new Set(['node_modules', 'tests', 'scripts', '.git', '.vscode', '.claude', '.kilo', 'vitest.config.js', 'package.json', 'package-lock.json', 'skica.code-workspace', 'sw.js', 'tsconfig.typecheck.json']);

function collectFiles(dir, base = ROOT) {
  const entries = readdirSync(dir);
  let files = [];
  for (const entry of entries) {
    if (IGNORE.has(entry)) continue;
    // Tečkové soubory a složky do cache NEPATŘÍ: nejsou verzované ani
    // nasazované (GitHub Pages je navíc přes Jekyll vynechává úplně),
    // a `cache.addAll` je ATOMICKÉ — jediný 404 shodí instalaci Service
    // Workeru a s ní celý offline režim. Chytlo se na `.cam-sweep-baseline.json`,
    // což je lokální měřicí soubor, ne asset aplikace.
    if (entry.startsWith('.')) continue;
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      files = files.concat(collectFiles(full, base));
    } else {
      const ext = entry.substring(entry.lastIndexOf('.'));
      if (EXTENSIONS.has(ext)) {
        // Normalizovat na POSIX cesty s ./ prefixem
        const rel = './' + relative(base, full).split('\\').join('/');
        files.push(rel);
      }
    }
  }
  return files;
}

// Seřadit: index.html první, pak manifest, CSS, JS (abecedně), icons
function sortAssets(files) {
  const order = (f) => {
    if (f === './index.html') return 0;
    if (f === './manifest.json') return 1;
    if (f.endsWith('.css')) return 2;
    if (f.startsWith('./js/')) return 3;
    if (f.startsWith('./icons/')) return 5;
    return 4;
  };
  return files.sort((a, b) => order(a) - order(b) || a.localeCompare(b));
}

/**
 * Patří soubor (POSIX cesta relativně ke kořeni, bez './') do cache?
 * Stejná pravidla jako collectFiles — pro kontrolu nad commitnutým stromem (pre-push).
 */
export function isAssetPath(relPath) {
  const parts = relPath.split('/');
  if (parts.some((p) => IGNORE.has(p) || p.startsWith('.'))) return false;
  const name = parts[parts.length - 1];
  return EXTENSIONS.has(name.substring(name.lastIndexOf('.')));
}

/** Seznam assetů, které má Service Worker cachovat (přesně ten, který se zapisuje do sw.js). */
export function listAssets() {
  return ['./', ...sortAssets(collectFiles(ROOT))];
}

/** Seznam assetů, který je TEĎ zapsaný v sw.js (null = blok nenalezen). */
export function readSwAssets(swContent = readFileSync(SW_PATH, 'utf-8')) {
  const m = swContent.match(/const ASSETS = \[\r?\n([\s\S]*?)\r?\n\];/);
  if (!m) return null;
  return [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]);
}

/** --check: jen porovná seznam v sw.js se soubory na disku, nic nezapisuje (pre-push hook). */
function check(swContent, assets) {
  const current = readSwAssets(swContent);
  if (!current) {
    console.error('CHYBA: Nepodařilo se najít ASSETS blok v sw.js');
    process.exit(1);
  }
  const missing = assets.filter((f) => !current.includes(f));
  const extra = current.filter((f) => !assets.includes(f));
  if (missing.length || extra.length) {
    missing.forEach((f) => console.error(`  chybí v sw.js: ${f}`));
    extra.forEach((f) => console.error(`  navíc v sw.js (soubor neexistuje): ${f}`));
    process.exit(1);
  }
  console.log(`✓ sw.js: seznam assetů odpovídá (${assets.length})`);
}

function main() {
  const assets = listAssets();
  const swContent = readFileSync(SW_PATH, 'utf-8');
  if (process.argv.includes('--check')) return check(swContent, assets);

  // Bump cache verze
  const versionMatch = swContent.match(/const CACHE_NAME = 'skica-v(\d+)'/);
  const newVersion = versionMatch ? parseInt(versionMatch[1], 10) + 1 : 1;

  // Sestavit nový ASSETS blok
  const assetsStr = assets.map(f => `  '${f}',`).join('\n');
  const newAssetsBlock = `const CACHE_NAME = 'skica-v${newVersion}';\nconst ASSETS = [\n${assetsStr}\n];`;

  // Nahradit existující CACHE_NAME + ASSETS blok
  const replaced = swContent.replace(
    /const CACHE_NAME = 'skica-v\d+';\r?\nconst ASSETS = \[\r?\n[\s\S]*?\r?\n\];/,
    newAssetsBlock
  );

  if (replaced === swContent) {
    console.error('CHYBA: Nepodařilo se najít ASSETS blok v sw.js');
    process.exit(1);
  }

  writeFileSync(SW_PATH, replaced, 'utf-8');

  console.log(`✓ sw.js aktualizován (v${newVersion}, ${assets.length} assetů)`);
  assets.forEach(f => console.log(`  ${f}`));
}

// Spustit jen při přímém volání (`npm run sw`), ne při importu z hooku.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
