// ╔════════════════════════════════════════════════════════════╗
// ║  JEDNODUCHÉ PODÉLNÉ HRUBOVÁNÍ — soustružnický cyklus po vrstvách  ║
// ╚════════════════════════════════════════════════════════════╝
//
// Nový generátor z 23. 9. 2026 (docs/cam-novy-generator.md). Uživatel:
// *„chci jednoduché generování drah v ISO kódu, kdy dráhy budou dobře…
// tak jak to dělají jiné programy"*. Starý `roughLong.js` (+ 20 modulů
// v `ops/long/`) zůstává jako „původní" generátor v přepínači.
//
// CELÝ ALGORITMUS (jako Sinumerik CYCLE95 / Fanuc G71):
//
//  1. Všechno se počítá v souřadnicích STŘEDU nástroje (programovaného bodu).
//     F(z) = kam nejníž smí střed = offsetová dráha (`offsetXAt`; u kulaté
//            už obsahuje R, u polygonu hlídání hrotu). Pod F je díl.
//     S(z) = kde střed poprvé sáhne na materiál = offsetová čára polotovaru
//            zvednutá o nos (kružnice R kolem středu, u polygonu R = 0).
//     Materiál k odebrání v řezu Z je pás F(z) < X < S(z).
//  2. Vrstvy po Hloubce (ap) od vrcholu S dolů.
//  3. Na vrstvě X je VOLNÝ ÚSEK každé souvislé Z, kde F ≤ X (nástroj tam
//     nepodřízne díl). Volné úseky hlubší vrstvy leží vždy uvnitř úseků
//     mělčí vrstvy → tvoří STROM.
//  4. Pořadí = průchod stromem do hloubky: úsek, pak jeho děti zprava
//     doleva, každé dítě CELÉ (až na dno), než se jde na další. Nad hrbem
//     je úsek jeden → vrstva jede vcelku; pod hrbem se rozpadne → nejdřív
//     celá pravá strana, pak levá (pravidlo uživatele §6.0). Žádné umělé
//     hranice, žádné heuristiky.
//  5. Vjezd do úseku: zprava ze vzduchu, nebo — když úsek zprava hlídá
//     stěna dílu (kapsa za hrbem) — z vrstvy nad ním po obálce
//     max(stěna, rampa pod úhlem zanoření). Bez „Zanořování" se kapsa
//     vynechá.
//  6. Konec u stěny: dojezd po stěně nahoru k předchozí vrstvě (žádné schody).
//
// Přejezdy, odskoky, rychloposuvy a G-kód dělá beze změny stávající emise
// (`roughEmit.js`) — průchody mají týž tvar jako ze starého generátoru.

import { getInsert } from '../inserts/index.js';
import { getEffectivePlungeAngle, topXOnLoop } from '../camMath.js';
import { buildStockLoopRaw, offsetStockLoop } from '../materialRemoval.js';
import { holderWorldLoop } from '../collisionValidator.js';
import { insertReachZ } from '../toolEnvelope.js';

const DZ = 0.05;           // krok vzorkování v Z (mm)
const EPS = 1e-6;
const HOLDER_GAP = 0.5;     // vůle držáku nad povrchem dílu (mm)

export function genSimpleLongPasses(ctx) {
  const { prms, passes, offsetXAt, traceOffsetPath, stockPathSegments, machiningRange, foundErrors } = ctx;
  const ap = Math.max(parseFloat(prms.depthOfCut) || 0, 0.05);
  const ins = getInsert(prms);
  const R = Math.max(ins.noseLiftX || 0, 0);
  const bothWays = !!ins.rampBothWays;
  // Dosah TĚLA destičky od hrotu k +Z. U kulaté je celý nos v S/F (0),
  // u polygonu tělo sahá doprava od hrotu a do trojúhelníku u stěny by
  // zasáhlo, i když hrot stojí správně.
  const bodyReachZ = ins.footprintIsNoseOnly ? 0 : Math.max(0, insertReachZ(prms, false) || 0);
  const tanP = Math.tan(Math.min(89.5, Math.max(0.5, getEffectivePlungeAngle(prms))) * Math.PI / 180);

  // ── 1. Polotovar (offsetová čára s vůlí) a jeho rozsah v Z ──────────────
  const stockLoop = offsetStockLoop(buildStockLoopRaw(prms, stockPathSegments), prms);
  if (!stockLoop || stockLoop.length < 3) return;
  let zMin = Infinity, zMax = -Infinity;
  for (const p of stockLoop) { if (p.z < zMin) zMin = p.z; if (p.z > zMax) zMax = p.z; }
  // Nos sahá o R dál než střed; za koncem polotovaru je navíc místo na
  // jednu rampu, aby se vrstvy u čela vešly (čelisti/koník ořízne pipeline).
  const runOut = R + ap / tanP + 1;
  zMin -= runOut; zMax += R;
  if (machiningRange) { zMin = Math.max(zMin, machiningRange.zLo); zMax = Math.min(zMax, machiningRange.zHi); }
  if (!(zMax > zMin + DZ)) return;

  // ── Vzorkování F(z) a S(z) ───────────────────────────────────────────────
  const N = Math.ceil((zMax - zMin) / DZ) + 1;
  const zAt = (i) => zMax - i * DZ;              // index 0 = pravý konec (vysoké Z)
  const Fraw = (z) => { const x = offsetXAt(z); return x === null ? 0 : Math.max(x, 0); };
  const F = new Float64Array(N);
  const Ssurf = new Float64Array(N);
  for (let i = 0; i < N; i++) {
    F[i] = Fraw(zAt(i));
    const t = topXOnLoop(stockLoop, zAt(i));
    Ssurf[i] = t === null ? -Infinity : t;
  }
  // ── DRŽÁK NAD DÍLEM ─────────────────────────────────────────────────────
  // Hrot smí jen tam, kde se zároveň vejde držák: jeho spodní hrana v
  // odstupu dz od hrotu (holderWorldLoop, +Z = k obrobené straně) musí ležet
  // nad POVRCHEM dílu (F − R) s vůlí HOLDER_GAP. Promítne se to rovnou do
  // podlahy F, takže řez, nájezd i dojezd se tam nedostanou. Proti zbytku
  // POLOTOVARU se kontrolovat nemusí: pořadí (nejdřív celá pravá strana)
  // zajistí, že vpravo nad držákem materiál už nestojí.
  const hLoop = holderWorldLoop(prms, false);
  const bot = [];                                    // spodní hrana držáku po DZ
  let hOff = 0;                                      // první dz držáku (index)
  if (hLoop && hLoop.length >= 3) {
    let hz0 = Infinity, hz1 = -Infinity;
    for (const p of hLoop) { if (p.z < hz0) hz0 = p.z; if (p.z > hz1) hz1 = p.z; }
    hOff = Math.round(Math.max(hz0, 0) / DZ);
    for (let dz = Math.max(hz0, 0); dz <= hz1 + 1e-9; dz += DZ) {
      let b = Infinity;
      for (let q = 0; q < hLoop.length; q++) {
        const a = hLoop[q], c = hLoop[(q + 1) % hLoop.length];
        if ((a.z <= dz && c.z >= dz) || (c.z <= dz && a.z >= dz)) {
          const x = Math.abs(c.z - a.z) < 1e-9 ? Math.min(a.x, c.x) : a.x + (c.x - a.x) * (dz - a.z) / (c.z - a.z);
          if (x < b) b = x;
        }
      }
      bot.push(b);
    }
    const F0 = F.slice();
    for (let i = 0; i < N; i++) {
      let need = F0[i];
      for (let j = 0; j < bot.length; j++) {
        const ii = i - hOff - j;                                       // +Z = menší index
        if (ii < 0) break;
        if (!Number.isFinite(bot[j])) continue;
        const v = (F0[ii] - R) - bot[j] + HOLDER_GAP;
        if (v > need) need = v;
      }
      F[i] = need;
    }
  }
  // S = obálka kružnic R kolem povrchu polotovaru (kde se STŘED poprvé dotkne).
  const S = new Float64Array(N);
  const k = Math.round(R / DZ);
  for (let i = 0; i < N; i++) {
    let m = Ssurf[i] + R;
    for (let j = Math.max(0, i - k); j <= Math.min(N - 1, i + k); j++) {
      if (!Number.isFinite(Ssurf[j])) continue;
      const d = Math.abs(j - i) * DZ;
      const v = Ssurf[j] + Math.sqrt(Math.max(R * R - d * d, 0));
      if (v > m) m = v;
    }
    S[i] = m;
  }
  let top = -Infinity;
  for (let i = 0; i < N; i++) if (S[i] > F[i] && S[i] > top) top = S[i];
  if (!Number.isFinite(top)) return;

  // Přesná poloha, kde F protne hloubku X mezi dvěma vzorky (půlení).
  // Kde podlahu zvedá držák, není F(z) spojitá funkce offsetu — tam se
  // interpoluje mezi vzorky (krok 0,05 mm).
  const crossZ = (iFree, iWall, X) => {
    let zf = zAt(iFree), zw = zAt(iWall);
    if (F[iWall] > Fraw(zw) + 1e-6 || F[iFree] > Fraw(zf) + 1e-6) {
      const t = Math.abs(F[iWall] - F[iFree]) < 1e-9 ? 0 : (X - F[iFree]) / (F[iWall] - F[iFree]);
      return zf + Math.min(1, Math.max(0, t)) * (zw - zf) * 0.999;
    }
    for (let n = 0; n < 30; n++) {
      const zm = (zf + zw) / 2;
      if (Fraw(zm) <= X + EPS) zf = zm; else zw = zm;
    }
    return zf;
  };

  // ── 2.–3. Vrstvy a volné úseky (uzly stromu) ─────────────────────────────
  const depths = [];
  for (let X = top - ap; X > -EPS; X -= ap) depths.push(Math.max(X, 0));
  // Uzel: { X, lvl, iR, iL (indexy, iR < iL), wallR, wallL, zR, zL, kids }
  const levels = depths.map((X, lvl) => {
    const runs = [];
    let i = 0;
    while (i < N) {
      if (F[i] > X + EPS) { i++; continue; }
      const iR = i;
      while (i < N && F[i] <= X + EPS) i++;
      const iL = i - 1;
      const wallR = iR > 0, wallL = iL < N - 1;
      runs.push({
        X, lvl, iR, iL, wallR, wallL, kids: [],
        zR: wallR ? crossZ(iR, iR - 1, X) : zAt(iR),
        zL: wallL ? crossZ(iL, iL + 1, X) : zAt(iL),
      });
    }
    return runs;
  });
  for (let lvl = 1; lvl < levels.length; lvl++) {
    for (const c of levels[lvl]) {
      const p = levels[lvl - 1].find(q => q.iR <= c.iR && q.iL >= c.iL);
      if (p) p.kids.push(c);
    }
  }
  for (const lv of levels) for (const n of lv) n.kids.sort((a, b) => a.iR - b.iR); // zprava doleva

  // ── 5. Vjezd do kapsy: obálka max(stěna F, rampa) z vrstvy nad ────────────
  // Rampa začíná tam, kde stěna vpravo od úseku dosahuje vrstvy nad (Xup).
  const pocketEntry = (node, Xup, zCutUp) => {
    // Vpravo od úseku stoupá stěna. Rampa začíná na NEJBLIŽŠÍM místě, kde
    // stěna buď dosáhne vrstvy nad (Xup), nebo přestane stoupat (roh
    // plošiny hrbu) — nikdy ne uprostřed plošiny ani za hrbem.
    let iw = node.iR - 1;
    while (iw > 0 && F[iw] < Xup - EPS && F[iw - 1] > F[iw] + 1e-4) iw--;
    let zw = F[iw] >= Xup - EPS ? crossZ(iw + 1, iw, Xup) : zAt(iw);
    // VNOŘENÉ KAPSY: vrstva nad touto začala tělo až tam, kde dosedla její
    // rampa (`zCutUp`); mezi tím a stěnou zůstal trojúhelník materiálu
    // (mez úhlu zanoření). Rampa se proto spouští nejdál odtud, jinak by
    // najela do toho trojúhelníku kolmo.
    if (Number.isFinite(zCutUp) && zCutUp - bodyReachZ < zw) zw = zCutUp - bodyReachZ;
    // CIK-CAK RAMPA. Sjíždí se pod úhlem zanoření doleva; když kapsa
    // skončí dřív, než nástroj dosáhne hloubky, pokračuje se šikmo zpátky
    // doprava — ale jen do místa, kde vrstva nad skutečně řezala (`zw`),
    // takže se nikdy nenajíždí pod stojící materiál. Každý tah ubere nejvýš
    // to, o co klesne, tedy ≤ ap. Nástroj přitom nikdy nejde pod stěnu F.
    const iRight = Math.max(0, Math.min(N - 1, Math.round((zMax - zw) / DZ)));
    const iLeft = node.iL;
    if (iLeft - iRight < 2) return null;
    // Zpětný tah ubírá klín mezi sebou a předchozím tahem — až DVOJNÁSOBEK
    // sestupu jednoho tahu. Nevejde-li se hloubka do jednoho tahu, klesá se
    // proto nejvýš o ap/2 na tah, aby klín nepřesáhl ap.
    const legLen = (iLeft - iRight) * DZ;
    const tanZ = (!bothWays || legLen * tanP >= (Xup - node.X) - EPS) ? tanP : Math.min(tanP, ap / (2 * legLen));
    const pts = [{ x: Xup, z: zw }];
    let x = Xup, i = iRight, dir = +1, legs = 0;
    while (legs < 60) {
      const ni = i + dir;
      if (ni > iLeft || ni < iRight) {
        // Jednosměrný plátek: jen jedna rampa. Nevejde-li se do hloubky,
        // sjede se aspoň tak hluboko, jak kapsa dovolí (NEÚPLNÁ rampa —
        // táž volba jako u původního generátoru); pod ní se pak nic
        // dalšího nezanořuje.
        if (!bothWays) { if (pts.length > 1) { const segs = simplify(pts); segs.partial = true; return segs; } return null; }
        dir = -dir; legs++; continue;
      }
      const nx = Math.max(F[ni], x - DZ * tanZ);
      if (nx <= node.X + EPS) { pts.push({ x: node.X, z: zAt(ni) }); return simplify(pts); }
      if (F[ni] > x + EPS && nx > x + EPS) {       // stěna v cestě
        if (!bothWays) { if (pts.length > 1) { const segs = simplify(pts); segs.partial = true; return segs; } return null; }
        dir = -dir; legs++; continue;
      }
      if ((dir > 0 && ni === iLeft) || (dir < 0 && ni === iRight)) pts.push({ x: nx, z: zAt(ni) });
      else if (pts.length && Math.abs(pts[pts.length - 1].x - nx) > 1e-9) pts.push({ x: nx, z: zAt(ni) });
      x = nx; i = ni;
    }
    return null;
  };

  // ── 6. Dojezd po stěně nahoru k předchozí vrstvě ─────────────────────────
  // Od konce řezu vlevo stoupá stěna; jede se po ní, dokud nedosáhne vrstvy
  // nad (tam je materiál už pryč), nebo dokud stěna nepřestane stoupat.
  const stairLeadOut = (node, Xup) => {
    if (!Number.isFinite(Xup)) return null;
    let i = node.iL + 1, prev = F[node.iL];
    while (i < N && F[i] < Xup - EPS && F[i] >= prev - 1e-4) { prev = F[i]; i++; }
    const zTop = i >= N ? zAt(N - 1) : (F[i] >= Xup - EPS ? crossZ(i - 1, i, Xup) : zAt(i - 1));
    if (!(node.zL - zTop > DZ)) return null;
    const segs = traceOffsetPath(node.zL, zTop);
    while (segs.length && Math.max(segs[0].x1, segs[0].x2) <= node.X + 0.02) segs.shift();
    return segs.length ? segs : null;
  };

  // ── Materiál na vrstvě uvnitř úseku (odkud kam je co řezat) ──────────────
  const materialSpan = (node) => {
    let a = -1, b = -1;
    for (let i = node.iR; i <= node.iL; i++) {
      if (S[i] > node.X + 1e-3) { if (a < 0) a = i; b = i; }
    }
    return a < 0 ? null : { a, b };
  };

  let pocketSkips = 0, skippedSubtrees = 0, partialRamps = 0, holderSkips = 0;
  // ── ZBYTEK MATERIÁLU (1D: v každém řezu Z výška, kam materiál sahá) ─────
  // Na začátku polotovar (offsetová čára, POVRCH), každý vydaný průchod ho
  // sníží o stopu nosu (kružnice R kolem dráhy; u polygonu hrot). Držák
  // dalšího průchodu se kontroluje proti TOMUHLE zbytku v pořadí obrábění —
  // klín u stěny, který rampa pod úhlem zanoření nedosáhne, v něm zůstane.
  const Rtop = Ssurf.slice();
  const idxOf = (z) => Math.max(0, Math.min(N - 1, Math.round((zMax - z) / DZ)));
  const kR = Math.max(0, Math.ceil(R / DZ));
  const lowerAt = (x, z) => {                        // stopa nosu v bodě dráhy
    const i0 = idxOf(z);
    for (let i = Math.max(0, i0 - kR); i <= Math.min(N - 1, i0 + kR); i++) {
      const d = Math.abs(zAt(i) - z);
      if (d > R + DZ / 2) continue;
      const low = x - Math.sqrt(Math.max(R * R - d * d, 0));
      if (low < Rtop[i]) Rtop[i] = low;
    }
  };
  const segPoints = (segs, out) => {
    for (const sg of segs || []) {
      const n = Math.max(1, Math.ceil(Math.hypot(sg.x2 - sg.x1, sg.z2 - sg.z1) / DZ));
      for (let q = 0; q <= n; q++) out.push({ x: sg.x1 + (sg.x2 - sg.x1) * q / n, z: sg.z1 + (sg.z2 - sg.z1) * q / n });
    }
    return out;
  };
  const passPoints = (pass) => {
    const pts = segPoints(pass.contourLeadIn, []);
    for (let z = pass.zStart; z >= pass.zEnd - 1e-9; z -= DZ) pts.push({ x: pass.x, z });
    pts.push({ x: pass.x, z: pass.zEnd });
    return pts;
  };
  const cutPass = (pass) => {
    for (const p of passPoints(pass)) lowerAt(p.x, p.z);
    for (const p of segPoints(pass.contourLeadOut, [])) lowerAt(p.x, p.z);
  };
  const holderHitsLeft = (x, z) => {
    if (!bot.length) return false;
    const i = idxOf(z);
    for (let j = 0; j < bot.length; j++) {
      const ii = i - hOff - j;
      if (ii < 0) break;
      if (Rtop[ii] > x + bot[j] - HOLDER_GAP) return true;
    }
    return false;
  };
  // Držák se kontroluje po cestě průchodu; zbytek se přitom snižuje
  // průběžně — co hrot na začátku průchodu vyřízne, držáku dál nepřekáží.
  const passHitsHolder = (pass) => {
    const save = Rtop.slice();
    let hit = false;
    for (const p of passPoints(pass)) {
      lowerAt(p.x, p.z);
      if (holderHitsLeft(p.x, p.z)) { hit = true; break; }
    }
    Rtop.set(save);
    return hit;
  };

  const emit = (node, Xup, zCutUp) => {
    // `zCutHere`: nejpravější místo, odkud smí začít rampa hlubší vrstvy.
    // Rampa nechává u stěny trojúhelník (mez úhlu zanoření) a ten tam stojí
    // i pro všechny vrstvy pod ní — omezení se proto DĚDÍ, dokud ho vlastní
    // rampa neposune ještě víc doleva.
    let zCutHere = zCutUp, emitted = false;
    const span = materialSpan(node);
    if (span) {
      const toWallR = node.wallR && span.a === node.iR;
      const toWallL = node.wallL && span.b === node.iL;
      const zStart = toWallR ? node.zR : Math.min(zAt(span.a) + DZ, node.zR);
      const zEnd = toWallL ? node.zL : Math.max(zAt(span.b) - DZ, node.zL);
      const pass = { type: 'long', x: node.X, zStart, zEnd, blocked: toWallL };
      let ok = true;
      if (toWallR) {
        // Zprava stěna → kapsa. Vjíždí se z vrstvy nad ní.
        const li = prms.plungeRoughing && Number.isFinite(Xup) ? pocketEntry(node, Xup, zCutUp) : null;
        const zLand = li && li.length ? li[li.length - 1].z2 : NaN;
        if (li && li.partial) {
          // Neúplná rampa: jen sjezd, bez těla; hlubší vrstvy pod ní ne.
          const last = li[li.length - 1];
          const pr = { type: 'long', x: last.x2, zStart: last.z2, zEnd: last.z2, blocked: true, contourLeadIn: li };
          if (!passHitsHolder(pr)) {
            passes.push(pr);
            cutPass(pr);
            partialRamps++;
          }
          ok = false;
        } else if (li && li.length && zLand <= node.zR + DZ) {
          pass.contourLeadIn = li;
          pass.zStart = zLand;
        } else if (!(li && li.partial)) { ok = false; pocketSkips++; }
      }
      if (ok && passHitsHolder(pass)) { ok = false; holderSkips++; }
      if (ok && pass.zStart - pass.zEnd > DZ) {
        if (toWallL && prms.noStepRoughing) {
          const lo = stairLeadOut(node, Xup);
          if (lo) pass.contourLeadOut = lo;
        }
        passes.push(pass);
        cutPass(pass);
        emitted = true;
        if (pass.contourLeadIn) {
          zCutHere = Number.isFinite(zCutUp) ? Math.min(zCutUp, pass.zStart) : pass.zStart;
        }
      }
    }
    // Vrstva s materiálem, která se vynechat MUSELA: hlubší vrstvy by
    // najely do materiálu, který nad nimi zůstal stát → vynechat i je.
    if (span && !emitted) { skippedSubtrees++; return; }
    for (const c of node.kids) emit(c, node.X, zCutHere);
  };
  for (const root of (levels[0] || [])) emit(root, top, NaN);
  if (holderSkips > 0) {
    foundErrors.push({ type: 'warning', msg: `Hrubování: ${holderSkips} × průchod vynechán — držák by narazil do materiálu, který zůstal u stěny (mez úhlu zanoření).` });
  }
  if (skippedSubtrees > 0) {
    foundErrors.push({ type: 'warning', msg: `Hrubování: ${skippedSubtrees} × zbytek pod nedosažitelnou vrstvou vynechán — dokončí ho jiná operace.` });
  }
  if (pocketSkips > 0) {
    foundErrors.push({ type: 'warning', msg: `Hrubování: ${pocketSkips} × kapsa za hrbem vynechána (zapněte „Zanořování", nebo ji dokončí jiná operace).` });
  }
}

// Lomená čára → úsečky; slije kolineární body (tolerance 0,005 mm).
function simplify(pts) {
  const out = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    const p = pts[i];
    if (out.length >= 2) {
      const a = out[out.length - 2], b = out[out.length - 1];
      const dx = p.x - a.x, dz = p.z - a.z, L = Math.hypot(dx, dz);
      const dist = L < 1e-9 ? 0 : Math.abs((b.x - a.x) * dz - (b.z - a.z) * dx) / L;
      if (dist < 0.005) { out[out.length - 1] = p; continue; }
    }
    out.push(p);
  }
  const segs = [];
  for (let i = 1; i < out.length; i++) segs.push({ type: 'line', x1: out[i - 1].x, z1: out[i - 1].z, x2: out[i].x, z2: out[i].z });
  return segs;
}
