// ╔══════════════════════════════════════════════════════════════╗
// ║  CIK CAK — vrstva za hrbolem obráceně: ze vzduchu ke stěně     ║
// ╚══════════════════════════════════════════════════════════════╝
//
// Uživatel 1. 11. 2026: všechno se dělá podle pravidel (úseky, pořadí,
// zanořování). Jediná výjimka: vrstva za hrbolem, která by se zprava
// zanořila, jela doleva a VYJELA DO PRÁZDNÉHO PROSTORU (vlevo není
// polotovar), se vezme obráceně — nůž zajede vlevo do volného místa a bere
// doprava až ke stěně hrbolu. Nezanořuje se, a protože ke stěně jede
// vodorovně, čára zanoření pro ni neplatí — klín pod ní nezůstane.
//
// Pracuje nad hotovými průchody genLongPasses (v prostoru středu nosu,
// jízda −Z; zleva je svět zrcadlený). Obrácený průchod zůstává na místě
// původního → týž úsek, totéž pořadí, žádný přejezd do jiného úseku.

import { maxXAt } from '../passHelpers.js';

const DZ = 0.05;
const ENTRY_AIR = 1;        // vjezd o tolik před koncem materiálu (ve vzduchu)
const WALL_STEP = 0.25;

/**
 * Dotkne se SPODNÍ půlka kružnice nosu (střed x, z) polotovaru? Horní půlka
 * se neptá — nad vrstvou je materiál ubraný vrstvami nad ní (jedou shora).
 */
function makeStockTouch(stockSegs, R, clear = 0) {
  if (!stockSegs || !stockSegs.length) return null;
  // Vůle polotovaru (Vůle X/Z): kružnice nosu zvětšená o ni — rychloposuv
  // na vjezd se pak nedotkne ani polotovaru, se kterým počítá plánování.
  const Rc = R + clear;
  const n = Math.max(2, Math.ceil(Rc / 0.25));
  return (x, z) => {
    for (let k = -n; k <= n; k++) {
      const dz = (k / n) * Rc, t = maxXAt(stockSegs, z + dz);
      if (t !== null && t > x - Math.sqrt(Math.max(Rc * Rc - dz * dz, 0)) + 0.02) return true;
    }
    return false;
  };
}

/**
 * Obrátí vrstvy za hrbolem, které končí ve vzduchu. Mění `passes` na místě.
 * @param {object} o { passes, start, raw, guided, stock, noseR, step, zLo, zHi }
 *   zLo    — čelisti (vjezd vlevo za ně nesmí)
 *   zHi    — začátek rozsahu úseku (obrácená vrstva za něj nejede)
 *   raw    — offset bez čar zanoření (stěna hrbolu, kam se dojede)
 *   guided — offset, nad kterým jelo podélné hrubování
 * @returns {number} počet obrácených vrstev
 */
export function reverseAirLayers({ passes, start = 0, raw, guided, stock, noseR, step, zLo = -Infinity, zHi = Infinity, clear = 0, afterPrev = false }) {
  const touch = makeStockTouch(stock, noseR);
  // Vjezd (sem sjede rychloposuv): s vůlí polotovaru; nevyjde-li, o kus dál
  // doleva ve volnu (do 2R). Rozhodnutí „vlevo je volno" se dělá bez vůle.
  const touchClr = makeStockTouch(stock, noseR, clear);
  const entryAir = (X, z0, zMin) => {
    for (let z = z0; z >= Math.max(zMin, z0 - 2 * noseR); z -= 0.1) {
      if (fR(z) > X + 1e-6) return null;
      // Rychloposuv končí 0,5 nad vrstvou (zbytek posuvem, zigzagEmit.js):
      // tam s vůlí, na hloubce vrstvy bez ní.
      if (!touchClr(X + 0.5, z) && !touch(X, z)) return z;
    }
    return null;
  };
  if (!touch) return 0;   // bez polotovaru nevíme, kde je vzduch
  const fR = (z) => { const v = maxXAt(raw, z); return v === null ? -Infinity : v; };
  const fG = (z) => { const v = maxXAt(guided, z); return v === null ? -Infinity : v; };
  // Stěna vpravo od z na hloubce X (offset bez čar zanoření se zvedne nad X).
  // Za začátkem úseku stojí materiál, který patří tomuto úseku (kapsa,
  // kterou předchozí úsek nebere — pravidlo 20, ops/zigzagBeyondStart.js):
  // obrácená vrstva jede až ke stěně za hranicí, NAJEDNOU (soustruh zleva,
  // díl (10), pod S4: „dělá se to na dvě části místo aby se to jelo najednou").
  let zBeyond = null;
  if (afterPrev && Number.isFinite(zHi)) {
    for (let z = zHi + 0.25; z <= zHi + 5000; z += 0.25) {
      const t = maxXAt(stock, z);
      if (t === null || !(t + noseR > fR(z) + 0.5)) break;
      zBeyond = z;
    }
    // Jen pás širší než destička (2R): úzký proužek za hranicí (soustruh
    // zleva, šikmý polotovar Z143–145) bere kapsa shora (zigzagBeyondStart.js).
    if (zBeyond !== null && zBeyond - zHi < 2 * noseR) zBeyond = null;
  }
  // Za hranici jen pod materiálem nejvýš o ap (nebo pod vrstvou o ap výš,
  // která za hranici už dojela) — jinak by držák jel pod vysokým materiálem
  // (soustruh zleva, Ú3 u šikmého polotovaru Z137–145: 11 kolizí).
  const extended = [];
  const beyondOk = (X, z0, zw) => {
    if (extended.some((e) => e > X + 0.3 * step && e < X + 1.6 * step)) return true;
    for (let z = Math.max(z0, zHi); z <= zw; z += 0.25) {
      const t = maxXAt(stock, z);
      if (t !== null && t + noseR > X + step + 0.5) return false;
    }
    return true;
  };
  const wallRight = (X, z, zMax0) => {
    const zMax = zBeyond !== null && zMax0 >= zHi - 1e-6 ? zBeyond + 1 : Math.min(zMax0, zHi);
    for (let zz = z; zz <= zMax + 1e-9; zz += DZ) {
      if (fR(zz) > X + 1e-6) {
        let a = zz - DZ, b = zz;
        for (let q = 0; q < 30; q++) { const m = (a + b) / 2; if (fR(m) > X + 1e-6) b = m; else a = m; }
        if (a > zHi + 0.5 && !beyondOk(X, z, a)) break;
        if (a > zHi + 0.5) extended.push(X);
        return a;
      }
    }
    // Bez stěny až po začátek úseku: vrstva končí na něm (dál je jiný úsek).
    return zHi <= zMax0 && zHi > z ? zHi : null;
  };
  // Krok po stěně z (x0,z0) do (x1,z1): šikmo, kde tětiva offset nepodřízne;
  // na oblouku se zjemní body na offsetu. Jen u skutečného schodu (stěna
  // uskočí) nejdřív nahoru a pak přes — šikmo by hranu podřízl. (Uživatel:
  // „schodky místo rádiusu".) Vede-li tětiva NAD offsetem (rovná plocha a za
  // ní šikmá stěna), taky se zjemní po offsetu — jinak by nad ním zůstal klín
  // navíc k přídavku (uživatel 2. 11. 2026: N2470 G1 X35.545 Z210.134 „jede
  // nějak zešikma", má jet s přídavkem na hotovo).
  const wallStep = (x0, z0, x1, z1, depth = 0) => {
    let worst = 0.005, wz = null, over = null;
    for (let t = 0.125; t < 1; t += 0.125) {
      const zt = z0 + (z1 - z0) * t, f = fR(zt), d = f - (x0 + (x1 - x0) * t);
      if (d > worst) { worst = d; wz = zt; }
      // Offset pod tětivou, ale ne pod výškou vrstvy (tam je údolí, ne stěna).
      else if (wz === null && -d > 0.005 && f >= Math.min(x0, x1) - 1e-6 && (!over || -d > over.d)) over = { d: -d, z: zt };
    }
    if (wz === null && over && depth < 12) {
      const xm = fR(over.z);
      return [...wallStep(x0, z0, xm, over.z, depth + 1), ...wallStep(xm, over.z, x1, z1, depth + 1)];
    }
    if (wz === null) return [{ x: x1, z: z1 }];
    const xm = fR(wz);
    if (depth >= 6 || xm > x1 + 1e-6) return [{ x: x1, z: z0 }, { x: x1, z: z1 }];
    return [...wallStep(x0, z0, xm, wz, depth + 1), ...wallStep(xm, wz, x1, z1, depth + 1)];
  };
  // Body na téže přímce (zjemnění po rovné ploše) se sloučí do jednoho tahu.
  const mergeCollinear = (moves) => {
    const out = [];
    for (const m of moves) {
      const a = out[out.length - 2], b = out[out.length - 1];
      if (a && b && a.g === 'G1' && b.g === 'G1' && m.g === 'G1'
        && Math.abs((b.x - a.x) * (m.z - a.z) - (b.z - a.z) * (m.x - a.x)) < 0.002 * Math.hypot(m.x - a.x, m.z - a.z)
        && (b.z - a.z) * (m.z - b.z) + (b.x - a.x) * (m.x - b.x) >= 0) out.pop();
      out.push(m);
    }
    return out;
  };
  // Tah obrácené vrstvy: vjezd ve vzduchu, +Z ke stěně, po stěně o vrstvu
  // nahoru. Skončí-li stěna pod další vrstvou (vršek hrbolu), pokračuje po
  // offsetu přes vršek, dokud nesjede zpět na výšku vrstvy — průměr za
  // rádiusem se obrobí zleva, ne až zvrchu a zprava (uživatel 1. 11.).
  // `target`: zbytek TÉŽE vrstvy za vrškem (podélný kus na stejném X, který by
  // jinak jel zvlášť). Vrstva po offsetu přejede vršek až zpět na svou výšku,
  // dojede k jeho stěně a vyjede po ní — kus pak odpadá (uživatel 4. 11. 2026,
  // karusel po X: vrstva X107 skončila po pevných 4R + 4ap uprostřed svahu a
  // zbytek jel zvlášť → 27 mm posuvem vzduchem, vrstva přes hrb přerušená).
  const layerMoves = (X, zAir, zw, target = null, self = null) => {
    const moves = [{ g: 'G0', x: X, z: zAir }, { g: 'G1', x: X, z: zw }];
    const k = Math.max(1, Math.ceil(step / WALL_STEP));
    let zCur = zw;
    for (let guard = 0; guard < 4; guard++) {
      let lx = X, lz = zCur, top = false;
      for (let j = 1; j <= k; j++) {
        const x = X + step * j / k, z = wallRight(x, lz, zCur + 2 * step + 2 * noseR);
        if (z === null) { top = true; break; }
        for (const q of wallStep(lx, lz, x, z)) moves.push({ g: 'G1', x: q.x, z: q.z });
        lx = x; lz = z;
      }
      if (!top) break;
      // Přes vršek po offsetu nejdál 4R + 4ap (jako dřív). Jen když za ním
      // čeká zbytek téže vrstvy, smí se jet dál — a přijme se to, jen když
      // vrstva sjede zpět na X hned u jeho začátku a mezi nimi není stěna.
      // Přes vršek nejede tam, kde v téže výšce už řezal jiný kus téže vrstvy
      // (pravá strana jede dřív, pravidlo 7) — jinak posuv vzduchem (karusel,
      // ap 6: 43 mm po vršku hrbu, 4. 11. 2026). Krátký zbytek k napojení
      // (`target`, ≤ 2R + 2ap) se nepočítá — ten se projede schválně.
      // Přes vršek se nejede tam, kde v téže výšce už řezal jiný kus téže vrstvy
      // (i jeho dojezdem po offsetu) — jinak posuv vzduchem (karusel, ap 6:
      // 43 mm po vršku hrbu, 4. 11. 2026). Výjimka: zbytek, na který se vrstva
      // napojí (`target`) — ten pak odpadá, takže jeho úsek projede ona.
      const isTarget = (q) => target && Math.abs(q.zEnd - target.zEnd) < 1e-9 && Math.abs(q.zStart - target.zStart) < 1e-9;
      const span = (q) => {
        const zs = [q.zEnd, q.zStart];
        for (const sg of [...(q.contourLeadIn || []), ...(q.contourLeadOut || [])]) zs.push(sg.z1, sg.z2);
        const f = zs.filter(Number.isFinite);
        return [Math.min(...f), Math.max(...f)];
      };
      const same = passes.filter((q) => q && q !== self && q.type === 'long' && Math.abs(q.x - X) < 1e-3 && q.zStart > q.zEnd);
      const walk = (from, to, covered) => {
        const pts = [];
        let zz = from;
        while (zz < to) {
          zz = Math.min(to, zz + 0.5);
          if (covered.some(([c0, c1]) => zz > c0 + 1e-6 && zz < c1)) return { pts, back: null, end: zz };
          const f = fR(zz);
          if (!(f > X + 0.02) || f > X + step) return { pts, back: f <= X + 0.02 ? zz : null, end: zz };
          pts.push({ g: 'G1', x: f, z: zz });
        }
        return { pts, back: null, end: zz };
      };
      const lim0 = lz + 4 * noseR + 4 * step;
      const lim = Math.min(zBeyond !== null && beyondOk(X, lz, Math.min(zBeyond, lim0)) ? zBeyond + 1 : zHi, lim0);
      let w = walk(lz, lim, same.filter((q) => !isTarget(q)).map(span));
      // Napojení na zbytek vrstvy JEN když vrstva sjede zpět na X v obvyklé
      // vzdálenosti (4R + 4ap) a zbytek začíná hned tam. Přes dlouhý vršek
      // velkého hrbu NE: tam zbytek patří pravé straně, která jede dřív
      // (pravidlo 7) — prodloužení přes vršek k sobě stáhlo vrstvy pravého
      // svahu a program skákal mezi svahy (díl uživatele s ap 6, 4. 11. 2026).
      // Zbytek musí být KRÁTKÝ kus u stěny (≤ 2R + 2ap) — dlouhá vrstva přes
      // vršek (díl s ap 2: X157 61 mm na pravou stranu) patří pravé straně.
      const viaTarget = !!target && w.back !== null && target.zStart > w.back
        && Math.abs(target.zEnd - w.back) <= noseR + step
        && target.zStart - target.zEnd <= 2 * noseR + 2 * step
        && (() => { const zw2 = wallRight(X + 0.02, w.back, target.zStart); return zw2 === null || zw2 >= target.zStart - 0.05; })();
      // Bez napojení zbytek zůstává a jede sám → jeho úsek je „projetý".
      if (!viaTarget && target) w = walk(lz, lim, same.map(span));
      moves.push(...w.pts);
      if (w.back === null) break;
      moves.push({ g: 'G1', x: X, z: w.back });
      if (!viaTarget) break;
      moves.push({ g: 'G1', x: X, z: target.zStart });
      target.used = true;
      zCur = target.zStart;
      target = null;
    }
    return mergeCollinear(moves);
  };
  const done = [];
  for (let i = start; i < passes.length; i++) {
    const p = passes[i];
    if (!p || p.type !== 'long' || !Number.isFinite(p.x) || !(p.zStart > p.zEnd + 0.5)) continue;
    const X = p.x;
    // Za hrbolem: vpravo od začátku vrstvy stojí kontura (nebo čára zanoření) nad ní.
    const behindHump = fG(p.zStart + 0.3) > X + 0.05 || !!p.ramp || !!p.contourLeadIn;
    if (!behindHump) continue;
    // Volno HNED ZA MATERIÁLEM u hrbolu (ne až na konci vrstvy — ta může
    // pokračovat přes prázdné údolí k dalšímu materiálu): první místo vlevo
    // od začátku, kde se spodní půlka nosu nedotkne polotovaru. Narazí-li se
    // dřív na konturu, vzduch tu není.
    let zFree = null;
    // (Začátek vrstvy leží na stěně nebo pod hranou schodu — ta se přeskočí.)
    let z0 = p.zStart - 0.1;
    while (fR(z0) > X + 0.05 && z0 > p.zStart - 2 * noseR - step) z0 -= 0.1;
    // Vrstva musí NEJDŘÍV jet materiálem (u hrbolu) a pak vyjet do vzduchu;
    // začíná-li ve vzduchu (materiál až dál vlevo), není to tenhle případ.
    let mat = false;
    for (let zz = z0; zz >= p.zEnd - 2 * noseR - 2; zz -= 0.1) {
      if (fR(zz) > X + 0.05) break;
      if (touch(X, zz)) mat = true;
      else if (mat) { zFree = zz; break; }
      else break;
    }
    if (zFree === null) continue;
    // Další materiál vlevo za mezerou (v rozsahu původní vrstvy) zůstane
    // původní vrstvě — začne ve vzduchu před ním, bez nájezdu po kontuře.
    let zNext = null;
    for (let zz = zFree - 0.1; zz >= p.zEnd; zz -= 0.1) { if (touch(X, zz)) { zNext = zz; break; } }
    let zAir = entryAir(X, zFree - ENTRY_AIR, zNext !== null ? (zFree + zNext) / 2 : -Infinity);
    if (zAir === null) continue;
    // Vjezd i s plátkem (± R) před čelistmi (zLo).
    if (fR(zAir) > X + 1e-6 || touch(X, zAir) || zAir - noseR < zLo - 1e-6) continue;
    // Mez hledání stěny od začátku vjezdu (rampa z čáry zanoření začíná
    // blíž stěně než vrstva — soustruh zleva 5. 11. 2026, díl (10), konec u
    // 1/18: vrstvy X16–X0 jely z rampy doprava a u stěny zůstal klín).
    // Pod obrácenou vrstvou o ap výš i od její stěny (řetěz ramp ujíždí o ap/tan za vrstvu).
    const upper = done.filter((d) => Math.abs(d.x - (X + step)) < 0.6 * step).map((d) => d.z1);
    const zS = Math.max(p.zStart, p.ramp && Number.isFinite(p.ramp.z0) ? p.ramp.z0 : -Infinity, ...upper);
    const zw = wallRight(X, zFree, zS + 2 * noseR + step);
    if (zw === null || zw - zAir < 0.5) continue;
    // Zbytek téže vrstvy za vrškem: nejbližší podélný kus na stejném X vpravo.
    let target = null;
    for (const q of passes) {
      if (q && q !== p && q.type === 'long' && Math.abs(q.x - X) < 1e-3 && q.zEnd > zw && q.zStart > q.zEnd
        && (!target || q.zEnd < target.zEnd)) target = q;
    }
    // Pokračuje-li pravá strana pod zbytkem další vrstvou (o ap níž, přes
    // týž Z), zbytek patří pravé straně a jede s ní. Napojením by se rozsah
    // obrácené vrstvy roztáhl přes vršek, ZÁVISLÉ PODÉLNÉ KUSY níž by pak
    // stáhly celou pravou stranu do skupiny levých vrstev a program skákal
    // mezi svahy (soustruh, ap 2, Úsek 2: 24× výjezd nad hrb; 5. 11. 2026).
    if (target && passes.some((q) => q && q !== p && q !== target && q.type === 'long'
      && Math.abs(q.x - (X - step)) < 0.6 * step && q.zStart > q.zEnd
      && Math.min(q.zStart, q.zEnd) < target.zStart && Math.max(q.zStart, q.zEnd) > target.zEnd)) target = null;
    const tgt = target ? { zEnd: target.zEnd, zStart: target.zStart } : null;
    const moves = layerMoves(X, zAir, zw, tgt, p);
    if (tgt && tgt.used) { const t = passes.indexOf(target); if (t > i) passes.splice(t, 1); else if (t >= 0) { passes.splice(t, 1); i--; } }
    // `chain`: hned předchozí průchod je obrácená vrstva — emise po jejím
    // odskoku jede rychloposuvem rovnou nad vjezd a dolů (ne přes vrch).
    const prev = passes[i - 1];
    passes[i] = { type: 'zigzag', moves, xSafe: X + step, reversedLayer: true, chain: !!(prev && prev.reversedLayer) };
    if (zNext !== null) {
      const rest = { ...p, zStart: Math.min((zFree + zNext) / 2, zNext + ENTRY_AIR) };
      delete rest.contourLeadIn; delete rest.ramp; delete rest.rampFeedFrom; delete rest.leadInTrimmed;
      passes.splice(i + 1, 0, rest);
      i++;
    }
    done.push({ x: X, z0: zAir, z1: zw });
  }
  // DOPLNĚNÍ AŽ DOLŮ (uživatel 1. 11. 2026: „dráhy po ap z levé strany až
  // dolů k S6"): pod poslední obrácenou vrstvou skupiny podélné hrubování
  // vrstvu často vůbec nemá (ořízla ji čára zanoření). Přidají se další
  // obrácené vrstvy po ap, dokud vpravo stojí materiál a vlevo je volno.
  for (let i = passes.length - 1; i >= start; i--) {
    const r = passes[i];
    if (!r || !r.reversedLayer) continue;
    const X0 = r.moves[0].x;
    // Vrstva pod ní (do 0,6 ap) už je — obrácená nebo podélná přes totéž místo.
    const near = (X, za, zb) => done.some((d) => Math.abs(d.x - X) < 0.6 * step && d.z0 < zb && d.z1 > za)
      || passes.some((q) => q && q.type === 'long' && Math.abs(q.x - X) < 0.6 * step && Math.abs(q.zStart - q.zEnd) > 0.5
        && Math.min(q.zStart, q.zEnd) < zb && Math.max(q.zStart, q.zEnd) > za);
    if (near(X0 - step, r.moves[0].z, r.moves[1].z)) continue;
    const add = [];
    let zA = r.moves[0].z, zW = r.moves[1].z;
    for (let X = X0 - step; X > 0; X -= step) {
      // Tu vrstvu už jede jiná (krok řetězu zanoření bez těla se nepočítá —
      // ten v obrácené oblasti nemá co dělat a smaže se níž).
      if (near(X, zA, zW)) break;
      const zw = wallRight(X, zA, zW + 2 * noseR + step);
      if (zw === null) break;
      let z0 = zw - 0.1, zFree = null, mat = false;
      for (let zz = z0; zz >= zA - 2 * noseR - 2; zz -= 0.1) {
        if (fR(zz) > X + 0.05) break;
        if (touch(X, zz)) mat = true; else if (mat) { zFree = zz; break; }
      }
      if (!mat || zFree === null) break;
      const zAir = entryAir(X, zFree - ENTRY_AIR, -Infinity);
      if (zAir === null || zAir - noseR < zLo - 1e-6) break;
      add.push({ type: 'zigzag', moves: layerMoves(X, zAir, zw), xSafe: X + step, reversedLayer: true, chain: true });
      done.push({ x: X, z0: zAir, z1: zw });
      zA = zAir; zW = zw;
    }
    if (add.length) passes.splice(i + 1, 0, ...add);
  }
  // SESKUPENÍ: obrácené vrstvy téhož místa za hrbolem jdou ZA SEBOU, shora
  // dolů, na místě poslední z nich — tedy až po pravé straně (pravidlo 7:
  // „pak se přejede přes hrb a dodělá se zbytek"). Mezi nimi jen odskok,
  // rychloposuv rovnou nad další vjezd a nové ap (`chain`).
  const zr = (q) => [Math.min(...q.moves.map((m) => m.z)), Math.max(...q.moves.map((m) => m.z))];
  const idx = [];
  for (let i = start; i < passes.length; i++) if (passes[i] && passes[i].reversedLayer) idx.push(i);
  const groups = [];
  for (const i of idx) {
    const q = passes[i], [lo, hi] = zr(q);
    const g = groups.find((G) => G.some((j) => {
      const o = passes[j], [l2, h2] = zr(o);
      return Math.abs(Math.abs(o.moves[0].x - q.moves[0].x) - step) < 0.6 * step && lo < h2 && hi > l2;
    }));
    if (g) g.push(i); else groups.push([i]);
  }
  // ZÁVISLÉ PODÉLNÉ KUSY: podélný průchod, který leží mezi členy skupiny a pod
  // některou její vrstvou (níž v X, přes Z ± R + ap), musí jet AŽ PO ní — jinak
  // by se zanořil do materiálu, který skupina teprve ubere (karusel po X,
  // uživatel 4. 11. 2026: G1 X109 svisle a tříska 8,9 mm při ap 2). Zařadí se
  // do skupiny podle výšky. Překryv v Z bez přídavku: s rezervou R + ap se
  // přesouvaly i nezávislé kusy a trhal se řetěz obrácených vrstev.
  const xOf = (q) => (q.type === 'zigzag' ? q.moves[0].x : q.x);
  const zrLong = (q) => {
    const zs = [q.zStart, q.zEnd, q.ramp && q.ramp.z0].filter(Number.isFinite);
    return [Math.min(...zs), Math.max(...zs)];
  };
  const remove = new Set(), insertAt = new Map();
  for (const G of groups) {
    if (G.length < 2) continue;
    const first = Math.min(...G), last = Math.max(...G);
    // Uzávěr: kus pod už přesunutým kusem musí jet po něm taky.
    const deps = [], moved = [...G];
    const zrOf = (q) => (q.type === 'zigzag' ? zr(q) : zrLong(q));
    for (let grew = true; grew;) {
      grew = false;
      for (let j = first + 1; j < last; j++) {
        const p = passes[j];
        if (!p || p.reversedLayer || p.type !== 'long' || moved.includes(j) || !Number.isFinite(p.x)) continue;
        const [pl, ph] = zrLong(p);
        if (moved.some((g) => { const q = passes[g], [l2, h2] = zrOf(q); return xOf(q) > p.x + 1e-6 && pl < h2 && ph > l2; })) {
          deps.push(j); moved.push(j); grew = true;
        }
      }
    }
    const items = [...G, ...deps].sort((a, b) => (xOf(passes[b]) - xOf(passes[a])) || (a - b)).map((j) => passes[j])
      .map((q, k, arr) => (q.reversedLayer ? { ...q, chain: k > 0 && !!arr[k - 1].reversedLayer } : q));
    G.forEach((j) => remove.add(j));
    deps.forEach((j) => remove.add(j));
    insertAt.set(last, items);
  }
  if (remove.size) {
    const out = passes.slice(0, start);
    for (let i = start; i < passes.length; i++) {
      if (insertAt.has(i)) out.push(...insertAt.get(i));
      else if (!remove.has(i)) out.push(passes[i]);
    }
    passes.length = 0;
    passes.push(...out);
  }
  // Samostatné kroky řetězu zanoření (rampa bez těla, pravidlo 14) v obrácené
  // oblasti už nemají kam vést — obrácené vrstvy tam vjíždějí ze vzduchu.
  for (let i = passes.length - 1; i >= start; i--) {
    const p = passes[i];
    if (!p || p.type !== 'long' || !(p.ramp || p.contourLeadIn) || Math.abs(p.zStart - p.zEnd) > 0.5) continue;
    if (done.some((r) => Math.abs(r.x - p.x) <= step + 0.01 && p.zStart >= r.z0 - 0.01 && p.zStart <= r.z1 + step + 0.01)) passes.splice(i, 1);
  }
  // Po vypuštění projetých kusů navazují obrácené vrstvy téhož místa přímo
  // na sebe — řetěz (`chain`) jako ve skupině.
  for (let i = start + 1; i < passes.length; i++) {
    const q = passes[i], o = passes[i - 1];
    if (!q || !o || !q.reversedLayer || !o.reversedLayer || q.chain) continue;
    const [lo, hi] = zr(q), [l2, h2] = zr(o);
    if (Math.abs(o.moves[0].x - q.moves[0].x - step) < 0.6 * step && lo < h2 && hi > l2) passes[i] = { ...q, chain: true };
  }
  return done.length;
}
