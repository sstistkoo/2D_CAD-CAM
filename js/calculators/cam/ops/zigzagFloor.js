// ╔══════════════════════════════════════════════════════════════╗
// ║  CIK CAK — spodek pod polotovarem: vrstvy tam a zpět místo     ║
// ║  zanořování od hranice úseku                                   ║
// ╚══════════════════════════════════════════════════════════════╝
//
// Uživatel 1. 11. 2026: „jak se pojede úsek 2 a tam se zanořuje — teď se
// nebude dole zanořovat, ale pojede se cik cak, a bude se to touhle metodou
// dojíždět i v úseku 1 pod S6, tak aby se to dobralo i tam".
//
// Podélné hrubování bere spodek údolí vrstvami, z nichž každá se zanoří
// rampou od začátku úseku (hranice) a jede doleva; pod polotovarem za
// hranicí (v předchozím úseku, až ke stěně) zůstane klín. Tady se taková
// řada vrstev nahradí JEDNÍM průchodem cik cak:
//   – vrstva od stěny ke stěně, vpravo AŽ KE STĚNĚ i za hranicí úseku
//     (výjimka jen pro tenhle spodek),
//   – začátek u pravé stěny rampou doleva; na konci vrstvy hned rampa pod
//     úhlem zanoření o ap níž směrem od stěny (pravidlo 6, jedna vrstva —
//     pravidlo 3). Bez výjezdů po stěně nahoru a zpět (uživatel: „jede
//     nahoru a pak zas dolů"; právě ty u šikmé stěny narážely držákem),
//   – poslední vrstva (dno) dojede k oběma stěnám (roh u stěny).
// Jen strategie Cik cak (ops/zigzagRough.js). Svět je jako u podélného
// (jízda −Z, zleva zrcadlo).

import { maxXAt } from '../passHelpers.js';
import { getInsert } from '../inserts/index.js';

const DZ = 0.05;

/**
 * Nahradí řadu zanořovacích vrstev u hranice úseku průchodem cik cak.
 * @param {object} o { passes, start, raw, step, tanA, zHi, noSteps }
 *   raw — offset bez čar zanoření; zHi — začátek rozsahu úseku
 * @returns {number} počet nahrazených vrstev
 */
export function floorZigzag({ passes, start = 0, raw, step, tanA, zHi = Infinity, noSteps = false, valleyStart = false }) {
  if (!Number.isFinite(zHi)) return 0;
  const W = wallFinders(raw);
  const { wallLeft, wallRight } = W;

  // Řada zanořovacích vrstev: podélné s rampou, rampa začíná u hranice
  // úseku (ve vzduchu nad spodkem), po sobě jdoucí hloubky po ap.
  const reach = 4 * step / Math.max(tanA, 0.2) + 2;
  // Hranici se týká jen PRVNÍ vrstva; další navazují řetězem ramp (pravidlo
  // 14), každá rampa začíná o kus dál vlevo.
  const isPlunge = (p) => p && p.type === 'long' && p.ramp && Number.isFinite(p.x) && p.zStart > p.zEnd + 0.5;
  let i0 = -1;
  for (let i = start; i < passes.length; i++) if (isPlunge(passes[i]) && passes[i].ramp.z0 >= zHi - reach) { i0 = i; break; }
  if (i0 < 0) return 0;
  const grp = [i0];
  for (let i = i0 + 1; i < passes.length && isPlunge(passes[i]); i++) {
    // Po ap; poslední (dno) smí být tenčí.
    const dx = passes[grp[grp.length - 1]].x - passes[i].x;
    if (dx > 1.6 * step || dx < 0.05) break;
    grp.push(i);
  }
  if (grp.length < 2) return 0;

  const first = passes[grp[0]];
  const xTop = first.ramp.x0;
  // Úsek za hranicí na údolí polotovaru (pravidlo 1): předchozí úsek pod dno
  // údolí nejel, stěna hrbu může být daleko za hranicí.
  const zFar = zHi + reach + (valleyStart ? 5000 : 50);
  const layers = grp.map((j) => {
    const p = passes[j];
    const a = wallLeft(p.x, p.zEnd + 0.5, p.zEnd - reach) ?? p.zEnd;
    const b = wallRight(p.x, p.zStart, zFar);
    return { X: p.x, a, b };
  });
  // Vrstva, která pod předchozí neleží (jiná kapsa vedle dna — zářez do V za
  // koncem dna, karusel 5. 11. 2026), do cik caku nepatří: jízda po stěně by
  // jinak sjela až k ní přes celé dno plným záběrem. Vezmou ji kapsy pod
  // spodkem (zigzagValley.js `pocketsBelowZigzag`).
  for (let k = 1; k < layers.length; k++) {
    const P = layers[k - 1], L = layers[k];
    if (P.b !== null && L.b !== null && (L.b < P.a + 1 || L.a > P.b - 1)) { layers.length = k; grp.length = k; break; }
  }
  // Pod předchozí vrstvou zůstává kapsa i VEDLE užší další vrstvy (karusel
  // Od středu 6. 11. 2026, Ú2 N2800: po dně Z68,2 šel cik cak do zářezu V
  // a hluboká kapsa X309–447 vedle něj vzala jízda po stěně jedním tahem
  // 17 mm) — cik cak končí na předchozí vrstvě, kapsy pod ní vezme
  // pocketsBelowZigzag (napřed pravá, pak levá).
  // Utne se u NEJHLUBŠÍ takové vrstvy (karusel díl (9): vedle Z68,2 leží zářez V,
  // vedle zářezu hluboká kapsa — cik cak má dojet na Z68,2).
  // Kapsu, kterou berou jiné vrstvy (mimo tento řetěz), nepočítat — tu vezmou ony.
  const inGrp = new Set(grp.map((j) => passes[j]));
  const others = passes.filter((q) => q && q.type === 'long' && Number.isFinite(q.x) && !inGrp.has(q));
  for (let k = layers.length - 1; k >= 1; k--) {
    const P = layers[k - 1], L = layers[k];
    if (P.b !== null && L.b !== null && sidePocket(W, P, L, others, 2 * step)) { layers.length = k; grp.length = k; break; }
  }
  if (grp.length < 2) return 0;
  if (layers.some((L) => L.b === null || L.b - L.a < 1)) return 0;
  return zigzagFromLayers({ passes, grp, layers, xTop, tanA, reach, noSteps, W });
}

/** Vedle rozpětí další vrstvy L (pod P) klesá offset pod L — samostatná kapsa (aspoň `minRun`, kraje šikmých stěn ne)? */
export function sidePocket(W, P, L, others = [], minRun = 2) {
  let run = 0;
  for (let z = P.a; z <= P.b; z += 0.25) {
    if (z > L.a - 1 && z < L.b + 1) { run = 0; continue; }
    const own = others.some((q) => q.x < P.X - 0.3 && z >= Math.min(q.zStart, q.zEnd) - 0.5 && z <= Math.max(q.zStart, q.zEnd) + 0.5);
    if (!own && W.fR(z) < L.X - 1) { run += 0.25; if (run >= minRun) return true; } else run = 0;
  }
  return false;
}

/**
 * Hledání stěn nad hrubovacím offsetem `raw` (bez čar zanoření):
 * fR(z) = výška offsetu, wallRight/wallLeft(X, z, mez) = první místo vpravo
 * / vlevo od z, kde se offset zvedne nad hloubku X (null = do meze nic).
 */
export function wallFinders(raw) {
  const fR = (z) => { const v = maxXAt(raw, z); return v === null ? -Infinity : v; };
  // Stěna vpravo od z na hloubce X (offset se zvedne nad X).
  const wallRight = (X, z, zMax) => {
    for (let zz = z; zz <= zMax + 1e-9; zz += DZ) {
      if (fR(zz) > X + 1e-6) {
        let a = zz - DZ, b = zz;
        for (let q = 0; q < 30; q++) { const m = (a + b) / 2; if (fR(m) > X + 1e-6) b = m; else a = m; }
        return a;
      }
    }
    return null;
  };
  const wallLeft = (X, z, zMin) => {
    for (let zz = z; zz >= zMin - 1e-9; zz -= DZ) {
      if (fR(zz) > X + 1e-6) {
        let a = zz + DZ, b = zz;
        for (let q = 0; q < 30; q++) { const m = (a + b) / 2; if (fR(m) > X + 1e-6) b = m; else a = m; }
        return a;
      }
    }
    return null;
  };
  return { fR, wallRight, wallLeft };
}

/**
 * Postaví z vrstev `layers` ({ X, a, b } = hloubka a stěny vlevo/vpravo,
 * shora dolů) jeden průchod cik cak a nahradí jím průchody `grp` (indexy
 * do `passes`, vzestupně). `xTop` = výška nad první vrstvou (už vybraná),
 * `W` = wallFinders(raw).
 * @returns {number} počet nahrazených vrstev
 */
export function zigzagFromLayers({ passes, grp, layers, xTop, tanA, reach, noSteps = false, W }) {
  const { fR, wallRight, wallLeft } = W;
  // Začátek u PRAVÉ stěny (uživatel: „začít se zanořovat vpravo u čela"):
  // nad stěnou ve výšce rampy původní první vrstvy, rampa doleva o vrstvu.
  const L0 = layers[0];
  const run0 = (xTop - L0.X) / Math.max(tanA, 1e-3);
  // Stěna na výšce začátku rampy (šikmá stěna je nahoře dál vpravo). Hledá se
  // o 0,05 mm pod výškou: plošina dna těsně pod ní (vrstva na dně 68,22 nad
  // dnem 68,20) by jinak stěnu „zakryla" a jízda po stěně začala o kus dál
  // svisle (karusel 5. 11. 2026, N4690).
  const bTop = wallRight(xTop - 0.05, L0.b, L0.b + reach) ?? L0.b;
  const mv = [{ g: 'G0', x: xTop, z: bTop }];
  const push = (x, z) => { const l = mv[mv.length - 1]; if (Math.abs(l.x - x) > 1e-6 || Math.abs(l.z - z) > 1e-6) mv.push({ g: 'G1', x, z }); };
  // Vrstva PO DNĚ (`follow`): mírně šikmé dno (karusel 5. 11. 2026, N4630:
  // dno Z46→44) by poslední vodorovná vrstva vzala jen u nejnižšího místa
  // a rampa k ní vedla přes celé dno. Místo toho zanoření na dno a jízda po
  // hrubovacím offsetu (o setiny nad ním), nanejvýš ve výšce `top`.
  const onFloor = (L, z) => Math.min(L.top ?? Infinity, fR(z) + 0.03);
  const follow = (L, z0, z1) => {
    const n = Math.max(1, Math.ceil(Math.abs(z1 - z0) / 0.5));
    for (let k = 1; k <= n; k++) {
      const z = z0 + (z1 - z0) * k / n, x = onFloor(L, z);
      const l = mv[mv.length - 1], p0 = mv.length >= 2 ? mv[mv.length - 2] : null;
      // Body na přímce se slučují (rovné dno jedním blokem).
      if (p0 && l.g === 'G1' && Math.abs((l.x - p0.x) * (z - p0.z) - (l.z - p0.z) * (x - p0.x)) < 1e-4 * Math.hypot(z - p0.z, x - p0.x)) { l.x = x; l.z = z; continue; }
      push(x, z);
    }
  };
  const rampTo = (L, end, d, next) => {
    // Rampa od stěny pod úhlem zanoření o vrstvu níž.
    // Konec rampy uvnitř další vrstvy — šikmá stěna se s hloubkou zužuje
    // a rampa by jinak skončila za ní (díl uživatele, Ú3 N6200: zajetí).
    const run = (L - next.X) / Math.max(tanA, 1e-3);
    let zr = end - d * Math.min(run, Math.max(0, (next.b - next.a) - 0.5));
    zr = Math.min(next.b, Math.max(next.a, zr));
    push(next.follow ? Math.min(L, Math.max(next.X, onFloor(next, zr))) : next.X, zr);
  };
  rampTo(xTop, bTop, 1, L0);
  if (mv.length >= 2 && !L0.follow) mv[1].z = Math.min(L0.b, Math.max(L0.a + 0.5, bTop - run0));
  // Bez výjezdů po stěně nahoru a zpět (uživatel: „jede nahoru, pak zas
  // dolů"): na konci vrstvy hned rampa od stěny o vrstvu níž.
  let dir = -1;   // první vrstva jede doleva
  let fStart = null;
  layers.forEach((L, k) => {
    const end = dir < 0 ? L.a : L.b;
    if (L.follow) {
      // Kde jízda po dně začíná (konec rampy) — na té straně roh u stěny
      // dojede jízda po stěně (N4500: roh X 309–318 zůstal nedojetý).
      fStart = { z: mv[mv.length - 1].z, side: dir < 0 ? 1 : -1 };
      follow(L, fStart.z, end);
    }
    else push(L.X, end);
    const next = layers[k + 1];
    if (next) rampTo(L.X, end, dir, next);
    // (Dno se už nevrací ke druhé stěně — uživatel: „jede doprava a pak zas
    // doleva po stejné hloubce".)
    dir = -dir;
  });

  // `endDir`: kam jela poslední vrstva (ke stěně) — emise po ní odskočí od
  // stěny. `dir` je po smyčce už otočený, poslední vrstva jela −dir.
  const zig = { type: 'zigzag', moves: mv, xSafe: xTop, floorZigzag: true, endDir: -dir };

  // SCHODY NA STĚNÁCH: vrstva u stěny skončí a hned rampou odjede, takže na
  // šikmé stěně zůstanou schody po ap. Po spodku je dojede jedna jízda po
  // hrubovacím offsetu (s přídavkem na hotovo) shora do rohu u dna — vpravo
  // doleva, vlevo doprava; dokončování pak bere jen přídavek (uživatel 1. 11.:
  // „dojet schodky při hrubování s přídavkem na hotovo … napřed ty schodky
  // před hotovní dráhou"). Svislá stěna (čelo) má schody taky — vrstvy od ní
  // odjíždějí rampou, mezi nimi zůstane klín po ap (uživatel 2. 11. 2026:
  // „mělo by to být celé projeté s přídavkem … u přechodu z úseku 1 na úsek 2
  // na pravém čele") — projede se po čele shora dolů do rohu u dna.
  const Lz = layers[layers.length - 1];
  // Nejnižší vrstva cik caku nad místem z — níž jízda po stěně nesmí (kapsa,
  // kterou vrstvy nevybraly, např. zářez V vedle hluboké kapsy: karusel ap 4,8,
  // Ú2 N1960 sjel po stěně do neobrobeného V — 5 kolizí držáku).
  const coverMin = (z) => {
    let m = Infinity;
    for (const L of layers) if (z >= Math.min(L.a, L.b) - 0.5 && z <= Math.max(L.a, L.b) + 0.5 && L.X < m) m = L.follow ? -Infinity : L.X;
    return m === Infinity ? -Infinity : m;
  };
  const wallPass = (side) => {
    // Horní konec stěny o 0,05 mm pod výškou — viz `bTop` (N4510: jízda po
    // stěně jela nejdřív 6 mm svisle, pak teprve po šikmé stěně).
    const zT = side > 0 ? bTop : (wallLeft(xTop - 0.05, L0.a + 0.5, L0.a - reach) ?? L0.a);
    const zB = Lz.follow && fStart && fStart.side === side ? fStart.z : side > 0 ? Lz.b : Lz.a;
    // Pod vrstvou po dně leží dno výš než její nejnižší místo — konec na offsetu.
    const xB = Lz.follow ? Math.min(xTop, fR(zB) + 0.03) : Lz.X;
    if (Math.abs(zT - zB) < 0.5 && xTop - xB > 0.5 && fR(zB + side * 0.3) > xTop - 1e-6) {
      return { type: 'zigzag', moves: [{ g: 'G0', x: xTop, z: zT }, { g: 'G1', x: xB, z: zB }], xSafe: xTop, wallClean: true, endDir: side };
    }
    if (side * (zT - zB) < 0.5) return null;
    const pts = [{ g: 'G0', x: xTop, z: zT }];
    const n = Math.max(2, Math.ceil(Math.abs(zT - zB) / 0.25));
    for (let k = 1; k <= n; k++) {
      const z = zT + (zB - zT) * k / n;
      const x = k === n ? xB : Math.min(xTop, Math.max(xB, fR(z), coverMin(z)));
      const l = pts[pts.length - 1];
      // Body na přímce se slučují (posuv po rovné stěně jedním blokem).
      if (pts.length >= 2) {
        const p0 = pts[pts.length - 2];
        const cr = (l.x - p0.x) * (z - p0.z) - (l.z - p0.z) * (x - p0.x);
        if (Math.abs(cr) < 1e-4 * Math.hypot(z - p0.z, x - p0.x) && l.g === 'G1') { l.x = x; l.z = z; continue; }
      }
      pts.push({ g: 'G1', x, z });
    }
    return { type: 'zigzag', moves: pts, xSafe: xTop, wallClean: true, endDir: side };
  };
  // Jen s „Hrub. bez schodků" (uživatel 2. 11.: „když by bylo zaškrtnuté").
  // Vpravo vrstvy končí na čáře zanoření pod klínem (`underWedge`,
  // zigzagValley.js) — stěna tam není, jízda po ní by jela svisle posuvem.
  const rightWall = !layers.some((L) => L.underWedge);
  const clean = noSteps ? [rightWall ? wallPass(1) : null, wallPass(-1)].filter(Boolean) : [];
  // Vrstvy cik caku pro kapsy pod ním (zigzagValley.js) — neviditelné, aby je
  // nekopírovalo zrcadlo ani emise.
  Object.defineProperty(zig, '_layers', { value: layers, enumerable: false });
  Object.defineProperty(zig, '_xTop', { value: xTop, enumerable: false });
  if (!passes) return [zig, ...clean];
  for (let k = grp.length - 1; k >= 0; k--) passes.splice(grp[k], 1);
  passes.splice(grp[0], 0, zig, ...clean);
  return grp.length;
}

/** Totéž bez nahrazení: vrátí průchody [cik cak, dojetí stěn…] k vložení. */
export function buildZigzag(o) {
  return zigzagFromLayers({ ...o, passes: null, grp: [] });
}

/**
 * Mez dokončování v úseku: spodek cik cak dojel za hranici úseku až ke stěně
 * (výjimka z pravidla 11) — dokončování tam má dojet taky, po pravém čele
 * (uživatel 1. 11.: „na hotovo by to chtělo, aby to jelo po tom pravém čele").
 * Spodek jede středem nosu po hrubovacím offsetu, hotovo leží o přídavek
 * v Z dál (`allowZ`) — přesně na čele; dál ne, čára dna v dokončovací dráze
 * pokračuje až ke kontuře (čelo z ní vypadlo pravidlem 15).
 * Bez spodku cik cak vrací `zHi` beze změny.
 */
export function floorFinishZHi(passes, zHi, allowZ = 0) {
  let z = zHi;
  for (const p of passes || []) {
    if (p && p.floorZigzag) for (const m of p.moves) if (m.z > z) z = m.z;
  }
  return z > zHi ? z + allowZ : zHi;
}

/**
 * Dokončování po pravém čele ke spodku cik cak: čelo (svislá stěna, kam
 * spodek dojel) v dokončovací dráze chybí — strmý pokles k ose vypouští
 * pravidlo 15. Tady se před začátek dráhy vrátí jako svislý úsek od výšky
 * nad hranou čela (kontura + rádius) dolů na dno; kulatá v úzkém držáku
 * po čele sjede (uživatel 1. 11.: „aby to jelo po tom pravém čele").
 * Jen když dráha začíná na čele za hranicí úseku `zHi` (floorFinishZHi).
 */
export function floorFinishFace(path, passes, zHi, contour, tipR) {
  if (!path.length || !(passes || []).some((p) => p && p.floorZigzag)) return path;
  const s0 = path[0];
  if (!s0 || !s0.p1 || s0.p1.z <= zHi + 0.05) return path;
  const zF = s0.p1.z;
  const top = maxXAt(contour, zF + tipR + 0.01);
  if (top === null || top + tipR <= s0.p1.x + 0.5) return path;
  return [{ type: 'line', p1: { x: top + tipR, z: zF }, p2: { x: s0.p1.x, z: zF }, floorFace: true }, { ...s0, chainBreak: false }, ...path.slice(1)];
}

/**
 * Mez pravidla 15 pro dokončování u Cik cak: kulatá destička v úzkém držáku
 * sjede po vyhrubované stěně i svisle (uživatel 1.–2. 11.: „aby to jelo po
 * tom pravém čele", dokončení všech úseků naráz) — strmý kus až po svislé
 * čelo se nevynechá. Jen kde nad celým kusem stojí nanejvýš přídavek: čelo
 * dílu s nevyhrubovaným polotovarem za ním (konec dílu u osy) by se
 * zapichovalo plnou hloubkou — tam platí úhel zanoření. Převis (> 90°)
 * zůstává zakázaný. Ostatní strategie: úhel zanoření beze změny.
 * `contour` — hotový díl: kus čela pod ním (ořízne se v rohu o dno) se
 * nekontroluje. `zigzagWalls` — hrubuje se Cik cak; o druhu operace
 * rozhoduje rozcestník (calculatePipeline `roughingKey`), ne tento modul.
 */
export function zigzagSteepLimit(zigzagWalls, prms, seg, stock, tipR, plungeDeg, contour = null) {
  if (!zigzagWalls || !prms || !getInsert(prms).zigzagPockets) return plungeDeg;
  if (!seg || !Array.isArray(stock) || !stock.length) return plungeDeg;
  const allow = Math.max(parseFloat(prms.allowanceX) || 0, parseFloat(prms.allowanceZ) || 0)
    + (parseFloat(prms.finishAllowance) || 0);
  const N = 24;
  for (let k = 0; k <= N; k++) {
    const t = k / N;
    let x, z;
    if (seg.type === 'line') { x = seg.p1.x + (seg.p2.x - seg.p1.x) * t; z = seg.p1.z + (seg.p2.z - seg.p1.z) * t; }
    else {
      let sA = seg.startAngle, eA = seg.endAngle;
      if (seg.dir === 'G2' && eA > sA) eA -= 2 * Math.PI;
      if (seg.dir === 'G3' && eA < sA) eA += 2 * Math.PI;
      const a = sA + (eA - sA) * t;
      x = seg.cx + Math.sin(a) * seg.r; z = seg.cz + Math.cos(a) * seg.r;
    }
    // Kus pod hotovým dílem (čelo ještě neoříznuté o dno v rohu) se nepočítá.
    const part = contour ? maxXAt(contour, z) : null;
    if (part !== null && x - tipR < part - 0.01) continue;
    const top = maxXAt(stock, z);
    if (top !== null && top > x - tipR + allow + 0.5) return plungeDeg;
  }
  return 90;
}
