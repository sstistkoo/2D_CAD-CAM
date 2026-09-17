// ╔══════════════════════════════════════════════════════════════╗
// ║  MEZNÍ ČÁRA ZANOŘENÍ — NAPOJENÍ JEJÍHO OFFSETU NA OKOLÍ       ║
// ╚══════════════════════════════════════════════════════════════╝
//
// PROBLÉM (nález uživatele 17. 9. 2026, tři fotky náhledu):
// offsetová čára mezní čáry zanoření se kreslila jako prostý KOLMÝ posun
// té úsečky o rádius plátku (+ přídavky). Její konce tím zůstaly viset ve
// vzduchu: nahoře nedosáhly k vodorovné offsetové čáře nad sebou, dole ji
// naopak o kus přejely. Okolní offsetová čára přitom dál KOPÍROVALA
// POVRCH — sjížděla po stěně strmější, než jakou plátek stihne sjet.
//
// PRAVIDLO UŽIVATELE: *„když je daná čára od zanořování, nemají jít
// offsetové čáry kolmo od ní, ale mají se napojovat… nemůže kopírovat
// povrch, ale musí se přizpůsobit tomu zanořování"*. Je to týž požadavek,
// jaký je od 16. 9. 2026 zapsaný v `docs/cam-plan-2026-09-15.md` (bod D:
// *„vodorovně → 45° podle zanořování → dolů"*).
//
// CO TO DĚLÁ: offsetový řetěz (`offsetPath`, `finishRefPath`) se OŘÍZNE
// offsetovou čarou mezní čáry. Z řetězu se najdou VŠECHNY průsečíky s tou
// přímkou; úsek mezi PRVNÍM a POSLEDNÍM z nich (v pořadí řetězu) se nahradí
// rovnou úsečkou po té přímce. Vznikne spojitý řetěz
// „vodorovná offsetová čára → offset mezní čáry → další offsetová čára",
// přesně jak ukazují fotky.
//
// PROČ TO NENÍ ZAJETÍ DO DÍLU: nahrazující úsečka leží PŘESNĚ o (R + přídavek)
// od mezní čáry, a mezní čára se dotýká dílu jen svou horní kotvou. Každý bod
// náhrady je tedy od té kotvy vzdálený nejméně (R + přídavek) — blíž k dílu se
// dráha nedostane. Materiál, který tím zůstane (klín mezi mezní čarou a
// povrchem), je právě ten, na který se plátek pod daným úhlem zanoření
// nedostane; to je smysl mezní čáry, ne ztráta.
//
// ROZSAH: jen mezní čáry ZANOŘENÍ (`plungeLimit`) a jen pro plátek, který to
// má v pravidlech (`plungeGuideJoinsOffset` v `inserts/*.js`). Mezní čáry
// polygonu už dnes konturu MOSTÍ (`buildMachinableContour`), takže jejich
// offset se napojuje sám — tady by se dělal podruhé.
//
// NESAHÁ NA KONTURU. `contourSegments` zůstává skutečný tvar dílu (kvůli
// dokončování, dělení na úseky i obálce držáku); mění se jen OFFSET, tedy
// dráha středu plátku. Tím se liší od `plungeContourBridge.js`, který mostí
// konturu samotnou a jehož cena (kolize držáku) je dodnes nevyřešená.
import {
  getNormal,
  intersectLines,
  intersectLineCircle,
  isAngleBetween,
  setSegEnd,
  setSegStart,
} from './camMath.js';

/** Tolerance pro „bod leží na segmentu" při hledání průsečíku (mm / podíl). */
const HIT_EPS = 1e-9;
/** Kratší náhradu než tohle nemá smysl vyrábět (mm). */
const MIN_BRIDGE = 1e-3;
/**
 * Jak hluboko musí řetěz mez PŘEKROČIT, aby se nahrazoval (mm).
 *
 * Mezní čára se dílu typicky DOTÝKÁ (u oblouku je tečná), takže její offset
 * je tečný k offsetovému oblouku — a numericky ho protne ve dvou bodech pár
 * desetin od sebe. Bez prahu by se z takového dotyku vyrobila tětiva dlouhá
 * 0,7 mm (změřeno na dílu uživatele u oblouku R10: prohnutí 0,003 mm).
 * To není porušená mez, to je zaokrouhlení.
 */
const MIN_DIP = 0.02;
/** Kolik vzorků na segment při měření prohnutí. */
const DIP_SAMPLES = 8;

/**
 * Offsetová čára mezní čáry — kam dojede STŘED plátku, kdyby po ní jel.
 * Posun jde po normále na stranu vzduchu (+X) a PO SLOŽKÁCH, přesně jako
 * `buildRawOffsets` u úseček (X o `offX`, Z o `offZ`).
 *
 * @param {object} g mezní čára { x1,z1, x2,z2 } (2 = horní konec)
 * @param {number} offX posun v ose X (R + Přídavek X + Přídavek na hotovo)
 * @param {number} offZ posun v ose Z (R + Přídavek Z + Přídavek na hotovo)
 * @returns {{p1:{x,z}, p2:{x,z}, n:{x,z}}|null} p1 = horní konec
 */
export function guideOffsetLine(g, offX, offZ) {
  if (!g) return null;
  const a = { x: g.x2, z: g.z2 }, b = { x: g.x1, z: g.z1 };
  let n = getNormal(a, b);
  if (!n || (Math.abs(n.x) < 1e-12 && Math.abs(n.z) < 1e-12)) return null;
  // Strana vzduchu: +X (u svislé čáry rozhodne znaménko Z) — táž volba,
  // jakou dělá náhled od začátku.
  if (n.x < 0 || (Math.abs(n.x) < 1e-9 && n.z < 0)) n = { x: -n.x, z: -n.z };
  return {
    p1: { x: a.x + n.x * offX, z: a.z + n.z * offZ },
    p2: { x: b.x + n.x * offX, z: b.z + n.z * offZ },
    n,
  };
}

/** Kopie segmentu, u které se dají hýbat konce bez zásahu do originálu. */
function cloneSeg(seg) {
  return seg.type === 'line'
    ? { ...seg, p1: { ...seg.p1 }, p2: { ...seg.p2 } }
    : { ...seg };
}

/** Délka segmentu (u oblouku po tětivě — stačí na test degenerace). */
function segTooShort(seg) {
  if (seg.type === 'line')
    return Math.hypot(seg.p2.x - seg.p1.x, seg.p2.z - seg.p1.z) < MIN_BRIDGE;
  const sx = seg.cx + Math.sin(seg.startAngle) * seg.r;
  const sz = seg.cz + Math.cos(seg.startAngle) * seg.r;
  const ex = seg.cx + Math.sin(seg.endAngle) * seg.r;
  const ez = seg.cz + Math.cos(seg.endAngle) * seg.r;
  return Math.hypot(ex - sx, ez - sz) < MIN_BRIDGE;
}

/**
 * Průsečíky segmentu s NEKONEČNOU přímkou A→B.
 * Vrací [{ t, pt }], kde `t` ∈ ⟨0,1⟩ je podíl podél segmentu (u oblouku
 * podíl rozvinu) — slouží k seřazení a k oříznutí.
 */
function hitsOnSegment(seg, A, B) {
  const out = [];
  if (!seg || seg.isDegenerate) return out;
  if (seg.type === 'line') {
    const q = intersectLines(A, B, seg.p1, seg.p2);
    if (!q) return out;
    const dx = seg.p2.x - seg.p1.x, dz = seg.p2.z - seg.p1.z;
    const len2 = dx * dx + dz * dz;
    if (len2 < 1e-12) return out;
    const t = ((q.x - seg.p1.x) * dx + (q.z - seg.p1.z) * dz) / len2;
    if (t < -HIT_EPS || t > 1 + HIT_EPS) return out;
    out.push({ t: Math.min(1, Math.max(0, t)), pt: q });
  } else if (seg.type === 'arc') {
    const hits = intersectLineCircle(A, B, { x: seg.cx, z: seg.cz }, seg.r) || [];
    let sA = seg.startAngle, eA = seg.endAngle;
    if (seg.dir === 'G2' && eA > sA) eA -= 2 * Math.PI;
    if (seg.dir === 'G3' && eA < sA) eA += 2 * Math.PI;
    const span = eA - sA;
    for (const q of hits) {
      const ang = Math.atan2(q.x - seg.cx, q.z - seg.cz);
      if (!isAngleBetween(ang, seg.startAngle, seg.endAngle, seg.dir === 'G2')) continue;
      // Rozvinout úhel do intervalu ⟨sA, eA⟩, aby `t` vyšlo monotónně.
      let a = ang;
      const lo = Math.min(sA, eA), hi = Math.max(sA, eA);
      while (a < lo - 1e-9) a += 2 * Math.PI;
      while (a > hi + 1e-9) a -= 2 * Math.PI;
      const t = Math.abs(span) < 1e-12 ? 0 : (a - sA) / span;
      out.push({ t: Math.min(1, Math.max(0, t)), pt: q });
    }
  }
  return out;
}

/** Bod segmentu v podílu `t` (stejná parametrizace jako `hitsOnSegment`). */
function pointAt(seg, t) {
  if (seg.type === 'line')
    return {
      x: seg.p1.x + (seg.p2.x - seg.p1.x) * t,
      z: seg.p1.z + (seg.p2.z - seg.p1.z) * t,
    };
  let sA = seg.startAngle, eA = seg.endAngle;
  if (seg.dir === 'G2' && eA > sA) eA -= 2 * Math.PI;
  if (seg.dir === 'G3' && eA < sA) eA += 2 * Math.PI;
  const a = sA + (eA - sA) * t;
  return { x: seg.cx + Math.sin(a) * seg.r, z: seg.cz + Math.cos(a) * seg.r };
}

/**
 * Vzorky řetězu MEZI oběma napojeními (včetně částečných segmentů na krajích).
 *
 * POZOR — celý segment vzorkovat nelze: krajní segmenty pokračují i ZA
 * napojením a tam mez porušené být nemusí (na dílu uživatele to u čela
 * vyrobilo falešný nález — svislá offsetová čára mez překračuje 5 mm NAD
 * napojením, ale nahrazovaný kus pod ním leží celý na straně vzduchu).
 */
function samplesBetween(chain, first, last) {
  const pts = [];
  for (let i = first.i; i <= last.i; i++) {
    const seg = chain[i];
    if (!seg || seg.isDegenerate) continue;
    const t0 = i === first.i ? first.t : 0;
    const t1 = i === last.i ? last.t : 1;
    if (t1 - t0 < 1e-9) continue;
    for (let k = 0; k <= DIP_SAMPLES; k++)
      pts.push(pointAt(seg, t0 + (t1 - t0) * (k / DIP_SAMPLES)));
  }
  return pts;
}

/** Vzdálenost bodu od segmentu kontury (úsečka i oblouk). */
function distToSeg(p, seg) {
  if (!seg || seg.isDegenerate) return Infinity;
  if (seg.type === 'line') {
    const dx = seg.p2.x - seg.p1.x, dz = seg.p2.z - seg.p1.z;
    const len2 = dx * dx + dz * dz;
    if (len2 < 1e-12) return Math.hypot(p.x - seg.p1.x, p.z - seg.p1.z);
    let t = ((p.x - seg.p1.x) * dx + (p.z - seg.p1.z) * dz) / len2;
    t = Math.min(1, Math.max(0, t));
    return Math.hypot(p.x - (seg.p1.x + dx * t), p.z - (seg.p1.z + dz * t));
  }
  const d = Math.hypot(p.x - seg.cx, p.z - seg.cz);
  const ang = Math.atan2(p.x - seg.cx, p.z - seg.cz);
  if (isAngleBetween(ang, seg.startAngle, seg.endAngle, seg.dir === 'G2'))
    return Math.abs(d - seg.r);
  const e1 = pointAt(seg, 0), e2 = pointAt(seg, 1);
  return Math.min(Math.hypot(p.x - e1.x, p.z - e1.z), Math.hypot(p.x - e2.x, p.z - e2.z));
}

/**
 * Nezajede náhrada do kontury? Náhrada leží na offsetu mezní čáry, takže od
 * dílu je vzdálená (R + přídavek) — potud, pokud mezní čára sama jde vzduchem.
 * Jakmile by pokračovala DO materiálu, klesne vzdálenost pod přídavek a
 * náhrada by dílu ukrojila. Tohle je to, co ohraničuje hledání napojení:
 * ne libovolně zvolené okno, ale místo, kde by dráha přestala být bezpečná.
 */
function bridgeClears(from, to, contour, minDist) {
  if (!Array.isArray(contour) || contour.length === 0 || !(minDist > 0)) return true;
  const N = 32;
  for (let k = 0; k <= N; k++) {
    const p = { x: from.x + (to.x - from.x) * (k / N), z: from.z + (to.z - from.z) * (k / N) };
    for (const seg of contour) if (distToSeg(p, seg) < minDist) return false;
  }
  return true;
}

/**
 * Ořízne jeden offsetový řetěz jednou offsetovou čarou mezní čáry.
 *
 * NAPOJENÍ SE HLEDÁ JEN V OKOLÍ NAKRESLENÉ ČÁRY. Za její konec se
 * nepokračuje — čára tam končí proto, že vyjela z materiálu, a protahovat
 * její offset k prvnímu, co potká, znamená přeříznout celé údolí. Nenajde-li
 * se napojení, řetěz se nemění a v náhledu se kreslí prostý kolmý offset
 * končící na offsetu vlastního konce čáry — přesně jako u polygonu.
 *
 * @param {Array} chain offsetový řetěz (line/arc segmenty, `chainBreak` = zlom)
 * @param {{p1:{x,z}, p2:{x,z}, n:{x,z}}} line offsetová čára mezní čáry
 * @param {number} maxExtend okolí nakreslené čáry pro 1. stupeň (mm)
 * @param {{contour?: Array, minDist?: number}} [guard] podklad pro `bridgeClears`
 * @returns {{chain:Array, from:{x,z}, to:{x,z}}|null} null = nenapojeno
 */
export function joinChainToGuideOffset(chain, line, maxExtend, guard = {}) {
  if (!Array.isArray(chain) || chain.length === 0 || !line) return null;
  const A = line.p1, B = line.p2;
  const dx = B.x - A.x, dz = B.z - A.z;
  const L = Math.hypot(dx, dz);
  if (L < MIN_BRIDGE) return null;
  const ux = dx / L, uz = dz / L;
  const along = (p) => (p.x - A.x) * ux + (p.z - A.z) * uz;   // 0 = A, L = B
  const sideOf = (p) => (p.x - A.x) * line.n.x + (p.z - A.z) * line.n.z;
  const { contour = null, minDist = 0 } = guard;

  const hits = [];
  for (let i = 0; i < chain.length; i++) {
    for (const h of hitsOnSegment(chain[i], A, B)) {
      const s = along(h.pt);
      if (s < -maxExtend || s > L + maxExtend) continue;
      hits.push({ i, t: h.t, pt: h.pt, s });
    }
  }
  if (hits.length < 2) return null;
  hits.sort((p, q) => (p.i - q.i) || (p.t - q.t));
  const first = hits[0];
  // Napojení NAHOŘE musí sedět u kotvy — tam mezní čára vyrůstá z kontury.
  if (first.s > maxExtend) return null;

  /** Postaví náhradu po `cand` a vrátí nový řetěz, nebo null (nevyhovuje). */
  const build = (cand) => {
    if (cand.i === first.i && Math.abs(cand.t - first.t) < HIT_EPS) return null;
    if (Math.hypot(cand.pt.x - first.pt.x, cand.pt.z - first.pt.z) < MIN_BRIDGE) return null;
    // Přes zlom řetězu se nenapojuje — jsou to dvě nesouvislé větve kontury.
    for (let i = first.i + 1; i <= cand.i; i++)
      if (chain[i] && chain[i].chainBreak) return null;
    // Náhrada musí řetěz MĚŘITELNĚ změnit. Mezní čára se dílu často jen
    // DOTÝKÁ (u oblouku je tečná) a její offset pak offsetový oblouk protne
    // ve dvou bodech pár desetin od sebe — z toho by vznikla tětiva 0,68 mm
    // s prohnutím 0,003 mm, tedy zaokrouhlovací šum, ne oprava.
    let dev = 0;
    for (const p of samplesBetween(chain, first, cand)) dev = Math.max(dev, Math.abs(sideOf(p)));
    if (dev < MIN_DIP) return null;
    if (!bridgeClears(first.pt, cand.pt, contour, minDist)) return null;

    const out = chain.slice(0, first.i);
    const head = cloneSeg(chain[first.i]);
    setSegEnd(head, first.pt);
    if (!segTooShort(head)) out.push(head);
    out.push({
      type: 'line',
      p1: { x: first.pt.x, z: first.pt.z },
      p2: { x: cand.pt.x, z: cand.pt.z },
      fromGuideOffset: true,
      // Zlom si nese první segment za sebou — když se hlava zahodila, musí
      // ho převzít náhrada, jinak by se dvě větve řetězu slily v jednu.
      ...(chain[first.i].chainBreak && segTooShort(head) ? { chainBreak: true } : {}),
    });
    const tail = cloneSeg(chain[cand.i]);
    setSegStart(tail, cand.pt);
    delete tail.chainBreak;
    if (!segTooShort(tail)) out.push(tail);
    out.push(...chain.slice(cand.i + 1));
    return { chain: out, from: first.pt, to: cand.pt };
  };

  /**
   * „Po mezní čáře až na její konec a odtud KOLMO DOLŮ."
   * Použije se, když se v okolí čáry žádné napojení nenajde. Svislice
   * (konstantní Z) z konce offsetové čáry hledá první segment řetězu POD
   * sebou; všechno mezi kotvou a tím bodem se z řetězu vyhodí, protože to
   * leží POD mezí zanoření a generovaly by se z toho dráhy, které ji
   * podjíždějí.
   */
  const buildDrop = () => {
    const E = line.p2;                         // offset konce mezní čáry
    if (Math.hypot(E.x - first.pt.x, E.z - first.pt.z) < MIN_BRIDGE) return null;
    // Svislice Z = E.z jako „nekonečná přímka" pro `hitsOnSegment`.
    const V1 = { x: E.x, z: E.z }, V2 = { x: E.x - 1, z: E.z };
    let best = null;
    for (let i = first.i; i < chain.length; i++) {
      if (i > first.i && chain[i] && chain[i].chainBreak) break;   // jiná větev
      for (const h of hitsOnSegment(chain[i], V1, V2)) {
        if (h.pt.x > E.x - MIN_BRIDGE) continue;                   // musí být POD koncem
        if (i === first.i && h.t <= first.t + HIT_EPS) continue;   // před kotvou
        if (!best || h.pt.x > best.pt.x) best = { i, t: h.t, pt: h.pt };
      }
    }
    if (!best) return null;
    // Obě části náhrady musí zůstat od dílu dál než (R + menší přídavek).
    if (!bridgeClears(first.pt, E, contour, minDist)) return null;
    if (!bridgeClears(E, best.pt, contour, minDist)) return null;
    // Musí to řetěz měřitelně změnit (tečný dotyk neřešíme).
    let dev = 0;
    for (const p of samplesBetween(chain, first, best)) dev = Math.max(dev, Math.abs(sideOf(p)));
    if (dev < MIN_DIP) return null;

    const out = chain.slice(0, first.i);
    const head = cloneSeg(chain[first.i]);
    setSegEnd(head, first.pt);
    const headGone = segTooShort(head);
    if (!headGone) out.push(head);
    out.push({
      type: 'line', p1: { ...first.pt }, p2: { x: E.x, z: E.z }, fromGuideOffset: true,
      ...(chain[first.i].chainBreak && headGone ? { chainBreak: true } : {}),
    });
    out.push({ type: 'line', p1: { x: E.x, z: E.z }, p2: { ...best.pt }, fromGuideDrop: true });
    const tail = cloneSeg(chain[best.i]);
    setSegStart(tail, best.pt);
    delete tail.chainBreak;
    if (!segTooShort(tail)) out.push(tail);
    out.push(...chain.slice(best.i + 1));
    return { chain: out, from: first.pt, to: { x: E.x, z: E.z }, drop: { ...best.pt } };
  };

  // 1) Napojení se hledá JEN v okolí nakreslené mezní čáry — nejvzdálenější,
  //    které tam je. Za její konec se po přímce NEPOKRAČUJE: čára tam končí
  //    proto, že vyjela z materiálu, a protahovat její offset k prvnímu, co
  //    potká, znamená přeříznout celé údolí (nález uživatele 17. 9. 2026,
  //    fotka z dílu s kulatou R10 — „jde v tom údolí až na druhou stranu").
  //    Tohle dělá i POLYGON: jeho offsetová čára končí na offsetu vlastního
  //    konce mezní čáry.
  const inWindow = hits.slice(1).filter(h => h.s <= L + maxExtend);
  for (let k = inWindow.length - 1; k >= 0; k--) {
    const res = build(inWindow[k]);
    if (res) return res;
  }
  // 2) Napojení v okolí není. Pravidlo uživatele 17. 9. 2026:
  //    *„protáhl bych to jen tam, kde by to mělo smysl, a pak spustil KOLMO
  //    DOLŮ ty offsetové čáry, a ty pod tím bych odstranil — páč z toho se
  //    generujou dráhy a to by nemělo, protože to podjíždí úhel zanoření."*
  //    Řetěz tedy jde po mezní čáře až na její konec, odtud SVISLE dolů
  //    (konstantní Z, klesající X — tam už materiál chrání polotovar, ne
  //    mez zanoření) a offsetové čáry POD mezí se z řetězu vyhodí.
  return buildDrop();
}

/**
 * Napojí offsety VŠECH mezních čar zanoření na daný offsetový řetěz.
 * Napojenou (oříznutou) offsetovou čáru si každá mezní čára odloží pod
 * klíčem `store`, aby ji náhled i SNAP kreslily přesně tam, kde ji má
 * řetěz — jeden zdroj geometrie, žádný druhý výpočet v UI.
 *
 * @param {Array} chain offsetový řetěz
 * @param {Array} guides mezní čáry (filtrované na `plungeLimit`)
 * @param {number} offX posun v ose X
 * @param {number} offZ posun v ose Z
 * @param {string} store klíč, pod který se uloží napojená čára
 * @param {Array} [contour] kontura pro pojistku proti zajetí do dílu
 * @returns {Array} nový řetěz (nebo původní, když se nenapojilo nic)
 */
export function joinPlungeGuideOffsets(chain, guides, offX, offZ, store, contour = null) {
  let out = chain;
  // Náhrada smí dílu přijít nejvýš na (R + menší z přídavků); menší proto, že
  // po složkách se offset posouvá v X o `offX` a v Z o `offZ` a přísnější
  // z obou je ta, která rozhoduje. Drobná tolerance na numeriku offsetu.
  const minDist = Math.min(offX, offZ) - 0.05;
  for (const g of guides || []) {
    // Lomená (ručně kreslená) čára sem nepatří — mezní čáry hlídání jsou
    // vždy rovné úsečky (invariant v interferenceGuides.js).
    if (g.via && g.via.length) continue;
    const line = guideOffsetLine(g, offX, offZ);
    if (!line) continue;
    // Okolí nakreslené čáry pro 1. stupeň: o velikost samotného offsetu —
    // o tolik totiž offset zaoblí roh, u kterého mezní čára kotví.
    const res = joinChainToGuideOffset(out, line, Math.max(offX, offZ) + MIN_BRIDGE,
      { contour, minDist });
    if (!res) continue;
    out = res.chain;
    g[store] = { p1: { ...res.from }, p2: { ...res.to } };
  }
  return out;
}
