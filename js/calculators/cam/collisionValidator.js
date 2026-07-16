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

import { StockModel, toolSweep, polyOffset, polyArea } from '../../geom/geomCore.js';
import { buildStockLoop, toolFootprint } from './materialRemoval.js';

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
  const dir = backside ? -1 : 1;
  return prof.map(p => ({ x: p.z, z: p.x * dir }));
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
  const stockLoop = buildStockLoop(prms, stockPathSegments);
  if (!stockLoop) return issues;

  const tol = opts.tolerance ?? 0.5;
  const shrink = opts.shrink ?? 0.05;
  const maxIssues = opts.maxIssues ?? 12;
  const maxBlocks = opts.maxBlocks ?? 6000;

  const foot = toolFootprint(prms);
  const footShrunk = polyOffset([foot], -shrink)[0] || foot;
  const holderRaw = holderWorldLoop(prms, !!opts.backside);
  const holderShrunk = holderRaw ? (polyOffset([holderRaw], -shrink)[0] || holderRaw) : null;

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
      if (holderShrunk) {
        const area = checkAgainstStock(holderShrunk, pts);
        if (area > tol) {
          issues.push({ lineIdx: block.lineIdx, kind: 'holder', x: pts[0].x, z: pts[0].z, area });
        }
      }
    }
  }
  return issues;
}
