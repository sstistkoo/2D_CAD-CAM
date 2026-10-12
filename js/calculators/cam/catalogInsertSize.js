// ╔══════════════════════════════════════════════════════════════╗
// ║  Velikost plátku z ISO katalogu (výběr místo ručního R / hrany)║
// ╚══════════════════════════════════════════════════════════════╝
//
// Uživatel 12. 10. 2026: „přidej možnost nastavit velikost plátku podle
// katalogu". U nože s katalogovým kódem držáku (SRSCL2525M12, PSKNR2525M12…)
// je v poli plátku rozbalovací výběr RCMT 0803M0 / 1003M0 / 1204M0 … —
// nastaví R (kulatá) nebo délku hrany (polygon), VBD kód a název nože a
// přestaví držák (holderFollowsInsert.js). Ostatní nože výběr nemají.

import { parseIsoKnifeName, isoTypeById, isoSizes, isoInsertLabel, buildIsoKnife } from '../isoToolCatalog.js';
import { holderForResizedInsert, insertOfParams } from './holderFollowsInsert.js';

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
const dimOf = (type, tool) => (type.shape === 'R' ? tool.toolRadius : tool.toolLength);

/** Katalogové velikosti pro nůž s parametry `prms`, nebo null (cizí nůž / jiný tvar). */
function catalogSizes(prms) {
  if (!prms || (prms.toolShape !== 'round' && prms.toolShape !== 'polygon')) return null;
  const parsed = parseIsoKnifeName(prms.toolName, prms.toolVbdCode);
  const type = parsed && isoTypeById(parsed.id);
  if (!type || (type.shape === 'R') !== (prms.toolShape === 'round')) return null;
  const list = [];
  for (const size of isoSizes(type, parsed.opts.variant, parsed.opts.shank)) {
    const rec = buildIsoKnife(parsed.id, { ...parsed.opts, size });
    if (rec) list.push({ size, rec, dim: dimOf(type, rec.tool), label: isoInsertLabel(type, parsed.opts.variant, size) });
  }
  return list.length ? { parsed, type, list } : null;
}

/** Řádek „Velikost podle katalogu" pro pole plátku; '' = nůž není z katalogu. */
export function catalogSizeRowHTML(prms) {
  const cs = catalogSizes(prms);
  if (!cs) return '';
  const cur = parseFloat(cs.type.shape === 'R' ? prms.toolRadius : prms.toolLength) || 0;
  const hit = cs.list.find((o) => Math.abs(o.dim - cur) < 0.01);
  const opts = (hit ? '' : '<option value="" selected>— vlastní velikost —</option>')
    + cs.list.map((o) => `<option value="${esc(o.size)}"${o === hit ? ' selected' : ''}>${esc(o.label)}</option>`).join('');
  return `<div class="cam-sim-row"><div class="cam-sim-field"><label title="Velikost plátku podle ISO katalogu — nastaví R / délku hrany a přestaví držák. Rádius a hranu jde dál přepsat ručně.">Velikost podle katalogu</label><select data-p="isoSize">${opts}</select></div></div>`;
}

/**
 * Nastaví plátek v `params` na katalogovou velikost `size`: R / délka hrany,
 * VBD kód, název nože a (je-li katalogový) i obrys držáku.
 * @returns {boolean} true = něco se změnilo
 */
export function applyCatalogSize(params, size) {
  const cs = catalogSizes(params);
  const pick = cs && cs.list.find((o) => o.size === size);
  if (!pick) return false;
  const before = insertOfParams(params);
  const t = pick.rec.tool;
  if (cs.type.shape === 'R') params.toolRadius = t.toolRadius;
  else params.toolLength = t.toolLength;
  params.toolVbdCode = pick.rec.vbdCode;
  params.toolName = pick.rec.name;
  const hp = holderForResizedInsert(before, insertOfParams(params));
  if (hp) params.holderProfile = hp;
  return true;
}
