// ╔══════════════════════════════════════════════════════════════╗
// ║  Maker.js plugin: models.InvoluteGear                       ║
// ║  Profesionální generátor čelního ozubeného kola s evolventou ║
// ╚══════════════════════════════════════════════════════════════╝
//
// Modul má dvě role:
//   1) Exportuje třídu `InvoluteGear`, která vytvoří Maker.js-kompatibilní
//      model (`{ paths, orderedPaths }`) – složený z primitiv typu
//      'line' a 'arc'. Tvary odpovídají Maker.js `paths.Line` / `paths.Arc`
//      (stejné vlastnosti origin/end/radius/startAngle/endAngle).
//   2) Po načtení v prohlížeči se sám zaregistruje jako
//      `window.makerjs.models.InvoluteGear`, takže DXF/SVG export přes
//      Maker.js zná nativní model.

const DEG = 180 / Math.PI;

function invFn(a) { return Math.tan(a) - a; }

function involuteRotAt(rb, r) {
  if (r <= rb) return 0;
  const phi = Math.acos(rb / r);
  return Math.tan(phi) - phi;
}

/**
 * Konstruktor pro InvoluteGear (signatura odpovídá konvenci Maker.js).
 *
 * @param {number} teeth         počet zubů z (≥ 4)
 * @param {number} circularPitch rozteč = π · m (modul m = cp / π)
 * @param {number} pressureAngle úhel záběru ve stupních (def. 20°)
 * @param {number} clearance     radiální vůle (def. 0)
 * @param {number} backlash      boční vůle při tloušťce (def. 0)
 * @param {number} profileShift  koeficient korekce x (def. 0)
 * @param {number} accuracy      počet úseček na bok evolventy (def. 16)
 */
export function InvoluteGear(teeth, circularPitch, pressureAngle, clearance, backlash, profileShift, accuracy) {
  teeth = Math.max(4, teeth | 0);
  circularPitch = circularPitch || Math.PI;
  pressureAngle = (typeof pressureAngle === 'number') ? pressureAngle : 20;
  clearance = clearance || 0;
  backlash = backlash || 0;
  profileShift = profileShift || 0;
  accuracy = Math.max(4, (accuracy | 0) || 16);

  const m = circularPitch / Math.PI;
  const alpha = pressureAngle * Math.PI / 180;
  const Rp = (m * teeth) / 2;
  const Rb = Rp * Math.cos(alpha);
  const ha = m * (1 + profileShift);
  const hf = m * (1.25 - profileShift) + clearance;
  const Ra = Rp + ha;
  const Rf = Math.max(Rp - hf, 0.1 * m);

  const s = circularPitch / 2 + 2 * profileShift * m * Math.tan(alpha) - backlash;
  const halfPitchAngle = s / (2 * Rp);
  const invAlpha = invFn(alpha);
  const angularPitch = 2 * Math.PI / teeth;
  const Rinv0 = Math.max(Rb, Rf);

  const paths = {};
  const orderedPaths = [];
  let pid = 0;

  function addLine(p1, p2) {
    const id = 's' + (pid++);
    paths[id] = { type: 'line', origin: [p1[0], p1[1]], end: [p2[0], p2[1]] };
    orderedPaths.push(id);
  }
  function addArc(cx, cy, r, sRad, eRad) {
    const id = 'a' + (pid++);
    let sA = sRad * DEG;
    let eA = eRad * DEG;
    while (eA <= sA) eA += 360;
    paths[id] = { type: 'arc', origin: [cx, cy], radius: r, startAngle: sA, endAngle: eA };
    orderedPaths.push(id);
  }

  for (let i = 0; i < teeth; i++) {
    const tc = i * angularPitch;
    const rightBase = tc - halfPitchAngle - invAlpha;
    const leftBase  = tc + halfPitchAngle + invAlpha;

    const rightPts = [];
    for (let j = 0; j <= accuracy; j++) {
      const r = Rinv0 + (Ra - Rinv0) * (j / accuracy);
      const a = rightBase + involuteRotAt(Rb, r);
      rightPts.push([r * Math.cos(a), r * Math.sin(a)]);
    }
    const leftPts = [];
    for (let j = accuracy; j >= 0; j--) {
      const r = Rinv0 + (Ra - Rinv0) * (j / accuracy);
      const a = leftBase - involuteRotAt(Rb, r);
      leftPts.push([r * Math.cos(a), r * Math.sin(a)]);
    }

    if (Rf < Rb) {
      const pR = [Rf * Math.cos(rightBase), Rf * Math.sin(rightBase)];
      addLine(pR, rightPts[0]);
    }
    for (let j = 0; j < accuracy; j++) addLine(rightPts[j], rightPts[j + 1]);

    const tipRot = involuteRotAt(Rb, Ra);
    addArc(0, 0, Ra, rightBase + tipRot, leftBase - tipRot);

    for (let j = 0; j < accuracy; j++) addLine(leftPts[j], leftPts[j + 1]);

    if (Rf < Rb) {
      const pL = [Rf * Math.cos(leftBase), Rf * Math.sin(leftBase)];
      addLine(leftPts[accuracy], pL);
    }

    const nextTc = ((i + 1) % teeth) * angularPitch;
    const nextRightBase = nextTc - halfPitchAngle - invAlpha;
    let rootStart, rootEnd;
    if (Rf < Rb) {
      rootStart = leftBase;
      rootEnd = (i === teeth - 1) ? nextRightBase + 2 * Math.PI : nextRightBase;
    } else {
      const offset = involuteRotAt(Rb, Rf);
      rootStart = leftBase - offset;
      rootEnd = (i === teeth - 1) ? nextRightBase + offset + 2 * Math.PI : nextRightBase + offset;
    }
    addArc(0, 0, Rf, rootStart, rootEnd);
  }

  this.paths = paths;
  this.orderedPaths = orderedPaths;
  this.gear = { teeth, m, Rp, Rb, Ra, Rf, alpha };
}

// Side-effect: zaregistruj se do globálního Maker.js, je-li dostupný
// (browser PWA). Bundlovaná verze (browserify) ho schovává za
// `window.require('makerjs')`, zatímco minifikovaná může nastavit
// `window.makerjs` přímo. V Node test prostředí se vše přeskočí.
if (typeof window !== 'undefined') {
  let mk = window.makerjs;
  if (!mk && typeof window.require === 'function') {
    try { mk = window.require('makerjs'); } catch (e) { /* nepřítomné */ }
  }
  if (mk) {
    window.makerjs = mk;
    mk.models = mk.models || {};
    if (!mk.models.InvoluteGear) mk.models.InvoluteGear = InvoluteGear;
  }
}
