// ╔═══════════════════════════════════════════════════╗
// ║  Vejde se DRŽÁK? — plošné hlídání nad výškovými tabulkami       ║
// ╚═══════════════════════════════════════════════════╝
// Vyňato z `ops/roughLong.js` (rozdělení generátoru, plán §3.A) BEZE ZMĚNY
// CHOVÁNÍ — otisk G-kódu 26 fixtures zůstal bajt po bajtu stejný.
//
// Čte výškové tabulky z `depthTabs.js` (proto se mu `T` předává CELÉ:
// `activeFloorTab` se přepisuje zvenku a destrukturace by zmrazila null).
// Měří se PLOCHA vnoření [mm²], ne hloubka — práh je `HOLDER_FIT_TOL`
// a je záměrně stejný jako u validátoru (viz `ops/shared.js`).

import { insertReachZ } from '../../toolEnvelope.js';
import { HOLDER_ENTRY_STOCK_GAP, HOLDER_FIT_TOL } from '../shared.js';

/**
 * @param T     výškové tabulky z `makeDepthTabs()` — celý objekt, ne destrukturace
 * @param prms  parametry CAM
 */
export function makeHolderFit({ T, prms }) {
  const { DZ_CAP, holderZLoL, holderZHiL, capZ0, stockTopTab, holderBottomAt,
    syncCutFloor } = T;
  // Povrch ZBYTKU na Z (null = mimo polotovar). Bere VYŠŠÍ z obou sousedních
  // vzorků jako stockTopTab — svislé čelo mezi vzorky se nesmí přichytit
  // k prázdné straně.
  const residTopAt = (z) => {
    const t = stockTopTab(z);
    if (t === null) return null;
    const tab = T.activeFloorTab || T.cutFloorTab;
    if (!tab) return t;
    const fi = (z - capZ0) / DZ_CAP;
    let cut = Infinity;
    for (const i of [Math.floor(fi), Math.floor(fi) + 1]) {
      if (i < 0 || i >= tab.length) continue;
      if (tab[i] < cut) cut = tab[i];
    }
    return Math.min(t, cut);
  };
  // `tipX` = hloubka, na které ŠPIČKA nakonec stojí — NE výška povrchu.
  // Dokud se sem posílal povrch, kontrola odpovídala na otázku „vejde se
  // držák, když se nástroj dotýká kůry?" — jenže rampa hned nato sjede o celou
  // vrstvu níž a materiál vedle se tím stane VYŠŠÍM než nástroj. Naměřeno na
  // dílu uživatele (krček Z 165,9–196,3 pod přírubou): špička na povrchu
  // X 16,5 → 0,5 mm² držáku v materiálu, špička na dně X 7,9 → 117 mm².
  //
  // Měří se proti ZBYTKU, ne proti syrovému polotovaru: se syrovým obrysem
  // vyjde „nevejde se" u každé hlubší kapsy a zanořování zmizí i tam, kde je
  // nad nástrojem vzduch po mělčích vrstvách (změřeno: part-11-zleva
  // a part-13-zleva-flange přišly o VŠECHNY rampované zákroky).
  // DOSAH DESTIČKY od programovaného bodu. Obrys `holderLoopL` začíná ve
  // špičce, takže jeho spodní hrana je u dz≈0 na úrovni hrotu — a test
  // „materiál výš než hrot" by tam hlásil kolizi na KAŽDÉ vrstvě, protože
  // těsně nad hrotem z definice stojí materiál, který právě řeže DESTIČKA.
  // Naměřeno na part-13-zleva-flange: blokoval vzorek dz=0, resid 89,92 proti
  // hrotu 84,92 — přesně jedno ap. Blízké pole proto do hlídání DRŽÁKU
  // nepatří (táž mez jako u čelní strategie, viz insertReachZ).
  const holderNearDz = Math.max(insertReachZ(prms, false), 0);
  const holderFitArea = (z, tipX, gap = HOLDER_ENTRY_STOCK_GAP, ownCut = null) => {
    if (!T.activeFloorTab) syncCutFloor();
    let area = 0;
    for (let s = z + holderZLoL; s <= z + holderZHiL + 1e-9; s += DZ_CAP) {
      if (s - z < holderNearDz - 1e-9) continue;
      const t = residTopAt(s);
      // VLASTNÍ řez zákroku: než špička dosedne na cíl, projela rampou
      // (a případně nájezdem po kontuře) — materiál pod nimi už nestojí.
      // Bez toho se svislé i ŠIKMÉ zanoření posuzují stejně, přitom šikmá
      // rampa si pás před držákem sama vykope (part-13-zleva-flange).
      let tt = t;
      if (ownCut) for (const sg of ownCut) {
        const zA = Math.min(sg.z1, sg.z2), zB = Math.max(sg.z1, sg.z2);
        if (s < zA - 1e-9 || s > zB + 1e-9) continue;
        const dzs = sg.z2 - sg.z1;
        const u = Math.abs(dzs) < 1e-9 ? 0 : Math.min(1, Math.max(0, (s - sg.z1) / dzs));
        const xs = sg.x1 + (sg.x2 - sg.x1) * u;
        if (xs < tt) tt = xs;
      }
      if (t === null) continue;
      const room = Math.max(holderBottomAt(s - z) - gap, 0.05);
      const d = tt - (tipX + room);
      if (d > 0) area += d * DZ_CAP;   // plocha, ne hloubka — viz komentář u kapsového hlídání
    }
    return area;
  };
  // Co si zákrok vykope SÁM, než špička dosedne na cíl (rampa + nájezd po
  // kontuře). Bez toho se svislé i šikmé zanoření posuzují stejně, přitom
  // šikmá rampa si pás před držákem sama vyřízne.
  const ownCutOf = (p, leadIn) => {
    const own = [];
    if (p.ramp && Number.isFinite(p.ramp.x0)) own.push({ z1: p.ramp.z0, x1: p.ramp.x0, z2: p.zStart, x2: p.x });
    for (const sg of (leadIn || p.contourLeadIn || [])) own.push(sg);
    return own;
  };
  // Největší vnoření držáku PODÉL celé rampy zákroku, ne jen v dosednutí.
  // Dlouhá diagonála (na part-11-zleva 57 mm) je nejnebezpečnější na ZAČÁTKU:
  // tam nástroj teprve vjíždí a vedle něj stojí všechno. Test jen v koncovém
  // bodě to nevidí — vyšlo 0 mm², přitom přesný model našel 131 mm² a kolize
  // začínala už na nájezdovém G0.
  // Vzorkuje se po ~1 mm dráhy a vlastním řezem je vždy jen ta ČÁST rampy,
  // kterou má nástroj v daném bodě za sebou.
  const holderFitAreaAlong = (p, leadIn) => {
    if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.zStart)) return 0;
    const r = p.ramp;
    if (!r || !Number.isFinite(r.x0) || !Number.isFinite(r.z0)) {
      return holderFitArea(p.zStart, p.x, 0, ownCutOf(p, leadIn));
    }
    const len = Math.hypot(p.zStart - r.z0, p.x - r.x0);
    const n = Math.max(1, Math.min(64, Math.ceil(len)));
    let worst = 0;
    for (let k = 0; k <= n; k++) {
      const t = k / n;
      const zi = r.z0 + (p.zStart - r.z0) * t;
      const xi = r.x0 + (p.x - r.x0) * t;
      const own = [];
      if (k > 0) own.push({ z1: r.z0, x1: r.x0, z2: zi, x2: xi });
      for (const sg of (leadIn || p.contourLeadIn || [])) own.push(sg);
      const a = holderFitArea(zi, xi, 0, own);
      if (a > worst) worst = a;
    }
    return worst;
  };
  const holderFitsAt = (z, tipX, gap = HOLDER_ENTRY_STOCK_GAP, ownCut = null) => holderFitArea(z, tipX, gap, ownCut) <= HOLDER_FIT_TOL;

  return { residTopAt, holderNearDz, holderFitArea, ownCutOf, holderFitAreaAlong, holderFitsAt };
}
