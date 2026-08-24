// ╔══════════════════════════════════════════════════════════════╗
// ║  CAM – validace kolizí destičky a držáku (Fáze 2 migrace     ║
// ║  na Clipper2, viz docs/geometry-libs-migration.md)           ║
// ╚══════════════════════════════════════════════════════════════╝
//
// NEZÁVISLÁ kontrola vygenerovaných drah: projde celý simPath blok po
// bloku (řádek G-kódu), udržuje si zbytkový polotovar (StockModel) a
// kontroluje dvě věci:
//   1. ŘEZNÉ bloky (G1/G2/G3): stopa DRŽÁKU po bloku nesmí protínat
//      zbývající materiál (destička řeže, držák nikdy).
//   2. RYCHLOPOSUVY (G0): stopa destičky ANI držáku nesmí projet
//      materiálem — rychloposuv v záběru = havárie.
// Nic negeneruje ani neupravuje — jen hlásí problémy (⚠ panel). Stará
// logika mezních čar (computeInterferenceGuides) běží dál beze změny;
// tohle je její křížová kontrola, než ji ve Fázi 3 nahradí boolean
// geometrie.
//
// Souřadnice: stejné jako simPath ({x = poloměr, z = axiálně} v mm).
// Broad-phase: volitelně Detect-Collisions (opts.collisions) — rychlé
// AABB/SAT odmítnutí proti PŮVODNÍMU polotovaru; přesný průnik
// (Clipper2) se počítá jen při možném kontaktu. Bez knihovny se použije
// ruční AABB test.

import { StockModel, toolSweep, polyOffset, polyArea, polyDifference, minkowskiSolidSum } from '../../geom/geomCore.js';
import { buildStockLoopRaw, stockPlanLoop, toolFootprint, toolFootprintSlim, toolFootprintVisual } from './materialRemoval.js';

/**
 * Virtuální zvětšení držáku [mm na každou stranu] — o kolik se nafoukne
 * jeho obrys pro VŠECHNA hlídání kolizí i pro plánování drah. 0 (výchozí)
 * = dnešní chování, obrys přesně jak je nakreslený. Viz inflateHolderLoop.
 */
export function holderInflate(prms) {
  const v = parseFloat(prms.holderInflate);
  return Number.isFinite(v) && v > 0 ? v : 0;
}

/**
 * Nafukovat kolem CELÉHO držáku (true), nebo jen K OBROBENÉ STRANĚ (false =
 * výchozí)? Jednostranné je to, o co šlo: mezera vzniká jen tam, kde držák
 * dojíždí k čelu, a u špičky ani před ní se nic nemění.
 */
export function holderInflateAll(prms) {
  return prms.holderInflateAll === true;
}

/**
 * Uzavřený obrys držáku v PROFILOVÝCH souřadnicích ({x,z} vůči
 * referenčnímu bodu destičky, +z = od špičky k držáku) — stejná data
 * jako drawHolderProfileLocal: vlastní obrys (sideA + otočená sideB),
 * jinak obdélník Tloušťka × Délka nad destičkou. Null = držák se nehlídá
 * (holderWidth/holderLength ≤ 0 bez vlastního obrysu).
 */
export function holderProfileLoop(prms) {
  const profile = prms.holderProfile;
  const hasProfile = profile
    && (((profile.sideA || []).length > 1) || ((profile.sideB || []).length > 1));
  let pts;
  if (hasProfile) {
    pts = (profile.sideA || []).concat((profile.sideB || []).slice().reverse());
  } else {
    const hw = Math.max(parseFloat(prms.holderWidth) || 0, 0);
    const l1 = Math.max(parseFloat(prms.holderLength) || 0, 0);
    if (hw <= 0 || l1 <= 0) return null;
    // Stejné umístění jako holderRectProfile v camSimulator.js:
    // spodní hrana nad destičkou (z0 = max(délka hrany, R, 4 mm)).
    const toolLen = Math.max(parseFloat(prms.toolLength) || 10, 1);
    const r = Math.max(parseFloat(prms.toolRadius) || 0.8, 0.1);
    const z0 = Math.max(toolLen, r, 4);
    pts = [
      { x: -hw / 2, z: z0 }, { x: hw / 2, z: z0 },
      { x: hw / 2, z: z0 + l1 }, { x: -hw / 2, z: z0 + l1 },
    ];
  }
  const loop = [];
  for (const p of pts) {
    const l = loop[loop.length - 1];
    if (!l || Math.hypot(l.x - p.x, l.z - p.z) > 1e-6) loop.push({ x: p.x, z: p.z });
  }
  while (loop.length >= 2
    && Math.hypot(loop[0].x - loop[loop.length - 1].x, loop[0].z - loop[loop.length - 1].z) < 1e-6) loop.pop();
  return loop.length >= 3 ? loop : null;
}

/**
 * Obrys držáku ve SVĚTOVÝCH souřadnicích simulace relativně ke špičce:
 * profil {x,z} → svět {x: p.z, z: p.x·dir}. Odpovídá přesně transformaci
 * kreslení v draw() (translate na bod dráhy + zrcadlení strany obrábění):
 * +z profilu (k držáku) = +x světa (radiálně od osy), ±x profilu = ±z
 * světa podle strany hrubování (backside zrcadlí).
 */
export function holderWorldLoop(prms, backside = false) {
  const prof = holderProfileLoop(prms);
  if (!prof) return null;
  const d = holderInflate(prms);
  // KANONICKÝ rám (+z = k obrobené straně) — nafouknutí se musí rozhodovat
  // podle toho, která strana držáku je která, a to jde jen tady. Zrcadlení
  // pro `backside` až nad hotovým obrysem; bez nafouknutí je to bitově táž
  // mapa jako dřív (`x: p.z, z: p.x * dir`).
  let world = prof.map(p => ({ x: p.z, z: p.x }));
  if (d > 0) {
    world = (holderInflateAll(prms)
      ? inflateHolderLoop(world, d)
      : shiftHolderLoopToCutSide(world, d)) || world;
  }
  return backside ? world.map(p => ({ x: p.x, z: -p.z })) : world;
}

/**
 * VIRTUÁLNÍ ZVĚTŠENÍ DRŽÁKU (param `holderInflate`, 0 = vypnuto).
 *
 * Uživatel chtěl větší mezeru mezi držákem a obrobkem při dojezdu na další
 * vrstvu („je to těsně vedle toho čela, co je z pravé strany držáku",
 * 21. 8. 2026). Vůle UVNITŘ algoritmu je slepá ulička — vyzkoušeno obojím
 * směrem a obojí selhalo: jako tvrdé zamítnutí smazala celý krček pod
 * přírubou (−79 mm²), jako preference byla úplný no-op, protože kotva, o
 * kterou jde, je vjezd regionu a hlídáním s vůlí vůbec neprochází.
 *
 * NAFOUKNUTÍ OBRYSU je jiná věc: není to preference, ale reálný geometrický
 * vstup, takže ho VŠECHNA hlídání vezmou konzistentně — `holderFitsAt`,
 * `makeHolderClamp`, `HolderGouge`, `validateToolpath` i mezní čáry čtou
 * tentýž `holderWorldLoop`.
 *
 * DVĚ VĚCI, KTERÉ SE MUSÍ OŠETŘIT:
 *
 * 1. ORIENTACE. Clipper offsetuje VEN jen u kladně orientované smyčky; u
 *    obrácené by `+d` naopak zúžilo. `backside` obrys zrcadlí (dir = −1),
 *    takže se znaménko plochy překlopí. Normalizuje se proto na kladnou a
 *    po offsetu se vrátí PŮVODNÍ orientace — spotřebitelé si smyčku dál
 *    sami zužují (`polyOffset(-0,05)`) a na orientaci jim záleží.
 *
 * 2. DVĚ STRANY SE NAFOUKNOUT NESMÍ (obojí ZMĚŘENO na dílu uživatele):
 *
 *    a) POD ÚROVEŇ HROTU (x < 0). Referenční bod destičky je x = 0; níž už
 *       je jen to, co destička sama řeže. Kdyby tam držák klesl, hlásil by
 *       kolizi na KAŽDÉM běžném řezu — u upichováku leží spodní hrana
 *       držáku přímo na hrotu (profil (0,0)–(2,0)).
 *
 *    b) NA NEOBROBENOU STRANU (z pod původním minimem). Tam se kolize
 *       NEDÁ vyřešit zkrácením průchodu — materiál stojí po celé délce
 *       řezu nezávisle na hloubce — a `makeHolderClamp` ji proto vědomě
 *       nemodeluje (viz jeho hlavička v toolEnvelope.js). Nafouknutí o
 *       1 mm na tu stranu z toho udělalo katastrofu: ⛔ 0 → 12 a úběr
 *       4381 → 10310 mm², protože průchody u osy přestaly končit na čele
 *       (Z 346,9) a projely celý díl až na Z −9. Ruční kontrola oddělila
 *       příčinu: samotná tloušťka 20 → 21 mm dá úběr 4380,8 (beze změny),
 *       tatáž tloušťka i s přesahem na z = −1 dá 10310,9.
 *
 *    Zbývá tedy růst K OBROBENÉ STRANĚ (o to jde — mezera vedle čela) a
 *    nahoru do délky (neškodné). U nože, jehož držák začíná až nad
 *    destičkou, se sníží i spodek — tam je na to místo.
 */
function inflateHolderLoop(loop, d) {
  const flip = polyArea([loop]) < 0;
  const src = flip ? loop.slice().reverse() : loop;
  let parts;
  try { parts = polyOffset([src], d, 'miter'); } catch { return null; }
  if (!parts || !parts.length) return null;
  let best = null, bestA = -Infinity;
  for (const l of parts) {
    const a = Math.abs(polyArea([l]));
    if (a > bestA) { best = l; bestA = a; }
  }
  if (!best) return null;
  const floorX = Math.min(0, ...loop.map(p => p.x));
  const floorZ = Math.min(...loop.map(p => p.z));
  const out = [];
  for (const p of best) {
    const q = { x: Math.max(p.x, floorX), z: Math.max(p.z, floorZ) };
    const l = out[out.length - 1];
    if (!l || Math.hypot(l.x - q.x, l.z - q.z) > 1e-9) out.push(q);
  }
  while (out.length >= 2
    && Math.hypot(out[0].x - out[out.length - 1].x, out[0].z - out[out.length - 1].z) < 1e-9) out.pop();
  if (out.length < 3) return null;
  return flip ? out.reverse() : out;
}

/**
 * JEDNOSTRANNÉ nafouknutí — VÝCHOZÍ režim, a to, o co uživateli šlo
 * (23. 8. 2026: *„nejčastěji se to bude používat jenom aby to nenarazilo do
 * čela … kdyby tam byla házivost nebo otřep"*).
 *
 * Držák se posune JEN k obrobené straně: obrys se zamete o `d` ve směru +z
 * (Minkowského suma s úsečkou), takže spodní šikmá hrana se pod SVÝM úhlem
 * prodlouží o `d` a boční čelo se o `d` odsune. Špička, čelní strana (z = 0)
 * i délka držáku zůstávají PŘESNĚ na svém.
 *
 * Proč to není jen hezčí varianta „vše": přídavek u ŠPIČKY a PŘED ní reálně
 * PŘEKÁŽÍ. Když držák na destičku navazuje bez mezery, nafouknutí kolem
 * dokola by mu zakázalo zajet níž než destička — a upichovat by pak nešlo
 * vůbec, protože hlídání by tam „vidělo držák" (rozbor uživatele tamtéž).
 *
 * ZRCADLENÍ JE ZDARMA: rám je kanonický (+z = obrobená strana), takže
 * `backside` (hrubování zleva) překlopí i tenhle přídavek — ověřeno na
 * `part-11-zleva-casting` a `part-13-zleva-flange`.
 */
function shiftHolderLoopToCutSide(loop, d) {
  let parts;
  try { parts = minkowskiSolidSum(loop, [{ x: 0, z: 0 }, { x: 0, z: d }]); } catch { return null; }
  if (!parts || !parts.length) return null;
  let best = null, bestA = -Infinity;
  for (const l of parts) {
    const a = Math.abs(polyArea([l]));
    if (a > bestA) { best = l; bestA = a; }
  }
  if (!best || best.length < 3) return null;
  // Zametení nechá na obrysu nulové hrany (dvakrát tentýž vrchol) — samo o
  // sobě neškodí, ale scany typu holderBottomProfile pak počítají segmenty
  // délky 0. Sousední duplicity pryč, zbytek se nesahá.
  const clean = [];
  for (const q of best) {
    const l = clean[clean.length - 1];
    if (!l || Math.hypot(l.x - q.x, l.z - q.z) > 1e-9) clean.push(q);
  }
  while (clean.length >= 2
    && Math.hypot(clean[0].x - clean[clean.length - 1].x, clean[0].z - clean[clean.length - 1].z) < 1e-9) clean.pop();
  if (clean.length < 3) return null;
  // minkowskiSolidSum sjednocuje na KLADNOU plochu; spotřebitelé si obrys
  // dál zužují `polyOffset(-0,05)`, takže na orientaci jim záleží.
  return (polyArea([loop]) < 0) === (polyArea([clean]) < 0) ? clean : clean.slice().reverse();
}

// AABB pomocníci (ruční broad-phase fallback)
function bboxOf(loops) {
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const loop of loops) for (const p of loop) {
    if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
    if (p.z < minZ) minZ = p.z; if (p.z > maxZ) maxZ = p.z;
  }
  return { minX, maxX, minZ, maxZ };
}
function bboxOverlap(a, b) {
  return a.minX <= b.maxX && a.maxX >= b.minX && a.minZ <= b.maxZ && a.maxZ >= b.minZ;
}

/**
 * Broad-phase filtr proti PŮVODNÍMU polotovaru. S Detect-Collisions
 * (module z ensureCollisions()) staví SAT System, jinak ruční AABB.
 * Vrací { mayHit(loops) } — false = kontakt vyloučen, přesný průnik
 * netřeba počítat.
 */
function makeBroadPhase(collisions, stockLoop) {
  const stockBox = bboxOf([stockLoop]);
  if (collisions && collisions.System && collisions.Polygon) {
    try {
      const system = new collisions.System();
      system.insert(new collisions.Polygon({ x: 0, y: 0 },
        stockLoop.map(p => ({ x: p.z, y: p.x }))));
      return {
        mayHit(loops) {
          if (!bboxOverlap(bboxOf(loops), stockBox)) return false;
          for (const loop of loops) {
            if (loop.length < 3) continue;
            const body = new collisions.Polygon({ x: 0, y: 0 },
              loop.map(p => ({ x: p.z, y: p.x })));
            system.insert(body);
            let hit = false;
            system.checkOne(body, () => { hit = true; return true; });
            system.remove(body);
            if (hit) return true;
          }
          return false;
        },
      };
    } catch (_) { /* fallback na AABB níž */ }
  }
  return { mayHit: (loops) => bboxOverlap(bboxOf(loops), stockBox) };
}

/**
 * Zvaliduje celý simPath. Vrací pole problémů:
 *   { lineIdx, kind: 'holder'|'rapid', x, z, area }
 * lineIdx = originalLineIdx bloku (index řádku v manualGCode), x/z = bod
 * začátku bloku, area = plocha průniku [mm²].
 *
 * opts: backside (zrcadlení držáku), tolerance [mm², default 0.5],
 * shrink [mm, default 0.05 — zmenšení obrysů proti falešným dotykům],
 * maxIssues (default 12), maxBlocks (default 6000),
 * collisions (modul Detect-Collisions pro broad-phase, jinak AABB).
 */
export function validateToolpath(simPath, prms, stockPathSegments, opts = {}) {
  const issues = [];
  if (!simPath || simPath.length < 2) return issues;
  // POLOTOVAR KONČÍ AŽ NA OFFSETOVÉ ČÁŘE. Přídavek X/Z (polo.) je v zadání
  // právě proto, že odlitek MŮŽE být větší — materiál až k té čáře tedy reálně
  // existovat může, a náraz do něj je náraz (rozhodnutí uživatele 20. 8. 2026:
  // „obrobek je celý i s tou offsetovou čarou… mělo by to tak být i dělané“).
  // Dráhy se proti té čáře už plánují (`planLoopRef` v gcodeEmit) a náhled ji
  // vybarvuje — validátor je poslední, kdo měřil jen syrový obrys.
  // `opts.planStock` — kde končí polotovar:
  //   true  = na OFFSETOVÉ ČÁŘE. Přídavek X/Z (polo.) je v zadání právě proto,
  //     že odlitek MŮŽE být větší, takže náraz do té zóny je náraz. Tohle vidí
  //     uživatel v ⛔ panelu (rozhodnutí 20. 8. 2026).
  //   false (výchozní) = NAKRESLENÁ silueta, tedy „naražil jsem fyzicky do toho,
  //     co je nakreslené?“. Na tom stojí tvrdý plošný invariant
  //     `tests/cam-collision-free` (žádná fixture, žádná kolize) a dráhy jsou na
  //     něj odladěné. Rozdíl mezi těmi dvěma standardy JE seznam práce.
  const stockLoop = opts.planStock
    ? stockPlanLoop(prms, stockPathSegments)
    : buildStockLoopRaw(prms, stockPathSegments);
  if (!stockLoop) return issues;

  const tol = opts.tolerance ?? 0.5;
  const shrink = opts.shrink ?? 0.05;
  const maxIssues = opts.maxIssues ?? 12;
  const maxBlocks = opts.maxBlocks ?? 6000;

  // PLNÝ obrys odebírá materiál, ZÚŽENÝ testuje dotyk — táž dělba jako
  // v emisi (viz toolFootprintSlim v materialRemoval.js).
  const foot = toolFootprint(prms);
  const footShrunk = toolFootprintSlim(prms, shrink);
  const holderRaw = holderWorldLoop(prms, !!opts.backside);
  const holderShrunk = holderRaw ? (polyOffset([holderRaw], -shrink)[0] || holderRaw) : null;
  // PROSTOR DESTIČKY NENÍ PROSTOR DRŽÁKU. Obrys držáku začíná ve ŠPIČCE
  // (holderWorldLoop), takže se u hrotu překrývá s destičkou — u nože
  // uživatele v pásu Z 0–4,2 × X 0–15 mm. Materiál, který tam je, ale
  // ŘEŽE DESTIČKA; hlásit ho jako náraz držáku je falešný poplach
  // (nález uživatele 21. 8. 2026: „vidím tam kolizi červenou, ale ten
  // držák je za plátkem"). Na jeho dílu to dělalo polovinu zbylých
  // nálezů proti offsetové čáře (9,1 → 4,9 mm²).
  //
  // Odečítá se `toolFootprintVisual` — TÝŽ obrys, jaký simulátor KRESLÍ.
  // Se samotným `insertWorldLoop` zůstal u špičky výřez ve tvaru rohového
  // rádiusu destičky (r 0,8): mezi obloukem a hranou tělesa je 3,3 mm²,
  // které do obrysu nepatří, ale uvnitř nakresleného plátku leží — a přesně
  // ty se pak vybarvily červeně uvnitř destičky (nález uživatele: „vidím
  // výřez, jako bych udělal kružnici toho radiusu").
  //
  // PLATÍ JEN PRO ŘEZNÉ BLOKY. Při RYCHLOPOSUVU nemá v materiálu co dělat
  // ani tělo destičky, a dnes to hlídá právě ta překrývající se část
  // (stopa `toolFootprint` je jen tenký řezný profil, X −0,8…6 × Z −0,8…0,8,
  // tělo destičky sahá na X 15 × Z 4,2). Odečíst ji plošně by tam udělalo
  // slepé místo, takže u G0 se dál bere držák CELÝ.
  const insLoop = holderRaw ? toolFootprintVisual(prms) : null;
  let holderCut = holderRaw;
  if (holderRaw && insLoop && insLoop.length >= 3) {
    try { holderCut = polyDifference([holderRaw], [insLoop])[0] || holderRaw; } catch { holderCut = holderRaw; }
  }
  const holderCutShrunk = holderCut ? (polyOffset([holderCut], -shrink)[0] || holderCut) : null;

  const stock = new StockModel([stockLoop]);
  const broad = makeBroadPhase(opts.collisions, stockLoop);

  // Bloky = po sobě jdoucí body simPath se stejným řádkem G-kódu a typem
  const blocks = [];
  let cur = null;
  for (let i = 1; i < simPath.length; i++) {
    const p = simPath[i];
    const li = p.originalLineIdx ?? (cur ? cur.lineIdx : null);
    const type = p.type || 'G0';
    if (!cur || li !== cur.lineIdx || type !== cur.type) {
      cur = { lineIdx: li, type, pts: [simPath[i - 1], p] };
      blocks.push(cur);
    } else {
      cur.pts.push(p);
    }
  }

  const dedupe = (pts) => {
    const out = [];
    for (const p of pts) {
      const l = out[out.length - 1];
      if (!l || Math.hypot(p.x - l.x, p.z - l.z) > 1e-9) out.push({ x: p.x, z: p.z });
    }
    return out;
  };

  const checkAgainstStock = (bodyLoop, pts) => {
    const sweep = toolSweep(bodyLoop, pts);
    if (sweep.length === 0 || !broad.mayHit(sweep)) return 0;
    return Math.abs(polyArea(stock.collide(sweep)));
  };

  let n = 0;
  for (const block of blocks) {
    if (++n > maxBlocks || issues.length >= maxIssues) break;
    const pts = dedupe(block.pts);
    if (pts.length < 2) continue;

    if (block.type === 'G0') {
      // Rychloposuv: destička ani držák nesmí projet materiálem
      let area = checkAgainstStock(footShrunk, pts);
      if (area <= tol && holderShrunk) area = Math.max(area, checkAgainstStock(holderShrunk, pts));
      if (area > tol) {
        issues.push({ lineIdx: block.lineIdx, kind: 'rapid', x: pts[0].x, z: pts[0].z, area });
      }
    } else {
      // Řezný blok: nejdřív odebrat materiál stopou destičky…
      const cut = toolSweep(foot, pts);
      if (cut.length > 0 && broad.mayHit(cut)) stock.cut(cut);
      // …pak zkontrolovat, že držák nejede ve zbývajícím materiálu
      if (holderCutShrunk) {
        const area = checkAgainstStock(holderCutShrunk, pts);
        if (area > tol) {
          issues.push({ lineIdx: block.lineIdx, kind: 'holder', x: pts[0].x, z: pts[0].z, area });
        }
      }
    }
  }
  return issues;
}
