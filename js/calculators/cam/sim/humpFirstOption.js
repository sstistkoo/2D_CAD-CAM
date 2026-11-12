// ╔══════════════════════════════════════════════════════════════╗
// ║  Volba „Nepřejíždět mezi hrby" — kde působí (UI a ✂ Po úsecích)  ║
// ╚══════════════════════════════════════════════════════════════╝
// Na druh operace se kód drah neptá (tests/cam-insert-isolation.test.js) —
// v cam/ to dělá jen rozcestník calculatePipeline.js (stejná podmínka u
// `stockValleys`). Pořadí kroků staví cam/ops/sections/humpFirst.js.

/** Podélné hrubování na soustruhu — jen tam volba působí. */
export function humpFirstApplies(prms) {
  if (!prms || prms.xzSwapped || prms.machineStructure === 'carousel') return false;
  return (prms.roughingStrategy || 'longitudinal') === 'longitudinal';
}

/** Je volba zapnutá a působí? */
export const humpFirstOn = (prms) => !!prms && prms.humpFirst === true && humpFirstApplies(prms);
