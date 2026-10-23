// Pole záložky Upich + ⊚ Čelní — čelní (axiální) zápich, pravidlo 19
// (docs/cam-pravidla.md, schválil uživatel 23. 10. 2026; ops/grooveFace.js).
// Z čela = povrch (naklikaný bod), mezikruží ⌀d1–⌀d2, hloubka do čela.
import { grooveFaceGeom } from '../ops/grooveFace.js';
import { buildStockLoopRaw } from '../materialRemoval.js';
import { faceGroovesFromDrawing } from './grooveCad.js';

const cz = (v) => String(Math.round(v * 1000) / 1000).replace('.', ',');

/** @param S  stav simulátoru (polotovar části → bezpečné Z), jinak jen parametry */
export function faceGrooveFieldsHtml(prms, S = null) {
  let stock = null;
  try { stock = S && S._cachedCalc ? buildStockLoopRaw(prms, S._cachedCalc.stockPathSegments) : null; } catch { stock = null; }
  const g = grooveFaceGeom(prms, stock);
  const n = g.ok ? g.plunges.length : 0;
  const info = g.ok
    ? `Zápich ⌀${cz(2 * g.r1)}–${cz(2 * g.r2)} × ${cz(g.t)} mm do čela Z ${cz(g.zFace)}: ${n} ${n === 1 ? 'zápich' : n < 5 ? 'zápichy' : 'zápichů'} destičkou š ${cz(g.w)}${g.doFinish ? (g.chamfer > 0 ? ` + dokončení se sražením ${cz(g.chamfer)}×45°` : ' + dokončení vnitřní stěna → dno → vnější stěna') : ''}.`
    : `⚠ ${g.reason}`;
  return `<div class="cam-sim-row">
      <div class="cam-sim-field"><label title="Z čela, do kterého se zapichuje (naklikaný bod). Zprava jde zápich k −Z, zleva k +Z.">Z čela</label><input type="number" step="0.01" data-p="partOffZ" value="${parseFloat(prms.partOffZ)}"></div>
      <div class="cam-sim-field"><label title="Vnitřní průměr zápichu (vnitřní stěna mezikruží).">⌀ d1</label><input type="number" step="0.1" min="0" data-p="faceGrooveD1" value="${prms.faceGrooveD1}"></div>
      <div class="cam-sim-field"><label title="Vnější průměr zápichu (vnější stěna mezikruží). Šířka zápichu = (d2 − d1) / 2.">⌀ d2</label><input type="number" step="0.1" min="0" data-p="faceGrooveD2" value="${prms.faceGrooveD2}"></div>
      <div class="cam-sim-field"><label title="Hloubka zápichu od čela (osově) — nejvýš dosah čepele čelního nože.">Hloubka</label><input type="number" step="0.1" min="0" data-p="faceGrooveDepth" value="${prms.faceGrooveDepth}"></div>
    </div>
    <div class="cam-sim-row">
      <div class="cam-sim-field"><label title="TRVALÝ přídavek na stěnách zápichu (radiálně) — zůstane i po dokončení.">Přídavek X</label><input type="number" step="0.1" data-p="allowanceX" value="${prms.allowanceX}"></div>
      <div class="cam-sim-field"><label title="Přídavek NA HOTOVO na stěnách a dně: zápichy ho nechají stát, dokončovací dráha (je-li zapnutá) ho odebere.">Přídavek na hotovo</label><input type="number" step="0.1" data-p="finishAllowance" value="${prms.finishAllowance}"></div>
      <div class="cam-sim-field"><label title="Sražení hran zápichu 45° u čela [mm] — dělá ho jen Dokončovací operace. 0 = ostré hrany.">Sražení</label><input type="number" step="0.1" min="0" data-p="grooveChamfer" value="${prms.grooveChamfer || 0}"></div>
    </div>
    <small class="cam-sim-info-box" style="display:block;margin-top:4px${g.ok ? '' : ';color:#f38ba8'}">${info}</small>
    <div class="cam-sim-checkbox-row" data-tooltip="Dokončení: vnitřní stěna na dno, po dně k vnější stěně a po ní ven z čela (odebere Přídavek na hotovo, udělá sražení).">
      <input type="checkbox" id="cam-sim-fin" ${prms.doFinishing ? 'checked' : ''}>
      <span>Dokončovací operace</span>
    </div>
    <div class="cam-sim-checkbox-row" data-tooltip="Zapnuto = každý zápich jedním plynulým posuvem F až na dno (bez peckování). Vypnuto = peckovaný cyklus (výjezd před čelo).">
      <input type="checkbox" id="cam-sim-partoff-smooth" ${prms.partOffSmooth ? 'checked' : ''}>
      <span>Plynulý zápich (bez peckování)</span>
    </div>
    ${prms.partOffSmooth ? '' : `<div class="cam-sim-row">
      <div class="cam-sim-field"><label title="Peck: rychloposuvem zpět až na tuto vzdálenost před dno předchozího řezu, poslední úsek posuvem F.">Posuv posl. (mm)</label><input type="number" step="0.5" min="0" data-p="partingApproachFeed" value="${prms.partingApproachFeed}"></div>
      <div class="cam-sim-field"><label title="Vyjezd (peck): po jaké hloubce nástroj vyjede před čelo pro uvolnění třísek.">Vyjezd/peck</label><input type="number" step="0.5" min="0.1" data-p="retractDistance" value="${prms.retractDistance}"></div>
    </div>`}`;
}

/** Čelní zápichy nakreslené ve výkresu — tlačítka, která vyplní Z čela, ⌀d1, ⌀d2, hloubku a sražení. */
export function faceGrooveCadRowHtml(S) {
  const list = faceGroovesFromDrawing(S);
  if (!list.length) return '';
  const p = S.params;
  const eq = (a, b) => Math.abs((parseFloat(a) || 0) - b) < 1e-3;
  const same = (g) => eq(p.partOffZ, g.zFace) && eq(p.faceGrooveD1, g.d1) && eq(p.faceGrooveD2, g.d2) && eq(p.faceGrooveDepth, g.t) && eq(p.grooveChamfer, g.s || 0);
  const btns = list.map((g, i) => `<button data-act="groove-face-from-cad" data-i="${i}" class="cam-sim-btn ${same(g) ? 'cam-sim-btn-green' : 'cam-sim-btn-gray'}" style="font-size:11px;padding:4px 6px" title="Převzít čelní zápich z výkresu: čelo Z ${cz(g.zFace)}, ⌀${cz(g.d1)}–${cz(g.d2)}, hloubka ${cz(g.t)} mm${g.s ? `, sražení ${cz(g.s)}×45°` : ''}">Z ${cz(g.zFace)} · ⌀${cz(g.d1)}–${cz(g.d2)} · ${cz(g.t)}${g.s ? ` · ⦣${cz(g.s)}` : ''}</button>`).join('');
  return `<div class="cam-sim-row" style="align-items:center;flex-wrap:wrap;gap:4px">
      <span style="color:#a6adc8;font-size:11px">✏ Z výkresu:</span>${btns}
    </div>`;
}
