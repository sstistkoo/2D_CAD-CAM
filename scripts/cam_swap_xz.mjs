// ╔══════════════════════════════════════════════════════════════╗
// ║  KARUSEL PO X → PROHOZENÝ .camprog (pro měření pravidel)       ║
// ╚══════════════════════════════════════════════════════════════╝
// Karusel „⟲ Po X jako podélně" počítá v prohozených osách (x' = z,
// z' = x, js/calculators/cam/xzSwap.js) — prohozený svět je obyčejná
// úloha soustruhu se svislým nožem. Tenhle skript uloží projekt v tom
// prohozeném světě (swapState), takže na něj jde pustit stávající
// nástroje beze změny:
//
//   node scripts/cam_swap_xz.mjs soubor.camprog [vystup.camprog]
//   node scripts/cam_rules_check.mjs soubor.swapxz.camprog
//
// Výchozí výstup = vedle vstupu s příponou `.swapxz.camprog`. Projekt
// nemusí mít přepínač zapnutý (skript ho zapne sám), musí to ale být
// karusel a ne závit/vrtání/vyvrtávání/upich (tam se neprohazuje).

import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const { swapsXZ, swapState } = await import(join(ROOT, 'js/calculators/cam/xzSwap.js'));

const [src, dstArg] = process.argv.slice(2);
if (!src) {
  console.error('Použití: node scripts/cam_swap_xz.mjs soubor.camprog [vystup.camprog]');
  process.exit(2);
}
const prog = JSON.parse(readFileSync(src, 'utf8'));
const S = {
  params: { ...prog.params, carouselAlongX: true },
  contourPoints: prog.contourPoints || [],
  stockPoints: prog.stockPoints || [],
  borePoints: prog.borePoints || [],
  guideLines: prog.guideLines || [],
  opParts: [],
  flipX: !!prog.flipX, flipZ: !!prog.flipZ,
  zLimits: prog.zLimits || {}, xLimits: prog.xLimits || {},
  manualGCode: '',
};
if (!swapsXZ(S)) {
  console.error('Projekt se neprohazuje: není karusel, nebo je zapnutý závit/vrtání/vyvrtávání/upich.');
  process.exit(1);
}
const S2 = swapState(S);
const out = {
  ...prog,
  params: S2.params,
  contourPoints: S2.contourPoints,
  stockPoints: S2.stockPoints,
  borePoints: [],
  guideLines: [],
  opParts: [], activePart: 0,
  flipX: S2.flipX, flipZ: S2.flipZ,
  zLimits: S2.zLimits, xLimits: S2.xLimits,
  gcodeDirty: false,
};
const dst = dstArg || src.replace(/\.camprog$/i, '') + '.swapxz.camprog';
writeFileSync(dst, JSON.stringify(out, null, 2));
console.log(`Prohozený projekt (soustruh, ${S2.params.roughingStrategy}) → ${dst}`);
