import { bridge } from '../../bridge.js';

// ── Geometrie nástroje (destička + držák) pro knihovnu nožů ─────────
// S.params je per-instance closure (viz openCamSimulator). Aby šla geometrie
// nástroje uložit/načíst z projektu (projectManager) a přenést do CAM i mimo
// otevřený simulátor, drží se poslední známá sada zde na úrovni modulu.
export const CAM_TOOL_KEYS = ['toolShape', 'toolLength', 'toolAngle', 'toolTipAngle',
  'toolRadius', 'toolTipFlat', 'toolTipMirror', 'toolVbdCode',
  'holderLength', 'holderWidth', 'holderHand', 'holderProfile',
  'knifeAngle', 'holderAutoComplete'];
let _savedCamTool = null;   // naposledy uložený/načtený nůž (mimo otevřené CAM)
let _activeCamParams = null; // S.params živě otevřeného CAM (nebo null)

export function _pickCamTool(src) {
  if (!src) return null;
  const out = {};
  for (const k of CAM_TOOL_KEYS) {
    if (src[k] === undefined) continue;
    out[k] = k === 'holderProfile' && src[k] ? JSON.parse(JSON.stringify(src[k])) : src[k];
  }
  return out;
}

/** Geometrie nástroje pro uložení do projektu (živé CAM má přednost). */
export function getCamToolGeometry() {
  return _pickCamTool(_activeCamParams || _savedCamTool);
}

/**
 * Přenese nůž do CAM: uloží do modulového cache a, je-li CAM otevřené, i do
 * jeho živých parametrů. Vrací true při úspěchu.
 */
export function applyCamToolGeometry(tool) {
  const picked = _pickCamTool(tool);
  if (!picked) return false;
  _savedCamTool = { ...(_savedCamTool || {}), ...picked };
  if (_activeCamParams) {
    for (const k of CAM_TOOL_KEYS) if (picked[k] !== undefined) _activeCamParams[k] = picked[k];
    if (bridge.refreshCamToolGeometry) bridge.refreshCamToolGeometry();
  }
  return true;
}

// Registrace pro projectManager (přes bridge — bez cyklického importu).
// typeof-guard: testovací harness (tests/helpers/camInternals.mjs) importy
// stripuje a `bridge` nestubuje — bez guardu by tento top-level řádek spadl.
if (typeof bridge !== 'undefined') {
  bridge.getCamToolGeometry = getCamToolGeometry;
  bridge.applyCamToolGeometry = applyCamToolGeometry;
}

// Zpřístupní S.params živě otevřeného CAM modulu (viz openCamSimulator open/close).
export function setActiveCamParams(params) { _activeCamParams = params; }
// Uloží naposledy použitý nůž (mimo otevřené CAM) — viz openCamSimulator restoreOnClose.
export function setSavedCamTool(tool) { _savedCamTool = _pickCamTool(tool); }
// Naposledy uložený/načtený nůž — pro obnovu při otevření CAM (viz openCamSimulator).
export function getSavedCamTool() { return _savedCamTool; }

// Výchozí sada nožů v 🔧 Zásobníku nástrojů (T1–T6) — pro rovnou testování
// drah bez nutnosti ručně importovat/zadávat geometrii. Nasadí se jen při
// prvním spuštění (prázdný localStorage); jakmile uživatel zásobník uloží
// (i prázdný), jeho stav se odteď respektuje beze změny.
// Pořadí odpovídá typickému sledu obrábění (čelo → hrubování → dokončení →
// profil/rádius → závit → upich).
export const DEFAULT_TOOL_MAGAZINE = [
  {
    slot: 1, name: 'Hrub čelo', vbdCode: '',
    shape: 'polygon', radius: 0, tipAngle: 90, toolAngle: -15,
    clearanceAngle: 0, toolLength: 10, tipFlat: 0.1,
    vc: 200, f: 0.25, ap: 2.5,
    holderLength: 200, holderWidth: 20, holderHand: 'R',
    knifeAngle: 270, holderAutoComplete: true,
    holderProfile: { sideA: [
      { x: 25.061, z: 137.716 }, { x: 25.061, z: 30.365 }, { x: 34.22, z: 30.365 },
      { x: 34.22, z: 13.112 }, { x: 8.679, z: -3.154 }, { x: 1.608, z: 9.094 },
      { x: 1.608, z: 137.716 }, { x: 25.061, z: 137.716 },
    ], sideB: [] },
  },
  {
    slot: 2, name: 'Hrubovaci', vbdCode: '',
    shape: 'polygon', radius: 0.8, tipAngle: 90, toolAngle: 15,
    clearanceAngle: 0, toolLength: 10, tipFlat: 0.1,
    vc: 200, f: 0.25, ap: 2.5,
    holderLength: 200, holderWidth: 20, holderHand: 'R',
    knifeAngle: 270, holderAutoComplete: true,
    holderProfile: { sideA: [
      { x: 0, z: 0 }, { x: 2, z: 0 }, { x: 20, z: 6.551464216791643 },
      { x: 20, z: 200 }, { x: 0, z: 200 }, { x: 0, z: 0 },
    ], sideB: [] },
  },
  {
    slot: 3, name: 'Šlicht', vbdCode: '',
    shape: 'polygon', radius: 0.8, tipAngle: 55, toolAngle: 25,
    clearanceAngle: 0, toolLength: 10, tipFlat: 0.1,
    vc: 200, f: 0.25, ap: 2.5,
    holderLength: 200, holderWidth: 20, holderHand: 'R',
    knifeAngle: 270, holderAutoComplete: true,
    holderProfile: { sideA: [
      { x: 0, z: 0 }, { x: 2, z: 0 }, { x: 20, z: 6.551464216791643 },
      { x: 20, z: 200 }, { x: 0, z: 200 }, { x: 0, z: 0 },
    ], sideB: [] },
  },
  {
    slot: 4, name: 'Kulaty', vbdCode: '',
    shape: 'round', radius: 10, tipAngle: 90, toolAngle: 15,
    clearanceAngle: 0, toolLength: 10, tipFlat: 0.1,
    vc: 180, f: 0.15, ap: 1.5,
    holderLength: 200, holderWidth: 20, holderHand: 'R',
    knifeAngle: 270, holderAutoComplete: true,
    holderProfile: { sideA: [
      { x: 0, z: 0 }, { x: 2, z: 0 }, { x: 20, z: 6.551464216791643 },
      { x: 20, z: 200 }, { x: 0, z: 200 }, { x: 0, z: 0 },
    ], sideB: [] },
  },
  {
    slot: 5, name: 'Zavit', vbdCode: '',
    shape: 'threading', radius: 0, tipAngle: 60, toolAngle: 0,
    clearanceAngle: 0, toolLength: 4, tipFlat: 0.1,
    vc: 100, f: 1.5, ap: 0.1,
    holderLength: 200, holderWidth: 20, holderHand: 'R',
    knifeAngle: 270, holderAutoComplete: true,
    holderProfile: { sideA: [
      { x: -10, z: 10.464101615137755 }, { x: -3.0000000000000018, z: 3.4641016151377553 },
      { x: 3, z: 3.4641016151377553 }, { x: 10, z: 10.464101615137753 },
      { x: 10, z: 203.46410161513776 }, { x: -10, z: 203.46410161513776 },
      { x: -10, z: 10.464101615137755 },
    ], sideB: [] },
  },
  {
    slot: 6, name: 'Upichovak', vbdCode: '',
    shape: 'parting', radius: 0.8, tipAngle: 55, toolAngle: 0,
    clearanceAngle: 0, toolLength: 5, tipFlat: 0.1,
    vc: 120, f: 0.08, ap: 2,
    holderLength: 200, holderWidth: 20, holderHand: 'R',
    knifeAngle: 270, holderAutoComplete: true,
    holderProfile: { sideA: [
      { x: -0.8000000000000007, z: 15 }, { x: 4.199999999999999, z: 15 },
      { x: 19.2, z: 29.999999999999996 }, { x: 19.2, z: 215 },
      { x: -0.8000000000000007, z: 215 }, { x: -0.8000000000000007, z: 15 },
    ], sideB: [] },
  },
];
