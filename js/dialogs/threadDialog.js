// ╔══════════════════════════════════════════════════════════════╗
// ║  SKICA – Dialog nástroje Závit (na úsečce kontury)           ║
// ╚══════════════════════════════════════════════════════════════╝
//
// Výběr závitu z databáze (threadData.js) předfiltrovaný podle změřeného
// průměru vybrané úsečky + parametry kreslení: délka (zadáním nebo
// nakliknutím na výkrese), sražení na začátku, zápich DIN 76 na konci,
// konstrukční čáry d₂/d₃, srovnání průměru úsečky na jmenovitý.
//
// Kuželové závity (BSPT/NPT) záměrně chybí — na válcové úsečce nedávají
// smysl; kužel se kreslí zvlášť.

import { makeOverlay } from '../dialogFactory.js';
import { lookupDin76 } from '../calculators/dinGrooves.js';
import { mCoarse, mFine, trThreads, gThreads, uncThreads, unfThreads, bswThreads, acmeThreads } from '../calculators/threadData.js';

/** Typy závitů pro CAD nástroj (bez kuželových). */
export const THREAD_TOOL_TYPES = [
  { key: 'mc',   label: 'M hrubé (60°)',  angle: 60, data: mCoarse,     name: t => `M${t.D}` },
  { key: 'mf',   label: 'M jemné (60°)',  angle: 60, data: mFine,       name: t => `M${t.D}×${t.P}` },
  { key: 'tr',   label: 'Tr lichoběž. (30°)', angle: 30, data: trThreads, name: t => `Tr${t.D}×${t.P}` },
  { key: 'g',    label: 'G / BSP (55°)',  angle: 55, data: gThreads,    name: t => t.n },
  { key: 'unc',  label: 'UNC (60°)',      angle: 60, data: uncThreads,  name: t => `UNC ${t.n}` },
  { key: 'unf',  label: 'UNF (60°)',      angle: 60, data: unfThreads,  name: t => `UNF ${t.n}` },
  { key: 'bsw',  label: 'BSW (55°)',      angle: 55, data: bswThreads,  name: t => `BSW ${t.n}` },
  { key: 'acme', label: 'Acme (29°)',     angle: 29, data: acmeThreads, name: t => `Acme ${t.n}` },
  { key: 'custom', label: 'Vlastní (60°)', angle: 60, data: [], name: () => '' },
];

export function threadToolPitch(t) {
  return t.P !== undefined ? t.P : Math.round(25.4 / t.tpi * 10000) / 10000;
}

/** Průměry profilu d₂ (střední) a d₃ (dno šroubu) podle typu závitu. */
export function threadToolDiameters(typeKey, D, P) {
  if (typeKey === 'tr' || typeKey === 'acme') {
    return { d2: D - 0.5 * P, d3: D - 2 * (0.5 * P + 0.25) };          // ISO 2904 / ASME B1.5
  }
  if (typeKey === 'g' || typeKey === 'bsw') {
    return { d2: D - 0.6403 * P, d3: D - 2 * 0.6403 * P };             // Whitworth 55°
  }
  return { d2: D - 0.6495 * P, d3: D - 2 * 0.6134 * P };               // ISO / UN 60° (vnější)
}

/**
 * Otevře dialog nástroje Závit.
 * @param {object} ctx  – { measuredDia, lineLen, startSide ('right'|'left') }
 * @param {object|null} vals – dřívější hodnoty polí (návrat z nakliknutí délky)
 * @param {object} cb – { onConfirm(params), onPickLength(vals), onCancel() }
 */
export function showThreadToolDialog(ctx, vals, cb) {
  const v = vals || {};
  const body = `
    <div class="cnc-fields">
      <div style="font-size:12px;color:var(--ctp-subtext0);margin-bottom:6px">
        Úsečka: změřený ⌀ <strong>${ctx.measuredDia.toFixed(3)}</strong> mm · délka <strong>${ctx.lineLen.toFixed(3)}</strong> mm
      </div>
      <label class="cnc-field" title="Norma / typ závitu (kuželové BSPT/NPT se na válcové úsečce nekreslí)">
        <span>Typ závitu</span>
        <select data-id="type">${THREAD_TOOL_TYPES.map(t => `<option value="${t.key}">${t.label}</option>`).join('')}</select>
      </label>
      <label class="cnc-field thr-size-row" title="Velikost — předvybrána nejbližší podle změřeného průměru úsečky">
        <span>Velikost</span>
        <select data-id="size"></select>
      </label>
      <label class="cnc-field thr-custom-only" title="Jmenovitý (vnější) průměr vlastního závitu">
        <span>⌀ D [mm]</span>
        <input data-id="cd" type="number" value="20" min="0.5" step="0.5">
      </label>
      <label class="cnc-field thr-custom-only" title="Stoupání vlastního závitu">
        <span>Stoupání P [mm]</span>
        <input data-id="cp" type="number" value="1.5" min="0.1" step="0.05">
      </label>
      <label class="cnc-field" title="Ze kterého konce úsečky závit začíná (volný konec / čelo). Sražení se dělá na začátku, zápich na konci.">
        <span>Začátek závitu</span>
        <select data-id="side">
          <option value="right">Pravý konec (vyšší Z) →</option>
          <option value="left">Levý konec (nižší Z) ←</option>
        </select>
      </label>
      <label class="cnc-field" title="Délka závitu od začátku (včetně sražení, bez zápichu)">
        <span>Délka závitu [mm]</span>
        <input data-id="len" type="number" min="0.5" step="0.5">
      </label>
      <div style="margin:-2px 0 6px">
        <button class="thr-pick-len" style="background:var(--ctp-surface1);color:var(--ctp-text);padding:5px 12px;border:none;border-radius:4px;cursor:pointer;font-size:12px">⊹ Nakliknout konec na výkrese</button>
      </div>
      <label class="cnc-field" style="flex-direction:row;align-items:center;gap:6px" title="Úsečka (a napojené čáry) se posune na jmenovitý průměr závitu">
        <input data-id="adjust" type="checkbox" checked style="width:auto">
        <span data-id="adjustLabel" style="flex:1">Srovnat ⌀ na jmenovitý</span>
      </label>
      <label class="cnc-field" style="flex-direction:row;align-items:center;gap:6px" title="45° sražení na začátku závitu (pokud tam už šikmá hrana není). Standardně ≈ stoupání P.">
        <input data-id="chamfer" type="checkbox" checked style="width:auto">
        <span>Sražení na začátku</span>
        <input data-id="chsize" type="number" min="0.1" step="0.1" style="width:60px" title="Velikost sražení [mm] (45°)">
      </label>
      <label class="cnc-field" style="flex-direction:row;align-items:center;gap:6px" title="Zápich pro výběh závitu DIN 76 na konci závitu (rozměry podle stoupání P)">
        <input data-id="undercut" type="checkbox" checked style="width:auto">
        <span data-id="undercutLabel" style="flex:1">Zápich DIN 76 na konci</span>
      </label>
      <label class="cnc-field" style="flex-direction:row;align-items:center;gap:6px" title="Konstrukční čára na dně závitu d₃ — reference hloubky, hrubování do ní nezajede">
        <input data-id="d3" type="checkbox" checked style="width:auto">
        <span>Dno d₃ konstrukčně</span>
      </label>
      <label class="cnc-field" style="flex-direction:row;align-items:center;gap:6px" title="Konstrukční čára na středním průměru d₂">
        <input data-id="d2" type="checkbox" checked style="width:auto">
        <span>Střední ⌀ d₂ konstrukčně</span>
      </label>
      <label class="cnc-field" style="flex-direction:row;align-items:center;gap:6px" title="Textový popisek závitu nad úsečkou">
        <input data-id="label" type="checkbox" checked style="width:auto">
        <span>Popisek (např. M20)</span>
      </label>
      <div class="cnc-actions" style="margin-top:10px">
        <button class="thr-btn-draw" style="background:var(--ctp-green);color:var(--ctp-base);padding:8px 20px;border:none;border-radius:4px;cursor:pointer;font-weight:bold;font-size:14px">✏️ Nakreslit závit</button>
        <button class="thr-btn-cancel" style="background:var(--ctp-surface1);color:var(--ctp-text);padding:8px 16px;border:none;border-radius:4px;cursor:pointer">Zrušit</button>
      </div>
    </div>`;

  const overlay = makeOverlay('threadTool', '🧵 Závit na úsečce', body, 'cnc-window');
  if (!overlay) { cb.onCancel && cb.onCancel(); return; }

  const q = (id) => overlay.querySelector(`[data-id="${id}"]`);
  const typeSel = q('type'), sizeSel = q('size'), cdInp = q('cd'), cpInp = q('cp');
  const sideSel = q('side'), lenInp = q('len'), chChk = q('chamfer'), chInp = q('chsize');
  const customFields = overlay.querySelectorAll('.thr-custom-only');
  const sizeRow = overlay.querySelector('.thr-size-row');

  function typeDef() { return THREAD_TOOL_TYPES.find(t => t.key === typeSel.value) || THREAD_TOOL_TYPES[0]; }

  function currentDP() {
    const td = typeDef();
    if (td.key === 'custom') return { D: parseFloat(cdInp.value) || 0, P: parseFloat(cpInp.value) || 0, name: `⌀${cdInp.value}×${cpInp.value}` };
    const t = td.data[parseInt(sizeSel.value)] || td.data[0];
    return { D: t.D, P: threadToolPitch(t), name: td.name(t) };
  }

  function fillSizes(preselectDia) {
    const td = typeDef();
    customFields.forEach(el => el.style.display = td.key === 'custom' ? '' : 'none');
    sizeRow.style.display = td.key === 'custom' ? 'none' : '';
    if (td.key === 'custom') return;
    let bestIdx = 0, bestDiff = Infinity;
    sizeSel.innerHTML = td.data.map((t, i) => {
      const diff = Math.abs(t.D - preselectDia);
      if (diff < bestDiff) { bestDiff = diff; bestIdx = i; }
      return `<option value="${i}">${td.name(t)}  (⌀${t.D} · P${threadToolPitch(t)})</option>`;
    }).join('');
    sizeSel.value = String(bestIdx);
  }

  function refreshDerived() {
    const { D, P } = currentDP();
    // Sražení default ≈ P (jen když ho uživatel ručně nezměnil → přepisujeme vždy při změně velikosti)
    chInp.value = Math.max(0.2, Math.round(P * 10) / 10);
    const uc = lookupDin76(P);
    q('undercutLabel').textContent = `Zápich DIN 76 na konci (f${uc.f}×t${uc.t})`;
    q('adjustLabel').textContent = `Srovnat ⌀ na jmenovitý (${ctx.measuredDia.toFixed(3)} → ${D.toFixed(3)})`;
  }

  // ── Inicializace polí (nové otevření vs. návrat z nakliknutí délky) ──
  typeSel.value = v.typeKey || 'mc';
  fillSizes(ctx.measuredDia);
  if (v.sizeIdx !== undefined && typeSel.value !== 'custom') sizeSel.value = String(v.sizeIdx);
  if (v.customD !== undefined) cdInp.value = v.customD;
  if (v.customP !== undefined) cpInp.value = v.customP;
  sideSel.value = v.startSide || ctx.startSide || 'right';
  lenInp.value = v.len !== undefined ? v.len : Math.round(ctx.lineLen * 100) / 100;
  refreshDerived();
  if (v.chamferSize !== undefined) chInp.value = v.chamferSize;
  if (v.chamfer !== undefined) chChk.checked = v.chamfer;
  if (v.undercut !== undefined) q('undercut').checked = v.undercut;
  if (v.adjust !== undefined) q('adjust').checked = v.adjust;
  if (v.drawD2 !== undefined) q('d2').checked = v.drawD2;
  if (v.drawD3 !== undefined) q('d3').checked = v.drawD3;
  if (v.label !== undefined) q('label').checked = v.label;

  typeSel.addEventListener('change', () => { fillSizes(ctx.measuredDia); refreshDerived(); });
  sizeSel.addEventListener('change', refreshDerived);
  cdInp.addEventListener('input', refreshDerived);
  cpInp.addEventListener('input', refreshDerived);

  function collectVals() {
    return {
      typeKey: typeSel.value,
      sizeIdx: parseInt(sizeSel.value) || 0,
      customD: parseFloat(cdInp.value) || 0,
      customP: parseFloat(cpInp.value) || 0,
      startSide: sideSel.value,
      len: parseFloat(lenInp.value) || 0,
      chamfer: chChk.checked,
      chamferSize: parseFloat(chInp.value) || 0,
      undercut: q('undercut').checked,
      adjust: q('adjust').checked,
      drawD2: q('d2').checked,
      drawD3: q('d3').checked,
      label: q('label').checked,
    };
  }

  overlay.querySelector('.thr-pick-len').addEventListener('click', () => {
    overlay.remove();
    cb.onPickLength(collectVals());
  });

  overlay.querySelector('.thr-btn-draw').addEventListener('click', () => {
    const vals = collectVals();
    const { D, P, name } = currentDP();
    if (!(D > 0) || !(P > 0)) { alert('Neplatný průměr / stoupání závitu'); return; }
    if (!(vals.len > P)) { alert(`Délka závitu musí být větší než stoupání (${P} mm)`); return; }
    const td = typeDef();
    overlay.remove();
    cb.onConfirm({ ...vals, D, P, name, angle: td.angle });
  });
  overlay.querySelector('.thr-btn-cancel').addEventListener('click', () => {
    overlay.remove();
    cb.onCancel && cb.onCancel();
  });
}
