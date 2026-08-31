// ╔═══════════════════════════════════════════╗
// ║  ČELNÍ HRUBOVÁNÍ — doběh na KONCI ÚSEKU        ║
// ╚═══════════════════════════════════════════╝
// Vyňato z `ops/roughFace.js` (rozdělení generátoru, plán §3.A).
// Post-proces nad hotovým polem `passes` — pořadí volání v generátoru
// je závazné: destička → hloubka vrstev → doběh úseku → držák.

import { insertReachZ } from '../../toolEnvelope.js';

export function makeRegionRunOut(deps) {
  const {
    prms, ins, passes, faceLeft, step, zList, xTouchAt, castingOuterAtZ,
    faceOffsetOut, faceRunOut, clrXFC, rTipFC, contourTargetAt,
    rapidStartXAt, enforceLayerDepth,
  } = deps;
// ── Doběh na KONCI ÚSEKU (natočená destička nebo upichovák) ──
// Poslední průchod úseku dosedne na kužel spodní hrany. Hned za ním materiál
// pokračuje (stěna, čelo příruby), ale NOS už je nad povrchem, takže se další
// vrstva zahodí jako „řez vzduchem" — jenže řeže HRANA za nosem a ta by ten
// schodek ještě sebrala (nález uživatele 19. 8. 2026: „tady mi to nedojíždí
// a chtělo by to ještě jednu vrstvu", N3450 a N2820).
// Přidá se PRÁVĚ JEDNA vrstva na konec každého úseku, o `krok·tan φ` MĚLČEJI
// než předchozí — pravidlo „nikdy hlouběji než předchozí vrstva" tím platí
// z definice. Druhá vrstva už ne: ta by jela vzduchem.
const appendRegionRunOut = () => {
  if (faceRunOut <= 0) return;
  // `Math.max(0, …)`: kladný `toolAngle` (a u upichováku nula) by dal ZÁPORNÝ
  // tangens, tedy vrstvu HLOUBĚJI — to je pravidlo „nikdy hlouběji“ naruby.
  const tanR = Math.tan(Math.max(0, Math.min(89.5, -(parseFloat(prms.toolAngle) || 0))) * Math.PI / 180);
  const insReachRO = insertReachZ(prms, faceLeft);
  const byZ = new Map(passes.filter(p => p.type === 'face').map(p => [p.z.toFixed(3), p]));
  const add = [];
  // Mřížka je tu ta OŘEZANÁ rozsahem (`zList`, ne `zListAll`): doběh přidává
  // vrstvu ZA poslední průchod úseku, takže s celou mřížkou by na hranici
  // rozsahu 📐 vyrobil vrstvu mimo pás. Konec pásu tím doběh nedostane —
  // stejně jako ho nedostává konec marche (smyčka končí na předposledním).
  for (let i = 0; i < zList.length - 1; i++) {
    const p = byZ.get(zList[i].toFixed(3));
    if (!p || p.runOut) continue;                       // řetězit doběh na doběh ne
    if (byZ.has(zList[i + 1].toFixed(3))) continue;     // úsek pokračuje sám
    if (p.xEnd >= xTouchAt(p.z) - 0.01) continue;       // předchozí sám nic neubral
    const dirRO = Math.sign(zList[i + 1] - zList[i]);   // směr marche, ne k obrobené straně
    // AP SE MUSÍ DODRŽET. Krok doběhu se skladá z hrany materiálu a ještě
    // `faceOffsetOut` — součet může ap překročit a vrstva pak bere víc, než
    // plátek na jeden záběr unese (nález uživatele 20. 8. 2026: Z197,932 na
    // Z193,982 = 3,95 mm při ap 3). Krok se proto vždy utíná na ap — bez
    // ohledu na to, jak se hrana našla.
    const clampAp = (zq) => zList[i] + dirRO * Math.min(Math.abs(zq - zList[i]), step);
    let edgeZ = null;
    let z = zList[i + 1];
    let xEnd = p.xEnd + Math.abs(z - zList[i]) * tanR;
    // DRUHÁ STRANA DESTIČKY NESMÍ DO POLOTOVARU JAKO PRVNÍ.
    // V doběhu je nos nad povrchem a řeže HRANA za ním — ta ale dosáhne jen
    // `délka břitu · tan φ` pod nos. Když konec řezu leží nad povrchem víc,
    // destička už nad materiálem VISÍ a jako první se ho dotkne to, co je za
    // ní (druhá strana plátku, držák) — takový průchod se vynechá.
    // (Uživatel 19. 8. 2026: „aby strana co je na druhé straně než je rádius
    // nezajížděla do polotovaru jako první — ta dráha se má vynechat.")
    // Změřeno na čele příruby: konec řezu X62,06 nad povrchem X16,74 = 45 mm
    // nad materiálem → validátor tam hlásil kolizi držáku i rychloposuvu.
    if (xEnd - castingOuterAtZ(z) > insReachRO * tanR + 0.01) {
      // Nad MŘÍŽKOVÝM Z už destička nad materiálem visí. Materiál ale nemusí
      // končit na mřížce: mezi posledním průchodem a hranou materiálu (čelo
      // příruby končí na Z196,278, poslední vrstva sedí na Z197,932) zůstane
      // proužek, na který nos ještě dosáhne. Poslední vrstva se proto posadí
      // na HRANU MATERIÁLU, ne na mřížku. (Uživatel 19. 8. 2026: „je tam
      // kousek nedojetý … měl by dodělat až za tu offsetovou čáru co je
      // zleva.") Krok 0,05 mm je pod přesností, na kterou se cokoli emituje.
      let edge = null;
      const span = Math.abs(zList[i + 1] - zList[i]);
      for (let t = 0.05; t <= span + 1e-9; t += 0.05) {
        const zq = zList[i] + dirRO * t;
        if (castingOuterAtZ(zq) <= p.xEnd + t * tanR + 0.01) break;   // materiál skončil
        edge = zq;
      }
      if (edge === null) continue;
      // Kam vrstvu posadit: co NEJDÁL za hranu materiálu, ale ne tak daleko,
      // aby mezi ní a předchozím průchodem vznikla mezera — nos je kruh
      // rádiusu R, takže sousední průchody se překrývají jen do vzdálenosti
      // 2R. Dál už by proužek jen podjel a zůstal by tam celý (změřeno:
      // posazení nosu STŘEDEM až na offsetovou čáru = 3 kolize destičky
      // i rychloposuvu, o 0,5 mm blíž ještě 1; tohle je poslední čisté).
      const zc = clampAp(zList[i] + dirRO * Math.min(2 * rTipFC, Math.abs(edge - zList[i]) + rTipFC));
      if (Math.abs(zc - zList[i]) < 0.1) continue;   // nos to pokryl už sám
      z = zc; xEnd = p.xEnd + Math.abs(zc - zList[i]) * tanR; edgeZ = edge;
    }
    // ŠÍŘKA ZÁBĚRU V Z. Programovaný bod je vedení břitu na straně, kde se
    // řeže; tělo nástroje se táhne k obrobené straně. U UPICHOVÁKU řeže celá
    // šířka plátku, u nosu (kulatá / natočená destička) jen jeho stopa ≈ 2R.
    const insCover = ins.faceCoverZ(rTipFC);
    // Povrch pod CELÝM záběrem, ne jen na programovaném Z. Široký plátek se
    // opre o to nejvyšší, co pod ním stojí — u čela příruby je na
    // programovaném Z povrch 16,7 (za schodem), ale plátek svým tělem leží
    // nad velkým čelem s povrchem 64,4. Bez toho vyšel nájezd jen 1 mm nad
    // koncem řezu (`G0 X47.376` → `G1 X46.376`) a přejezd v Z se vedl POD
    // offsetovou čarou — uživatel 20. 8. 2026: „zanořování udělej jako ten
    // levý konec, jede to tam nahoru".
    const surfaceUnderInsert = (zq) => {
      let m = castingOuterAtZ(zq);
      const n = Math.max(1, Math.ceil(insCover / 0.4));
      for (let k = 1; k <= n; k++) {
        const v = castingOuterAtZ(zq - dirRO * insCover * (k / n));
        if (v > m) m = v;
      }
      return m;
    };
    // JEDNA VRSTVA MÍSTO DVOU, když na to šířka záběru stačí. Konec úseku
    // potřebuje dvě věci: odříznout proužek na HRANĚ materiálu a sjet po
    // OFFSETOVÉ ČÁŘE (mez, kam až může sahat skutečný odlitek). Nos je na to
    // moc úzký (2R = 1,6 mm) a musí to udělat na dvakrát — změřeno na
    // part-19: vynechání prostřední vrstvy tam nechalo celý prstenec 3,7 mm
    // + 3 kolize. Upichovák šírky 5 mm ale obojí zvládne najednou
    // (uživatel 20. 8. 2026: „udělej to jako ten levý konec, vezme to
    // najednou když to jde" — ty dvě vrstvy jsou od sebe 2,95 mm).
    // Sloučit smí jen UPICHOVÁK: u něj řeže celá šířka plátku a je to
    // změřené. U nosu je `insCover` jen šířka pro vzorkování povrchu —
    // slíbit podle něj sloučení by u kulaté R8 dalo 16 mm záběru, což nikdo
    // nezměřil (a stopa nosu v hloubče ap je mnohem užší než 2R).
    // NORMÁLNÍ CÍL, když destička netvoří kužel (upichovák, natočení 0 stupňů).
    // Doběh dostával hloubku PŘEDCHOZÍ vrstvy — a předchozí vrstvy přitom
    // klesaly, protoze je tak hluboko pustil DRŽÁK. Doběh se tak jako jediný
    // nezanořoval dál, i když by směl (nález uživatele 20. 8. 2026). Dostane
    // proto týž cíl jako každý jiný průchod a hloubku mu určí hlídání držáku,
    // které běží ZA ním. U NATOČENÉ destičky se nemění nic: tam hloubku dává
    // kužel spodní hrany (`tanR`) a pravidlo nikdy hlouběji je tabu.
    if (tanR < 1e-9) {
      const tgt = contourTargetAt(z);
      if (tgt !== null && tgt < xEnd) xEnd = tgt;
    }
    const zFar = edgeZ !== null ? clampAp(edgeZ + dirRO * faceOffsetOut) : null;
    const mergeOne = zFar !== null && ins.cutsFullWidth
      && Math.abs(zFar - zList[i]) <= insCover + 0.01;
    if (!mergeOne) {
      const xSurface = surfaceUnderInsert(z);
      // NÁJEZD se počítá z PŘEDCHOZÍ hloubky, ne z nového (hlubšího) cíle:
      // `xStart` je odkud se přijíždí a hlídání držáku podle něj rozhoduje
      // zvednout, nebo vynechat (`need >= p.xStart`). Když se počítal z cíle
      // kontury, spadl až k němu a průchod se tím celý VYNECHAL (změřeno).
      const xStart = Math.max(rapidStartXAt(z, xSurface, faceLeft ? 1 : -1), p.xEnd + clrXFC);
      const np = { type: 'face', z, xStart, xSurface, xEnd, blocked: true, runOut: true };
      if (faceLeft) np.faceLeft = true;
      add.push({ after: p, pass: np });
    }
    // Za hranou materiálu je PRÁZDNO, takže tam střed nosu ještě smí sjet po
    // OFFSETOVÉ ČÁŘE polotovaru. Není to řez naprázdno: offsetová čára je
    // mez, kam až může sahat SKUTEČNÝ odlitek (nadměrný kus se přes ni
    // „nafoukne"), takže na jmenovitém kuse neubere nic a na větším ano.
    // U úZKÉHO nosu musí jít AŽ ZA průchod na hraně materiálu — ten proužek
    // napřed odřízne; při jízdě rovnou sem jel držák nad syrovým (3 kolize).
    if (zFar !== null) {
      const zf = zFar;
      // Bez kuželu platí NORMÁLNÍ CÍL — dopočítávat ho znovu z `p.xEnd` by ho
      // zahodilo a doběh by zůstal v hloubce předchozí vrstvy.
      let xf = tanR < 1e-9 ? xEnd : p.xEnd + Math.abs(zf - zList[i]) * tanR;
      if (tanR < 1e-9) {
        const tgtF = contourTargetAt(zf);
        if (tgtF !== null && tgtF < xf) xf = tgtF;
      }
      const sf = surfaceUnderInsert(zf);
      const pf = { type: 'face', z: zf, xEnd: xf, xSurface: sf, blocked: true, runOut: true,
        xStart: Math.max(rapidStartXAt(zf, sf, faceLeft ? 1 : -1), p.xEnd + clrXFC) };
      if (faceLeft) pf.faceLeft = true;
      add.push({ after: p, pass: pf });
    }
  }
  for (let k = add.length - 1; k >= 0; k--) {
    const at = passes.indexOf(add[k].after);
    if (at >= 0) passes.splice(at + 1, 0, add[k].pass);
  }
  return add.length;
};

enforceLayerDepth();

  return appendRegionRunOut;
}
