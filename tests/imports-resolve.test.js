// Každý relativní import (statický i `import('…')`) musí vést na existující
// soubor — PŘESNĚ podle velikosti písmen. Windows velikost písmen toleruje,
// GitHub Pages / Linux (a GitHub Actions) ne. Dynamický `import()` se navíc
// načte až po kliknutí, takže rozbitou cestu jinak nic neodhalí: 13. 10. 2026
// tak našlo `ui.js` → '../dialogs/textDialog.js' (tlačítko „📝 Otevřít editor
// textu" nikdy nefungovalo; správně './dialogs/…').
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join, resolve, relative, sep } from 'path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const IMPORT_RE = /(?:import|export)[^'"`;]*?from\s*['"](\.{1,2}\/[^'"]+)['"]|import\(\s*['"](\.{1,2}\/[^'"]+)['"]\s*\)|import\s+['"](\.{1,2}\/[^'"]+)['"]/g;

const dirCache = new Map();
function existsExactCase(abs) {
  let cur = root;
  for (const seg of relative(root, abs).split(sep)) {
    if (seg === '..') return false;               // mimo repo = rozbitá cesta
    if (!dirCache.has(cur)) {
      let ents = null;
      try { ents = new Set(readdirSync(cur)); } catch { /* není složka */ }
      dirCache.set(cur, ents);
    }
    const ents = dirCache.get(cur);
    if (!ents || !ents.has(seg)) return false;
    cur = join(cur, seg);
  }
  return true;
}

describe('importy', () => {
  it('všechny relativní importy vedou na existující soubor (s přesnou velikostí písmen)', () => {
    const files = execSync('git ls-files -- "*.js" "*.mjs"', { cwd: root, encoding: 'utf8' })
      .split('\n').filter(f => f && !f.startsWith('lib/') && !f.startsWith('js/lib/'));
    const bad = [];
    for (const f of files) {
      const src = readFileSync(join(root, f), 'utf8');
      for (const m of src.matchAll(IMPORT_RE)) {
        const spec = m[1] || m[2] || m[3];
        if (!existsExactCase(resolve(root, dirname(f), spec))) bad.push(`${f} → ${spec}`);
      }
    }
    expect(bad, `Rozbité importy:\n${bad.join('\n')}`).toEqual([]);
  });
});
