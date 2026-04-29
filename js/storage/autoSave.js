// ╔══════════════════════════════════════════════════════════════╗
// ║  SKICA – Automatické ukládání do IndexedDB                  ║
// ╚══════════════════════════════════════════════════════════════╝

import { setPushUndoHook } from '../state.js';
import { saveProject } from './projectManager.js';

let _autoSaveTimer = null;

function scheduleAutoSave() {
  if (_autoSaveTimer) clearTimeout(_autoSaveTimer);
  _autoSaveTimer = setTimeout(() => {
    saveProject();
  }, 3000);
}

// Hook do pushUndo – automaticky uložit po každé změně
/** Inicializuje autosave (interval + pushUndo hook). */
export function initAutoSave() {
  setPushUndoHook(scheduleAutoSave);
}
