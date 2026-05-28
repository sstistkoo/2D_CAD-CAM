import { showToast } from '../state.js';
import { safeEvalMath } from '../utils.js';
import { makeOverlay } from '../dialogFactory.js';

const cuttingMaterials = [
  ["Ocel 11 523 (S355)",      180, 35, 0.3, 0.1, 1800],
  ["Ocel 12 050 (C45)",       160, 30, 0.25, 0.08, 2000],
  ["Ocel 14 220 (16MnCr5)",   140, 25, 0.2, 0.08, 2100],
  ["Ocel 15 142 (42CrMo4)",   120, 20, 0.2, 0.06, 2200],
  ["Nerez 17 240 (X5CrNi)",   100, 15, 0.15, 0.06, 2400],
  ["Nerez 17 346 (X2CrNiMo)", 90,  12, 0.12, 0.05, 2500],
  ["Litina 42 2420 (GG25)",   200, 40, 0.3, 0.1, 1100],
  ["Hliník (AlCu4Mg)",        400, 80, 0.4, 0.15, 700],
  ["Hliník (slitiny Si)",     300, 60, 0.3, 0.12, 800],
  ["Mosaz (CuZn39Pb3)",       250, 50, 0.3, 0.1, 780],
  ["Měď (Cu-ETP)",            200, 40, 0.2, 0.08, 900],
  ["Bronz (CuSn8)",           120, 25, 0.2, 0.08, 1000],
  ["POM (ertacetal)",          300, 80, 0.3, 0.1, 250],
  ["PA6 (nylon)",              250, 60, 0.3, 0.1, 200],
];

export function openCuttingCalc() {
  var matOptions = '';
  for (var i = 0; i < cuttingMaterials.length; i++) {
    var m = cuttingMaterials[i];
    matOptions += '<option value="' + i + '">' + m[0] + '</option>';
  }

  const body =
    '<div class="cnc-fields">' +
      '<label class="cnc-field cnc-field-full"><span>Materiál <small>(předvolba)</small></span>' +
        '<select data-id="cMat"><option value="">-- Ruční zadání --</option>' + matOptions + '</select></label>' +
    '</div>' +
    '<div class="cnc-mat-hint" id="cMatHint"></div>' +
    '<div class="cnc-fields">' +
      '<label class="cnc-field"><span>D <small>mm</small></span><input type="number" data-id="D" step="any" placeholder="Průměr"></label>' +
      '<label class="cnc-field"><span>Vc <small>m/min</small></span><input type="number" data-id="Vc" step="any" placeholder="Řezná rychlost"></label>' +
      '<label class="cnc-field"><span>n <small>min\u207B\u00B9</small></span><input type="number" data-id="n" step="any" placeholder="Otáčky"></label>' +
      '<label class="cnc-field"><span>f <small>mm/ot</small></span><input type="number" data-id="f" step="any" placeholder="Posuv"></label>' +
      '<label class="cnc-field"><span>Vf <small>mm/min</small></span><input type="number" data-id="Vf" step="any" placeholder="Posuvová rychlost"></label>' +
      '<label class="cnc-field"><span>ap <small>mm</small></span><input type="number" data-id="ap" step="any" placeholder="Hloubka řezu"></label>' +
      '<label class="cnc-field"><span>L <small>mm</small></span><input type="number" data-id="cL" step="any" placeholder="Délka řezu"></label>' +
    '</div>' +
    '<div class="cnc-info" id="cuttingInfo"></div>' +
    '<div class="cnc-result" id="cuttingExtra"></div>' +
    '<div class="cnc-actions">' +
      '<button class="cnc-btn cnc-btn-clear">\uD83D\uDDD1 Vymazat</button>' +
      '<button class="cnc-btn cnc-btn-copy">\uD83D\uDCCB Kopírovat</button>' +
    '</div>';

  const overlay = makeOverlay("cutting", "\u2699\uFE0F Řezné podmínky", body);
  if (!overlay) return;

  const fieldIds = ["D","Vc","n","f","Vf","ap","cL"];
  const inputs = {};
  fieldIds.forEach(id => { inputs[id] = overlay.querySelector('[data-id="' + id + '"]'); });
  const matSel = overlay.querySelector('[data-id="cMat"]');
  const matHint = overlay.querySelector("#cMatHint");
  const edited = new Set();
  const infoEl = overlay.querySelector("#cuttingInfo");
  const extraEl = overlay.querySelector("#cuttingExtra");

  function val(inp) { return inp.value !== "" ? safeEvalMath(inp.value) : null; }
  function setC(inp, v) { inp.value = parseFloat(v.toFixed(4)); inp.classList.add("computed"); }

  // Materiálová předvolba
  matSel.addEventListener("change", () => {
    const idx = matSel.value;
    if (idx === "") {
      matHint.innerHTML = "";
      return;
    }
    const m = cuttingMaterials[parseInt(idx)];
    matHint.innerHTML =
      '<span>Vc SK: <strong>' + m[1] + '</strong> m/min</span>' +
      '<span>Vc HSS: <strong>' + m[2] + '</strong> m/min</span>' +
      '<span>f hrub: <strong>' + m[3] + '</strong></span>' +
      '<span>f dok: <strong>' + m[4] + '</strong></span>' +
      '<span>kc: <strong>' + m[5] + '</strong> MPa</span>';
  });

  function solve() {
    fieldIds.forEach(id => { if (!edited.has(id)) { inputs[id].classList.remove("computed"); } });
    const D = val(inputs.D), Vc = val(inputs.Vc), n = val(inputs.n), f = val(inputs.f), Vf = val(inputs.Vf);

    if (D && Vc && !edited.has("n")) setC(inputs.n, (1000 * Vc) / (Math.PI * D));
    const n2 = val(inputs.n);
    if (D && n2 && !edited.has("Vc")) setC(inputs.Vc, (Math.PI * D * n2) / 1000);
    const n3 = val(inputs.n);
    if (f && n3 && !edited.has("Vf")) setC(inputs.Vf, f * n3);
    if (Vf && n3 && !edited.has("f")) setC(inputs.f, Vf / n3);
    const Vf2 = val(inputs.Vf);
    if (Vf2 && n3 && !edited.has("f") && !f) setC(inputs.f, Vf2 / n3);

    const parts = [];
    ["D","Vc","n","f","Vf"].forEach(id => { const v = val(inputs[id]); if (v !== null) parts.push(id + "=" + inputs[id].value); });
    infoEl.textContent = parts.length ? parts.join("  \u2502  ") : "";

    // Extra výpočty: strojní čas, řezný výkon
    const extraParts = [];
    const ap = val(inputs.ap);
    const cL = val(inputs.cL);
    const fFinal = val(inputs.f);
    const nFinal = val(inputs.n);
    const VcFinal = val(inputs.Vc);
    const VfFinal = val(inputs.Vf) || (fFinal && nFinal ? fFinal * nFinal : null);

    // Strojní čas
    if (cL && VfFinal && VfFinal > 0) {
      const ts = cL / VfFinal;
      extraParts.push("Strojní čas: <strong>" + ts.toFixed(2) + " min</strong> (" + (ts * 60).toFixed(0) + " s)");
    }

    // Řezný výkon Pc = (kc × ap × f × Vc) / (60 × 10³)
    const matIdx = matSel.value;
    if (matIdx !== "" && ap && fFinal && VcFinal) {
      const kc = cuttingMaterials[parseInt(matIdx)][5];
      const Pc = (kc * ap * fFinal * VcFinal) / (60 * 1000);
      extraParts.push("Řezný výkon: <strong>" + Pc.toFixed(2) + " kW</strong> (kc=" + kc + " MPa)");
    }

    if (ap) extraParts.push("Hloubka řezu: " + ap + " mm");

    extraEl.innerHTML = extraParts.length ? extraParts.join("<br>") : "";
  }

  fieldIds.forEach(id => {
    inputs[id].addEventListener("input", () => {
      if (inputs[id].value !== "") { edited.add(id); inputs[id].classList.remove("computed"); }
      else { edited.delete(id); }
      // Vymazat jen provázané parametry (D,Vc,n,f,Vf), ne ap a L
      ["D","Vc","n","f","Vf"].forEach(k => { if (!edited.has(k)) inputs[k].value = ""; });
      solve();
    });
  });

  overlay.querySelector(".cnc-btn-clear").addEventListener("click", () => {
    fieldIds.forEach(id => { inputs[id].value = ""; inputs[id].classList.remove("computed"); });
    edited.clear(); infoEl.textContent = ""; extraEl.innerHTML = "";
    matSel.value = ""; matHint.innerHTML = "";
  });
  overlay.querySelector(".cnc-btn-copy").addEventListener("click", () => {
    const parts = [];
    fieldIds.forEach(id => { const v = val(inputs[id]); if (v !== null) parts.push(id + "=" + inputs[id].value); });
    if (extraEl.textContent) parts.push(extraEl.textContent);
    if (parts.length) navigator.clipboard.writeText(parts.join("  ")).then(() => showToast("Zkopírováno"));
  });
}

// ══════════════════════════════════════════════════════════════
// ► Kužel
// ══════════════════════════════════════════════════════════════