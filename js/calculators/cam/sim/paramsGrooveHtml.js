// Pole záložky Upich + ◎ Vnitřní — zápich v díře (ops/grooveInner.js,
// doplnění pravidla 13 z 22. 10. 2026). Z = bok u ústí díry (naklikaný),
// šířka hlouběji do díry, dno = poloměr vnější hrany destičky na dně,
// ⌀ díry 0 = z vyvrtávání / předvrtání.
import { grooveInnerGeom } from '../ops/grooveInner.js';
import { boreChainFromState } from '../boreContour.js';
import { groovesFromDrawing } from './grooveCad.js';

const cz = (v) => String(Math.round(v * 1000) / 1000).replace('.', ',');

/** Odkud se bere ⌀ díry (pro nápovědu u pole ⌀ díry). */
function holeSource(prms, fromCad) {
  if (parseFloat(prms.grooveHoleD) > 0) return null;
  if (fromCad) return 'tvar díry z výkresu';
  if (parseFloat(prms.boreDiameter) > 0) return `⌀${cz(parseFloat(prms.boreDiameter))} z vyvrtávání`;
  if (parseFloat(prms.borePreDiameter) > 0) return `⌀${cz(parseFloat(prms.borePreDiameter))} z předvrtání`;
  return 'není zadaná';
}

/** @param S  stav simulátoru (díra z výkresu), jinak jen parametry */
export function grooveInnerFieldsHtml(prms, S = null) {
  // Stejná díra jako v generátoru: z výkresu (✏), jinak z polí.
  let chain = null;
  try { const c = S && prms.boreSource === 'cad' ? boreChainFromState(S) : null; chain = c ? c.segs : null; } catch { chain = null; }
  const g = grooveInnerGeom(prms, chain);
  const src = holeSource(prms, !!chain);
  const w = parseFloat(prms.toolLength) || 0;
  const info = g.ok
    ? `Díra ⌀${cz(2 * g.rHole)}, zápich ${cz(g.W)} × ${cz(g.depth)} mm: ${g.plunges.length} ${g.plunges.length === 1 ? 'zápich' : g.plunges.length < 5 ? 'zápichy' : 'zápichů'} destičkou š ${cz(w)}${g.doFinish ? ' + dokončení bok → dno → bok' : ''}.`
    : `⚠ ${g.reason}`;
  return `<div class="cam-sim-row">
      <div class="cam-sim-field"><label title="Z boku zápichu blíž k ústí díry (naklikaný bod). Lze upravit i ručně.">Z bok u ústí</label><input type="number" step="0.01" data-p="partOffZ" value="${parseFloat(prms.partOffZ)}"></div>
      <div class="cam-sim-field"><label title="Šířka zápichu od boku u ústí hlouběji do díry. 0 = šířka destičky (jeden zápich). Širší zápich = víc zápichů vedle sebe s krokem nejvýš 0,8 × šířka destičky.">Šířka zápichu</label><input type="number" step="0.1" min="0" data-p="grooveWidth" value="${prms.grooveWidth}"></div>
      <div class="cam-sim-field"><label title="Dno zápichu: radiální poloha VNĚJŠÍ hrany destičky (poloměr, za stěnou díry). Hloubka zápichu = Dno X − poloměr díry, nejvýš dosah destičky v tyči.">Dno X</label><input type="number" step="0.1" data-p="grooveBottomX" value="${prms.grooveBottomX}"></div>
    </div>
    <div class="cam-sim-row">
      <div class="cam-sim-field"><label title="Průměr díry, ze které se zapichuje. 0 = automaticky (${src || 'ruční'}): hotový ⌀ z vyvrtávání, jinak předvrtání.">⌀ díry</label><input type="number" step="0.1" min="0" data-p="grooveHoleD" value="${prms.grooveHoleD}" placeholder="auto"></div>
      <div class="cam-sim-field"><label title="TRVALÝ přídavek na bocích zápichu — zůstane i po dokončení.">Přídavek Z</label><input type="number" step="0.1" data-p="allowanceZ" value="${prms.allowanceZ}"></div>
      <div class="cam-sim-field"><label title="Přídavek NA HOTOVO na bocích a dně: zápichy ho nechají stát, dokončovací dráha (je-li zapnutá) ho odebere.">Přídavek na hotovo</label><input type="number" step="0.1" data-p="finishAllowance" value="${prms.finishAllowance}"></div>
    </div>
    <small class="cam-sim-info-box" style="display:block;margin-top:4px${g.ok ? '' : ';color:#f38ba8'}">${info}${src && src !== 'není zadaná' ? ` Díra: ${src}.` : ''}</small>
    <div class="cam-sim-checkbox-row" data-tooltip="Dokončení: po prvním boku na dno, po dně ke druhému boku a po něm zpátky ke stěně díry (odebere Přídavek na hotovo).">
      <input type="checkbox" id="cam-sim-fin" ${prms.doFinishing ? 'checked' : ''}>
      <span>Dokončovací operace</span>
    </div>
    <div class="cam-sim-checkbox-row" data-tooltip="Zapnuto = každý zápich jedním plynulým posuvem F až na dno (bez peckování). Vypnuto = peckovaný cyklus.">
      <input type="checkbox" id="cam-sim-partoff-smooth" ${prms.partOffSmooth ? 'checked' : ''}>
      <span>Plynulý zápich (bez peckování)</span>
    </div>
    ${prms.partOffSmooth ? '' : `<div class="cam-sim-row">
      <div class="cam-sim-field"><label title="Peck: rychloposuvem zpět až na tuto vzdálenost před dno předchozího řezu, poslední úsek posuvem F.">Posuv posl. (mm)</label><input type="number" step="0.5" min="0" data-p="partingApproachFeed" value="${prms.partingApproachFeed}"></div>
      <div class="cam-sim-field"><label title="Vyjezd (peck): po jaké hloubce zápichu nástroj vyjede ke stěně díry pro uvolnění třísek.">Vyjezd/peck</label><input type="number" step="0.5" min="0.1" data-p="retractDistance" value="${prms.retractDistance}"></div>
    </div>`}`;
}

/**
 * Zápichy v díře nakreslené ve výkresu (grooveCad.js) — tlačítka, která
 * vyplní Z boku u ústí, šířku a dno. Bez nakresleného zápichu nic.
 */
export function grooveCadRowHtml(S) {
  const list = groovesFromDrawing(S);
  if (!list.length) return '';
  const p = S.params;
  const same = (g) => Math.abs(parseFloat(p.partOffZ) - g.zA) < 1e-3 && Math.abs((parseFloat(p.grooveWidth) || 0) - g.W) < 1e-3
    && Math.abs((parseFloat(p.grooveBottomX) || 0) - g.rBot) < 1e-3;
  const btns = list.map((g, i) => `<button data-act="groove-from-cad" data-i="${i}" class="cam-sim-btn ${same(g) ? 'cam-sim-btn-green' : 'cam-sim-btn-gray'}" style="font-size:11px;padding:4px 6px" title="Převzít zápich z výkresu: bok u ústí Z ${cz(g.zA)}, šířka ${cz(g.W)} mm, dno ⌀${cz(2 * g.rBot)} (stěna ⌀${cz(2 * g.rWall)})">Z ${cz(g.zA)} · š ${cz(g.W)} · ⌀${cz(2 * g.rBot)}</button>`).join('');
  return `<div class="cam-sim-row" style="align-items:center;flex-wrap:wrap;gap:4px">
      <span style="color:#a6adc8;font-size:11px">✏ Z výkresu:</span>${btns}
    </div>`;
}
