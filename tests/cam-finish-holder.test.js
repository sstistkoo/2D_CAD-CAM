// ╔══════════════════════════════════════════════════════════════╗
// ║  CAM: dokončování vs. držák — vzniká vůbec, a nekoliduje?     ║
// ╚══════════════════════════════════════════════════════════════╝
//
// Dvě pojistky kolem hlídání držáku při dokončovacích operacích. Obě mají
// za sebou reálný defekt, každou z opačné strany:
//
// 1. VZNIKNE. Obálka držáku se u dokončování počítala ze siluety
//    HRUBOVACÍHO offsetu (kontura + R + přídavek) — jenže to je dráha
//    STŘEDU špičky při hrubování, ne materiál. Dokončovací dráha leží
//    z definice UVNITŘ té siluety (o celý přídavek) a protože obrys držáku
//    obsahuje počátek (špičku), vyšel KAŽDÝ dokončovací úsek jako kolize.
//    Zaškrtnuté „Dokončovací operace" pak z programu zmizelo beze stopy
//    (part-14: 18 z 18 úseků zahozeno; part-2/4/6/8/9 po 13).
//
// 2. NEKOLIDUJE. Opačný extrém: pustit dokončování i tam, kde po hrubování
//    zůstal stát NEVYHRUBOVANÝ zbytek polotovaru (klín za bossem, kam se
//    destička nedostane) — držák do něj najede. Invariant se měří
//    nezávislým validátorem drah (týž, který v appce plní ⛔ panel) nad
//    reálným úběrem materiálu: v dokončovacím bloku nesmí být ANI JEDEN
//    nález (držák v materiálu ani rychloposuv materiálem).
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { runCamProg } from './helpers/camHeadless.mjs';
import { validateToolpath } from '../js/calculators/cam/collisionValidator.js';
import { roughingKey } from '../js/calculators/cam/calculatePipeline.js';
import { StockModel, toolSweep, polyArea } from '../js/geom/geomCore.js';
import { buildStockLoop, toolFootprint } from '../js/calculators/cam/materialRemoval.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(__dirname, 'fixtures', 'cam');
const fixtures = readdirSync(fixturesDir).filter(f => f.endsWith('.camprog')).sort();

const load = (name) => JSON.parse(readFileSync(join(fixturesDir, name), 'utf8'));
const FIN_MARK = 'DOKONCOVANI';

describe('CAM: dokončování a obálka držáku', () => {
  it('part-14-finish-holder: zaškrtnuté dokončování se do programu opravdu dostane', async () => {
    const prog = load('part-14-finish-holder.camprog');
    expect(prog.params.doFinishing, 'fixture musí mít zapnuté dokončování').toBe(true);
    expect(prog.params.respectInsertGeometry, 'fixture musí hlídat geometrii').toBe(true);
    const { calc, gcode } = await runCamProg(prog);
    expect(calc.finishOffsetPath.filter(s => !s.isDegenerate).length).toBeGreaterThan(0);
    expect(gcode).toContain(FIN_MARK);
  });

  for (const name of fixtures) {
    const prog = load(name);
    if (!prog.params || !(prog.params.doFinishing || prog.params.finishOnly)) continue;
    it(`${name} → dokončovací blok je bez kolizí držáku`, async () => {
      const { calcSim, gcode, S } = await runCamProg(prog);
      const lines = gcode.split('\n');
      const finStart = lines.findIndex(l => l.includes(FIN_MARK));
      if (finStart < 0) return;   // dokončování nevzniklo (vše nedosažitelné) — nic k ověření
      // Vysoké limity: hrubovací nálezy nesmí kvótu vyčerpat dřív, než se
      // validátor vůbec dostane k dokončování na konci programu.
      const issues = validateToolpath(calcSim.simPath, S.params, calcSim.stockPathSegments, {
        backside: roughingKey(S) === 'backside', maxIssues: 400, maxBlocks: 20000,
      });
      const inFinish = issues.filter(i => i.lineIdx >= finStart)
        .map(i => `${i.kind} X${i.x.toFixed(1)} Z${i.z.toFixed(1)} ~${i.area.toFixed(1)}mm² @ ${(lines[i.lineIdx] || '').trim()}`);
      expect(inFinish).toEqual([]);
    });
  }
});

// ── Nájezd na řetěz: rampou ze směru řezu, ne svislým dosednutím ────────
// Svislý sjezd v X (G0 na hloubku+vůle, pak G1 jen v X) končí bodovým
// dotykem na hotové ploše a v reálu tam nechá rysku — nález uživatele na
// dílu part-14. Nájezd proto jde šikmo ze strany, ODKUD se řeže. Kde
// koridor rampy volný není, zůstává svislý dojezd (bezpečnost > povrch),
// takže se invariant měří na dílu, kde jsou všechny koridory čisté.
describe('CAM: nájezd a výjezd dokončování', () => {
  const finBlock = (gcode) => {
    const lines = gcode.split('\n').map(l => l.trim());
    const i = lines.findIndex(l => l.includes(FIN_MARK));
    if (i < 0) return [];
    const e = lines.findIndex((l, k) => k > i && /M30|KONTURA/.test(l));
    return lines.slice(i + 1, e < 0 ? lines.length : e);
  };

  it('part-14: žádný řetěz nedosedá svisle na plochu (G1 jen v X po rychloposuvu)', async () => {
    const { gcode } = await runCamProg(load('part-14-finish-holder.camprog'));
    const blk = finBlock(gcode);
    expect(blk.length).toBeGreaterThan(0);
    const plunges = blk.filter((l, i) => /^N\d+ G1 X-?[\d.]+( F|$)/.test(l)
      && i > 0 && /^N\d+ G0 /.test(blk[i - 1]));
    expect(plunges).toEqual([]);
    // A nájezdy vedou ZLEVA (u backsidu se řeže k +Z): G1 nájezdu má vyšší
    // Z než rychloposuv, který mu předchází.
    const leads = [];
    for (let i = 1; i < blk.length; i++) {
      const g1 = blk[i].match(/^N\d+ G1 X(-?[\d.]+) Z(-?[\d.]+)/);
      const g0 = blk[i - 1].match(/^N\d+ G0 X(-?[\d.]+)$/);
      if (!g1 || !g0) continue;
      const zPrev = blk.slice(0, i).reverse().map(l => l.match(/^N\d+ G0 Z(-?[\d.]+)$/)).find(Boolean);
      if (zPrev) leads.push(parseFloat(g1[2]) - parseFloat(zPrev[1]));
    }
    expect(leads.length).toBeGreaterThanOrEqual(3);
    leads.forEach(d => expect(d).toBeGreaterThan(0.5));
  });

  // Nájezd hranou materiálu: kde před začátkem řetězu ještě stojí materiál,
  // se dráha natáhne PROTI směru řezu na téže hloubce a nástroj do dílu vjede
  // rovným průměrem místo šikmé rampy (nález uživatele u N2520 na part-15).
  it('part-15: válcový řetěz najíždí rovným průměrem, ne rampou', async () => {
    const { gcode } = await runCamProg(load('part-15-finish-zprava.camprog'));
    const blk = finBlock(gcode);
    const runIns = blk.filter(l => /Rovný průměr \(nájezd/.test(l));
    expect(runIns.length).toBeGreaterThan(0);
    // Nájezd na válec X27.856 (Z 67.142) je právě ten z nálezu.
    expect(runIns.some(l => /X27\.856 Z67\.142/.test(l))).toBe(true);
  });

  it('rovný průměr na konci řetězu je čistý pohyb v Z (konstantní X)', async () => {
    for (const name of fixtures) {
      const prog = load(name);
      if (!prog.params || !(prog.params.doFinishing || prog.params.finishOnly)) continue;
      const { gcode } = await runCamProg(prog);
      const blk = finBlock(gcode);
      blk.forEach((l, i) => {
        if (!/Rovný průměr/.test(l)) return;
        const cur = l.match(/X(-?[\d.]+) Z(-?[\d.]+)/);
        const prev = blk[i - 1].match(/X(-?[\d.]+)/);
        expect(cur, `${name}: rovný průměr musí mít X i Z`).toBeTruthy();
        expect(parseFloat(cur[1]), `${name}: rovný průměr nesmí měnit X`)
          .toBeCloseTo(parseFloat(prev[1]), 3);
      });
    }
  }, 60000);

  // Nulový úsek (p1 ≡ p2) z ořezu kolineárních segmentů: neobrábí nic, ale
  // projde filtry a v emisi kolem sebe vyrobí nájezd i odjezd. Na part-15
  // takový sirotek zbyl potom, co jeho skutečné sousedy vyřadil držák —
  // nástroj sjel rampou do materiálu, neudělal nic a vyjel ven (N2460).
  it('dokončovací dráha nemá nulové úseky (a program nulové pohyby)', async () => {
    for (const name of fixtures) {
      const prog = load(name);
      if (!prog.params || !(prog.params.doFinishing || prog.params.finishOnly)) continue;
      const { calc, gcode } = await runCamProg(prog);
      const zero = calc.finishOffsetPath.filter(s => s.type === 'line'
        && Math.hypot(s.p2.x - s.p1.x, s.p2.z - s.p1.z) < 1e-3);
      expect(zero.map(s => `${name}: (${s.p1.x.toFixed(3)},${s.p1.z.toFixed(3)})`)).toEqual([]);
      // A totéž na emitovaném kódu: dva po sobě jdoucí pohyby na týž bod.
      let last = null;
      const dup = [];
      for (const l of finBlock(gcode)) {
        const m = l.match(/G0?[123] X(-?[\d.]+) Z(-?[\d.]+)/);
        if (!m) continue;
        const p = `${m[1]}|${m[2]}`;
        if (p === last) dup.push(`${name}: ${l}`);
        last = p;
      }
      expect(dup).toEqual([]);
    }
  }, 60000);

  // ── Dokončování nesmí zajíždět do materiálu ────────────────────────
  // Dokončovací nůž má sundat PŘÍDAVEK, nic víc. Kde hrubování nedosáhlo
  // (stín mezní čáry u strmé stěny), jelo dokončování po syrové kontuře až
  // do rohu a bralo naráz celý zbytek — na dílu uživatele 29 mm² na
  // posledních 2,9 mm válce, tříska až 14 mm dokončovacím nožem.
  // Měřeno stejně jako validátor drah: emitované řezné bloky se přehrají
  // do modelu polotovaru a počítá se skutečný úběr / délku pohybu.
  // Rovný průměr (nájezd/výjezd hranou materiálu) je z pravidla vyňatý —
  // ten zbytek ubírat MÁ, se stropem jedné hloubky třísky.
  it('žádný dokončovací řez nebere víc než přídavek', async () => {
    for (const name of fixtures) {
      const prog = load(name);
      if (!prog.params || !(prog.params.doFinishing || prog.params.finishOnly)) continue;
      const { calcSim, gcode, errors, S } = await runCamProg(prog);
      const lines = gcode.split('\n');
      const finStart = lines.findIndex(l => l.includes(FIN_MARK));
      if (finStart < 0) continue;
      let alw = Math.max(+S.params.allowanceX || 0, +S.params.allowanceZ || 0)
        + (+S.params.finishAllowance || 0);
      // Kde hrubování zastavila GEOMETRIE NÁSTROJE (mezní čára držáku
      // u čelního hrubování), zůstává nad konturou víc než přídavek —
      // dokončování to buď sundá, nebo díl zůstane nedodělaný. Strop je
      // pak jedna hloubka třísky, ne přídavek (stejná úvaha jako u
      // „Rovný průměr" níž). Bez držáku zůstává pravidlo přísné.
      if ((errors || []).some(e => /Hlídání držáku \(čelně\)/.test(e.msg || '')))
        alw = Math.max(alw, parseFloat(S.params.depthOfCut) || 0);
      const stock = new StockModel([buildStockLoop(S.params, calcSim.stockPathSegments)]);
      const foot = toolFootprint(S.params);
      // Bloky simPath = po sobě jdoucí body se stejným řádkem a typem.
      let cur = null; const blocks = [];
      for (let i = 1; i < calcSim.simPath.length; i++) {
        const p = calcSim.simPath[i];
        const li = p.originalLineIdx ?? (cur ? cur.lineIdx : null);
        const type = p.type || 'G0';
        if (!cur || li !== cur.lineIdx || type !== cur.type) { cur = { lineIdx: li, type, pts: [calcSim.simPath[i - 1], p] }; blocks.push(cur); }
        else cur.pts.push(p);
      }
      // Stav polotovaru PO hrubování (dokončovací bloky se neodebírají —
      // jdou po sobě podél Z, takže se navzájem neovlivňují).
      for (const b of blocks) {
        if (b.lineIdx >= finStart || b.type === 'G0') continue;
        try { stock.cut(toolSweep(foot, b.pts)); } catch { /* model je jen pro měření */ }
      }
      const tipR = Math.max(+S.params.toolRadius || 0, 0);
      const topXAt = (z) => {
        let top = null;
        for (const loop of stock.loops) {
          for (let i = 0; i < loop.length; i++) {
            const a = loop[i], c = loop[(i + 1) % loop.length];
            if ((a.z <= z && c.z > z) || (c.z <= z && a.z > z)) {
              const x = a.x + (c.x - a.x) * ((z - a.z) / (c.z - a.z));
              if (top === null || x > top) top = x;
            }
          }
        }
        return top;
      };
      // LOKÁLNÍ hloubka záběru ve vzorcích po dráze (průměr přes celý pohyb
      // by špičku na posledních milimetrech dlouhého válce rozmělnil).
      const tooDeep = [];
      for (const b of blocks) {
        if (b.lineIdx < finStart || b.type === 'G0') continue;
        const text = (lines[b.lineIdx] || '').trim();
        if (/Rovný průměr/.test(text)) continue;   // ten zbytek ubírat má
        // Výjezd z řezu SKRZ zbytek posuvem (exit-split) je táž výjimka jako
        // rovný průměr, jen z druhé strany: měří se PRVNÍM bodem bloku, což je
        // koncový bod předchozího pohybu — u dojezdu „Rovný průměr" tedy přesně
        // ten zbytek, který ubírat MÁ (jinak by se stejná situace započítala
        // dvakrát). Alternativa (rychloposuv skrz stojící materiál) je horší.
        if (/Výjezd materiálem posuvem/.test(text)) continue;
        for (const p of b.pts) {
          const top = topXAt(p.z);
          if (top === null) continue;
          const depth = top - (p.x - tipR);
          if (depth > alw + 0.15) {
            tooDeep.push(`${name}: ${depth.toFixed(2)} mm u X${p.x.toFixed(2)} Z${p.z.toFixed(2)} (přídavek ${alw}) @ ${text}`);
            break;
          }
        }
      }
      expect(tooDeep).toEqual([]);
    }
  }, 120000);

  // Rovný úsek po dosednutí rampy nesmí jet PROTI směru řezu. `straightRunEndZ`
  // vracel dno okna i tehdy, když rampa dosedla už ZA ním (na part-15 dosedla
  // na Z−8,473, dno okna je Z−8,000) — z toho vznikl řez „G1 Z−8.473" a hned
  // zpátky „G1 Z−8.000". Hrubuje se zprava doleva, takže Z smí jen klesat.
  it('hrubování nemá zpětné axiální řezy (Z proti směru řezu)', async () => {
    for (const name of fixtures) {
      const prog = load(name);
      if ((prog.params?.roughingSide || 'right') !== 'right'
        || (prog.params?.roughingStrategy || 'longitudinal') !== 'longitudinal') continue;
      const { gcode } = await runCamProg(prog);
      const lines = gcode.split('\n');
      const finStart = lines.findIndex(l => l.includes(FIN_MARK));
      const end = finStart < 0 ? lines.length : finStart;
      const back = [];
      let x = null, z = null;
      for (let i = 0; i < end; i++) {
        const l = lines[i];
        const mx = l.match(/X(-?[\d.]+)/), mz = l.match(/Z(-?[\d.]+)/);
        const nx = mx ? parseFloat(mx[1]) : x, nz = mz ? parseFloat(mz[1]) : z;
        if (/(^|\s)(N\d+\s+)?G0?1(\s|$)/.test(l) && x !== null
          && Math.abs(nx - x) < 1e-6 && nz - z > 1e-6) back.push(`${name}: ${l.trim()}`);
        x = nx; z = nz;
      }
      expect(back).toEqual([]);
    }
  }, 90000);

  it('žádný oblouk se neobrábí jen z půlky (celý, nebo vůbec)', async () => {
    for (const name of fixtures) {
      const prog = load(name);
      if (!prog.params || !(prog.params.doFinishing || prog.params.finishOnly)) continue;
      const { calc } = await runCamProg(prog);
      // Ořezaný oblouk (dřívější chování) po sobě nechal DVOJICI: obrobenou
      // část v finishOffsetPath a odříznutý cíp v finishUnreachablePath se
      // shodným středem i poloměrem. Nově musí být oblouk buď celý obrobený,
      // nebo celý nedosažitelný — taková dvojice tedy nesmí existovat.
      const cut = calc.finishOffsetPath.filter(s => s.type === 'arc' && !s.isDegenerate);
      const skip = calc.finishUnreachablePath.filter(s => s.type === 'arc');
      const split = cut.filter(a => skip.some(b =>
        Math.hypot(a.cx - b.cx, a.cz - b.cz) < 1e-6 && Math.abs(a.r - b.r) < 1e-6));
      expect(split.map(a => `${name}: c(${a.cx.toFixed(2)},${a.cz.toFixed(2)}) r=${a.r.toFixed(2)}`)).toEqual([]);
    }
  }, 60000);
});
