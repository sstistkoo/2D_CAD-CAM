// Komprese Hershey JSONů.
// Vstup: { name, monospace, chars: [{ d: "M9,1 L1,22 M9,1 L17,22", o: 9 }, ...] }
// Výstup: { name, monospace, chars: [[9, "9,1;1,22|9,1;17,22"], ...] }
//
// Pravidla komprese d stringu:
//   - 'M' prefix u prvního tahu se vyhodí; další tahy se oddělí '|'
//   - 'L' se vyhodí (lineTo je default)
//   - mezery mezi body se nahradí ';'
//   - struktura: tah1pt1;tah1pt2;tah1pt3|tah2pt1;tah2pt2|...
//
// Parser hersheyFont.js zná OBA formáty (zpětně kompatibilní).

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const FONTS = ['futural', 'futuram', 'timesr', 'scripts'];

function compressD(d) {
  if (!d) return '';
  const tokens = d.split(/\s+/).filter(t => t.length > 0);
  const strokes = []; // pole stringů typu "x1,y1;x2,y2;..."
  let current = null;
  for (const tok of tokens) {
    const first = tok[0];
    const coords = (first === 'M' || first === 'L') ? tok.slice(1) : tok;
    if (first === 'M' || current === null) {
      current = [];
      strokes.push(current);
    }
    current.push(coords);
  }
  return strokes.map(s => s.join(';')).join('|');
}

// Idempotentní čtení glyphu – přijme objekt {d, o} i tuple [o, d].
function readGlyph(g) {
  if (Array.isArray(g)) return { o: g[0] || 0, d: g[1] || '' };
  return { o: g.o || 0, d: g.d || '' };
}

function compressFont(fontJson) {
  // Vyhodíme `monospace` (nikde se nepoužívá) a zachováme jen name + chars.
  return {
    name: fontJson.name,
    chars: fontJson.chars.map(c => {
      const { o, d } = readGlyph(c);
      // Pokud d je už komprimované (obsahuje '|' nebo ';' bez M/L), nech tak.
      const alreadyCompact = (d.indexOf('|') >= 0 || d.indexOf(';') >= 0) && d.indexOf('M') < 0;
      return [o, alreadyCompact ? d : compressD(d)];
    }),
  };
}

let totalBefore = 0, totalAfter = 0;
for (const name of FONTS) {
  const path = resolve(`js/lib/hershey/${name}.json`);
  const src = readFileSync(path, 'utf8');
  const data = JSON.parse(src);
  const out = compressFont(data);
  const outStr = JSON.stringify(out);
  writeFileSync(path, outStr);
  const before = src.length;
  const after = outStr.length;
  totalBefore += before;
  totalAfter += after;
  const pct = ((1 - after / before) * 100).toFixed(1);
  console.log(`${name}: ${before} → ${after} B  (-${pct}%)`);
}
const totalPct = ((1 - totalAfter / totalBefore) * 100).toFixed(1);
console.log(`────────────────────────`);
console.log(`Total: ${totalBefore} → ${totalAfter} B  (-${totalPct}%)`);
