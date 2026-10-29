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
// • FRÉZOVÁNÍ je od 22. 10. 2026 samostatná záložka (uživatel: „máme to dané
//   do kupy s operací na vrtání, tak to rozděl"): Vrtání ukazuje jen díry
//   (vč. navrtání a závitů), Frézování (`.cam-livemill`) kapsy a drážky;
//   ✣ Frézovat = záložka Frézování → vlastní část programu jen s frézami
//   (liveKind 'mill', liveModel.liveRunOps).
// • Výstup NC (polohování, osa C, M-kódy, kalibrace — liveSettingsUi.js) pod
//   seznamem děr / frézování: jediné místo nastavení (dřív i pod pohledem
//   na čelo, uživatel 21. 10. 2026).
// Výběr = `op.enabled` (liveModel.liveOpOn); nevybrané se nevrtají.
// • Hloubka, Q, tříska, prodleva a bezp. vzdálenost vybrané skupiny se píšou
//   přímo do operace (`data-livefield`) — tatáž data jako formulář 🛠 Operace
//   v pohledu na čelo. Pole středové díry v ose (paramsMachiningHtml.js) se
//   při vrtání děr z výkresu nezobrazují (uživatel 29. 10. 2026: „dvoje
//   nastavení … hloubka v jednom 10 a v druhém 20").
import { getLiveOps, liveOpOn, liveKindOf, liveOpSummary, liveDrillFromCad, liveSettings, normalizeLiveOp } from './liveModel.js';
import { drillToolText, toggleLiveGroup, autoDrillTools, pickDrill, magazineDrills, addCatalogDrills, catalogDrillD } from './liveDrillTools.js';
import { settingsHtml, settingsTitle, applySettingChange } from './liveSettingsUi.js';
import { pickMill, magazineMills, catalogMillD, addCatalogMills } from './liveMillTools.js';
import { autoTapSpotTools, addCatalogTapsSpots } from './liveTapTools.js';
import { withHoleExtras } from './liveHoleExtras.js';
import { safeEvalMath } from '../../../utils.js';

const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * @param d { S, root, toast, commit(mutate), saveState, isoMagSlot(rec, T),
 *            openView(), play() — ▶ simulace programu }
 * @returns {{ toggle(oi), refresh(), drillAll(kind) }}
 */
export function createDrillUi(d) {
  const { S, root } = d;
  const ops = () => getLiveOps(S.params);
  /** Druh operací části programu (Vrtání / Frézování), null = část jiné operace. */
  const partKind = () => (S.params.drillActive ? (S.params.liveKind === 'mill' ? 'mill' : 'drill') : null);
  /** 🔩 v hlavičce pohledu na čelo: druh podle záložky / části / výběru. */
  function defaultKind() {
    if (S.machiningSubTab === 'frez' || partKind() === 'mill') return 'mill';
    const on = k => ops().some(o => liveKindOf(o) === k && liveOpOn(o));
    return !on('drill') && on('mill') ? 'mill' : 'drill';
  }

  /** 🔩 Vyvrtat / ✣ Frézovat: operace Vrtání / Frézování (nová část, je-li třeba) → simulace. */
  async function drillAll(kind) {
    const k = kind || defaultKind(), mill = k === 'mill';
    const mine = ops().filter(o => liveKindOf(o) === k);
    if (!mine.length) {
      d.toast(mill
        ? 'Žádné frézování — kapsy a drážky nakreslete v CAD do bokorysu (◎ Čelo) nebo přidejte v ◎ 🛠 Operace → ➕ Frézování'
        : 'Žádné díry — nakreslete je v CAD do bokorysu (◎ Čelo, nástroj Díra / Kr.pole) nebo přidejte 🛠 Operace', 5000);
      return;
    }
    if (!mine.some(liveOpOn)) {
      d.toast(mill
        ? 'Není vybrané žádné frézování — zaškrtněte ho v ⚙ Parametry → Obrábění → Frézování'
        : 'Není vybraná žádná skupina děr — klepněte na díru v pohledu na čelo nebo ji zaškrtněte v ⚙ Parametry → Vrtání', 5000);
      return;
    }
    if (!mill && S.params.drillSource === 'axis') d.commit(p => { p.drillSource = 'cad'; });
    // Hook vzniká s panelem ⚙ Parametry — otevřít ho, když ještě nebyl vidět.
    if (!S._machTabClick) {
      root.querySelector('[data-code="show-sidebar"]')?.click();
      root.querySelector('[data-tab="params"]')?.click();
    }
    if (!S._machTabClick) { d.toast(`Otevřete ⚙ Parametry → Obrábění → ${mill ? 'Frézování' : 'Vrtání'}`); return; }
    const ok = await S._machTabClick(mill ? 'frez' : 'vrt');
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
  /** ➕ Fréza na Ø z 📚 katalogu fréz do zásobníku a přepočítat operace. */
  function addMissingMill(D) {
    if (!d.isoMagSlot || !(D > 0)) return;
    const added = addCatalogMills(S.toolMagazine, [D], d.isoMagSlot);
    if (!added.length) return;
    d.saveState();
    d.toast(`Do 🔧 Zásobníku přidána ${added.map(s => `T${s.slot} ${s.name}`).join(', ')}`, 4000);
    const r = autoDrillTools(ops(), S.toolMagazine, S.params);
    d.commit(p => { p.liveOps = r.ops; });
    refresh();
  }
  /** ➕ Závitník / navrtávák operace `oi` z 📚 do zásobníku. */
  function addMissingTapSpot(oi) {
    if (!d.isoMagSlot) return;
    const miss = autoTapSpotTools(ops(), S.toolMagazine).missing.filter(m => m.op === oi);
    const added = addCatalogTapsSpots(S.toolMagazine, miss, d.isoMagSlot);
    if (!added.length) return;
    d.saveState();
    d.toast(`Do 🔧 Zásobníku přidán ${added.map(s => `T${s.slot} ${s.name}`).join(', ')}`, 4000);
    const r = autoDrillTools(ops(), S.toolMagazine, S.params);
    d.commit(p => { p.liveOps = r.ops; });
    refresh();
  }
  /** Navrtání před vrtáním zap / vyp → přidat / odebrat operace navrtání. */
  function setSpot(on) {
    const live = { ...(S.params.live || {}), spot: on };
    const set = liveSettings({ ...S.params, live });
    const next = autoDrillTools(withHoleExtras(ops(), set), S.toolMagazine, S.params).ops;
    d.commit(p => { p.live = live; p.liveOps = next; });
    refresh();
    d.toast(on ? `✔ Navrtání před vrtáním (sražení ${set.spotChamfer} mm)` : '✕ Bez navrtání', 3000);
  }
  /** ➕ u odvozené operace bez nástroje (navrtání, závit). */
  function tapSpotAddBtn(op, i) {
    if (!op.role || !d.isoMagSlot) return '';
    const m = autoTapSpotTools([op], S.toolMagazine).missing[0];
    if (!m || (m.kind === 'spot' && !m.D)) return '';
    const what = m.kind === 'tap' ? `závitník ${m.thread || ''}` : `navrtávák Ø${m.D}`;
    return `<br><button data-livedrill="addtap" data-oi="${i}" class="cam-sim-btn cam-sim-btn-gray">➕ Přidat ${what} z 📚 do Zásobníku</button>`;
  }
  function commitOps(next, msg) { d.commit(p => { p.liveOps = next; }); refresh(); d.toast(msg, 3500); }

  /** Klepnutí na skupinu v pohledu na čelo; `plain` = zaškrtávátko (jen přepnout). */
  function toggle(oi, plain = false) {
    const cur = ops();
    if (!cur[oi]) return;
    const k = liveKindOf(cur[oi]), mill = k === 'mill';
    // V části Vrtání se klepnutím nevybírá frézování a naopak — operace
    // druhého druhu jsou v pohledu na čelo ztlumené (liveRunOps).
    if (!plain && partKind() && partKind() !== k) {
      d.toast(`${cur[oi].name}: ${mill ? 'frézování se vybírá v ⚙ Parametry → Obrábění → Frézování' : 'díry se vybírají v ⚙ Parametry → Obrábění → Vrtání'} (tahle část programu je ${mill ? 'vrtání' : 'frézování'})`, 4500);
      return;
    }
    const next = autoDrillTools(toggleLiveGroup(cur, oi, plain), S.toolMagazine, S.params).ops;
    const op = next[oi], on = liveOpOn(op);
    const same = next.filter(o => liveKindOf(o) === k);
    const nOn = same.filter(liveOpOn).length;
    const tool = on ? ` · ${drillToolText(op, S.toolMagazine)}` : '';
    commitOps(next, `${on ? (mill ? '✔ Frézovat' : '✔ Vrtat') : (mill ? '✕ Nefrézovat' : '✕ Nevrtat')}: ${op.name}${tool}  (vybráno ${nOn} z ${same.length})`);
  }
  function setAll(k) {
    const next = autoDrillTools(ops().map(o => (liveKindOf(o) === k ? { ...o, enabled: true } : o)), S.toolMagazine, S.params).ops;
    commitOps(next, `${k === 'mill' ? '✔ Frézovat' : '✔ Vrtat'} vše (${next.filter(o => liveKindOf(o) === k).length})`);
  }
  /** Řádek skupiny (zaškrtávátko, nástroj, ➕ chybějící nástroj z 📚). */
  function rowHtml(op, i) {
    return `<label class="cam-livedrill-row${liveOpOn(op) ? '' : ' off'}">
        <input type="checkbox" data-livedrill="toggle" data-oi="${i}"${liveOpOn(op) ? ' checked' : ''}>
        <span><b>${esc(op.name)}</b> <small>${esc(liveOpSummary(op))}</small><br><small class="t">${esc(drillToolText(op, S.toolMagazine))}</small>${
  op.kind === 'drill' && !op.role && !pickDrill(magazineDrills(S.toolMagazine), op.holeD).drill && d.isoMagSlot && catalogDrillD(op.holeD) != null
    ? `<br><button data-livedrill="addmag" data-d="${op.holeD}" class="cam-sim-btn cam-sim-btn-gray">➕ Přidat vrták Ø${op.holeD} z 📚 do Zásobníku</button>` : ''}${millAddBtn(op)}${tapSpotAddBtn(op, i)}</span>
      </label>${op.kind === 'drill' && !op.role && liveOpOn(op) ? fieldsHtml(op, i) : ''}`;
  }
  /** Pole vrtání vybrané skupiny (= formulář 🛠 Operace, píše do operace). */
  function fieldsHtml(op, i) {
    const f = (k, t, v, tip) => `<div class="cam-sim-field"><label title="${tip}">${t}</label><input type="text" inputmode="decimal" data-livefield="${k}" data-oi="${i}" value="${esc(v)}"></div>`;
    let h = `<div class="cam-livedrill-pf"><div class="cam-sim-row">
      ${f('depth', 'Hloubka', op.depth, 'Hloubka díry od Z čela (stejné pole jako 🛠 Operace v pohledu na čelo)')}
      ${f('peck', 'Záběr Q', op.peck, 'Hloubka jednoho záběru [mm]; 0 = celá díra naráz')}
      ${f('dwell', 'Prodleva (s)', op.dwell, 'Prodleva na dně díry [s]')}
      ${f('safe', 'Bezp. vzdál.', op.safe, 'R rovina — vzdálenost před čelem, odkud jede posuv')}
    </div>`;
    if (op.peck > 0) {
      h += `<div class="cam-sim-row"><div class="cam-sim-field"><label>Tříska mezi záběry</label><select data-livefield="chipMode" data-oi="${i}">
        <option value="clear"${op.chipMode === 'break' ? '' : ' selected'}>⇡ Vyjíždění (odvod)</option>
        <option value="break"${op.chipMode === 'break' ? ' selected' : ''}>↯ Lámání (odskok)</option></select></div>${op.chipMode === 'break'
  ? f('chipBack', 'Odskok', op.chipBack, 'Odskok po každém záběru [mm]') : ''}</div>`;
    }
    return h + '</div>';
  }
  /** Změna pole skupiny v záložce Vrtání → operace (jako formulář 🛠 Operace). */
  function setField(el) {
    const oi = +el.dataset.oi, k = el.dataset.livefield;
    const cur = ops();
    if (!cur[oi]) return;
    let v = el.value;
    if (k !== 'chipMode') {
      v = safeEvalMath(v);
      if (!Number.isFinite(v)) { d.toast('Neplatné číslo'); refresh(); return; }
    }
    const next = cur.map((o, j) => (j === oi ? normalizeLiveOp({ ...o, [k]: v }) : o));
    d.commit(p => { p.liveOps = next; });
    refresh();
  }
  /** Výstup NC (osa C, M-kódy, kalibrace) — sdílí vrtání i frézování. */
  function ncHtml() {
    const ctrl = S.params.controlSystem || 'sinumerik';
    return `<details class="cam-livedrill-nc"><summary>${settingsTitle(ctrl)} — osa C, M-kódy, kalibrace</summary>${settingsHtml(liveSettings(S.params), ctrl, false)}</details>`;
  }

  /** ➕ Přidat frézu z 📚, když ve zásobníku vhodná chybí a katalog ji má. */
  function millAddBtn(op) {
    if (op.kind !== 'mill' || !d.isoMagSlot) return '';
    const { mill, need } = pickMill(magazineMills(S.toolMagazine), op);
    const D = mill ? null : catalogMillD(need);
    return D ? `<br><button data-livedrill="addmill" data-d="${D}" class="cam-sim-btn cam-sim-btn-gray">➕ Přidat frézu Ø${D} z 📚 do Zásobníku</button>` : '';
  }

  // ── sekce v záložce Vrtání (jen díry; frézování má svou záložku) ──
  function sectionHtml() {
    const list = ops().map((op, i) => ({ op, i })).filter(({ op }) => liveKindOf(op) === 'drill');
    const axis = S.params.drillSource === 'axis';
    let h = '<div class="cam-livedrill-h">Co vrtat</div>';
    h += `<div class="cam-livedrill-src">
        <button data-livedrill="src" data-v="cad" class="${axis ? '' : 'on'}"${list.length ? '' : ' disabled'} title="Díry nakreslené v CAD do bokorysu — poháněný vrták, kus se natáčí osou C">Díry z výkresu (${list.length})</button>
        <button data-livedrill="src" data-v="axis" class="${axis || !list.length ? 'on' : ''}" title="Středová díra v ose soustruhu — revolverový vrták, vřeteno se točí">Středová díra v ose</button>
      </div>`;
    if (!list.length) {
      return h + '<small class="cam-livedrill-note">Žádné díry z výkresu. V CAD je nakreslete do bokorysu (◎ Čelo → Díra / Kr.pole) — přenesou se samy. Kapsy a drážky jsou v záložce Frézování.</small><div class="cam-livedrill-h axial">Vrtání v ose — středová díra</div>';
    }
    if (axis) return h + '<div class="cam-livedrill-h axial">Vrtání v ose — středová díra</div>';
    list.forEach(({ op, i }) => { h += rowHtml(op, i); });
    const nOn = list.filter(({ op }) => liveOpOn(op)).length;
    // Bez vybrané díry vrtá část středovou díru v ose — její pole jsou níž.
    if (!nOn) return h + '<small class="cam-livedrill-note">Není vybraná žádná díra z výkresu — vrtá se středová díra v ose (pole níž).</small><div class="cam-livedrill-h axial">Vrtání v ose — středová díra</div>';
    const active = partKind() === 'drill' && liveDrillFromCad(S.params);
    // Zápis vrtání: cyklus × rozepsaný ISO kód (= „Vrtací cykly" ve Výstupu NC,
    // tady na očích — uživatel 21. 10. 2026). Heidenhain jen rozepsaně.
    const ctrl0 = S.params.controlSystem || 'sinumerik', heid = ctrl0 === 'heidenhain';
    const cyc = liveSettings(S.params).cycles && !heid;
    h += `<div class="cam-livedrill-h">Zápis vrtání</div>
      <div class="cam-livedrill-src">
        <button data-livedrill="cyc" data-v="1" class="${cyc ? 'on' : ''}"${heid ? ' disabled title="Heidenhain: vždy rozepsané pohyby"' : ' title="Celé vrtání díry jedním řádkem cyklu"'}>Cyklus ${ctrl0 === 'fanuc' ? 'G83 / G87' : 'CYCLE82 / 83'}</button>
        <button data-livedrill="cyc" data-v="0" class="${cyc ? '' : 'on'}" title="Každý pohyb zvlášť: G0 na R rovinu, G1 záběr, G0 vyjetí pro odvod třísky…">Rozepsaně G0 / G1 (ISO)</button>
      </div>`;
    // Navrtání před vrtáním (liveHoleExtras.js): ke každé díře z výkresu navrtávák.
    const spot = liveSettings(S.params).spot;
    h += `<div class="cam-livedrill-h">Navrtání</div>
      <div class="cam-livedrill-src">
        <button data-livedrill="spot" data-v="1" class="${spot ? 'on' : ''}" title="Před vrtáním navrtávákem 90° navrtat střed a srazit hranu díry (Ø díry / závitu + 2 × sražení)">Navrtat před vrtáním</button>
        <button data-livedrill="spot" data-v="0" class="${spot ? '' : 'on'}">Bez navrtání</button>
      </div>`;
    h += `<div class="cam-livedrill-btns">
        <button data-livedrill="go" data-kind="drill" class="cam-sim-btn cam-sim-btn-green"${nOn ? '' : ' disabled'}>🔩 ${active ? 'Přehrát vrtání' : 'Vyvrtat vybrané'} (${nOn})</button>
        <button data-livedrill="all" data-kind="drill" class="cam-sim-btn cam-sim-btn-gray"${nOn === list.length ? ' disabled' : ''}>Vybrat vše</button>
      </div>
      <small class="cam-livedrill-note">${active
        ? 'Program této části = vrtání vybraných děr (kus se natáčí osou C k poháněnému nástroji). Po změně výběru se přegeneruje sám, jinak 🔄 Dráhy.'
        : 'Skupinu vyberete i klepnutím na díru v pohledu na čelo. 🔩 přepne nástroj na vrták (podle Ø ze 🔧 Zásobníku, otáčky a posuv z jeho Vc a f; Q, prodleva a bezp. vzdálenost z polí níž) — je-li v části soustružení nebo frézování, přidá vrtání jako novou operaci.'}</small>`;
    return h + ncHtml();
  }
  // ── sekce v záložce Frézování (kapsy, drážky, drážky pro pero) ──
  function millSectionHtml() {
    const list = ops().map((op, i) => ({ op, i })).filter(({ op }) => liveKindOf(op) === 'mill');
    let h = '<div class="cam-livedrill-h">Co frézovat <small>— poháněná fréza, kus se natáčí osou C</small></div>';
    if (!list.length) {
      return h + '<small class="cam-livedrill-note">Žádné frézování z výkresu. Kapsy a drážky nakreslete v CAD do bokorysu (◎ Čelo: úsečka = drážka) nebo drážku pro pero do pláště — přenesou se samy; jinak je přidejte v ◎ pohledu na čelo → 🛠 Operace → ➕ Frézování. Díry jsou v záložce Vrtání.</small>' + ncHtml();
    }
    list.forEach(({ op, i }) => { h += rowHtml(op, i); });
    const nOn = list.filter(({ op }) => liveOpOn(op)).length;
    const active = partKind() === 'mill';
    h += `<div class="cam-livedrill-btns">
        <button data-livedrill="go" data-kind="mill" class="cam-sim-btn cam-sim-btn-green"${nOn ? '' : ' disabled'}>✣ ${active ? 'Přehrát frézování' : 'Frézovat vybrané'} (${nOn})</button>
        <button data-livedrill="all" data-kind="mill" class="cam-sim-btn cam-sim-btn-gray"${nOn === list.length ? ' disabled' : ''}>Vybrat vše</button>
      </div>
      <small class="cam-livedrill-note">${active
        ? 'Program této části = frézování vybraných kapes a drážek (kus se natáčí osou C k poháněné fréze). Po změně výběru se přegeneruje sám, jinak 🔄 Dráhy.'
        : 'Frézu vybere CAM sám podle šířky kapsy / drážky ze 🔧 Zásobníku (chybějící nabídne ➕ z 📚). ✣ udělá z frézování samostatnou operaci — je-li v části soustružení nebo vrtání, přidá ho jako novou část programu.'}</small>`;
    return h + ncHtml();
  }
  let present = false;
  function fillBox(box, html) {
    if (box.innerHTML === html) return;
    // Rozbalené části (Výstup NC, kalibrace…) zůstanou rozbalené.
    const open = [...box.querySelectorAll('details')].map(x => x.open);
    box.innerHTML = html;
    box.querySelectorAll('details').forEach((x, i) => { if (open[i]) x.open = true; });
  }
  function fillSection() {
    const dBox = root.querySelector('.cam-livedrill'), mBox = root.querySelector('.cam-livemill');
    if (!dBox && !mBox) { present = false; return; }
    if (dBox) fillBox(dBox, sectionHtml());
    // Pole středové díry v ose jen, když se opravdu vrtá v ose.
    const axisBox = root.querySelector('.cam-drill-axis');
    if (axisBox) axisBox.hidden = liveDrillFromCad(S.params);
    if (mBox) fillBox(mBox, millSectionHtml());
    if (!present) { present = true; d.openView(); }   // přepnuto na záložku Vrtání / Frézování
  }
  // Panel parametrů se překresluje celý — sekci doplnit, kdykoli se objeví.
  const side = root.querySelector('.cam-sim-sidebar');
  if (side) {
    new MutationObserver(() => {
      const box = root.querySelector('.cam-livedrill, .cam-livemill');
      if (!box) { present = false; return; }
      if (!box.firstChild || !present) fillSection();
    }).observe(side, { childList: true, subtree: true });
    side.addEventListener('click', e => {
      const b = e.target.closest('[data-livedrill]');
      if (!b || !side.contains(b) || b.disabled) return;
      const act = b.dataset.livedrill;
      if (act === 'toggle') return;
      e.preventDefault();
      if (act === 'go') drillAll(b.dataset.kind || 'drill');
      else if (act === 'all') setAll(b.dataset.kind || 'drill');
      else if (act === 'addmag') addMissing([parseFloat(b.dataset.d)]);
      else if (act === 'addmill') addMissingMill(parseFloat(b.dataset.d));
      else if (act === 'addtap') addMissingTapSpot(+b.dataset.oi);
      else if (act === 'spot') { const on = b.dataset.v === '1'; if (liveSettings(S.params).spot !== on) setSpot(on); }
      else if (act === 'src') { d.commit(p => { p.drillSource = b.dataset.v; }); refresh(); }
      else if (act === 'cyc') {
        const on = b.dataset.v === '1';
        if (liveSettings(S.params).cycles !== on) { d.commit(p => { p.live = { ...(p.live || {}), cycles: on }; }); refresh(); }
      }
    });
    side.addEventListener('change', e => {
      const b = e.target.closest('[data-livedrill="toggle"]');
      if (b) { toggle(+b.dataset.oi, true); return; }
      const fld = e.target.closest('[data-livefield]');
      if (fld) { setField(fld); return; }
      const el = e.target.closest('.cam-livedrill-nc [data-g]');
      if (!el) return;
      const ctrl = S.params.controlSystem || 'sinumerik';
      const live = JSON.parse(JSON.stringify(S.params.live || {}));
      if (!applySettingChange(live, el.dataset.g, el, ctrl, safeEvalMath)) { d.toast('Neplatné číslo'); refresh(); return; }
      // Jiné sražení → přepočítat operace navrtání.
      const next = el.dataset.g === 'spotChamfer'
        ? autoDrillTools(withHoleExtras(ops(), liveSettings({ ...S.params, live })), S.toolMagazine, S.params).ops : null;
      d.commit(p => { p.live = live; if (next) p.liveOps = next; });
      refresh();
    });
  }

  function refresh() { if (root.querySelector('.cam-livedrill, .cam-livemill')) fillSection(); }
  refresh();
  return { toggle, refresh, drillAll };
}
