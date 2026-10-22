// Záložka ⚙ Parametry CAM simulátoru — HTML sekce Obrábění a jejích podzáložek
// (Hrub. / Hot. / Upich / Závit / Vrt. / Vyvrt.) + „🔄 Resetovat vše". Vyňato
// z camSimulator.js (renderParamsTab, docs/plan-rozdeleni-cam-simulatoru.md);
// události řeší attachParamsEvents. Vrací HTML řetězec.
import { getEffectivePlungeAngle } from '../camMath.js';
import { buildStockLoopRaw } from '../materialRemoval.js';
import { getInsert } from '../inserts/index.js';
import { computeThreadPassCuts } from '../threadHelpers.js';
import { drillGeom, drillAutoFaceZ } from '../ops/drill.js';
import { boreGeom } from '../ops/bore.js';
import { preDrillPlan, catalogDrillFor } from '../ops/borePreDrill.js';
import { boreChainFromState } from '../boreContour.js';
import { isoBoringBarDiameter } from '../../isoInternalTools.js';

/** @param ctx { S, escHTML, escAttr } */
export function paramsMachiningHtml({ S, escHTML, escAttr }) {
  const prms = S.params;
  let html = '';
  const _machOpen = S.machiningConfigOpen;
  const _fmtNum = (v) => String(v).replace('.', ',');
  const _stratIcon = prms.roughingStrategy === 'face' ? '↓' : '↔';
  const _sideIcon = prms.roughingSide === 'left' ? '→' : '←';
  const _phVal = parseFloat(prms.finishAllowance) || 0;
  const _pxVal = parseFloat(prms.allowanceX) || 0;
  const _pzVal = parseFloat(prms.allowanceZ) || 0;
  const _machChips = [
    prms.threadActive ? '🧵 závit!' : '',
    prms.drillActive ? '⌀ vrtání!' : '',
    prms.boreActive ? '◎ vyvrtávání!' : '',
    _phVal !== 0 ? `Ph${_fmtNum(prms.finishAllowance)}` : '',
    _pxVal !== 0 ? `PX${_fmtNum(prms.allowanceX)}` : '',
    _pzVal !== 0 ? `PZ${_fmtNum(prms.allowanceZ)}` : ''
  ].filter(Boolean);
  html += `<button class="cam-sim-machine-toggle" data-act="machining-config-toggle">
    <span class="cam-sim-machine-summary">
      <span style="color:#a6adc8;font-size:11px">Obrábění:</span>
      <span class="cam-sim-machine-chip">${_stratIcon}${_sideIcon}</span>
      ${_machChips.map(c => `<span class="cam-sim-machine-chip">${c}</span>`).join('')}
      <span class="cam-sim-machine-chip">ap${_fmtNum(prms.depthOfCut)}</span>
      <span class="cam-sim-machine-chip">F${_fmtNum(prms.feed)}</span>
    </span>
    <span class="cam-sim-machine-chevron">${_machOpen ? '▲' : '▼'}</span>
  </button>
  <div class="cam-sim-machine-body${_machOpen ? '' : ' cam-sim-collapsed'}">
    <div class="cam-sim-toggle-row">
      <button data-rough="face" class="${prms.roughingStrategy === 'face' ? 'cam-sim-active' : ''}">↓ Čelně (X)</button>
      ${getInsert(prms).longRoughing === false ? '' : `<button data-rough="longitudinal" class="${prms.roughingStrategy === 'longitudinal' ? 'cam-sim-active' : ''}">↔ Podélně (Z)</button>`}
    </div>
    <div class="cam-sim-toggle-row">
      <button data-side="left" class="${prms.roughingSide === 'left' ? 'cam-sim-active' : ''}" title="Druhá strana — zaber zleva doprava (zprava nelze, narazil by držák / geometrie destičky), omezeno 📐 Rozsahem obrábění">→ Zleva</button>
      <button data-side="right" class="${(prms.roughingSide || 'right') === 'right' ? 'cam-sim-active' : ''}" title="Zaber zprava doleva (standard)">← Zprava</button>
    </div>
    <div class="cam-sim-row">
      <div class="cam-sim-field"><label data-tooltip="Hrubovací offset = Rádius (R) + Přídavek X/Z + Přídavek na hotovo. Dokončovací offset = jen Rádius (R).">Přídavek na hotovo</label><input type="number" step="0.1" data-p="finishAllowance" value="${prms.finishAllowance}"></div>
      <div class="cam-sim-field"><label data-tooltip="Dodatečný přídavek jen ve směru X (radiálně) — přičte se k hrubovacímu offsetu navíc k Přídavku na hotovo.">Přídavek X</label><input type="number" step="0.1" data-p="allowanceX" value="${prms.allowanceX}"></div>
      <div class="cam-sim-field"><label data-tooltip="Dodatečný přídavek jen ve směru Z (podélně) — přičte se k hrubovacímu offsetu navíc k Přídavku na hotovo.">Přídavek Z</label><input type="number" step="0.1" data-p="allowanceZ" value="${prms.allowanceZ}"></div>
    </div>
    <div class="cam-sim-row">
      <div class="cam-sim-field"><label data-tooltip="Maximální hloubka záběru na jeden hrubovací zákrok (radiálně).">Hloubka (ap)</label><input type="number" step="0.5" data-p="depthOfCut" value="${prms.depthOfCut}"></div>
      <div class="cam-sim-field"><label data-tooltip="Posuv na otáčku [mm/ot] pro hrubovací dráhu.">Posuv (F)</label><input type="number" step="0.05" data-p="feed" value="${prms.feed}"></div>
    </div>
    <div class="cam-sim-row">
      <div class="cam-sim-field"><label data-tooltip="Řezná rychlost [m/min] pro výpočet otáček vřetene.">Rychlost (Vc)</label><input type="number" step="10" data-p="speed" value="${prms.speed}"></div>
      <div class="cam-sim-field"><label data-tooltip="Vzdálenost bezpečného odskoku nástroje od obrobku mezi jednotlivými zákroky (zdvih v X).">Odskok</label><input type="number" step="0.5" data-p="retractDistance" value="${prms.retractDistance}"></div>
    </div>
    <div class="cam-sim-row">
      <div class="cam-sim-field"><label data-tooltip="Úhel odskoku: 45° = klasická diagonála (X i Z), 90° = svisle jen v ose X. Z-složka = Odskok / tan(úhel).">Úhel odsk. (°)</label><input type="number" step="5" min="5" max="90" data-p="retractAngle" value="${prms.retractAngle ?? 45}"></div>
      <div class="cam-sim-field"><label data-tooltip="Rychlost rychloposuvu G0 [mm/min] — pro odhad času programu (⏱) a pro přehrávání simulace v reálném čase (rychlost 1×). Do G-kódu se nezapisuje, G0 rychlost neuvádí.">Rychloposuv (G0)</label><input type="number" step="500" min="100" data-p="rapidFeed" value="${prms.rapidFeed ?? 6000}"></div>
    </div>`;
  html += `</div>`;
  const _machSubTab = S.machiningSubTab || 'hrub';
  html += `<div class="cam-sim-toggle-row" style="margin-top:6px">
    <button data-machtab="hrub" class="${_machSubTab === 'hrub' ? 'cam-sim-active' : ''}">Hrub.</button>
    <button data-machtab="hot" class="${_machSubTab === 'hot' ? 'cam-sim-active' : ''}">Hot.</button>
    <button data-machtab="upich" class="${_machSubTab === 'upich' ? 'cam-sim-active' : ''}">Upich</button>
    <button data-machtab="zavit" class="${_machSubTab === 'zavit' ? 'cam-sim-active' : ''}">Závit</button>
    <button data-machtab="vrt" class="${_machSubTab === 'vrt' ? 'cam-sim-active' : ''}">Vrtání</button>
    <button data-machtab="vyvrt" class="${_machSubTab === 'vyvrt' ? 'cam-sim-active' : ''}" title="Vyvrtávání díry vyvrtávací tyčí (vnitřní hrubování)">Vyvrt.</button>
  </div>`;
  // ── Režim z jiné záložky, který PŘEBÍJÍ hrubování ────────────────────
  // Závit i upichnutí mají v emisi early-return (generateAutoGCode) a vydají
  // JEN svůj cyklus; „jen dokončení" (Hot.) hrubovací průchody vynechá. Mimo
  // svou záložku to nebylo vidět a uživatel se divil, proč se místo
  // hrubovacích drah generuje cizí cyklus — nebo nic (nález 26. 8. 2026,
  // dosud hlásil jen závit). Pořadí odpovídá pořadí early-returnů v emisi,
  // takže se ukáže vždy jen ten režim, který program OPRAVDU řídí.
  const _poActiveNote = prms.partOffZ != null && isFinite(parseFloat(prms.partOffZ));
  const _modeNote = prms.threadActive ? {
    tab: 'zavit',
    text: `Je aktivní <b>závitování</b> (${prms.threadName || `⌀${prms.threadDiameter}×${prms.threadPitch}`}) — program obsahuje jen závitovací cyklus, hrubování/dokončování se negeneruje.`,
    act: 'thread-deactivate', label: 'Vypnout závit',
  } : _poActiveNote ? {
    tab: 'upich',
    text: `Je aktivní <b>upichnutí</b> (Z=${parseFloat(prms.partOffZ).toFixed(2)}) — program obsahuje jen upichovací cyklus, hrubování/dokončování se negeneruje.`,
    act: 'partoff-clear', label: 'Zrušit upich',
  } : prms.drillActive ? {
    tab: 'vrt',
    text: `Aktivní nástroj je <b>vrták</b> (⌀${Math.round((parseFloat(prms.toolRadius) || 0) * 2000) / 1000}, hloubka ${prms.drillDepth}) — vrták umí jen vrtat, program obsahuje jen vrtací cyklus. Pro hrubování/dokončování vyber soustružnický nůž.`,
    act: 'drill-pick-tool', label: '🔧 Jiný nůž',
  } : prms.boreActive ? {
    tab: 'vyvrt',
    text: `Je aktivní <b>vyvrtávání</b> (⌀${prms.boreDiameter} × ${prms.boreDepth}) — program obsahuje jen vyvrtávání díry, vnější hrubování/dokončování se negeneruje.`,
    act: 'bore-deactivate', label: 'Vypnout vyvrtávání',
  } : prms.finishOnly ? {
    tab: 'hot',
    text: 'Je zapnutá <b>jen dokončovací operace</b> (záložka Hot.) — hrubovací průchody se negenerují, jede se jediný průchod po kontuře.',
    act: 'finishonly-off', label: 'Vypnout',
  } : null;
  if (_modeNote && _machSubTab !== _modeNote.tab) {
    html += `<small class="cam-sim-info-box" style="display:block;margin-top:4px;color:#fab387">⚠ ${_modeNote.text}
      <button data-act="${_modeNote.act}" style="margin-left:6px;padding:1px 8px;font-size:10px;background:#313244;border:1px solid #45475a;border-radius:4px;cursor:pointer;color:#a6e3a1">${_modeNote.label}</button></small>`;
  }
  // Hlídání platí pro KAŽDÝ tvar plátku, ne jen polygon: kromě bočního
  // ostří polygonu hlídá i DRŽÁK (hrubování, dokončování, zbytek
  // polotovaru). Dřív se zaškrtávátko kreslilo jen u polygonu, takže
  // s kulatou destičkou na čistém prohlížeči (výchozí false) nešlo zapnout
  // a dokončování zprava sjelo po levém čele až k ose — držák skrz díl
  // (nález uživatele z mobilu 1. 10. 2026).
  {
    const totalGuideCount = (S.guideLines || []).length;
    html += `<div class="cam-sim-checkbox-row" data-tooltip="Hrubování i dokončování se upraví tak, aby destička (u polygonu boční ostří: natočení + vrcholový úhel) ani DRŽÁK nezajely do kontury ani do nevyhrubovaného polotovaru. Dokončování vynechá úseky, kam nástroj z dané strany nedosáhne (např. odvrácené čelo).">
      <input type="checkbox" id="cam-sim-respect-insert" ${prms.respectInsertGeometry ? 'checked' : ''}>
      <span>Hlídat geometrii (destička + držák)</span>
      ${totalGuideCount > 0 ? `<button data-act="clear-insert-guides" title="Smazat konstrukční čáry vygenerované hlídáním destičky (${totalGuideCount} čar)" style="margin-left:6px;padding:1px 7px;font-size:10px;background:#313244;border:1px solid #45475a;border-radius:4px;cursor:pointer;color:#fab387">🧹 ${totalGuideCount}</button>` : ''}
    </div>`;
  }
  if (_machSubTab === 'hrub') {
    html += `<div class="cam-sim-checkbox-row" data-tooltip="Po dojezdu hrubovacího průchodu na offset nástroj dál sleduje konturu (G1/G2/G3) až na hloubku dalšího průchodu, místo okamžitého odskoku — schody mezi kroky se obrobí přímo po obrysu.&#10;&#10;„i u čelního“: dojíždět i po ČELNÍCH (radiálních) stěnách — tedy tam, kde dojezd stoupá v X víc, než ujede v Z. Bez zaškrtnutí průchod u takové stěny skončí a odskočí (schod dobere čelní operace); u čela vzniklého mezní čárou hlídání destičky by dojezd stejně jen kopíroval limit plátku. Kuželové a válcové stěny se dojíždí vždy.">
      <input type="checkbox" id="cam-sim-nostep" ${prms.noStepRoughing ? 'checked' : ''}>
      <span>Hrub. bez schodků</span>
      ${prms.noStepRoughing ? `<span style="color:#45475a;margin:0 4px">|</span><input type="checkbox" id="cam-sim-nostep-face" ${prms.noStepRoughingFace ? 'checked' : ''}><span>i u čelního</span>` : ''}
    </div>`;
    const effPlunge = Math.round(getEffectivePlungeAngle(prms) * 10) / 10;
    // Upichovák zanořuje vždy kolmo (klíč `plungeFixed` plátku) — řádek se skryje.
    const plungeFixedUI = !!getInsert(prms).plungeFixed;
    const clearDegUI = parseFloat(prms.toolClearanceAngle) || 0;
    // Značka „⚠ α" smí svítit jen tehdy, když úhel hřbetu VÁŽNĚ srazil auto
    // hodnotu. Dřív si UI počítalo neořízlý úhel vlastním vzorcem (pro
    // nepolygonální destičku napevno 45°), jenže getEffectivePlungeAngle na
    // ně α vůbec neuplatňuje (upichovák 90°, kulatá 45°) → s nastaveným α
    // svítilo varování u hodnoty, kterou nic neomezilo. Ptáme se proto
    // rovnou zdroje pravdy: kolik by auto vydalo BEZ α.
    const plungeAutoNoAlpha = getEffectivePlungeAngle({ ...prms, entryAngleAuto: true, toolClearanceAngle: 0 });
    const plungeClampedByAlpha = prms.entryAngleAuto && clearDegUI > 0 && effPlunge < plungeAutoNoAlpha - 0.05;
    // Zanořování rampou umí jen PODÉLNÉ hrubování — čelní jede radiálně na
    // dané Z, žádná rampa v něm není. Přepínač proto v čelním režimu zůstává
    // vidět (ať je jasné, že existuje), ale je zašedlý a neaktivní: dokud
    // vypadal jako zapnutý, vypadalo to, že se nastavený úhel ignoruje.
    const plungeNA = prms.roughingStrategy === 'face';
    // Upichovák zanořuje vždy kolmo a podélně nehrubuje — řádek zanoření
    // se mu neukazuje vůbec (uživatel 25. 9. 2026: „ať to nezabírá místo").
    if (!plungeFixedUI) html += `<div class="cam-sim-row" style="align-items:center">
      <div class="cam-sim-field" style="flex:1"><label>&nbsp;</label>
        <label class="cam-sim-checkbox-item"${plungeNA ? ' style="opacity:.45"' : ''} data-tooltip="${plungeNA ? 'Neplatí pro ČELNÍ hrubování — to jede radiálně na danou hloubku Z, rampou se nezanořuje. Úhel zanoření se v čelním režimu použije jen na nájezd dokončování.' : 'Podélné hrubování smí rampou pod úhlem zanoření sjet i do kapes v kontuře.'}">
          <input type="checkbox" id="cam-sim-plunge" ${prms.plungeRoughing ? 'checked' : ''}${plungeNA ? ' disabled' : ''}>
          <span>Zanořování${plungeNA ? ' (jen podélně)' : ''}</span>
        </label>
      </div>
      <div class="cam-sim-field" style="flex:2" title="Úhel, pod kterým nástroj rampuje do materiálu (nájezd dokončování, zanořování do kapes).${plungeNA ? ' POZOR: při ČELNÍM hrubování se úhel uplatní jen na nájezd dokončování — samotné čelní průchody jedou radiálně, bez rampy.' : ''} Auto = úhel spodní hrany destičky (podélně: natočení; čelně: natočení + ε − 90; kulatá destička: 45°; upichovák: 90° = svisle). Je-li u POLYGONÁLNÍ destičky nastaven úhel hřbetu α, omezuje výsledek shora — hřbet destičky by kontaktoval materiál při strmějším zanoření; u kulaté, upichovací a závitové destičky se α do úhlu zanoření nepromítá."><label>Úhel zanoření (°)${plungeClampedByAlpha ? ` <span style="color:#fab387" title="Omezeno úhlem hřbetu α=${clearDegUI}°">⚠ α</span>` : ''}</label><input type="number" step="0.5" min="0.5" max="${prms.toolShape === 'parting' ? 90 : 89}" data-p="entryAngle" value="${effPlunge}"></div>
      <div class="cam-sim-field" style="flex:1"><label>&nbsp;</label><button data-act="plunge-auto" class="cam-sim-btn ${prms.entryAngleAuto ? 'cam-sim-btn-green' : 'cam-sim-btn-gray'}" style="padding:4px 8px;font-size:11px" title="Auto = dopočítat úhel ze spodní hrany destičky (u polygonální destičky omezeno úhlem hřbetu α, je-li nastaven)">${prms.entryAngleAuto ? '🔗 Auto' : 'Auto'}</button></div>
    </div>`;
    html += `<div class="cam-sim-checkbox-row" data-tooltip="Dráha nástroje přesně po kontuře (pouze s korekcí R).">
      <input type="checkbox" id="cam-sim-fin" ${prms.doFinishing ? 'checked' : ''}>
      <span>Dokončovací operace</span>
    </div>`;
    if (prms.doFinishing && S.toolMagazine.length > 1) {
      const finSlot = (prms.finishingSlot !== null && prms.finishingSlot !== undefined) ? S.toolMagazine[prms.finishingSlot] : null;
      html += `<div class="cam-sim-row" style="margin-top:6px;align-items:center">
        <div style="font-size:10px;color:#6c7086;white-space:nowrap;padding-right:6px">Nástroj dok.:</div>
        <select id="cam-sim-fin-slot" style="flex:1;background:#313244;color:#cdd6f4;border:1px solid #45475a;border-radius:4px;padding:3px 6px;font-size:11px">
          <option value="" ${!finSlot ? 'selected' : ''}>— Stejný nástroj —</option>
          ${S.toolMagazine.map((s, i) => (s && s.shape === 'mill' ? '' : `<option value="${i}" ${prms.finishingSlot === i ? 'selected' : ''}>T${s.slot} ${escHTML(s.name ?? '')}${s.vbdCode ? ' · ' + escHTML(s.vbdCode) : ''}</option>`)).join('')}
        </select>
        ${finSlot ? `<span class="cam-sim-machine-chip" style="margin-left:4px;font-family:monospace">R${finSlot.radius}</span>` : ''}
      </div>`;
      if (finSlot) html += `<small class="cam-sim-info-box" style="display:block;margin-top:2px">T${finSlot.slot} · Vc ${finSlot.vc} m/min · f ${finSlot.f} mm/ot · ap ${finSlot.ap} mm — výměna nástroje se vloží před dokončování.</small>`;
    }
  } else if (_machSubTab === 'hot') {
    html += `<div class="cam-sim-checkbox-row" data-tooltip="Jen dokončení: vynechá hrubovací průchody a objede konturu jediným dokončovacím průchodem (přesně po kontuře, jen s korekcí R) — jako závěrečná dráha v Hrub. Použij, když hrubování dělá jiná operace/nástroj a tady se jede pouze načisto.">
      <input type="checkbox" id="cam-sim-finonly" ${prms.finishOnly ? 'checked' : ''}>
      <span>Dokončovací operace</span>
    </div>`;
    if (prms.finishOnly && S.toolMagazine.length > 1) {
      const finSlot = (prms.finishingSlot !== null && prms.finishingSlot !== undefined) ? S.toolMagazine[prms.finishingSlot] : null;
      html += `<div class="cam-sim-row" style="margin-top:6px;align-items:center">
        <div style="font-size:10px;color:#6c7086;white-space:nowrap;padding-right:6px">Nástroj dok.:</div>
        <select id="cam-sim-fin-slot" style="flex:1;background:#313244;color:#cdd6f4;border:1px solid #45475a;border-radius:4px;padding:3px 6px;font-size:11px">
          <option value="" ${!finSlot ? 'selected' : ''}>— Stejný nástroj —</option>
          ${S.toolMagazine.map((s, i) => (s && s.shape === 'mill' ? '' : `<option value="${i}" ${prms.finishingSlot === i ? 'selected' : ''}>T${s.slot} ${escHTML(s.name ?? '')}${s.vbdCode ? ' · ' + escHTML(s.vbdCode) : ''}</option>`)).join('')}
        </select>
        ${finSlot ? `<span class="cam-sim-machine-chip" style="margin-left:4px;font-family:monospace">R${finSlot.radius}</span>` : ''}
      </div>`;
      if (finSlot) html += `<small class="cam-sim-info-box" style="display:block;margin-top:2px">T${finSlot.slot} · Vc ${finSlot.vc} m/min · f ${finSlot.f} mm/ot · ap ${finSlot.ap} mm — výměna nástroje se vloží před dokončování.</small>`;
    } else if (!prms.finishOnly) {
      html += `<small class="cam-sim-info-box" style="display:block;margin-top:4px">Objede konturu na hotovo bez hrubování (stejná dráha jako závěrečné dokončení v Hrub.).</small>`;
    }
  } else if (_machSubTab === 'upich') {
    const _poActive = prms.partOffZ != null && isFinite(parseFloat(prms.partOffZ));
    const _shapeOk = prms.toolShape === 'round' || prms.toolShape === 'parting';
    html += `<div class="cam-sim-row" style="align-items:flex-end">
      <div class="cam-sim-field" style="flex:2"><label title="Upichnutí (part-off): klikni na canvas → v daném Z vznikne svislá úsečka kontury, kterou plátek obrobí zápichem s korekcí rádiusu a přídavky (jen kulatý / upichovací plátek). Prázdné = běžné zapichování/hrubování tvaru.">Upichnutí (part-off)</label>
        <button data-act="partoff-pick" class="cam-sim-btn ${S.partOffPickMode ? 'cam-sim-btn-green' : 'cam-sim-btn-gray'}" style="width:100%;font-size:11px;padding:5px 6px">${S.partOffPickMode ? '⊹ Klikni na canvas…' : (_poActive ? `✂️ Z=${parseFloat(prms.partOffZ).toFixed(2)} (změnit)` : '✂️ Ukázat bod')}</button>
      </div>
      <div class="cam-sim-field" style="flex:1"><label>&nbsp;</label><button data-act="partoff-clear" class="cam-sim-btn cam-sim-btn-gray" style="width:100%;font-size:11px;padding:5px 6px" ${_poActive || S.partOffPickMode ? '' : 'disabled'} title="Zrušit upichnutí — zpět na zapichování/hrubování tvaru">✖ Zrušit</button></div>
    </div>
    ${_poActive ? `${!_shapeOk ? `<small class="cam-sim-info-box" style="display:block;margin-top:4px;color:#f38ba8">⚠ Upichnutí podporuje jen kulatý / upichovací plátek — přepni tvar plátku (dráhy se nevygenerují).</small>` : ''}
    <div class="cam-sim-row">
      <div class="cam-sim-field"><label title="Dojezd: cílová radiální poloha SPODNÍ HRANY plátku. 0 = spodní hrana na osu (X0), 10 = hrana na X10. Střed pracovního rádiusu dojede na (Dojezd X + R).">Dojezd X</label><input type="number" step="0.1" data-p="allowanceX" value="${prms.allowanceX}"></div>
      <div class="cam-sim-field"><label title="Start X: radiální poloha SPODNÍ HRANY, kam se z povrchu polotovaru dojede RYCHLOPOSUVEM a teprve odtud jede posuv (užitečné v kapse — nástroj dojede blíž k ose bez řezání). 0 = zápich začne od povrchu polotovaru.">Start X</label><input type="number" step="0.1" data-p="partOffStartX" value="${prms.partOffStartX}"></div>
      <div class="cam-sim-field"><label title="Z rovina upichnutí (part-off) — souřadnice Z naklikaného bodu. Lze upravit i ručně.">Z upich</label><input type="number" step="0.01" data-p="partOffZ" value="${parseFloat(prms.partOffZ)}"></div>
    </div>
    <div class="cam-sim-row">
      <div class="cam-sim-field"><label title="TRVALÝ přídavek jen v ose Z — poslední (finální) dráha ho nechá stát, NEODEBÍRÁ se dokončováním. Posune finální rovinu řezu o tuto hodnotu.">Přídavek Z</label><input type="number" step="0.1" data-p="allowanceZ" value="${prms.allowanceZ}"></div>
      <div class="cam-sim-field"><label title="Přídavek NA HOTOVO (jen v ose Z): materiál nechaný na finální rovině. Hlavní dráha ho nechá stát VŽDY; jen se zapnutou Dokončovací operací ho odebere druhá (plynulá) dráha.">Přídavek na hotovo</label><input type="number" step="0.1" data-p="finishAllowance" value="${prms.finishAllowance}"></div>
    </div>
    <div class="cam-sim-checkbox-row" data-tooltip="Dokončovací (plynulá, nepeckovaná) dráha odebírající Přídavek na hotovo. Bez ní jede jen jeden zápich na finální rovinu.">
      <input type="checkbox" id="cam-sim-fin" ${prms.doFinishing ? 'checked' : ''}>
      <span>Dokončovací operace</span>
    </div>
    <div class="cam-sim-checkbox-row" data-tooltip="Zapnuto = hlavní zápich jede jedním plynulým posuvem F až na dno (bez peckování). Vypnuto = peckovaný cyklus (výjezdy pro lámání třísky dle polí níže).">
      <input type="checkbox" id="cam-sim-partoff-smooth" ${prms.partOffSmooth ? 'checked' : ''}>
      <span>Plynulé upichnutí (bez peckování)</span>
    </div>
    ${prms.partOffSmooth ? '' : `<div class="cam-sim-row">
      <div class="cam-sim-field"><label title="Peck: rychloposuvem zpět dolů až na tuto vzdálenost nad dno předchozího řezu, poslední úsek posuvem F.">Posuv posl. (mm)</label><input type="number" step="0.5" min="0" data-p="partingApproachFeed" value="${prms.partingApproachFeed}"></div>
      <div class="cam-sim-field"><label title="Vyjezd (peck): po jaké hloubce zanoření nástroj vyjede pro uvolnění třísek. (Sdílí pole „Odskok".)">Vyjezd/peck</label><input type="number" step="0.5" min="0.1" data-p="retractDistance" value="${prms.retractDistance}"></div>
    </div>`}` : ''}`;
  } else if (_machSubTab === 'zavit') {
    const _thName = prms.threadName || `⌀${prms.threadDiameter}×${prms.threadPitch}`;
    const _thCuts = computeThreadPassCuts(Math.max(0.01, parseFloat(prms.threadDepth) || 0.01), parseFloat(prms.threadPasses) || 0);
    const _thCmd = prms.controlSystem === 'fanuc' ? 'G32' : 'G33';
    html += `<div class="cam-sim-row" style="align-items:flex-end">
      <div class="cam-sim-field" style="flex:2"><label title="Vybrat závit z databáze (M, Tr, G, UNC…) — vyplní ⌀D, stoupání P, hloubku H a úhel profilu.">Závit</label>
        <button data-act="thread-pick" class="cam-sim-btn cam-sim-btn-gray" style="width:100%;font-size:11px;padding:5px 6px">🧵 ${prms.threadName ? `${_thName} (změnit)` : 'Vybrat závit…'}</button>
      </div>
      <div class="cam-sim-field" style="flex:1"><label>&nbsp;</label><button data-act="thread-toggle" class="cam-sim-btn ${prms.threadActive ? 'cam-sim-btn-green' : 'cam-sim-btn-gray'}" style="width:100%;font-size:11px;padding:5px 6px" title="Zapnout/vypnout generování závitovacího cyklu (nahrazuje hrubování — dráhy se přegenerují)">${prms.threadActive ? '✅ Aktivní' : 'Neaktivní'}</button></div>
    </div>`;
    html += `<div class="cam-sim-toggle-row">
      <button data-thext="1" class="${prms.threadExternal !== false ? 'cam-sim-active' : ''}" title="Vnější závit — přísuv z povrchu ⌀D dolů na dno profilu">Vnější</button>
      <button data-thext="0" class="${prms.threadExternal === false ? 'cam-sim-active' : ''}" title="Vnitřní závit — přísuv z předvrtané díry ⌀(D−2H) nahoru na ⌀D">Vnitřní</button>
    </div>`;
    const _thInfeed = prms.threadInfeed === 'flank' || prms.threadInfeed === 'alternate' ? prms.threadInfeed : 'radial';
    html += `<div style="margin-top:2px"><label style="font-size:10px;color:#6c7086">Přísuv</label></div>
    <div class="cam-sim-toggle-row">
      <button data-thinfeed="radial" class="${_thInfeed === 'radial' ? 'cam-sim-active' : ''}" title="Radiální (kolmý) přísuv — nástroj jede přímo v X, řežou obě strany profilu. Jednoduchý, pro menší stoupání.">⊥ Radiální</button>
      <button data-thinfeed="flank" class="${_thInfeed === 'flank' ? 'cam-sim-active' : ''}" title="Boční přísuv — start průchodu se posouvá v Z o hloubka·tan(ε/2), řeže jen jeden bok profilu (lepší odvod třísky, menší síly). Pro větší stoupání.">∠ Boční</button>
      <button data-thinfeed="alternate" class="${_thInfeed === 'alternate' ? 'cam-sim-active' : ''}" title="Střídavý (cik-cak) přísuv — boční posun střídá strany, boky profilu se řežou střídavě → rovnoměrné opotřebení špičky. Pro velká stoupání a Tr/Acme.">⇄ Střídavý</button>
    </div>`;
    html += `<div class="cam-sim-row">
      <div class="cam-sim-field"><label title="Jmenovitý (vnější) průměr závitu">⌀ D</label><input type="number" step="0.1" data-p="threadDiameter" value="${prms.threadDiameter}"></div>
      <div class="cam-sim-field"><label title="Stoupání závitu — v G-kódu jako ${_thCmd === 'G32' ? 'F' : 'K'} na řádku ${_thCmd}. Změna přepočítá hloubku H.">Stoupání P</label><input type="number" step="0.05" data-p="threadPitch" value="${prms.threadPitch}"></div>
      <div class="cam-sim-field"><label title="Hloubka profilu (radiálně) — auto z P a typu závitu, lze ručně přepsat">Hloubka H</label><input type="number" step="0.01" data-p="threadDepth" value="${prms.threadDepth}"></div>
    </div>
    <div class="cam-sim-row">
      <div class="cam-sim-field"><label title="Z začátku závitu (odtud se řeže směrem k Z konec)">Z start</label><input type="number" step="0.5" data-p="threadZStart" value="${prms.threadZStart}"></div>
      <div class="cam-sim-field"><label title="Z konce závitu">Z konec</label><input type="number" step="0.5" data-p="threadZEnd" value="${prms.threadZEnd}"></div>
      <div class="cam-sim-field"><label title="Náběh před Z start — dráha navíc na rozběh posuvu/synchronizaci (typ. 2–3×P)">Náběh</label><input type="number" step="0.5" min="0" data-p="threadRunIn" value="${prms.threadRunIn}"></div>
      <div class="cam-sim-field"><label title="Výběh za Z konec — 0 když závit končí v zápichu">Výběh</label><input type="number" step="0.5" min="0" data-p="threadRunOut" value="${prms.threadRunOut}"></div>
    </div>
    <div class="cam-sim-row">
      <div class="cam-sim-field"><label title="Počet řezných průchodů; 0 = auto podle hloubky (degresivní přísuv ~0,12 mm průměrně, první záběr ≤ 0,4 mm — např. M20×2,5 → 15 průchodů)">Průchody (0=auto)</label><input type="number" step="1" min="0" data-p="threadPasses" value="${prms.threadPasses}"></div>
      <div class="cam-sim-field"><label title="Jiskřící průchody (ap=0) na konci — vyhlazení boků">Jiskřící</label><input type="number" step="1" min="0" data-p="threadSpringPasses" value="${prms.threadSpringPasses}"></div>
      <div class="cam-sim-field"><label title="Kuželový závit — kuželovitost 1:k. 0 = válcový; 16 = trubkové BSPT/NPT (1:16, výběr z 🧵 Závity nastaví sám). Kladné = ⌀ roste směrem řezu (k Z konci), záporné = klesá. ⌀ D platí na Z startu; průchody jedou G33/G32 s X i Z.">Kužel 1:k</label><input type="number" step="1" data-p="threadTaperRatio" value="${prms.threadTaperRatio ?? 0}"></div>
    </div>`;
    if (prms.threadActive && prms.toolShape !== 'threading') {
      html += `<small class="cam-sim-info-box" style="display:block;margin-top:4px;color:#fab387">⚠ Aktivní závitování, ale tvar plátku není závitový (▽) — dráhy se vygenerují, plátek v simulaci nebude odpovídat.</small>`;
    }
    const _thInfeedTxt = _thInfeed === 'flank' ? 'boční přísuv' : _thInfeed === 'alternate' ? 'střídavý přísuv' : 'radiální přísuv';
    const _thTaper = parseFloat(prms.threadTaperRatio) || 0;
    html += `<small class="cam-sim-info-box" style="display:block;margin-top:4px">${_thCuts.length} průchodů (1. záběr ${_thCuts[0].toFixed(3)} mm) + ${Math.max(0, Math.round(parseFloat(prms.threadSpringPasses)) || 0)}× jiskřící · ${_thInfeedTxt}${_thTaper !== 0 ? ` · kužel 1:${Math.abs(_thTaper)} (Δ⌀ ${(Math.abs(Math.abs(parseFloat(prms.threadZEnd) - parseFloat(prms.threadZStart)) / _thTaper)).toFixed(2)} mm)` : ''} · ${_thCmd} ${_thCmd === 'G32' ? 'F' : 'K'}${prms.threadPitch} · G97 konst. otáčky${prms.threadActive ? '' : ' — zapni „Aktivní" pro vygenerování drah'}.</small>`;
  } else if (_machSubTab === 'vrt') {
    // Díry mimo osu z výkresu (poháněný vrták) — obsah plní cam/live/liveDrillUi.js.
    html += '<div class="cam-livedrill"></div>';
    // ── Vrtání v ose (ops/drill.js) ──
    const _dg = drillGeom(prms, { faceZ: drillAutoFaceZ(S), stockLoop: buildStockLoopRaw(prms, (S._cachedCalc || {}).stockPathSegments) });
    const _isDrill = prms.toolShape === 'drill';
    const _dD = Math.round(_dg.D * 1000) / 1000;
    html += `<div class="cam-sim-row" style="align-items:flex-end">
      <div class="cam-sim-field" style="flex:2"><label title="Nástroj vrták (⌀) ze 🔧 Zásobníku. Při zapnutí vrtání se vrták vybere sám (první ⌀ v pořadí T).">Vrták</label>
        <button data-act="drill-pick-tool" class="cam-sim-btn cam-sim-btn-gray" style="width:100%;font-size:11px;padding:5px 6px">${_isDrill ? `⌀ ${_dD} · σ ${prms.toolTipAngle}° · ${escHTML(prms.toolName || '')}` : '🔧 Vybrat vrták…'}</button>
      </div>
      <div class="cam-sim-field" style="flex:1"><label>&nbsp;</label>${_isDrill
        // Vrtání určuje nástroj (enforceInsertOperation): s vrtákem se vrtá
        // vždy, vypnout ho jde jen výběrem jiného nože — tlačítko by nic nedělalo.
        ? `<span class="cam-sim-btn cam-sim-btn-green" style="width:100%;font-size:11px;padding:5px 6px;cursor:default" title="Nástroj je vrták — program je vrtací cyklus. Pro hrubování vyber v 🔧 Zásobníku soustružnický nůž.">✅ Aktivní</span>`
        : `<button data-act="drill-toggle" class="cam-sim-btn cam-sim-btn-gray" style="width:100%;font-size:11px;padding:5px 6px" title="Vybere vrták ze 🔧 Zásobníku (první ⌀ v pořadí T) — s vrtákem je program vrtací cyklus (nahrazuje hrubování, dráhy se přegenerují)">Zapnout</button>`}</div>
    </div>`;
    html += `<div style="margin-top:2px"><label style="font-size:10px;color:#6c7086">Odvod třísky</label></div>
    <div class="cam-sim-toggle-row">
      <button data-drillmode="clear" class="${_dg.mode === 'clear' ? 'cam-sim-active' : ''}" title="Vyjíždění (jako G83): po každém záběru Q vrták rychloposuvem vyjede z díry (odvod třísky), vrátí se rychloposuvem až „Odskok" nad dno a vrtá dál. Pro hluboké díry.">⇡ Vyjíždění</button>
      <button data-drillmode="break" class="${_dg.mode === 'break' ? 'cam-sim-active' : ''}" title="Lámání třísky (jako G73): po každém záběru Q jen krátký odskok o „Odskok" a vrtá dál. Rychlejší, pro mělčí díry a dobře lámavé materiály.">↯ Lámání třísky</button>
    </div>`;
    html += `<div class="cam-sim-row">
      <div class="cam-sim-field"><label title="Z čela, kde díra začíná — od něj se měří hloubka (zprava ve směru −Z, zleva +Z). Prázdné = čelo dílu na straně obrábění (zprava nejvyšší Z kontury, zleva nejnižší).">Z čelo</label><input type="number" step="0.5" data-p="drillZStart" value="${_dg.zFaceAuto ? '' : prms.drillZStart}" placeholder="auto ${_dg.zFace.toFixed(2)}"></div>
      <div class="cam-sim-field"><label title="Hloubka díry od Z čela (kladná) — na špičku, nebo na plný ⌀ (zaškrtávátko níž). Když je vyplněné „Dno Z", platí ono.">Hloubka</label><input type="number" step="1" min="0" data-p="drillDepth" value="${(prms.drillZEnd !== null && prms.drillZEnd !== undefined && prms.drillZEnd !== '') ? Math.round(Math.abs(parseFloat(prms.drillZEnd) - _dg.zFace) * 1000) / 1000 : prms.drillDepth}"${(prms.drillZEnd !== null && prms.drillZEnd !== undefined && prms.drillZEnd !== '') ? ' disabled' : ''}></div>
      <div class="cam-sim-field"><label title="Do jaké hodnoty Z se vrtá (místo zadání hloubky). Prázdné = platí Hloubka. S ✔ „Hloubka na plný ⌀" je to Z dna plného ⌀ (špička jde ještě dál).">Dno Z</label><input type="number" step="0.5" data-p="drillZEnd" value="${(prms.drillZEnd !== null && prms.drillZEnd !== undefined) ? prms.drillZEnd : ''}" placeholder="— hloubka"></div>
      <div class="cam-sim-field"><label title="Bezpečná vzdálenost před Z čela (R rovina) — sem se dojede rychloposuvem, odtud jede posuv a sem vrták vyjíždí. Když polotovar přesahuje (neobrobené čelo, odlitek), R rovina se posune ven až za jeho vůli (offsetovou čáru).">Bezp. vzdál.</label><input type="number" step="0.5" min="0.1" data-p="drillClearance" value="${prms.drillClearance}"></div>
    </div>
    <div class="cam-sim-row">
      <div class="cam-sim-field"><label title="Hloubka jednoho záběru Q [mm]. 0 = celá díra na jeden zátah bez výjezdů. Typicky 0,5–1×⌀ (HSS), u hlubokých děr méně.">Záběr Q</label><input type="number" step="0.5" min="0" data-p="drillPeck" value="${prms.drillPeck}"></div>
      <div class="cam-sim-field"><label title="Lámání třísky: odskok po každém záběru. Vyjíždění: rychloposuvem zpět až na tuto vzdálenost nad dno, zbytek posuvem.">Odskok</label><input type="number" step="0.1" min="0.1" data-p="drillRetract" value="${prms.drillRetract}"></div>
      <div class="cam-sim-field"><label title="Prodleva na dně díry [s] — vyčištění dna (0 = bez prodlevy)">Prodleva (s)</label><input type="number" step="0.1" min="0" data-p="drillDwell" value="${prms.drillDwell}"></div>
    </div>
    <div class="cam-sim-row">
      <div class="cam-sim-field"><label title="Posuv vrtání [mm/ot] (sdílí pole Posuv F)">Posuv (f)</label><input type="number" step="0.01" data-p="feed" value="${prms.feed}"></div>
      <div class="cam-sim-field"><label title="Řezná rychlost [m/min] — z ní konstantní otáčky G97 n = Vc·1000 / (π·⌀), omezené LIMS (sdílí pole Rychlost Vc)">Rychlost (Vc)</label><input type="number" step="5" data-p="speed" value="${prms.speed}"></div>
    </div>
    <div class="cam-sim-checkbox-row" data-tooltip="Zapnuto = hloubka se měří na PLNÝ ⌀ vrtáku (dno díry válcové v zadané hloubce) — špička dojede dál o délku kužele ⌀/2 / tan(σ/2). Vypnuto = hloubka na špičku.">
      <input type="checkbox" id="cam-sim-drill-fulldia" ${prms.drillDepthFullDia ? 'checked' : ''}>
      <span>Hloubka na plný ⌀ (+ špička)</span>
    </div>`;
    if (!_isDrill) {
      html += `<small class="cam-sim-info-box" style="display:block;margin-top:4px;color:#f38ba8">⚠ Aktivní nástroj není vrták — vrtá se jen vrtákem. „Zapnout" ho vybere ze 🔧 Zásobníku (nebo 🧰 Knihovna → 📚 → Vrtáky, Nástroj → Tvar ⌀).</small>`;
    }
    html += `<small class="cam-sim-info-box" style="display:block;margin-top:4px">${_dg.targets.length} ${_dg.targets.length === 1 ? 'záběr' : _dg.targets.length < 5 ? 'záběry' : 'záběrů'} · čelo Z${_dg.zFace.toFixed(2)}${_dg.zFaceAuto ? ' (dílu)' : ''}${Math.abs(_dg.zEntry - _dg.zFace) > 0.01 ? ` · materiál v ose od Z${_dg.zEntry.toFixed(2)}` : ''} → dno špičky Z${_dg.zBottom.toFixed(2)} · ${(prms.roughingSide || 'right') === 'left' ? 'zleva (+Z)' : 'zprava (−Z)'} · G97 S${_dg.rpm}${_dg.dwell > 0 ? ` · prodleva ${_dg.dwell} s` : ''}${_isDrill ? '' : ' — vrtá se, až bude nástroj vrták'}. Když kontura dílu díru nemá, simulace ukáže vrtání červeně jako zajetí do hotové kontury.</small>`;
  } else if (_machSubTab === 'vyvrt') {
    // ── Vyvrtávání (ops/bore.js, pravidlo 13 — zrcadlo vnějšího hrubování) ──
    const _bsrc = prms.boreSource === 'cad' ? boreChainFromState(S) : null;
    const _bg = boreGeom(prms, _bsrc ? _bsrc.segs : null);
    const _fromCad = prms.boreSource === 'cad';
    const _barD = isoBoringBarDiameter(prms.toolName);
    html += `<div class="cam-sim-row" style="align-items:flex-end">
      <div class="cam-sim-field" style="flex:2"><label title="Vyvrtávací tyč ze 🔧 Zásobníku (📚 katalog → Vnitřní). Při zapnutí se vybere sama — nejtlustší, která se vejde do předvrtání.">Vyvrtávací tyč</label>
        <button data-act="bore-pick-tool" class="cam-sim-btn cam-sim-btn-gray" style="width:100%;font-size:11px;padding:5px 6px">${_barD ? `${escHTML(prms.toolName)} · ⌀${_barD}` : '🔧 Vybrat vyvrtávací tyč…'}</button>
      </div>
      <div class="cam-sim-field" style="flex:1"><label>&nbsp;</label><button data-act="bore-toggle" class="cam-sim-btn ${prms.boreActive ? 'cam-sim-btn-green' : 'cam-sim-btn-gray'}" style="width:100%;font-size:11px;padding:5px 6px" title="Zapnout/vypnout vyvrtávání (nahrazuje vnější hrubování — dráhy se přegenerují)">${prms.boreActive ? '✅ Aktivní' : 'Neaktivní'}</button></div>
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
    <div class="cam-sim-checkbox-row" data-tooltip="Díra je v polotovaru plná: program nejdřív vyvrtá předvrtání vrtákem ze 🔧 Zásobníku (špička skončí na dně + Přídavek Z) a pak vymění nástroj a vyvrtá díru tyčí. Vrták i tyč se vyberou samy — největší vrták, který se do díry vejde, a nejtlustší tyč do jeho díry.">
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
    </div>`;
    if (!_bg.ok) {
      html += `<small class="cam-sim-info-box" style="display:block;margin-top:4px;color:#f38ba8">⚠ ${escHTML(_bg.reason)}</small>`;
    } else {
      html += `<small class="cam-sim-info-box" style="display:block;margin-top:4px">Tyč sahá ${_bg.reach.toFixed(1)} mm od špičky k ose — do předvrtání ⌀${_bg.d0} se vejde · dráhy počítá vnější hrubování v zrcadle (pravidla 1–12, pravidlo 13) · ${(prms.roughingSide || 'right') === 'left' ? 'zleva (do díry k +Z)' : 'zprava (do díry k −Z)'}${prms.boreActive ? '' : ' — zapni „Aktivní" pro vygenerování drah'}.</small>`;
    }
  }
  html += `<div style="text-align:center;margin-top:16px">
    <button class="cam-sim-btn cam-sim-btn-red" style="width:auto;display:inline-flex" data-act="reset">🔄 Resetovat vše</button>
  </div>`;
  return html;
}
