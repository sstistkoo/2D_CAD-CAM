// ╔══════════════════════════════════════════════════════════════╗
// ║  SKICA – Kalkulačka: objem a hmotnost z výkresu              ║
// ╚══════════════════════════════════════════════════════════════╝
//
// Rotační objem hotového dílu (kontura) a polotovaru (vrstva Polotovar nebo
// válec Ø × L) z aktuálního výkresu, hmotnost podle materiálu a odebraný
// materiál. Výpočet: revolveMath.js (Pappus), profily: stockTools.getRevolveProfiles.

import { state, showToast } from '../state.js';
import { makeOverlay } from '../dialogFactory.js';
import { getRevolveProfiles } from '../stockTools.js';
import { toZR, revolveProps, profilePoints, cylinderVolume } from './revolveMath.js';
import {
  fmt, numVal as val, numField, selectField,
  outRow, outWarn, outHint, outMain, copyText, svgEl, svgClear, fitView, svgPoints,
} from './calcKit.js';

/** [klíč, název, hustota kg/m³] */
const DENSITIES = [
  ['steel', 'Ocel (11 523)', 7850], ['inox', 'Nerez (17 240)', 7900], ['cast', 'Litina šedá', 7200],
  ['alu', 'Hliník', 2700], ['brass', 'Mosaz', 8500], ['copper', 'Měď', 8960], ['bronze', 'Bronz', 8800],
  ['titan', 'Titan', 4500], ['pom', 'POM (ertacetal)', 1410], ['pa6', 'PA6 (nylon)', 1140],
];
const kg = (mm3, rho) => mm3 * 1e-9 * rho;
const cm3 = (mm3) => fmt(mm3 / 1000, 1) + ' cm³';
const fmtKg = (x) => fmt(x, x < 1 ? 3 : x < 100 ? 2 : 1) + ' kg';

export function openVolumeCalc() {
  const body =
    '<div class="cnc-fields">' +
      selectField('mat', 'Materiál', [...DENSITIES.map(([k, n]) => [k, n]), ['custom', 'Vlastní hustota…']]) +
      '<span data-show="custom">' + numField('rho', 'ρ', 'kg/m³', 'hustota') + '</span>' +
      '<span class="cnc-field-full">' + selectField('src', 'Polotovar', [['dwg', 'Z výkresu (vrstva Polotovar)'], ['cyl', 'Válec Ø × délka'], ['none', 'Bez polotovaru']]) + '</span>' +
      '<span data-show-src="cyl">' + numField('D', 'Ø polotovaru', 'mm', 'průměr') + '</span>' +
      '<span data-show-src="cyl">' + numField('L', 'Délka', 'mm', 'délka') + '</span>' +
    '</div>' +
    '<svg class="calc-svg" viewBox="0 0 340 170" id="volSvg" role="img" aria-label="Profil dílu a polotovaru"></svg>' +
    '<div class="calc-out" id="volResult"></div>' +
    '<div class="cnc-actions">' +
      '<button class="cnc-btn cnc-btn-refresh">🔄 Načíst z výkresu</button>' +
      '<button class="cnc-btn cnc-btn-copy">📋 Kopírovat</button>' +
    '</div>' +
    '<div class="calc-note">Díl se „otočí" kolem osy Z: u soustruhu je ve výkresu vodorovná, u karuselu svislá. ' +
      'Profil může být otevřený (od osy k ose) i uzavřený. Počítá se hlavní souvislý řetěz kontury; ' +
      'díra nakreslená zvlášť se nepočítá.</div>';

  const overlay = makeOverlay('volume', '⚖ Objem z výkresu', body);
  if (!overlay) return;

  const q = (id) => overlay.querySelector('[data-id="' + id + '"]');
  const inp = { rho: q('rho'), D: q('D'), L: q('L') };
  const sel = { mat: q('mat'), src: q('src') };
  const svg = overlay.querySelector('#volSvg');
  const resultEl = overlay.querySelector('#volResult');
  let profiles = null;
  let copyStr = '';

  const swap = () => state.machineType === 'karusel';

  function load() {
    profiles = getRevolveProfiles();
    solve();
  }

  function density() {
    if (sel.mat.value !== 'custom') return DENSITIES.find(d => d[0] === sel.mat.value)[2];
    const r = val(inp.rho);
    return r !== null && !(r > 0) ? NaN : r;
  }

  function solve() {
    svgClear(svg);
    copyStr = '';
    overlay.querySelectorAll('[data-show]').forEach(e => { e.style.display = sel.mat.value === e.dataset.show ? '' : 'none'; });
    overlay.querySelectorAll('[data-show-src]').forEach(e => { e.style.display = sel.src.value === e.dataset.showSrc ? '' : 'none'; });

    const partSegs = toZR(profiles.part.chain, swap());
    const part = revolveProps(partSegs);
    if (!part) { resultEl.innerHTML = outHint('Ve výkresu není žádná kontura. Nakresli profil dílu (nebo ho otevři) a stiskni „Načíst z výkresu“.'); return; }
    const rho = density();
    if (Number.isNaN(rho)) { resultEl.innerHTML = outWarn('Vlastní hustota musí být kladné číslo.'); return; }
    if (rho === null) { resultEl.innerHTML = outHint('Zadej hustotu materiálu (kg/m³).'); return; }

    let stockSegs = [], stock = null, stockNote = '';
    if (sel.src.value === 'dwg') {
      stockSegs = toZR(profiles.stock.chain, swap());
      stock = revolveProps(stockSegs);
      if (!stock) stockNote = outHint('Ve výkresu není polotovar (vrstva Polotovar). Vygeneruj ho nebo zadej válec Ø × délka.');
    } else if (sel.src.value === 'cyl') {
      const D = val(inp.D), L = val(inp.L);
      if (Number.isNaN(D) || Number.isNaN(L) || (D !== null && !(D > 0)) || (L !== null && !(L > 0))) stockNote = outWarn('Ø a délka polotovaru musí být kladná čísla.');
      else if (D === null || L === null) stockNote = outHint('Zadej Ø a délku polotovaru.');
      else stock = { volume: cylinderVolume(D, L), cyl: { D, L } };
    }

    draw(partSegs, stockSegs);

    const dia = fmt(2 * Math.max(Math.abs(part.rMax), Math.abs(part.rMin)));
    let html = outMain(fmtKg(kg(part.volume, rho)), 'hotový díl, objem ' + cm3(part.volume) + ', ρ ' + rho + ' kg/m³') +
      outRow('Největší Ø × délka', 'Ø ' + dia + ' × ' + fmt(part.zMax - part.zMin) + ' mm') +
      (part.zCentroid !== null ? outRow('Těžiště na ose', 'Z ' + fmt(part.zCentroid, 2) + ' mm (v souřadnicích výkresu)') : '');
    if (stock) {
      const removed = stock.volume - part.volume;
      html += outRow('Polotovar', fmtKg(kg(stock.volume, rho)) + ' (' + cm3(stock.volume) + ')');
      if (removed >= 0) {
        html += outRow('Odebraný materiál', fmtKg(kg(removed, rho)) + ' (' + cm3(removed) + ', ' + fmt(100 * removed / stock.volume, 1) + ' % polotovaru)');
      } else {
        html += outWarn('Díl je objemově větší než polotovar (o ' + cm3(-removed) + ') – zkontroluj, jestli polotovar díl obsahuje.');
      }
    } else html += stockNote;
    if (part.crossesAxis) html += outWarn('Profil přechází přes osu rotace – objem je v takovém případě nespolehlivý. Profil se kreslí jen z jedné strany osy.');
    if (profiles.part.leftovers) html += outWarn(profiles.part.leftovers + ' čar kontury nenavazuje na hlavní profil a nepočítá se (např. samostatně nakreslená díra).');
    if (sel.src.value === 'dwg' && stock && profiles.stock.leftovers) html += outWarn(profiles.stock.leftovers + ' čar polotovaru nenavazuje na hlavní řetěz a nepočítá se.');
    resultEl.innerHTML = html;

    copyStr = 'Díl: ' + cm3(part.volume) + ', ' + fmtKg(kg(part.volume, rho)) + ' (ρ ' + rho + ' kg/m³)' +
      (stock ? '\nPolotovar: ' + cm3(stock.volume) + ', ' + fmtKg(kg(stock.volume, rho)) +
        '\nOdebráno: ' + cm3(stock.volume - part.volume) + ', ' + fmtKg(kg(stock.volume - part.volume, rho)) : '');
  }

  // ── Náčrt: osa rotace vodorovně, r nahoru ──
  function draw(partSegs, stockSegs) {
    const pp = profilePoints(partSegs), sp = profilePoints(stockSegs);
    const all = [...pp, ...sp, ...pp.map(([z]) => [z, 0])];
    const map = fitView(all, 340, 170, 16);
    const poly = (pts, cls) => { if (pts.length > 1) svg.appendChild(svgEl('polyline', { points: svgPoints(map, pts), class: cls })); };
    const zs = all.map(p => p[0]);
    poly([[Math.min(...zs), 0], [Math.max(...zs), 0]], 'cs-axis');
    poly(sp, 'cs-thin');
    poly(pp, 'cs-contour');
    svg.appendChild(svgEl('text', { x: 6, y: 164, class: 'cs-txt-s' }, 'osa rotace vodorovně · plná = díl · tenká = polotovar'));
  }

  Object.values(inp).forEach(i => i.addEventListener('input', solve));
  Object.values(sel).forEach(s => s.addEventListener('change', solve));
  overlay.querySelector('.cnc-btn-refresh').addEventListener('click', () => { load(); showToast('Načteno z výkresu'); });
  overlay.querySelector('.cnc-btn-copy').addEventListener('click', () => {
    if (!copyStr) { showToast('Není co kopírovat'); return; }
    copyText(copyStr);
  });
  load();
}
