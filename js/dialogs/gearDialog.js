// ╔══════════════════════════════════════════════════════════════╗
// ║  SKICA – Dialog pro ozubení (spur, internal, rack, sprocket)║
// ╚══════════════════════════════════════════════════════════════╝

import { makeOverlay } from '../dialogFactory.js';
import {
  calculateGearDimensions,
  calculateInternalGearDimensions,
  calculateRackDimensions,
  calculateSprocketDimensions,
  CHAIN_STANDARDS,
} from '../tools/gearGenerator.js';

// ── Společné HTML prvky ──

const MODULE_OPTIONS = `
  <option value="">ISO</option>
  <option value="0.5">0.5</option><option value="0.75">0.75</option>
  <option value="1">1</option><option value="1.25">1.25</option>
  <option value="1.5">1.5</option><option value="2" selected>2</option>
  <option value="2.5">2.5</option><option value="3">3</option>
  <option value="4">4</option><option value="5">5</option>
  <option value="6">6</option><option value="8">8</option>
  <option value="10">10</option><option value="12">12</option>
  <option value="16">16</option><option value="20">20</option>`;

const ALPHA_OPTIONS = `
  <option value="14.5">14.5°</option>
  <option value="20" selected>20° (standard)</option>
  <option value="25">25°</option>`;

const CHAIN_OPTIONS = CHAIN_STANDARDS.map(c =>
  `<option value="${c.id}" ${c.id === '08B' ? 'selected' : ''}>${c.label}</option>`
).join('');

// ── Formuláře pro jednotlivé typy ──

function fieldsSpur() {
  return `
    <label class="cnc-field" title="Základní rozměrová jednotka zubu">
      <span>Modul (m) ℹ️</span>
      <div style="display:flex;gap:4px">
        <input data-id="gm" type="number" value="2" min="0.1" step="0.5" style="flex:1">
        <select data-id="gm-preset" title="Standardní moduly ISO" style="width:60px">${MODULE_OPTIONS}</select>
      </div>
    </label>
    <label class="cnc-field" title="Celkový počet zubů. Minimum 6.">
      <span>Počet zubů (z) ℹ️</span>
      <input data-id="gz" type="number" value="20" min="6" max="300" step="1">
    </label>
    <label class="cnc-field" title="Úhel profilu zubu. Standard: 20°">
      <span>Úhel záběru α [°] ℹ️</span>
      <select data-id="galpha">${ALPHA_OPTIONS}</select>
    </label>
    <label class="cnc-field" title="Korekce profilu. 0 = standard.">
      <span>Korekce (x) ℹ️</span>
      <input data-id="gx" type="number" value="0" min="-1" max="1" step="0.1">
    </label>
    <label class="cnc-field" title="Počet bodů na jednu stranu evolventy">
      <span>Body na involutu ℹ️</span>
      <input data-id="gsteps" type="number" value="10" min="5" max="60" step="5">
    </label>`;
}

function fieldsInternal() {
  return `
    <label class="cnc-field" title="Základní rozměrová jednotka zubu">
      <span>Modul (m) ℹ️</span>
      <div style="display:flex;gap:4px">
        <input data-id="gm" type="number" value="3" min="0.1" step="0.5" style="flex:1">
        <select data-id="gm-preset" title="Standardní moduly ISO" style="width:60px">${MODULE_OPTIONS}</select>
      </div>
    </label>
    <label class="cnc-field" title="Celkový počet zubů vnitřního kola. Minimum 18.">
      <span>Počet zubů (z) ℹ️</span>
      <input data-id="gz" type="number" value="40" min="18" max="300" step="1">
    </label>
    <label class="cnc-field" title="Úhel profilu zubu. Standard: 20°">
      <span>Úhel záběru α [°] ℹ️</span>
      <select data-id="galpha">${ALPHA_OPTIONS}</select>
    </label>
    <label class="cnc-field" title="Korekce profilu. 0 = standard.">
      <span>Korekce (x) ℹ️</span>
      <input data-id="gx" type="number" value="0" min="-1" max="1" step="0.1">
    </label>
    <label class="cnc-field" title="Počet bodů na jednu stranu evolventy">
      <span>Body na involutu ℹ️</span>
      <input data-id="gsteps" type="number" value="10" min="5" max="60" step="5">
    </label>`;
}

function fieldsRack() {
  return `
    <label class="cnc-field" title="Základní rozměrová jednotka zubu">
      <span>Modul (m) ℹ️</span>
      <div style="display:flex;gap:4px">
        <input data-id="gm" type="number" value="2" min="0.1" step="0.5" style="flex:1">
        <select data-id="gm-preset" title="Standardní moduly ISO" style="width:60px">${MODULE_OPTIONS}</select>
      </div>
    </label>
    <label class="cnc-field" title="Počet zubů hřebenu">
      <span>Počet zubů ℹ️</span>
      <input data-id="gz" type="number" value="10" min="1" max="100" step="1">
    </label>
    <label class="cnc-field" title="Úhel profilu zubu. Standard: 20°">
      <span>Úhel záběru α [°] ℹ️</span>
      <select data-id="galpha">${ALPHA_OPTIONS}</select>
    </label>
    <label class="cnc-field" title="Korekce profilu. 0 = standard.">
      <span>Korekce (x) ℹ️</span>
      <input data-id="gx" type="number" value="0" min="-1" max="1" step="0.1">
    </label>`;
}

function fieldsSprocket() {
  return `
    <label class="cnc-field" title="Výběr standardního řetězu dle ISO 606 / DIN 8187">
      <span>Standard řetězu ℹ️</span>
      <select data-id="gchain">${CHAIN_OPTIONS}</select>
    </label>
    <label class="cnc-field" title="Rozteč řetězu v mm (automaticky z výběru)">
      <span>Rozteč p [mm] ℹ️</span>
      <input data-id="gp" type="number" value="12.7" min="1" step="0.1">
    </label>
    <label class="cnc-field" title="Průměr válečku řetězu v mm">
      <span>Průměr válečku d₁ [mm] ℹ️</span>
      <input data-id="gd1" type="number" value="8.51" min="1" step="0.1">
    </label>
    <label class="cnc-field" title="Počet zubů řetězového kola. Minimum 7.">
      <span>Počet zubů (z) ℹ️</span>
      <input data-id="gz" type="number" value="19" min="7" max="200" step="1">
    </label>
    <label class="cnc-field" title="Počet bodů na oblouk sedla">
      <span>Body na oblouk ℹ️</span>
      <input data-id="gsteps" type="number" value="8" min="4" max="30" step="2">
    </label>`;
}

// ── Nápovědy ──

const HELP_SPUR = `
  <p><strong>Modul (m)</strong> – Základní jednotka velikosti. Modul = průměr roztečné kružnice / počet zubů.</p>
  <p><strong>Počet zubů (z)</strong> – Celkový počet zubů. Min. 6 (doporučeno 12+).</p>
  <p><strong>Úhel záběru (α)</strong> – 20° je standard. 14.5° historický. 25° vyšší pevnost.</p>
  <p><strong>Korekce (x)</strong> – Pro malá kola (z&lt;17) k zamezení podřezání.</p>
  <hr style="border-color:var(--ctp-surface1);margin:8px 0">
  <p><strong>Vzorce:</strong> d<sub>p</sub>=m×z, d<sub>a</sub>=m×(z+2+2x), d<sub>f</sub>=m×(z−2.5+2x)</p>`;

const HELP_INTERNAL = `
  <p><strong>Vnitřní ozubení</strong> – Zuby směřují dovnitř. Používá se v planetových převodovkách.</p>
  <p>Hlavová kružnice je <em>menší</em> než roztečná, patní je <em>větší</em>.</p>
  <p>Parametry jsou totožné s čelním kolem, jen geometrie je invertovaná.</p>
  <p>Doporučeno min. 18 zubů pro správný profil.</p>`;

const HELP_RACK = `
  <p><strong>Ozubený hřeben</strong> – Přímý (lineární) prvek s lichoběžníkovými zuby.</p>
  <p>Konvertuje rotační pohyb na lineární (pastorek + hřeben).</p>
  <p>Rozteč p = π × m. Výška hlavy h<sub>a</sub> = m. Výška paty h<sub>f</sub> = 1.25m.</p>
  <p>Hřeben se umístí středem na pozici kliknutí.</p>`;

const HELP_SPROCKET = `
  <p><strong>Řetězové kolo</strong> – Profil dle ISO 606 / DIN 8187.</p>
  <p>Zuby mají kruhový profil (sedlo pro váleček řetězu), ne evolventu.</p>
  <p><strong>Rozteč (p)</strong> – Vzdálenost mezi čepy řetězu. Definuje velikost.</p>
  <p><strong>Průměr válečku (d₁)</strong> – Průměr válečku řetězu, který dosedá do sedla.</p>
  <p>Roztečný ⌀: d<sub>p</sub> = p / sin(π/z)</p>`;

/**
 * Otevře dialog pro zadání parametrů ozubení.
 * @param {(params: object) => void} onConfirm
 */
export function showGearDialog(onConfirm) {
  const body = `
    <div class="gear-dialog">
      <label class="cnc-field" style="margin-bottom:8px">
        <span style="font-weight:bold">Typ ozubení</span>
        <select data-id="gtype" style="font-size:14px;padding:4px">
          <option value="spur" selected>⚙️ Čelní kolo (spur)</option>
          <option value="internal">🔄 Vnitřní ozubení</option>
          <option value="rack">📏 Ozubený hřeben</option>
          <option value="sprocket">⛓️ Řetězové kolo</option>
        </select>
      </label>
      <div class="cnc-fields" data-id="gfields"></div>

      <div class="gear-computed" style="margin:10px 0;padding:8px;background:var(--ctp-surface0);border-radius:6px;font-size:12px">
        <strong>📐 Vypočtené rozměry:</strong>
        <div data-id="gresults" style="margin-top:4px;display:grid;grid-template-columns:1fr 1fr;gap:2px 12px"></div>
      </div>

      <label style="display:flex;align-items:center;gap:6px;margin:8px 0;font-size:13px;cursor:pointer" title="Přidá referenční kružnice jako konstrukční objekty" data-id="grefrow">
        <input data-id="grefcircles" type="checkbox" checked>
        <span data-id="greflabel">Přidat referenční kružnice</span>
      </label>

      <details style="margin:8px 0;font-size:12px;color:var(--ctp-subtext0)">
        <summary style="cursor:pointer;font-weight:bold">ℹ️ Nápověda</summary>
        <div data-id="ghelp" style="margin-top:8px;line-height:1.6"></div>
      </details>

      <div class="cnc-actions" style="margin-top:10px">
        <button class="gear-btn-draw" style="background:var(--ctp-green);color:var(--ctp-base);padding:8px 20px;border:none;border-radius:4px;cursor:pointer;font-weight:bold;font-size:14px">
          ✏️ Nakreslit
        </button>
        <button class="gear-btn-cancel" style="background:var(--ctp-surface1);color:var(--ctp-text);padding:8px 16px;border:none;border-radius:4px;cursor:pointer;font-size:13px">
          Zrušit
        </button>
      </div>
    </div>
  `;

  const overlay = makeOverlay("gear", "⚙️ Ozubení", body, "cnc-window");
  if (!overlay) return;

  const typeSelect = overlay.querySelector('[data-id="gtype"]');
  const fieldsDiv = overlay.querySelector('[data-id="gfields"]');
  const resultsDiv = overlay.querySelector('[data-id="gresults"]');
  const helpDiv = overlay.querySelector('[data-id="ghelp"]');
  const refRow = overlay.querySelector('[data-id="grefrow"]');
  const refLabel = overlay.querySelector('[data-id="greflabel"]');

  /** Aktuální typ */
  let currentType = 'spur';

  /** Přestaví formulář pro daný typ */
  function switchType(type) {
    currentType = type;
    switch (type) {
      case 'spur':    fieldsDiv.innerHTML = fieldsSpur(); break;
      case 'internal': fieldsDiv.innerHTML = fieldsInternal(); break;
      case 'rack':    fieldsDiv.innerHTML = fieldsRack(); break;
      case 'sprocket': fieldsDiv.innerHTML = fieldsSprocket(); break;
    }

    // Nápověda
    switch (type) {
      case 'spur':    helpDiv.innerHTML = HELP_SPUR; break;
      case 'internal': helpDiv.innerHTML = HELP_INTERNAL; break;
      case 'rack':    helpDiv.innerHTML = HELP_RACK; break;
      case 'sprocket': helpDiv.innerHTML = HELP_SPROCKET; break;
    }

    // Ref kružnice – jen pro spur a internal
    if (type === 'spur' || type === 'internal') {
      refRow.style.display = 'flex';
      refLabel.textContent = type === 'internal'
        ? 'Přidat referenční kružnice (roztečná, hlavová, patní)'
        : 'Přidat referenční kružnice (roztečná, hlavová, patní)';
    } else if (type === 'sprocket') {
      refRow.style.display = 'flex';
      refLabel.textContent = 'Přidat roztečnou kružnici';
    } else {
      refRow.style.display = 'none';
    }

    wireInputs();
    recalculate();
  }

  /** Propojí inputy s přepočtem */
  function wireInputs() {
    // Modul preset
    const preset = fieldsDiv.querySelector('[data-id="gm-preset"]');
    if (preset) {
      preset.addEventListener('change', () => {
        const mIn = fieldsDiv.querySelector('[data-id="gm"]');
        if (preset.value && mIn) { mIn.value = preset.value; recalculate(); }
      });
    }
    // Chain preset
    const chain = fieldsDiv.querySelector('[data-id="gchain"]');
    if (chain) {
      chain.addEventListener('change', () => {
        const std = CHAIN_STANDARDS.find(c => c.id === chain.value);
        if (std) {
          const pIn = fieldsDiv.querySelector('[data-id="gp"]');
          const d1In = fieldsDiv.querySelector('[data-id="gd1"]');
          if (pIn) pIn.value = std.p;
          if (d1In) d1In.value = std.d1;
          recalculate();
        }
      });
    }
    // Live recalc na všech inputech
    fieldsDiv.querySelectorAll('input, select').forEach(el => {
      el.addEventListener('input', recalculate);
    });
  }

  /** Přepočítá a zobrazí rozměry */
  function recalculate() {
    switch (currentType) {
      case 'spur': {
        const m = parseFloat(fieldsDiv.querySelector('[data-id="gm"]').value) || 2;
        const z = parseInt(fieldsDiv.querySelector('[data-id="gz"]').value) || 20;
        const alpha = parseFloat(fieldsDiv.querySelector('[data-id="galpha"]').value) || 20;
        const xVal = parseFloat(fieldsDiv.querySelector('[data-id="gx"]').value) || 0;
        const dim = calculateGearDimensions(m, z, alpha, xVal);
        resultsDiv.innerHTML = `
          <span>Roztečný ⌀: <strong>${(dim.rp * 2).toFixed(2)} mm</strong></span>
          <span>Hlavový ⌀: <strong>${(dim.ra * 2).toFixed(2)} mm</strong></span>
          <span>Patní ⌀: <strong>${(dim.rf * 2).toFixed(2)} mm</strong></span>
          <span>Základní ⌀: <strong>${(dim.rb * 2).toFixed(2)} mm</strong></span>
          <span>Výška hlavy: <strong>${dim.ha.toFixed(2)} mm</strong></span>
          <span>Výška paty: <strong>${dim.hf.toFixed(2)} mm</strong></span>
          <span>Rozteč: <strong>${dim.p.toFixed(2)} mm</strong></span>
          <span>Tloušťka zubu: <strong>${dim.s.toFixed(2)} mm</strong></span>`;
        break;
      }
      case 'internal': {
        const m = parseFloat(fieldsDiv.querySelector('[data-id="gm"]').value) || 3;
        const z = parseInt(fieldsDiv.querySelector('[data-id="gz"]').value) || 40;
        const alpha = parseFloat(fieldsDiv.querySelector('[data-id="galpha"]').value) || 20;
        const xVal = parseFloat(fieldsDiv.querySelector('[data-id="gx"]').value) || 0;
        const dim = calculateInternalGearDimensions(m, z, alpha, xVal);
        resultsDiv.innerHTML = `
          <span>Roztečný ⌀: <strong>${(dim.rp * 2).toFixed(2)} mm</strong></span>
          <span>Hlavový ⌀ (vnitřní): <strong>${(dim.ra * 2).toFixed(2)} mm</strong></span>
          <span>Patní ⌀ (vnější): <strong>${(dim.rf * 2).toFixed(2)} mm</strong></span>
          <span>Základní ⌀: <strong>${(dim.rb * 2).toFixed(2)} mm</strong></span>
          <span>Výška hlavy: <strong>${dim.ha.toFixed(2)} mm</strong></span>
          <span>Výška paty: <strong>${dim.hf.toFixed(2)} mm</strong></span>
          <span>Rozteč: <strong>${dim.p.toFixed(2)} mm</strong></span>
          <span>Tloušťka zubu: <strong>${dim.s.toFixed(2)} mm</strong></span>`;
        break;
      }
      case 'rack': {
        const m = parseFloat(fieldsDiv.querySelector('[data-id="gm"]').value) || 2;
        const z = parseInt(fieldsDiv.querySelector('[data-id="gz"]').value) || 10;
        const alpha = parseFloat(fieldsDiv.querySelector('[data-id="galpha"]').value) || 20;
        const xVal = parseFloat(fieldsDiv.querySelector('[data-id="gx"]').value) || 0;
        const dim = calculateRackDimensions(m, alpha, xVal);
        resultsDiv.innerHTML = `
          <span>Rozteč: <strong>${dim.p.toFixed(2)} mm</strong></span>
          <span>Celková délka: <strong>${(dim.p * z).toFixed(2)} mm</strong></span>
          <span>Výška hlavy: <strong>${dim.ha.toFixed(2)} mm</strong></span>
          <span>Výška paty: <strong>${dim.hf.toFixed(2)} mm</strong></span>
          <span>Celková výška: <strong>${dim.h.toFixed(2)} mm</strong></span>
          <span>Tloušťka zubu: <strong>${dim.s.toFixed(2)} mm</strong></span>`;
        break;
      }
      case 'sprocket': {
        const pCh = parseFloat(fieldsDiv.querySelector('[data-id="gp"]').value) || 12.7;
        const z = parseInt(fieldsDiv.querySelector('[data-id="gz"]').value) || 19;
        const d1 = parseFloat(fieldsDiv.querySelector('[data-id="gd1"]').value) || 8.51;
        const dim = calculateSprocketDimensions(pCh, z, d1);
        resultsDiv.innerHTML = `
          <span>Roztečný ⌀: <strong>${dim.dp.toFixed(2)} mm</strong></span>
          <span>Hlavový ⌀: <strong>${(dim.ra * 2).toFixed(2)} mm</strong></span>
          <span>Roztečný r: <strong>${dim.rp.toFixed(2)} mm</strong></span>
          <span>Poloměr sedla: <strong>${(dim.d1 / 2).toFixed(2)} mm</strong></span>
          <span>Rozteč: <strong>${dim.p.toFixed(2)} mm</strong></span>
          <span>Počet zubů: <strong>${z}</strong></span>`;
        break;
      }
    }
  }

  typeSelect.addEventListener('change', () => switchType(typeSelect.value));

  // Inicializace
  switchType('spur');

  // Tlačítko Nakreslit
  overlay.querySelector('.gear-btn-draw').addEventListener('click', () => {
    const refCircles = overlay.querySelector('[data-id="grefcircles"]');
    const addRefCircles = refCircles ? refCircles.checked : false;

    switch (currentType) {
      case 'spur': {
        const m = parseFloat(fieldsDiv.querySelector('[data-id="gm"]').value);
        const z = parseInt(fieldsDiv.querySelector('[data-id="gz"]').value);
        const alpha = parseFloat(fieldsDiv.querySelector('[data-id="galpha"]').value);
        const xVal = parseFloat(fieldsDiv.querySelector('[data-id="gx"]').value);
        const steps = parseInt(fieldsDiv.querySelector('[data-id="gsteps"]').value);
        if (!m || m <= 0 || !z || z < 6) { alert('Modul > 0, zuby ≥ 6'); return; }
        overlay.remove();
        onConfirm({ gearType: 'spur', m, z, alpha, x: xVal, steps, addRefCircles });
        return;
      }
      case 'internal': {
        const m = parseFloat(fieldsDiv.querySelector('[data-id="gm"]').value);
        const z = parseInt(fieldsDiv.querySelector('[data-id="gz"]').value);
        const alpha = parseFloat(fieldsDiv.querySelector('[data-id="galpha"]').value);
        const xVal = parseFloat(fieldsDiv.querySelector('[data-id="gx"]').value);
        const steps = parseInt(fieldsDiv.querySelector('[data-id="gsteps"]').value);
        if (!m || m <= 0 || !z || z < 18) { alert('Modul > 0, zuby ≥ 18'); return; }
        overlay.remove();
        onConfirm({ gearType: 'internal', m, z, alpha, x: xVal, steps, addRefCircles });
        return;
      }
      case 'rack': {
        const m = parseFloat(fieldsDiv.querySelector('[data-id="gm"]').value);
        const z = parseInt(fieldsDiv.querySelector('[data-id="gz"]').value);
        const alpha = parseFloat(fieldsDiv.querySelector('[data-id="galpha"]').value);
        const xVal = parseFloat(fieldsDiv.querySelector('[data-id="gx"]').value);
        if (!m || m <= 0 || !z || z < 1) { alert('Modul > 0, zuby ≥ 1'); return; }
        overlay.remove();
        onConfirm({ gearType: 'rack', m, z, alpha, x: xVal, addRefCircles: false });
        return;
      }
      case 'sprocket': {
        const pCh = parseFloat(fieldsDiv.querySelector('[data-id="gp"]').value);
        const z = parseInt(fieldsDiv.querySelector('[data-id="gz"]').value);
        const d1 = parseFloat(fieldsDiv.querySelector('[data-id="gd1"]').value);
        const steps = parseInt(fieldsDiv.querySelector('[data-id="gsteps"]').value);
        if (!pCh || pCh <= 0 || !z || z < 7 || !d1 || d1 <= 0) { alert('Rozteč > 0, zuby ≥ 7, průměr válečku > 0'); return; }
        overlay.remove();
        onConfirm({ gearType: 'sprocket', pChain: pCh, z, d1, steps, addRefCircles });
        return;
      }
    }
  });

  // Tlačítko Zrušit
  overlay.querySelector('.gear-btn-cancel').addEventListener('click', () => {
    overlay.remove();
  });
}
