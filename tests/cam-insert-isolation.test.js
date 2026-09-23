// ODDĚLENÍ PLÁTKŮ — hlídání, aby zásah pro jeden plátek nesahal na jiný.
//
// Uživatel 23. 9. 2026: *„plátky by měly mít svůj soubor — jestli oprava
// pohne nebo upraví i polygonální plátek, refaktoruj to, aby to nemělo nic
// společného"* a *„udělej kontrolu, jestli opravdu už nezasahuje žádný plátek
// ani žádná operace do jiných"*. Stalo se to letos třikrát (27. 8., 9. 9.,
// 23. 9. 2026) — pokaždé proto, že rozhodnutí o jednom tvaru žilo ve
// sdíleném kódu. Pravidla: docs/cam-tvar-platku-v-generatoru.md.
//
// Tři kontroly:
//  1. Každý plátek definuje STEJNOU sadu klíčů. Nový klíč tedy nejde přidat
//     jen jednomu plátku, aby ostatní potichu zdědily chování sdíleného kódu.
//  2. Kód drah se neptá na `toolShape` (jen UI a rozcestník `inserts/`).
//  3. Parametry tvaru čte sdílený kód jen v souborech na seznamu níž, každý
//     za klíčem plátku, který dané čtení zapíná jen jednomu tvaru. Kdo přidá
//     nové čtení, musí ho sem zapsat i s důvodem — nebo z něj udělat klíč.
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';
import { getInsert } from '../js/calculators/cam/inserts/index.js';

const ROOT = join(__dirname, '..');
const CAM = join(ROOT, 'js', 'calculators', 'cam');
const SHAPES = ['round', 'polygon', 'parting', 'threading'];

// UI (náhled, přepínač, popisky) a výchozí hodnoty — s drahami nesouvisí.
const UI_FILES = new Set([
  'insertPreview.js', 'toolSlotPreview.js', 'camToolPicker.js', 'camDefaults.js',
]);

// Soubor → čím je čtení parametru tvaru chráněné (klíč plátku).
const SHAPE_PARAM_READERS = {
  'calculatePipeline.js': 'jen text hlášky o úsecích hlídání hran (vznikají jen s hasFlankGeometry)',
  'contourBuild.js': 'hasFlankGeometry (getToolClearanceRange)',
  'materialRemoval.js': 'faceBodyZFromWidth',
  'ops/face/insertGuard.js': 'hasFlankGeometry',
  'ops/face/layerDepth.js': 'hasFlankGeometry',
  'ops/face/regionRunOut.js': 'tiltedFlank || cutsFullWidth (faceRunOut v roughFace.js)',
  'ops/roughFace.js': 'hasFlankGeometry',
  'ops/finish.js': 'finishAlongEnvelope',
  'ops/long/insertFlankGuard.js': 'hasFlankGeometry (hlídá volající v roughLong.js)',
};

const listJs = (dir) => readdirSync(dir).flatMap((n) => {
  const p = join(dir, n);
  if (statSync(p).isDirectory()) return listJs(p);
  return n.endsWith('.js') ? [p] : [];
});
// Kód bez komentářů — pravidla se týkají kódu, ne vysvětlivek.
const codeOf = (p) => readFileSync(p, 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .split(/\r?\n/).map((l) => l.replace(/(^|[^:'"`])\/\/.*$/, '$1')).join('\n');
const camFiles = listJs(CAM)
  .map((p) => relative(CAM, p).split('\\').join('/'))
  .filter((r) => !r.startsWith('inserts/') && !UI_FILES.has(r));

describe('Oddělení plátků', () => {
  it('každý plátek definuje stejnou sadu klíčů', () => {
    const variants = [{}, { toolAngle: -5, toolTipAngle: 80, toolLength: 4, toolRadius: 10 }];
    for (const v of variants) {
      const ref = Object.keys(getInsert({ toolShape: 'round', ...v })).sort();
      for (const s of SHAPES) {
        expect(Object.keys(getInsert({ toolShape: s, ...v })).sort(), `klíče plátku ${s}`).toEqual(ref);
      }
    }
  });

  it('kód drah se neptá na toolShape (jen přes getInsert)', () => {
    const offenders = camFiles.filter((r) => /\btoolShape\b/.test(codeOf(join(CAM, r))));
    expect(offenders).toEqual([]);
  });

  it('parametry tvaru se čtou jen na chráněných místech', () => {
    const re = /\b(?:prms|params|p)\.(toolAngle|toolTipAngle|toolClearanceAngle|toolLength)\b/;
    const readers = camFiles.filter((r) => re.test(codeOf(join(CAM, r)))).sort();
    expect(readers).toEqual(Object.keys(SHAPE_PARAM_READERS).sort());
  });
});

describe('Oddělení operací', () => {
  // Podélné a čelní hrubování si navzájem moduly neimportují — sdílejí jen
  // obecnou geometrii (camMath, shared.js) a emisi.
  it('ops/long a ops/face se navzájem neimportují', () => {
    const imp = (r) => (codeOf(join(CAM, r)).match(/from\s+['"][^'"]+['"]/g) || []).join('\n');
    const longSide = camFiles.filter((r) => r.startsWith('ops/long/') || r === 'ops/roughLong.js');
    const faceSide = camFiles.filter((r) => r.startsWith('ops/face/') || r === 'ops/roughFace.js');
    for (const r of longSide) expect(imp(r), r).not.toMatch(/face\/|roughFace/);
    for (const r of faceSide) expect(imp(r), r).not.toMatch(/long\/|roughLong/);
  });

  it('na druh operace se ptá jen rozcestník a model úběru', () => {
    const readers = camFiles.filter((r) => /\broughingStrategy\s*[!=]==|\(prms\.roughingStrategy/.test(codeOf(join(CAM, r)))).sort();
    // calculatePipeline.js — rozcestník operací; materialRemoval.js — tělo
    // upichováku v modelu úběru jen při čelním hrubování.
    expect(readers).toEqual(['materialRemoval.js']);
  });
});
