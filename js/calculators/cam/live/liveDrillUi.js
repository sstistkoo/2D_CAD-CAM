// VRTÁNÍ DĚR Z VÝKRESU v uživatelském rozhraní CAM (uživatel 20. 10. 2026:
// „když dám Vrtání, abych mohl kliknout na díry, které chci … vybral se
// vrták … a dole možnost vygenerovat kód … ať to nedělá bordel").
//
// Vrtání děr z výkresu je OPERACE VRTÁNÍ jako každá jiná: záložka Vrtání
// vybere vrták (cam/sim/machTabTool.js — při soustružení v části přidá novou
// operaci), program té části je blok poháněných nástrojů (ops/drill.js),
// generuje ho jediné „🔄 Dráhy" a simulace ho přehraje (◎ pohled na čelo +
// řez). Tenhle modul:
// • sekce „Díry mimo osu" nahoře v záložce Vrtání (paramsMachiningHtml.js
//   vloží prázdný `.cam-livedrill`, obsah plní MutationObserver): zdroj
//   vrtání (díry z výkresu × středová díra v ose), zaškrtávátko u skupiny,
//   vrták ze 🔧 Zásobníku podle Ø (liveDrillTools.js), ➕ chybějící vrták
//   z 📚, 🔩 Vyvrtat; přepnutí na záložku otevře pohled na čelo;
// • 🔩 Vyvrtat (i v hlavičce pohledu na čelo) = záložka Vrtání (přes hook
//   S._machTabClick — cam/live nesmí importovat cam/sim) + přegenerovat +
//   ▶ simulace.
// • Výstup NC (polohování, osa C, M-kódy, kalibrace — liveSettingsUi.js) pod
//   seznamem děr: jediné místo nastavení (dřív i pod pohledem na čelo,
//   uživatel 21. 10. 2026).
// Výběr = `op.enabled` (liveModel.liveOpOn); nevybrané se nevrtají.
import { getLiveOps, liveOpOn, liveOpSummary, liveDrillFromCad, liveSettings } from './liveModel.js';
import { drillToolText, toggleLiveGroup, autoDrillTools, pickDrill, magazineDrills, addCatalogDrills, catalogDrillD, syncDrillTabParams } from './liveDrillTools.js';
import { settingsHtml, settingsTitle, applySettingChange } from './liveSettingsUi.js';
import { safeEvalMath } from '../../../utils.js';

const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * @param d { S, root, toast, commit(mutate), saveState, isoMagSlot(rec, T),
 *            openView(), play() — ▶ simulace programu }
 * @returns {{ toggle(oi), refresh(), drillAll() }}
 */
export function createDrillUi(d) {
  const { S, root } = d;
  const ops = () => getLiveOps(S.params);

  /** 🔩 Vyvrtat: operace Vrtání s vrtákem (nová část, je-li třeba) → simulace. */
  async function drillAll() {
    if (!ops().length) {
      d.toast('Žádné díry — nakreslete je v CAD do bokorysu (◎ Čelo, nástroj Díra / Kr.pole) nebo přidejte 🛠 Operace', 5000);
      return;
    }
    if (!ops().some(liveOpOn)) {
      d.toast('Není vybraná žádná skupina děr — klepněte na díru v pohledu na čelo nebo ji zaškrtněte v ⚙ Parametry → Vrtání', 5000);
      return;
    }
    if (S.params.drillSource === 'axis') d.commit(p => { p.drillSource = 'cad'; });
    // Hook vzniká s panelem ⚙ Parametry — otevřít ho, když ještě nebyl vidět.
    if (!S._machTabClick) {
      root.querySelector('[data-code="show-sidebar"]')?.click();
      root.querySelector('[data-tab="params"]')?.click();
    }
    if (!S._machTabClick) { d.toast('Otevřete ⚙ Parametry → Obrábění → Vrtání'); return; }
    const ok = await S._machTabClick('vrt');
    if (ok === false) return;
    refresh();
    d.play();
  }

  function addMissing(Ds) {
    const list = [...new Set(Ds)].filter(D => catalogDrillD(D) != null);
    if (!d.isoMagSlot || !list.length) return;
    const added = addCatalogDrills(S.toolMagazine, list, d.isoMagSlot);
    if (!added.length) return;
    d.saveState();
    d.toast(`Do 🔧 Zásobníku přidán ${added.map(s => `T${s.slot} ${s.name}`).join(', ')}`, 4000);
    const r = autoDrillTools(ops(), S.toolMagazine, S.params);
    d.commit(p => { p.liveOps = r.ops; });
    refresh();
  }
  function commitOps(next, msg) { d.commit(p => { p.liveOps = next; }); refresh(); d.toast(msg, 3500); }

  /** Klepnutí na skupinu v pohledu na čelo; `plain` = zaškrtávátko (jen přepnout). */
  function toggle(oi, plain = false) {
    const cur = ops();
    if (!cur[oi]) return;
    const next = autoDrillTools(toggleLiveGroup(cur, oi, plain), S.toolMagazine, S.params).ops;
    const op = next[oi], on = liveOpOn(op);
    const nOn = next.filter(liveOpOn).length;
    const tool = on && op.kind === 'drill' ? ` · ${drillToolText(op, S.toolMagazine)}` : '';
    commitOps(next, `${on ? '✔ Vrtat' : '✕ Nevrtat'}: ${op.name}${tool}  (vybráno ${nOn} z ${next.length})`);
  }
  function setAll() {
    const next = autoDrillTools(ops().map(o => ({ ...o, enabled: true })), S.toolMagazine, S.params).ops;
    commitOps(next, `✔ Vrtat vše (${next.length})`);
  }

  // ── sekce v záložce Vrtání ──
  function sectionHtml() {
    const list = ops();
    const axis = S.params.drillSource === 'axis';
    let h = '<div class="cam-livedrill-h">Co vrtat</div>';
    h += `<div class="cam-livedrill-src">
        <button data-livedrill="src" data-v="cad" class="${axis ? '' : 'on'}"${list.length ? '' : ' disabled'} title="Díry nakreslené v CAD do bokorysu — poháněný vrták, kus se natáčí osou C">Díry z výkresu (${list.length})</button>
        <button data-livedrill="src" data-v="axis" class="${axis || !list.length ? 'on' : ''}" title="Středová díra v ose soustruhu — revolverový vrták, vřeteno se točí">Středová díra v ose</button>
      </div>`;
    if (!list.length) {
      return h + '<small class="cam-livedrill-note">Žádné díry z výkresu. V CAD je nakreslete do bokorysu (◎ Čelo → Díra / Kr.pole) — přenesou se samy.</small><div class="cam-livedrill-h axial">Vrtání v ose — středová díra</div>';
    }
    if (axis) return h + '<div class="cam-livedrill-h axial">Vrtání v ose — středová díra</div>';
    list.forEach((op, i) => {
      h += `<label class="cam-livedrill-row${liveOpOn(op) ? '' : ' off'}">
        <input type="checkbox" data-livedrill="toggle" data-oi="${i}"${liveOpOn(op) ? ' checked' : ''}>
        <span><b>${esc(op.name)}</b> <small>${esc(liveOpSummary(op))}</small><br><small class="t">${esc(drillToolText(op, S.toolMagazine))}</small>${
  op.kind === 'drill' && !pickDrill(magazineDrills(S.toolMagazine), op.holeD).drill && d.isoMagSlot && catalogDrillD(op.holeD) != null
    ? `<br><button data-livedrill="addmag" data-d="${op.holeD}" class="cam-sim-btn cam-sim-btn-gray">➕ Přidat vrták Ø${op.holeD} z 📚 do Zásobníku</button>` : ''}</span>
      </label>`;
    });
    const nOn = list.filter(liveOpOn).length;
    const active = S.params.drillActive && liveDrillFromCad(S.params);
    // Zápis vrtání: cyklus × rozepsaný ISO kód (= „Vrtací cykly" ve Výstupu NC,
    // tady na očích — uživatel 21. 10. 2026). Heidenhain jen rozepsaně.
    const ctrl0 = S.params.controlSystem || 'sinumerik', heid = ctrl0 === 'heidenhain';
    const cyc = liveSettings(S.params).cycles && !heid;
    h += `<div class="cam-livedrill-h">Zápis vrtání</div>
      <div class="cam-livedrill-src">
        <button data-livedrill="cyc" data-v="1" class="${cyc ? 'on' : ''}"${heid ? ' disabled title="Heidenhain: vždy rozepsané pohyby"' : ' title="Celé vrtání díry jedním řádkem cyklu"'}>Cyklus ${ctrl0 === 'fanuc' ? 'G83 / G87' : 'CYCLE82 / 83'}</button>
        <button data-livedrill="cyc" data-v="0" class="${cyc ? '' : 'on'}" title="Každý pohyb zvlášť: G0 na R rovinu, G1 záběr, G0 vyjetí pro odvod třísky…">Rozepsaně G0 / G1 (ISO)</button>
      </div>`;
    h += `<div class="cam-livedrill-btns">
        <button data-livedrill="go" class="cam-sim-btn cam-sim-btn-green"${nOn ? '' : ' disabled'}>🔩 ${active ? 'Přehrát vrtání' : 'Vyvrtat vybrané'} (${nOn})</button>
        <button data-livedrill="all" class="cam-sim-btn cam-sim-btn-gray"${nOn === list.length ? ' disabled' : ''}>Vybrat vše</button>
      </div>
      <small class="cam-livedrill-note">${active
        ? 'Program této části = vrtání vybraných děr (kus se natáčí osou C k poháněnému nástroji). Po změně výběru se přegeneruje sám, jinak 🔄 Dráhy.'
        : 'Skupinu vyberete i klepnutím na díru v pohledu na čelo. 🔩 přepne nástroj na vrták (podle Ø ze 🔧 Zásobníku, otáčky a posuv z jeho Vc a f; Q, prodleva a bezp. vzdálenost z polí níž) — je-li v části soustružení, přidá vrtání jako novou operaci.'}</small>`;
    const ctrl = S.params.controlSystem || 'sinumerik';
    h += `<details class="cam-livedrill-nc"><summary>${settingsTitle(ctrl)} — osa C, M-kódy, kalibrace</summary>${settingsHtml(liveSettings(S.params), ctrl, false)}</details>`;
    return h;
  }
  let present = false;
  function fillSection() {
    const box = root.querySelector('.cam-livedrill');
    if (!box) { present = false; return; }
    const html = sectionHtml();
    if (box.innerHTML !== html) {
      // Rozbalené části (Výstup NC, kalibrace…) zůstanou rozbalené.
      const open = [...box.querySelectorAll('details')].map(x => x.open);
      box.innerHTML = html;
      box.querySelectorAll('details').forEach((x, i) => { if (open[i]) x.open = true; });
    }
    if (!present) { present = true; d.openView(); }   // přepnuto na záložku Vrtání
  }
  // Panel parametrů se překresluje celý — sekci doplnit, kdykoli se objeví.
  const side = root.querySelector('.cam-sim-sidebar');
  if (side) {
    new MutationObserver(() => {
      const box = root.querySelector('.cam-livedrill');
      if (!box) { present = false; return; }
      if (!box.firstChild || !present) fillSection();
    }).observe(side, { childList: true, subtree: true });
    side.addEventListener('click', e => {
      const b = e.target.closest('[data-livedrill]');
      if (!b || !side.contains(b) || b.disabled) return;
      const act = b.dataset.livedrill;
      if (act === 'toggle') return;
      e.preventDefault();
      if (act === 'go') drillAll();
      else if (act === 'all') setAll();
      else if (act === 'addmag') addMissing([parseFloat(b.dataset.d)]);
      else if (act === 'src') { d.commit(p => { p.drillSource = b.dataset.v; }); refresh(); }
      else if (act === 'cyc') {
        const on = b.dataset.v === '1';
        if (liveSettings(S.params).cycles !== on) { d.commit(p => { p.live = { ...(p.live || {}), cycles: on }; }); refresh(); }
      }
    });
    // Pole záložky Vrtání (Q, Odskok, Prodleva, Bezp. vzdál.) a ⇡ Vyjíždění /
    // ↯ Lámání třísky → do vybraných děr z výkresu. Až po obsluze simulátoru
    // (ta S.params zapíše a panel překreslí).
    const TAB_P = new Set(['drillPeck', 'drillRetract', 'drillDwell', 'drillClearance']);
    const syncTab = () => setTimeout(() => {
      if (!liveDrillFromCad(S.params)) return;
      const cur = ops(), next = syncDrillTabParams(cur, S.params);
      if (JSON.stringify(next) !== JSON.stringify(cur)) { d.commit(p => { p.liveOps = next; }); refresh(); }
    }, 0);
    side.addEventListener('change', e => { if (e.target.dataset && TAB_P.has(e.target.dataset.p)) syncTab(); });
    side.addEventListener('click', e => { if (e.target.closest('[data-drillmode]')) syncTab(); });
    side.addEventListener('change', e => {
      const b = e.target.closest('[data-livedrill="toggle"]');
      if (b) { toggle(+b.dataset.oi, true); return; }
      const el = e.target.closest('.cam-livedrill-nc [data-g]');
      if (!el) return;
      const ctrl = S.params.controlSystem || 'sinumerik';
      const live = JSON.parse(JSON.stringify(S.params.live || {}));
      if (!applySettingChange(live, el.dataset.g, el, ctrl, safeEvalMath)) { d.toast('Neplatné číslo'); refresh(); return; }
      d.commit(p => { p.live = live; });
      refresh();
    });
  }

  function refresh() { if (root.querySelector('.cam-livedrill')) fillSection(); }
  refresh();
  return { toggle, refresh, drillAll };
}
