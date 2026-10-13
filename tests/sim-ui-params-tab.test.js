// @vitest-environment happy-dom
// Záložka ⚙ Parametry v simulátoru (blok „params tab" → js/calculators/cam/sim/
// paramsTab*.js): co se vykreslí (ovládací prvky každé podzáložky obrábění
// se všemi sekcemi rozbalenými — snapshot) a co přepínače/pole zapíšou do
// stavu. Program je „ručně upravený", aby přepínače nespouštěly generátor
// drah (test nezávisí na CAM). Test prošel na starém kódu před přestěhováním.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { installSimDom, openSim, loadFixture, settle } from './helpers/simUi.mjs';

const CONTOUR = [
  { id: 1, type: 'G0', x: 0, z: 0, r: 0, mode: 'ABS' },
  { id: 2, type: 'G1', x: 40, z: 0, r: 0, mode: 'ABS' },
  { id: 3, type: 'G1', x: 40, z: -62.4, r: 0, mode: 'ABS' },
];
const PROGRAM = ['N10 G0 X100 Z10', 'N20 G1 X40 Z5 F0.2', 'N30 G1 X40 Z-60', 'N40 G0 X100 Z10'].join('\n');
const SUBTABS = ['hrub', 'hot', 'upich', 'zavit', 'vrt', 'vyvrt'];
const SECTIONS = ['machineConfigOpen', 'safetyConfigOpen', 'materialConfigOpen', 'toolConfigOpen', 'machiningConfigOpen'];

let sim;
beforeAll(async () => {
  installSimDom();
  sim = await openSim(loadFixture('cam/part-1.camprog'));
  const { S } = sim;
  Object.assign(S.params, { mode: 'DIAMON', stockMode: 'cylinder', stockDiameter: 66, stockLength: 66, stockFace: 2, partOffZ: null, threadActive: false, drillActive: false, boreActive: false });
  S.contourPoints = structuredClone(CONTOUR);
  S.manualGCode = PROGRAM;
  S.gcodeDirty = true;
  sim.fullUpdate();
});
afterAll(async () => { await sim?.close(); });

const tab = () => sim.root.querySelector('.cam-sim-tab-body') || sim.root;
const showParams = async () => { sim.q('[data-tab="params"]').click(); await settle(5); };
const $ = (sel) => tab().querySelector(sel);
const click = async (sel) => { const el = $(sel); expect(el, sel).not.toBeNull(); el.click(); await settle(5); };
const change = async (sel, value) => { const el = $(sel); expect(el, sel).not.toBeNull(); el.value = String(value); el.dispatchEvent(new Event('change')); await settle(5); };

/** Ovládací prvky záložky jako „klíč=hodnota" (data-*) nebo „#id". */
function controls() {
  const sel = '[data-p],[data-act],[data-struct],[data-ctrl],[data-pmode],[data-rough],[data-side],[data-machtab],[data-tshape],'
    + '[data-mat],[data-drillmode],[data-boresrc],[data-thext],[data-thinfeed],[data-zlim],[data-xlim],input[id],select[id]';
  return [...tab().querySelectorAll(sel)].map(el => {
    const k = Object.keys(el.dataset)[0];
    return k ? `${k}=${el.dataset[k]}` : `#${el.id}`;
  }).join(' ');
}

describe('simulátor — záložka Parametry', () => {
  it('vykreslí stejné ovládací prvky v každé podzáložce (sekce rozbalené)', async () => {
    const { S } = sim;
    for (const k of SECTIONS) S[k] = true;
    const out = {};
    for (const t of SUBTABS) {
      S.machiningSubTab = t;
      await showParams();
      out[t] = controls();
    }
    expect(out).toMatchSnapshot();
  });

  it('sbalení/rozbalení sekcí a přepnutí podzáložky', async () => {
    const { S } = sim;
    for (const k of SECTIONS) S[k] = false;
    S.machiningSubTab = 'hrub';
    await showParams();
    await click('[data-act="machine-config-toggle"]');
    expect(S.machineConfigOpen).toBe(true);
    await click('[data-act="safety-config-toggle"]');
    expect(S.safetyConfigOpen).toBe(true);
    await click('[data-act="machining-config-toggle"]');
    expect(S.machiningConfigOpen).toBe(true);
    await click('[data-machtab="hot"]');
    expect(S.machiningSubTab).toBe('hot');
    await click('[data-machtab="hrub"]');
    expect(S.machiningSubTab).toBe('hrub');
  });

  it('stroj: struktura, řídicí systém (převod programu), programování Ø/R', async () => {
    const { S } = sim;
    S.machineConfigOpen = true;
    await showParams();
    await click('[data-struct="carousel"]');
    expect(S.params.machineStructure).toBe('carousel');
    await click('[data-struct="lathe"]');
    expect(S.params.machineStructure).toBe('lathe');
    const before = S.manualGCode;
    await click('[data-ctrl="fanuc"]');
    expect(S.params.controlSystem).toBe('fanuc');
    expect(S.manualGCode).not.toBe(before);   // program převedený na Fanuc
    await click('[data-ctrl="sinumerik"]');
    expect(S.params.controlSystem).toBe('sinumerik');
    await click('[data-pmode="RADIUS"]');
    expect(S.params.mode).toBe('RADIUS');
    await click('[data-pmode="DIAMON"]');
    expect(S.params.mode).toBe('DIAMON');
  });

  it('pole data-p zapíše číslo do S.params; Bezpečná poloha', async () => {
    const { S } = sim;
    S.safetyConfigOpen = true;
    await showParams();
    await change('[data-p="safeX"]', 123);
    expect(S.params.safeX).toBe(123);
    await change('[data-p="safeZ"]', 7.5);
    expect(S.params.safeZ).toBe(7.5);
  });

  it('hrubování: Podélně/Čelně, Zprava/Zleva, hlídání geometrie', async () => {
    const { S } = sim;
    S.machiningConfigOpen = true; S.machiningSubTab = 'hrub';
    await showParams();
    await click('[data-rough="face"]');
    expect(S.params.roughingStrategy).toBe('face');
    await click('[data-rough="longitudinal"]');
    expect(S.params.roughingStrategy).toBe('longitudinal');
    await click('[data-side="left"]');
    expect(S.params.roughingSide).toBe('left');
    await click('[data-side="right"]');
    expect(S.params.roughingSide).toBe('right');
    const cb = $('#cam-sim-respect-insert');
    const was = S.params.respectInsertGeometry;
    cb.checked = !was; cb.dispatchEvent(new Event('change')); await settle(5);
    expect(S.params.respectInsertGeometry).toBe(!was);
  });

  it('nůž: tvar destičky z tlačítek tvaru', async () => {
    const { S } = sim;
    S.toolConfigOpen = true;
    await showParams();
    const was = S.params.toolShape;
    await click('[data-tshape="round"]');
    expect(S.params.toolShape).toBe('round');
    await click(`[data-tshape="${was === 'round' ? 'polygon' : was}"]`);
    expect(S.params.toolShape).toBe(was === 'round' ? 'polygon' : was);
  });

  it('dokončení, závit (zap/vyp + přísuv), vrtání (zap/vyp + režim)', async () => {
    const { S } = sim;
    S.machiningConfigOpen = true; S.machiningSubTab = 'hrub';
    await showParams();
    const fin = S.params.doFinishing;
    const cb = $('#cam-sim-fin');
    cb.checked = !fin; cb.dispatchEvent(new Event('change')); await settle(5);
    expect(S.params.doFinishing).toBe(!fin);
    cb.checked = fin; cb.dispatchEvent(new Event('change')); await settle(5);

    S.machiningSubTab = 'zavit';
    await showParams();
    await click('[data-act="thread-toggle"]');
    expect([S.params.threadActive, S.params.drillActive, S.params.boreActive]).toEqual([true, false, false]);
    await click('[data-thinfeed="flank"]');
    expect($('[data-thinfeed="flank"]').classList.contains('cam-sim-active')).toBe(true);
    await click('[data-act="thread-toggle"]');
    expect(S.params.threadActive).toBe(false);

    S.machiningSubTab = 'vrt';
    await showParams();
    await click('[data-act="drill-toggle"]');
    expect(S.params.drillActive).toBe(true);
    await click('[data-drillmode="break"]');
    expect($('[data-drillmode="break"]').classList.contains('cam-sim-active')).toBe(true);
    S.params.drillActive = false;
  });

  it('meze: čelisti zapnout/vypnout', async () => {
    const { S } = sim;
    S.safetyConfigOpen = true;
    await showParams();
    const was = !!S.zLimits.chuckActive;
    await click('[data-act="chuck-active"]');
    expect(!!S.zLimits.chuckActive).toBe(!was);
    await click('[data-act="chuck-active"]');
    expect(!!S.zLimits.chuckActive).toBe(was);
  });

  // Poslední — mění skoro celý stav.
  it('🔄 Resetovat vše: po potvrzení výchozí parametry, geometrie stroje/polotovaru zůstane', async () => {
    const { S } = sim;
    S.params.safeX = 321; S.params.mode = 'RADIUS'; S.params.stockDiameter = 77;
    S.guideLines = [{ x1: 1, z1: 2, x2: 3, z2: 4 }];
    await showParams();
    await click('[data-act="reset"]');
    document.querySelector('.cam-confirm-ok').click();
    await settle(20);
    expect(S.params.safeX).not.toBe(321);
    expect([S.params.mode, S.params.stockDiameter]).toEqual(['RADIUS', 77]);
    expect(S.guideLines).toEqual([]);
    expect(S.selectedMaterial).toBe('Ocel 11 373 (S235)');
  });
});
