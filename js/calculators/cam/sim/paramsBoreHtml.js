// Záložka ⚙ Parametry → Obrábění → Hrub. + ◎ Vnitřní = VYVRTÁVÁNÍ díry
// vyvrtávací tyčí (ops/bore.js, pravidlo 13 — zrcadlo vnějšího hrubování).
// Dřív samostatná záložka „Vyvrt."; uživatel 22. 10. 2026 chtěl místo ní
// přepínač Vnější / Vnitřní pod Zleva / Zprava (sim/machSurface.js) — zapnutí
// vyvrtávání (tyč, předvrtání) proto obstarává přepínač, tady jsou jen pole.
// `finish` = Hot. + ◎ Vnitřní (jen dokončení v díře): díra je vyhrubovaná
// s přídavky — bez předvrtání vrtákem, záběru ap a „Dokončit stěnu díry".
// Vyňato z paramsMachiningHtml.js; vrací HTML řetězec.
import { boreGeom } from '../ops/bore.js';
import { preDrillPlan, catalogDrillFor } from '../ops/borePreDrill.js';
import { boreChainFromState } from '../boreContour.js';
import { isoBoringBarDiameter } from '../../isoInternalTools.js';

/** @param ctx { S, escHTML, finish? } */
export function paramsBoreHtml({ S, escHTML, finish = false }) {
  const prms = S.params;
  let html = '';
  const _bsrc = prms.boreSource === 'cad' ? boreChainFromState(S) : null;
  const _bg = boreGeom(prms, _bsrc ? _bsrc.segs : null);
  const _fromCad = prms.boreSource === 'cad';
  const _barD = isoBoringBarDiameter(prms.toolName);
  html += `<div class="cam-sim-row" style="align-items:flex-end">
      <div class="cam-sim-field"><label title="Vyvrtávací tyč ze 🔧 Zásobníku (📚 katalog → Vnitřní). Při přepnutí na ◎ Vnitřní se vybere sama — nejtlustší, která se vejde do předvrtání.">Vyvrtávací tyč</label>
        <button data-act="bore-pick-tool" class="cam-sim-btn cam-sim-btn-gray" style="width:100%;font-size:11px;padding:5px 6px">${_barD ? `${escHTML(prms.toolName)} · ⌀${_barD}` : '🔧 Vybrat vyvrtávací tyč…'}</button>
      </div>
    </div>
    <div style="margin-top:2px"><label style="font-size:10px;color:#6c7086">Tvar díry</label></div>
    <div class="cam-sim-toggle-row">
      <button data-boresrc="cylinder" class="${_fromCad ? '' : 'cam-sim-active'}" title="Válcová díra ⌀ × délka zadaná čísly">⌀ Válec</button>
      <button data-boresrc="cad" class="${_fromCad ? 'cam-sim-active' : ''}" title="Díra nakreslená ve výkresu — samostatný řetěz (jedním koncem na čele, celý uvnitř dílu), nebo napojená na čelo dílu (uzavřený řez)">✏ Z výkresu</button>
    </div>
    ${_fromCad ? (_bsrc
      ? `<small class="cam-sim-info-box" style="display:block;margin-top:4px">Díra z výkresu (${_bsrc.source === 'separate' ? 'samostatný řetěz' : 'napojená na čelo'}): ⌀${(Math.round(_bg.D * 1000) / 1000)} × ${(Math.round(_bg.L * 1000) / 1000)} od Z${(Math.round(_bg.zF * 1000) / 1000)}, ${_bsrc.segs.length} ${_bsrc.segs.length < 5 ? 'úseky' : 'úseků'}.</small>`
      : '') : `<div class="cam-sim-row">
      <div class="cam-sim-field"><label title="Z čela, kde díra začíná">Z čelo</label><input type="number" step="0.5" data-p="boreZStart" value="${prms.boreZStart}"></div>
      <div class="cam-sim-field"><label title="Průměr díry po vyvrtání (hrubování na stěně nechá Přídavek X)">⌀ díry</label><input type="number" step="0.5" min="0" data-p="boreDiameter" value="${prms.boreDiameter}"></div>
      <div class="cam-sim-field"><label title="Délka díry od Z čela (kladná)">Délka</label><input type="number" step="1" min="0" data-p="boreDepth" value="${prms.boreDepth}"></div>
    </div>`}
    ${finish ? finishFieldsHtml(prms) : `<div class="cam-sim-checkbox-row" data-tooltip="Díra je v polotovaru plná: program nejdřív vyvrtá předvrtání vrtákem ze 🔧 Zásobníku (špička skončí na dně + Přídavek Z) a pak vymění nástroj a vyvrtá díru tyčí. Vrták i tyč se vyberou samy — největší vrták, který se do díry vejde, a nejtlustší tyč do jeho díry.">
      <input type="checkbox" id="cam-sim-bore-predrill" ${prms.borePreDrill ? 'checked' : ''}>
      <span>Předvrtat vrtákem (z plného)</span>
    </div>
    ${prms.borePreDrill ? (() => {
      const pl = preDrillPlan(S);
      const drills = (S.toolMagazine || []).map((t, i) => ({ t, i })).filter(({ t }) => t && t.shape === 'drill');
      const f2 = (v) => (Math.round(v * 100) / 100).toString().replace('.', ',');
      let info;
      if (pl.ok) {
        const zTip = pl.zF - pl.s * pl.depthTip, zL0 = pl.zF - pl.s * pl.L0;
        info = `Vrták ⌀${f2(pl.D)} (T${pl.slot.slot} ${escHTML(pl.slot.name || '')}) · špička do Z${f2(zTip)} (dno + přídavek Z) · plný ⌀ do Z${f2(zL0)} · pak výměna na tyč do předvrtání ⌀${f2(pl.D)}.`
          + (pl.L0 + Math.max(0, parseFloat(prms.allowanceZ) || 0) < pl.L - 1e-6
            ? ` Dno díry od Z${f2(zL0)} do Z${f2(pl.zF - pl.s * pl.L)} tyč podélně nevezme (opřela by se o kužel po vrtáku) — dobere ho čelně od osy ven (část „DNO DIRY“ programu).` : '');
      } else {
        const rec = pl.idx < 0 && pl.dMax > 0 ? catalogDrillFor(pl.dMax, pl.L - Math.max(0, parseFloat(prms.allowanceZ) || 0)) : null;
        info = `<span style="color:#f38ba8">⚠ ${escHTML(pl.reason || '')}</span>`
          + (rec ? ` <button data-act="bore-predrill-catalog" class="cam-sim-btn cam-sim-btn-gray" style="font-size:11px;padding:3px 6px;margin-top:4px">➕ ${escHTML(rec.name)} z 📚 katalogu do zásobníku</button>` : '');
      }
      return `<div class="cam-sim-row"><div class="cam-sim-field" style="flex:1"><label title="Vrták na předvrtání ze 🔧 Zásobníku. Automaticky = největší, který nechá na stěně přídavek + 1 mm a dosáhne na dno.">Vrták</label>
        <select id="cam-sim-bore-drill">
          <option value="" ${Number.isInteger(prms.borePreDrillSlot) ? '' : 'selected'}>automaticky${pl.ok && pl.auto ? ` (T${pl.slot.slot} ⌀${f2(pl.D)})` : ''}</option>
          ${drills.map(({ t, i }) => `<option value="${i}" ${prms.borePreDrillSlot === i ? 'selected' : ''}>T${t.slot} ${escHTML(t.name || '')} · ⌀${f2(2 * (parseFloat(t.radius) || 0))}</option>`).join('')}
        </select></div></div>
      <small class="cam-sim-info-box" style="display:block;margin-top:4px">${info}</small>`;
    })() : `<div class="cam-sim-row" style="align-items:flex-end">
      <div class="cam-sim-field"><label title="Průměr předvrtané díry — z ní se hrubuje">⌀ předvrtání</label><input type="number" step="0.5" min="0" data-p="borePreDiameter" value="${prms.borePreDiameter}"></div>
      <div class="cam-sim-field"><label title="Hloubka předvrtání na plný ⌀ (aspoň délka díry)">Hloubka předvrt.</label><input type="number" step="1" min="0" data-p="borePreDepth" value="${prms.borePreDepth}"></div>
      <div class="cam-sim-field"><label>&nbsp;</label><button data-act="bore-from-drill" class="cam-sim-btn cam-sim-btn-gray" style="width:100%;font-size:11px;padding:5px 6px" title="Převzít ⌀ a hloubku předvrtání z operace Vrtání (vrták ze 🔧 Zásobníku, hloubka na plný ⌀, Z čela)">↺ z Vrtání</button></div>
    </div>`}
    <div class="cam-sim-row">
      <div class="cam-sim-field"><label title="Hloubka záběru ap (sdílí pole hrubování)">Záběr (ap)</label><input type="number" step="0.1" data-p="depthOfCut" value="${prms.depthOfCut}"></div>
      <div class="cam-sim-field"><label title="Posuv [mm/ot] (sdílí pole Posuv F)">Posuv (f)</label><input type="number" step="0.01" data-p="feed" value="${prms.feed}"></div>
      <div class="cam-sim-field"><label title="Řezná rychlost [m/min] (sdílí pole Rychlost Vc)">Rychlost (Vc)</label><input type="number" step="5" data-p="speed" value="${prms.speed}"></div>
    </div>
    <div class="cam-sim-row">
      <div class="cam-sim-field"><label title="Přídavek na stěně díry (radiálně, sdílí Přídavek X)">Přídavek X</label><input type="number" step="0.05" data-p="allowanceX" value="${prms.allowanceX}"></div>
      <div class="cam-sim-field"><label title="Přídavek na dně díry (sdílí Přídavek Z)">Přídavek Z</label><input type="number" step="0.05" data-p="allowanceZ" value="${prms.allowanceZ}"></div>
    </div>
    <div class="cam-sim-checkbox-row" data-tooltip="Po hrubování jeden dokončovací průchod po stěně díry (sražení, schody, dno) týmž nástrojem — jako vnější dokončení, jen v díře. Na stěně zůstane jen Přídavek na dokončení (Ph).">
      <input type="checkbox" id="cam-sim-bore-finish" ${prms.boreFinish ? 'checked' : ''}>
      <span>Dokončit stěnu díry</span>
    </div>`}`;
  if (!_bg.ok) {
    html += `<small class="cam-sim-info-box" style="display:block;margin-top:4px;color:#f38ba8">⚠ ${escHTML(_bg.reason)}</small>`;
  } else {
    html += `<small class="cam-sim-info-box" style="display:block;margin-top:4px">${finish
      ? `Jen dokončení: díra se bere jako vyhrubovaná s přídavky (stěna ${fmt(allowRad(prms))}, dno ${fmt(allowAx(prms))} mm) · tyč sahá ${_bg.reach.toFixed(1)} mm od špičky k ose · dráhu počítá vnější Hot. v zrcadle (pravidlo 13)`
      : `Tyč sahá ${_bg.reach.toFixed(1)} mm od špičky k ose — do předvrtání ⌀${_bg.d0} se vejde · dráhy počítá vnější hrubování v zrcadle (pravidla 1–12, pravidlo 13)`} · ${(prms.roughingSide || 'right') === 'left' ? 'zleva (do díry k +Z)' : 'zprava (do díry k −Z)'}.</small>`;
  }
  return html;
}

const num = (v) => Math.max(0, parseFloat(v) || 0);
const fmt = (v) => String(Math.round(v * 1000) / 1000).replace('.', ',');
const allowRad = (prms) => num(prms.finishAllowance) + num(prms.allowanceX);
const allowAx = (prms) => num(prms.finishAllowance) + num(prms.allowanceZ);

/** Jen dokončení v díře: předvrtání (dno díry končí u něj), posuv a přídavky vyhrubované díry. */
function finishFieldsHtml(prms) {
  return `${prms.borePreDrill
    ? `<small class="cam-sim-info-box" style="display:block;margin-top:4px">Předvrtání ⌀${prms.borePreDiameter} × ${prms.borePreDepth} z vrtáku (Hrub. + ◎ Vnitřní ho vrtá) — tady se nevrtá.</small>`
    : `<div class="cam-sim-row">
      <div class="cam-sim-field"><label title="Průměr předvrtané díry — dno díry se dokončí až k němu">⌀ předvrtání</label><input type="number" step="0.5" min="0" data-p="borePreDiameter" value="${prms.borePreDiameter}"></div>
      <div class="cam-sim-field"><label title="Hloubka předvrtání na plný ⌀">Hloubka předvrt.</label><input type="number" step="1" min="0" data-p="borePreDepth" value="${prms.borePreDepth}"></div>
    </div>`}
    <div class="cam-sim-row">
      <div class="cam-sim-field"><label title="Posuv [mm/ot] (sdílí pole Posuv F)">Posuv (f)</label><input type="number" step="0.01" data-p="feed" value="${prms.feed}"></div>
      <div class="cam-sim-field"><label title="Řezná rychlost [m/min] (sdílí pole Rychlost Vc)">Rychlost (Vc)</label><input type="number" step="5" data-p="speed" value="${prms.speed}"></div>
    </div>
    <div class="cam-sim-row">
      <div class="cam-sim-field"><label title="Přídavek na hotovo, který po hrubování zůstal na stěně i na dně (sdílí pole Přídavek na hotovo)">Přídavek Ph</label><input type="number" step="0.05" data-p="finishAllowance" value="${prms.finishAllowance}"></div>
      <div class="cam-sim-field"><label title="Přídavek na stěně díry po hrubování navíc (sdílí Přídavek X)">Přídavek X</label><input type="number" step="0.05" data-p="allowanceX" value="${prms.allowanceX}"></div>
      <div class="cam-sim-field"><label title="Přídavek na dně díry po hrubování navíc (sdílí Přídavek Z)">Přídavek Z</label><input type="number" step="0.05" data-p="allowanceZ" value="${prms.allowanceZ}"></div>
    </div>`;
}
