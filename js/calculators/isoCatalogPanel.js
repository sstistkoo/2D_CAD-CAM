// ╔══════════════════════════════════════════════════════════════╗
// ║  SKICA – 📚 ISO katalog nožů (záložka 🧰 Knihovny nástrojů)  ║
// ╚══════════════════════════════════════════════════════════════╝
//
// Karty typů držáků (isoToolCatalog.js): nahoře dřík h×b a ruka, u každé
// karty destička / velikost / rádius. Tlačítka předají HOTOVÝ záznam
// knihovny (s `tool` = celý nůž) volajícímu — ✅ Použít, 🔧 Do zásobníku,
// 🧰 Uložit jdou stejnou cestou jako uložené nože.
//
// Skupina Vrtáky (7. 10. 2026) není typ DRŽÁKU (ISO_HOLDER_TYPES — testy
// katalogu tam čekají nakreslený obrys držáku), ale karta navíc postavená
// z isoDrills.js: druh vrtáku × ⌀; dřík a ruka se jí netýkají.
//
// Skupina Vnitřní (do díry) (7. 10. 2026) — vyvrtávací tyče a vnitřní
// závitový nůž z isoInternalTools.js. Taky mimo ISO_HOLDER_TYPES: místo
// dříku nahoře se na kartě volí kulatá tyč ⌀d (s nejmenší dírou Dmin).

import {
  ISO_HOLDER_TYPES, ISO_GROUPS, ISO_SHANKS, isoThreadInsertsFor, isoVariants, isoSizes, isoRadii,
  isoGrooveWidths, isoLongReaches, isoInsertLabel, buildIsoKnife, isoKnifeSvg, isoCatalogCount,
} from './isoToolCatalog.js';
import { RADIUS_MM, SHAPES } from './vbdIso.js';
import { ISO_DRILL_KINDS, isoDrillDiameters, isoDrillLabel, buildIsoDrill, isoDrillCount } from './isoDrills.js';
import { ISO_MILL_KINDS, isoMillDiameters, isoMillLabel, buildIsoMill, isoMillCount, isoMillSvg } from './isoMills.js';
import { ISO_TAP_KINDS, METRIC_THREADS, threadLabel, buildIsoTap, isoTapCount, isoTapSvg } from './isoTaps.js';
import {
  ISO_INTERNAL_TYPES, isoInternalBars, isoInternalVariants, isoInternalSizes, buildIsoInternalKnife, isoInternalCount,
  isoThreadInsertsForBar, isoInnerGrooveWidths,
} from './isoInternalTools.js';
import { isoThreadInsertLabel } from './isoThreadInserts.js';
import { FACE_GROOVE_TYPE, FACE_GROOVE_RANGES, isoFaceGrooveWidths, buildIsoFaceGroove, isoFaceGrooveCount } from './isoFaceGrooves.js';

const PREF_KEY = 'skica.isoCatalog';   // jen pohodlí: naposledy zvolený dřík a skupina

const DRILL_TYPE = { id: 'DR', special: 'drill', groups: ['drill'],
  desc: 'Šroubovitý vrták nebo navrtávák pro operaci Vrtání (v ose X0). Dřík a ruka nahoře se ho netýkají.' };
// Frézy (22. 10. 2026) — poháněné nástroje pro frézování z výkresu (cam/live);
// jako vrtáky karta mimo ISO_HOLDER_TYPES, postavená z isoMills.js.
const MILL_TYPE = { id: 'ML', special: 'mill', groups: ['mill'],
  desc: 'Stopková fréza pro poháněný nástroj — kapsa a drážka na čele, drážka pro pero v plášti. Do 🔧 Zásobníku; CAM ji vybere podle Ø.' };
// Závitníky (22. 10. 2026) — závity do děr z výkresu poháněným nástrojem.
const TAP_TYPE = { id: 'TP', special: 'tap', groups: ['tap'],
  desc: 'Strojní závitník pro poháněný nástroj — závity do děr z výkresu. Do 🔧 Zásobníku; CAM ho vybere podle závitu.' };
const GROUPS = [...ISO_GROUPS, { id: 'facegroove', label: 'Čelní zápichy' }, { id: 'internal', label: 'Vnitřní (do díry)' }, { id: 'drill', label: 'Vrtáky a navrtávák' }, { id: 'mill', label: 'Frézy (poháněné)' }, { id: 'tap', label: 'Závitníky (poháněné)' }];
const isLiveT = (t) => t.special === 'mill' || t.special === 'tap';
const typeById = (id) => (id === FACE_GROOVE_TYPE.id ? FACE_GROOVE_TYPE : id === DRILL_TYPE.id ? DRILL_TYPE : id === MILL_TYPE.id ? MILL_TYPE : id === TAP_TYPE.id ? TAP_TYPE
  : ISO_HOLDER_TYPES.find((t) => t.id === id) || ISO_INTERNAL_TYPES.find((t) => t.id === id));
const isInternal = (t) => ISO_INTERNAL_TYPES.includes(t);

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const cz = (v) => String(v).replace('.', ',');
const spaced = (code) => code.replace(/^([A-Z]+)(\d)/, '$1 $2');
const spacedInsert = (code) => code.replace(/^(\d+[EI][RL])(.*)$/, '$1 $2').replace(/^([A-Z]{4})(\d)/, '$1 $2');

function loadPrefs() {
  try { return JSON.parse(localStorage.getItem(PREF_KEY)) || {}; } catch (_) { return {}; }
}
function savePrefs(p) {
  try { localStorage.setItem(PREF_KEY, JSON.stringify(p)); } catch (_) { /* soukromé okno apod. */ }
}

function shapeLabel(t) {
  if (t.special === 'parting') return t.round ? '▮ radiusový zápich' : t.long ? '▮ upichovací lišta, dlouhý dosah' : '▮ zapichovací';
  if (t.special === 'grooving') return '▮ vnitřní zapichovací';
  if (t.special === 'facegroove') return '▮ čelní zapichovací';
  if (t.special === 'threading') return '▽ závitová';
  if (t.special === 'drill') return '⌀ vrták';
  if (t.special === 'mill') return '✣ fréza';
  if (t.special === 'tap') return 'Ⓜ závitník';
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
    group: GROUPS.some((g) => g.id === prefs.group) ? prefs.group : 'all',
    hand: opts.hand === 'L' ? 'L' : 'R',
    sel: {},        // id typu → { variant, size, radius, width, thread }
    zoom: null,     // id karty s velkým náhledem
  };

  const recFor = (t) => {
    if (t.special === 'facegroove') return buildIsoFaceGroove({ ...(st.sel[t.id] || {}), hand: st.hand });
    if (t.special === 'drill') return buildIsoDrill(st.sel[t.id] || {});
    if (t.special === 'mill') return buildIsoMill(st.sel[t.id] || {});
    if (t.special === 'tap') return buildIsoTap(st.sel[t.id] || {});
    if (isInternal(t)) return buildIsoInternalKnife(t.id, { ...(st.sel[t.id] || {}), hand: st.hand });
    return buildIsoKnife(t.id, { ...(st.sel[t.id] || {}), shank: st.shank, hand: st.hand });
  };

  function select(key, options, value, title) {
    return `<select data-o="${key}" title="${esc(title)}">${options.map(([v, l]) =>
      `<option value="${esc(v)}"${String(v) === String(value) ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
  }

  function optionsHTML(t, k) {
    if (t.special === 'tap') {
      return select('kind', ISO_TAP_KINDS.map((x) => [x.id, x.label]), k.kind, 'Druh — s lomeným břitem na průchozí díry, se šroubovitou drážkou na slepé')
        + select('thread', METRIC_THREADS.map((x) => [x.name, threadLabel(x)]), k.thread, 'Metrický závit hrubý (ISO 261) a předvrtání');
    }
    if (t.special === 'mill') {
      return select('kind', ISO_MILL_KINDS.map((x) => [x.id, x.label]), k.kind, 'Druh — tvrdokov 3 / 4 zuby, HSS-Co 2 zuby (řežou středem) nebo HSS-Co 4 zuby (neřeže středem, zanoření rampou)')
        + select('diameter', isoMillDiameters().map((d) => [d, isoMillLabel(d, k.kind)]), k.diameter, 'Průměr frézy');
    }
    if (t.special === 'facegroove') {
      const rgi = Number.isInteger(k.range) ? k.range : 1;
      return select('range', FACE_GROOVE_RANGES.map((r, i) => [i, `⌀${r.dmin}–${r.dmax}`]), rgi,
        'Rozsah průměrů zakřivené čepele — zápich musí ležet v něm (vnitřní ⌀d1 ≥ Dmin, vnější ⌀d2 ≤ Dmax)')
        + select('width', isoFaceGrooveWidths(FACE_GROOVE_RANGES[rgi]).map((g) => [g.w, `š ${cz(g.w)} mm · R ${cz(g.r)} · dosah ${g.a}`]), k.width,
          'Šířka zapichovací destičky; dosah = největší hloubka čelního zápichu');
    }
    if (t.special === 'drill') {
      return select('kind', ISO_DRILL_KINDS.map((x) => [x.id, x.label]), k.kind, 'Druh — vrták HSS-Co 118° (DIN 338 / 345), tvrdokov 140° (5×D, vnitřní chlazení) nebo navrtávák 90° / 120°')
        + select('diameter', isoDrillDiameters(k.kind).map((d) => [d, isoDrillLabel(d, k.kind)]), k.diameter, 'Průměr vrtáku (u předvrtání pod závit je napsaný závit)');
    }
    if (isInternal(t)) {
      const bar = select('bar', isoInternalBars(t).map((b) => [b.d, `tyč ⌀${b.d} · díra od ⌀${b.dmin}`]), k.bar,
        'Vyvrtávací tyč — průměr a nejmenší díra, do které se tyč se špičkou vejde (Dmin)');
      if (t.special === 'grooving') {
        return bar + select('width', isoInnerGrooveWidths(k.bar).map((g) => [g.w, `š ${cz(g.w)} mm · R ${cz(g.r)} · dosah ${cz(g.a)}`]), k.width,
          'Zapichovací destička — šířka; dosah = největší hloubka zápichu od stěny díry (poloměr)');
      }
      if (t.special === 'threading') {
        return bar + select('thread', isoThreadInsertsForBar(k.bar).map((x) => [x.id, isoThreadInsertLabel(x, true)]), k.thread,
          'Vnitřní závitová destička (IR) — částečný profil 60° / 55° na rozsah stoupání, plný profil Tr / Acme jen na jedno stoupání');
      }
      return bar + insertSelects(t, k, isoInternalVariants(t, k.bar), isoInternalSizes(t, k.variant, k.bar));
    }
    if (t.special === 'parting') {
      return select('width', isoGrooveWidths(st.shank, t).map((g) => [g.w, `š ${g.w} mm${t.round ? ` · R ${cz(g.r)}` : ''} · ${g.code}`]), k.width,
        t.round ? 'Šířka radiusové zapichovací destičky (plný rádius dna = šířka / 2)' : 'Šířka zapichovací destičky')
        + (t.long ? select('reach', isoLongReaches(k.width).map((r) => [r, `dosah ${r} mm`]), k.reach,
          'Dosah lišty — největší hloubka zápichu / upichnutí (poloměr); tenčí lišta snese menší dosah') : '');
    }
    if (t.special === 'threading') {
      return select('thread', isoThreadInsertsFor(st.shank).map((x) => [x.id, x.label]), k.thread,
        'Závitová destička — částečný profil 60° / 55° na rozsah stoupání, plný profil Tr / Acme jen na jedno stoupání');
    }
    return insertSelects(t, k, isoVariants(t, st.shank), isoSizes(t, k.variant, st.shank));
  }

  /** Výběr destičky: negativní / pozitivní (když jsou obě), velikost, rádius. */
  function insertSelects(t, k, vars, sizes) {
    let html = '';
    if (vars.length > 1) {
      html += select('variant', vars.map((v) => [v, v === 'neg' ? 'negativní' : 'pozitivní']), k.variant,
        'Negativní destička (…NMG, α 0°, oboustranná) nebo pozitivní (…CMT/BMT, šroub, menší řezné síly)');
    }
    html += select('size', sizes.map((sz) => [sz, isoInsertLabel(t, k.variant, sz)]), k.size,
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
    else if (p.toolShape === 'parting') chips.push(`š ${cz(p.toolLength)}`, `R ${cz(p.toolRadius)}`, ...(k.reach ? [`dosah ${k.reach}`] : []));
    else if (p.toolShape === 'threading') chips.push(`ε ${p.toolTipAngle}°`);
    else if (p.toolShape === 'tap') chips.push(`${rec.thread} × ${cz(rec.pitch)}`, `vyložení ${p.toolLength}`, `${rec.holderCode} ⌀${p.holderWidth}`);
    else if (p.toolShape === 'mill') chips.push(`⌀ ${cz(p.toolRadius * 2)}`, `z ${rec.teeth}`, rec.centerCut ? 'řeže středem' : 'NEřeže středem', `vyložení ${p.toolLength}`, `${rec.holderCode} ⌀${p.holderWidth}`);
    else if (p.toolShape === 'drill') chips.push(`⌀ ${cz(p.toolRadius * 2)}`, `σ ${p.toolTipAngle}°`, `vyložení ${p.toolLength}`, `${rec.holderCode} ⌀${p.holderWidth}`);
    if (p.toolClearanceAngle) chips.push(`α ${p.toolClearanceAngle}°`);
    // Vyvrtávací tyč: nejmenší díra a rozumné vyložení ocelové tyče (4×D).
    if (k.internal) chips.push(`díra ≥ ⌀${k.dmin}`, `vyložení ≤ ${4 * k.bar} (4×D)`);
    if (k.face) chips.push(`zápich ⌀${k.dmin}–${k.dmax}`);
    chips.push(p.toolShape === 'tap' ? `Vc ${rec.vc} · F = P·n` : p.toolShape === 'mill' ? `Vc ${rec.vc} · fz ${cz(rec.f)}` : p.toolShape === 'drill' ? `Vc ${rec.vc} · f ${cz(rec.f)}` : `Vc ${rec.vc} · f ${cz(rec.f)} · ap ${cz(rec.ap)}`);
    const big = st.zoom === t.id;
    return `<div class="iso-cat-card${big ? ' iso-cat-card--big' : ''}" data-id="${t.id}">
      <button class="iso-cat-thumb" data-a="zoom" title="${big ? 'Zmenšit náhled' : 'Zvětšit náhled'}">${t.special === 'tap' ? isoTapSvg(rec, big ? 200 : 68) : t.special === 'mill' ? isoMillSvg(rec, big ? 200 : 68) : isoKnifeSvg(rec, big ? 200 : 68)}</button>
      <div class="iso-cat-main">
        <div class="iso-cat-title"><b>${esc(t.special === 'drill' || isLiveT(t) || isInternal(t) ? rec.name : spaced(rec.name))}</b><span class="iso-cat-ins">${esc(t.special === 'drill' || isLiveT(t) ? rec.holderCode : spacedInsert(rec.vbdCode))}</span></div>
        <div class="iso-cat-desc">${esc(shapeLabel(t))} — ${esc(t.special === 'drill' || isLiveT(t) ? rec.desc : t.desc)}</div>
        <div class="iso-cat-chips">${chips.map((c) => `<span>${esc(c)}</span>`).join('')}</div>
        <div class="iso-cat-opts">${optionsHTML(t, k)}</div>
        <div class="iso-cat-btns">
          ${isLiveT(t) ? '' : '<button class="iso-cat-btn iso-cat-btn--ok" data-a="apply" title="Nastaví nůž jako aktuální nástroj — destička, držák i řezné podmínky">✅ Použít</button>'}
          ${opts.onAddToMagazine ? `<button class="iso-cat-btn${isLiveT(t) ? ' iso-cat-btn--ok' : ''}" data-a="mag" title="Přidá ${t.special === 'mill' ? 'frézu' : t.special === 'tap' ? 'závitník' : 'nůž'} do 🔧 Zásobníku jako nové T (okno zůstane otevřené)">🔧 Do zásobníku</button>` : ''}
          ${isLiveT(t) ? `<span class="iso-cat-desc">${t.special === 'tap' ? 'Závitník je poháněný nástroj — CAM ho ze zásobníku vybere pro závity do děr z výkresu.' : 'Fréza je poháněný nástroj — soustružit s ní nejde; CAM ji ze zásobníku vybere pro frézování z výkresu.'}</span>` : '<button class="iso-cat-btn" data-a="save" title="Uloží nůž do 🧰 Moje nože">🧰 Uložit</button>'}
        </div>
      </div>
    </div>`;
  }

  function visibleTypes() {
    const holders = ISO_HOLDER_TYPES.filter((t) => !t.alias && (st.group === 'all' || t.groups.includes(st.group))
      && isoVariants(t, st.shank).length > 0);
    const face = st.group === 'all' || st.group === 'facegroove' ? [FACE_GROOVE_TYPE] : [];
    const internal = st.group === 'all' || st.group === 'internal' ? ISO_INTERNAL_TYPES : [];
    const drill = st.group === 'all' || st.group === 'drill' ? [DRILL_TYPE] : [];
    const mill = st.group === 'all' || st.group === 'mill' ? [MILL_TYPE] : [];
    const tap = st.group === 'all' || st.group === 'tap' ? [TAP_TYPE] : [];
    return [...holders, ...face, ...internal, ...drill, ...mill, ...tap];
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
        ${GROUPS.map((g) => `<button data-g="group" data-v="${g.id}" class="${st.group === g.id ? 'on' : ''}">${esc(g.label)}</button>`).join('')}
      </div>
      <div class="iso-cat-list">${visibleTypes().map(cardHTML).join('') || '<div class="iso-cat-empty">Pro tento dřík tu není žádný nůž.</div>'}</div>
      <div class="iso-cat-note">Dřík ${shank.h}×${shank.b}: l1 ${shank.l1} mm, u přesazených držáků f1 ${shank.f1} mm. Katalog umí ${isoCatalogCount()} kombinací vnějších nožů, ${isoInternalCount()} vnitřních, ${isoFaceGrooveCount()} čelních zapichovacích, ${isoDrillCount()} vrtáků, ${isoMillCount()} fréz a ${isoTapCount()} závitníků.
        Vnitřní nože mají místo dříku tyč ⌀ na kartě; CAM je použije na vyvrtávání (Hrub./Hot. + ◎ Vnitřní), zápich v díře (Upich + ◎ Vnitřní) a vnitřní závit.
        Rozměry držáků a tvar hlavy jsou <b>orientační</b> podle ISO 5608/5610 a typických katalogů — ověřte v katalogu výrobce.
        Po použití jde obrys upravit v 🔪 Geometrii.</div>`;
  }

  function replaceCard(id) {
    const el = root.querySelector(`.iso-cat-card[data-id="${id}"]`);
    const t = typeById(id);
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
    const cur = { ...(recFor(typeById(id)) || {}).iso, ...(st.sel[id] || {}) };
    cur[o.dataset.o] = ['width', 'diameter', 'bar', 'reach', 'range'].includes(o.dataset.o) ? Number(o.value) : o.value;
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
    const t = typeById(card.dataset.id);
    if (a.dataset.a === 'zoom') { st.zoom = st.zoom === t.id ? null : t.id; replaceCard(t.id); return; }
    const rec = recFor(t);
    if (!rec) return;
    if (a.dataset.a === 'apply') opts.onApply(rec);
    else if (a.dataset.a === 'mag' && opts.onAddToMagazine) opts.onAddToMagazine(rec);
    else if (a.dataset.a === 'save') opts.onSave(rec);
  });

  render();
}
