// @vitest-environment happy-dom
// Tlačítka, která otevírají okna jiných modulů: CNC kalkulačky, ✏️ CNC
// editor nad výkresem, VK / číselné zadání, CAM, AI, 📝 poznámky,
// Trigonometrie. Psáno PŘED přesunem z ui.js do js/ui/launchers.js
// (docs/plan-refaktoringu-ui.md, Fáze 1b) jako charakterizace: projde na
// starém kódu a po přesunu musí projít beze změny. Cílové moduly jsou
// mockované (mock platí pro modul, ať ho importuje ui.js nebo js/ui/*).
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { installUiDom } from './helpers/uiDom.mjs';
import { settle } from './helpers/simUi.mjs';

const CALCS = {
  btnOpenCutting: 'openCuttingCalc', btnOpenTaper: 'openTaperCalc', btnOpenThread: 'openThreadCalc',
  btnOpenConvert: 'openConvertCalc', btnOpenWeight: 'openWeightCalc', btnOpenTolerance: 'openToleranceCalc',
  btnOpenRoughness: 'openRoughnessCalc', btnOpenDrill: 'openDrillCalc', btnOpenNoseRadius: 'openNoseRadiusCalc',
  btnOpenBoltCircle: 'openBoltCircleCalc', btnOpenWireMeasure: 'openWireMeasureCalc', btnOpenCorner: 'openCornerCalc',
  btnOpenInserts: 'openInsertCalc', btnOpenSinumerik: 'openSinumerikHub',
};
vi.mock('../js/cnc-calcs.js', async (orig) => {
  const m = await orig();
  const fns = Object.fromEntries(['openCuttingCalc', 'openTaperCalc', 'openThreadCalc', 'openConvertCalc', 'openWeightCalc',
    'openToleranceCalc', 'openRoughnessCalc', 'openDrillCalc', 'openNoseRadiusCalc', 'openBoltCircleCalc',
    'openWireMeasureCalc', 'openCornerCalc', 'openInsertCalc', 'openSinumerikHub', 'openCamSimulator', 'openCncEditor']
    .map(n => [n, vi.fn()]));
  return { ...m, ...fns };
});
vi.mock('../js/dialogs/combinedModal.js', async (orig) => ({ ...(await orig()), showCombinedModal: vi.fn() }));
vi.mock('../js/ai/aiPanel.js', async (orig) => ({ ...(await orig()), openAIPanel: vi.fn() }));

let calcs, combined, ai, bridge, state;
const click = (id) => document.getElementById(id).click();
const BRIDGE_KEYS = ['extendTrigCalc', 'exportCncAsDrawn', 'cncAsDrawnSelection', 'openCamFromDrawing', 'runCncExport'];
let saved;

beforeAll(async () => {
  installUiDom();
  await import('../js/ui.js');
  calcs = await import('../js/cnc-calcs.js');
  combined = await import('../js/dialogs/combinedModal.js');
  ai = await import('../js/ai/aiPanel.js');
  ({ bridge } = await import('../js/bridge.js'));
  ({ state } = await import('../js/state.js'));
});
beforeEach(() => {
  vi.clearAllMocks();
  saved = Object.fromEntries(BRIDGE_KEYS.map(k => [k, bridge[k]]));
});
afterEach(async () => {
  Object.assign(bridge, saved);
  state.objects = [];
  document.querySelectorAll('.calc-overlay').forEach(o => o.remove());
  await settle(5);
});

describe('spouštěcí tlačítka', () => {
  it('CNC kalkulačky: každé tlačítko volá svou funkci (bez argumentů navíc kromě události)', () => {
    for (const [id, fn] of Object.entries(CALCS)) {
      click(id);
      expect(calcs[fn], id).toHaveBeenCalledTimes(1);
      expect(calcs[fn].mock.calls[0][0]).toBeInstanceOf(Event);
    }
  });

  it('Trigonometrie: otevře okno a doplní záložku Obecný (bridge.extendTrigCalc)', async () => {
    bridge.extendTrigCalc = vi.fn(() => {
      expect(document.querySelector('.calc-overlay[data-type="trig"]')).toBeTruthy();   // až po otevření
    });
    click('btnOpenTrig');
    expect(bridge.extendTrigCalc).toHaveBeenCalledTimes(1);
  });

  it('✏️ Editor (desktop i mobil): G-kód výkresu + zvýraznění označených, mobil zavře lištu', () => {
    bridge.exportCncAsDrawn = vi.fn(() => 'G0 X10 Z0');
    bridge.cncAsDrawnSelection = vi.fn(() => [3, 4]);
    click('desktopCncEditor');
    expect(calcs.openCncEditor).toHaveBeenCalledWith('G0 X10 Z0', { drawOnClose: true, highlight: [3, 4] });

    bridge.cncAsDrawnSelection = undefined;
    document.getElementById('topbar').classList.add('mobile-open');
    document.body.classList.add('toolbar-open');
    const onBody = vi.fn();
    document.body.addEventListener('click', onBody);
    click('mobileCncEditor');
    document.body.removeEventListener('click', onBody);
    expect(calcs.openCncEditor).toHaveBeenLastCalledWith('G0 X10 Z0', { drawOnClose: true, highlight: [] });
    expect(document.getElementById('topbar').classList.contains('mobile-open')).toBe(false);
    expect(document.body.classList.contains('toolbar-open')).toBe(false);
    expect(onBody).not.toHaveBeenCalled();   // stopPropagation
  });

  it('číselné zadání otevírá sdílené okno (VK je jeho záložka); AI panel', () => {
    click('btnNumInput');
    click('desktopNumInput');
    expect(combined.showCombinedModal.mock.calls).toEqual([['num'], ['num']]);
    expect(document.getElementById('btnOpenVk')).toBeNull();   // v pravém panelu byl duplikát
    click('btnOpenAI');
    expect(ai.openAIPanel).toHaveBeenCalledTimes(1);
  });

  it('CAM: prázdný výkres → simulátor bez kódu', () => {
    state.objects = [];
    click('btnOpenCam');
    expect(calcs.openCamSimulator).toHaveBeenCalledWith();
  });

  it('CAM: s výkresem přes bridge.openCamFromDrawing (kontrola profilu), prázdný kód → undefined', () => {
    state.objects = [{ type: 'line', x1: 0, y1: 0, x2: 1, y2: 0 }];
    bridge.openCamFromDrawing = vi.fn();
    click('btnOpenCam');
    const cb = bridge.openCamFromDrawing.mock.calls[0][0];
    cb('G1 X5');
    cb('');
    expect(calcs.openCamSimulator.mock.calls).toEqual([['G1 X5'], [undefined]]);
  });

  it('CAM: s výkresem bez openCamFromDrawing → runCncExport a kód z #cncOutput', () => {
    state.objects = [{ type: 'line', x1: 0, y1: 0, x2: 1, y2: 0 }];
    bridge.openCamFromDrawing = null;
    bridge.runCncExport = vi.fn(() => { document.getElementById('cncOutput').value = 'G0 X1'; });
    click('btnOpenCam');
    expect(bridge.runCncExport).toHaveBeenCalledTimes(1);
    expect(calcs.openCamSimulator).toHaveBeenCalledWith('G0 X1');
  });

  it('📝 otevře poznámkový blok', async () => {
    click('btnOpenNotes');
    await vi.waitFor(() => expect(document.querySelector('.calc-overlay[data-type="notes"]')).toBeTruthy());
  });
});
