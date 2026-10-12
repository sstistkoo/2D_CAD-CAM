// ╔══════════════════════════════════════════════════════════════╗
// ║  Držák z katalogu se přizpůsobí velikosti plátku              ║
// ╚══════════════════════════════════════════════════════════════╝
//
// Uživatel 12. 10. 2026: „můžeš udělat, aby se držáky upravily, když změním
// velikost plátku?" Obrys držáku z ISO katalogu se staví podle velikosti
// plátku (kulatá: R, polygon: délka hrany a R), jenže po ručním přepsání
// R / délky hrany zůstal obrys původní — dřík „plaval" kolem jiného plátku.
//
// Držák se přepočítá JEN když je to pořád nezměněný katalogový obrys
// (kód držáku jde rozpoznat a obrys přesně odpovídá tomu, co by katalog
// postavil pro PŮVODNÍ velikost). Vlastní / ručně upravený / cizí držák se
// nechá být.

import { parseIsoKnifeName, isoHolderForInsert } from '../isoToolCatalog.js';

const SIZE_KEYS = { round: ['toolRadius'], polygon: ['toolLength', 'toolRadius'] };
const num = (v) => parseFloat(v) || 0;

const loopKey = (p) => JSON.stringify(p
  ? ['sideA', 'sideB'].map((k) => (p[k] || []).map((q) => [Math.round(q.x * 1000), Math.round(q.z * 1000)]))
  : null);

/** Klíče parametrů, jejichž změna může změnit velikost plátku (pro rychlé předfiltrování). */
export const HOLDER_SIZE_PARAMS = new Set(['toolRadius', 'toolLength']);

/** Parametry aktivního nástroje (S.params) → společný tvar. */
export const insertOfParams = (p) => p && ({
  shape: p.toolShape, name: p.toolName, vbd: p.toolVbdCode, profile: p.holderProfile,
  toolRadius: p.toolRadius, toolLength: p.toolLength, toolAngle: p.toolAngle,
  toolTipAngle: p.toolTipAngle, toolTipFlat: p.toolTipFlat, toolClearanceAngle: p.toolClearanceAngle,
  toolVbdCode: p.toolVbdCode, toolShape: p.toolShape, toolTipMirror: false,
});

/** Slot 🔧 Zásobníku → společný tvar. */
export const insertOfSlot = (s) => s && ({
  shape: s.shape || 'round', name: s.name, vbd: s.vbdCode, profile: s.holderProfile,
  toolRadius: s.radius, toolLength: s.toolLength, toolAngle: s.toolAngle,
  toolTipAngle: s.tipAngle, toolTipFlat: s.tipFlat, toolClearanceAngle: s.clearanceAngle,
  toolVbdCode: s.vbdCode, toolShape: s.shape || 'round', toolTipMirror: false,
});

/**
 * Nový obrys držáku pro změněnou velikost plátku, nebo null = nechat.
 * @param {object} before  insertOfParams / insertOfSlot PŘED změnou
 * @param {object} after   totéž PO změně
 * @returns {{sideA: Array, sideB: Array}|null}
 */
export function holderForResizedInsert(before, after) {
  if (!before || !after || !before.profile) return null;
  const keys = SIZE_KEYS[after.shape];
  if (!keys || before.shape !== after.shape) return null;
  if (!keys.some((k) => num(before[k]) !== num(after[k]))) return null;
  if (num(after.toolRadius) <= 0) return null;
  const parsed = parseIsoKnifeName(before.name, before.vbd);
  if (!parsed) return null;
  const was = isoHolderForInsert(parsed.id, parsed.opts.shank, before);
  if (!was || loopKey(was) !== loopKey(before.profile)) return null;
  return isoHolderForInsert(parsed.id, parsed.opts.shank, after);
}
