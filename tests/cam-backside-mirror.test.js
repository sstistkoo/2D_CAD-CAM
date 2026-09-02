// ╔══════════════════════════════════════════════════════════════╗
// ║  CAM: hrubování ZLEVA je přesné zrcadlo hrubování ZPRAVA      ║
// ╚══════════════════════════════════════════════════════════════╝
//
// „Podélně zleva" není vlastní algoritmus — celý CAM svět se překlopí v ose Z
// (js/calculators/cam/zMirror.js), spočítá se obyčejné hrubování zprava
// a výsledek se překlopí zpátky. Tenhle test to hlídá ze dvou stran:
//   1. jednotky zrcadlení (involuce, mapování úhlů a smyslu oblouků),
//   2. PARITA celého pipeline — týž díl „zleva" vs. geometricky zrcadlený
//      díl „zprava" musí dát identické průchody i G-kód (až na bezpečnou
//      polohu, která je reálný parametr stroje a nezrcadlí se).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { runCamProg } from './helpers/camHeadless.mjs';
import { maxXAt } from '../js/calculators/cam/passHelpers.js';
import { mirrorPass, mirrorPointChain, mirrorSegPath, mirrorTraceSegs, mirrorZLimits } from '../js/calculators/cam/zMirror.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixture = join(__dirname, 'fixtures', 'cam', 'part-11-zleva-casting.camprog');

describe('zMirror – jednotky', () => {
  it('úsečky: dvojí zrcadlení je identita (pořadí i souřadnice)', () => {
    const segs = [
      { type: 'line', p1: { x: 10, z: 100 }, p2: { x: 10, z: 50 } },
      { type: 'line', p1: { x: 10, z: 50 }, p2: { x: 4, z: 50 } },
    ];
    const back = mirrorSegPath(mirrorSegPath(segs));
    expect(back).toEqual(segs);
  });

  it('oblouky: zrcadlení + otočení pořadí zachová smysl a přemapuje úhly', () => {
    // Oblouk (10,100) → (5,95) se středem (5,100), r=5: úhly π/2 → π.
    const arc = {
      type: 'arc', cx: 5, cz: 100, r: 5, dir: 'G3',
      startAngle: Math.PI / 2, endAngle: Math.PI,
      p1: { x: 10, z: 100 }, p2: { x: 5, z: 95 },
    };
    const [m] = mirrorSegPath([arc]);
    expect(m.cz).toBeCloseTo(-100, 9);
    expect(m.dir).toBe('G3');                       // zrcadlo + otočení = beze změny
    expect(m.startAngle).toBeCloseTo(0, 9);         // π − endAngle
    expect(m.endAngle).toBeCloseTo(Math.PI / 2, 9); // π − startAngle
    // Krajní body sedí na přemapovaných úhlech (střed + sin/cos · r).
    expect(m.cx + Math.sin(m.startAngle) * m.r).toBeCloseTo(m.p1.x, 9);
    expect(m.cz + Math.cos(m.startAngle) * m.r).toBeCloseTo(m.p1.z, 9);
    expect(m.cx + Math.sin(m.endAngle) * m.r).toBeCloseTo(m.p2.x, 9);
    expect(m.cz + Math.cos(m.endAngle) * m.r).toBeCloseTo(m.p2.z, 9);
  });

  it('dráha nástroje (trace) se NEotáčí, ale smysl oblouku ano', () => {
    const trace = [
      { type: 'line', x1: 8, z1: 30, x2: 8, z2: 10 },
      { type: 'arc', cx: 6, cz: 10, r: 2, dir: 'G2', startAngle: Math.PI / 2, endAngle: 0, x1: 8, z1: 10, x2: 6, z2: 12 },
    ];
    const m = mirrorTraceSegs(trace);
    expect(m[0].z1).toBe(-30);                      // pořadí úseků zůstává
    expect(m[1].dir).toBe('G3');
    expect(mirrorTraceSegs(m)).toEqual(trace);      // involuce
  });

  it('průchod: Z, rampa i dojezdy se překlopí a označí backside', () => {
    const pass = {
      type: 'long', x: 20, zStart: 100, zEnd: 40, blocked: true,
      ramp: { x0: 25, z0: 110 }, rampFeedFrom: { x: 25, z: 110 },
      contourLeadOut: [{ type: 'line', x1: 20, z1: 40, x2: 24, z2: 30 }],
    };
    const m = mirrorPass(pass);
    expect(m.backside).toBe(true);
    expect(m.zStart).toBe(-100);
    expect(m.zEnd).toBe(-40);
    expect(m.ramp).toEqual({ x0: 25, z0: -110 });
    expect(m.rampFeedFrom).toEqual({ x: 25, z: -110 });
    expect(m.contourLeadOut[0].z2).toBe(-30);
  });

  it('čelisti ↔ koník si po překlopení vymění role včetně zaškrtnutí', () => {
    const m = mirrorZLimits({
      chuck: -10, tail: 200, chuckActive: true, tailActive: false,
      rangeStart: -15, rangeEnd: 380, rangeActive: true,
    });
    expect(m.chuck).toBe(-200);
    expect(m.tail).toBe(10);
    expect(m.chuckActive).toBe(false);
    expect(m.tailActive).toBe(true);
    expect(m.rangeStart).toBe(-380);
    expect(m.rangeEnd).toBe(15);
  });

  it('prázdné limity nezaktivní falešnou nulou', () => {
    const m = mirrorZLimits({ chuck: null, tail: undefined, rangeStart: null, rangeEnd: null });
    expect(m.tail).toBeNull();
    expect(m.chuck).toBeUndefined();
    expect(m.rangeStart).toBeNull();
  });

  it('řetěz bodů se obrátí, typ i rádius se posunou o jedna', () => {
    // Kontura kreslená zprava doleva: (0,50) → oblouk → (0,0).
    const pts = [
      { id: 1, type: 'G0', x: 5, z: 50, r: 0, mode: 'ABS', xAbs: 5, zAbs: 50, rVal: 0 },
      { id: 2, type: 'G2', x: 9, z: 20, r: 8, mode: 'ABS', xAbs: 9, zAbs: 20, rVal: 8 },
      { id: 3, type: 'G1', x: 9, z: 0, r: 0, mode: 'ABS', xAbs: 9, zAbs: 0, rVal: 0 },
    ];
    const m = mirrorPointChain(pts);
    // Pořadí obrácené (id 3 → 2 → 1), Z překlopené.
    expect(m.map(p => p.id)).toEqual([3, 2, 1]);
    expect(m.map(p => p.zAbs)).toEqual([-0, -20, -50]);
    // Úsek s obloukem (R8) vede teď DO bodu id 1, smysl G2 zůstává
    // (překlopení + obrácení jízdy se vyruší).
    expect(m.map(p => p.type)).toEqual(['G0', 'G1', 'G2']);
    expect(m.map(p => p.rVal)).toEqual([0, 0, 8]);
    // Involuce — dvojí použití vrátí přesně původní řetěz.
    expect(mirrorPointChain(m)).toEqual(pts);
  });

  it('řetěz bodů: mezera G0 zůstane mezerou i po obrácení', () => {
    const pts = [
      { type: 'G0', mode: 'ABS', x: 0, z: 100, r: 0, xAbs: 0, zAbs: 100 },
      { type: 'G1', mode: 'ABS', x: 8, z: 60, r: 0, xAbs: 8, zAbs: 60 },
      { type: 'G0', mode: 'ABS', x: 12, z: 30, r: 0, xAbs: 12, zAbs: 30 },   // skok (nekreslí se)
      { type: 'G1', mode: 'ABS', x: 12, z: 10, r: 0, xAbs: 12, zAbs: 10 },
    ];
    const m = mirrorPointChain(pts);
    expect(m.map(p => p.zAbs)).toEqual([-10, -30, -60, -100]);
    // Mezera byla mezi z=60 a z=30 → po obrácení mezi z=−30 a z=−60.
    expect(m.map(p => p.type)).toEqual(['G0', 'G1', 'G0', 'G1']);
    expect(mirrorPointChain(m)).toEqual(pts);
  });
});

// Geometrické překlopení .camprog (kontura, polotovar, polotovarové meze,
// Z-limity) — referenční „druhá strana" postavená čistě z dat. Řetěz bodů se
// i OBRACÍ, aby kontura zůstala kreslená od pravého čela doleva (na tom stojí
// strana offsetu — viz zMirror.js); typ pohybu a rádius patří k úseku DO bodu,
// takže se posouvají o jedna.
function mirrorProg(prog) {
  const out = JSON.parse(JSON.stringify(prog));
  const mirPts = (pts) => pts.map((_, j) => {
    const src = pts[pts.length - 1 - j];
    const mv = j === 0 ? pts[0] : pts[pts.length - j];
    return { ...src, z: -src.z, mode: 'ABS', type: mv.type, r: mv.r };
  });
  out.contourPoints = mirPts(out.contourPoints);
  out.stockPoints = mirPts(out.stockPoints);
  const { stockFace, stockLength } = out.params;
  out.params.stockFace = stockLength;
  out.params.stockLength = stockFace;
  const zl = out.zLimits;
  const { chuck, tail, rangeStart, rangeEnd } = zl;
  zl.chuck = -tail; zl.tail = -chuck;
  zl.rangeStart = -rangeEnd; zl.rangeEnd = -rangeStart;
  return out;
}

// Otisk průchodu pro porovnání (zaokrouhleno na 3 desetiny mm).
function passFingerprint(p) {
  const n = (v) => v.toFixed(3);
  const trace = (segs) => (segs || []).map(s =>
    `${s.type === 'arc' ? s.dir : 'L'}(${n(s.x1)},${n(s.z1)})->(${n(s.x2)},${n(s.z2)})`).join(' ');
  if (p.type === 'face') return `face z=${n(p.z)} ${n(p.xStart)}->${n(p.xEnd)}`;
  return [
    `X=${n(p.x)} ${n(p.zStart)}->${n(p.zEnd)}`,
    p.ramp ? `ramp(${n(p.ramp.x0)},${n(p.ramp.z0)})` : '',
    p.rampFeedFrom ? `rff(${n(p.rampFeedFrom.x)},${n(p.rampFeedFrom.z)})` : '',
    p.contourLeadIn ? `IN[${trace(p.contourLeadIn)}]` : '',
    p.contourLeadOut ? `OUT[${trace(p.contourLeadOut)}]` : '',
    ['pocketClean', 'pocketReposition', 'blocked', 'noRetract'].filter(k => p[k]).join(','),
  ].filter(Boolean).join(' ');
}

// VÝŠKA ZDVIHU RYCHLOPOSUVU se srovnává na 0,1 mm — a jen ona.
//
// „Výjezd nad konturu" se počítá z `travelTopXAtZ`, tedy z navzorkované
// smyčky ZBYTKU a offsetu odlitku. Ty vznikají z Clipperu a NEJSOU vertex
// po vertexu zrcadlově symetrické: změřeno 1. 9. 2026 na tomhle dílu
// `top` = 64,610968 zleva proti 64,603390 zprava, tedy **7,6 µm**. Samo
// o sobě to nevadí, jenže `quantizeUp(top + odstup)` je zaokrouhlení
// NAHORU po 0,01 — a taková dvojice může spadnout na opačné strany hranice
// (66,42 × 66,41). Jestli k tomu dojde, závisí jen na tom, kde přesně se
// smyčka vzorkuje; do 1. 9. 2026 to vycházelo náhodou stejně, pak svislý
// odskok u stěny (`retractHitsContour`) posunul výchozí Z zdvihu jinam.
//
// ŘEZNÁ GEOMETRIE SE NESROVNÁVÁ: G1/G2/G3 i všechna Z se dál porovnávají
// PŘESNĚ (na tomhle dílu sedí 190 z 191 řádků bajt po bajtu). Tolerance
// platí výhradně pro X na `G0` — což je bezpečnostní výška, ne tvar dílu.
const relaxRapidX = (s) => s.replace(/^(G0\b.*?)X(-?\d+(?:\.\d+)?)/,
  (_m, head, v) => `${head}X${(Math.round(parseFloat(v) * 10) / 10).toFixed(1)}`);

// Řezné řádky G-kódu. `mirror` překlopí Z a prohodí G2/G3 (převod „zleva"
// do zrcadleného světa). Nájezdy do bezpečné polohy (X150 / Z5 / G75) se
// vynechají — safeX/safeZ jsou parametry stroje, ne geometrie dílu, takže se
// zrcadlit nesmí a ve zrcadle by nutně vyšly opačně.
function cutLines(gcode, mirror) {
  return gcode.split('\n')
    .filter(l => /^N\d+ /.test(l))
    .map(l => l.replace(/^N\d+ /, '').replace(/\s*;.*$/, ''))
    .filter(l => !/X150|^G75|^G0 Z-?5(\.0+)?$/.test(l))
    .map(l => {
      let s = l.replace(/\bZ(-?\d+(?:\.\d+)?)/g, (_m, v) => `Z${((mirror ? -1 : 1) * parseFloat(v)).toFixed(3)}`);
      if (mirror) s = s.replace(/^G0?2\b/, 'G§').replace(/^G0?3\b/, 'G2').replace(/^G§/, 'G3');
      return relaxRapidX(s);
    });
}

describe('CAM parita: podélně zleva == zrcadlo podélně zprava', () => {
  it('stejné průchody i G-kód na reálném dílu (odlitek, kapsy, rampy)', async () => {
    const prog = JSON.parse(readFileSync(fixture, 'utf8'));

    const left = JSON.parse(JSON.stringify(prog));
    left.params.roughingSide = 'left';
    const right = mirrorProg(prog);
    right.params.roughingSide = 'right';

    const L = await runCamProg(left);
    const R = await runCamProg(right);

    // Průchody: zleva musí být samé backside a po překlopení shodné s pravou.
    expect(L.calc.passes.length).toBeGreaterThan(5);
    expect(L.calc.passes.every(p => p.backside)).toBe(true);
    expect(L.calc.passes.map(p => passFingerprint(mirrorPass(p))))
      .toEqual(R.calc.passes.map(passFingerprint));

    // G-kód: řezné bloky se musí shodovat blok po bloku.
    expect(cutLines(L.gcode, true)).toEqual(cutLines(R.gcode, false));
  });

  it('parita platí i s dokončovací operací (trasování kontury zleva)', async () => {
    const prog = JSON.parse(readFileSync(fixture, 'utf8'));
    prog.params.doFinishing = true;
    // Bez hlídání destičky: kosočtvercový plátek 90°/15° na tenhle profil
    // nedosáhne prakticky nikam a dokončovací dráha by vyšla prázdná
    // (na obou stranách stejně) — test by pak neověřoval nic.
    prog.params.respectInsertGeometry = false;

    const left = JSON.parse(JSON.stringify(prog));
    left.params.roughingSide = 'left';
    const right = mirrorProg(prog);
    right.params.roughingSide = 'right';

    const L = await runCamProg(left);
    const R = await runCamProg(right);
    expect(L.gcode).toContain('DOKONCOVANI');
    expect(cutLines(L.gcode, true)).toEqual(cutLines(R.gcode, false));
  });

  // Regrese: offset ÚSEČKY se počítá z levé normály směru jízdy, takže leží
  // vně jen u kontury kreslené od pravého čela doleva. Když se při zrcadlení
  // neobrátí pořadí bodů, spadnou offsety úseček DOVNITŘ dílu (a jen oblouky,
  // které si stranu detekují z geometrie, zůstanou venku) — dráhy pak zajíždějí
  // do hotové kontury. Reálný nález na díle uživatele.
  it('hrubovací offset leží VNĚ kontury na obou stranách', async () => {
    const prog = JSON.parse(readFileSync(fixture, 'utf8'));
    const want = prog.params.toolRadius
      + Math.max(prog.params.allowanceX, prog.params.allowanceZ) + prog.params.finishAllowance;
    for (const side of ['left', 'right']) {
      const p = JSON.parse(JSON.stringify(prog));
      p.params.roughingSide = side;
      const { calc } = await runCamProg(p);
      const off = calc.offsetPath.filter(s => !s.isDegenerate);
      const cont = (calc.machinableContour || calc.contourSegments).filter(s => !s.isDegenerate);
      let zLo = Infinity, zHi = -Infinity;
      for (const q of calc.worldPoints) { zLo = Math.min(zLo, q.zReal); zHi = Math.max(zHi, q.zReal); }
      const inside = [];
      for (let z = Math.ceil(zLo) + 1; z <= zHi - 1; z += 1) {
        const c = maxXAt(cont, z), o = maxXAt(off, z);
        if (c === null || o === null) continue;
        if (o < c + want - 0.35) inside.push(`z=${z.toFixed(0)} kontura=${c.toFixed(2)} offset=${o.toFixed(2)}`);
      }
      expect(inside, `${side}: offset zajíždí do kontury na ${inside.length} místech\n  ${inside.slice(0, 6).join('\n  ')}`).toEqual([]);
    }
  });

  it('zleva se opravdu řeže ve směru +Z a odskakuje zpět', async () => {
    const prog = JSON.parse(readFileSync(fixture, 'utf8'));
    prog.params.roughingSide = 'left';
    const { calc } = await runCamProg(prog);
    const bodies = calc.passes.filter(p => Math.abs(p.zStart - p.zEnd) > 0.05);
    expect(bodies.length).toBeGreaterThan(5);
    expect(bodies.every(p => p.zEnd > p.zStart)).toBe(true);
    // Rampa zanoření kotví PŘED začátkem řezu, tedy na nižším Z.
    for (const p of calc.passes) {
      if (p.ramp) expect(p.ramp.z0).toBeLessThan(p.zStart + 1e-6);
    }
  });
});
