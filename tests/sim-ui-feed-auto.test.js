// @vitest-environment happy-dom
// Pravý panel CAM, blok posuvů (uživatel 12. 11. 2026): zaškrtávátko „Auto"
// zapne a nastaví všechny úpravy posuvu, pole jsou pak zamčená; volba
// „Nepřejíždět mezi hrby" je vidět jen tam, kde působí (podélně na soustruhu).
import 'fake-indexeddb/auto';
import { it, expect } from 'vitest';
import { installUiDom } from './helpers/uiDom.mjs';

it('Auto posuvů a „Nepřejíždět mezi hrby" v pravém panelu', async () => {
  installUiDom();
  const { paramsMachiningHtml } = await import('../js/calculators/cam/sim/paramsMachiningHtml.js');
  const { _defaultCamParams } = await import('../js/calculators/cam/camDefaults.js');
  const { applyFeedAuto } = await import('../js/calculators/cam/feedAuto.js');
  const html = (p) => paramsMachiningHtml({ S: { params: { ..._defaultCamParams(), ...p }, toolMagazine: [], opParts: [], xLimits: {}, zLimits: {} }, escHTML: s => String(s), escAttr: s => String(s) });
  const dom = (p) => { const d = document.createElement('div'); d.innerHTML = html(p); return d; };

  // Viditelnost „Nepřejíždět mezi hrby": jen podélné hrubování na soustruhu.
  const has = (p) => /cam-sim-humpfirst/.test(html(p));
  expect({
    podelne: has({ toolShape: 'polygon', roughingStrategy: 'longitudinal' }),
    celne: has({ toolShape: 'polygon', roughingStrategy: 'face' }),
    cikcak: has({ toolShape: 'round', roughingStrategy: 'zigzag' }),
    karusel: has({ toolShape: 'polygon', roughingStrategy: 'longitudinal', machineStructure: 'carousel' }),
  }).toEqual({ podelne: true, celne: false, cikcak: false, karusel: false });

  // Auto nastaví a zapne všechny volby.
  const p = applyFeedAuto({ ..._defaultCamParams(), toolShape: 'polygon', roughingStrategy: 'longitudinal', doFinishing: true });
  expect(p).toMatchObject({ feedAuto: true, arcFeedComp: true, feedPlungeOn: true, feedPctPlunge: 50, chipThinOn: true, chipMaxF: 0,
    finRaOn: true, finRa: 1.6, finRaMaxF: 0, feedCornerOn: true, feedPctCorner: 50, humpFirst: true });

  // S Auto jsou zaškrtávátka i pole zamčená, zaškrtávátko Auto ne.
  const d = dom(p);
  expect(d.querySelector('#cam-sim-feedauto').checked).toBe(true);
  expect(d.querySelector('#cam-sim-feedauto').disabled).toBe(false);
  for (const id of ['#cam-sim-arcfeed', '#cam-sim-feedplunge', '#cam-sim-chipthin', '#cam-sim-finra', '#cam-sim-feedcorner', '#cam-sim-humpfirst']) {
    const cb = d.querySelector(id);
    expect(cb, id).toBeTruthy();
    expect(cb.checked, id).toBe(true);
    expect(cb.disabled, id).toBe(true);
  }
  for (const key of ['feedPctPlunge', 'chipMaxF', 'finRa', 'finRaMaxF', 'feedPctCorner']) {
    expect(d.querySelector(`[data-p="${key}"]`).disabled, key).toBe(true);
  }
  // Bez Auto se volby dají měnit.
  const d2 = dom({ ...p, feedAuto: false });
  expect(d2.querySelector('#cam-sim-arcfeed').disabled).toBe(false);
  expect(d2.querySelector('[data-p="feedPctPlunge"]').disabled).toBe(false);
});
