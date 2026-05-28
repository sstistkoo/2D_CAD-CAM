#!/usr/bin/env node
// ╔══════════════════════════════════════════════════════════════╗
// ║  SKICA – Generátor asset listu pro Service Worker           ║
// ║  Skenuje projekt a aktualizuje ASSETS pole v sw.js          ║
// ╚══════════════════════════════════════════════════════════════╝

import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import { join, relative, posix } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const ROOT = join(__dirname, '..');
const SW_PATH = join(ROOT, 'sw.js');

// Rozšíření souborů, které se mají cachovat
const EXTENSIONS = new Set(['.html', '.css', '.js', '.json', '.svg', '.png', '.webp', '.ico']);

// Adresáře/soubory, které se ignorují
const IGNORE = new Set(['node_modules', 'tests', 'scripts', '.git', '.vscode', 'test.dxf', 'vitest.config.js', 'package.json', 'package-lock.json', 'skica.code-workspace', 'sw.js']);

function collectFiles(dir, base = ROOT) {
  const entries = readdirSync(dir);
  let files = [];
  for (const entry of entries) {
    if (IGNORE.has(entry)) continue;
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

// Hlavní logika
const files = sortAssets(collectFiles(ROOT));
const assets = ['./', ...files];

// Přečíst sw.js a nahradit ASSETS pole
const swContent = readFileSync(SW_PATH, 'utf-8');

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
