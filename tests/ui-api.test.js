// @vitest-environment happy-dom
// ui.js — veřejné rozhraní a kód, který běží při načtení. Psáno PŘED
// rozdělením ui.js do js/ui/*.js (docs/plan-refaktoringu-ui.md, Fáze 0) jako
// charakterizace: snímky jsou stav kódu před přesunem a po něm se nesmí
// změnit. ui.js zůstává rozcestníkem — 35 souborů ho importuje a 12 testů
// mockuje `../js/ui.js` továrnou, takže seznam exportů musí zůstat stejný
// a kód zvenku nesmí sahat do js/ui/* napřímo.
//
// Pořadí listenerů: moduly v js/ui/ nesmí věšet listenery při importu
// (rozcestník vyhodnotí importy dřív než svoje tělo → změnilo by se pořadí).
// Listenery se balí do `initXxx()` a ui.js je volá na původním místě —
// snímek níž to ověřuje (původ 'ui' = js/ui.js i js/ui/*).
//
// Snímek přepsat (`npx vitest run tests/ui-api.test.js -u`) JEN když je
// změna záměrná (nové tlačítko v index.html, nový listener) — ne při stěhování.
import { describe, it, expect, beforeAll } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative, resolve, dirname } from 'path';
import { parse } from '@babel/parser';
import { importUiRecorded } from './helpers/uiDom.mjs';

const REPO = join(import.meta.dirname, '..');
const JS = join(REPO, 'js');

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (name.endsWith('.js')) out.push(p);
  }
  return out;
}
const rel = (p) => relative(REPO, p).replace(/\\/g, '/');

/** Všechny importy souboru: [{ spec, names|null }] (null = dynamický / celý modul). */
function importsOf(src) {
  const out = [];
  for (const m of src.matchAll(/import\s*\{([^}]*)\}\s*from\s*['"]([^'"]+)['"]/g)) {
    const names = m[1].split(',').map(s => s.trim().split(/\s+as\s+/)[0]).filter(Boolean);
    out.push({ spec: m[2], names });
  }
  for (const m of src.matchAll(/(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g)) out.push({ spec: m[1], names: null });
  return out;
}

let ui, effects;
beforeAll(async () => {
  ({ ui, effects } = await importUiRecorded());
});

describe('ui.js — veřejné rozhraní', () => {
  it('exportuje stejná jména (všechno funkce)', () => {
    const names = Object.keys(ui).sort();
    expect(names.every(n => typeof ui[n] === 'function')).toBe(true);
    expect(names).toMatchInlineSnapshot(`
      [
        "activateFilletChamfer",
        "applyTheme",
        "checkFirstRunHelp",
        "clearNullPoint",
        "cycleDimsMode",
        "deleteObjectsByIndices",
        "getCalcClipboardValue",
        "hideHelp",
        "openCalculator",
        "persistSettings",
        "refreshToolbarActive",
        "resetHint",
        "setCalcClipboardValue",
        "setHint",
        "setTool",
        "showAngleSnapDialog",
        "showGridSizeDialog",
        "showHelp",
        "toggleAngleSnap",
        "toggleCoordMode",
        "toggleHelp",
        "toggleMachineType",
        "togglePanel",
        "toggleSnapGrid",
        "toggleXDisplay",
        "updateAngleSnapBtn",
        "updateCoordModeBtn",
        "updateDimsBtn",
        "updateIntersectionList",
        "updateLayerList",
        "updateMachineTypeBtn",
        "updateNullPointUI",
        "updateObjectList",
        "updateProperties",
        "updateSnapGridBtn",
        "updateSnapPtsBtn",
        "updateStatusProject",
        "updateXDisplayBtn",
      ]
    `);
  });

  it('všechno, co si js/ importuje z ui.js (i dynamicky), ui.js exportuje', () => {
    const missing = [];
    for (const file of walk(JS)) {
      const src = readFileSync(file, 'utf8');
      const isUi = (spec) => resolve(dirname(file), spec) === join(JS, 'ui.js');
      for (const { spec, names } of importsOf(src)) {
        if (!isUi(spec) || !names) continue;
        for (const n of names) if (!(n in ui)) missing.push(`${rel(file)}: ${n}`);
      }
      // dynamický import ui.js → .then(m => m.openCalculator()) — camEditor, cncEditor, camSimulator, tolerance
      for (const m of src.matchAll(/import\(\s*['"]([^'"]+)['"]\s*\)\.then\(\s*(?:function\s*)?\(?\s*(\w+)\s*\)?\s*(?:=>)?\s*\{?\s*\2\.(\w+)/g)) {
        if (isUi(m[1]) && !(m[3] in ui)) missing.push(`${rel(file)}: ${m[3]} (dynamicky)`);
      }
    }
    expect(missing).toEqual([]);
  });
});

describe('ui.js — kód při načtení', () => {
  it('klíče bridge, které ui nastaví (v pořadí)', () => {
    expect(effects.bridgeKeys).toMatchInlineSnapshot(`
      [
        "updateProperties",
        "updateObjectList",
        "updateIntersectionList",
        "updateLayerList",
        "renderAll",
        "resetHint",
        "setTool",
        "applyTheme",
        "openFillColorPicker",
      ]
    `);
  });

  it('pořadí listenerů při načtení (celý graf importu ui.js)', () => {
    expect(effects.listeners).toMatchInlineSnapshot(`
      [
        "js/canvas.js document click capture",
        "js/canvas.js document touchend capture",
        "js/canvas.js document keydown capture",
        "js/canvas.js window resize",
        "ui #sidebar focus capture",
        "ui #btnAddLayer click",
        "ui #btnDelLayer click",
        "ui #btnAllowance click",
        "ui button[data-tool=select] click",
        "ui button[data-tool=dimension] click",
        "ui #btnLineStyle click",
        "ui button[data-tool=point] click",
        "ui button[data-tool=line] click",
        "ui button[data-tool=polyline] click",
        "ui button[data-tool=circle] click",
        "ui button[data-tool=rect] click",
        "ui button[data-tool=tangent] click",
        "ui button[data-tool=filletChamfer] click",
        "ui button[data-tool=fill] click",
        "ui button[data-tool=trim] click",
        "ui button[data-tool=extend] click",
        "ui button[data-tool=snapPoint] click",
        "ui #btnRotate click",
        "ui button[data-tool=offset] click",
        "ui button[data-tool=move] click",
        "ui button[data-tool=copyPlace] click",
        "ui button[data-tool=parallel] click",
        "ui button[data-tool=horizontal] click",
        "ui button[data-tool=perp] click",
        "ui button[data-tool=mirror] click",
        "ui button[data-tool=centerMark] click",
        "ui button[data-tool=break] click",
        "ui button[data-tool=join] click",
        "ui button[data-tool=pencil] click",
        "ui button[data-tool=profileTrace] click",
        "ui button[data-tool=arc] click",
        "ui #btnLinearArray click",
        "ui #btnCircularArray click",
        "ui button[data-tool=faceHole] click",
        "ui button[data-tool=text] click",
        "ui button[data-tool=scale] click",
        "ui button[data-tool=gear] click",
        "ui button[data-tool=gearpair] click",
        "ui button[data-tool=slot] click",
        "ui button[data-tool=polygon] click",
        "ui button[data-tool=star] click",
        "ui button[data-tool=chainDimension] click",
        "ui button[data-tool=groove] click",
        "ui button[data-tool=thread] click",
        "ui button[data-tool=boolean] click",
        "ui button[data-tool=anchor] click",
        "ui #btnDeleteDims click",
        "ui #btnAutoDetect click",
        "ui document click",
        "ui document contextmenu",
        "ui #btnSetRef click",
        "ui #btnClearNullPoint click",
        "ui #btnUndo click",
        "ui #btnRedo click",
        "ui #btnClearAll click",
        "ui #btnOpenCalc click",
        "ui #canvasCalcBtn mousedown",
        "ui #canvasCalcBtn click",
        "ui document focusin",
        "ui #canvasClipBtn mousedown",
        "ui #canvasClipBtn click",
        "ui #btnOpenTrig click",
        "ui #btnOpenCutting click",
        "ui #btnOpenTaper click",
        "ui #btnOpenThread click",
        "ui #btnOpenConvert click",
        "ui #btnOpenWeight click",
        "ui #btnOpenTolerance click",
        "ui #btnOpenRoughness click",
        "ui #btnOpenDrill click",
        "ui #btnOpenNoseRadius click",
        "ui #btnOpenBoltCircle click",
        "ui #btnOpenWireMeasure click",
        "ui #btnOpenCorner click",
        "ui #btnOpenInserts click",
        "ui #btnOpenSinumerik click",
        "ui #btnOpenFanuc click",
        "ui #btnOpenHeidenhain click",
        "ui #desktopCncEditor click",
        "ui #mobileCncEditor click",
        "ui #btnNumInput click",
        "ui #desktopNumInput click",
        "ui #btnOpenCam click",
        "ui #btnOpenAI click",
        "ui #btnOpenNotes click",
        "ui #helpCloseBtn click",
        "js/dialogFactory.js #helpOverlay pointerdown",
        "js/dialogFactory.js #helpOverlay click",
        "ui #btnHelp click",
        "ui #mobileSettings click",
        "ui #desktopSettings click",
      ]
    `);
  });

  it('MutationObserver a změny DOM z index.html při načtení', () => {
    expect(effects.observers).toMatchInlineSnapshot(`
      [
        "ui body {"childList":true}",
      ]
    `);
    expect(effects.domChanges).toMatchInlineSnapshot(`
      [
        "#canvasClipBtn: aria-label=Schránka kalkulačky id=canvasClipBtn style=display: none; title=Schránka kalkulačky (prázdná) "—"",
        "#btnLineStyle: class=tool-btn data-tool=constr id=btnLineStyle title=Konstrukční – Nekonečná pomocná čára (2 body) · pomocná čára (mimo konturu a CAM) · kreslení kontury
      Klik otevře výběr typu čáry a barvy.",
        "#btnLineStyle>span:2: class=tool-btn-label "Ko Kon"",
      ]
    `);
  });
});

describe('ui.js — stráže rozdělení', () => {
  // Pravidlo 4 plánu: zvenku jen přes rozcestník (jinak by mock ../js/ui.js
  // v testech nezabral na modul, který by se načetl jinou cestou).
  it('nic mimo js/ui.js a js/ui/ neimportuje js/ui/*', () => {
    const bad = [];
    for (const file of walk(JS)) {
      const r = rel(file);
      if (r === 'js/ui.js' || r.startsWith('js/ui/')) continue;
      for (const { spec } of importsOf(readFileSync(file, 'utf8'))) {
        if (!spec.startsWith('.')) continue;
        const target = rel(resolve(dirname(file), spec));
        if (target.startsWith('js/ui/')) bad.push(`${r} → ${spec}`);
      }
    }
    expect([...new Set(bad)]).toEqual([]);
  });

  // Pravidlo 5 plánu: moduly v js/ui/ nemají kód při načtení — na nejvyšší
  // úrovni jen importy, deklarace funkcí a proměnné bez volání.
  it('moduly v js/ui/ nemají kód při načtení', () => {
    let files = [];
    try { files = walk(join(JS, 'ui')); } catch { /* složka zatím není */ }
    const bad = [];
    const SIDE = /^(CallExpression|NewExpression|AssignmentExpression|UpdateExpression|AwaitExpression|TaggedTemplateExpression|YieldExpression)$/;
    const hasSideEffect = (node) => {
      if (!node || typeof node.type !== 'string') return false;
      if (/Function|ArrowFunction|Class/.test(node.type)) return false;   // tělo běží až při volání
      if (SIDE.test(node.type)) return true;
      for (const [k, v] of Object.entries(node)) {
        if (k === 'loc' || k === 'start' || k === 'end') continue;
        if (Array.isArray(v) ? v.some(hasSideEffect) : (v && typeof v === 'object' && hasSideEffect(v))) return true;
      }
      return false;
    };
    for (const file of files) {
      const ast = parse(readFileSync(file, 'utf8'), { sourceType: 'module' });
      for (let n of ast.program.body) {
        if (n.type === 'ExportNamedDeclaration' || n.type === 'ExportDefaultDeclaration') {
          if (!n.declaration) continue;   // export { a, b } / re-export
          n = n.declaration;
        }
        if (n.type === 'ImportDeclaration' || n.type === 'FunctionDeclaration' || n.type === 'ClassDeclaration') continue;
        if (n.type === 'VariableDeclaration' && !n.declarations.some(d => hasSideEffect(d.init))) continue;
        bad.push(`${rel(file)}:${n.loc.start.line} ${n.type}`);
      }
    }
    expect(bad, 'listenery a volání zabal do export function initXxx() a zavolej ji z ui.js na původním místě').toEqual([]);
  });
});
