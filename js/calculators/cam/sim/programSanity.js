// Uložený program s NESMYSLNOU souřadnicí (mimo rozsah stroje) při otevření CAM.
//
// Do 27. 8. 2026 generátor u upichováku s Úhlem zanoření 90° vydával odjezdy
// typu „N560 G0 X486708909.740" (kotva rampy × tan 90°). Generátor je opravený
// (7d0ae64, test cam-gcode-sane-coords), ale programy uložené tehdy v .camprog
// nebo v localStorage mají stejnou verzi logiky drah (PATH_LOGIC_VERSION),
// takže se při otevření nepřegenerovaly — a ⛔ panel pak hlásil kolizi držáku
// „X973417795…" (nález uživatele 13. 10. 2026, part-18-parting-90-ramp).
import { showToast } from '../../../state.js';

/** Největší souřadnice, která na skutečném stroji existuje (jako cam-gcode-sane-coords). */
export const MAX_COORD_MM = 10000;

/** Řádky programu, kde X/Z/U/W/I/K/CR leží mimo ±MAX_COORD_MM → [{ lineIdx, line }]. */
export function insaneCoordLines(code) {
  const out = [];
  String(code || '').split('\n').forEach((line, lineIdx) => {
    const body = line.replace(/;.*$/, '').replace(/\([^)]*\)/g, '');
    for (const m of body.matchAll(/(?:CR=|\b[XZUWIK])\s*(-?\d*\.?\d+)/gi)) {
      if (Math.abs(parseFloat(m[1])) > MAX_COORD_MM) { out.push({ lineIdx, line }); break; }
    }
  });
  return out;
}

/**
 * Zahodit uložený program při otevření (a vygenerovat dráhy znovu)? Ano, když
 * má nesmyslnou souřadnici a NENÍ ručně upravený. Ručně upravený zůstane
 * (úpravy se nezahazují) — jen se na souřadnici upozorní.
 */
export function dropInsaneSavedProgram(code, dirty) {
  const bad = insaneCoordLines(code);
  if (!bad.length) return false;
  const first = bad[0].line.trim();
  if (dirty) {
    setTimeout(() => showToast(`⚠ Uložený program má nesmyslnou souřadnici (${first}) — je ručně upravený, proto zůstal. Nové dráhy vygeneruješ „🔄 Dráhy".`, 9000), 0);
    return false;
  }
  setTimeout(() => showToast(`Uložené dráhy měly nesmyslnou souřadnici (${first}, chyba starší verze) — vygenerovaly se znovu.`, 7000), 0);
  return true;
}
