// @vitest-environment happy-dom
// Viditelnost z téže podmínky jako akce (wallPlungeOn + podélné hrubování v calculatePipeline).
import 'fake-indexeddb/auto';
import { it, expect } from 'vitest';
import { installUiDom } from './helpers/uiDom.mjs';
it('zaškrtávátko „Kolmo u strmé stěny": jen kulatá při podélném hrubování (karusel: Čelně po X)', async () => {
  installUiDom();
  const { paramsMachiningHtml } = await import('../js/calculators/cam/sim/paramsMachiningHtml.js');
  const { _defaultCamParams } = await import('../js/calculators/cam/camDefaults.js');
  const html = (p) => paramsMachiningHtml({ S: { params: { ..._defaultCamParams(), ...p }, toolMagazine: [], opParts: [], xLimits: {}, zLimits: {} }, escHTML: s => String(s), escAttr: s => String(s) });
  const has = (p) => /cam-sim-wallplunge/.test(html(p));
  const r = { lathe: has({ toolShape: 'round', roughingStrategy: 'longitudinal' }), karusel: has({ toolShape: 'round', roughingStrategy: 'face', machineStructure: 'carousel' }),
    polygon: has({ toolShape: 'polygon', roughingStrategy: 'longitudinal' }), cikcak: has({ toolShape: 'round', roughingStrategy: 'zigzag' }), celneSoustruh: has({ toolShape: 'round', roughingStrategy: 'face' }) };

  expect(r).toEqual({ lathe: true, karusel: true, polygon: false, cikcak: false, celneSoustruh: false });
});
