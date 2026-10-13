// Záložka ⚙ Parametry CAM simulátoru — HTML horních sekcí: stroj, bezpečná
// poloha + přídavky, Z/X meze a rozsah, materiál, nůž. Vyňato z camSimulator.js
// (renderParamsTab, docs/plan-rozdeleni-cam-simulatoru.md); události řeší
// attachParamsEvents. Vrací HTML řetězec.
import { MATERIALS } from './materials.js';
import { stockClearances, rapidFeedGap } from '../camMath.js';
import { holderInflate, holderInflateAll } from '../collisionValidator.js';
import { xBoundOn, xRangeAnyOn } from '../rangeX.js';
import { catalogSizeRowHTML } from '../catalogInsertSize.js';
import { _renderInsertShapeFieldsHTML } from '../insertPreview.js';

/** @param ctx { S, escHTML, escAttr } */
export function paramsPanelsHtml({ S, escHTML, escAttr }) {
  const prms = S.params;
  let html = '';
  const _structLabel = prms.machineStructure === 'lathe' ? 'Soustruh' : 'Karusel';
  const _ctrlLabel = prms.controlSystem === 'sinumerik' ? 'Sinumerik' : prms.controlSystem === 'fanuc' ? 'Fanuc' : 'Heidenhain';
  const _modeLabel = prms.mode === 'RADIUS' ? 'R Poloměr' : '⌀ Průměr';
  const _mcOpen = S.machineConfigOpen;
  html += `<button class="cam-sim-machine-toggle" data-act="machine-config-toggle">
    <span class="cam-sim-machine-summary">
      <span class="cam-sim-machine-chip">${_structLabel}</span>
      <span class="cam-sim-machine-chip">${_ctrlLabel}</span>
      <span class="cam-sim-machine-chip">${_modeLabel}</span>
    </span>
    <span class="cam-sim-machine-chevron">${_mcOpen ? '▲' : '▼'}</span>
  </button>
  <div class="cam-sim-machine-body${_mcOpen ? '' : ' cam-sim-collapsed'}">
    <div class="cam-sim-section-title">Struktura stroje</div>
    <div class="cam-sim-toggle-row">
      <button data-struct="lathe" class="${prms.machineStructure === 'lathe' ? 'cam-sim-active' : ''}">Soustruh</button>
      <button data-struct="carousel" class="${prms.machineStructure === 'carousel' ? 'cam-sim-active' : ''}">Karusel</button>
    </div>
    <div class="cam-sim-section-title">Řídicí systém</div>
    <div class="cam-sim-toggle-row">
      <button data-ctrl="sinumerik" class="${prms.controlSystem === 'sinumerik' ? 'cam-sim-active' : ''}">Sinumerik</button>
      <button data-ctrl="fanuc" class="${prms.controlSystem === 'fanuc' ? 'cam-sim-active' : ''}">Fanuc</button>
      <button data-ctrl="heidenhain" class="${prms.controlSystem === 'heidenhain' ? 'cam-sim-active' : ''}">Heidenhain</button>
    </div>
    <div class="cam-sim-row">
      <div class="cam-sim-field"><label>Osa X</label><button data-act="flipx-param" class="cam-sim-btn ${S.flipX ? 'cam-sim-btn-blue' : 'cam-sim-btn-gray'}" style="padding:4px 2px;font-size:11px">${S.flipX ? '⇅ X+ ↓' : '⇅ X+ ↑'}</button></div>
      <div class="cam-sim-field"><label>Osa Z</label><button data-act="flipz-param" class="cam-sim-btn ${S.flipZ ? 'cam-sim-btn-blue' : 'cam-sim-btn-gray'}" style="padding:4px 2px;font-size:11px">${S.flipZ ? '⇄ Z+ ←' : '⇄ Z+ →'}</button></div>
    </div>
    <div class="cam-sim-section-title">Programování</div>
    <div class="cam-sim-toggle-row">
      <button data-pmode="DIAMON" class="${prms.mode === 'DIAMON' ? 'cam-sim-active' : ''}">⌀ Průměr</button>
      <button data-pmode="RADIUS" class="${prms.mode === 'RADIUS' ? 'cam-sim-active' : ''}">R Poloměr</button>
    </div>
  </div>`;
  const _safeOpen = S.safetyConfigOpen;
  const _chActive = S.zLimits.chuckActive;
  const _koActive = S.zLimits.tailActive;
  const _zActive = S.zLimits.rangeActive;
  const _xActive = xRangeAnyOn(S.xLimits);
  const _cs = (on) => on
    ? 'background:rgba(166,227,161,0.18);border-color:rgba(166,227,161,0.5);color:#a6e3a1'
    : 'background:rgba(88,91,112,0.12);border-color:rgba(88,91,112,0.35);color:#585b70';
  html += `<button class="cam-sim-machine-toggle" data-act="safety-config-toggle">
    <span class="cam-sim-machine-summary">
      <span class="cam-sim-machine-chip">Bp ${prms.safeX}<span style="color:#1e1e2e;font-weight:900">/</span>${prms.safeZ}</span>
      <span class="cam-sim-machine-chip">Přídavek X${stockClearances(prms).x} Z${stockClearances(prms).z}</span>
      ${holderInflate(prms) > 0 ? `<span class="cam-sim-machine-chip" style="background:rgba(250,179,135,0.18);border-color:rgba(250,179,135,0.5);color:#fab387" title="Virtuální zvětšení držáku">Držák +${holderInflate(prms)} ${holderInflateAll(prms) ? '⭘' : (prms.roughingSide === 'left' ? '◀' : '▶')}</span>` : ''}
      <span class="cam-sim-machine-chip" style="display:inline-flex;gap:3px;align-items:center">
        <span style="color:${_chActive ? '#a6e3a1' : '#585b70'}" title="Čelisti">Č</span><span style="color:#45475a">/</span><span style="color:${_koActive ? '#a6e3a1' : '#585b70'}" title="Koník">K</span>
      </span>
      <span class="cam-sim-machine-chip" style="${_cs(_zActive)}" title="Rozsah Z">Z</span>
      <span class="cam-sim-machine-chip" style="${_cs(_xActive)}" title="Rozsah X">X</span>
    </span>
    <span class="cam-sim-machine-chevron">${_safeOpen ? '▲' : '▼'}</span>
  </button>
  <div class="cam-sim-machine-body${_safeOpen ? '' : ' cam-sim-collapsed'}">
    <div class="cam-sim-section-title">Bezpečná poloha</div>
    <div class="cam-sim-row">
      <div class="cam-sim-field"><label>X (Průměr)</label><input type="number" data-p="safeX" value="${prms.safeX}"></div>
      <div class="cam-sim-field"><label>Z</label><input type="number" data-p="safeZ" value="${prms.safeZ}"></div>
    </div>
    <div class="cam-sim-row">
      <div class="cam-sim-field" title="Přídavek kolem polotovaru radiálně (osa X): vzdálenost od povrchu polotovaru, kde končí rychloposuv — sjezd přes ni už jede pracovním posuvem G1 a dráha na tuhle čáru na konci řezu i vyjíždí. Hranice se kreslí tečkovaně kolem polotovaru."><label>Přídavek X (polo.)</label><input type="number" step="0.1" min="0.05" data-p="stockClearX" value="${stockClearances(prms).x}"></div>
      <div class="cam-sim-field" title="Přídavek kolem polotovaru axiálně (osa Z): vzdálenost od čela/hran polotovaru, kde končí rychloposuv a začíná pracovní posuv G1 — a kam dráha vyjíždí na konci řezu. Hranice se kreslí tečkovaně kolem polotovaru."><label>Přídavek Z (polo.)</label><input type="number" step="0.1" min="0.05" data-p="stockClearZ" value="${stockClearances(prms).z}"></div>
    </div>
    <div class="cam-sim-row">
      <div class="cam-sim-field" title="Jak daleko PŘED offsetovou (tečkovanou) čarou skončí rychloposuv a dál se pojede pracovním posuvem G1. Měří se od HRANY nosu, ne od programovaného bodu. Bez něj (0) nos dosedne přesně na tu čaru — a odlitek až u ní reálně být může, takže příjezd končí již v materiálu. Platí pro VŠECHNY příjezdy rychloposuvem."><label>Stop rychlop. před čarou</label><input type="number" step="0.1" min="0" data-p="rapidFeedGap" value="${rapidFeedGap(prms)}"></div>
      <div class="cam-sim-field" title="VIRTUÁLNÍ zvětšení držáku [mm]: jeho obrys se pro všechna hlídání — kolize, mezní čáry i plánování drah — zvětší o zadanou hodnotu, takže nůž drží od obrobku větší mezeru (házivost, otřep, dojezd těsně vedle čela). Sám nůž se nemění, 0 = obrys přesně jak je nakreslený. Tlačítkem vedle přepínáš, KAM se přídavek dává."><label>Virt. zvětšení držáku</label><div style="display:flex;gap:4px"><input type="number" step="0.1" min="0" data-p="holderInflate" value="${holderInflate(prms)}" style="flex:1;min-width:0"><button data-act="holder-inflate-mode" class="cam-sim-btn ${holderInflateAll(prms) ? 'cam-sim-btn-purple' : 'cam-sim-btn-gray'}" style="width:auto;padding:4px 7px;font-size:11px;white-space:nowrap" title="${holderInflateAll(prms) ? 'Přídavek je KOLEM CELÉHO držáku. Pozor — vzniká i U ŠPIČKY, a navalí-li držák přímo na destičku, zakáže jí zajet níž (např. při upichování). Klepnutím přepneš na jednu stranu.' : 'Přídavek je JEN ze strany, kam se obrábí — boční čelo držáku se odsune, spodní šikmá hrana se jen prodlouží pod svým úhlem. Špička, přední strana ani spodek se nemění a při změně strany hrubování se přídavek překlopí s ní. Klepnutím přepneš na celý obvod.'}">${holderInflateAll(prms) ? '⭘ dokola' : (prms.roughingSide === 'left' ? '◀ zleva' : '▶ zprava')}</button></div></div>
    </div>`;
  const zlOn = S.showZLimits === 'on';
  const zlLabel = zlOn ? 'Skrýt' : 'Zobrazit';
  html += `<div class="cam-sim-section-title">Z-limity / rozsah <button data-act="zlimits-toggle" class="cam-sim-btn ${zlOn ? 'cam-sim-btn-green' : 'cam-sim-btn-gray'}" style="width:auto;display:inline-flex;padding:2px 8px;font-size:11px;margin-left:8px">${zlLabel}</button></div>
    <small class="cam-sim-info-box" style="display:block">Čelisti / koník = bezpečnostní limity (červené). Rozsah = úsek kontury k obrábění (žluté). Na canvasu lze tahat myší.</small>
    <div class="cam-sim-row">
      <div class="cam-sim-field"><label style="display:flex;align-items:center;gap:4px"><input type="checkbox" data-act="chuck-active" ${S.zLimits.chuckActive ? 'checked' : ''}> ⛔ Čelisti Z</label><input type="number" step="0.5" data-zlim="chuck" value="${S.zLimits.chuck ?? ''}" placeholder="vypnuto"></div>
      <div class="cam-sim-field"><label style="display:flex;align-items:center;gap:4px"><input type="checkbox" data-act="tail-active" ${S.zLimits.tailActive ? 'checked' : ''}> ⛔ Koník Z</label><input type="number" step="0.5" data-zlim="tail" value="${S.zLimits.tail ?? ''}" placeholder="vypnuto"></div>
    </div>
    <label style="display:flex;align-items:center;gap:6px;font-size:11px;color:#cdd6f4;cursor:pointer;margin:4px 0 2px">
      <input type="checkbox" data-act="zrange-active" ${S.zLimits.rangeActive ? 'checked' : ''}> Rozsah Z — aktivovat pro generování drah
    </label>
    <div class="cam-sim-row">
      <div class="cam-sim-field"><label>◀ Rozsah start Z</label><input type="number" step="0.5" data-zlim="rangeStart" value="${S.zLimits.rangeStart ?? ''}" placeholder="vypnuto"></div>
      <div class="cam-sim-field"><label>Rozsah konec Z ▶</label><input type="number" step="0.5" data-zlim="rangeEnd" value="${S.zLimits.rangeEnd ?? ''}" placeholder="vypnuto"></div>
    </div>
    <div class="cam-sim-row" style="margin-top:4px">
      <div class="cam-sim-field" title="Dno obrábění: pod tenhle poloměr se nejede. Zaškrtávátkem se mez zapíná a vypíná, hodnota zůstane."><label style="display:flex;align-items:center;gap:4px"><input type="checkbox" data-act="xmin-active" ${xBoundOn(S.xLimits, 'min') ? 'checked' : ''}> ▼ Rozsah X min (∅/2)</label><input type="number" step="0.5" data-xlim="rangeXMin" value="${S.xLimits.rangeXMin ?? ''}" placeholder="vypnuto"></div>
      <div class="cam-sim-field" title="Strop obrábění: nad tenhle poloměr se neobrábí a pod materiál, který nad ním stojí, se nepodjíždí — obrábí se jen od volného konce po místo, kde polotovar vyleze nad čáru (pravidlo 12). Platí pro podélné, čelní i dokončování."><label style="display:flex;align-items:center;gap:4px"><input type="checkbox" data-act="xmax-active" ${xBoundOn(S.xLimits, 'max') ? 'checked' : ''}> Rozsah X max (∅/2) ▲</label><input type="number" step="0.5" data-xlim="rangeXMax" value="${S.xLimits.rangeXMax ?? ''}" placeholder="vypnuto"></div>
    </div>
    <div style="text-align:right;margin-top:2px"><button class="cam-sim-btn cam-sim-btn-gray" style="width:auto;display:inline-flex;padding:2px 8px;font-size:11px" data-act="zlimits-clear">Vymazat vše</button></div>
  </div>`;
  const _matOpen = S.materialConfigOpen;
  const _matLabel = S.selectedMaterial && MATERIALS[S.selectedMaterial]
    ? MATERIALS[S.selectedMaterial].name : '—';
  html += `<button class="cam-sim-machine-toggle" data-act="material-config-toggle">
    <span class="cam-sim-machine-summary">
      <span style="color:#a6adc8;font-size:11px">Materiál:</span>
      <span class="cam-sim-machine-chip">${_matLabel}</span>
    </span>
    <span class="cam-sim-machine-chevron">${_matOpen ? '▲' : '▼'}</span>
  </button>
  <div class="cam-sim-machine-body${_matOpen ? '' : ' cam-sim-collapsed'}">
    <div class="cam-sim-section-title">Databáze materiálů</div>
    <div class="cam-sim-mat-grid">${Object.keys(MATERIALS).map(k =>
      `<button data-mat="${k}" class="${S.selectedMaterial === k ? 'cam-sim-active' : ''}">${MATERIALS[k].name}</button>`
    ).join('')}</div>
  </div>`;
  const _toolOpen = S.toolConfigOpen;
  const _shapeIcon = prms.toolShape === 'round' ? '⬤' : prms.toolShape === 'parting' ? '▮' : prms.toolShape === 'threading' ? '▽' : prms.toolShape === 'drill' ? '⌀' : '◼';
  const _angleChip = prms.toolShape === 'polygon'
    ? `<span class="cam-sim-machine-chip">${prms.toolAngle}°</span>`
    : prms.toolShape === 'threading' || prms.toolShape === 'drill'
      ? `<span class="cam-sim-machine-chip">${prms.toolTipAngle}°</span>` : '';
  const _vbdChip = prms.toolVbdCode
    ? `<span class="cam-sim-machine-chip" style="font-family:monospace;font-size:10px;letter-spacing:0.5px">${escHTML((prms.toolVbdCode || '').substring(0, 8))}</span>` : '';
  html += `<button class="cam-sim-machine-toggle" data-act="tool-config-toggle">
    <span class="cam-sim-machine-summary">
      <span style="color:#a6adc8;font-size:11px">Nástroj:</span>
      <span class="cam-sim-machine-chip">${prms.toolShape === 'threading' ? `⊔ ${prms.toolTipFlat}` : prms.toolShape === 'drill' ? `⌀ ${Math.round((parseFloat(prms.toolRadius) || 0) * 2000) / 1000}` : `R ${prms.toolRadius}`}</span>
      <span class="cam-sim-machine-chip">${_shapeIcon}</span>
      ${_angleChip}
      ${_vbdChip}
    </span>
    <span class="cam-sim-machine-chevron">${_toolOpen ? '▲' : '▼'}</span>
  </button>
  <div class="cam-sim-machine-body${_toolOpen ? '' : ' cam-sim-collapsed'}">
    <div class="cam-sim-row">
      <div class="cam-sim-field"><label>Max. otáčky (LIMS)</label><input type="number" data-p="lims" inputmode="numeric" value="${parseInt((prms.machineType || '').match(/LIMS=(\d+)/)?.[1]) || 2000}"></div>
      <div class="cam-sim-field"><label>Název nástroje</label><input type="text" data-p="toolName" inputmode="text" value="${escAttr(prms.toolName ?? '')}"></div>
    </div>
    <div class="cam-sim-section-title">
      <button data-act="open-magazine" class="cam-sim-btn cam-sim-btn-gray" style="width:auto;display:inline-flex;padding:2px 8px;font-size:11px" title="Zásobník nožů T1, T2… — v hlavičce okna i 🧰 Knihovna a 🔪 Geometrie aktuálního nástroje">🔧 Zásobník</button>
      ${prms.toolShape === 'threading' ? `<button data-act="open-threads" class="cam-sim-btn cam-sim-btn-gray" style="width:auto;display:inline-flex;padding:2px 8px;font-size:11px;margin-left:4px" title="Databáze závitů — výběr nastaví parametry operace Závit i úhel závitového plátku">🧵 Závity</button>` : ''}
    </div>
    ${_renderInsertShapeFieldsHTML(prms, { sizeRowHTML: catalogSizeRowHTML(prms) })}
  </div>`;
  return html;
}
