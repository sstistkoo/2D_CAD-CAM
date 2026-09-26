// ╔══════════════════════════════════════════════════════════════╗
// ║  POŘADÍ PŘES HRB — pravidlo 7 (docs/cam-pravidla.md)            ║
// ╚══════════════════════════════════════════════════════════════╝
//
// „Nejdřív se dodělá celá pravá strana (před hrbem) vrstvu po vrstvě až
// dolů. Teprve když je pravá strana hotová, přejede se přes hrb a dodělá se
// zbytek na druhé straně, zase po vrstvách až dolů."
//
// Hloubková smyčka (`roughLong.js`) vydává na každé hloubce všechny kusy
// vrstvy zprava doleva — pravou stranu i kapsu za hrbem — takže se strany
// střídaly vrstvu po vrstvě. Tady se hotový seznam průchodů úseku STABILNĚ
// přeřadí: průchod, jehož tělo začíná ZA hrbem a leží POD jeho vrcholem,
// patří za všechny průchody před tím hrbem. Klíč = počet takových hrbů
// (zprava doleva), uvnitř klíče zůstává původní pořadí (po vrstvách).
// Vrstvy NAD vrcholem hrb kopírují a jedou vcelku — ty nemají klíč.
//
// Hrb se hledá na offsetové dráze stejně jako v kontrole pravidel
// (scripts/lib/camRuleOrder.mjs): vrchol, od kterého dráha na obě strany
// klesne aspoň o HUMP_MIN.
//
// Souřadnice: vnitřní svět strategie (obrábí se od vysokého Z k nízkému;
// zleva je svět zrcadlený).

const DZ = 0.25;
const HUMP_MIN = 1;
const TOL = 0.1;

/** Hrby dráhy v rozsahu [zLo, zHi]: `{ zBack, top }` (zBack = levý kraj vrcholu). */
export function findHumps(offsetXAt, zLo, zHi) {
  const zs = [], xs = [];
  for (let z = zHi; z >= zLo; z -= DZ) {
    const x = offsetXAt(z);
    if (x === null) continue;
    zs.push(z); xs.push(x);
  }
  const humps = [];
  for (let i = 1; i < xs.length - 1; i++) {
    if (!(xs[i] >= xs[i - 1] && xs[i] >= xs[i + 1])) continue;
    let j = i;
    while (j + 1 < xs.length && Math.abs(xs[j + 1] - xs[i]) < 0.02) j++;   // plošina
    const top = xs[i];
    let lMin = top, rMin = top;
    for (let k = i - 1; k >= 0 && xs[k] <= top + 0.02; k--) rMin = Math.min(rMin, xs[k]);
    for (let k = j + 1; k < xs.length && xs[k] <= top + 0.02; k++) lMin = Math.min(lMin, xs[k]);
    if (top - lMin >= HUMP_MIN && top - rMin >= HUMP_MIN) humps.push({ zBack: zs[j], top });
    i = j;
  }
  return humps;
}

// VRCHOL HRBU UŽ PROJELA MĚLČÍ VRSTVA (rozhodnutí uživatele 25. 9. 2026).
// Dojezd vyjel až na výšku, po které už dřív jel rovně průchod mělčí vrstvy
// — ten se hrbu „dotkl" a jeho vrchol je hotový. Pak se přes hrb nepřejíždí
// hned: nejdřív se dodělá strana před hrbem a teprve potom vrstva za ním.
// Jinak přejezd jel posuvem znovu po těle mělčí vrstvy (zleva úsek 1:
// `N330 G1 X32.066 Z-1.151` / `N340 … Z9.049` po `N260 G1 Z26.132` na X32.066)
// a přes hrb se jelo dřív, než byly hotové vrstvy čela.
function topTouched(keyed, upTo, end) {
  if (!end || !Number.isFinite(end.x2) || !Number.isFinite(end.z2)) return false;
  for (let m = 0; m < upTo; m++) {
    const q = keyed[m].p;
    if (!q || q.type !== 'long' || !Number.isFinite(q.x)) continue;
    if (!Number.isFinite(q.zStart) || !Number.isFinite(q.zEnd)) continue;
    if (Math.abs(q.x - end.x2) > 0.05) continue;
    if (end.z2 <= Math.max(q.zStart, q.zEnd) + 0.05 && end.z2 >= Math.min(q.zStart, q.zEnd) - 0.05) return true;
  }
  return false;
}

// Totéž pro VRCHOL HRBU mezi dvěma kusy vrstvy: projela ho už dřívější
// dráha — tělem, nájezdem, dojezdem nebo rampou — na jeho výšce nebo níž?
// První vrstva, která na hrb narazí, přes něj vede dojezdem (ne tělem), takže
// test jen na těla to nepoznal a další vrstva se s kusem za hrbem spárovala
// (zprava úsek 1, 25. 9. 2026: průchod 6 X50.545 přejel osazení dojezdem
// `N390 G1 X51.581 Z220.938`, a přesto `N530 … N540 G1 Z195.278` na X48.045
// jel za hrb dřív, než byla hotová pravá strana).
function humpRidden(keyed, upTo, a, b, humps) {
  const zHi = Math.max(a.zEnd, b.zStart), zLo = Math.min(a.zEnd, b.zStart);
  const h = humps.find(q => q.zBack <= zHi + 0.5 && q.zBack >= zLo - 0.5);
  if (!h) return false;
  const near = (x, z) => Math.abs(z - h.zBack) <= 0.5 && x <= h.top + 0.05;
  const at = (sg, t) => {
    if (sg.type === 'arc' && Number.isFinite(sg.startAngle) && Number.isFinite(sg.endAngle)) {
      const an = sg.startAngle + (sg.endAngle - sg.startAngle) * t;
      return { x: sg.cx + Math.sin(an) * sg.r, z: sg.cz + Math.cos(an) * sg.r };
    }
    return { x: sg.x1 + (sg.x2 - sg.x1) * t, z: sg.z1 + (sg.z2 - sg.z1) * t };
  };
  for (let m = 0; m < upTo; m++) {
    const q = keyed[m].p;
    if (!q || q.type !== 'long' || !Number.isFinite(q.x)) continue;
    if (Number.isFinite(q.zStart) && Number.isFinite(q.zEnd) && q.x <= h.top + 0.05
        && h.zBack <= Math.max(q.zStart, q.zEnd) + 0.05 && h.zBack >= Math.min(q.zStart, q.zEnd) - 0.05) return true;
    const segs = [...(q.contourLeadIn || []), ...(q.contourLeadOut || [])];
    if (q.ramp && Number.isFinite(q.ramp.x0)) segs.push({ type: 'line', x1: q.ramp.x0, z1: q.ramp.z0, x2: q.x, z2: q.zStart });
    for (const sg of segs) {
      if (![sg.x1, sg.z1, sg.x2, sg.z2].every(Number.isFinite)) continue;
      const n = Math.max(2, Math.ceil(Math.hypot(sg.x2 - sg.x1, sg.z2 - sg.z1) / 0.2));
      for (let i = 0; i <= n; i++) { const r = at(sg, i / n); if (near(r.x, r.z)) return true; }
    }
  }
  return false;
}

/**
 * Přeřadí průchody úseku podle pravidla 7. Vrací nové pole; když by se tím
 * roztrhl řetěz průchodů (kapsa: `pocketReposition`/`cleanApproach` navazují
 * na předchůdce), vrátí původní pořadí beze změny.
 */
export function orderByHumps(list, offsetXAt, opts = {}) {
  const tailStep = opts.tailStep > 0 ? opts.tailStep : 0;
  if (!Array.isArray(list) || list.length < 2) return list;
  let zLo = Infinity, zHi = -Infinity;
  for (const p of list) {
    for (const z of [p.zStart, p.zEnd]) if (Number.isFinite(z)) { zLo = Math.min(zLo, z); zHi = Math.max(zHi, z); }
  }
  if (!(zHi > zLo)) return list;
  const humps = findHumps(offsetXAt, zLo - 1, zHi + 1);
  if (humps.length === 0) return list;
  const keyOf = (p) => {
    if (p.type !== 'long' || !Number.isFinite(p.x) || !Number.isFinite(p.zStart)) return 0;
    let k = 0;
    // Pod vrcholem = hrb vrstvu přeruší; stačí setiny (offset > x).
    for (const h of humps) if (p.zStart < h.zBack - TOL && p.x < h.top - 0.01) k++;
    return k;
  };
  const keyed = list.map((p, i) => ({ p, i, k: keyOf(p) }));
  // „Vrstva kopíruje hrb a pokračuje dál" (pravidlo 7): kus téže hloubky
  // hned za průchodem, jehož dojezd vyjel nad vrstvu, spojí `humpMerge.js`
  // přes hrb do jedné vrstvy — musí proto zůstat hned za ním (part-20:
  // bez toho se nespojily a kapsa Z 72–78 zůstala stát pod držákem).
  // Jen dokud za hrbem nebyla ODLOŽENA žádná mělčí vrstva: jinak by spojená
  // hlubší vrstva přejela hrb dřív než ona a vzala dvě vrstvy naráz (tříska
  // 2× ap na dílu uživatele s upichovákem).
  let deferredSeen = false;
  for (let n = 1; n < keyed.length; n++) {
    const a = keyed[n - 1].p, b = keyed[n].p;
    const lo = a.contourLeadOut;
    const pair = !deferredSeen && a.type === 'long' && b.type === 'long' && Math.abs(a.x - b.x) <= 1e-6
      && !(b.contourLeadIn || b.pocketReposition || b.pocketEntry)
      && lo && lo.length > 0 && lo[lo.length - 1].x2 > a.x + 0.01
      && !topTouched(keyed, n - 1, lo[lo.length - 1])
      && !humpRidden(keyed, n - 1, a, b, humps);
    if (pair) keyed[n].k = keyed[n - 1].k;
    else if (keyed[n].k > keyed[n - 1].k) deferredSeen = true;
  }
  const sorted = keyed.slice().sort((a, b) => (a.k - b.k) || (a.i - b.i));
  if (sorted.every((e, n) => e.i === n)) return list;
  // Řetěz se nesmí přetrhnout: kdo navazuje na předchůdce, musí ho mít stejného.
  for (let n = 1; n < sorted.length; n++) {
    const e = sorted[n];
    if ((e.p.pocketReposition || e.p.cleanApproach) && sorted[n - 1].i !== e.i - 1) return list;
  }
  const out = sorted.map(e => e.p);
  // Přesunuté průchody (pojedou po jiném materiálu, než s jakým je hlídání
  // držáku plánovalo) — roughLong.js je po přeřazení prověří znovu.
  for (const e of sorted) if (e.k > 0) e.p.__movedByHump = true;
  // Bez odskoku smí skončit jen průchod, za kterým jede TÝŽ následník jako dřív.
  for (let n = 0; n < sorted.length; n++) {
    const e = sorted[n];
    if (e.p.noRetract && !(n + 1 < sorted.length && sorted[n + 1].i === e.i + 1)) delete e.p.noRetract;
  }
  // Nájezd po kontuře přes hrb navazoval na PRAVOU část téže vrstvy. Když
  // ta po přeřazení jela dřív, nájezd by začal sám od sebe na vrcholu hrbu
  // (pravidlo 4) a jel posuvem po boku, který už obrobila mělčí vrstva
  // (pravidlo 5) — díl uživatele 24. 9. 2026, `N2970 G1 X50.518`. Průchod
  // proto začne tam, kde začíná řez (`zStart`), nájezdem shora.
  for (let n = 0; n < sorted.length; n++) {
    const e = sorted[n];
    // S rampou ne: ta začíná tam, kam ji nájezd dovezl, a bez něj by se k ní
    // sjíždělo kolmo do materiálu (part-1/2: `G1 X35.638`, pravidlo 6).
    // Přejezd přes hrb (`pocketHumpSplit.js`) nájezd NEPOSTRÁDÁ — nájezd
    // po vrcholu a sjezd za něj JE celý jeho řez.
    if (!e.p.contourLeadIn || e.p.ramp || e.k === 0 || e.p.humpCrossing) continue;
    if (n > 0 && sorted[n - 1].i === e.i - 1) continue;
    // ── OCAS NÁJEZDU POD MĚLČÍ VRSTVOU SE NECHÁ (kulatá, 26. 9. 2026) ─────
    // Konec nájezdu, který leží níž než jedna Hloubka (ap) nad vrstvou, je
    // ŘEZ té vrstvy: sjíždí po kontuře dna tam, kam mělčí vrstva nedosáhla.
    // Bez něj se do kapsy sjelo zanořením pod 45° a mezi ním a mírnější
    // konturou zůstal klín — nález uživatele 26. 9. 2026 (vybrání R 24,5
    // mezi body 25–24: poslední vrstva na dně nechala na pravém boku čočky
    // 1,5 mm). Nájezd tak začne tam, kde začíná řez (pravidlo 4), a po už
    // obrobeném boku nejede (pravidlo 5).
    const tail = tailStep > 0 ? leadInTail(e.p.contourLeadIn, e.p.x + tailStep) : null;
    if (tail) {
      e.p.contourLeadIn = tail;
      e.p.leadInTrimmed = true;
      continue;
    }
    delete e.p.contourLeadIn;
    e.p.leadInDropped = true;
  }
  return out;
}

// Konec nájezdu po kontuře od posledního místa, kde klesne pod `xTop`
// (a dál už pod ním zůstane). Null, když takový konec není nebo je kratší
// než 0,05 mm.
export function leadInTail(li, xTop) {
  if (!Array.isArray(li) || li.length === 0) return null;
  const at = (s, t) => {
    if (s.type === 'arc' && Number.isFinite(s.startAngle) && Number.isFinite(s.endAngle)) {
      const a = s.startAngle + (s.endAngle - s.startAngle) * t;
      return { x: s.cx + Math.sin(a) * s.r, z: s.cz + Math.cos(a) * s.r, a };
    }
    return { x: s.x1 + (s.x2 - s.x1) * t, z: s.z1 + (s.z2 - s.z1) * t };
  };
  const last = li[li.length - 1];
  if (!(last.x2 <= xTop + 0.01)) return null;
  for (let k = li.length - 1; k >= 0; k--) {
    const s = li[k];
    if (s.x1 <= xTop + 0.01 && k > 0) continue;
    if (s.x1 <= xTop + 0.01) return li.slice();
    const n = Math.max(8, Math.ceil(Math.hypot(s.x2 - s.x1, s.z2 - s.z1) / 0.05));
    let t0 = 1;
    for (let j = n; j >= 0; j--) {
      if (at(s, j / n).x > xTop + 0.01) {
        // Přesně na úrovni `xTop` (bisekcí): začátek pod ní by se sjížděl
        // svisle o setiny do materiálu (pravidlo 6).
        let lo = j / n, hi = Math.min(1, (j + 1) / n);
        for (let it = 0; it < 30; it++) { const m = (lo + hi) / 2; if (at(s, m).x > xTop) lo = m; else hi = m; }
        t0 = hi;
        break;
      }
    }
    const q = at(s, t0);
    const head = { ...s, x1: q.x, z1: q.z };
    if (q.a !== undefined) head.startAngle = q.a;
    const out = [];
    if (Math.hypot(head.x2 - head.x1, head.z2 - head.z1) > 1e-3) out.push(head);
    out.push(...li.slice(k + 1));
    let len = 0;
    for (const g of out) len += Math.hypot(g.x2 - g.x1, g.z2 - g.z1);
    return len > 0.05 ? out : null;
  }
  return null;
}
