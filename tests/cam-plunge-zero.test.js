// ╔══════════════════════════════════════════════════════════════╗
// ║  CAM – Úhel zanoření 0° = bez zanořování                        ║
// ╚══════════════════════════════════════════════════════════════╝
//
// Uživatel 28. 9. 2026: „zanořování, kde by se zadalo 0 stupňů, teda
// nezanořovalo by se to vůbec — nějak mi to nešlo nastavit". Nula se dřív
// přepsala na 30° (`parseFloat(…) || 30`). Teď 0° = hrubování se do
// materiálu nezanořuje vůbec (docs/cam-pravidla.md, pravidlo 6): žádný
// řezný posuv hrubování k ose, žádná rampa.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { runCamProg } from './helpers/camHeadless.mjs';
import { MaterialRemoval } from '../js/calculators/cam/materialRemoval.js';
import { getEffectivePlungeAngle, plungeDisabled } from '../js/calculators/cam/camMath.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const load = (rel) => JSON.parse(readFileSync(join(__dirname, 'fixtures', rel), 'utf8'));
const zero = (prog) => {
  const set = (q) => { if (q) { q.entryAngleAuto = false; q.entryAngle = 0; } };
  set(prog.params);
  (prog.opParts || []).forEach(o => set(o.params));
  return prog;
};

// Řezné posuvy HRUBOVÁNÍ k ose (jako P6 v scripts/cam_rules_check.mjs).
async function roughingMovesTowardAxis(prog) {
  const r = await runCamProg(prog);
  const lines = r.gcode.split('\n');
  const finishFrom = lines.findIndex(l => /^;\s*---\s*DOKON/.test(l));
  const sp = r.calcSim.simPath;
  const rm = new MaterialRemoval(r.params, r.calcSim.stockPathSegments, {});
  const lift = r.params.toolShape === 'round' ? (parseFloat(r.params.toolRadius) || 0) : 0;
  const topAt = (loops, z) => {
    let top = null;
    for (const l of loops) {
      for (let k = 0; k < l.length; k++) {
        const u = l[k], v = l[(k + 1) % l.length];
        if ((u.z <= z && v.z > z) || (v.z <= z && u.z > z)) {
          const x = u.x + (v.x - u.x) * ((z - u.z) / (v.z - u.z));
          if (top === null || x > top) top = x;
        }
      }
    }
    return top;
  };
  const bad = [];
  let worstChip = 0;
  for (let i = 1; i < sp.length; i++) {
    const a = sp[i - 1], b = sp[i];
    const before = Math.abs(rm.model.area());
    const loopsBefore = rm.model.loops;
    rm.advanceTo(sp, i);
    if (b.type === 'G0') continue;
    if (finishFrom >= 0 && b.originalLineIdx > finishFrom) continue;
    const cut = before - Math.abs(rm.model.area());
    if (b.x - a.x < -0.2 && cut > 0.1) bad.push((lines[b.originalLineIdx] || '').trim());
    if (cut > 0.05) {
      const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 0.5));
      for (let k = 0; k <= n; k++) {
        const t = k / n, x = a.x + (b.x - a.x) * t, z = a.z + (b.z - a.z) * t;
        const top = topAt(loopsBefore, z);
        if (top !== null) worstChip = Math.max(worstChip, top - (x - lift));
      }
    }
  }
  return { r, bad, worstChip };
}

describe('CAM: Úhel zanoření 0° = bez zanořování', () => {
  it('ručně zadaná nula se nepřepíše na 30° a znamená „bez zanořování"', () => {
    const p = { toolShape: 'round', entryAngleAuto: false, entryAngle: 0, roughingStrategy: 'longitudinal' };
    expect(plungeDisabled(p)).toBe(true);
    expect(getEffectivePlungeAngle(p)).toBe(45);   // geometrie dostane auto úhel plátku, ne 30
    expect(plungeDisabled({ ...p, entryAngle: 45 })).toBe(false);
    expect(plungeDisabled({ ...p, entryAngleAuto: true })).toBe(false);
    expect(plungeDisabled({ ...p, toolShape: 'parting' })).toBe(false);   // upichovák: vždy kolmo
  });

  it('kulatá R 10 (díl uživatele, zleva úsek 2): žádná rampa ani posuv k ose v materiálu', async () => {
    const { r, bad } = await roughingMovesTowardAxis(zero(load('cam-cases/round-r10-zleva-section2.camprog')));
    expect(r.calc.passes.filter(p => p.type === 'long' && p.ramp && p.ramp.x0 > p.x + 0.01)).toEqual([]);
    expect(bad, bad.join('\n')).toEqual([]);
    expect(r.errors.some(e => typeof e !== 'string' && /Zanořování vypnuté \(úhel 0°\)/.test(e.msg))).toBe(true);
  });

  it('polygon (part-1): žádný posuv k ose v materiálu, hlubší vrstva nebere dvojitou třísku', async () => {
    const { r, bad, worstChip } = await roughingMovesTowardAxis(zero(load('cam/part-1.camprog')));
    expect(bad, bad.join('\n')).toEqual([]);
    // Bez ořezu jel průchod X 40,978 přes místo vynechané vrstvy X 43,978
    // (6 mm) a dojezd po dně za ní 11 mm. Tolerance 1 mm: první vrstva přes
    // kůru odlitku bere 3,2 mm i s výchozím úhlem.
    expect(worstChip).toBeLessThan(parseFloat(r.params.depthOfCut) + 1);
  });
});
