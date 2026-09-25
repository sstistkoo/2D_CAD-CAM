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

/**
 * Přeřadí průchody úseku podle pravidla 7. Vrací nové pole; když by se tím
 * roztrhl řetěz průchodů (kapsa: `pocketReposition`/`cleanApproach` navazují
 * na předchůdce), vrátí původní pořadí beze změny.
 */
export function orderByHumps(list, offsetXAt) {
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
      && lo && lo.length > 0 && lo[lo.length - 1].x2 > a.x + 0.01;
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
    delete e.p.contourLeadIn;
    e.p.leadInDropped = true;
  }
  return out;
}
