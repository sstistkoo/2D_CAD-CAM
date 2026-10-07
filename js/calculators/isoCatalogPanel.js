// ╔══════════════════════════════════════════════════════════════╗
// ║  SKICA – 📚 ISO katalog nožů (záložka 🧰 Knihovny nástrojů)  ║
// ╚══════════════════════════════════════════════════════════════╝
//
// Karty typů držáků (isoToolCatalog.js): nahoře dřík h×b a ruka, u každé
// karty destička / velikost / rádius. Tlačítka předají HOTOVÝ záznam
// knihovny (s `tool` = celý nůž) volajícímu — ✅ Použít, 🔧 Do zásobníku,
// 🧰 Uložit jdou stejnou cestou jako uložené nože.

import {
  ISO_HOLDER_TYPES, ISO_GROUPS, ISO_SHANKS, isoThreadInsertsFor, isoVariants, isoSizes, isoRadii,
  isoGrooveWidths, isoInsertLabel, buildIsoKnife, isoKnifeSvg, isoCatalogCount,
} from './isoToolCatalog.js';
import { RADIUS_MM, SHAPES } from './vbdIso.js';

const PREF_KEY = 'skica.isoCatalog';   // jen pohodlí: naposledy zvolený dřík a skupina

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const cz = (v) => String(v).replace('.', ',');
const spaced = (code) => code.replace(/^([A-Z]+)(\d)/, '$1 $2');
const spacedInsert = (code) => code.replace(/^(\d+E[RL])(.*)$/, '$1 $2').replace(/^([A-Z]{4})(\d)/, '$1 $2');

function loadPrefs() {
  try { return JSON.parse(localStorage.getItem(PREF_KEY)) || {}; } catch (_) { return {}; }
}
function savePrefs(p) {
  try { localStorage.setItem(PREF_KEY, JSON.stringify(p)); } catch (_) { /* soukromé okno apod. */ }
}

function shapeLabel(t) {
  if (t.special === 'parting') return '▮ zapichovací';
  if (t.special === 'threading') return '▽ závitová';
  const s = SHAPES.find((x) => x.v === t.shape);
  return s ? `${t.shape} · ${s.d.toLowerCase()}` : t.shape;
}

/**
 * Vykreslí katalog do `root`.
 * @param {HTMLElement} root
 * @param {{hand?:'R'|'L', onApply:(rec:Object)=>void, onAddToMagazine?:(rec:Object)=>void,
 *          onSave:(rec:Object)=>void}} opts
 */
export function mountIsoCatalog(root, opts) {
  const prefs = loadPrefs();
  const st = {
    shank: ISO_SHANKS.some((s) => s.code === prefs.shank) ? prefs.shank : '2525',
    group: ISO_GROUPS.some((g) => g.id === prefs.group) ? prefs.group : 'all',
    hand: opts.hand === 'L' ? 'L' : 'R',
    sel: {},        // id typu → { variant, size, radius, width, thread }
    zoom: null,     // id karty s velkým náhledem
  };

  const recFor = (t) => buildIsoKnife(t.id, { ...(st.sel[t.id] || {}), shank: st.shank, hand: st.hand });

  function select(key, options, value, title) {
    return `<select data-o="${key}" title="${esc(title)}">${options.map(([v, l]) =>
      `<option value="${esc(v)}"${String(v) === String(value) ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
  }

  function optionsHTML(t, k) {
    if (t.special === 'parting') {
      return select('width', isoGrooveWidths(st.shank).map((g) => [g.w, `š ${g.w} mm · ${g.code}`]), k.width, 'Šířka zapichovací destičky');
    }
    if (t.special === 'threading') {
      return select('thread', isoThreadInsertsFor(st.shank).map((x) => [x.id, x.label]), k.thread,
        'Závitová destička — částečný profil 60° / 55° na rozsah stoupání, plný profil Tr / Acme jen na jedno stoupání');
    }
    let html = '';
    const vars = isoVariants(t, st.shank);
    if (vars.length > 1) {
      html += select('variant', vars.map((v) => [v, v === 'neg' ? 'negativní' : 'pozitivní']), k.variant,
        'Negativní destička (…NMG, α 0°, oboustranná) nebo pozitivní (…CMT/BMT, šroub, menší řezné síly)');
    }
    html += select('size', isoSizes(t, k.variant, st.shank).map((sz) => [sz, isoInsertLabel(t, k.variant, sz)]), k.size,
      'Destička — velikost podle délky břitu (ISO 1832)');
    const radii = isoRadii(t, k.size);
    if (radii.length) html += select('radius', radii.map((r) => [r, `rε ${cz(RADIUS_MM[r])}`]), k.radius, 'Rádius špičky');
    return html;
  }

  function cardHTML(t) {
    const rec = recFor(t);
    if (!rec) return '';
    const k = rec.iso, p = rec.tool;
    const chips = [];
    if (!t.special && t.shape !== 'R') chips.push(`κr ${cz(t.kr)}°${t.face ? ' (čelně)' : ''}`, `ε ${p.toolTipAngle}°`);
    if (p.toolShape === 'round') chips.push(`R ${cz(p.toolRadius)}`);
    else if (p.toolShape === 'parting') chips.push(`š ${cz(p.toolLength)}`, `R ${cz(p.toolRadius)}`);
    else if (p.toolShape === 'threading') chips.push(`ε ${p.toolTipAngle}°`);
    if (p.toolClearanceAngle) chips.push(`α ${p.toolClearanceAngle}°`);
    chips.push(`Vc ${rec.vc} · f ${cz(rec.f)} · ap ${cz(rec.ap)}`);
    const big = st.zoom === t.id;
    return `<div class="iso-cat-card${big ? ' iso-cat-card--big' : ''}" data-id="${t.id}">
      <button class="iso-cat-thumb" data-a="zoom" title="${big ? 'Zmenšit náhled' : 'Zvětšit náhled'}">${isoKnifeSvg(rec, big ? 200 : 68)}</button>
      <div class="iso-cat-main">
        <div class="iso-cat-title"><b>${esc(spaced(rec.name))}</b><span class="iso-cat-ins">${esc(spacedInsert(rec.vbdCode))}</span></div>
        <div class="iso-cat-desc">${esc(shapeLabel(t))} — ${esc(t.desc)}</div>
        <div class="iso-cat-chips">${chips.map((c) => `<span>${esc(c)}</span>`).join('')}</div>
        <div class="iso-cat-opts">${optionsHTML(t, k)}</div>
        <div class="iso-cat-btns">
          <button class="iso-cat-btn iso-cat-btn--ok" data-a="apply" title="Nastaví nůž jako aktuální nástroj — destička, držák i řezné podmínky">✅ Použít</button>
          ${opts.onAddToMagazine ? '<button class="iso-cat-btn" data-a="mag" title="Přidá nůž do 🔧 Zásobníku jako nové T (okno zůstane otevřené)">🔧 Do zásobníku</button>' : ''}
          <button class="iso-cat-btn" data-a="save" title="Uloží nůž do 🧰 Moje nože">🧰 Uložit</button>
        </div>
      </div>
    </div>`;
  }

  function visibleTypes() {
    return ISO_HOLDER_TYPES.filter((t) => (st.group === 'all' || t.groups.includes(st.group))
      && isoVariants(t, st.shank).length > 0);
  }

  function render() {
    const shank = ISO_SHANKS.find((s) => s.code === st.shank);
    root.innerHTML = `
      <div class="iso-cat-bar">
        <label title="Dřík držáku h × b (ISO 5608 poz. 6–8), l1 = funkční délka">Dřík
          <select data-g="shank">${ISO_SHANKS.map((s) => `<option value="${s.code}"${s.code === st.shank ? ' selected' : ''}>${s.h}×${s.b} · l1 ${s.l1}</option>`).join('')}</select>
        </label>
        <span class="iso-cat-seg" title="Ruka držáku. V CAM se strana řídí směrem hrubování (zprava = R, zleva = L) — tady jen pro název a náhled.">
          <button data-g="hand" data-v="R" class="${st.hand === 'R' ? 'on' : ''}">R</button><button data-g="hand" data-v="L" class="${st.hand === 'L' ? 'on' : ''}">L</button>
        </span>
      </div>
      <div class="iso-cat-groups">
        <button data-g="group" data-v="all" class="${st.group === 'all' ? 'on' : ''}">Vše</button>
        ${ISO_GROUPS.map((g) => `<button data-g="group" data-v="${g.id}" class="${st.group === g.id ? 'on' : ''}">${esc(g.label)}</button>`).join('')}
      </div>
      <div class="iso-cat-list">${visibleTypes().map(cardHTML).join('') || '<div class="iso-cat-empty">Pro tento dřík tu není žádný nůž.</div>'}</div>
      <div class="iso-cat-note">Dřík ${shank.h}×${shank.b}: l1 ${shank.l1} mm, u přesazených držáků f1 ${shank.f1} mm. Katalog umí ${isoCatalogCount()} kombinací.
        Rozměry držáků a tvar hlavy jsou <b>orientační</b> podle ISO 5608/5610 a typických katalogů — ověřte v katalogu výrobce.
        Po použití jde obrys upravit v 🔪 Geometrii.</div>`;
  }

  function replaceCard(id) {
    const el = root.querySelector(`.iso-cat-card[data-id="${id}"]`);
    const t = ISO_HOLDER_TYPES.find((x) => x.id === id);
    if (!el || !t) return;
    const tmp = document.createElement('div');
    tmp.innerHTML = cardHTML(t);
    if (tmp.firstElementChild) el.replaceWith(tmp.firstElementChild);
  }

  root.addEventListener('change', (e) => {
    const g = e.target.closest('[data-g]');
    if (g && g.dataset.g === 'shank') {
      st.shank = g.value; st.sel = {}; savePrefs({ shank: st.shank, group: st.group }); render();
      return;
    }
    const o = e.target.closest('[data-o]');
    const card = e.target.closest('.iso-cat-card');
    if (!o || !card) return;
    const id = card.dataset.id;
    const cur = { ...(recFor(ISO_HOLDER_TYPES.find((t) => t.id === id)) || {}).iso, ...(st.sel[id] || {}) };
    cur[o.dataset.o] = o.dataset.o === 'width' ? Number(o.value) : o.value;
    if (o.dataset.o === 'variant') { delete cur.size; delete cur.radius; }
    st.sel[id] = cur;
    replaceCard(id);
  });

  root.addEventListener('click', (e) => {
    const g = e.target.closest('button[data-g]');
    if (g) {
      if (g.dataset.g === 'hand') st.hand = g.dataset.v;
      if (g.dataset.g === 'group') { st.group = g.dataset.v; savePrefs({ shank: st.shank, group: st.group }); }
      render();
      return;
    }
    const a = e.target.closest('[data-a]');
    const card = e.target.closest('.iso-cat-card');
    if (!a || !card) return;
    const t = ISO_HOLDER_TYPES.find((x) => x.id === card.dataset.id);
    if (a.dataset.a === 'zoom') { st.zoom = st.zoom === t.id ? null : t.id; replaceCard(t.id); return; }
    const rec = recFor(t);
    if (!rec) return;
    if (a.dataset.a === 'apply') opts.onApply(rec);
    else if (a.dataset.a === 'mag' && opts.onAddToMagazine) opts.onAddToMagazine(rec);
    else if (a.dataset.a === 'save') opts.onSave(rec);
  });

  render();
}
