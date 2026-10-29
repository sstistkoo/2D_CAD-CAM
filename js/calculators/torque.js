// ╔══════════════════════════════════════════════════════════════╗
// ║  SKICA – Kalkulačka: utahovací momenty (Nm)                  ║
// ╚══════════════════════════════════════════════════════════════╝
//
// 1) Moje nože – vlastní seznam držák / VBD / šroub / klíč / Nm (localStorage)
// 2) Šrouby VBD – orientační tabulka momentů upínacích šroubů destiček
// 3) Šroub M – moment podle VDI 2230 (upínky, čelisti na desce karuselu)
// 4) Klíč – nastavení klíče s prodloužením, převody jednotek momentu

import { showToast } from '../state.js';
import { makeOverlay } from '../dialogFactory.js';
import {
  INSERT_SCREWS, KENLOC_PINS, CLAMP_SCREWS, insertIC, hexKeyOf, quickTorqueForHex, torxOf, torxPlusOf, keyKindOf, insertScrewsForTorx, STRENGTH_CLASSES, FRICTION, METRIC_BOLTS, TORQUE_UNITS,
  boltTorque, yieldOf, wrenchSetting, convertTorque,
} from './torqueMath.js';
import {
  fmt, numVal as val, numField, selectField, tabsHtml, wireTabs,
  outRow, outWarn, outHint, outMain, outFormula, copyText,
} from './calcKit.js';

const STORE_KEY = 'skica-torque-tools';
const esc = (t) => String(t ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const nm = (x) => fmt(x, x < 10 ? 2 : 1).replace('.', ',');
const range = (lo, hi) => lo === hi ? nm(lo) : nm(lo) + '–' + nm(hi);

function loadTools() {
  try {
    const a = JSON.parse(localStorage.getItem(STORE_KEY) || '[]');
    return Array.isArray(a) ? a.filter(t => t && typeof t.name === 'string') : [];
  } catch { return []; }
}
function saveTools(list) {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(list)); return true; } catch { return false; }
}

const textField = (id, label, placeholder) =>
  '<label class="cnc-field"><span>' + label + '</span><input type="text" data-id="' + id + '" placeholder="' + placeholder + '"></label>';

export function openTorqueCalc() {
  const refRows = INSERT_SCREWS.map(([th, key, lo, hi, use], i) =>
    '<tr data-ref="' + i + '"><td>' + th + '</td><td>' + key + '</td><td style="white-space:nowrap"><strong>' + range(lo, hi) + '</strong></td><td>' + use + '</td></tr>').join('');
  const pinRows = KENLOC_PINS.map(([hex, pin, th, v, , use], i) =>
    '<tr data-pin="' + i + '"><td style="white-space:nowrap">' + nm(hex) + ' mm</td><td>' + pin + ' (' + th + ')</td><td style="white-space:nowrap"><strong>' + nm(v) + '</strong></td><td>' + use + '</td></tr>').join('');

  const clampRows = CLAMP_SCREWS.map(([hex, sc, th, lo, hi], i) =>
    '<tr data-clamp="' + i + '"><td style="white-space:nowrap">' + nm(hex) + ' mm</td><td>' + sc + ' (' + th + ')</td><td style="white-space:nowrap"><strong>' + range(lo, hi) + '</strong></td></tr>').join('');

  const body =
    tabsHtml([['tools', 'Moje nože'], ['ref', 'Šrouby VBD'], ['bolt', 'Šroub M'], ['key', 'Klíč']]) +
    // ── 1) Moje nože ──
    '<div data-tab-body="tools">' +
      '<div class="cnc-fields">' +
        '<span class="cnc-field-full">' + textField('tName', 'Nůž / držák', 'např. T3 PCLNR 3232P19') + '</span>' +
        textField('tInsert', 'Plátek (VBD)', 'CNMG 190612') +
        textField('tScrew', 'Šroub', 'M5 / páka…') +
        selectField('tKeyType', 'Čím se dotahuje', [['', '— vybrat —'], ['torx', 'Torx (T)'], ['torxplus', 'Torx Plus (IP)'], ['imbus', 'Imbus (šestihran, mm)'], ['other', 'Jiný']]) +
        textField('tKey', 'Velikost klíče', 'T20 / imbus 2,5') +
        numField('tNm', 'Moment', 'Nm', 'z katalogu') +
        '<span class="cnc-field-full">' + textField('tNote', 'Poznámka', 'podložka, páka, upínka…') + '</span>' +
      '</div>' +
      '<div class="cnc-actions">' +
        '<button class="cnc-btn" data-act="save">💾 Uložit</button>' +
        '<button class="cnc-btn" data-act="new">➕ Nový</button>' +
      '</div>' +
      '<div class="calc-out" data-id="tInfo"></div>' +
      '<input type="search" class="cnc-filter" data-id="tFilter" placeholder="🔍 Hledat nůž, plátek, šroub…">' +
      '<div class="cnc-table-wrap cnc-table-tall"><table class="cnc-table"><thead><tr>' +
        '<th>Nůž / držák</th><th>Plátek</th><th>Šroub</th><th>Nm</th><th></th>' +
      '</tr></thead><tbody data-id="tList"></tbody></table></div>' +
    '</div>' +
    // ── 2) Šrouby VBD ──
    '<div data-tab-body="ref" style="display:none">' +
      '<div class="cnc-table-label">Upínací šrouby destiček (Torx) – orientační moment <small>klepni = převzít do Moje nože</small></div>' +
      '<div class="cnc-table-wrap cnc-table-tall"><table class="cnc-table"><thead><tr>' +
        '<th>Závit</th><th>Klíč</th><th>Nm</th><th>Použití</th>' +
      '</tr></thead><tbody>' + refRows + '</tbody></table></div>' +
      '<div class="cnc-table-label">Kennametal Kenloc – čep negativních VBD s otvorem (imbus) <small>klepni = převzít</small></div>' +
      '<div class="cnc-table-wrap"><table class="cnc-table"><thead><tr>' +
        '<th>Imbus</th><th>Čep</th><th>Nm</th><th>VBD</th>' +
      '</tr></thead><tbody data-id="pinRows">' + pinRows + '</tbody></table></div>' +
      '<div class="cnc-table-label">Kennametal – šroub upínky shora (imbus) <small>klepni = převzít</small></div>' +
      '<div class="cnc-table-wrap"><table class="cnc-table"><thead><tr>' +
        '<th>Imbus</th><th>Šroub upínky</th><th>Nm</th>' +
      '</tr></thead><tbody data-id="clampRows">' + clampRows + '</tbody></table></div>' +
      '<div class="calc-note">Rozsah podle katalogů Kennametal a Denitool – výrobci se liší až 2× (M3,5: 1,7 vs 3,4 Nm). ' +
        '<strong>Platí hodnota vyražená na držáku, na obalu šroubu nebo v katalogu výrobce.</strong> ' +
        'Šroub VBD utahuj momentovým šroubovákem (ne „od ruky" L-klíčem), závit lehce namaž pastou proti zadření ' +
        '(Molykote / měděná), opotřebený šroub a Torx klíč měň. Přetažení = prasklý plátek nebo utržený šroub, ' +
        'nedotažení = plátek se v řezu pohne.</div>' +
    '</div>' +
    // ── 3) Šroub M (VDI 2230) ──
    '<div data-tab-body="bolt" style="display:none">' +
      '<div class="cnc-fields">' +
        selectField('bD', 'Závit', METRIC_BOLTS.map(([d, P]) => [d, 'M' + d + ' × ' + String(P).replace('.', ',')])) +
        selectField('bCls', 'Pevnost', STRENGTH_CLASSES.map(([k, n]) => [k, n])) +
        '<span class="cnc-field-full">' + selectField('bMu', 'Tření μ (závit i hlava)', FRICTION) + '</span>' +
      '</div>' +
    '</div>' +
    // ── 4) Klíč ──
    '<div data-tab-body="key" style="display:none">' +
      '<div class="cnc-table-label">Momentový klíč s prodloužením (nástavec v ose klíče)</div>' +
      '<div class="cnc-fields">' +
        numField('kM', 'Požadovaný moment', 'Nm', 'na šroubu') +
        numField('kL', 'Délka klíče L', 'mm', 'rukojeť → čtyřhran') +
        numField('kA', 'Prodloužení a', 'mm', 'přesah nástavce') +
      '</div>' +
      '<div class="cnc-table-label" style="margin-top:8px">Převod jednotek</div>' +
      '<div class="cnc-fields">' +
        numField('cV', 'Hodnota', '', 'moment') +
        selectField('cU', 'Jednotka', TORQUE_UNITS.map(([k, n]) => [k, n])) +
      '</div>' +
    '</div>' +
    '<div class="calc-out" data-id="result"></div>' +
    '<div class="cnc-actions">' +
      '<button class="cnc-btn cnc-btn-copy">📋 Kopírovat</button>' +
    '</div>';

  const overlay = makeOverlay('torque', '🔧 Utahovací momenty (Nm)', body);
  if (!overlay) return;

  const q = (id) => overlay.querySelector('[data-id="' + id + '"]');
  const resultEl = q('result');
  const toolIds = ['tName', 'tInsert', 'tScrew', 'tKeyType', 'tKey', 'tNm', 'tNote'];
  const f = Object.fromEntries(toolIds.map(id => [id, q(id)]));
  let tools = loadTools();
  let editIdx = -1;
  let tab = 'tools';
  let copyLine = '';

  // ── Moje nože ──
  function renderList() {
    const flt = q('tFilter').value.trim().toLowerCase();
    const rows = tools.map((t, i) => [t, i]).filter(([t]) => !flt ||
      [t.name, t.insert, t.screw, t.key, t.note].join(' ').toLowerCase().includes(flt));
    q('tList').innerHTML = rows.length ? rows.map(([t, i]) =>
      '<tr data-i="' + i + '"' + (i === editIdx ? ' class="calc-row-active"' : '') + ' title="' + esc(t.note || '') + '">' +
        '<td>' + esc(t.name) + '</td><td>' + esc(t.insert) + '</td><td>' + esc([t.screw, t.key].filter(Boolean).join(' ')) + '</td>' +
        '<td><strong>' + (Number.isFinite(t.nm) ? nm(t.nm) : '–') + '</strong></td>' +
        '<td><button type="button" class="cnc-btn" data-del="' + i + '" title="Smazat" style="padding:1px 6px">✕</button></td></tr>').join('')
      : '<tr><td colspan="5" style="text-align:center;color:var(--ctp-subtext0)">' +
        (tools.length ? 'Nic nenalezeno' : 'Zatím prázdné – vyplň nůž a moment a dej Uložit') + '</td></tr>';
  }

  function showToolInfo() {
    const info = q('tInfo');
    const t = editIdx >= 0 ? tools[editIdx] : null;
    const screw = (f.tScrew.value || '').replace('.', ',').match(/M\d+(,\d)?/i);
    const ref = screw && INSERT_SCREWS.find(r => r[0].toLowerCase() === screw[0].toLowerCase());
    let html = '';
    if (t && Number.isFinite(t.nm)) html += outMain(nm(t.nm) + ' Nm', esc(t.name) + (t.key ? ' · klíč ' + esc(t.key) : ''));
    else html += outHint(editIdx >= 0 ? 'Úprava záznamu – změň a dej Uložit.' : 'Nový záznam.');
    if (ref) html += outRow('Orientačně ' + ref[0] + ' ' + ref[1], range(ref[2], ref[3]) + ' Nm');
    // Kenloc: podle plátku (IC, negativní) nebo podle imbusu
    const ins = insertIC(f.tInsert.value), hex = hexKeyOf(f.tKey.value);
    const tp = torxPlusOf(f.tKey.value);
    const torx = tp !== null ? tp : torxOf(f.tKey.value);
    const torxName = tp !== null ? 'Torx Plus IP' : 'Torx T';
    const torxRows = torx !== null ? insertScrewsForTorx(torx) : [];
    if (torxRows.length && !(t && Number.isFinite(t.nm))) {
      const lo = Math.min(...torxRows.map(r => r[2])), hi = Math.max(...torxRows.map(r => r[3]));
      html += outMain(range(lo, hi) + ' Nm', torxName + torx + ' – šrouby ' + torxRows.map(r => r[0]).join(' / ') + ' (podle katalogů), platí údaj na držáku' + (tp !== null ? ' · Torx Plus nedotahuj klasickým Torxem' : ''));
    }
    const quick = hex !== null ? quickTorqueForHex(hex) : null;
    if (quick !== null && !(t && Number.isFinite(t.nm))) {
      html += outMain('≈ ' + nm(quick) + ' Nm', 'Rychlý odhad pro imbus ' + nm(hex) + ' mm – spodní hranice katalogů, platí údaj na držáku');
    }
    const pin = KENLOC_PINS.find(p => (ins && ins.neg && Math.abs(p[4] - ins.ic) < 0.01) || (hex !== null && p[0] === hex));
    if (pin && !ref) {
      html += outRow('Kenloc ' + pin[1] + ', imbus ' + nm(pin[0]), nm(pin[3]) + ' Nm');
      if (ins && ins.neg && hex !== null && hex !== pin[0]) html += outWarn('Plátek odpovídá imbusu ' + nm(pin[0]) + ', zadán ' + nm(hex) + ' – jiný upínací systém? Ověř v katalogu držáku.');
      else html += outHint('Čep pod plátkem (Kenloc). Jiný výrobce → jeho katalog.');
    }
    const clamp = !ref && hex !== null && CLAMP_SCREWS.find(c => c[0] === hex);
    if (clamp) html += outRow('Upínka shora ' + clamp[1].split(' / ')[0] + '…, imbus ' + nm(hex), range(clamp[3], clamp[4]) + ' Nm') +
      outHint('Rozliš, čím imbus točí: čep pod plátkem, nebo šroub upínky shora.');
    const v = val(f.tNm);
    if (ref && v > 0 && (v > ref[3] * 1.5 || v < ref[2] * 0.6)) html += outWarn('Zadaný moment je daleko od běžného rozsahu – ověř v katalogu.');
    info.innerHTML = html;
  }

  const KEY_PREFIX = { torx: 'T', torxplus: 'IP', imbus: 'imbus ' };
  function syncKeyType() {
    const k = keyKindOf(f.tKey.value);
    f.tKeyType.value = k ? k.kind : (f.tKey.value.trim() ? 'other' : '');
  }
  f.tKeyType.addEventListener('change', () => {
    const kind = f.tKeyType.value, prefix = KEY_PREFIX[kind];
    if (prefix === undefined) { f.tKey.focus(); showToolInfo(); return; }
    const k = keyKindOf(f.tKey.value);
    const num = k ? String(k.size).replace('.', ',') : (f.tKey.value.match(/\d+(?:[.,]\d+)?/) || [''])[0];
    f.tKey.value = num ? prefix + num : prefix.trim();
    showToolInfo(); solve(); f.tKey.focus();
  });
  f.tKey.addEventListener('input', syncKeyType);

  function fillForm(t) {
    f.tName.value = t?.name || ''; f.tInsert.value = t?.insert || ''; f.tScrew.value = t?.screw || '';
    f.tKey.value = t?.key || ''; f.tNm.value = Number.isFinite(t?.nm) ? String(t.nm).replace('.', ',') : ''; f.tNote.value = t?.note || '';
    f.tNm.placeholder = 'z katalogu';
    syncKeyType();
  }

  function saveTool() {
    const name = f.tName.value.trim();
    const v = val(f.tNm);
    if (!name) { showToast('Zadej název nože / držáku'); f.tName.focus(); return; }
    if (Number.isNaN(v) || (v !== null && !(v > 0))) { showToast('Moment musí být kladné číslo'); return; }
    const rec = {
      name, insert: f.tInsert.value.trim(), screw: f.tScrew.value.trim(), key: f.tKey.value.trim(),
      nm: v, note: f.tNote.value.trim(),
    };
    if (editIdx >= 0) tools[editIdx] = rec; else { tools.push(rec); editIdx = tools.length - 1; }
    tools.sort((a, b) => a.name.localeCompare(b.name, 'cs', { numeric: true }));
    editIdx = tools.indexOf(rec);
    showToast(saveTools(tools) ? 'Uloženo' : 'Uložení se nezdařilo (úložiště prohlížeče)');
    renderList(); showToolInfo();
  }

  q('tList').addEventListener('click', (e) => {
    const del = e.target.closest('[data-del]');
    if (del) {
      const i = +del.dataset.del;
      if (!confirm('Smazat „' + tools[i].name + '"?')) return;
      tools.splice(i, 1);
      if (editIdx === i) { editIdx = -1; fillForm(null); } else if (editIdx > i) editIdx--;
      saveTools(tools); renderList(); showToolInfo();
      return;
    }
    const tr = e.target.closest('tr[data-i]');
    if (!tr) return;
    editIdx = +tr.dataset.i;
    fillForm(tools[editIdx]);
    renderList(); showToolInfo(); solve();
  });
  overlay.querySelector('[data-act="save"]').addEventListener('click', saveTool);
  overlay.querySelector('[data-act="new"]').addEventListener('click', () => {
    editIdx = -1; fillForm(null); renderList(); showToolInfo(); solve(); f.tName.focus();
  });
  q('tFilter').addEventListener('input', renderList);
  [f.tScrew, f.tNm, f.tInsert, f.tKey].forEach(i => i.addEventListener('input', () => { showToolInfo(); solve(); }));

  // ── Šrouby VBD → převzít do formuláře ──
  overlay.querySelector('[data-tab-body="ref"] tbody').addEventListener('click', (e) => {
    const tr = e.target.closest('tr[data-ref]');
    if (!tr) return;
    const [th, key, lo, hi] = INSERT_SCREWS[+tr.dataset.ref];
    f.tScrew.value = th; f.tKey.value = key.split(' / ')[0]; syncKeyType();
    f.tNm.placeholder = 'typ. ' + range(lo, hi);
    overlay.querySelector('.calc-tab[data-tab="tools"]').click();
    showToolInfo();
    showToast('Šroub ' + th + ' převzat – moment doplň z katalogu');
  });

  q('pinRows').addEventListener('click', (e) => {
    const tr = e.target.closest('tr[data-pin]');
    if (!tr) return;
    const [hex, pin, th, v] = KENLOC_PINS[+tr.dataset.pin];
    f.tScrew.value = 'Kenloc ' + pin.split(' / ').pop() + ' (' + th + ')';
    f.tKey.value = 'imbus ' + nm(hex); syncKeyType();
    if (!f.tNm.value.trim()) f.tNm.value = nm(v);
    overlay.querySelector('.calc-tab[data-tab="tools"]').click();
    showToolInfo();
    showToast('Kenloc čep převzat – ' + nm(v) + ' Nm (Kennametal)');
  });

  q('clampRows').addEventListener('click', (e) => {
    const tr = e.target.closest('tr[data-clamp]');
    if (!tr) return;
    const [hex, sc, th, lo, hi] = CLAMP_SCREWS[+tr.dataset.clamp];
    f.tScrew.value = 'upínka ' + sc.split(' / ')[0] + ' (' + th.split(' / ').pop() + ')';
    f.tKey.value = 'imbus ' + nm(hex); syncKeyType();
    if (!f.tNm.value.trim()) f.tNm.value = nm(lo);
    overlay.querySelector('.calc-tab[data-tab="tools"]').click();
    showToolInfo();
    showToast('Šroub upínky převzat – ' + range(lo, hi) + ' Nm (Kennametal)');
  });

  // ── Výpočty ──
  const bad = (msg) => { resultEl.innerHTML = outWarn(msg); };

  function solve() {
    copyLine = '';
    resultEl.innerHTML = '';
    resultEl.style.display = tab === 'ref' ? 'none' : '';
    if (tab === 'tools') return solveTools();
    if (tab === 'bolt') return solveBolt();
    if (tab === 'key') return solveKey();
  }

  function solveTools() {
    resultEl.style.display = 'none';
    copyLine = tools.map(t => t.name + (t.insert ? ' | ' + t.insert : '') + (t.screw || t.key ? ' | ' + [t.screw, t.key].filter(Boolean).join(' ') : '') +
      ' | ' + (Number.isFinite(t.nm) ? nm(t.nm) + ' Nm' : '–') + (t.note ? ' | ' + t.note : '')).join('\n');
  }

  function solveBolt() {
    const d = +q('bD').value, cls = q('bCls').value, mu = +q('bMu').value;
    const [, P, dw, dh] = METRIC_BOLTS.find(r => r[0] === d);
    const r = boltTorque({ d, P, dw, dh, Rp: yieldOf(cls, d), mu });
    if (!r) return bad('Výpočet se nezdařil.');
    resultEl.innerHTML = outMain(nm(r.MA) + ' Nm', 'M' + d + ' ' + cls + ', μ ' + String(mu).replace('.', ',') + ' – utažení na 90 % meze kluzu') +
      outRow('Předpětí F<sub>M</sub>', fmt(r.FM / 1000, 1).replace('.', ',') + ' kN') +
      outRow('Pro jistotu nastav (−10 %)', nm(r.MA * 0.9) + ' Nm') +
      outHint('Pro upínky, čelisti a T-šrouby na desce karuselu. Hlava šestihranná / imbus, střední díra.') +
      outFormula('M<sub>A</sub> = F<sub>M</sub>·(0,16·P + 0,58·d₂·μ + D<sub>Km</sub>/2·μ)  (VDI 2230)');
    copyLine = 'M' + d + ' ' + cls + ', μ ' + mu + ': ' + nm(r.MA) + ' Nm (F_M ' + fmt(r.FM / 1000, 1) + ' kN)';
  }

  function solveKey() {
    let html = '';
    const M = val(q('kM')), L = val(q('kL')), a = val(q('kA')) ?? 0;
    if ([M, L, a].some(Number.isNaN)) html += outWarn('Neplatná hodnota u klíče.');
    else if (M !== null && L !== null) {
      const s = wrenchSetting(M, L, a);
      if (s === null) html += outWarn('Moment a délka klíče musí být kladné.');
      else {
        html += outMain('nastav ' + nm(s) + ' Nm', 'pro ' + nm(M) + ' Nm na šroubu') +
          outFormula('M<sub>klíč</sub> = M · L / (L + a)') +
          outHint('Nástavec otočený o 90° k ose klíče moment nemění.');
        copyLine = 'Klíč L ' + fmt(L) + ' mm + prodloužení ' + fmt(a) + ' mm: nastavit ' + nm(s) + ' Nm (na šroubu ' + nm(M) + ' Nm)';
      }
    } else html += outHint('Zadej moment a délku klíče.');
    const v = val(q('cV')), u = q('cU').value;
    if (Number.isNaN(v)) html += outWarn('Neplatná hodnota převodu.');
    else if (v !== null) {
      const lines = TORQUE_UNITS.filter(t => t[0] !== u).map(([k, n]) => [n, convertTorque(v, u, k)]);
      html += lines.map(([n, x]) => outRow(n, fmt(x, 3).replace('.', ','))).join('');
      if (!copyLine) copyLine = fmt(v, 3) + ' ' + TORQUE_UNITS.find(t => t[0] === u)[1] + ' = ' + lines.map(([n, x]) => fmt(x, 3) + ' ' + n).join(' = ');
    }
    resultEl.innerHTML = html;
  }

  wireTabs(overlay, (id) => {
    tab = id;
    overlay.querySelectorAll('[data-tab-body]').forEach(e => { e.style.display = e.dataset.tabBody === id ? '' : 'none'; });
    solve();
  });
  ['bD', 'bCls', 'bMu', 'cU'].forEach(id => q(id).addEventListener('change', solve));
  ['kM', 'kL', 'kA', 'cV'].forEach(id => q(id).addEventListener('input', solve));
  q('bD').value = '16';
  q('bCls').value = '10.9';
  q('bMu').value = '0.12';
  overlay.querySelector('.cnc-btn-copy').addEventListener('click', () => {
    if (!copyLine) { showToast(tab === 'tools' ? 'Seznam je prázdný' : 'Zadej hodnoty výpočtu'); return; }
    copyText(copyLine);
  });

  renderList();
  showToolInfo();
  solve();
}
