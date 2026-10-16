// @vitest-environment happy-dom
// Dialog ⚙️ Nastavení (#desktopSettings / #mobileSettings). Psáno PŘED
// přesunem z ui.js do js/ui/settingsDialog.js (docs/plan-refaktoringu-ui.md,
// Fáze 2a) jako charakterizace: každé pole dialogu → `state`, stav tlačítek,
// hláška a uložení nastavení (persistSettings → js/storage/settingsStore.js).
// Projde na starém kódu a po přesunu musí projít beze změny.
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { installUiDom } from './helpers/uiDom.mjs';
import { settle } from './helpers/simUi.mjs';
import { getMeta, setMeta } from '../js/idb.js';

let state, bridge, undo;
const ov = () => document.querySelector('.calc-overlay[data-type="settings"]');
const q = (s) => ov().querySelector(s);
const click = (id) => q('#' + id).click();
const toast = () => document.querySelector('.toast')?.textContent;
const isActive = (el) => el.style.cssText.includes('var(--ctp-green)');
const active = () => [...ov().querySelectorAll('button.calc-btn[id]')].filter(isActive).map(b => b.id);
const KEYS = ['showDimensions', 'displayDecimals', 'xDisplayMode', 'coordMode', 'machineType', 'flipX', 'flipZ', 'mirrorPreview',
  'showContourGaps', 'snapToGrid', 'angleSnap', 'gridSize', 'angleSnapStep', 'snapQuadrants', 'snapMidpoints', 'snapCenters', 'theme'];
let saved, savedBridge;
const BRIDGE = ['saveProject', 'showFileDialog', 'showLibraryDialog', 'showProjectsDialog', 'runCncExport', 'updateMobileCoords', 'updateCoordBarIndicators'];

function open(id = 'desktopSettings') {
  document.getElementById(id).click();
  expect(ov()).toBeTruthy();
}

beforeAll(async () => {
  installUiDom();
  await import('../js/ui.js');
  ({ state, undo } = await import('../js/state.js'));
  ({ bridge } = await import('../js/bridge.js'));
});
beforeEach(() => {
  saved = Object.fromEntries(KEYS.map(k => [k, state[k]]));
  savedBridge = Object.fromEntries(BRIDGE.map(k => [k, bridge[k]]));
  Object.assign(state, {
    showDimensions: 'all', displayDecimals: 3, xDisplayMode: 'radius', coordMode: 'abs', machineType: 'soustruh',
    flipX: false, flipZ: false, mirrorPreview: false, showContourGaps: false, snapToGrid: false, angleSnap: false,
    gridSize: 10, angleSnapStep: 15, snapQuadrants: true, snapMidpoints: true, snapCenters: false, theme: 'dark',
  });
  state.anchors.length = 0;
});
afterEach(async () => {
  ov()?.remove();
  Object.assign(state, saved);
  Object.assign(bridge, savedBridge);
  document.body.classList.remove('light-theme');
  vi.unstubAllGlobals();
  await settle(5);
});

describe('Nastavení', () => {
  it('otevře se z desktopu i mobilu; výchozí aktivní tlačítka odpovídají stavu', () => {
    open('mobileSettings');
    expect(q('.calc-titlebar h3').textContent).toBe('⚙️ Nastavení');
    ov().remove();
    open();
    expect(active()).toEqual(['settDimsAll', 'settXRadius', 'settCoordAbs', 'settMachSoustruh', 'settSnapQuadrants', 'settSnapMidpoints', 'settThemeDark']);
    expect([q('#settDecimals option[selected]').value, q('#settGrid').value, q('#settAngleStep').value]).toEqual(['3', '10', '15']);
    expect([q('#settFlipX').textContent, q('#settFlipZ').textContent, q('#settMirrorPreview').textContent, q('#settContourGaps').textContent])
      .toEqual(['⇅ X+ nahoru ↑', '⇄ Z+ vpravo →', '⇋ Zrcadlit kolem osy: OFF', '⊗ Mezery v kontuře: OFF']);
    const details = q('details');
    details.open = false;
    details.dispatchEvent(new Event('toggle'));
    expect(q('#settProjArrow').style.transform).toBe('');
  });

  it('kóty, přesnost, osa X, ABS/INC, typ stroje', () => {
    bridge.updateCoordBarIndicators = vi.fn();
    bridge.updateMobileCoords = vi.fn();
    open();
    click('settDimsIntersect');
    expect([state.showDimensions, toast(), bridge.updateCoordBarIndicators.mock.calls.length]).toEqual(['intersections', 'Kóty: pouze průsečíky', 1]);
    for (const [id, mode, msg] of [['settDimsOnly', 'dimensions', 'Kóty: pouze kóty'], ['settDimsNone', 'none', 'Kóty: skryté'], ['settDimsAll', 'all', 'Kóty: vše']]) {
      click(id);
      expect([state.showDimensions, toast()]).toEqual([mode, msg]);
    }
    q('#settDecimals').value = '1';
    q('#settDecimals').dispatchEvent(new Event('change'));
    expect([state.displayDecimals, toast()]).toEqual([1, 'Přesnost: 1 des. míst']);
    click('settXDiam');
    click('settCoordInc');
    expect([state.xDisplayMode, state.coordMode, toast(), bridge.updateMobileCoords.mock.calls.length]).toEqual(['diameter', 'inc', 'Inkrementální souřadnice (INC)', 1]);
    click('settMachKarusel');
    expect(state.machineType).toBe('karusel');
    expect(active()).toEqual(['settDimsAll', 'settXDiam', 'settCoordInc', 'settMachKarusel', 'settSnapQuadrants', 'settSnapMidpoints', 'settThemeDark']);
    click('settCoordAbs');
    click('settXRadius');
    click('settMachSoustruh');
    expect([state.coordMode, state.xDisplayMode, state.machineType, toast()]).toEqual(['abs', 'radius', 'soustruh', 'Absolutní souřadnice (ABS)']);
  });

  it('otočení os (událost pro CAD), zrcadlení, mezery v kontuře', () => {
    const ev = [];
    const onX = (e) => ev.push(['x', e.detail]);
    const onZ = (e) => ev.push(['z', e.detail]);
    document.addEventListener('flipx-cad', onX);
    document.addEventListener('flipz-cad', onZ);
    open();
    click('settFlipX');
    expect([state.flipX, q('#settFlipX').textContent, toast()]).toEqual([true, '⇅ X+ dolů ↓', 'Osa X otočena – X+ dolů']);
    click('settFlipZ');
    click('settFlipZ');
    expect([state.flipZ, q('#settFlipZ').textContent, toast()]).toEqual([false, '⇄ Z+ vpravo →', 'Osa Z – Z+ vpravo']);
    document.removeEventListener('flipx-cad', onX);
    document.removeEventListener('flipz-cad', onZ);
    expect(ev).toEqual([['x', true], ['z', true], ['z', false]]);
    click('settMirrorPreview');
    expect([state.mirrorPreview, q('#settMirrorPreview').textContent, toast()]).toEqual([true, '⇋ Zrcadlit kolem osy: ON', 'Náhled zrcadlení: ON']);
    click('settContourGaps');
    expect([state.showContourGaps, q('#settContourGaps').textContent, toast()]).toEqual([true, '⊗ Mezery v kontuře: ON', 'Zvýraznění mezer v kontuře: ON']);
    expect(active()).toContain('settFlipX');
    expect(active()).not.toContain('settFlipZ');
  });

  it('mřížka a snap: přepínače, krok mřížky a úhlu (mimo rozsah se ignoruje), body přichycení', () => {
    open();
    click('settSnapGrid');
    click('settAngleSnap');
    expect([state.snapToGrid, state.angleSnap, q('#settSnapGrid').textContent, q('#settAngleSnap').textContent])
      .toEqual([true, true, '# Mřížka: ON', '∠ Úhel: ON']);
    const change = (id, v) => { q('#' + id).value = v; q('#' + id).dispatchEvent(new Event('change')); };
    change('settGrid', '2.5');
    change('settAngleStep', '30');
    expect([state.gridSize, state.angleSnapStep]).toEqual([2.5, 30]);
    change('settGrid', '0');
    change('settGrid', '150');
    change('settAngleStep', '91');
    expect([state.gridSize, state.angleSnapStep]).toEqual([2.5, 30]);
    click('settSnapQuadrants');
    click('settSnapMidpoints');
    click('settSnapCenters');
    expect([state.snapQuadrants, state.snapMidpoints, state.snapCenters, toast()]).toEqual([false, false, true, 'Snap středy oblouků: ON']);
    expect([q('#settSnapQuadrants').textContent, q('#settSnapMidpoints').textContent, q('#settSnapCenters').textContent])
      .toEqual(['◎ Quadranty: OFF', '½ Středy: OFF', '⊕ Středy R: ON']);
  });

  it('motiv tmavý / světlý', () => {
    open();
    click('settThemeLight');
    expect([state.theme, document.body.classList.contains('light-theme'), isActive(q('#settThemeLight')), isActive(q('#settThemeDark'))])
      .toEqual(['light', true, true, false]);
    click('settThemeDark');
    expect([state.theme, document.body.classList.contains('light-theme')]).toEqual(['dark', false]);
  });

  it('změna se uloží (persistSettings) — zvlášť od výkresu', async () => {
    await setMeta('currentProjectData', { objects: [1], gridSize: 1 });
    localStorage.removeItem('skica-settings');
    open();
    q('#settDecimals').value = '2';
    q('#settDecimals').dispatchEvent(new Event('change'));
    click('settMachKarusel');
    await vi.waitFor(async () => {
      const d = JSON.parse(localStorage.getItem('skica-settings'));
      expect([d?.displayDecimals, d?.machineType, d?.gridSize]).toEqual([2, 'karusel', 10]);
    }, { timeout: 2000 });
    // výkres zůstane, jak byl (nastavení se ukládá zvlášť, 'skica-settings')
    expect(await getMeta('currentProjectData')).toEqual({ objects: [1], gridSize: 1 });
  });

  it('projekty a export: tlačítko zavře Nastavení a otevře cíl', async () => {
    const calls = [];
    for (const k of ['saveProject', 'showFileDialog', 'showLibraryDialog', 'showProjectsDialog', 'runCncExport']) bridge[k] = vi.fn(() => calls.push(k));
    const wopen = vi.fn();
    vi.stubGlobal('open', wopen);
    for (const id of ['settSave', 'settLoad', 'settLibrary', 'settProjects', 'settCNC', 'settDxfJson']) {
      open();
      click(id);
      expect(ov(), id).toBeNull();
    }
    expect(calls).toEqual(['saveProject', 'showFileDialog', 'showLibraryDialog', 'showProjectsDialog', 'runCncExport']);
    expect(wopen).toHaveBeenCalledWith('dxf-json.html', '_blank');
    await setMeta('deletedHistory', null);
    open();
    click('settHistory');
    await vi.waitFor(() => expect(toast()).toBe('Žádné smazané výkresy v historii'));
    expect(ov()).toBeNull();
  });

  it('kotvy: počet, seznam, smazání jedné a všech (Zpět je vrátí)', () => {
    open();
    expect([q('#settAnchorCount').textContent, q('#settListAnchors').disabled, q('#settDeleteAnchors').disabled]).toEqual(['0', true, true]);
    ov().remove();
    state.anchors.push({ x: 5, y: 2 }, { x: 10, y: -1 });
    open();
    expect([q('#settAnchorCount').textContent, q('#settListAnchors').disabled]).toEqual(['2', false]);
    click('settListAnchors');
    const rows = () => [...q('#settAnchorList').querySelectorAll('[data-anchor-idx]')].map(r => r.textContent.replace(/\s+/g, ' ').trim());
    expect(rows()).toMatchInlineSnapshot(`
      [
        "⚓ Z5 X2 ✕",
        "⚓ Z10 X-1 ✕",
      ]
    `);
    q('#settAnchorList .anchor-del-btn[data-idx="0"]').click();
    expect([state.anchors, q('#settAnchorCount').textContent, toast(), rows().length]).toEqual([[{ x: 10, y: -1 }], '1', 'Kotva odstraněna ✓', 1]);
    click('settDeleteAnchors');
    expect([state.anchors.length, q('#settAnchorCount').textContent, q('#settDeleteAnchors').disabled, q('#settAnchorList').style.display, toast()])
      .toEqual([0, '0', true, 'none', 'Smazáno 1 kotev ✓']);
    undo();
    expect(state.anchors).toEqual([{ x: 10, y: -1 }]);
    click('settListAnchors');
    click('settListAnchors');
    expect(q('#settAnchorList').style.display).toBe('none');
  });
});
