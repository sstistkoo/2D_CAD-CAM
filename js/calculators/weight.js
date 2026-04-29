import { showToast } from '../state.js';
import { safeEvalMath } from '../utils.js';
import { makeOverlay } from '../dialogFactory.js';

export function openWeightCalc() {
  const body =
    '<div class="cnc-fields">' +
      '<label class="cnc-field cnc-field-full"><span>Tvar</span>' +
        '<select data-id="wShape">' +
          '<option value="rod">Kulatina (pln\u00E1)</option>' +
          '<option value="tube">Trubka</option>' +
          '<option value="flat">Ploch\u00E1 ty\u010D</option>' +
          '<option value="hex">\u0160estihran (SW)</option>' +
          '<option value="cone">Komol\u00FD ku\u017Eel</option>' +
        '</select></label>' +
      '<label class="cnc-field cnc-field-full"><span>Materi\u00E1l</span>' +
        '<select data-id="wMat">' +
          '<option value="7850">Ocel (11 523) \u2013 7850</option>' +
          '<option value="7900">Nerez (17 240) \u2013 7900</option>' +
          '<option value="2700">Hlin\u00EDk \u2013 2700</option>' +
          '<option value="8500">Mosaz \u2013 8500</option>' +
          '<option value="8960">M\u011B\u010F \u2013 8960</option>' +
          '<option value="8800">Bronz \u2013 8800</option>' +
          '<option value="1410">POM (ertacetal) \u2013 1410</option>' +
          '<option value="1140">PA6 (nylon) \u2013 1140</option>' +
        '</select></label>' +
    '</div>' +
    '<div class="cnc-fields" id="wDims">' +
      '<label class="cnc-field" id="wDField"><span>D <small>mm</small></span><input type="number" data-id="wD" step="any" placeholder="Pr\u016Fm\u011Br"></label>' +
      '<label class="cnc-field" id="wdField" style="display:none"><span>d <small>mm</small></span><input type="number" data-id="wd" step="any" placeholder="Vnit\u0159n\u00ED / mal\u00FD \u00D8"></label>' +
      '<label class="cnc-field" id="wWField" style="display:none"><span>\u0160 <small>mm</small></span><input type="number" data-id="wW" step="any" placeholder="\u0160\u00ED\u0159ka / SW"></label>' +
      '<label class="cnc-field" id="wHField" style="display:none"><span>V <small>mm</small></span><input type="number" data-id="wH" step="any" placeholder="V\u00FD\u0161ka"></label>' +
      '<label class="cnc-field"><span>L <small>mm</small></span><input type="number" data-id="wL" step="any" placeholder="D\u00E9lka"></label>' +
    '</div>' +
    '<div class="cnc-result" id="wResult">Zadejte rozm\u011Bry\u2026</div>' +
    '<div class="cnc-actions"><button class="cnc-btn cnc-btn-copy">\uD83D\uDCCB Kopírovat</button></div>';

  const overlay = makeOverlay("weight", "\u2696\uFE0F Hmotnost", body);
  if (!overlay) return;

  const shape = overlay.querySelector('[data-id="wShape"]');
  const mat = overlay.querySelector('[data-id="wMat"]');
  const inpD = overlay.querySelector('[data-id="wD"]');
  const inpd = overlay.querySelector('[data-id="wd"]');
  const inpW = overlay.querySelector('[data-id="wW"]');
  const inpH = overlay.querySelector('[data-id="wH"]');
  const inpL = overlay.querySelector('[data-id="wL"]');
  const dField = overlay.querySelector("#wDField");
  const dFieldInner = overlay.querySelector("#wdField");
  const wField = overlay.querySelector("#wWField");
  const hField = overlay.querySelector("#wHField");
  const resultEl = overlay.querySelector("#wResult");

  function updateShape() {
    const s = shape.value;
    // D field: visible for rod, tube, cone
    dField.style.display = (s === "flat" || s === "hex") ? "none" : "";
    // d field: visible for tube and cone (cone = small diameter)
    dFieldInner.style.display = (s === "tube" || s === "cone") ? "" : "none";
    // W field: visible for flat and hex (SW = klíč)
    wField.style.display = (s === "flat" || s === "hex") ? "" : "none";
    // H field: visible for flat only
    hField.style.display = (s === "flat") ? "" : "none";
    // Update labels
    if (s === "hex") {
      inpW.closest('label').querySelector('span').innerHTML = 'SW <small>mm</small>';
      inpW.placeholder = "Klíč (šestihran)";
    } else {
      inpW.closest('label').querySelector('span').innerHTML = 'Š <small>mm</small>';
      inpW.placeholder = "Šířka";
    }
    if (s === "cone") {
      inpd.closest('label').querySelector('span').innerHTML = 'd <small>mm</small>';
      inpd.placeholder = "Malý Ø";
    } else {
      inpd.closest('label').querySelector('span').innerHTML = 'd <small>mm</small>';
      inpd.placeholder = "Vnitřní Ø";
    }
    calc();
  }

  function calc() {
    const s = shape.value;
    const rho = parseFloat(mat.value);
    const L = inpL.value !== "" ? safeEvalMath(inpL.value) : null;
    var vol = null;

    if (s === "rod") {
      const D = inpD.value !== "" ? safeEvalMath(inpD.value) : null;
      if (D && L) vol = Math.PI / 4 * D * D * L;
    } else if (s === "tube") {
      const D = inpD.value !== "" ? safeEvalMath(inpD.value) : null;
      const d = inpd.value !== "" ? safeEvalMath(inpd.value) : null;
      if (D && d && L) vol = Math.PI / 4 * (D * D - d * d) * L;
    } else if (s === "hex") {
      // Šestihran: plocha = (3√3/2) × (SW/2)² × 2 = (3√3/2) × SW²/4... no:
      // Regular hexagon with flat-to-flat = SW: area = (√3/2) × SW²
      const SW = inpW.value !== "" ? safeEvalMath(inpW.value) : null;
      if (SW && L) {
        var area = (Math.sqrt(3) / 2) * SW * SW;
        vol = area * L;
      }
    } else if (s === "cone") {
      // Komolý kužel: V = π/12 × L × (D² + D×d + d²)
      const D = inpD.value !== "" ? safeEvalMath(inpD.value) : null;
      const d = inpd.value !== "" ? safeEvalMath(inpd.value) : null;
      if (D && d && L) vol = Math.PI / 12 * L * (D * D + D * d + d * d);
    } else {
      const W = inpW.value !== "" ? safeEvalMath(inpW.value) : null;
      const H = inpH.value !== "" ? safeEvalMath(inpH.value) : null;
      if (W && H && L) vol = W * H * L;
    }

    if (vol !== null) {
      const volCm3 = vol / 1000;
      const mass = vol * rho / 1e9;
      resultEl.innerHTML = '<strong>' + mass.toFixed(3) + ' kg</strong>  (' + (mass * 1000).toFixed(1) + ' g)  \u2502  ' + volCm3.toFixed(2) + ' cm\u00B3';
    } else {
      resultEl.textContent = "Zadejte rozm\u011Bry\u2026";
    }
  }

  shape.addEventListener("change", updateShape);
  [mat, inpD, inpd, inpW, inpH, inpL].forEach(el => el.addEventListener("input", calc));
  updateShape();

  overlay.querySelector(".cnc-btn-copy").addEventListener("click", () => {
    if (resultEl.textContent && resultEl.textContent !== "Zadejte rozm\u011Bry\u2026") {
      navigator.clipboard.writeText(resultEl.textContent).then(() => showToast("Zkop\u00EDrov\u00E1no"));
    }
  });
}

// ══════════════════════════════════════════════════════════════
// ► Tolerance (ISO 2768 + ISO 286)
// ══════════════════════════════════════════════════════════════