// 🧵 Výběr závitu z databáze (threadData.js — stejná data jako kalkulačka
// Závity v CAD). Klik na řádek vyplní parametry operace Závit (⌀D, P,
// hloubku H, úhel profilu) a přepne na záložku Závit. Vyňato z camSimulator.js
// (blok „thread picker dialog", docs/plan-rozdeleni-cam-simulatoru.md) —
// stav simulátoru a jeho funkce se předávají parametrem.
import { closeOnBackdropClick } from '../../../dialogFactory.js';
import { showToast } from '../../../state.js';
import { threadProfileDepth } from '../threadHelpers.js';
import { isoThreadInsertByCode } from '../../isoThreadInserts.js';
import { mCoarse, mFine, gThreads, trThreads, uncThreads, unfThreads, bswThreads, nptThreads, acmeThreads, bsptThreads } from '../../threadData.js';

export const THREAD_PICKER_TYPES = [
  { key: 'mc',   label: 'M hrubé',   angle: 60, data: mCoarse,    name: t => `M${t.D}` },
  { key: 'mf',   label: 'M jemné',   angle: 60, data: mFine,      name: t => `M${t.D}×${t.P}` },
  { key: 'tr',   label: 'Tr trap.',  angle: 30, data: trThreads,  name: t => `Tr${t.D}×${t.P}` },
  { key: 'g',    label: 'G (BSP)',   angle: 55, data: gThreads,   name: t => t.n },
  { key: 'bspt', label: 'BSPT kuž.', angle: 55, data: bsptThreads, name: t => t.n, taper: true },
  { key: 'npt',  label: 'NPT kuž.',  angle: 60, data: nptThreads, name: t => t.n, taper: true },
  { key: 'unc',  label: 'UNC',       angle: 60, data: uncThreads, name: t => `UNC ${t.n}` },
  { key: 'unf',  label: 'UNF',       angle: 60, data: unfThreads, name: t => `UNF ${t.n}` },
  { key: 'bsw',  label: 'BSW',       angle: 55, data: bswThreads, name: t => `BSW ${t.n}` },
  { key: 'acme', label: 'Acme',      angle: 29, data: acmeThreads, name: t => `Acme ${t.n}` },
];

/**
 * @param ctx { S, pushHistory, autoPickToolFor, applyChange }
 * @returns {{ showThreadPickerDialog }}
 */
export function createThreadPicker({ S, pushHistory, autoPickToolFor, applyChange }) {
  function showThreadPickerDialog() {
    const dlg = document.createElement('div');
    dlg.className = 'input-overlay';
    dlg.style.zIndex = '300';
    dlg.innerHTML = `
      <div class="input-dialog" style="min-width:340px;max-width:460px;width:100%;max-height:82vh;display:flex;flex-direction:column">
        <h3 style="margin:0 0 10px">🧵 Závity — výběr pro závitování</h3>
        <div id="thr-pick-types" style="display:grid;grid-template-columns:repeat(5,1fr);gap:4px;margin-bottom:8px"></div>
        <input type="text" id="thr-pick-filter" placeholder="Filtr…" style="background:#313244;color:#cdd6f4;border:1px solid #45475a;border-radius:4px;padding:5px 8px;font-size:12px;margin-bottom:8px">
        <div id="thr-pick-body" style="flex:1;overflow-y:auto;min-height:0;border:1px solid #313244;border-radius:6px"></div>
        <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:10px;border-top:1px solid #313244;padding-top:10px">
          <button class="btn-cancel" id="thr-pick-close">Zavřít</button>
        </div>
      </div>`;
    document.body.appendChild(dlg);

    let activeType = THREAD_PICKER_TYPES.find(t => t.key === S.params.threadType) || THREAD_PICKER_TYPES[0];
    const typesEl = dlg.querySelector('#thr-pick-types');
    const bodyEl = dlg.querySelector('#thr-pick-body');
    const filterEl = dlg.querySelector('#thr-pick-filter');

    function renderTypes() {
      typesEl.innerHTML = THREAD_PICKER_TYPES.map(t =>
        `<button data-thrtype="${t.key}" class="cam-sim-btn ${t.key === activeType.key ? 'cam-sim-btn-green' : 'cam-sim-btn-gray'}" style="font-size:10px;padding:4px 2px">${t.label}</button>`
      ).join('');
      typesEl.querySelectorAll('[data-thrtype]').forEach(btn => {
        btn.addEventListener('click', () => {
          activeType = THREAD_PICKER_TYPES.find(t => t.key === btn.dataset.thrtype);
          renderTypes(); renderRows();
        });
      });
    }

    function pitchOf(t) { return t.P !== undefined ? t.P : Math.round(25.4 / t.tpi * 10000) / 10000; }

    function renderRows() {
      const f = (filterEl.value || '').toLowerCase();
      const rows = activeType.data
        .map(t => ({ t, nm: activeType.name(t), P: pitchOf(t) }))
        .filter(r => !f || r.nm.toLowerCase().includes(f) || String(r.t.D).includes(f));
      let html = `<table style="width:100%;border-collapse:collapse;font-size:12px">
        <thead><tr style="color:#a6adc8;font-size:10px;text-align:left">
          <th style="padding:4px 8px">Závit</th><th style="padding:4px 8px">P mm</th><th style="padding:4px 8px">D mm</th>${activeType.data[0] && activeType.data[0].tpi !== undefined ? '<th style="padding:4px 8px">TPI</th>' : ''}
        </tr></thead><tbody>`;
      rows.forEach((r, i) => {
        html += `<tr data-thridx="${i}" style="cursor:pointer;border-top:1px solid #313244">
          <td style="padding:4px 8px;font-weight:600">${r.nm}</td>
          <td style="padding:4px 8px">${r.P}</td>
          <td style="padding:4px 8px">${r.t.D}</td>
          ${r.t.tpi !== undefined ? `<td style="padding:4px 8px;color:#6c7086">${r.t.tpi}</td>` : ''}
        </tr>`;
      });
      html += '</tbody></table>';
      if (rows.length === 0) html = '<div style="padding:14px;text-align:center;color:#6c7086;font-size:12px">Žádný závit neodpovídá filtru.</div>';
      bodyEl.innerHTML = html;
      bodyEl.querySelectorAll('[data-thridx]').forEach(tr => {
        tr.addEventListener('click', () => {
          const r = rows[parseInt(tr.dataset.thridx)];
          if (!r) return;
          applyThreadPick(activeType, r.t);
          dlg.remove();
        });
        tr.addEventListener('mouseenter', () => { tr.style.background = '#313244'; });
        tr.addEventListener('mouseleave', () => { tr.style.background = ''; });
      });
    }

    filterEl.addEventListener('input', renderRows);
    dlg.querySelector('#thr-pick-close').addEventListener('click', () => dlg.remove());
    closeOnBackdropClick(dlg, () => dlg.remove());
    renderTypes(); renderRows();
    filterEl.focus();
  }

  function applyThreadPick(typeDef, t) {
    // Při aktivním závitu může výběr vyměnit i nůž (autoPickToolFor) — jeden krok ↩.
    if (S.params.threadActive) pushHistory();
    const P = t.P !== undefined ? t.P : Math.round(25.4 / t.tpi * 10000) / 10000;
    const ext = S.params.threadExternal !== false;
    S.params.threadName = typeDef.name(t);
    S.params.threadType = typeDef.key;
    S.params.threadDiameter = t.D;
    S.params.threadPitch = P;
    S.params.threadAngle = typeDef.angle;
    S.params.threadDepth = Math.round(threadProfileDepth(typeDef.key, P, ext) * 1000) / 1000;
    // Kuželové trubkové závity (BSPT/NPT) mají kuželovitost 1:16.
    S.params.threadTaperRatio = typeDef.taper ? 16 : 0;
    // Závitový plátek přebírá úhel profilu; náběh standardně 2×P (min 2 mm).
    S.params.threadRunIn = Math.max(2, Math.round(2 * P * 10) / 10);
    // Při AKTIVNÍM závitování vybrat ze zásobníku nůž s úhlem nového profilu
    // (autoPickToolFor); jinak jako dřív — závitový plátek převezme úhel.
    // Destička z ISO katalogu se nepřetváří: AG60 se Tr destičkou nestane
    // (autoPickToolFor poradí, kterou přidat).
    const pick = S.params.threadActive ? autoPickToolFor('thread') : { changed: false, msg: '' };
    if (S.params.toolShape === 'threading' && !pick.changed && !isoThreadInsertByCode(S.params.toolVbdCode)) {
      S.params.toolTipAngle = typeDef.angle;
      S.params.toolRadius = 0;
      // Spodní strana plátku: Tr/Acme = šířka dna profilu ≈ 0,366×P, jinak 0,1.
      S.params.toolTipFlat = (typeDef.key === 'tr' || typeDef.key === 'acme')
        ? Math.round(0.366 * P * 100) / 100 : 0.1;
    }
    S.machiningSubTab = 'zavit';
    const taperNote = typeDef.taper ? ' — kuželový 1:16 (nastaveno, ⌀ D platí na Z startu)' : '';
    showToast(`Závit ${S.params.threadName}: P=${P} mm, H=${S.params.threadDepth} mm, ${typeDef.angle}°${taperNote}${pick.msg}`);
    applyChange();
  }
  return { showThreadPickerDialog };
}
