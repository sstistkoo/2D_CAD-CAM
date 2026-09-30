// Tříska ramp změřená na modelu úběru — pravidlo 3/6 (docs/cam-pravidla.md):
// „Rampa ani vjezd nesmí vzít víc než jednu vrstvu naráz."
//
// Geometrický rozdíl `ramp.x0 − x` to nezměří: první krok dorampování strmé
// stěny (`rampCompletion`, roughLong.js) začíná záměrně až na povrchu
// polotovaru, nejvýš o jedno ap nad kotvou (nález uživatele 7. 9. 2026 —
// jinak kolmý zápich do odlitku). Horní kus takové rampy jede místem, které
// už vybrala vrstva nad ní, takže geometricky přesáhne ap, ale nic navíc
// neubere. Rozhoduje materiál nad břitem, ne délka rampy.
//
// Měří se stejně jako P3 v scripts/cam_rules_check.mjs: v každém bodě pohybu
// (po 0,5 mm) materiál nad břitem PŘED tím pohybem.
import { MaterialRemoval, toolFootprint } from '../../js/calculators/cam/materialRemoval.js';
import { topXOnLoop } from '../../js/calculators/cam/camMath.js';

const SAMPLE = 0.5;

/**
 * @param {object} r výsledek `runCamProg`
 * @returns {Array<{line:string, chip:number}>} každý pohyb označený „Rampa"
 */
export function rampChips(r) {
  const P = r.params;
  const lift = Math.max(0, -Math.min(...toolFootprint(P).map(q => q.x)));
  const sp = r.calcSim.simPath;
  const lines = r.gcode.split('\n');
  const rm = new MaterialRemoval(P, r.calcSim.stockPathSegments, {});
  const topAt = (loops, z) => {
    let top = null;
    for (const l of loops) { const t = topXOnLoop(l, z); if (t !== null && (top === null || t > top)) top = t; }
    return top;
  };
  const out = [];
  for (let i = 1; i < sp.length; i++) {
    const a = sp[i - 1], b = sp[i];
    const line = (lines[b.originalLineIdx] || '').trim();
    if (b.type !== 'G0' && /Rampa/.test(line)) {
      const loops = rm.model.loops;
      const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / SAMPLE));
      let chip = 0;
      for (let k = 0; k <= n; k++) {
        const t = k / n, x = a.x + (b.x - a.x) * t, z = a.z + (b.z - a.z) * t;
        const top = topAt(loops, z);
        if (top !== null && top - (x - lift) > chip) chip = top - (x - lift);
      }
      out.push({ line, chip });
    }
    rm.advanceTo(sp, i);
  }
  return out;
}
