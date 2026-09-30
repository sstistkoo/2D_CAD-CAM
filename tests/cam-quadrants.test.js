// ╔══════════════════════════════════════════════════════════════╗
// ║  CAM – kvadranty (⇅ osa X / ⇄ osa Z) dráhy NEMĚNÍ              ║
// ╚══════════════════════════════════════════════════════════════╝
// Přepínače „Osa X" (X+ nahoru/dolů = obrábění zespodu) a „Osa Z" (Z+
// vpravo/vlevo) pod „Řídicí systém" jsou POHLED a konvence výstupu: celý
// výpočet běží ve světě (X = poloměr, Z = osa), kvadrant řeší až kreslení
// (toScreen + zrcadlení plátku a držáku) a v programu jen prohození G2↔G3
// při lichém počtu překlopení (`flipArc`, zpět ho vrací parser simulace).
//
// Hlídá se tedy, že ve všech čtyřech kvadrantech vyjde TÁŽ úloha: stejné
// průchody, stejné mezní čáry, stejná simulovaná dráha a G-kód, který se liší
// jen G2↔G3. Nález 30. 9. 2026: úhlový rozsah destičky (`getToolClearanceRange`)
// se podle `flipX` zrcadlil, takže s X+ dolů hlídání počítalo s jiným nožem,
// než jaký se kreslí a kontroluje — díl uživatele (13) podélně zleva 107 mm²
// zajetí do hotového dílu a 11 kolizí, s X+ nahoru nula. Žádná fixture osy
// neotáčí, proto to do té doby nic nezachytilo.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { runCamProg } from './helpers/camHeadless.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(__dirname, 'fixtures', 'cam');

// Singleton `S` si Z/X-limity MERGUJE — plná sada klíčů, ať se nic nedědí.
const ZL0 = { chuck: null, tail: null, chuckActive: false, tailActive: false, rangeStart: null, rangeEnd: null, rangeActive: false };
const XL0 = { rangeXMin: null, rangeXMax: null, active: false };
const QUADRANTS = [[false, false], [true, false], [false, true], [true, true]];

async function runQuadrant(file, params, flipX, flipZ) {
  const prog = JSON.parse(readFileSync(join(fixturesDir, file), 'utf8'));
  prog.params = { ...prog.params, ...params };
  prog.flipX = flipX;
  prog.flipZ = flipZ;
  prog.zLimits = { ...ZL0 };
  prog.xLimits = { ...XL0 };
  const { calc, calcSim, gcode } = await runCamProg(prog);
  return { calc, simPath: calcSim.simPath || [], gcode };
}

// Program bez řádků, které kvadrant mění záměrně: datum, hlavička
// „Obrábění zespodu / Otočená osa Z" a číslování bloků (hlavička je o řádek
// delší). S `swap` se G2↔G3 vrátí zpět — i v komentářích („oblouk G3").
function normalizeGcode(gcode, swap) {
  return gcode.split('\n')
    .filter(l => !/Datum:|Obrábění zespodu|Otočená osa Z/.test(l))
    .map(l => l.replace(/^N\d+ /, ''))
    .map(l => (swap ? l.replace(/\bG0?2\b/g, 'G@').replace(/\bG0?3\b/g, 'G2').replace(/G@/g, 'G3') : l))
    .join('\n');
}

const round3 = (v) => Math.round(v * 1000) / 1000;
const passKey = (passes) => JSON.stringify(passes, (k, v) => (typeof v === 'number' ? round3(v) : v));
const guideKey = (guides) => JSON.stringify((guides || []).map(g => [g.kind, g.x1, g.z1, g.x2, g.z2].map(v => (typeof v === 'number' ? round3(v) : v))));
// Popisek `type` nese G2/G3 TAK, JAK JE V TEXTU (v prohozeném programu tedy
// obráceně) — geometrii oblouku parser počítá z kanonického smyslu a všichni
// odběratelé (kreslení, model úběru, validátor, držák) z `type` čtou jen
// „rychloposuv × řez". Srovnává se proto geometrie a tahle dvojice.
const pathKey = (sp) => JSON.stringify(sp.map(p => [round3(p.x), round3(p.z), p.type === 'G0' ? 'G0' : 'cut']));

const CASES = [
  // Polygon natočený −15° (part-19): mezní čáry z tvaru destičky.
  { file: 'part-19-face-tilted-insert.camprog', label: 'polygon podélně zleva', params: { roughingStrategy: 'longitudinal', roughingSide: 'left', toolAngle: 15 } },
  { file: 'part-19-face-tilted-insert.camprog', label: 'polygon čelně zleva', params: { roughingStrategy: 'face', roughingSide: 'left' } },
  // Kulatá R8 (part-18): mez zanoření `getPlungeGuardRange` — měla tutéž vadu.
  { file: 'part-18-face-big-radius.camprog', label: 'kulatá podélně zprava', params: { roughingStrategy: 'longitudinal', roughingSide: 'right' } },
];

describe('kvadranty os (⇅ X / ⇄ Z) nemění výpočet drah', () => {
  for (const { file, label, params } of CASES) {
    it(`${label} (${file}) — 4 kvadranty = táž úloha, G-kód jen G2↔G3`, async () => {
      const runs = [];
      for (const [fx, fz] of QUADRANTS) runs.push({ fx, fz, ...(await runQuadrant(file, params, fx, fz)) });
      const ref = runs[0];
      expect(ref.calc.passes.length).toBeGreaterThan(0);
      for (const r of runs.slice(1)) {
        const tag = `X+${r.fx ? '↓' : '↑'} Z+${r.fz ? '←' : '→'}`;
        expect(guideKey(r.calc.interferenceGuides), `${tag}: mezní čáry`).toBe(guideKey(ref.calc.interferenceGuides));
        expect(passKey(r.calc.passes), `${tag}: průchody`).toBe(passKey(ref.calc.passes));
        // Simulace parsuje SKUTEČNÝ (prohozený) program a G2/G3 vrací zpět —
        // oblouky musí vyjít ve světě stejně, jinak by validátor a model úběru
        // měřily jinou dráhu, než jaká se kreslí.
        expect(pathKey(r.simPath), `${tag}: simulovaná dráha`).toBe(pathKey(ref.simPath));
        const swap = r.fx !== r.fz;
        expect(normalizeGcode(r.gcode, swap), `${tag}: G-kód`).toBe(normalizeGcode(ref.gcode, false));
        if (swap && /\bG0?[23]\b/.test(ref.gcode)) expect(r.gcode, `${tag}: G2/G3 se má prohodit`).not.toBe(ref.gcode);
      }
    }, 240000);
  }
});
